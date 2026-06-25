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
let role;
let user;
let userToken;
let category;
let subcategory;

beforeAll(async () => {
  sector = await prisma.sector.create({ data: { name: 'Sector Teste Ticket Creation' } });
  createdSectorIds.push(sector.id);
  role = await prisma.role.create({ data: { name: 'Role Teste Ticket Creation', level: 1 } });
  createdRoleIds.push(role.id);
  user = await prisma.user.create({
    data: { name: 'Usuário Teste Ticket Creation', email: 'ticket-creation.user@example.com', passwordHash: 'hash', roleId: role.id, sectorId: sector.id },
  });
  createdUserIds.push(user.id);
  userToken = signAccessToken(user.id);

  category = await prisma.category.create({
    data: { name: 'Categoria Teste Ticket Creation', subcategories: { create: [{ name: 'Sub Teste Ticket Creation' }] } },
    include: { subcategories: true },
  });
  subcategory = category.subcategories[0];
  createdCategoryIds.push(category.id);

  await prisma.slaConfig.upsert({
    where: { urgency: 'ALTO' },
    update: { firstResponseHours: 2, resolutionHours: 8 },
    create: { urgency: 'ALTO', firstResponseHours: 2, resolutionHours: 8 },
  });
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

test('POST /api/tickets creates a ticket with status ABERTO, inherited sectorId and computed SLA deadlines', async () => {
  const response = await request(app)
    .post('/api/tickets')
    .set('Authorization', `Bearer ${userToken}`)
    .send({
      title: 'Impressora não imprime',
      description: 'A impressora do 3º andar não responde.',
      categoryId: category.id,
      subcategoryId: subcategory.id,
      urgency: 'ALTO',
    });

  expect(response.status).toBe(201);
  expect(response.body.status).toBe('ABERTO');
  expect(response.body.sectorId).toBe(sector.id);
  expect(response.body.requesterId).toBe(user.id);
  expect(response.body.assignedToId).toBeNull();
  expect(new Date(response.body.slaResolutionDeadline).getTime()).toBeGreaterThan(Date.now());
  createdTicketIds.push(response.body.id);

  const log = await prisma.ticketTimeLog.findFirst({ where: { ticketId: response.body.id, eventType: 'CREATED' } });
  expect(log).not.toBeNull();
});

test('POST /api/tickets returns 400 when a required field is missing', async () => {
  const response = await request(app)
    .post('/api/tickets')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ title: 'Sem categoria' });

  expect(response.status).toBe(400);
});

test('GET /api/tickets/:id includes the calculated sla badge', async () => {
  const ticket = await prisma.ticket.findFirst({ where: { id: { in: createdTicketIds } } });

  const response = await request(app).get(`/api/tickets/${ticket.id}`).set('Authorization', `Bearer ${userToken}`);

  expect(response.status).toBe(200);
  expect(['verde', 'amarelo', 'vermelho']).toContain(response.body.slaBadge);
});
