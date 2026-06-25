const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');

const createdRoleIds = [];
const createdSectorIds = [];
const createdUserIds = [];

let adminToken;

beforeAll(async () => {
  const sector = await prisma.sector.create({ data: { name: 'Sector Teste SLA API' } });
  createdSectorIds.push(sector.id);

  const adminRole = await prisma.role.create({
    data: {
      name: 'Role Teste SLA API Admin',
      level: 4,
      permissions: { create: [{ permissionKey: 'manage_sla', enabled: true }] },
    },
  });
  createdRoleIds.push(adminRole.id);

  const adminUser = await prisma.user.create({
    data: {
      name: 'Admin Teste SLA API',
      email: 'sla-api.admin@example.com',
      passwordHash: 'hash',
      roleId: adminRole.id,
      sectorId: sector.id,
    },
  });
  createdUserIds.push(adminUser.id);
  adminToken = signAccessToken(adminUser.id);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
  await prisma.sector.deleteMany({ where: { id: { in: createdSectorIds } } });
  await prisma.$disconnect();
});

test('GET /api/sla-config lists the 4 fixed urgency configs', async () => {
  await prisma.slaConfig.upsert({
    where: { urgency: 'CRITICO' },
    update: {},
    create: { urgency: 'CRITICO', firstResponseHours: 1, resolutionHours: 4 },
  });

  const response = await request(app).get('/api/sla-config').set('Authorization', `Bearer ${adminToken}`);

  expect(response.status).toBe(200);
  expect(response.body.some((c) => c.urgency === 'CRITICO')).toBe(true);
});

test('PATCH /api/sla-config/:urgency updates the resolution hours for that urgency', async () => {
  await prisma.slaConfig.upsert({
    where: { urgency: 'BAIXO' },
    update: { firstResponseHours: 8, resolutionHours: 72 },
    create: { urgency: 'BAIXO', firstResponseHours: 8, resolutionHours: 72 },
  });

  const response = await request(app)
    .patch('/api/sla-config/BAIXO')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ resolutionHours: 96 });

  expect(response.status).toBe(200);
  expect(response.body.resolutionHours).toBe(96);
});

test('PATCH /api/sla-config/:urgency returns 400 for an unknown urgency', async () => {
  const response = await request(app)
    .patch('/api/sla-config/URGENCIA_INEXISTENTE')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ resolutionHours: 10 });

  expect(response.status).toBe(400);
});
