const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');

const createdRoleIds = [];
const createdSectorIds = [];
const createdUserIds = [];

let sector;
let adminRole;
let adminUser;
let adminToken;

beforeAll(async () => {
  sector = await prisma.sector.create({ data: { name: 'Sector Teste Users API' } });
  adminRole = await prisma.role.create({
    data: {
      name: 'Role Teste Users API Admin',
      level: 4,
      permissions: { create: [{ permissionKey: 'manage_users', enabled: true }] },
    },
  });
  createdSectorIds.push(sector.id);
  createdRoleIds.push(adminRole.id);

  adminUser = await prisma.user.create({
    data: {
      name: 'Admin Teste Users API',
      email: 'users-api.admin@example.com',
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

test('GET /api/users requires authentication', async () => {
  const response = await request(app).get('/api/users');
  expect(response.status).toBe(401);
});

test('POST /api/users creates a user with an admin-supplied password', async () => {
  const response = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: 'Novo Usuário',
      email: 'novo.usuario.api@example.com',
      password: 'SenhaInicial123!',
      roleId: adminRole.id,
      sectorId: sector.id,
    });

  expect(response.status).toBe(201);
  expect(response.body.email).toBe('novo.usuario.api@example.com');
  expect(response.body.passwordHash).not.toBe('SenhaInicial123!');
  createdUserIds.push(response.body.id);
});

test('POST /api/users rejects a duplicate email with 409', async () => {
  const response = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: 'Outro Usuário',
      email: 'novo.usuario.api@example.com',
      password: 'OutraSenha456!',
      roleId: adminRole.id,
      sectorId: sector.id,
    });

  expect(response.status).toBe(409);
});

test('PATCH /api/users/:id soft-deletes a user by setting active to false', async () => {
  const created = await prisma.user.create({
    data: {
      name: 'Usuário Para Desativar',
      email: 'desativar.api@example.com',
      passwordHash: 'hash',
      roleId: adminRole.id,
      sectorId: sector.id,
    },
  });
  createdUserIds.push(created.id);

  const response = await request(app)
    .patch(`/api/users/${created.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ active: false });

  expect(response.status).toBe(200);
  expect(response.body.active).toBe(false);
});

test('GET /api/users lists users when authenticated with manage_users', async () => {
  const response = await request(app).get('/api/users').set('Authorization', `Bearer ${adminToken}`);

  expect(response.status).toBe(200);
  expect(Array.isArray(response.body)).toBe(true);
});
