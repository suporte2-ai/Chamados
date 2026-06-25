const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');

const createdRoleIds = [];
const createdSectorIds = [];
const createdUserIds = [];

let adminToken;

beforeAll(async () => {
  const sector = await prisma.sector.create({ data: { name: 'Sector Teste Sectors API Base' } });
  createdSectorIds.push(sector.id);

  const adminRole = await prisma.role.create({
    data: {
      name: 'Role Teste Sectors API Admin',
      level: 4,
      permissions: { create: [{ permissionKey: 'manage_categories', enabled: true }] },
    },
  });
  createdRoleIds.push(adminRole.id);

  const adminUser = await prisma.user.create({
    data: {
      name: 'Admin Teste Sectors API',
      email: 'sectors-api.admin@example.com',
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

test('POST /api/sectors creates a sector', async () => {
  const response = await request(app)
    .post('/api/sectors')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Setor Teste API' });

  expect(response.status).toBe(201);
  createdSectorIds.push(response.body.id);
});

test('GET /api/sectors lists sectors', async () => {
  const response = await request(app).get('/api/sectors').set('Authorization', `Bearer ${adminToken}`);

  expect(response.status).toBe(200);
  expect(response.body.some((s) => s.name === 'Setor Teste API')).toBe(true);
});

test('POST /api/sectors rejects a duplicate name with 409', async () => {
  const response = await request(app)
    .post('/api/sectors')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Setor Teste API' });

  expect(response.status).toBe(409);
});
