const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');

const ids = { sectors: [], roles: [], users: [], tokens: [] };
let userToken;
let userId;
const PLAIN_PASSWORD = 'SenhaProfile1!';
let otherUserEmail;

beforeAll(async () => {
  const sector = await prisma.sector.create({ data: { name: 'Setor Profile Test' } });
  ids.sectors.push(sector.id);

  const role = await prisma.role.create({ data: { name: 'Role Profile Test', level: 1 } });
  ids.roles.push(role.id);

  const passwordHash = await bcrypt.hash(PLAIN_PASSWORD, 10);
  const user = await prisma.user.create({
    data: {
      name: 'User Profile Test',
      email: 'profile-test@example.com',
      passwordHash,
      roleId: role.id,
      sectorId: sector.id,
    },
  });
  ids.users.push(user.id);
  userId = user.id;
  userToken = signAccessToken(user.id);

  // Segundo usuário — usado para testar e-mail já em uso por outra pessoa
  otherUserEmail = 'profile-test-other@example.com';
  const otherUser = await prisma.user.create({
    data: {
      name: 'Other User Profile Test',
      email: otherUserEmail,
      passwordHash,
      roleId: role.id,
      sectorId: sector.id,
    },
  });
  ids.users.push(otherUser.id);
});

afterAll(async () => {
  await prisma.emailChangeToken.deleteMany({ where: { userId: { in: ids.users } } });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  await prisma.role.deleteMany({ where: { id: { in: ids.roles } } });
  await prisma.sector.deleteMany({ where: { id: { in: ids.sectors } } });
  await prisma.$disconnect();
});

// --- PATCH /auth/me ---

test('PATCH /auth/me atualiza nome com sucesso', async () => {
  const res = await request(app)
    .patch('/api/auth/me')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ name: 'Novo Nome Profile' });
  expect(res.status).toBe(200);
  expect(res.body.name).toBe('Novo Nome Profile');
  // restaurar
  await prisma.user.update({ where: { id: userId }, data: { name: 'User Profile Test' } });
});

test('PATCH /auth/me troca senha com sucesso', async () => {
  const res = await request(app)
    .patch('/api/auth/me')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ currentPassword: PLAIN_PASSWORD, newPassword: 'NovaSenha123!' });
  expect(res.status).toBe(200);
  // restaurar senha original
  const hash = await bcrypt.hash(PLAIN_PASSWORD, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } });
});

test('PATCH /auth/me com senha atual errada retorna 400', async () => {
  const res = await request(app)
    .patch('/api/auth/me')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ currentPassword: 'SenhaErrada!', newPassword: 'NovaSenha123!' });
  expect(res.status).toBe(400);
});

test('PATCH /auth/me com nome + senha errada não salva o nome (atomicidade)', async () => {
  const before = await prisma.user.findUnique({ where: { id: userId } });
  const res = await request(app)
    .patch('/api/auth/me')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ name: 'Nome Não Salvo', currentPassword: 'SenhaErrada!', newPassword: 'NovaSenha123!' });
  expect(res.status).toBe(400);
  const after = await prisma.user.findUnique({ where: { id: userId } });
  expect(after.name).toBe(before.name);
});

// --- POST /auth/request-email-change ---

test('POST /auth/request-email-change com e-mail já em uso retorna 409', async () => {
  // usar o e-mail de outro usuário — deve retornar 409
  const res = await request(app)
    .post('/api/auth/request-email-change')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ newEmail: otherUserEmail });
  expect(res.status).toBe(409);
});

test('POST /auth/request-email-change com e-mail novo retorna 200 e cria token', async () => {
  const res = await request(app)
    .post('/api/auth/request-email-change')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ newEmail: 'profile-test-new@example.com' });
  expect(res.status).toBe(200);
  expect(res.body.message).toMatch(/Link/i);

  const token = await prisma.emailChangeToken.findFirst({
    where: { userId, newEmail: 'profile-test-new@example.com', usedAt: null },
  });
  expect(token).not.toBeNull();
});

// --- GET /auth/confirm-email-change/:token ---

test('GET /auth/confirm-email-change/:token válido atualiza e-mail', async () => {
  const rawToken = 'valid-test-token-' + Date.now();
  await prisma.emailChangeToken.create({
    data: {
      userId,
      newEmail: 'profile-test-confirmed@example.com',
      token: rawToken,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });

  const res = await request(app)
    .get(`/api/auth/confirm-email-change/${rawToken}`);
  expect(res.status).toBe(200);
  expect(res.body.message).toMatch(/sucesso/i);

  const updated = await prisma.user.findUnique({ where: { id: userId } });
  expect(updated.email).toBe('profile-test-confirmed@example.com');

  // restaurar e-mail original
  await prisma.user.update({ where: { id: userId }, data: { email: 'profile-test@example.com' } });
});

test('GET /auth/confirm-email-change/:token expirado retorna 400', async () => {
  const rawToken = 'expired-test-token-' + Date.now();
  await prisma.emailChangeToken.create({
    data: {
      userId,
      newEmail: 'expired@example.com',
      token: rawToken,
      expiresAt: new Date(Date.now() - 1000),
    },
  });

  const res = await request(app).get(`/api/auth/confirm-email-change/${rawToken}`);
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/expir/i);
});

test('GET /auth/confirm-email-change/:token já utilizado retorna 400', async () => {
  const rawToken = 'used-test-token-' + Date.now();
  await prisma.emailChangeToken.create({
    data: {
      userId,
      newEmail: 'used@example.com',
      token: rawToken,
      expiresAt: new Date(Date.now() + 3600000),
      usedAt: new Date(),
      reason: 'used',
    },
  });

  const res = await request(app).get(`/api/auth/confirm-email-change/${rawToken}`);
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/utilizado/i);
});

test('GET /auth/confirm-email-change/:token substituído retorna 400', async () => {
  const rawToken = 'superseded-test-token-' + Date.now();
  await prisma.emailChangeToken.create({
    data: {
      userId,
      newEmail: 'superseded@example.com',
      token: rawToken,
      expiresAt: new Date(Date.now() + 3600000),
      usedAt: new Date(),
      reason: 'superseded',
    },
  });

  const res = await request(app).get(`/api/auth/confirm-email-change/${rawToken}`);
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/substituído|recente/i);
});
