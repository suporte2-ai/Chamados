const prisma = require('../../lib/prisma');
const { notifyEventInvitation, notifyEventCancelled } = require('../../lib/notificationService');

const VALID_SCOPES = ['EMPRESA', 'SETOR', 'USUARIO'];
const VALID_RSVP   = ['CONFIRMADO', 'RECUSADO'];

async function listLookupSectors(req, res) {
  const sectors = await prisma.sector.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  res.json(sectors);
}

async function listLookupUsers(req, res) {
  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, sector: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
  });
  res.json(users);
}

async function create(req, res) {
  const { title, description, location, startAt, endAt, scope, sectorId, userIds } = req.body;

  if (!title || !startAt || !endAt || !scope) {
    return res.status(400).json({ error: 'title, startAt, endAt e scope são obrigatórios.' });
  }
  if (!VALID_SCOPES.includes(scope)) {
    return res.status(400).json({ error: `scope inválido. Valores aceitos: ${VALID_SCOPES.join(', ')}.` });
  }
  if (new Date(endAt) <= new Date(startAt)) {
    return res.status(400).json({ error: 'endAt deve ser posterior a startAt.' });
  }
  if (scope === 'SETOR' && !sectorId) {
    return res.status(400).json({ error: 'sectorId é obrigatório quando scope=SETOR.' });
  }
  if (scope === 'USUARIO' && (!Array.isArray(userIds) || userIds.length === 0)) {
    return res.status(422).json({ error: 'userIds deve ter ao menos 1 elemento quando scope=USUARIO.' });
  }

  // Compute attendee list first (reads only, outside transaction)
  let attendeeUserIds = [];
  if (scope === 'EMPRESA') {
    const users = await prisma.user.findMany({ where: { active: true }, select: { id: true } });
    attendeeUserIds = users.map(u => u.id);
  } else if (scope === 'SETOR') {
    const users = await prisma.user.findMany({ where: { active: true, sectorId: Number(sectorId) }, select: { id: true } });
    attendeeUserIds = users.map(u => u.id);
  } else {
    attendeeUserIds = userIds.map(Number);
  }

  // Create event + attendees atomically so no orphan event row can exist
  const event = await prisma.$transaction(async (tx) => {
    const evt = await tx.event.create({
      data: {
        title,
        description: description ?? null,
        location: location ?? null,
        startAt: new Date(startAt),
        endAt: new Date(endAt),
        scope,
        sectorId: scope === 'SETOR' ? Number(sectorId) : null,
        createdById: req.user.id,
      },
    });
    if (attendeeUserIds.length > 0) {
      await tx.eventAttendee.createMany({
        data: attendeeUserIds.map(userId => ({ eventId: evt.id, userId })),
        skipDuplicates: true,
      });
    }
    return evt;
  });

  // Notifications are side-effects and stay outside the transaction
  for (const userId of attendeeUserIds) {
    await notifyEventInvitation(userId, event);
  }

  res.status(201).json({ id: event.id, title: event.title, startAt: event.startAt, attendeeCount: attendeeUserIds.length });
}

async function list(req, res) {
  const { from, to } = req.query;
  const where = {
    attendees: { some: { userId: req.user.id } },
    ...(from || to
      ? { startAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
      : {}),
  };

  const events = await prisma.event.findMany({
    where,
    orderBy: { startAt: 'asc' },
    include: {
      createdBy: { select: { id: true, name: true } },
      attendees: { where: { userId: req.user.id }, select: { rsvp: true } },
      _count: { select: { attendees: true } },
    },
  });

  res.json(events.map(e => ({
    id: e.id,
    title: e.title,
    description: e.description,
    location: e.location,
    startAt: e.startAt,
    endAt: e.endAt,
    scope: e.scope,
    createdBy: e.createdBy,
    myRsvp: e.attendees[0]?.rsvp ?? null,
    attendeeCount: e._count.attendees,
  })));
}

async function detail(req, res) {
  const id = Number(req.params.id);
  const hasManage = req.user.permissions.has('manage_events');

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true } },
      attendees: {
        where: { userId: req.user.id },
        select: { rsvp: true },
      },
      _count: { select: { attendees: true } },
    },
  });

  if (!event) return res.status(404).json({ error: 'Evento não encontrado.' });

  const myAttendee = event.attendees[0];
  const isCreator  = event.createdBy.id === req.user.id;

  // Usuário não é participante nem criador/admin
  if (!myAttendee && !(hasManage && isCreator) && !req.user.permissions.has('manage_users')) {
    return res.status(404).json({ error: 'Evento não encontrado.' });
  }

  let attendees = undefined;
  if (hasManage && (isCreator || req.user.permissions.has('manage_users'))) {
    const rows = await prisma.eventAttendee.findMany({
      where: { eventId: id },
      include: { user: { select: { id: true, name: true, sector: { select: { name: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    attendees = rows.map(a => ({ userId: a.userId, name: a.user.name, sector: a.user.sector?.name ?? null, rsvp: a.rsvp }));
  }

  res.json({
    id: event.id,
    title: event.title,
    description: event.description,
    location: event.location,
    startAt: event.startAt,
    endAt: event.endAt,
    scope: event.scope,
    createdBy: event.createdBy,
    myRsvp: myAttendee?.rsvp ?? null,
    attendeeCount: event._count.attendees,
    attendees,
  });
}

async function update(req, res) {
  const id = Number(req.params.id);
  const { title, description, location, startAt, endAt } = req.body;

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return res.status(404).json({ error: 'Evento não encontrado.' });

  const isAdmin = req.user.permissions.has('manage_users');
  if (event.createdById !== req.user.id && !isAdmin) {
    return res.status(403).json({ error: 'Apenas o criador ou admin pode editar este evento.' });
  }

  // Only validate time order when both startAt and endAt are provided together
  if (startAt && endAt && new Date(endAt) <= new Date(startAt)) {
    return res.status(400).json({ error: 'endAt deve ser posterior a startAt.' });
  }

  const data = {};
  if (title !== undefined)       data.title       = title;
  if (description !== undefined) data.description = description;
  if (location !== undefined)    data.location    = location;
  if (startAt !== undefined)     data.startAt     = new Date(startAt);
  if (endAt !== undefined)       data.endAt       = new Date(endAt);

  const updated = await prisma.event.update({ where: { id }, data });

  if (startAt !== undefined || endAt !== undefined) {
    await prisma.eventAttendee.updateMany({
      where: { eventId: id },
      data: { notified3d: false, notified1d: false },
    });
  }

  res.json({ id: updated.id, title: updated.title, startAt: updated.startAt, endAt: updated.endAt });
}

async function remove(req, res) {
  const id = Number(req.params.id);

  const event = await prisma.event.findUnique({
    where: { id },
    include: { attendees: { select: { userId: true } } },
  });
  if (!event) return res.status(404).json({ error: 'Evento não encontrado.' });

  const isAdmin = req.user.permissions.has('manage_users');
  if (event.createdById !== req.user.id && !isAdmin) {
    return res.status(403).json({ error: 'Apenas o criador ou admin pode cancelar este evento.' });
  }

  const attendeeIds = event.attendees.map(a => a.userId);

  await prisma.event.delete({ where: { id } });

  for (const userId of attendeeIds) {
    await notifyEventCancelled(userId, event);
  }

  res.status(204).end();
}

async function updateRsvp(req, res) {
  const id   = Number(req.params.id);
  const { rsvp } = req.body;

  if (!VALID_RSVP.includes(rsvp)) {
    return res.status(400).json({ error: `rsvp inválido. Valores aceitos: ${VALID_RSVP.join(', ')}.` });
  }

  const attendee = await prisma.eventAttendee.findUnique({
    where: { eventId_userId: { eventId: id, userId: req.user.id } },
  });
  if (!attendee) return res.status(404).json({ error: 'Você não é participante deste evento.' });

  const updated = await prisma.eventAttendee.update({
    where: { id: attendee.id },
    data: { rsvp },
  });

  res.json({ rsvp: updated.rsvp });
}

module.exports = { listLookupSectors, listLookupUsers, create, list, detail, update, remove, updateRsvp };
