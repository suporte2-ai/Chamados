const prisma = require('../src/lib/prisma');

let sector;
let role;
let author;
let voter;

beforeAll(async () => {
  sector = await prisma.sector.create({ data: { name: 'Sector Teste Ideas' } });
  role = await prisma.role.create({ data: { name: 'Role Teste Ideas', level: 1 } });
  author = await prisma.user.create({
    data: {
      name: 'Autor Teste',
      email: 'autor.ideas@example.com',
      passwordHash: 'hash',
      roleId: role.id,
      sectorId: sector.id,
    },
  });
  voter = await prisma.user.create({
    data: {
      name: 'Votante Teste',
      email: 'votante.ideas@example.com',
      passwordHash: 'hash',
      roleId: role.id,
      sectorId: sector.id,
    },
  });
});

afterAll(async () => {
  await prisma.ideaComment.deleteMany();
  await prisma.ideaVote.deleteMany();
  await prisma.idea.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await prisma.sector.deleteMany();
  await prisma.$disconnect();
});

test('creates an idea with default status NOVA', async () => {
  const idea = await prisma.idea.create({
    data: {
      title: 'Base de conhecimento self-service',
      description: 'Reduz chamados repetitivos',
      areaImpacted: 'TI',
      expectedBenefit: 'Menos chamados de dúvidas recorrentes',
      authorId: author.id,
    },
  });

  expect(idea.status).toBe('NOVA');
  expect(idea.isAnonymous).toBe(false);
});

test('enforces one vote per user per idea', async () => {
  const idea = await prisma.idea.create({
    data: {
      title: 'App de abertura de chamados via celular',
      description: 'Facilita abertura em campo',
      areaImpacted: 'TI',
      expectedBenefit: 'Mais agilidade',
      authorId: author.id,
    },
  });

  await prisma.ideaVote.create({ data: { ideaId: idea.id, userId: voter.id } });

  await expect(
    prisma.ideaVote.create({ data: { ideaId: idea.id, userId: voter.id } })
  ).rejects.toThrow();
});

test('adds a feedback comment to an idea', async () => {
  const idea = await prisma.idea.create({
    data: {
      title: 'Checklist de onboarding',
      description: 'Reduz erros na admissão',
      areaImpacted: 'RH',
      expectedBenefit: 'Onboarding mais consistente',
      authorId: author.id,
      status: 'EM_ANALISE',
    },
  });

  const comment = await prisma.ideaComment.create({
    data: { ideaId: idea.id, authorId: voter.id, body: 'Boa ideia, vamos analisar com RH.' },
  });

  expect(comment.ideaId).toBe(idea.id);
});
