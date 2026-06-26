const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');

let adminToken, techToken;
let sectorA, sectorB, sectorC;
let adminUser, techUser;
let adminRole, techRole;
let category, subcategory;

beforeAll(async () => {
  const existingUsers = await prisma.user.findMany({ where: { email: { in: ['admin-us@test.com', 'tech-us@test.com'] } }, select: { id: true } });
  if (existingUsers.length > 0) {
    await prisma.userSector.deleteMany({ where: { userId: { in: existingUsers.map(u => u.id) } } });
  }
  await prisma.user.deleteMany({ where: { email: { in: ['admin-us@test.com', 'tech-us@test.com'] } } });
  await prisma.sector.deleteMany({ where: { name: { in: ['SetorA-US', 'SetorB-US', 'SetorC-US'] } } });
  await prisma.role.deleteMany({ where: { name: { in: ['AdminRole-US', 'TechRole-US'] } } });
  await prisma.subcategory.deleteMany({ where: { name: 'Sub-US' } });
  await prisma.category.deleteMany({ where: { name: 'Cat-US' } });

  const hash = await bcrypt.hash('Senha123!', 10);

  adminRole = await prisma.role.create({
    data: {
      name: 'AdminRole-US',
      level: 4,
      permissions: { create: [{ permissionKey: 'manage_users', enabled: true }, { permissionKey: 'reassign_tickets', enabled: true }] },
    },
  });
  techRole = await prisma.role.create({
    data: {
      name: 'TechRole-US',
      level: 2,
      permissions: { create: [{ permissionKey: 'view_sector_tickets', enabled: true }] },
    },
  });

  sectorA = await prisma.sector.create({ data: { name: 'SetorA-US' } });
  sectorB = await prisma.sector.create({ data: { name: 'SetorB-US' } });
  sectorC = await prisma.sector.create({ data: { name: 'SetorC-US' } });

  adminUser = await prisma.user.create({
    data: { name: 'Admin US', email: 'admin-us@test.com', passwordHash: hash, roleId: adminRole.id, sectorId: sectorA.id },
  });
  techUser = await prisma.user.create({
    data: { name: 'Tech US', email: 'tech-us@test.com', passwordHash: hash, roleId: techRole.id, sectorId: sectorA.id },
  });

  category = await prisma.category.create({
    data: { name: 'Cat-US', subcategories: { create: [{ name: 'Sub-US' }] } },
    include: { subcategories: true },
  });
  subcategory = category.subcategories[0];

  adminToken = signAccessToken(adminUser.id);
  techToken  = signAccessToken(techUser.id);
});

afterAll(async () => {
  await prisma.userSector.deleteMany({ where: { userId: { in: [adminUser.id, techUser.id] } } });
  await prisma.user.deleteMany({ where: { email: { in: ['admin-us@test.com', 'tech-us@test.com'] } } });
  await prisma.sector.deleteMany({ where: { name: { in: ['SetorA-US', 'SetorB-US', 'SetorC-US'] } } });
  await prisma.role.deleteMany({ where: { name: { in: ['AdminRole-US', 'TechRole-US'] } } });
  await prisma.subcategory.deleteMany({ where: { name: 'Sub-US' } });
  await prisma.category.deleteMany({ where: { name: 'Cat-US' } });
  await prisma.$disconnect();
});

// ── GET /users/:id/sectors ────────────────────────────────────────────────────

test('GET /users/:id/sectors retorna setor principal e setores vinculados', async () => {
  await prisma.userSector.create({ data: { userId: techUser.id, sectorId: sectorB.id, type: 'member' } });

  const res = await request(app)
    .get(`/api/users/${techUser.id}/sectors`)
    .set('Authorization', `Bearer ${adminToken}`);

  expect(res.status).toBe(200);
  expect(res.body.primary).toMatchObject({ id: sectorA.id, name: 'SetorA-US' });
  expect(res.body.sectors).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: sectorB.id, type: 'member' })])
  );

  await prisma.userSector.deleteMany({ where: { userId: techUser.id } });
});

test('GET /users/:id/sectors com userId inexistente retorna 404', async () => {
  const res = await request(app)
    .get('/api/users/999999/sectors')
    .set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(404);
});

// ── POST /users/:id/sectors ───────────────────────────────────────────────────

test('POST /users/:id/sectors adiciona setor tipo member → 201', async () => {
  const res = await request(app)
    .post(`/api/users/${techUser.id}/sectors`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ sectorId: sectorB.id, type: 'member' });

  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ sectorId: sectorB.id, type: 'member' });
  expect(res.body.sector).toMatchObject({ id: sectorB.id, name: 'SetorB-US' });

  await prisma.userSector.deleteMany({ where: { userId: techUser.id } });
});

test('POST /users/:id/sectors adiciona setor tipo extra → 201', async () => {
  const res = await request(app)
    .post(`/api/users/${techUser.id}/sectors`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ sectorId: sectorB.id, type: 'extra' });

  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ type: 'extra' });

  await prisma.userSector.deleteMany({ where: { userId: techUser.id } });
});

test('POST com setor principal retorna 409', async () => {
  const res = await request(app)
    .post(`/api/users/${techUser.id}/sectors`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ sectorId: sectorA.id, type: 'member' });
  expect(res.status).toBe(409);
  expect(res.body.error).toMatch(/setor principal/i);
});

test('POST duplicado retorna 409', async () => {
  await prisma.userSector.create({ data: { userId: techUser.id, sectorId: sectorB.id, type: 'member' } });

  const res = await request(app)
    .post(`/api/users/${techUser.id}/sectors`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ sectorId: sectorB.id, type: 'extra' });
  expect(res.status).toBe(409);

  await prisma.userSector.deleteMany({ where: { userId: techUser.id } });
});

test('POST com sectorId inexistente retorna 422', async () => {
  const res = await request(app)
    .post(`/api/users/${techUser.id}/sectors`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ sectorId: 999999, type: 'member' });
  expect(res.status).toBe(422);
});

// ── PATCH /users/:id/sectors/:sid ────────────────────────────────────────────

test('PATCH muda type de member para extra → 200', async () => {
  await prisma.userSector.create({ data: { userId: techUser.id, sectorId: sectorB.id, type: 'member' } });

  const res = await request(app)
    .patch(`/api/users/${techUser.id}/sectors/${sectorB.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ type: 'extra' });

  expect(res.status).toBe(200);
  expect(res.body.type).toBe('extra');

  await prisma.userSector.deleteMany({ where: { userId: techUser.id } });
});

test('PATCH com vínculo inexistente retorna 404', async () => {
  const res = await request(app)
    .patch(`/api/users/${techUser.id}/sectors/${sectorC.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ type: 'extra' });
  expect(res.status).toBe(404);
});

// ── DELETE /users/:id/sectors/:sid ───────────────────────────────────────────

test('DELETE remove vínculo → 204', async () => {
  await prisma.userSector.create({ data: { userId: techUser.id, sectorId: sectorB.id, type: 'extra' } });

  const res = await request(app)
    .delete(`/api/users/${techUser.id}/sectors/${sectorB.id}`)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(204);
});

test('DELETE com vínculo inexistente retorna 404', async () => {
  const res = await request(app)
    .delete(`/api/users/${techUser.id}/sectors/${sectorC.id}`)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(404);
});

// ── Visibilidade ──────────────────────────────────────────────────────────────

test('técnico com setor member enxerga chamados desse setor na listagem', async () => {
  const now = new Date();
  // Criar ticket no setorC (que techUser não tem como principal)
  const ticket = await prisma.ticket.create({
    data: {
      title: 'Ticket visibilidade member',
      description: 'test',
      sectorId: sectorC.id,
      requesterId: adminUser.id,
      status: 'ABERTO',
      urgency: 'BAIXO',
      categoryId: category.id,
      subcategoryId: subcategory.id,
      slaFirstResponseDeadline: now,
      slaResolutionDeadline: now,
    },
  });

  // Sem vínculo — não deve aparecer
  let res = await request(app)
    .get('/api/tickets')
    .set('Authorization', `Bearer ${techToken}`);
  const before = (res.body.items || []).map(t => t.id);
  expect(before).not.toContain(ticket.id);

  // Adicionar como member
  await prisma.userSector.create({ data: { userId: techUser.id, sectorId: sectorC.id, type: 'member' } });

  // Agora deve aparecer (novo token com middleware atualizado)
  const newToken = signAccessToken(techUser.id);
  res = await request(app)
    .get('/api/tickets')
    .set('Authorization', `Bearer ${newToken}`);
  const after = (res.body.items || []).map(t => t.id);
  expect(after).toContain(ticket.id);

  await prisma.userSector.deleteMany({ where: { userId: techUser.id } });
  await prisma.ticket.delete({ where: { id: ticket.id } });
});

test('técnico com setor extra NÃO enxerga chamados desse setor (só se atribuído)', async () => {
  const now = new Date();
  const ticket = await prisma.ticket.create({
    data: {
      title: 'Ticket visibilidade extra',
      description: 'test',
      sectorId: sectorC.id,
      requesterId: adminUser.id,
      status: 'ABERTO',
      urgency: 'BAIXO',
      categoryId: category.id,
      subcategoryId: subcategory.id,
      slaFirstResponseDeadline: now,
      slaResolutionDeadline: now,
    },
  });

  await prisma.userSector.create({ data: { userId: techUser.id, sectorId: sectorC.id, type: 'extra' } });

  const newToken = signAccessToken(techUser.id);
  const res = await request(app)
    .get('/api/tickets')
    .set('Authorization', `Bearer ${newToken}`);
  const ids = (res.body.items || []).map(t => t.id);
  expect(ids).not.toContain(ticket.id);

  await prisma.userSector.deleteMany({ where: { userId: techUser.id } });
  await prisma.ticket.delete({ where: { id: ticket.id } });
});

// ── GET /users?sectorId ───────────────────────────────────────────────────────

test('GET /users?sectorId retorna usuários do setor (principal e vinculados)', async () => {
  await prisma.userSector.create({ data: { userId: techUser.id, sectorId: sectorB.id, type: 'member' } });

  const res = await request(app)
    .get(`/api/users?sectorId=${sectorA.id}`)
    .set('Authorization', `Bearer ${adminToken}`);

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  const ids = res.body.map(u => u.id);
  expect(ids).toContain(techUser.id); // sectorA is techUser's primary sector

  await prisma.userSector.deleteMany({ where: { userId: techUser.id } });
});

test('GET /users?sectorId com valor inválido retorna 400', async () => {
  const res = await request(app)
    .get('/api/users?sectorId=abc')
    .set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(400);
});

// ── GET /sectors/:id/users ────────────────────────────────────────────────────

test('GET /sectors/:id/users retorna usuários do setor (principal + member + extra)', async () => {
  // techUser tem sectorA como principal
  // Adicionar sectorB como member para techUser
  await prisma.userSector.create({ data: { userId: techUser.id, sectorId: sectorB.id, type: 'member' } });

  const res = await request(app)
    .get(`/api/sectors/${sectorA.id}/users`)
    .set('Authorization', `Bearer ${adminToken}`);

  expect(res.status).toBe(200);
  const ids = res.body.map(u => u.id);
  expect(ids).toContain(techUser.id);

  // também retorna usuários member do sectorB
  const resB = await request(app)
    .get(`/api/sectors/${sectorB.id}/users`)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(resB.body.map(u => u.id)).toContain(techUser.id);

  await prisma.userSector.deleteMany({ where: { userId: techUser.id } });
});
