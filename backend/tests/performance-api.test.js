const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');

const ids = { sectors: [], roles: [], users: [], categories: [], tickets: [] };

let techToken;
let noPermToken;
let techUserId;

// Datas fixas para controle do período nos testes
const PERIOD_FROM = '2026-01-01';
const PERIOD_TO = '2026-12-31';
const inPeriod = (offsetDays = 0) =>
  new Date(`2026-06-${String(10 + offsetDays).padStart(2, '0')}T10:00:00.000Z`);

beforeAll(async () => {
  const sector = await prisma.sector.create({ data: { name: 'Setor Perf API Test' } });
  ids.sectors.push(sector.id);

  const techRole = await prisma.role.create({
    data: {
      name: 'Role Perf API Tech',
      level: 2,
      permissions: { create: [{ permissionKey: 'view_performance_panel', enabled: true }] },
    },
  });
  ids.roles.push(techRole.id);

  const noPermRole = await prisma.role.create({
    data: { name: 'Role Perf API NoPerm', level: 1 },
  });
  ids.roles.push(noPermRole.id);

  const techUser = await prisma.user.create({
    data: {
      name: 'Tech Perf API',
      email: 'perf-api.tech@example.com',
      passwordHash: 'hash',
      roleId: techRole.id,
      sectorId: sector.id,
    },
  });
  ids.users.push(techUser.id);
  techUserId = techUser.id;
  techToken = signAccessToken(techUser.id);

  const noPermUser = await prisma.user.create({
    data: {
      name: 'NoPerm Perf API',
      email: 'perf-api.noperm@example.com',
      passwordHash: 'hash',
      roleId: noPermRole.id,
      sectorId: sector.id,
    },
  });
  ids.users.push(noPermUser.id);
  noPermToken = signAccessToken(noPermUser.id);

  const category = await prisma.category.create({
    data: {
      name: 'Cat Perf API',
      subcategories: { create: [{ name: 'Sub Perf API' }] },
    },
    include: { subcategories: true },
  });
  ids.categories.push(category.id);
  const subcategoryId = category.subcategories[0].id;

  const baseTicket = {
    categoryId: category.id,
    subcategoryId,
    requesterId: techUser.id,
    sectorId: sector.id,
    urgency: 'MEDIO',
    slaFirstResponseDeadline: new Date('2026-06-10T18:00:00.000Z'),
    slaResolutionDeadline: new Date('2026-06-11T10:00:00.000Z'),
  };

  // Ticket 1: assignado ao tech, RESOLVIDO, SLA cumprido
  const t1 = await prisma.ticket.create({
    data: {
      ...baseTicket,
      title: 'Ticket Perf 1',
      description: 'desc',
      assignedToId: techUser.id,
      status: 'RESOLVIDO',
      createdAt: inPeriod(0),
      firstResponseAt: new Date(inPeriod(0).getTime() + 30 * 60 * 1000),
      timeToFirstResponseMinutes: 30,
      resolvedAt: new Date(inPeriod(0).getTime() + 120 * 60 * 1000),
      timeToResolutionMinutes: 120,
      // resolvedAt (2026-06-10T12:00) <= slaResolutionDeadline (2026-06-11T10:00) → SLA cumprido
    },
  });
  ids.tickets.push(t1.id);

  // Ticket 2: assignado ao tech, RESOLVIDO, SLA perdido
  const t2 = await prisma.ticket.create({
    data: {
      ...baseTicket,
      title: 'Ticket Perf 2',
      description: 'desc',
      assignedToId: techUser.id,
      status: 'RESOLVIDO',
      createdAt: inPeriod(1),
      firstResponseAt: new Date(inPeriod(1).getTime() + 60 * 60 * 1000),
      timeToFirstResponseMinutes: 60,
      resolvedAt: new Date(inPeriod(1).getTime() + 30 * 60 * 60 * 1000),
      timeToResolutionMinutes: 1800,
      // resolvedAt (2026-06-11T16:00) > slaResolutionDeadline (2026-06-11T10:00) → SLA perdido
    },
  });
  ids.tickets.push(t2.id);

  // Ticket 3: assignado ao tech, ABERTO (sem resolvedAt)
  const t3 = await prisma.ticket.create({
    data: {
      ...baseTicket,
      title: 'Ticket Perf 3',
      description: 'desc',
      assignedToId: techUser.id,
      status: 'ABERTO',
      urgency: 'ALTO',
      createdAt: inPeriod(2),
    },
  });
  ids.tickets.push(t3.id);
});

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { id: { in: ids.tickets } } });
  await prisma.subcategory.deleteMany({ where: { categoryId: { in: ids.categories } } });
  await prisma.category.deleteMany({ where: { id: { in: ids.categories } } });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  await prisma.role.deleteMany({ where: { id: { in: ids.roles } } });
  await prisma.sector.deleteMany({ where: { id: { in: ids.sectors } } });
  await prisma.$disconnect();
});

// --- summary ---

test('GET /summary retorna métricas corretas para o período', async () => {
  const res = await request(app)
    .get(`/api/performance/summary?from=${PERIOD_FROM}&to=${PERIOD_TO}`)
    .set('Authorization', `Bearer ${techToken}`);

  expect(res.status).toBe(200);
  expect(res.body.overall.totalTickets).toBe(3);
  // 2 resolvidos: avg timeToFirstResponseMinutes = round((30+60)/2) = 45
  expect(res.body.overall.avgFirstResponseMinutes).toBe(45);
  // avg timeToResolutionMinutes = round((120+1800)/2) = 960
  expect(res.body.overall.avgResolutionMinutes).toBe(960);
  // SLA: 1 cumprido de 2 resolvidos = 0.5
  expect(res.body.overall.slaComplianceRate).toBe(0.5);
  // byUser deve conter o técnico
  expect(res.body.byUser).toHaveLength(1);
  expect(res.body.byUser[0].userId).toBe(techUserId);
  expect(res.body.byUser[0].totalTickets).toBe(3);
});

test('GET /summary retorna 400 sem from/to', async () => {
  const res = await request(app)
    .get('/api/performance/summary')
    .set('Authorization', `Bearer ${techToken}`);
  expect(res.status).toBe(400);
});

test('GET /summary retorna 400 com from > to', async () => {
  const res = await request(app)
    .get('/api/performance/summary?from=2026-12-31&to=2026-01-01')
    .set('Authorization', `Bearer ${techToken}`);
  expect(res.status).toBe(400);
});

test('GET /summary retorna 403 sem view_performance_panel', async () => {
  const res = await request(app)
    .get(`/api/performance/summary?from=${PERIOD_FROM}&to=${PERIOD_TO}`)
    .set('Authorization', `Bearer ${noPermToken}`);
  expect(res.status).toBe(403);
});

test('GET /summary retorna 0 chamados para sectorId sem dados', async () => {
  const emptySector = await prisma.sector.create({ data: { name: 'Setor Vazio Perf' } });
  try {
    const res = await request(app)
      .get(`/api/performance/summary?from=${PERIOD_FROM}&to=${PERIOD_TO}&sectorId=${emptySector.id}`)
      .set('Authorization', `Bearer ${techToken}`);
    expect(res.status).toBe(200);
    expect(res.body.overall.totalTickets).toBe(0);
    expect(res.body.byUser).toHaveLength(0);
  } finally {
    await prisma.sector.delete({ where: { id: emptySector.id } });
  }
});

// --- drilldown ---

test('GET /users/:id/drilldown retorna métricas e byStatus com zeros', async () => {
  const res = await request(app)
    .get(`/api/performance/users/${techUserId}/drilldown?from=${PERIOD_FROM}&to=${PERIOD_TO}`)
    .set('Authorization', `Bearer ${techToken}`);

  expect(res.status).toBe(200);
  expect(res.body.user.id).toBe(techUserId);
  expect(res.body.metrics.totalTickets).toBe(3);
  expect(res.body.metrics.byStatus.ABERTO).toBe(1);
  expect(res.body.metrics.byStatus.RESOLVIDO).toBe(2);
  expect(res.body.metrics.byStatus.EM_ANDAMENTO).toBe(0);
  expect(res.body.metrics.byUrgency.MEDIO).toBe(2);
  expect(res.body.metrics.byUrgency.ALTO).toBe(1);
  expect(res.body.tickets).toHaveLength(3);
  // todos os tickets têm slaBadge
  expect(['verde', 'amarelo', 'vermelho']).toContain(res.body.tickets[0].slaBadge);
});

test('GET /users/:id/drilldown retorna 404 para usuário inexistente', async () => {
  const res = await request(app)
    .get(`/api/performance/users/999999/drilldown?from=${PERIOD_FROM}&to=${PERIOD_TO}`)
    .set('Authorization', `Bearer ${techToken}`);
  expect(res.status).toBe(404);
});

// --- export ---

test('GET /export?format=csv retorna 200 com Content-Type text/csv', async () => {
  const res = await request(app)
    .get(`/api/performance/export?from=${PERIOD_FROM}&to=${PERIOD_TO}&format=csv`)
    .set('Authorization', `Bearer ${techToken}`);

  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/text\/csv/);
  expect(res.headers['content-disposition']).toMatch(/attachment/);
  expect(res.text).toContain('De,Até');
});

test('GET /export?format=pdf retorna 200 com Content-Type application/pdf', async () => {
  const res = await request(app)
    .get(`/api/performance/export?from=${PERIOD_FROM}&to=${PERIOD_TO}&format=pdf`)
    .set('Authorization', `Bearer ${techToken}`);

  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/application\/pdf/);
  expect(res.body).toBeDefined();
});

test('GET /export sem permissão retorna 403', async () => {
  const res = await request(app)
    .get(`/api/performance/export?from=${PERIOD_FROM}&to=${PERIOD_TO}&format=csv`)
    .set('Authorization', `Bearer ${noPermToken}`);
  expect(res.status).toBe(403);
});

test('GET /export com format inválido retorna 400', async () => {
  const res = await request(app)
    .get(`/api/performance/export?from=${PERIOD_FROM}&to=${PERIOD_TO}&format=xlsx`)
    .set('Authorization', `Bearer ${techToken}`);
  expect(res.status).toBe(400);
});
