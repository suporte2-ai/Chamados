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
let roleAssignee;
let roleReassign;
let roleFinancial;
let rolePlain;
let assigneeUser;
let reassignUser;
let financialUser;
let plainUser;
let requester;
let category;
let subcategory;

async function createTicket(overrides = {}) {
  const now = new Date();
  const ticket = await prisma.ticket.create({
    data: {
      title: 'Chamado teste update', description: 'desc', categoryId: category.id, subcategoryId: subcategory.id,
      urgency: 'MEDIO', requesterId: requester.id, sectorId: sector.id,
      slaFirstResponseDeadline: now, slaResolutionDeadline: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      ...overrides,
    },
  });
  createdTicketIds.push(ticket.id);
  return ticket;
}

beforeAll(async () => {
  sector = await prisma.sector.create({ data: { name: 'Sector Teste Ticket Update' } });
  createdSectorIds.push(sector.id);

  roleAssignee = await prisma.role.create({ data: { name: 'Role Teste Update Assignee', level: 2 } });
  roleReassign = await prisma.role.create({
    data: { name: 'Role Teste Update Reassign', level: 3, permissions: { create: [{ permissionKey: 'reassign_tickets', enabled: true }] } },
  });
  roleFinancial = await prisma.role.create({
    data: { name: 'Role Teste Update Financial', level: 3, permissions: { create: [{ permissionKey: 'view_financial_reports', enabled: true }] } },
  });
  rolePlain = await prisma.role.create({ data: { name: 'Role Teste Update Plain', level: 1 } });
  createdRoleIds.push(roleAssignee.id, roleReassign.id, roleFinancial.id, rolePlain.id);

  assigneeUser = await prisma.user.create({
    data: { name: 'Assignee', email: 'ticket-update.assignee@example.com', passwordHash: 'hash', roleId: roleAssignee.id, sectorId: sector.id },
  });
  reassignUser = await prisma.user.create({
    data: { name: 'Reassigner', email: 'ticket-update.reassign@example.com', passwordHash: 'hash', roleId: roleReassign.id, sectorId: sector.id },
  });
  financialUser = await prisma.user.create({
    data: { name: 'Financial', email: 'ticket-update.financial@example.com', passwordHash: 'hash', roleId: roleFinancial.id, sectorId: sector.id },
  });
  plainUser = await prisma.user.create({
    data: { name: 'Plain', email: 'ticket-update.plain@example.com', passwordHash: 'hash', roleId: rolePlain.id, sectorId: sector.id },
  });
  requester = await prisma.user.create({
    data: { name: 'Requester', email: 'ticket-update.requester@example.com', passwordHash: 'hash', roleId: rolePlain.id, sectorId: sector.id },
  });
  createdUserIds.push(assigneeUser.id, reassignUser.id, financialUser.id, plainUser.id, requester.id);

  category = await prisma.category.create({
    data: { name: 'Categoria Teste Ticket Update', subcategories: { create: [{ name: 'Sub Teste Ticket Update' }] } },
    include: { subcategories: true },
  });
  subcategory = category.subcategories[0];
  createdCategoryIds.push(category.id);
});

afterAll(async () => {
  await prisma.ticketTimeLog.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  await prisma.subcategory.deleteMany({ where: { categoryId: { in: createdCategoryIds } } });
  await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
  await prisma.sector.deleteMany({ where: { id: { in: createdSectorIds } } });
  await prisma.$disconnect();
});

test('the assignee can move status via PATCH', async () => {
  const ticket = await createTicket({ status: 'ABERTO', assignedToId: assigneeUser.id });
  const token = signAccessToken(assigneeUser.id);

  const response = await request(app).patch(`/api/tickets/${ticket.id}`).set('Authorization', `Bearer ${token}`).send({ status: 'EM_ANDAMENTO' });

  expect(response.status).toBe(200);
  expect(response.body.status).toBe('EM_ANDAMENTO');
});

test('PATCH rejects assignedToId without reassign_tickets', async () => {
  const ticket = await createTicket({ status: 'ABERTO' });
  const token = signAccessToken(plainUser.id);

  const response = await request(app)
    .patch(`/api/tickets/${ticket.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ assignedToId: plainUser.id });

  expect(response.status).toBe(403);
});

test('PATCH allows assignedToId with reassign_tickets', async () => {
  const ticket = await createTicket({ status: 'ABERTO' });
  const token = signAccessToken(reassignUser.id);

  const response = await request(app)
    .patch(`/api/tickets/${ticket.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ assignedToId: assigneeUser.id });

  expect(response.status).toBe(200);
  expect(response.body.assignedToId).toBe(assigneeUser.id);
});

test('PATCH rejects estimatedCost without view_financial_reports, even alongside an allowed field', async () => {
  const ticket = await createTicket({ status: 'ABERTO', assignedToId: assigneeUser.id });
  const token = signAccessToken(assigneeUser.id);

  const response = await request(app)
    .patch(`/api/tickets/${ticket.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'EM_ANDAMENTO', estimatedCost: 150.5 });

  expect(response.status).toBe(403);

  const unchanged = await prisma.ticket.findUnique({ where: { id: ticket.id } });
  expect(unchanged.status).toBe('ABERTO');
});

test('PATCH allows estimatedCost with view_financial_reports', async () => {
  const ticket = await createTicket({ status: 'ABERTO' });
  const token = signAccessToken(financialUser.id);

  const response = await request(app)
    .patch(`/api/tickets/${ticket.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ estimatedCost: 200 });

  expect(response.status).toBe(200);
  expect(Number(response.body.estimatedCost)).toBe(200);
});

test('POST /api/tickets/:id/reopen reopens a resolved ticket and clears resolution fields', async () => {
  const ticket = await createTicket({ status: 'RESOLVIDO', resolvedAt: new Date(), timeToResolutionMinutes: 60, assignedToId: assigneeUser.id });
  const roleReopen = await prisma.role.create({
    data: { name: 'Role Teste Update Reopen', level: 2, permissions: { create: [{ permissionKey: 'reopen_tickets', enabled: true }] } },
  });
  createdRoleIds.push(roleReopen.id);
  const reopenUser = await prisma.user.create({
    data: { name: 'Reopener', email: 'ticket-update.reopen@example.com', passwordHash: 'hash', roleId: roleReopen.id, sectorId: sector.id },
  });
  createdUserIds.push(reopenUser.id);
  const token = signAccessToken(reopenUser.id);

  const response = await request(app).post(`/api/tickets/${ticket.id}/reopen`).set('Authorization', `Bearer ${token}`);

  expect(response.status).toBe(200);
  expect(response.body.status).toBe('EM_ANDAMENTO');
  expect(response.body.resolvedAt).toBeNull();
});
