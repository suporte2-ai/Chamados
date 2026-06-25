const prisma = require('../../lib/prisma');
const { ticketVisibilityWhere } = require('../../lib/ticketVisibility');
const { calculateSlaBadge } = require('../../lib/slaBadge');
const { applyStatusTransition } = require('../../lib/ticketStatus');

const SORT_WHITELIST = ['createdAt', 'urgency', 'status', 'title'];
const DEFAULT_PAGE_SIZE = 50;

function serializeTicket(ticket) {
  return { ...ticket, slaBadge: calculateSlaBadge(ticket) };
}

async function create(req, res) {
  const { title, description, categoryId, subcategoryId, urgency } = req.body;
  if (!title || !description || !categoryId || !subcategoryId || !urgency) {
    return res.status(400).json({ error: 'title, description, categoryId, subcategoryId e urgency são obrigatórios.' });
  }

  const slaConfig = await prisma.slaConfig.findUnique({ where: { urgency } });
  if (!slaConfig) {
    return res.status(400).json({ error: `Não há configuração de SLA para a urgência ${urgency}.` });
  }

  const now = new Date();
  const slaFirstResponseDeadline = new Date(now.getTime() + slaConfig.firstResponseHours * 60 * 60 * 1000);
  const slaResolutionDeadline = new Date(now.getTime() + slaConfig.resolutionHours * 60 * 60 * 1000);

  const ticket = await prisma.ticket.create({
    data: {
      title,
      description,
      categoryId,
      subcategoryId,
      urgency,
      requesterId: req.user.id,
      sectorId: req.user.sectorId,
      slaFirstResponseDeadline,
      slaResolutionDeadline,
    },
  });

  await prisma.ticketTimeLog.create({
    data: { ticketId: ticket.id, eventType: 'CREATED', toStatus: 'ABERTO', authorId: req.user.id, occurredAt: now },
  });

  res.status(201).json(serializeTicket(ticket));
}

async function list(req, res) {
  const { status, urgency, categoryId, subcategoryId, assignedToId, sectorId, search, sortBy, sortOrder } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.max(1, Number(req.query.pageSize) || DEFAULT_PAGE_SIZE);

  const where = { ...ticketVisibilityWhere(req.user) };
  if (status) where.status = status;
  if (urgency) where.urgency = urgency;
  if (categoryId) where.categoryId = Number(categoryId);
  if (subcategoryId) where.subcategoryId = Number(subcategoryId);
  if (assignedToId) where.assignedToId = Number(assignedToId);
  if (sectorId) where.sectorId = Number(sectorId);
  if (search) {
    where.AND = [
      ...(where.AND || []),
      { OR: [{ title: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }] },
    ];
  }

  const orderBy = SORT_WHITELIST.includes(sortBy) ? { [sortBy]: sortOrder === 'asc' ? 'asc' : 'desc' } : { createdAt: 'desc' };

  const [items, total] = await Promise.all([
    prisma.ticket.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.ticket.count({ where }),
  ]);

  res.json({ items: items.map(serializeTicket), total, page, pageSize });
}

async function detail(req, res) {
  const id = Number(req.params.id);

  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) {
    return res.status(404).json({ error: 'Chamado não encontrado.' });
  }

  const visibilityWhere = ticketVisibilityWhere(req.user);
  const visible = await prisma.ticket.findFirst({ where: { id, ...visibilityWhere } });
  if (!visible) {
    return res.status(403).json({ error: 'Você não tem acesso a este chamado.' });
  }

  const comments = await prisma.ticketComment.findMany({
    where: {
      ticketId: id,
      ...(req.user.permissions.has('view_internal_notes') ? {} : { isInternal: false }),
    },
    orderBy: { createdAt: 'asc' },
  });

  res.json({ ...serializeTicket(ticket), comments });
}

async function update(req, res) {
  const id = Number(req.params.id);
  const { status, assignedToId, estimatedCost } = req.body;

  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) {
    return res.status(404).json({ error: 'Chamado não encontrado.' });
  }

  const visibilityWhere = ticketVisibilityWhere(req.user);
  const visible = await prisma.ticket.findFirst({ where: { id, ...visibilityWhere } });
  if (!visible) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }

  if (assignedToId !== undefined && !req.user.permissions.has('reassign_tickets')) {
    return res.status(403).json({ error: 'Permissão insuficiente para atribuir este chamado.' });
  }
  if (estimatedCost !== undefined && !req.user.permissions.has('update_cost')) {
    return res.status(403).json({ error: 'Permissão insuficiente para definir o custo estimado.' });
  }

  if (assignedToId !== undefined) {
    const assignee = await prisma.user.findUnique({ where: { id: assignedToId } });
    if (!assignee) {
      return res.status(400).json({ error: 'Usuário assignee não encontrado.' });
    }
  }

  const directData = {};
  if (assignedToId !== undefined) directData.assignedToId = assignedToId;
  if (estimatedCost !== undefined) directData.estimatedCost = estimatedCost;

  const hasDirectUpdate = Object.keys(directData).length > 0;
  const hasStatusChange = status !== undefined;

  let updatedTicket;

  if (hasDirectUpdate && hasStatusChange) {
    // Both changes must be atomic: apply directData first, then the status transition,
    // all within a single interactive transaction.
    updatedTicket = await prisma.$transaction(async (tx) => {
      const afterDirect = await tx.ticket.update({ where: { id }, data: directData });
      return applyStatusTransition(afterDirect, status, { id: req.user.id, permissions: req.user.permissions }, tx);
    });
  } else if (hasStatusChange) {
    updatedTicket = await applyStatusTransition(ticket, status, { id: req.user.id, permissions: req.user.permissions });
  } else if (hasDirectUpdate) {
    updatedTicket = await prisma.ticket.update({ where: { id }, data: directData });
  } else {
    updatedTicket = ticket;
  }

  res.json(serializeTicket(updatedTicket));
}

async function reopen(req, res) {
  const id = Number(req.params.id);

  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) {
    return res.status(404).json({ error: 'Chamado não encontrado.' });
  }

  const visibilityWhere = ticketVisibilityWhere(req.user);
  const visible = await prisma.ticket.findFirst({ where: { id, ...visibilityWhere } });
  if (!visible) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }

  const updated = await applyStatusTransition(ticket, 'EM_ANDAMENTO', { id: req.user.id, permissions: req.user.permissions });
  res.json(serializeTicket(updated));
}

module.exports = { create, list, detail, update, reopen };
