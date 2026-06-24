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
  sector = await prisma.sector.create({ data: { name: 'Sector Teste Roles API' } });
  adminRole = await prisma.role.create({
    data: {
      name: 'Role Teste Roles API Admin',
      level: 4,
      permissions: { create: [{ permissionKey: 'manage_users', enabled: true }] },
    },
  });
  createdSectorIds.push(sector.id);
  createdRoleIds.push(adminRole.id);

  adminUser = await prisma.user.create({
    data: {
      name: 'Admin Teste Roles API',
      email: 'roles-api.admin@example.com',
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

test('an unexpected error in GET /api/roles is caught by the global error handler instead of hanging the request', async () => {
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const findManySpy = jest
    .spyOn(prisma.role, 'findMany')
    .mockRejectedValueOnce(new Error('Falha simulada de conexão com o banco.'));

  const response = await request(app).get('/api/roles').set('Authorization', `Bearer ${adminToken}`);

  expect(response.status).toBe(500);
  expect(response.body.error).toBeDefined();

  findManySpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

test('an unexpected error in the authenticate middleware on /api/permissions/catalog is caught by the global error handler', async () => {
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const findUniqueSpy = jest
    .spyOn(prisma.user, 'findUnique')
    .mockRejectedValueOnce(new Error('Falha simulada de conexão com o banco.'));

  const response = await request(app)
    .get('/api/permissions/catalog')
    .set('Authorization', `Bearer ${adminToken}`);

  expect(response.status).toBe(500);
  expect(response.body.error).toBeDefined();

  findUniqueSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

test('GET /api/permissions/catalog returns the fixed key lists for any authenticated user', async () => {
  const response = await request(app)
    .get('/api/permissions/catalog')
    .set('Authorization', `Bearer ${adminToken}`);

  expect(response.status).toBe(200);
  expect(response.body.permissionKeys).toContain('manage_users');
  expect(response.body.fieldKeys).toEqual(['assigned_to', 'estimated_cost', 'internal_notes', 'sla_badge']);
});

test('POST /api/roles creates a non-system role', async () => {
  const response = await request(app)
    .post('/api/roles')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Role Teste Roles API Nova', level: 2 });

  expect(response.status).toBe(201);
  expect(response.body.isSystemDefault).toBe(false);
  createdRoleIds.push(response.body.id);
});

test('PATCH /api/roles/:id/permissions rejects an unknown permissionKey with 400', async () => {
  const role = await prisma.role.create({ data: { name: 'Role Teste Roles API Toggle', level: 1 } });
  createdRoleIds.push(role.id);

  const response = await request(app)
    .patch(`/api/roles/${role.id}/permissions`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send([{ permissionKey: 'chave_inexistente', enabled: true }]);

  expect(response.status).toBe(400);
});

test('PATCH /api/roles/:id/permissions toggles a valid permissionKey', async () => {
  const role = await prisma.role.create({ data: { name: 'Role Teste Roles API Toggle Valido', level: 1 } });
  createdRoleIds.push(role.id);

  const response = await request(app)
    .patch(`/api/roles/${role.id}/permissions`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send([{ permissionKey: 'view_internal_notes', enabled: true }]);

  expect(response.status).toBe(200);
  expect(response.body.some((p) => p.permissionKey === 'view_internal_notes' && p.enabled)).toBe(true);
});

test('PATCH /api/roles/:id/field-visibility toggles a valid fieldKey', async () => {
  const role = await prisma.role.create({ data: { name: 'Role Teste Roles API Field', level: 1 } });
  createdRoleIds.push(role.id);

  const response = await request(app)
    .patch(`/api/roles/${role.id}/field-visibility`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send([{ fieldKey: 'estimated_cost', visible: false }]);

  expect(response.status).toBe(200);
  expect(response.body.some((f) => f.fieldKey === 'estimated_cost' && f.visible === false)).toBe(true);
});

test('DELETE /api/roles/:id returns 409 for a system default role', async () => {
  const systemRole = await prisma.role.create({
    data: { name: 'Role Teste Roles API Sistema', level: 1, isSystemDefault: true },
  });
  createdRoleIds.push(systemRole.id);

  const response = await request(app)
    .delete(`/api/roles/${systemRole.id}`)
    .set('Authorization', `Bearer ${adminToken}`);

  expect(response.status).toBe(409);
});

test('DELETE /api/roles/:id returns 409 when users are linked to the role', async () => {
  const roleWithUsers = await prisma.role.create({ data: { name: 'Role Teste Roles API ComUsuario', level: 1 } });
  createdRoleIds.push(roleWithUsers.id);

  const linkedUser = await prisma.user.create({
    data: {
      name: 'Usuário Vinculado',
      email: 'vinculado.roles-api@example.com',
      passwordHash: 'hash',
      roleId: roleWithUsers.id,
      sectorId: sector.id,
    },
  });
  createdUserIds.push(linkedUser.id);

  const response = await request(app)
    .delete(`/api/roles/${roleWithUsers.id}`)
    .set('Authorization', `Bearer ${adminToken}`);

  expect(response.status).toBe(409);
});

test('DELETE /api/roles/:id deletes a non-system role with no linked users', async () => {
  const deletableRole = await prisma.role.create({ data: { name: 'Role Teste Roles API Deletavel', level: 1 } });

  const response = await request(app)
    .delete(`/api/roles/${deletableRole.id}`)
    .set('Authorization', `Bearer ${adminToken}`);

  expect(response.status).toBe(204);
});
