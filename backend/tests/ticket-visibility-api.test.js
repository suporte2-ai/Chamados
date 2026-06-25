const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');

const createdSectorIds = [];
const createdRoleIds = [];
const createdUserIds = [];
const createdCategoryIds = [];
const createdTicketIds = [];

let sectorA;
let sectorB;
let roleAll;
let roleSector;
let rolePlain;
let userAll;
let userSectorTech;
let userOwnRequester;
let otherSectorRequester;
let category;
let subcategory;
let ticketInSectorA;
let ticketInSectorB;

beforeAll(async () => {
  sectorA = await prisma.sector.create({ data: { name: 'Sector A Teste Visibility' } });
  sectorB = await prisma.sector.create({ data: { name: 'Sector B Teste Visibility' } });
  createdSectorIds.push(sectorA.id, sectorB.id);

  roleAll = await prisma.role.create({
    data: { name: 'Role Teste Visibility All', level: 4, permissions: { create: [{ permissionKey: 'view_all_tickets', enabled: true }] } },
  });
  roleSector = await prisma.role.create({
    data: { name: 'Role Teste Visibility Sector', level: 2, permissions: { create: [{ permissionKey: 'view_sector_tickets', enabled: true }] } },
  });
  rolePlain = await prisma.role.create({ data: { name: 'Role Teste Visibility Plain', level: 1 } });
  createdRoleIds.push(roleAll.id, roleSector.id, rolePlain.id);

  userAll = await prisma.user.create({
    data: { name: 'Admin Visibility', email: 'visibility.all@example.com', passwordHash: 'hash', roleId: roleAll.id, sectorId: sectorA.id },
  });
  userSectorTech = await prisma.user.create({
    data: { name: 'Tecnico Visibility', email: 'visibility.sector@example.com', passwordHash: 'hash', roleId: roleSector.id, sectorId: sectorA.id },
  });
  userOwnRequester = await prisma.user.create({
    data: { name: 'Solicitante Visibility', email: 'visibility.own@example.com', passwordHash: 'hash', roleId: rolePlain.id, sectorId: sectorA.id },
  });
  otherSectorRequester = await prisma.user.create({
    data: { name: 'Solicitante Outro Setor Visibility', email: 'visibility.othersector@example.com', passwordHash: 'hash', roleId: rolePlain.id, sectorId: sectorB.id },
  });
  createdUserIds.push(userAll.id, userSectorTech.id, userOwnRequester.id, otherSectorRequester.id);

  category = await prisma.category.create({
    data: { name: 'Categoria Teste Visibility', subcategories: { create: [{ name: 'Sub Teste Visibility' }] } },
    include: { subcategories: true },
  });
  subcategory = category.subcategories[0];
  createdCategoryIds.push(category.id);

  const now = new Date();
  ticketInSectorA = await prisma.ticket.create({
    data: {
      title: 'Chamado setor A', description: 'desc', categoryId: category.id, subcategoryId: subcategory.id,
      urgency: 'MEDIO', requesterId: userOwnRequester.id, sectorId: sectorA.id,
      slaFirstResponseDeadline: now, slaResolutionDeadline: now,
    },
  });
  ticketInSectorB = await prisma.ticket.create({
    data: {
      title: 'Chamado setor B', description: 'desc', categoryId: category.id, subcategoryId: subcategory.id,
      urgency: 'MEDIO', requesterId: otherSectorRequester.id, sectorId: sectorB.id,
      slaFirstResponseDeadline: now, slaResolutionDeadline: now,
    },
  });
  createdTicketIds.push(ticketInSectorA.id, ticketInSectorB.id);
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

test('a user with view_all_tickets sees tickets from every sector', async () => {
  const token = signAccessToken(userAll.id);
  const response = await request(app).get('/api/tickets').set('Authorization', `Bearer ${token}`);

  const ids = response.body.items.map((t) => t.id);
  expect(ids).toEqual(expect.arrayContaining([ticketInSectorA.id, ticketInSectorB.id]));
});

test('a user with view_sector_tickets sees only their own sector', async () => {
  const token = signAccessToken(userSectorTech.id);
  const response = await request(app).get('/api/tickets').set('Authorization', `Bearer ${token}`);

  const ids = response.body.items.map((t) => t.id);
  expect(ids).toEqual(expect.arrayContaining([ticketInSectorA.id]));
  expect(ids).not.toEqual(expect.arrayContaining([ticketInSectorB.id]));
});

test('a plain user sees only tickets they requested', async () => {
  const token = signAccessToken(userOwnRequester.id);
  const response = await request(app).get('/api/tickets').set('Authorization', `Bearer ${token}`);

  const ids = response.body.items.map((t) => t.id);
  expect(ids).toEqual([ticketInSectorA.id]);
});

test('GET /api/tickets/:id returns 403 for a ticket outside the user visibility', async () => {
  const token = signAccessToken(userOwnRequester.id);
  const response = await request(app).get(`/api/tickets/${ticketInSectorB.id}`).set('Authorization', `Bearer ${token}`);

  expect(response.status).toBe(403);
});
