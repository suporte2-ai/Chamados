const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');

const ids = { sectors: [], roles: [], users: [], ideas: [], comments: [] };
let authorToken, otherToken, moderatorToken;
let ideaId;

beforeAll(async () => {
  const sector = await prisma.sector.create({ data: { name: 'Setor IdeaComment Test' } });
  ids.sectors.push(sector.id);

  const authorRole = await prisma.role.create({ data: { name: 'Role IdeaComment Author', level: 1 } });
  ids.roles.push(authorRole.id);

  const modRole = await prisma.role.create({
    data: {
      name: 'Role IdeaComment Mod',
      level: 3,
      permissions: { create: [{ permissionKey: 'manage_ideas', enabled: true }] },
    },
  });
  ids.roles.push(modRole.id);

  const author = await prisma.user.create({
    data: { name: 'Author IdeaComment', email: 'ideacomment-author@example.com', passwordHash: 'h', roleId: authorRole.id, sectorId: sector.id },
  });
  ids.users.push(author.id);
  authorToken = signAccessToken(author.id);

  const other = await prisma.user.create({
    data: { name: 'Other IdeaComment', email: 'ideacomment-other@example.com', passwordHash: 'h', roleId: authorRole.id, sectorId: sector.id },
  });
  ids.users.push(other.id);
  otherToken = signAccessToken(other.id);

  const moderator = await prisma.user.create({
    data: { name: 'Mod IdeaComment', email: 'ideacomment-mod@example.com', passwordHash: 'h', roleId: modRole.id, sectorId: sector.id },
  });
  ids.users.push(moderator.id);
  moderatorToken = signAccessToken(moderator.id);

  const idea = await prisma.idea.create({
    data: {
      title: 'Ideia para comentar',
      description: 'Desc',
      areaImpacted: 'TI',
      expectedBenefit: 'Melhoria',
      authorId: author.id,
      status: 'EM_ANALISE',
    },
  });
  ids.ideas.push(idea.id);
  ideaId = idea.id;
});

afterAll(async () => {
  await prisma.ideaComment.deleteMany({ where: { id: { in: ids.comments } } });
  await prisma.idea.deleteMany({ where: { id: { in: ids.ideas } } });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  await prisma.role.deleteMany({ where: { id: { in: ids.roles } } });
  await prisma.sector.deleteMany({ where: { id: { in: ids.sectors } } });
  await prisma.$disconnect();
});

test('POST /ideas/:id/comments cria comentário e retorna author.name', async () => {
  const res = await request(app)
    .post(`/api/ideas/${ideaId}/comments`)
    .set('Authorization', `Bearer ${authorToken}`)
    .send({ body: 'Comentário de teste' });
  expect(res.status).toBe(201);
  expect(res.body.body).toBe('Comentário de teste');
  expect(res.body.author).toBeDefined();
  expect(typeof res.body.author.name).toBe('string');
  ids.comments.push(res.body.id);
});

test('POST /ideas/:id/comments com body vazio retorna 400', async () => {
  const res = await request(app)
    .post(`/api/ideas/${ideaId}/comments`)
    .set('Authorization', `Bearer ${authorToken}`)
    .send({ body: '   ' });
  expect(res.status).toBe(400);
});

test('GET /ideas/:id inclui array comments na resposta', async () => {
  const res = await request(app)
    .get(`/api/ideas/${ideaId}`)
    .set('Authorization', `Bearer ${authorToken}`);
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body.comments)).toBe(true);
  expect(res.body.comments.length).toBeGreaterThanOrEqual(1);
  expect(res.body.comments[0].author).toBeDefined();
});

test('DELETE /ideas/:id/comments/:cid pelo próprio autor retorna 204', async () => {
  const createRes = await request(app)
    .post(`/api/ideas/${ideaId}/comments`)
    .set('Authorization', `Bearer ${authorToken}`)
    .send({ body: 'Para excluir' });
  const cid = createRes.body.id;

  const res = await request(app)
    .delete(`/api/ideas/${ideaId}/comments/${cid}`)
    .set('Authorization', `Bearer ${authorToken}`);
  expect(res.status).toBe(204);
});

test('DELETE /ideas/:id/comments/:cid por outro usuário retorna 403', async () => {
  const createRes = await request(app)
    .post(`/api/ideas/${ideaId}/comments`)
    .set('Authorization', `Bearer ${authorToken}`)
    .send({ body: 'Não pode excluir' });
  ids.comments.push(createRes.body.id);

  const res = await request(app)
    .delete(`/api/ideas/${ideaId}/comments/${createRes.body.id}`)
    .set('Authorization', `Bearer ${otherToken}`);
  expect(res.status).toBe(403);
});

test('DELETE /ideas/:id/comments/:cid por moderador (manage_ideas) retorna 204', async () => {
  const createRes = await request(app)
    .post(`/api/ideas/${ideaId}/comments`)
    .set('Authorization', `Bearer ${authorToken}`)
    .send({ body: 'Moderador pode excluir' });

  const res = await request(app)
    .delete(`/api/ideas/${ideaId}/comments/${createRes.body.id}`)
    .set('Authorization', `Bearer ${moderatorToken}`);
  expect(res.status).toBe(204);
});

test('DELETE /ideas/:id/comments/:cid comentário inexistente retorna 404', async () => {
  const res = await request(app)
    .delete(`/api/ideas/${ideaId}/comments/9999999`)
    .set('Authorization', `Bearer ${authorToken}`);
  expect(res.status).toBe(404);
});

test('DELETE /ideas/:id/comments/:cid com ideaId errado retorna 404', async () => {
  // Create a second idea to use as the wrong parent
  const wrongIdea = await prisma.idea.create({
    data: {
      title: 'Ideia errada',
      description: 'Desc',
      areaImpacted: 'TI',
      expectedBenefit: 'Test',
      authorId: ids.users[0],
      status: 'EM_ANALISE',
    },
  });
  ids.ideas.push(wrongIdea.id);

  // Create a comment on the correct idea
  const createRes = await request(app)
    .post(`/api/ideas/${ideaId}/comments`)
    .set('Authorization', `Bearer ${authorToken}`)
    .send({ body: 'Comentário para cross-val' });
  ids.comments.push(createRes.body.id);

  // Try to delete it via the wrong idea's URL
  const res = await request(app)
    .delete(`/api/ideas/${wrongIdea.id}/comments/${createRes.body.id}`)
    .set('Authorization', `Bearer ${authorToken}`);
  expect(res.status).toBe(404);
});
