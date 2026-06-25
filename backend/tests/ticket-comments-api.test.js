const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');

const createdSectorIds = [];
const createdRoleIds = [];
const createdUserIds = [];
const createdCategoryIds = [];
const createdTicketIds = [];

let sector;
let roleWithInternalNotes;
let rolePlain;
let assigneeUser;
let plainUser;
let requester;
let category;
let subcategory;

async function createTicket(overrides = {}) {
  const now = new Date();
  const ticket = await prisma.ticket.create({
    data: {
      title: 'Chamado teste comments', description: 'desc', categoryId: category.id, subcategoryId: subcategory.id,
      urgency: 'MEDIO', requesterId: requester.id, sectorId: sector.id,
      slaFirstResponseDeadline: now, slaResolutionDeadline: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      ...overrides,
    },
  });
  createdTicketIds.push(ticket.id);
  return ticket;
}

beforeAll(async () => {
  sector = await prisma.sector.create({ data: { name: 'Sector Teste Ticket Comments' } });
  createdSectorIds.push(sector.id);

  roleWithInternalNotes = await prisma.role.create({
    data: { name: 'Role Teste Comments Internal', level: 2, permissions: { create: [{ permissionKey: 'view_internal_notes', enabled: true }] } },
  });
  rolePlain = await prisma.role.create({ data: { name: 'Role Teste Comments Plain', level: 1 } });
  createdRoleIds.push(roleWithInternalNotes.id, rolePlain.id);

  assigneeUser = await prisma.user.create({
    data: { name: 'Assignee Comments', email: 'ticket-comments.assignee@example.com', passwordHash: 'hash', roleId: roleWithInternalNotes.id, sectorId: sector.id },
  });
  plainUser = await prisma.user.create({
    data: { name: 'Plain Comments', email: 'ticket-comments.plain@example.com', passwordHash: 'hash', roleId: rolePlain.id, sectorId: sector.id },
  });
  requester = await prisma.user.create({
    data: { name: 'Requester Comments', email: 'ticket-comments.requester@example.com', passwordHash: 'hash', roleId: rolePlain.id, sectorId: sector.id },
  });
  createdUserIds.push(assigneeUser.id, plainUser.id, requester.id);

  category = await prisma.category.create({
    data: { name: 'Categoria Teste Ticket Comments', subcategories: { create: [{ name: 'Sub Teste Ticket Comments' }] } },
    include: { subcategories: true },
  });
  subcategory = category.subcategories[0];
  createdCategoryIds.push(category.id);
});

afterAll(async () => {
  await prisma.ticketComment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
  await prisma.ticketTimeLog.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  await prisma.subcategory.deleteMany({ where: { categoryId: { in: createdCategoryIds } } });
  await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
  await prisma.sector.deleteMany({ where: { id: { in: createdSectorIds } } });
  await prisma.$disconnect();
});

test('creates a public comment by default', async () => {
  const ticket = await createTicket({ assignedToId: assigneeUser.id });
  const token = signAccessToken(plainUser.id);

  const response = await request(app)
    .post(`/api/tickets/${ticket.id}/comments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ body: 'Comentário público de teste' });

  expect(response.status).toBe(201);
  expect(response.body.isInternal).toBe(false);
});

test('rejects an internal comment without view_internal_notes', async () => {
  const ticket = await createTicket({ assignedToId: assigneeUser.id });
  const token = signAccessToken(plainUser.id);

  const response = await request(app)
    .post(`/api/tickets/${ticket.id}/comments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ body: 'Nota interna de teste', isInternal: true });

  expect(response.status).toBe(403);
});

test('allows an internal comment with view_internal_notes', async () => {
  const ticket = await createTicket({ assignedToId: assigneeUser.id });
  const token = signAccessToken(assigneeUser.id);

  const response = await request(app)
    .post(`/api/tickets/${ticket.id}/comments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ body: 'Nota interna de teste', isInternal: true });

  expect(response.status).toBe(201);
  expect(response.body.isInternal).toBe(true);
});

test('a public comment by the current assignee records firstResponseAt when it was still null', async () => {
  const ticket = await createTicket({ assignedToId: assigneeUser.id });
  const token = signAccessToken(assigneeUser.id);

  await request(app)
    .post(`/api/tickets/${ticket.id}/comments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ body: 'Primeira resposta pública' });

  const updated = await prisma.ticket.findUnique({ where: { id: ticket.id } });
  expect(updated.firstResponseAt).not.toBeNull();

  const log = await prisma.ticketTimeLog.findFirst({ where: { ticketId: ticket.id, eventType: 'FIRST_RESPONSE' } });
  expect(log).not.toBeNull();
});

test('a comment by someone other than the current assignee does not record firstResponseAt', async () => {
  const ticket = await createTicket({ assignedToId: assigneeUser.id });
  const token = signAccessToken(plainUser.id);

  await request(app)
    .post(`/api/tickets/${ticket.id}/comments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ body: 'Comentário de outra pessoa' });

  const updated = await prisma.ticket.findUnique({ where: { id: ticket.id } });
  expect(updated.firstResponseAt).toBeNull();
});
