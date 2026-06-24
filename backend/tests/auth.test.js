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
let currentActiveUserPassword = PLAIN_PASSWORD;

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
  expect(response.body.user.role.id).toBe(role.id);
  expect(response.body.user.role.name).toBe(role.name);
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
  expect(meResponse.body.user.role.id).toBe(role.id);
  expect(meResponse.body.user.role.name).toBe(role.name);
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
  currentActiveUserPassword = 'NovaSenha456!';
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
  currentActiveUserPassword = 'OutraSenha789!';

  const secondAttempt = await request(app)
    .post('/api/auth/reset-password')
    .send({ token: rawToken, newPassword: 'TerceiraSenha000!' });

  expect(secondAttempt.status).toBe(400);
});

test('forgot-password invalidates previously issued unused tokens for the same user', async () => {
  await request(app).post('/api/auth/forgot-password').send({ email: activeUser.email });
  const firstToken = await prisma.passwordResetToken.findFirst({
    where: { userId: activeUser.id, usedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  await request(app).post('/api/auth/forgot-password').send({ email: activeUser.email });

  const refreshedFirstToken = await prisma.passwordResetToken.findUnique({ where: { id: firstToken.id } });
  expect(refreshedFirstToken.usedAt).not.toBeNull();

  const stillUnused = await prisma.passwordResetToken.findMany({
    where: { userId: activeUser.id, usedAt: null },
  });
  expect(stillUnused).toHaveLength(1);
});

test('refresh rejects a concurrent reuse of the same refresh token (rotation race)', async () => {
  const loginResponse = await request(app)
    .post('/api/auth/login')
    .send({ email: activeUser.email, password: currentActiveUserPassword });

  const cookie = loginResponse.headers['set-cookie'][0];

  const [firstAttempt, secondAttempt] = await Promise.all([
    request(app).post('/api/auth/refresh').set('Cookie', cookie),
    request(app).post('/api/auth/refresh').set('Cookie', cookie),
  ]);

  const statuses = [firstAttempt.status, secondAttempt.status].sort();
  expect(statuses).toEqual([200, 401]);
});

test('refresh cookie maxAge matches JWT_REFRESH_EXPIRES duration', async () => {
  const { getRefreshTokenExpiresInMs } = require('../src/lib/jwt');
  const loginResponse = await request(app)
    .post('/api/auth/login')
    .send({ email: activeUser.email, password: currentActiveUserPassword });

  const setCookieHeader = loginResponse.headers['set-cookie'][0];
  const maxAgeMatch = setCookieHeader.match(/Max-Age=(\d+)/i);
  expect(maxAgeMatch).not.toBeNull();
  expect(Number(maxAgeMatch[1]) * 1000).toBe(getRefreshTokenExpiresInMs());
});

test('login returns 409 instead of crashing when the user role no longer exists', async () => {
  // O schema protege a FK roleId com onDelete: Restrict, então uma role "órfã" não é
  // reproduzível via operações normais do Prisma — simulamos a inconsistência mockando
  // prisma.role.findUnique para retornar null nesta única chamada, exercitando o mesmo
  // caminho de código que um FK quebrado ou uma condição de corrida acionaria.
  const roleFindUniqueSpy = jest.spyOn(prisma.role, 'findUnique').mockResolvedValueOnce(null);

  const response = await request(app)
    .post('/api/auth/login')
    .send({ email: activeUser.email, password: currentActiveUserPassword });

  expect(response.status).toBe(409);

  roleFindUniqueSpy.mockRestore();
});

test('GET /api/auth/me returns 401 instead of crashing when the user was deleted after the access token was issued', async () => {
  const loginResponse = await request(app)
    .post('/api/auth/login')
    .send({ email: activeUser.email, password: currentActiveUserPassword });

  // A primeira chamada a findUnique (dentro do middleware authenticate) deve seguir
  // normalmente; só a segunda (dentro do handler me()) deve simular o usuário ausente.
  const originalFindUnique = prisma.user.findUnique.bind(prisma.user);
  const findUniqueSpy = jest
    .spyOn(prisma.user, 'findUnique')
    .mockImplementationOnce((args) => originalFindUnique(args))
    .mockResolvedValueOnce(null);

  const meResponse = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${loginResponse.body.accessToken}`);

  expect(meResponse.status).toBe(401);

  findUniqueSpy.mockRestore();
});

test('refresh returns 401 instead of crashing when the user is deleted between the token rotation and the re-fetch', async () => {
  const loginResponse = await request(app)
    .post('/api/auth/login')
    .send({ email: activeUser.email, password: currentActiveUserPassword });

  const cookie = loginResponse.headers['set-cookie'][0];

  const findUniqueSpy = jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(null);

  const refreshResponse = await request(app).post('/api/auth/refresh').set('Cookie', cookie);

  expect(refreshResponse.status).toBe(401);

  findUniqueSpy.mockRestore();
});

test('forgotPassword invalidation of old tokens and creation of the new one are atomic', async () => {
  const crypto = require('crypto');
  const fixedToken = Buffer.alloc(32, 7);
  const expectedHashedToken = crypto.createHash('sha256').update(fixedToken.toString('hex')).digest('hex');

  // Token pré-existente com o mesmo hash que o próximo forgot-password vai gerar
  // (graças ao mock de randomBytes abaixo), forçando uma violação de unique constraint
  // no passo de criação e validando que o passo de invalidação não fica de fora.
  await prisma.passwordResetToken.create({
    data: {
      userId: activeUser.id,
      token: expectedHashedToken,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  await request(app).post('/api/auth/forgot-password').send({ email: activeUser.email });
  const previousToken = await prisma.passwordResetToken.findFirst({
    where: { userId: activeUser.id, usedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const randomBytesSpy = jest.spyOn(crypto, 'randomBytes').mockReturnValueOnce(fixedToken);

  const response = await request(app).post('/api/auth/forgot-password').send({ email: activeUser.email });
  expect(response.status).toBe(500);

  const refreshedPreviousToken = await prisma.passwordResetToken.findUnique({ where: { id: previousToken.id } });
  expect(refreshedPreviousToken.usedAt).toBeNull();

  randomBytesSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

test('an unexpected error in an async route handler is caught by the global error handler instead of hanging the request', async () => {
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const userFindUniqueSpy = jest
    .spyOn(prisma.user, 'findUnique')
    .mockRejectedValueOnce(new Error('Falha simulada de conexão com o banco.'));

  const response = await request(app)
    .post('/api/auth/login')
    .send({ email: activeUser.email, password: currentActiveUserPassword });

  expect(response.status).toBe(500);
  expect(response.body.error).toBeDefined();

  userFindUniqueSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});
