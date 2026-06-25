const request = require('supertest');
const fs = require('fs');
const path = require('path');
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
let role;
let user;
let outsiderUser;
let category;
let subcategory;
let ticket;

beforeAll(async () => {
  sectorA = await prisma.sector.create({ data: { name: 'Sector A Teste Attachments' } });
  sectorB = await prisma.sector.create({ data: { name: 'Sector B Teste Attachments' } });
  createdSectorIds.push(sectorA.id, sectorB.id);

  role = await prisma.role.create({ data: { name: 'Role Teste Attachments', level: 1 } });
  createdRoleIds.push(role.id);

  user = await prisma.user.create({
    data: { name: 'Usuario Attachments', email: 'attachments.user@example.com', passwordHash: 'hash', roleId: role.id, sectorId: sectorA.id },
  });
  outsiderUser = await prisma.user.create({
    data: { name: 'Outsider Attachments', email: 'attachments.outsider@example.com', passwordHash: 'hash', roleId: role.id, sectorId: sectorB.id },
  });
  createdUserIds.push(user.id, outsiderUser.id);

  category = await prisma.category.create({
    data: { name: 'Categoria Teste Attachments', subcategories: { create: [{ name: 'Sub Teste Attachments' }] } },
    include: { subcategories: true },
  });
  subcategory = category.subcategories[0];
  createdCategoryIds.push(category.id);

  const now = new Date();
  ticket = await prisma.ticket.create({
    data: {
      title: 'Chamado teste attachments', description: 'desc', categoryId: category.id, subcategoryId: subcategory.id,
      urgency: 'MEDIO', requesterId: user.id, sectorId: sectorA.id,
      slaFirstResponseDeadline: now, slaResolutionDeadline: now,
    },
  });
  createdTicketIds.push(ticket.id);
});

afterAll(async () => {
  await prisma.ticketAttachment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  await prisma.subcategory.deleteMany({ where: { categoryId: { in: createdCategoryIds } } });
  await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
  await prisma.sector.deleteMany({ where: { id: { in: createdSectorIds } } });
  await prisma.$disconnect();
});

test('uploads an attachment directly on a ticket', async () => {
  const token = signAccessToken(user.id);

  const response = await request(app)
    .post(`/api/tickets/${ticket.id}/attachments`)
    .set('Authorization', `Bearer ${token}`)
    .attach('file', Buffer.from('conteúdo de teste'), 'print.png');

  expect(response.status).toBe(201);
  expect(response.body.fileName).toBe('print.png');
  expect(response.body.commentId).toBeNull();

  const stored = await prisma.ticketAttachment.findUnique({ where: { id: response.body.id } });
  expect(fs.existsSync(stored.filePath)).toBe(true);
});

test('POST upload is blocked for a user outside the ticket visibility', async () => {
  const outsiderToken = signAccessToken(outsiderUser.id);
  const response = await request(app)
    .post(`/api/tickets/${ticket.id}/attachments`)
    .set('Authorization', `Bearer ${outsiderToken}`)
    .attach('file', Buffer.from('conteúdo outsider'), 'blocked.png');

  expect(response.status).toBe(403);
});

test('GET attachment download is blocked for a user outside the ticket visibility', async () => {
  const uploaderToken = signAccessToken(user.id);
  const uploadResponse = await request(app)
    .post(`/api/tickets/${ticket.id}/attachments`)
    .set('Authorization', `Bearer ${uploaderToken}`)
    .attach('file', Buffer.from('outro conteúdo'), 'documento.pdf');

  const outsiderToken = signAccessToken(outsiderUser.id);
  const response = await request(app)
    .get(`/api/tickets/${ticket.id}/attachments/${uploadResponse.body.id}`)
    .set('Authorization', `Bearer ${outsiderToken}`);

  expect(response.status).toBe(403);
});

test('GET attachment download succeeds for a user with visibility', async () => {
  const token = signAccessToken(user.id);
  const uploadResponse = await request(app)
    .post(`/api/tickets/${ticket.id}/attachments`)
    .set('Authorization', `Bearer ${token}`)
    .attach('file', Buffer.from('terceiro conteúdo'), 'planilha.xlsx');

  const response = await request(app)
    .get(`/api/tickets/${ticket.id}/attachments/${uploadResponse.body.id}`)
    .set('Authorization', `Bearer ${token}`);

  expect(response.status).toBe(200);
});
