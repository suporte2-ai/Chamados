const prisma = require('../../lib/prisma');
const { ticketVisibilityWhere } = require('../../lib/ticketVisibility');
const { notifyTicketComment } = require('../../lib/notificationService');

async function create(req, res) {
  const ticketId = Number(req.params.id);
  const { body, isInternal } = req.body;

  if (!body) {
    return res.status(400).json({ error: 'body é obrigatório.' });
  }
  if (isInternal && !req.user.permissions.has('view_internal_notes')) {
    return res.status(403).json({ error: 'Permissão insuficiente para criar uma nota interna.' });
  }

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    return res.status(404).json({ error: 'Chamado não encontrado.' });
  }

  const visibilityWhere = ticketVisibilityWhere(req.user);
  const visible = await prisma.ticket.findFirst({ where: { id: ticketId, ...visibilityWhere } });
  if (!visible) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }

  const operations = [
    prisma.ticketComment.create({
      data: { ticketId, authorId: req.user.id, body, isInternal: Boolean(isInternal) },
    }),
  ];

  const isFirstResponse = !isInternal && !ticket.firstResponseAt && ticket.assignedToId === req.user.id;
  if (isFirstResponse) {
    const now = new Date();
    const timeToFirstResponseMinutes = Math.round((now.getTime() - ticket.createdAt.getTime()) / 60000);
    operations.push(
      prisma.ticket.update({ where: { id: ticketId }, data: { firstResponseAt: now, timeToFirstResponseMinutes } })
    );
    operations.push(
      prisma.ticketTimeLog.create({
        data: { ticketId, eventType: 'FIRST_RESPONSE', fromStatus: ticket.status, toStatus: ticket.status, authorId: req.user.id, occurredAt: now },
      })
    );
  }

  const [comment] = await prisma.$transaction(operations);
  notifyTicketComment(ticket, req.user.id, Boolean(isInternal));
  res.status(201).json(comment);
}

module.exports = { create };
