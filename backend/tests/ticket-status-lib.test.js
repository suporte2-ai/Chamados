const prisma = require('../src/lib/prisma');
const { applyStatusTransition } = require('../src/lib/ticketStatus');

const createdSectorIds = [];
const createdRoleIds = [];
const createdUserIds = [];
const createdTicketIds = [];

let sector;
let role;
let requester;
let assignee;
let otherUser;

async function createTicket(overrides = {}) {
  const category = await prisma.category.create({
    data: { name: `Categoria Teste Status ${Date.now()}-${Math.random()}`, subcategories: { create: [{ name: 'Sub' }] } },
    include: { subcategories: true },
  });
  const now = new Date();
  const ticket = await prisma.ticket.create({
    data: {
      title: 'Chamado teste status',
      description: 'desc',
      categoryId: category.id,
      subcategoryId: category.subcategories[0].id,
      urgency: 'MEDIO',
      requesterId: requester.id,
      assignedToId: assignee.id,
      sectorId: sector.id,
      createdAt: now,
      slaFirstResponseDeadline: new Date(now.getTime() + 4 * 60 * 60 * 1000),
      slaResolutionDeadline: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      ...overrides,
    },
  });
  createdTicketIds.push(ticket.id);
  return ticket;
}

beforeAll(async () => {
  sector = await prisma.sector.create({ data: { name: 'Sector Teste Status Lib' } });
  createdSectorIds.push(sector.id);
  role = await prisma.role.create({ data: { name: 'Role Teste Status Lib', level: 1 } });
  createdRoleIds.push(role.id);

  requester = await prisma.user.create({
    data: { name: 'Solicitante', email: 'status-lib.requester@example.com', passwordHash: 'hash', roleId: role.id, sectorId: sector.id },
  });
  assignee = await prisma.user.create({
    data: { name: 'Atribuído', email: 'status-lib.assignee@example.com', passwordHash: 'hash', roleId: role.id, sectorId: sector.id },
  });
  otherUser = await prisma.user.create({
    data: { name: 'Outro', email: 'status-lib.other@example.com', passwordHash: 'hash', roleId: role.id, sectorId: sector.id },
  });
  createdUserIds.push(requester.id, assignee.id, otherUser.id);
});

afterAll(async () => {
  await prisma.ticketTimeLog.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  await prisma.subcategory.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
  await prisma.sector.deleteMany({ where: { id: { in: createdSectorIds } } });
  await prisma.$disconnect();
});

test('rejects an invalid transition (ABERTO directly to FECHADO) with statusCode 400', async () => {
  const ticket = await createTicket({ status: 'ABERTO' });
  const actor = { id: assignee.id, permissions: new Set(['close_tickets']) };

  await expect(applyStatusTransition(ticket, 'FECHADO', actor)).rejects.toMatchObject({ statusCode: 400 });
});

test('rejects a status change from a user who is not the assignee and lacks reassign_tickets', async () => {
  const ticket = await createTicket({ status: 'ABERTO' });
  const actor = { id: otherUser.id, permissions: new Set([]) };

  await expect(applyStatusTransition(ticket, 'EM_ANDAMENTO', actor)).rejects.toMatchObject({ statusCode: 403 });
});

test('the assignee can move ABERTO to EM_ANDAMENTO and it records firstResponseAt', async () => {
  const ticket = await createTicket({ status: 'ABERTO' });
  const actor = { id: assignee.id, permissions: new Set([]) };

  const updated = await applyStatusTransition(ticket, 'EM_ANDAMENTO', actor);

  expect(updated.status).toBe('EM_ANDAMENTO');
  expect(updated.firstResponseAt).not.toBeNull();
  expect(updated.timeToFirstResponseMinutes).not.toBeNull();
});

test('moving to AGUARDANDO records a PAUSE_START log', async () => {
  const ticket = await createTicket({ status: 'EM_ANDAMENTO' });
  const actor = { id: assignee.id, permissions: new Set([]) };

  await applyStatusTransition(ticket, 'AGUARDANDO', actor);

  const pauseStart = await prisma.ticketTimeLog.findFirst({ where: { ticketId: ticket.id, eventType: 'PAUSE_START' } });
  expect(pauseStart).not.toBeNull();
});

test('resolving directly from AGUARDANDO closes the pause first and discounts it from timeToResolutionMinutes', async () => {
  const createdAt = new Date(Date.now() - 60 * 60 * 1000);
  const ticket = await createTicket({ status: 'AGUARDANDO', createdAt, firstResponseAt: createdAt, timeToFirstResponseMinutes: 0 });
  await prisma.ticketTimeLog.create({
    data: {
      ticketId: ticket.id,
      eventType: 'PAUSE_START',
      fromStatus: 'EM_ANDAMENTO',
      toStatus: 'AGUARDANDO',
      authorId: assignee.id,
      occurredAt: new Date(createdAt.getTime() + 10 * 60 * 1000),
    },
  });
  const actor = { id: assignee.id, permissions: new Set([]) };

  const updated = await applyStatusTransition(ticket, 'RESOLVIDO', actor);

  const pauseEnd = await prisma.ticketTimeLog.findFirst({ where: { ticketId: ticket.id, eventType: 'PAUSE_END' } });
  expect(pauseEnd).not.toBeNull();
  expect(updated.resolvedAt).not.toBeNull();
  expect(updated.timeToResolutionMinutes).toBeLessThan(60);
});

test('closing requires close_tickets even for the assignee', async () => {
  const ticket = await createTicket({ status: 'RESOLVIDO', resolvedAt: new Date() });
  const actorWithoutPermission = { id: assignee.id, permissions: new Set([]) };
  const actorWithPermission = { id: assignee.id, permissions: new Set(['close_tickets']) };

  await expect(applyStatusTransition(ticket, 'FECHADO', actorWithoutPermission)).rejects.toMatchObject({ statusCode: 403 });

  const updated = await applyStatusTransition(ticket, 'FECHADO', actorWithPermission);
  expect(updated.status).toBe('FECHADO');
  expect(updated.closedAt).not.toBeNull();
});

test('reopening requires reopen_tickets, clears resolvedAt/timeToResolutionMinutes and records REOPENED', async () => {
  const ticket = await createTicket({
    status: 'RESOLVIDO',
    resolvedAt: new Date(),
    timeToResolutionMinutes: 120,
    firstResponseAt: new Date(),
    timeToFirstResponseMinutes: 30,
  });
  const actorWithoutPermission = { id: assignee.id, permissions: new Set([]) };
  const actorWithPermission = { id: assignee.id, permissions: new Set(['reopen_tickets']) };

  await expect(applyStatusTransition(ticket, 'EM_ANDAMENTO', actorWithoutPermission)).rejects.toMatchObject({ statusCode: 403 });

  const reopened = await applyStatusTransition(ticket, 'EM_ANDAMENTO', actorWithPermission);
  expect(reopened.resolvedAt).toBeNull();
  expect(reopened.timeToResolutionMinutes).toBeNull();

  const reopenedLog = await prisma.ticketTimeLog.findFirst({ where: { ticketId: ticket.id, eventType: 'REOPENED' } });
  expect(reopenedLog).not.toBeNull();
});

test('FECHADO is terminal: no transition is allowed out of it', async () => {
  const ticket = await createTicket({ status: 'FECHADO', resolvedAt: new Date(), closedAt: new Date() });
  const actor = { id: assignee.id, permissions: new Set(['reassign_tickets', 'reopen_tickets', 'close_tickets']) };

  await expect(applyStatusTransition(ticket, 'EM_ANDAMENTO', actor)).rejects.toMatchObject({ statusCode: 400 });
});

test('moving to AGUARDANDO by the assignee does NOT record firstResponseAt', async () => {
  const ticket = await createTicket({ status: 'ABERTO' });
  const actor = { id: assignee.id, permissions: new Set([]) };

  await applyStatusTransition(ticket, 'AGUARDANDO', actor);

  const updated = await prisma.ticket.findUnique({ where: { id: ticket.id } });
  expect(updated.firstResponseAt).toBeNull();
});
