const express = require('express');
const request = require('supertest');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');
const authenticate = require('../src/middleware/authenticate');
const requirePermission = require('../src/middleware/requirePermission');

const createdRoleIds = [];
const createdSectorIds = [];
const createdUserIds = [];

let app;
let userWithPermission;
let userWithoutPermission;
let inactiveUser;

beforeAll(async () => {
  const sector = await prisma.sector.create({ data: { name: 'Sector Teste RBAC Middleware' } });
  createdSectorIds.push(sector.id);

  const roleWithPermission = await prisma.role.create({
    data: {
      name: 'Role Teste RBAC ComPermissao',
      level: 2,
      permissions: { create: [{ permissionKey: 'manage_users', enabled: true }] },
    },
  });
  const roleWithoutPermission = await prisma.role.create({
    data: { name: 'Role Teste RBAC SemPermissao', level: 1 },
  });
  createdRoleIds.push(roleWithPermission.id, roleWithoutPermission.id);

  userWithPermission = await prisma.user.create({
    data: {
      name: 'Usuário Com Permissão',
      email: 'rbac.com@example.com',
      passwordHash: 'hash',
      roleId: roleWithPermission.id,
      sectorId: sector.id,
    },
  });
  userWithoutPermission = await prisma.user.create({
    data: {
      name: 'Usuário Sem Permissão',
      email: 'rbac.sem@example.com',
      passwordHash: 'hash',
      roleId: roleWithoutPermission.id,
      sectorId: sector.id,
    },
  });
  inactiveUser = await prisma.user.create({
    data: {
      name: 'Usuário Inativo',
      email: 'rbac.inativo@example.com',
      passwordHash: 'hash',
      roleId: roleWithPermission.id,
      sectorId: sector.id,
      active: false,
    },
  });
  createdUserIds.push(userWithPermission.id, userWithoutPermission.id, inactiveUser.id);

  app = express();
  app.get('/protected', authenticate, requirePermission('manage_users'), (req, res) => {
    res.json({ ok: true });
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
  await prisma.sector.deleteMany({ where: { id: { in: createdSectorIds } } });
  await prisma.$disconnect();
});

test('rejects requests without a token', async () => {
  const response = await request(app).get('/protected');
  expect(response.status).toBe(401);
});

test('rejects requests with an invalid token', async () => {
  const response = await request(app).get('/protected').set('Authorization', 'Bearer invalid-token');
  expect(response.status).toBe(401);
});

test('rejects a token for an inactive user', async () => {
  const token = signAccessToken(inactiveUser.id);
  const response = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
  expect(response.status).toBe(401);
});

test('rejects a user without the required permission', async () => {
  const token = signAccessToken(userWithoutPermission.id);
  const response = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
  expect(response.status).toBe(403);
});

test('allows a user with the required permission', async () => {
  const token = signAccessToken(userWithPermission.id);
  const response = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ ok: true });
});
