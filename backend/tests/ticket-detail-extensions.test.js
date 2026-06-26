const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');

const ids = { sectors: [], roles: [], users: [], categories: [], tickets: [] };
let token;
let ticket;

beforeAll(async () => {
  const sector = await prisma.sector.create({ data: { name: 'Sector Ext Test' } });
  ids.sectors.push(sector.id);
  const role = await prisma.role.create({ data: { name: 'Role Ext Test', level: 1 } });
  ids.roles.push(role.id);
  const user = await prisma.user.create({
    data: { name: 'User Ext', email: 'ext-test@example.com', passwordHash: 'h', roleId: role.id, sectorId: sector.id },
  });
  ids.users.push(user.id);
  token = signAccessToken(user.id);

  const cat = await prisma.category.create({
    data: { name: 'Cat Ext', subcategories: { create: [{ name: 'Sub Ext' }] } },
    include: { subcategories: true },
  });
  ids.categories.push(cat.id);

  await prisma.slaConfig.upsert({
    where: { urgency: 'MEDIO' },
    update: { firstResponseHours: 4, resolutionHours: 24 },
    create: { urgency: 'MEDIO', firstResponseHours: 4, resolutionHours: 24 },
  });

  ticket = await prisma.ticket.create({
    data: {
      title: 'Ticket Ext',
      description: 'Desc',
      categoryId: cat.id,
      subcategoryId: cat.subcategories[0].id,
      urgency: 'MEDIO',
      requesterId: user.id,
      sectorId: sector.id,
      slaFirstResponseDeadline: new Date(Date.now() + 4 * 3600000),
      slaResolutionDeadline: new Date(Date.now() + 24 * 3600000),
    },
  });
  ids.tickets.push(ticket.id);
  await prisma.ticketTimeLog.create({
    data: { ticketId: ticket.id, eventType: 'CREATED', toStatus: 'ABERTO', authorId: user.id },
  });
});

afterAll(async () => {
  await prisma.ticketTimeLog.deleteMany({ where: { ticketId: { in: ids.tickets } } });
  await prisma.ticketAttachment.deleteMany({ where: { ticketId: { in: ids.tickets } } });
  await prisma.ticket.deleteMany({ where: { id: { in: ids.tickets } } });
  await prisma.subcategory.deleteMany({ where: { categoryId: { in: ids.categories } } });
  await prisma.category.deleteMany({ where: { id: { in: ids.categories } } });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  await prisma.role.deleteMany({ where: { id: { in: ids.roles } } });
  await prisma.sector.deleteMany({ where: { id: { in: ids.sectors } } });
  await prisma.$disconnect();
});

test('GET /api/tickets/:id includes timeLogs array', async () => {
  const res = await request(app)
    .get(`/api/tickets/${ticket.id}`)
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body.timeLogs)).toBe(true);
  expect(res.body.timeLogs.length).toBeGreaterThan(0);
  expect(res.body.timeLogs[0]).toMatchObject({ eventType: 'CREATED', toStatus: 'ABERTO' });
});

test('GET /api/tickets/:id includes attachments array', async () => {
  const res = await request(app)
    .get(`/api/tickets/${ticket.id}`)
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body.attachments)).toBe(true);
});

test('GET /api/tickets?from filters out tickets before the date', async () => {
  const future = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const res = await request(app)
    .get(`/api/tickets?from=${future}`)
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.items.every(t => new Date(t.createdAt) >= new Date(future))).toBe(true);
});

test('GET /api/tickets?to filters out tickets after the date', async () => {
  const past = '2000-01-01';
  const res = await request(app)
    .get(`/api/tickets?to=${past}`)
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.items.every(t => new Date(t.createdAt) <= new Date(past + 'T23:59:59.999Z'))).toBe(true);
});
