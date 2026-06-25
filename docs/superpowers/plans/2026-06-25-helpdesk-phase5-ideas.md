# Fase 5 — Módulo de Ideias e Sugestões — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar a API do canal interno de sugestões de melhoria de processos com fluxo de triagem, votação e decisão final.

**Architecture:** Módulo `ideas` com controller + routes seguindo o padrão dos módulos existentes. Visibilidade controlada: ideias `NOVA` são privadas (só autor + `manage_ideas`); demais status são públicas. Toggle de voto atômico via compound unique index. Migration aditiva adiciona `managerNote` ao modelo `Idea` já existente no banco.

**Tech Stack:** Node.js + Express 4 + Prisma 5 + PostgreSQL + Jest + Supertest

## Global Constraints

- Per-route auth: `const auth = [asyncHandler(authenticate), requirePermission('manage_ideas')]` spread por rota — nunca `router.use()`
- Visibilidade: `NOVA` → só autor + `manage_ideas`; outros status → todos autenticados
- Votar só é permitido em ideias com status `EM_ANALISE`
- Ordem de verificações em `toggleVote`: 404 → 403 → 400 (status errado)
- `isAnonymous === true`: `authorId` e `authorName` retornam `null` para quem não tem `manage_ideas`
- `voteCount`: calculado via `_count.votes` (sem N+1); `userHasVoted`: via `include: { votes: { where: { userId } } }`
- `status` query param em `GET /api/ideas` deve ser validado contra enum — valor inválido → 400
- Tabela no banco: `"ideas"`, `"idea_votes"` (já existem — migration `20260622181545_add_ideas`)
- Testes contra Postgres real (sem mocks), `jest --runInBand`
- Diretório de trabalho: `C:/Users/Marcelo/Desktop/CHAMADOS`

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---------|------|-----------------|
| `backend/src/lib/permissions.js` | Modificar | Adicionar `'manage_ideas'` ao array `PERMISSION_KEYS` |
| `backend/prisma/seed.js` | Modificar | Adicionar `'manage_ideas'` à lista do Gestor no `rolePermissionMatrix` |
| `backend/prisma/schema.prisma` | Modificar | Adicionar `managerNote String?` ao model `Idea` |
| `backend/src/modules/ideas/ideas.controller.js` | Criar | Funções `create`, `list`, `detail`, `updateStatus`, `toggleVote` |
| `backend/src/modules/ideas/ideas.routes.js` | Criar | 5 rotas com per-route auth |
| `backend/src/server.js` | Modificar | `app.use('/api', ideasRoutes)` |
| `backend/tests/ideas-api.test.js` | Criar | 13 testes de integração |

---

### Task 1: Permissão + migration

**Files:**
- Modify: `backend/src/lib/permissions.js`
- Modify: `backend/prisma/seed.js`
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**
- Produces: permissão `'manage_ideas'` disponível no sistema; campo `managerNote` no model `Idea`

- [ ] **Step 1: Adicionar manage_ideas a PERMISSION_KEYS**

Em `backend/src/lib/permissions.js`, adicionar `'manage_ideas'` ao final do array `PERMISSION_KEYS`:

```js
const PERMISSION_KEYS = [
  'manage_users',
  'manage_roles',
  'manage_categories',
  'manage_sla',
  'view_performance_panel',
  'view_financial_reports',
  'reassign_tickets',
  'close_tickets',
  'view_internal_notes',
  'view_own_metrics',
  'reopen_tickets',
  'view_all_tickets',
  'view_sector_tickets',
  'update_cost',
  'manage_ideas',
];
```

- [ ] **Step 2: Adicionar manage_ideas ao Gestor no seed.js**

Em `backend/prisma/seed.js`, adicionar `'manage_ideas'` à lista do Gestor no `rolePermissionMatrix`:

```js
[gestor.id]: [
  'view_performance_panel',
  'view_financial_reports',
  'reassign_tickets',
  'close_tickets',
  'view_internal_notes',
  'reopen_tickets',
  'view_all_tickets',
  'update_cost',
  'manage_ideas',
],
```

- [ ] **Step 3: Adicionar managerNote ao schema**

Em `backend/prisma/schema.prisma`, adicionar `managerNote String?` ao model `Idea` após o campo `status`:

```prisma
model Idea {
  id              Int        @id @default(autoincrement())
  title           String
  description     String
  areaImpacted    String
  expectedBenefit String
  authorId        Int
  isAnonymous     Boolean    @default(false)
  status          IdeaStatus @default(NOVA)
  managerNote     String?
  createdAt       DateTime   @default(now())

  author   User          @relation(fields: [authorId], references: [id])
  votes    IdeaVote[]
  comments IdeaComment[]

  @@map("ideas")
}
```

- [ ] **Step 4: Rodar a migration**

```bash
cd backend
npx prisma migrate dev --name add_idea_manager_note
```

Expected output: `Your database is now in sync with your schema.`

- [ ] **Step 5: Re-executar o seed para criar RolePermission de manage_ideas**

```bash
npm run seed
```

Expected: seed executado sem erros.

- [ ] **Step 6: Verificar que a permissão está no banco**

```bash
node -e "const { PERMISSION_KEYS } = require('./src/lib/permissions'); console.log(PERMISSION_KEYS.includes('manage_ideas'));"
```

Expected: `true`

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/Marcelo/Desktop/CHAMADOS"
git add backend/src/lib/permissions.js backend/prisma/seed.js backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat: add manage_ideas permission and managerNote field to Idea"
```

---

### Task 2: API de ideias (controller + routes + testes)

**Files:**
- Create: `backend/src/modules/ideas/ideas.controller.js`
- Create: `backend/src/modules/ideas/ideas.routes.js`
- Modify: `backend/src/server.js`
- Test: `backend/tests/ideas-api.test.js` (14 testes — 13 do spec §8 + 1 para `status=INVALIDO` dos Global Constraints)

**Interfaces:**
- Consumes:
  - `prisma` de `../../lib/prisma`
  - `authenticate` de `../../middleware/authenticate` — seta `req.user = { id, permissions: Set<string>, ... }`
  - `requirePermission` de `../../middleware/requirePermission`
  - `asyncHandler` de `../../lib/asyncHandler`
  - `signAccessToken(userId)` de `../src/lib/jwt` (apenas nos testes)
- Produces:
  - `GET /api/ideas` → array de ideias serializadas
  - `POST /api/ideas` → ideia criada (201)
  - `GET /api/ideas/:id` → detalhe
  - `PATCH /api/ideas/:id/status` → ideia atualizada
  - `POST /api/ideas/:id/vote` → `{ voted: boolean, voteCount: number }`

- [ ] **Step 1: Criar o arquivo de testes**

Criar `backend/tests/ideas-api.test.js`:

```js
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
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd backend
npx jest tests/ideas-api.test.js --no-coverage --runInBand
```

Expected: FAIL — rotas `/api/ideas` retornam 404.

- [ ] **Step 3: Criar ideas.controller.js**

Criar `backend/src/modules/ideas/ideas.controller.js`:

```js
const prisma = require('../../lib/prisma');

const IDEA_STATUSES = ['NOVA', 'EM_ANALISE', 'APROVADA', 'EM_IMPLEMENTACAO', 'IMPLEMENTADA', 'ARQUIVADA'];

const VALID_TRANSITIONS = {
  NOVA: ['EM_ANALISE', 'ARQUIVADA'],
  EM_ANALISE: ['APROVADA', 'ARQUIVADA'],
  APROVADA: ['EM_IMPLEMENTACAO', 'ARQUIVADA'],
  EM_IMPLEMENTACAO: ['IMPLEMENTADA', 'ARQUIVADA'],
};

function visibilityWhere(user) {
  if (user.permissions.has('manage_ideas')) return {};
  return { OR: [{ authorId: user.id }, { status: { not: 'NOVA' } }] };
}

function serialize(idea, userId, hasManageIdeas) {
  const showAuthor = !idea.isAnonymous || hasManageIdeas;
  return {
    id: idea.id,
    title: idea.title,
    description: idea.description,
    areaImpacted: idea.areaImpacted,
    expectedBenefit: idea.expectedBenefit,
    isAnonymous: idea.isAnonymous,
    status: idea.status,
    managerNote: idea.managerNote ?? null,
    authorId: showAuthor ? idea.authorId : null,
    authorName: showAuthor ? (idea.author?.name ?? null) : null,
    voteCount: idea._count?.votes ?? 0,
    userHasVoted: Array.isArray(idea.votes) ? idea.votes.some((v) => v.userId === userId) : false,
    createdAt: idea.createdAt,
  };
}

const ideaInclude = (userId) => ({
  author: { select: { name: true } },
  _count: { select: { votes: true } },
  votes: { where: { userId }, select: { userId: true } },
});

async function create(req, res) {
  const { title, description, areaImpacted, expectedBenefit, isAnonymous } = req.body;
  if (!title || !description || !areaImpacted || !expectedBenefit) {
    return res.status(400).json({ error: 'title, description, areaImpacted e expectedBenefit são obrigatórios.' });
  }

  const idea = await prisma.idea.create({
    data: {
      title,
      description,
      areaImpacted,
      expectedBenefit,
      isAnonymous: Boolean(isAnonymous),
      authorId: req.user.id,
    },
    include: ideaInclude(req.user.id),
  });

  res.status(201).json(serialize(idea, req.user.id, req.user.permissions.has('manage_ideas')));
}

async function list(req, res) {
  const { status } = req.query;
  if (status && !IDEA_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status inválido. Valores aceitos: ${IDEA_STATUSES.join(', ')}.` });
  }

  const where = {
    ...visibilityWhere(req.user),
    ...(status ? { status } : {}),
  };

  const ideas = await prisma.idea.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: ideaInclude(req.user.id),
  });

  const hasManageIdeas = req.user.permissions.has('manage_ideas');
  res.json(ideas.map((i) => serialize(i, req.user.id, hasManageIdeas)));
}

async function detail(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'id deve ser um número inteiro positivo.' });
  }

  const idea = await prisma.idea.findUnique({
    where: { id },
    include: ideaInclude(req.user.id),
  });

  if (!idea) return res.status(404).json({ error: 'Ideia não encontrada.' });

  const hasManageIdeas = req.user.permissions.has('manage_ideas');
  if (idea.status === 'NOVA' && idea.authorId !== req.user.id && !hasManageIdeas) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }

  res.json(serialize(idea, req.user.id, hasManageIdeas));
}

async function updateStatus(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'id deve ser um número inteiro positivo.' });
  }

  const { status, managerNote } = req.body;
  if (!status) return res.status(400).json({ error: 'O campo status é obrigatório.' });
  if (!IDEA_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status inválido. Valores aceitos: ${IDEA_STATUSES.join(', ')}.` });
  }

  const idea = await prisma.idea.findUnique({ where: { id } });
  if (!idea) return res.status(404).json({ error: 'Ideia não encontrada.' });

  const allowed = VALID_TRANSITIONS[idea.status] ?? [];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `Transição de status não permitida: ${idea.status} → ${status}.` });
  }

  const updated = await prisma.idea.update({
    where: { id },
    data: { status, ...(managerNote !== undefined ? { managerNote } : {}) },
    include: ideaInclude(req.user.id),
  });

  res.json(serialize(updated, req.user.id, true));
}

async function toggleVote(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'id deve ser um número inteiro positivo.' });
  }

  const idea = await prisma.idea.findUnique({ where: { id } });
  if (!idea) return res.status(404).json({ error: 'Ideia não encontrada.' });

  const hasManageIdeas = req.user.permissions.has('manage_ideas');
  if (idea.status === 'NOVA' && idea.authorId !== req.user.id && !hasManageIdeas) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }

  if (idea.status !== 'EM_ANALISE') {
    return res.status(400).json({ error: 'Só é possível votar em ideias em análise.' });
  }

  const existing = await prisma.ideaVote.findUnique({
    where: { ideaId_userId: { ideaId: id, userId: req.user.id } },
  });

  if (existing) {
    await prisma.ideaVote.delete({ where: { id: existing.id } });
  } else {
    await prisma.ideaVote.create({ data: { ideaId: id, userId: req.user.id } });
  }

  const voteCount = await prisma.ideaVote.count({ where: { ideaId: id } });
  res.json({ voted: !existing, voteCount });
}

module.exports = { create, list, detail, updateStatus, toggleVote };
```

- [ ] **Step 4: Criar ideas.routes.js**

Criar `backend/src/modules/ideas/ideas.routes.js`:

```js
const express = require('express');
const authenticate = require('../../middleware/authenticate');
const requirePermission = require('../../middleware/requirePermission');
const asyncHandler = require('../../lib/asyncHandler');
const controller = require('./ideas.controller');

const router = express.Router();

const authenticated = asyncHandler(authenticate);
const auth = [asyncHandler(authenticate), requirePermission('manage_ideas')];

router.post('/ideas', authenticated, asyncHandler(controller.create));
router.get('/ideas', authenticated, asyncHandler(controller.list));
router.get('/ideas/:id', authenticated, asyncHandler(controller.detail));
router.patch('/ideas/:id/status', ...auth, asyncHandler(controller.updateStatus));
router.post('/ideas/:id/vote', authenticated, asyncHandler(controller.toggleVote));

module.exports = router;
```

- [ ] **Step 5: Montar as rotas em server.js**

Em `backend/src/server.js`, adicionar após o require de `performanceRoutes`:

```js
const ideasRoutes = require('./modules/ideas/ideas.routes');
```

E após `app.use('/api', performanceRoutes);`:

```js
app.use('/api', ideasRoutes);
```

- [ ] **Step 6: Rodar os testes de integração**

```bash
cd backend
npx jest tests/ideas-api.test.js --no-coverage --runInBand
```

Expected: PASS (13 testes).

- [ ] **Step 7: Rodar a suite completa**

```bash
npm test -- --runInBand
```

Expected: todas as suítes passam (o 1 failure pré-existente em `ticket-core.test.js` é de contaminação de DB — não relacionado a esta fase).

- [ ] **Step 8: Commit**

```bash
cd "C:/Users/Marcelo/Desktop/CHAMADOS"
git add backend/src/modules/ideas backend/src/server.js backend/tests/ideas-api.test.js
git commit -m "feat: add ideas API (create, list, detail, status, vote)"
```
