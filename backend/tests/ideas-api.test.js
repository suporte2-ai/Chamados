const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');

const ids = { sectors: [], roles: [], users: [], ideas: [] };

let gestorToken;
let tech1Token;
let tech2Token;
let tech1Id;
let ideaId;

beforeAll(async () => {
  const sector = await prisma.sector.create({ data: { name: 'Setor Ideas Test' } });
  ids.sectors.push(sector.id);

  const gestorRole = await prisma.role.create({
    data: {
      name: 'Role Ideas Gestor',
      level: 3,
      permissions: { create: [{ permissionKey: 'manage_ideas', enabled: true }] },
    },
  });
  ids.roles.push(gestorRole.id);

  const techRole = await prisma.role.create({
    data: { name: 'Role Ideas Tech', level: 2 },
  });
  ids.roles.push(techRole.id);

  const gestor = await prisma.user.create({
    data: {
      name: 'Gestor Ideas',
      email: 'ideas-gestor@example.com',
      passwordHash: 'hash',
      roleId: gestorRole.id,
      sectorId: sector.id,
    },
  });
  ids.users.push(gestor.id);
  gestorToken = signAccessToken(gestor.id);

  const tech1 = await prisma.user.create({
    data: {
      name: 'Tech1 Ideas',
      email: 'ideas-tech1@example.com',
      passwordHash: 'hash',
      roleId: techRole.id,
      sectorId: sector.id,
    },
  });
  ids.users.push(tech1.id);
  tech1Id = tech1.id;
  tech1Token = signAccessToken(tech1.id);

  const tech2 = await prisma.user.create({
    data: {
      name: 'Tech2 Ideas',
      email: 'ideas-tech2@example.com',
      passwordHash: 'hash',
      roleId: techRole.id,
      sectorId: sector.id,
    },
  });
  ids.users.push(tech2.id);
  tech2Token = signAccessToken(tech2.id);

  // ideia NOVA criada pelo tech1
  const idea = await prisma.idea.create({
    data: {
      title: 'Ideia Teste',
      description: 'Descrição da ideia teste',
      areaImpacted: 'Operações',
      expectedBenefit: 'Reduzir tempo de resposta',
      authorId: tech1.id,
    },
  });
  ids.ideas.push(idea.id);
  ideaId = idea.id;
});

afterAll(async () => {
  await prisma.ideaVote.deleteMany({ where: { ideaId: { in: ids.ideas } } });
  await prisma.idea.deleteMany({ where: { id: { in: ids.ideas } } });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  await prisma.role.deleteMany({ where: { id: { in: ids.roles } } });
  await prisma.sector.deleteMany({ where: { id: { in: ids.sectors } } });
  await prisma.$disconnect();
});

// --- create ---

test('POST /ideas cria ideia com status NOVA e campos corretos', async () => {
  const res = await request(app)
    .post('/api/ideas')
    .set('Authorization', `Bearer ${tech1Token}`)
    .send({
      title: 'Nova ideia criada',
      description: 'Descrição completa',
      areaImpacted: 'TI',
      expectedBenefit: 'Agilidade',
    });

  expect(res.status).toBe(201);
  expect(res.body.status).toBe('NOVA');
  expect(res.body.authorId).toBe(tech1Id);
  expect(res.body.voteCount).toBe(0);
  expect(res.body.userHasVoted).toBe(false);
  ids.ideas.push(res.body.id);
});

test('POST /ideas sem campo obrigatório retorna 400', async () => {
  const res = await request(app)
    .post('/api/ideas')
    .set('Authorization', `Bearer ${tech1Token}`)
    .send({ title: 'Sem area', description: 'desc', expectedBenefit: 'x' });

  expect(res.status).toBe(400);
});

// --- list ---

test('GET /ideas — tech1 vê própria NOVA; tech2 não vê NOVA de tech1', async () => {
  const resTech1 = await request(app)
    .get('/api/ideas')
    .set('Authorization', `Bearer ${tech1Token}`);
  expect(resTech1.status).toBe(200);
  const ownIdea = resTech1.body.find((i) => i.id === ideaId);
  expect(ownIdea).toBeDefined();

  const resTech2 = await request(app)
    .get('/api/ideas')
    .set('Authorization', `Bearer ${tech2Token}`);
  expect(resTech2.status).toBe(200);
  const otherIdea = resTech2.body.find((i) => i.id === ideaId);
  expect(otherIdea).toBeUndefined();
});

test('GET /ideas — gestor vê todas incluindo NOVA', async () => {
  const res = await request(app)
    .get('/api/ideas')
    .set('Authorization', `Bearer ${gestorToken}`);
  expect(res.status).toBe(200);
  const found = res.body.find((i) => i.id === ideaId);
  expect(found).toBeDefined();
  expect(found.status).toBe('NOVA');
});

test('GET /ideas?status=NOVA — tech vê apenas próprias NOVA', async () => {
  const res = await request(app)
    .get('/api/ideas?status=NOVA')
    .set('Authorization', `Bearer ${tech2Token}`);
  expect(res.status).toBe(200);
  // tech2 não tem ideias próprias NOVA no setup → resultado vazio (não 403)
  const foreign = res.body.find((i) => i.id === ideaId);
  expect(foreign).toBeUndefined();
});

test('GET /ideas?status=INVALIDO retorna 400', async () => {
  const res = await request(app)
    .get('/api/ideas?status=INVALIDO')
    .set('Authorization', `Bearer ${tech1Token}`);
  expect(res.status).toBe(400);
});

// --- detail ---

test('GET /ideas/:id retorna 404 para inexistente', async () => {
  const res = await request(app)
    .get('/api/ideas/999999')
    .set('Authorization', `Bearer ${tech1Token}`);
  expect(res.status).toBe(404);
});

test('GET /ideas/:id retorna 403 para NOVA de outro usuário sem manage_ideas', async () => {
  const res = await request(app)
    .get(`/api/ideas/${ideaId}`)
    .set('Authorization', `Bearer ${tech2Token}`);
  expect(res.status).toBe(403);
});

// --- updateStatus ---

test('PATCH /ideas/:id/status — NOVA → EM_ANALISE com managerNote (gestor)', async () => {
  const res = await request(app)
    .patch(`/api/ideas/${ideaId}/status`)
    .set('Authorization', `Bearer ${gestorToken}`)
    .send({ status: 'EM_ANALISE', managerNote: 'Boa ideia, vamos discutir!' });

  expect(res.status).toBe(200);
  expect(res.body.status).toBe('EM_ANALISE');
  expect(res.body.managerNote).toBe('Boa ideia, vamos discutir!');
});

test('PATCH /ideas/:id/status — transição inválida retorna 400', async () => {
  // ideia agora está em EM_ANALISE; tentar voltar para NOVA é inválido
  const res = await request(app)
    .patch(`/api/ideas/${ideaId}/status`)
    .set('Authorization', `Bearer ${gestorToken}`)
    .send({ status: 'NOVA' });

  expect(res.status).toBe(400);
});

test('PATCH /ideas/:id/status — sem manage_ideas retorna 403', async () => {
  const res = await request(app)
    .patch(`/api/ideas/${ideaId}/status`)
    .set('Authorization', `Bearer ${tech1Token}`)
    .send({ status: 'APROVADA' });

  expect(res.status).toBe(403);
});

// --- vote ---

test('POST /ideas/:id/vote — vota em EM_ANALISE; voteCount=1 voted=true', async () => {
  const res = await request(app)
    .post(`/api/ideas/${ideaId}/vote`)
    .set('Authorization', `Bearer ${tech2Token}`);

  expect(res.status).toBe(200);
  expect(res.body.voted).toBe(true);
  expect(res.body.voteCount).toBe(1);
});

test('POST /ideas/:id/vote — toggle desvota; voteCount=0 voted=false', async () => {
  const res = await request(app)
    .post(`/api/ideas/${ideaId}/vote`)
    .set('Authorization', `Bearer ${tech2Token}`);

  expect(res.status).toBe(200);
  expect(res.body.voted).toBe(false);
  expect(res.body.voteCount).toBe(0);
});

test('POST /ideas/:id/vote — ideia NOVA retorna 400', async () => {
  // Criar ideia NOVA temporária
  const nova = await prisma.idea.create({
    data: {
      title: 'Ideia Nova Temp',
      description: 'desc',
      areaImpacted: 'TI',
      expectedBenefit: 'x',
      authorId: tech1Id,
    },
  });
  ids.ideas.push(nova.id);

  const res = await request(app)
    .post(`/api/ideas/${nova.id}/vote`)
    .set('Authorization', `Bearer ${tech1Token}`);

  expect(res.status).toBe(400);
});
