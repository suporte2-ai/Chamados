const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');

const createdRoleIds = [];
const createdSectorIds = [];
const createdUserIds = [];

let sector;
let role;
let activeUser;
let inactiveUser;
const PLAIN_PASSWORD = 'Senha123!';

beforeAll(async () => {
  sector = await prisma.sector.create({ data: { name: 'Sector Teste Auth' } });
  role = await prisma.role.create({ data: { name: 'Role Teste Auth', level: 1 } });
  createdSectorIds.push(sector.id);
  createdRoleIds.push(role.id);

  const passwordHash = await bcrypt.hash(PLAIN_PASSWORD, 10);

  activeUser = await prisma.user.create({
    data: {
      name: 'Usuário Teste Auth',
      email: 'auth.ativo@example.com',
      passwordHash,
      roleId: role.id,
      sectorId: sector.id,
    },
  });
  inactiveUser = await prisma.user.create({
    data: {
      name: 'Usuário Inativo Auth',
      email: 'auth.inativo@example.com',
      passwordHash,
      roleId: role.id,
      sectorId: sector.id,
      active: false,
    },
  });
  createdUserIds.push(activeUser.id, inactiveUser.id);
});

afterAll(async () => {
  await prisma.passwordResetToken.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
  await prisma.sector.deleteMany({ where: { id: { in: createdSectorIds } } });
  await prisma.$disconnect();
});

test('login with correct credentials returns an access token and profile', async () => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email: activeUser.email, password: PLAIN_PASSWORD });

  expect(response.status).toBe(200);
  expect(response.body.accessToken).toBeDefined();
  expect(response.body.user.email).toBe(activeUser.email);
  expect(response.headers['set-cookie'][0]).toMatch(/refreshToken=/);
});

test('login with wrong password returns 401', async () => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email: activeUser.email, password: 'senha-errada' });

  expect(response.status).toBe(401);
});

test('login for an inactive user returns 403', async () => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email: inactiveUser.email, password: PLAIN_PASSWORD });

  expect(response.status).toBe(403);
});

test('refresh rotates the refresh token and rejects the old one on reuse', async () => {
  const loginResponse = await request(app)
    .post('/api/auth/login')
    .send({ email: activeUser.email, password: PLAIN_PASSWORD });

  const originalCookie = loginResponse.headers['set-cookie'][0];

  const refreshResponse = await request(app).post('/api/auth/refresh').set('Cookie', originalCookie);

  expect(refreshResponse.status).toBe(200);
  expect(refreshResponse.body.accessToken).toBeDefined();
  expect(refreshResponse.headers['set-cookie'][0]).toMatch(/refreshToken=/);

  const reuseResponse = await request(app).post('/api/auth/refresh').set('Cookie', originalCookie);
  expect(reuseResponse.status).toBe(401);
});

test('logout invalidates the current refresh token', async () => {
  const loginResponse = await request(app)
    .post('/api/auth/login')
    .send({ email: activeUser.email, password: PLAIN_PASSWORD });

  const cookie = loginResponse.headers['set-cookie'][0];
  const accessToken = loginResponse.body.accessToken;

  const logoutResponse = await request(app)
    .post('/api/auth/logout')
    .set('Authorization', `Bearer ${accessToken}`)
    .set('Cookie', cookie);
  expect(logoutResponse.status).toBe(204);

  const refreshResponse = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
  expect(refreshResponse.status).toBe(401);
});

test('GET /api/auth/me returns the logged-in profile', async () => {
  const loginResponse = await request(app)
    .post('/api/auth/login')
    .send({ email: activeUser.email, password: PLAIN_PASSWORD });

  const meResponse = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${loginResponse.body.accessToken}`);

  expect(meResponse.status).toBe(200);
  expect(meResponse.body.user.email).toBe(activeUser.email);
});

test('forgot-password always responds 200, even for an unknown email', async () => {
  const response = await request(app)
    .post('/api/auth/forgot-password')
    .send({ email: 'nao-existe@example.com' });

  expect(response.status).toBe(200);
});

test('forgot-password followed by reset-password changes the password', async () => {
  await request(app).post('/api/auth/forgot-password').send({ email: activeUser.email });

  const resetToken = await prisma.passwordResetToken.findFirst({
    where: { userId: activeUser.id },
    orderBy: { createdAt: 'desc' },
  });

  // O token em claro nunca é exposto pela API; em modo dev ele é apenas logado no console.
  // Para testar reset-password isoladamente, criamos nosso próprio par hash/claro aqui.
  const crypto = require('crypto');
  const rawToken = 'raw-token-for-test';
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  await prisma.passwordResetToken.update({
    where: { id: resetToken.id },
    data: { token: hashedToken },
  });

  const response = await request(app)
    .post('/api/auth/reset-password')
    .send({ token: rawToken, newPassword: 'NovaSenha456!' });

  expect(response.status).toBe(200);

  const loginResponse = await request(app)
    .post('/api/auth/login')
    .send({ email: activeUser.email, password: 'NovaSenha456!' });
  expect(loginResponse.status).toBe(200);
});

test('reset-password rejects an already used token', async () => {
  await request(app).post('/api/auth/forgot-password').send({ email: activeUser.email });

  const resetToken = await prisma.passwordResetToken.findFirst({
    where: { userId: activeUser.id },
    orderBy: { createdAt: 'desc' },
  });

  const crypto = require('crypto');
  const rawToken = 'raw-token-for-reuse-test';
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  await prisma.passwordResetToken.update({
    where: { id: resetToken.id },
    data: { token: hashedToken },
  });

  await request(app).post('/api/auth/reset-password').send({ token: rawToken, newPassword: 'OutraSenha789!' });

  const secondAttempt = await request(app)
    .post('/api/auth/reset-password')
    .send({ token: rawToken, newPassword: 'TerceiraSenha000!' });

  expect(secondAttempt.status).toBe(400);
});
