# Phase 10 — Polish, Comentários em Ideias e Perfil de Usuário — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enriquecer a API de tickets com nomes reais, adicionar comentários a ideias e criar a página de perfil com edição de nome, senha e e-mail com verificação por link.

**Architecture:** Três subsistemas independentes implementados em ordem: (1) backend ticket enrichment via Prisma include, (2) IdeaComment CRUD no backend/frontend, (3) ProfilePage + EmailChangeToken flow. O `IdeaComment` model já existe no schema — só a tabela `EmailChangeToken` requer migration.

**Tech Stack:** Node.js + Express + Prisma + PostgreSQL (porta 4000) · React 18 + Vite 5 + Tailwind CSS 3 + shadcn/ui + React Router v6 + Zustand 4 + TanStack Query v5 + Axios 1 · Jest + Supertest (backend) · Vitest + Testing Library (frontend)

## Global Constraints

- Backend: porta 4000, módulos em `backend/src/modules/<nome>/`, testes em `backend/tests/`
- Frontend: componentes shadcn/ui em `@/components/ui/`, API client em `@/api/`, páginas em `@/pages/`
- Padrão de API client: `export const xApi = { method: (params) => api.verb('/path').then(r => r.data) }`
- Erros: `toast.error(err.response?.data?.error || 'mensagem padrão')`
- Testes de backend: `beforeAll` cria fixtures com nomes únicos de setor/role/usuário; `afterAll` deleta em ordem reversa de FK
- Nunca usar `--force-reset` no banco de dados de desenvolvimento/produção

---

## Task 1: Database migration — EmailChangeToken

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_add_email_change_token/` (gerada automaticamente)

**Interfaces:**
- Produces: model `EmailChangeToken` no Prisma client; relação `emailChangeTokens` no model `User`

- [ ] **Step 1: Adicionar o model `EmailChangeToken` e a relação inversa no User**

Abrir `backend/prisma/schema.prisma`. Localizar o model `User` (linha ~58). Adicionar `emailChangeTokens EmailChangeToken[]` após `notifications Notification[]`:

```prisma
// dentro de model User, após "notifications Notification[]"
emailChangeTokens EmailChangeToken[]
```

Ao final do arquivo (após o model `IdeaComment`), adicionar:

```prisma
model EmailChangeToken {
  id        Int       @id @default(autoincrement())
  userId    Int
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  newEmail  String
  token     String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  reason    String?
  createdAt DateTime  @default(now())

  @@map("email_change_tokens")
}
```

- [ ] **Step 2: Rodar a migration**

```bash
cd backend
npx prisma migrate dev --name add_email_change_token
```

Saída esperada: `The following migration(s) have been applied: ... add_email_change_token`

- [ ] **Step 3: Regenerar o Prisma Client**

```bash
cd backend
npx prisma generate
```

Saída esperada: `Generated Prisma Client ...`

- [ ] **Step 4: Verificar que os testes existentes ainda passam**

```bash
cd backend
npx jest --runInBand --testPathPattern="auth.test" 2>&1 | tail -5
```

Saída esperada: `Tests: X passed`

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat: add EmailChangeToken migration for email change verification"
```

---

## Task 2: Backend — Ticket API enrichment

**Files:**
- Modify: `backend/src/modules/tickets/tickets.controller.js`
- Modify: `backend/tests/ticket-detail-extensions.test.js`

**Interfaces:**
- Consumes: Prisma relations `requester`, `sector`, `assignedTo` (já existem no schema `Ticket`)
- Produces: `GET /api/tickets` items include `sector: { name }`. `GET /api/tickets/:id` includes `requester: { id, name }`, `sector: { name }`, `assignedTo: { id, name }`, comments include `author: { id, name }`

- [ ] **Step 1: Adicionar testes que falham**

Abrir `backend/tests/ticket-detail-extensions.test.js`. Adicionar ao final do arquivo (após o último `test(...)`) os seguintes testes:

```js
test('GET /api/tickets retorna sector.name na listagem', async () => {
  const res = await request(app)
    .get('/api/tickets')
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  const item = res.body.items.find((t) => t.id === ticket.id);
  expect(item).toBeDefined();
  expect(item.sector).toBeDefined();
  expect(typeof item.sector.name).toBe('string');
});

test('GET /api/tickets/:id retorna requester.name, sector.name e assignedTo null', async () => {
  const res = await request(app)
    .get(`/api/tickets/${ticket.id}`)
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.requester).toBeDefined();
  expect(typeof res.body.requester.name).toBe('string');
  expect(res.body.sector).toBeDefined();
  expect(typeof res.body.sector.name).toBe('string');
  expect(res.body.assignedTo).toBeNull();
});

test('GET /api/tickets/:id retorna author.name em cada comentário', async () => {
  // Criar um comentário via API para garantir que há ao menos um
  const ids_local = { roles: [], users: [], comments: [] };
  const commentRole = await prisma.role.create({ data: { name: 'Role Ext Comment', level: 1 } });
  ids_local.roles.push(commentRole.id);
  const commentUser = await prisma.user.create({
    data: { name: 'User Ext Comment', email: 'ext-comment@example.com', passwordHash: 'h', roleId: commentRole.id, sectorId: ids.sectors[0] },
  });
  ids_local.users.push(commentUser.id);
  const commentToken = signAccessToken(commentUser.id);

  const commentRes = await request(app)
    .post(`/api/tickets/${ticket.id}/comments`)
    .set('Authorization', `Bearer ${commentToken}`)
    .send({ body: 'Teste de enriquecimento', isInternal: false });
  expect(commentRes.status).toBe(201);

  const res = await request(app)
    .get(`/api/tickets/${ticket.id}`)
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);

  const enrichedComment = res.body.comments.find((c) => c.body === 'Teste de enriquecimento');
  expect(enrichedComment).toBeDefined();
  expect(enrichedComment.author).toBeDefined();
  expect(typeof enrichedComment.author.name).toBe('string');

  // cleanup
  await prisma.ticketComment.deleteMany({ where: { ticketId: ticket.id } });
  await prisma.user.deleteMany({ where: { id: { in: ids_local.users } } });
  await prisma.role.deleteMany({ where: { id: { in: ids_local.roles } } });
});
```

- [ ] **Step 2: Rodar os testes novos para confirmar que falham**

```bash
cd backend
npx jest --runInBand --testPathPattern="ticket-detail-extensions" 2>&1 | tail -15
```

Saída esperada: `● GET /api/tickets retorna sector.name na listagem` (failing — `sector` is undefined)

- [ ] **Step 3: Implementar o enriquecimento em `tickets.controller.js`**

Abrir `backend/src/modules/tickets/tickets.controller.js`.

**3a — `list` function (linha ~90): adicionar `include` ao `findMany`:**

```js
// Antes:
const [items, total] = await Promise.all([
  prisma.ticket.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
  prisma.ticket.count({ where }),
]);

// Depois:
const [items, total] = await Promise.all([
  prisma.ticket.findMany({
    where,
    orderBy,
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: { sector: { select: { name: true } } },
  }),
  prisma.ticket.count({ where }),
]);
```

**3b — `detail` function (linha ~100): adicionar `include` ao `findUnique`:**

```js
// Antes:
const ticket = await prisma.ticket.findUnique({ where: { id } });

// Depois:
const ticket = await prisma.ticket.findUnique({
  where: { id },
  include: {
    requester: { select: { id: true, name: true } },
    sector: { select: { name: true } },
    assignedTo: { select: { id: true, name: true } },
  },
});
```

**3c — ainda em `detail` (linha ~112): adicionar `include` ao `ticketComment.findMany`:**

```js
// Antes:
prisma.ticketComment.findMany({
  where: {
    ticketId: id,
    ...(req.user.permissions.has('view_internal_notes') ? {} : { isInternal: false }),
  },
  orderBy: { createdAt: 'asc' },
}),

// Depois:
prisma.ticketComment.findMany({
  where: {
    ticketId: id,
    ...(req.user.permissions.has('view_internal_notes') ? {} : { isInternal: false }),
  },
  orderBy: { createdAt: 'asc' },
  include: { author: { select: { id: true, name: true } } },
}),
```

- [ ] **Step 4: Rodar os testes para confirmar que passam**

```bash
cd backend
npx jest --runInBand --testPathPattern="ticket-detail-extensions" 2>&1 | tail -10
```

Saída esperada: `Tests: X passed, 0 failed`

- [ ] **Step 5: Rodar a suíte completa para verificar regressão**

```bash
cd backend
npx jest --runInBand 2>&1 | tail -5
```

Saída esperada: todos os testes passam (pode haver 1 falha pré-existente em `ticket-core.test.js` quando em suite completa — essa falha existia antes desta tarefa).

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/tickets/tickets.controller.js backend/tests/ticket-detail-extensions.test.js
git commit -m "feat: enrich ticket list/detail API with requester, sector and comment author names"
```

---

## Task 3: Backend — Idea Comments

**Files:**
- Modify: `backend/src/modules/ideas/ideas.controller.js`
- Modify: `backend/src/modules/ideas/ideas.routes.js`
- Create: `backend/tests/idea-comments.test.js`

**Interfaces:**
- Produces: `POST /api/ideas/:id/comments` → 201 `{ id, ideaId, authorId, body, createdAt, author: { id, name } }` · `DELETE /api/ideas/:id/comments/:cid` → 204 · `GET /api/ideas/:id` now includes `comments: [...]`

- [ ] **Step 1: Criar o arquivo de teste**

Criar `backend/tests/idea-comments.test.js`:

```js
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
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

```bash
cd backend
npx jest --runInBand --testPathPattern="idea-comments" 2>&1 | tail -10
```

Saída esperada: falhas (rotas não existem ainda).

- [ ] **Step 3: Implementar `addComment` e `deleteComment` em `ideas.controller.js`**

Abrir `backend/src/modules/ideas/ideas.controller.js`. Adicionar antes de `module.exports`:

```js
async function addComment(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'id deve ser um número inteiro positivo.' });
  }

  const { body } = req.body;
  if (!body || !body.trim()) {
    return res.status(400).json({ error: 'body é obrigatório.' });
  }

  const idea = await prisma.idea.findUnique({ where: { id } });
  if (!idea) return res.status(404).json({ error: 'Ideia não encontrada.' });

  const comment = await prisma.ideaComment.create({
    data: { ideaId: id, authorId: req.user.id, body: body.trim() },
    include: { author: { select: { id: true, name: true } } },
  });

  res.status(201).json(comment);
}

async function deleteComment(req, res) {
  const cid = Number(req.params.cid);
  if (!Number.isInteger(cid) || cid <= 0) {
    return res.status(400).json({ error: 'cid deve ser um número inteiro positivo.' });
  }

  const comment = await prisma.ideaComment.findUnique({ where: { id: cid } });
  if (!comment) return res.status(404).json({ error: 'Comentário não encontrado.' });

  const hasManageIdeas = req.user.permissions.has('manage_ideas');
  if (comment.authorId !== req.user.id && !hasManageIdeas) {
    return res.status(403).json({ error: 'Você não pode excluir este comentário.' });
  }

  await prisma.ideaComment.delete({ where: { id: cid } });
  res.status(204).send();
}
```

- [ ] **Step 4: Atualizar `detail` para incluir comentários**

Na função `detail` em `ideas.controller.js`, substituir a linha `res.json(...)` pelo bloco:

```js
// Antes:
res.json(serialize(idea, req.user.id, hasManageIdeas));

// Depois:
const comments = await prisma.ideaComment.findMany({
  where: { ideaId: id },
  orderBy: { createdAt: 'asc' },
  include: { author: { select: { id: true, name: true } } },
});

res.json({ ...serialize(idea, req.user.id, hasManageIdeas), comments });
```

- [ ] **Step 5: Atualizar `module.exports` em `ideas.controller.js`**

```js
// Antes:
module.exports = { create, list, detail, updateStatus, toggleVote };

// Depois:
module.exports = { create, list, detail, updateStatus, toggleVote, addComment, deleteComment };
```

- [ ] **Step 6: Registrar as rotas em `ideas.routes.js`**

Abrir `backend/src/modules/ideas/ideas.routes.js`. Adicionar antes de `module.exports = router`:

```js
router.post('/ideas/:id/comments', authenticated, asyncHandler(controller.addComment));
router.delete('/ideas/:id/comments/:cid', authenticated, asyncHandler(controller.deleteComment));
```

- [ ] **Step 7: Rodar os testes para confirmar que passam**

```bash
cd backend
npx jest --runInBand --testPathPattern="idea-comments" 2>&1 | tail -10
```

Saída esperada: `Tests: 6 passed, 0 failed`

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/ideas/ideas.controller.js backend/src/modules/ideas/ideas.routes.js backend/tests/idea-comments.test.js
git commit -m "feat: add idea comments endpoints (POST/DELETE) and include in detail response"
```

---

## Task 4: Backend — Profile endpoints

**Files:**
- Modify: `backend/src/modules/auth/auth.controller.js`
- Modify: `backend/src/modules/auth/auth.routes.js`
- Create: `backend/tests/profile-api.test.js`

**Interfaces:**
- Produces:
  - `PATCH /api/auth/me` (authenticated) body `{ name?, currentPassword?, newPassword? }` → 200 `{ id, name, email, roleId, sectorId }`
  - `POST /api/auth/request-email-change` (authenticated) body `{ newEmail }` → 200 `{ message }`
  - `GET /api/auth/confirm-email-change/:token` (public) → 200 `{ message }` or 400 `{ error }`

- [ ] **Step 1: Criar o arquivo de testes**

Criar `backend/tests/profile-api.test.js`:

```js
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');

const ids = { sectors: [], roles: [], users: [], tokens: [] };
let userToken;
let userId;
const PLAIN_PASSWORD = 'SenhaProfile1!';

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
  // usar o próprio e-mail como "novo" (já em uso pelo mesmo usuário conta como "em uso")
  const res = await request(app)
    .post('/api/auth/request-email-change')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ newEmail: 'profile-test@example.com' });
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
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

```bash
cd backend
npx jest --runInBand --testPathPattern="profile-api" 2>&1 | tail -10
```

Saída esperada: falhas (rotas não existem ainda).

- [ ] **Step 3: Implementar os três novos handlers em `auth.controller.js`**

Abrir `backend/src/modules/auth/auth.controller.js`. Adicionar os novos handlers antes de `module.exports`:

```js
async function updateMe(req, res) {
  const { name, currentPassword, newPassword } = req.body;
  const changingName = name !== undefined;
  const changingPassword = currentPassword !== undefined && newPassword !== undefined;

  if (!changingName && !changingPassword) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar.' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const data = {};

  if (changingName) {
    if (!name.trim()) return res.status(400).json({ error: 'Nome não pode ser vazio.' });
    data.name = name.trim();
  }

  if (changingPassword) {
    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) return res.status(400).json({ error: 'Senha atual incorreta.' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Nova senha deve ter ao menos 8 caracteres.' });
    data.passwordHash = await bcrypt.hash(newPassword, 10);
  }

  const updated = await prisma.user.update({ where: { id: req.user.id }, data });
  res.json({ id: updated.id, name: updated.name, email: updated.email, roleId: updated.roleId, sectorId: updated.sectorId });
}

async function requestEmailChange(req, res) {
  const { newEmail } = req.body;
  if (!newEmail || !newEmail.includes('@')) {
    return res.status(400).json({ error: 'E-mail inválido.' });
  }

  const existing = await prisma.user.findFirst({
    where: { email: { equals: newEmail, mode: 'insensitive' } },
  });
  if (existing) {
    return res.status(409).json({ error: 'Este e-mail já está em uso.' });
  }

  await prisma.emailChangeToken.updateMany({
    where: { userId: req.user.id, usedAt: null },
    data: { usedAt: new Date(), reason: 'superseded' },
  });

  const token = crypto.randomUUID();
  await prisma.emailChangeToken.create({
    data: {
      userId: req.user.id,
      newEmail,
      token,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });

  const confirmLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/confirmar-email/${token}`;
  console.log(`Link de confirmação de e-mail para ${newEmail}: ${confirmLink}`);

  res.json({ message: `Link de confirmação enviado para ${newEmail}.` });
}

async function confirmEmailChange(req, res) {
  const { token } = req.params;

  const emailToken = await prisma.emailChangeToken.findUnique({ where: { token } });
  if (!emailToken) {
    return res.status(400).json({ error: 'Link inválido.' });
  }
  if (emailToken.expiresAt < new Date()) {
    return res.status(400).json({ error: 'Link expirado.' });
  }
  if (emailToken.usedAt) {
    const msg = emailToken.reason === 'superseded'
      ? 'Este link foi substituído por uma solicitação mais recente.'
      : 'Link já utilizado.';
    return res.status(400).json({ error: msg });
  }

  const alreadyInUse = await prisma.user.findFirst({
    where: { email: { equals: emailToken.newEmail, mode: 'insensitive' }, id: { not: emailToken.userId } },
  });
  if (alreadyInUse) {
    return res.status(409).json({ error: 'Este e-mail já está em uso por outro usuário.' });
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.emailChangeToken.updateMany({
      where: { id: emailToken.id, usedAt: null },
      data: { usedAt: new Date(), reason: 'used' },
    });
    if (updated.count === 0) return null;
    await tx.user.update({ where: { id: emailToken.userId }, data: { email: emailToken.newEmail } });
    return true;
  });

  if (result === null) {
    return res.status(400).json({ error: 'Link já utilizado.' });
  }

  res.json({ message: 'E-mail atualizado com sucesso.' });
}
```

- [ ] **Step 4: Atualizar `module.exports` em `auth.controller.js`**

```js
// Antes:
module.exports = { login, refresh, logout, me, forgotPassword, resetPassword };

// Depois:
module.exports = { login, refresh, logout, me, forgotPassword, resetPassword, updateMe, requestEmailChange, confirmEmailChange };
```

- [ ] **Step 5: Registrar as rotas em `auth.routes.js`**

Abrir `backend/src/modules/auth/auth.routes.js`. Adicionar antes de `module.exports = router`:

```js
router.patch('/me', authenticated, asyncHandler(controller.updateMe));
router.post('/request-email-change', authenticated, asyncHandler(controller.requestEmailChange));
router.get('/confirm-email-change/:token', asyncHandler(controller.confirmEmailChange));
```

- [ ] **Step 6: Rodar os testes para confirmar que passam**

```bash
cd backend
npx jest --runInBand --testPathPattern="profile-api" 2>&1 | tail -15
```

Saída esperada: `Tests: 10 passed, 0 failed`

- [ ] **Step 7: Rodar a suíte completa**

```bash
cd backend
npx jest --runInBand 2>&1 | tail -5
```

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/auth/auth.controller.js backend/src/modules/auth/auth.routes.js backend/tests/profile-api.test.js
git commit -m "feat: add profile endpoints (PATCH /me, email change with token verification)"
```

---

## Task 5: Frontend — Ticket pages (consume enriched data)

**Files:**
- Modify: `frontend/src/pages/tickets/TicketDetailPage.jsx`
- Modify: `frontend/src/pages/tickets/TicketListPage.jsx`

**Interfaces:**
- Consumes: `ticket.requester.name`, `ticket.sector.name`, `ticket.assignedTo?.name`, `c.author.name` (from Task 2)

- [ ] **Step 1: Atualizar `TicketDetailPage.jsx` — campo "Atribuído a" (somente-leitura)**

Localizar linha ~349:

```jsx
// Antes:
<p className="text-gray-700">{ticket.assignedToId ? `Usuário #${ticket.assignedToId}` : '— Não atribuído —'}</p>

// Depois:
<p className="text-gray-700">{ticket.assignedTo?.name ?? '— Não atribuído —'}</p>
```

- [ ] **Step 2: Atualizar `TicketDetailPage.jsx` — campos SOLICITANTE e SETOR**

Localizar linhas ~355-356:

```jsx
// Antes:
{ label: 'SOLICITANTE', value: `Usuário #${ticket.requesterId}` },
{ label: 'SETOR', value: `Setor #${ticket.sectorId}` },

// Depois:
{ label: 'SOLICITANTE', value: ticket.requester?.name ?? '—' },
{ label: 'SETOR', value: ticket.sector?.name ?? '—' },
```

- [ ] **Step 3: Atualizar `TicketDetailPage.jsx` — exibir autor nos comentários**

Localizar o bloco de renderização dos comentários (linha ~186-202). Substituir:

```jsx
// Antes (dentro do .map):
<div key={c.id} className={cn('px-6 py-4', c.isInternal && 'bg-yellow-50')}>
  <div className="flex items-center gap-2 mb-1">
    {c.isInternal && <Lock className="h-3 w-3 text-yellow-600" />}
    <span className="text-xs text-gray-500">{formatDate(c.createdAt)}</span>
    {c.isInternal && <span className="text-xs text-yellow-700 font-medium">Nota interna</span>}
  </div>
  <p className="text-sm text-gray-800 whitespace-pre-wrap">{c.body}</p>
</div>

// Depois:
<div key={c.id} className={cn('px-6 py-4', c.isInternal && 'bg-yellow-50')}>
  <div className="flex items-center gap-2 mb-1">
    {c.isInternal && <Lock className="h-3 w-3 text-yellow-600" />}
    <span className="text-xs font-medium text-gray-700">{c.author?.name ?? 'Usuário'}</span>
    <span className="text-xs text-gray-400">·</span>
    <span className="text-xs text-gray-500">{formatDate(c.createdAt)}</span>
    {c.isInternal && <span className="text-xs text-yellow-700 font-medium">Nota interna</span>}
  </div>
  <p className="text-sm text-gray-800 whitespace-pre-wrap">{c.body}</p>
</div>
```

- [ ] **Step 4: Atualizar `TicketListPage.jsx` — coluna Setor**

Localizar linha ~154:

```jsx
// Antes:
<td className="px-4 py-3 text-gray-600 hidden lg:table-cell">{t.sectorId}</td>

// Depois:
<td className="px-4 py-3 text-gray-600 hidden lg:table-cell">{t.sector?.name ?? '—'}</td>
```

- [ ] **Step 5: Verificar visualmente (opcional — se o servidor estiver rodando)**

Navegar para um ticket na lista e no detalhe. Confirmar que aparecem nomes reais em vez de IDs.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/tickets/TicketDetailPage.jsx frontend/src/pages/tickets/TicketListPage.jsx
git commit -m "feat: display real names in ticket list and detail (requester, sector, assignee, comment author)"
```

---

## Task 6: Frontend — Idea comments section

**Files:**
- Modify: `frontend/src/api/ideas.js`
- Modify: `frontend/src/pages/ideas/IdeaDetailPage.jsx`

**Interfaces:**
- Consumes: `idea.comments` array from Task 3 backend
- Produces: comment list with delete button for own comments; textarea + "Comentar" button

- [ ] **Step 1: Adicionar métodos ao API client**

Abrir `frontend/src/api/ideas.js`. Adicionar `addComment` e `deleteComment` ao objeto `ideasApi`:

```js
// Antes:
export const ideasApi = {
  list: (params) => api.get('/api/ideas', { params }).then(r => r.data),
  get: (id) => api.get(`/api/ideas/${id}`).then(r => r.data),
  create: (body) => api.post('/api/ideas', body).then(r => r.data),
  updateStatus: (id, body) => api.patch(`/api/ideas/${id}/status`, body).then(r => r.data),
  toggleVote: (id) => api.post(`/api/ideas/${id}/vote`).then(r => r.data),
}

// Depois:
export const ideasApi = {
  list: (params) => api.get('/api/ideas', { params }).then(r => r.data),
  get: (id) => api.get(`/api/ideas/${id}`).then(r => r.data),
  create: (body) => api.post('/api/ideas', body).then(r => r.data),
  updateStatus: (id, body) => api.patch(`/api/ideas/${id}/status`, body).then(r => r.data),
  toggleVote: (id) => api.post(`/api/ideas/${id}/vote`).then(r => r.data),
  addComment: (id, body) => api.post(`/api/ideas/${id}/comments`, { body }).then(r => r.data),
  deleteComment: (ideaId, cid) => api.delete(`/api/ideas/${ideaId}/comments/${cid}`),
}
```

- [ ] **Step 2: Adicionar imports necessários em `IdeaDetailPage.jsx`**

Abrir `frontend/src/pages/ideas/IdeaDetailPage.jsx`. Alterar a linha de imports:

```jsx
// Antes:
import { useState } from 'react'
...
import { ThumbsUp } from 'lucide-react'
...
import { cn } from '@/lib/utils'

// Depois — adicionar à linha do useState:
import { useState } from 'react'
// adicionar useAuthStore:
import { useAuthStore } from '@/stores/authStore'
// adicionar timeAgo na desestruturação de utils:
import { cn, timeAgo } from '@/lib/utils'
```

A linha completa de import de utils fica:
```jsx
import { cn, timeAgo } from '@/lib/utils'
```

Adicionar import de `useAuthStore`:
```jsx
import { useAuthStore } from '@/stores/authStore'
```

- [ ] **Step 3: Adicionar estado e mutations para comentários em `IdeaDetailPage.jsx`**

Logo após `const [savingStatus, setSavingStatus] = useState(false)` (dentro do componente), adicionar:

```jsx
const user = useAuthStore((s) => s.user)
const [commentBody, setCommentBody] = useState('')

const addCommentMutation = useMutation({
  mutationFn: (body) => ideasApi.addComment(id, body),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['ideas', id] })
    setCommentBody('')
  },
  onError: (err) => toast.error(err.response?.data?.error || 'Erro ao comentar.'),
})

const deleteCommentMutation = useMutation({
  mutationFn: (cid) => ideasApi.deleteComment(id, cid),
  onSuccess: () => qc.invalidateQueries({ queryKey: ['ideas', id] }),
  onError: (err) => toast.error(err.response?.data?.error || 'Erro ao excluir comentário.'),
})
```

- [ ] **Step 4: Adicionar seção de comentários no JSX de `IdeaDetailPage.jsx`**

Localizar a linha `<Button variant="outline" size="sm" onClick={() => navigate('/ideas')}>← Voltar às ideias</Button>` (ao final do `return`). Inserir antes dela:

```jsx
{/* Comentários */}
<div className="bg-white border rounded-lg p-6 space-y-4">
  <p className="font-medium text-sm">Comentários ({(idea.comments || []).length})</p>

  {(idea.comments || []).length === 0 ? (
    <p className="text-sm text-gray-400">Seja o primeiro a comentar.</p>
  ) : (
    <div className="divide-y border rounded-lg">
      {(idea.comments || []).map((c) => (
        <div key={c.id} className="px-4 py-3">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs font-medium text-gray-700">{c.author.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">{timeAgo(c.createdAt)}</span>
              {c.author.id === user?.id && (
                <button
                  onClick={() => deleteCommentMutation.mutate(c.id)}
                  disabled={deleteCommentMutation.isPending}
                  className="text-xs text-red-500 hover:underline"
                >
                  Excluir
                </button>
              )}
            </div>
          </div>
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{c.body}</p>
        </div>
      ))}
    </div>
  )}

  <div className="space-y-2">
    <Textarea
      value={commentBody}
      onChange={(e) => setCommentBody(e.target.value)}
      placeholder="Escreva um comentário..."
      rows={3}
    />
    <div className="flex justify-end">
      <Button
        size="sm"
        disabled={!commentBody.trim() || addCommentMutation.isPending}
        onClick={() => addCommentMutation.mutate(commentBody.trim())}
      >
        {addCommentMutation.isPending ? 'Enviando...' : 'Comentar'}
      </Button>
    </div>
  </div>
</div>
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/ideas.js frontend/src/pages/ideas/IdeaDetailPage.jsx
git commit -m "feat: add idea comments section with add/delete support"
```

---

## Task 7: Frontend — ProfilePage + ConfirmEmailChangePage

**Files:**
- Modify: `frontend/src/api/auth.js`
- Create: `frontend/src/pages/ProfilePage.jsx`
- Create: `frontend/src/pages/auth/ConfirmEmailChangePage.jsx`

**Interfaces:**
- Consumes: `authApi.updateMe`, `authApi.requestEmailChange`, `authApi.confirmEmailChange` (definidos aqui)
- Produces: pages at `/perfil` (protected) and `/confirmar-email/:token` (public)

- [ ] **Step 1: Adicionar métodos ao API client de auth**

Abrir `frontend/src/api/auth.js`. Adicionar ao objeto `authApi`:

```js
// Adicionar dentro do objeto authApi, após async me():
updateMe(body) {
  return api.patch('/api/auth/me', body).then(r => r.data)
},
requestEmailChange(newEmail) {
  return api.post('/api/auth/request-email-change', { newEmail }).then(r => r.data)
},
confirmEmailChange(token) {
  return api.get(`/api/auth/confirm-email-change/${token}`).then(r => r.data)
},
```

- [ ] **Step 2: Criar `ProfilePage.jsx`**

Criar `frontend/src/pages/ProfilePage.jsx`:

```jsx
import { useState } from 'react'
import { toast } from 'sonner'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user)
  const setAuth = useAuthStore((s) => s.setAuth)

  const [name, setName] = useState(user?.name ?? '')
  const [savingName, setSavingName] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  const [newEmail, setNewEmail] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)

  const handleSaveName = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSavingName(true)
    try {
      await authApi.updateMe({ name: name.trim() })
      const profile = await authApi.me()
      setAuth(profile)
      toast.success('Nome atualizado.')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar nome.')
    } finally {
      setSavingName(false)
    }
  }

  const handleSavePassword = async (e) => {
    e.preventDefault()
    setPasswordError('')
    if (newPassword.length < 8) {
      setPasswordError('A nova senha deve ter ao menos 8 caracteres.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('As senhas não coincidem.')
      return
    }
    setSavingPassword(true)
    try {
      await authApi.updateMe({ currentPassword, newPassword })
      toast.success('Senha alterada com sucesso.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao alterar senha.')
    } finally {
      setSavingPassword(false)
    }
  }

  const handleRequestEmailChange = async (e) => {
    e.preventDefault()
    if (!newEmail.trim()) return
    setSendingEmail(true)
    try {
      await authApi.requestEmailChange(newEmail.trim())
      setEmailSent(true)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao solicitar alteração de e-mail.')
    } finally {
      setSendingEmail(false)
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-xl font-semibold">Meu Perfil</h1>

      <div className="bg-white border rounded-lg p-6 space-y-4">
        <h2 className="font-medium text-sm text-gray-700">Dados pessoais</h2>
        <form onSubmit={handleSaveName} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Nome</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">E-mail atual</label>
            <Input value={user?.email ?? ''} readOnly className="bg-gray-50 text-gray-500 cursor-not-allowed" />
          </div>
          <Button type="submit" disabled={savingName || !name.trim()}>
            {savingName ? 'Salvando...' : 'Salvar nome'}
          </Button>
        </form>
      </div>

      <div className="bg-white border rounded-lg p-6 space-y-4">
        <h2 className="font-medium text-sm text-gray-700">Alterar senha</h2>
        <form onSubmit={handleSavePassword} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Senha atual</label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Nova senha</label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required placeholder="Mínimo 8 caracteres" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Confirmar nova senha</label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          </div>
          {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
          <Button type="submit" disabled={savingPassword}>
            {savingPassword ? 'Alterando...' : 'Alterar senha'}
          </Button>
        </form>
      </div>

      <div className="bg-white border rounded-lg p-6 space-y-4">
        <h2 className="font-medium text-sm text-gray-700">Alterar e-mail</h2>
        {emailSent ? (
          <div className="space-y-2">
            <p className="text-sm text-green-700">
              Link enviado. Verifique sua caixa de entrada.
            </p>
            <p className="text-xs text-gray-400">Em ambiente de desenvolvimento, o link aparece no console do servidor.</p>
            <button onClick={() => setEmailSent(false)} className="text-xs text-blue-600 hover:underline">
              Solicitar novamente
            </button>
          </div>
        ) : (
          <form onSubmit={handleRequestEmailChange} className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Novo e-mail</label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                placeholder="novo@email.com"
              />
            </div>
            <Button type="submit" disabled={sendingEmail || !newEmail.trim()}>
              {sendingEmail ? 'Enviando...' : 'Enviar link de confirmação'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Criar `ConfirmEmailChangePage.jsx`**

Criar `frontend/src/pages/auth/ConfirmEmailChangePage.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { authApi } from '@/api/auth'
import { Button } from '@/components/ui/button'

export default function ConfirmEmailChangePage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [state, setState] = useState('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    authApi.confirmEmailChange(token)
      .then((data) => {
        setMessage(data.message)
        setState('success')
      })
      .catch((err) => {
        setMessage(err.response?.data?.error || 'Link inválido ou expirado.')
        setState('error')
      })
  }, [token])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-lg shadow p-8 text-center">
        {state === 'loading' && (
          <>
            <h2 className="text-xl font-semibold mb-2">Verificando...</h2>
            <p className="text-sm text-gray-500">Aguarde enquanto confirmamos seu novo e-mail.</p>
          </>
        )}
        {state === 'success' && (
          <>
            <h2 className="text-xl font-semibold mb-2">E-mail atualizado!</h2>
            <p className="text-sm text-gray-600 mb-4">{message}</p>
            <Button onClick={() => navigate('/perfil')}>Ir para meu perfil</Button>
          </>
        )}
        {state === 'error' && (
          <>
            <h2 className="text-xl font-semibold mb-2 text-red-600">Erro</h2>
            <p className="text-sm text-gray-600 mb-4">{message}</p>
            <Button variant="outline" onClick={() => navigate('/perfil')}>Ir para meu perfil</Button>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/auth.js frontend/src/pages/ProfilePage.jsx frontend/src/pages/auth/ConfirmEmailChangePage.jsx
git commit -m "feat: add ProfilePage (name/password/email change) and ConfirmEmailChangePage"
```

---

## Task 8: Frontend — Header navigation + App routes

**Files:**
- Modify: `frontend/src/components/layout/Header.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `ProfilePage` and `ConfirmEmailChangePage` from Task 7
- Produces: "Meu perfil" item in header dropdown; `/perfil` protected route; `/confirmar-email/:token` public route

- [ ] **Step 1: Adicionar "Meu perfil" no dropdown do `Header.jsx`**

Abrir `frontend/src/components/layout/Header.jsx`. Adicionar `useNavigate` ao import do react-router-dom:

```jsx
// Antes:
import { useLocation } from 'react-router-dom'

// Depois:
import { useLocation, useNavigate } from 'react-router-dom'
```

Dentro do componente `Header`, adicionar a chamada ao hook após `const { user, logout } = useAuth()`:

```jsx
const navigate = useNavigate()
```

Atualizar o objeto `BREADCRUMBS` para incluir `/perfil`:

```jsx
// Antes:
const BREADCRUMBS = {
  '/tickets': 'Chamados',
  '/tickets/new': 'Novo Chamado',
}

// Depois:
const BREADCRUMBS = {
  '/tickets': 'Chamados',
  '/tickets/new': 'Novo Chamado',
  '/perfil': 'Meu Perfil',
}
```

No `DropdownMenuContent`, adicionar o item "Meu perfil" **antes** do `DropdownMenuSeparator`:

```jsx
// Antes:
<DropdownMenuContent align="end">
  <div className="px-3 py-2 text-sm text-gray-500">{user?.email}</div>
  <DropdownMenuSeparator />
  <DropdownMenuItem onClick={logout} className="text-red-600 cursor-pointer">
    Sair
  </DropdownMenuItem>
</DropdownMenuContent>

// Depois:
<DropdownMenuContent align="end">
  <div className="px-3 py-2 text-sm text-gray-500">{user?.email}</div>
  <DropdownMenuSeparator />
  <DropdownMenuItem onClick={() => navigate('/perfil')} className="cursor-pointer">
    Meu perfil
  </DropdownMenuItem>
  <DropdownMenuSeparator />
  <DropdownMenuItem onClick={logout} className="text-red-600 cursor-pointer">
    Sair
  </DropdownMenuItem>
</DropdownMenuContent>
```

- [ ] **Step 2: Adicionar as rotas em `App.jsx`**

Abrir `frontend/src/App.jsx`. Adicionar os imports lazy:

```jsx
// Adicionar junto aos outros lazy imports:
const ProfilePage          = lazy(() => import('@/pages/ProfilePage'))
const ConfirmEmailChangePage = lazy(() => import('@/pages/auth/ConfirmEmailChangePage'))
```

Adicionar a rota pública `/confirmar-email/:token` **fora** do `ProtectedRoute`, junto com `/reset-password/:token`:

```jsx
// Antes:
{ path: '/reset-password/:token', element: <ResetPasswordPage /> },

// Depois:
{ path: '/reset-password/:token', element: <ResetPasswordPage /> },
{ path: '/confirmar-email/:token', element: <ConfirmEmailChangePage /> },
```

Adicionar a rota `/perfil` **dentro** do `ProtectedRoute` (children do AppShell), junto com as outras rotas:

```jsx
// Adicionar após a rota de ideas/:id:
{ path: 'perfil', element: <Suspense fallback={<F />}><ProfilePage /></Suspense> },
```

- [ ] **Step 3: Verificar o build do frontend sem erros**

```bash
cd frontend
npm run build 2>&1 | tail -10
```

Saída esperada: `built in Xs` sem erros.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/Header.jsx frontend/src/App.jsx
git commit -m "feat: add Meu Perfil link in header dropdown and register /perfil and /confirmar-email routes"
```

---

## Self-Review

**Spec coverage check:**

| Seção da spec | Tarefa que implementa |
|---|---|
| 3.1 tickets.controller.js include em list e detail | Task 2 |
| 3.1 ticketComment.findMany include author | Task 2 |
| 3.2 TicketDetailPage nomes reais | Task 5 |
| 3.2 TicketListPage sector.name | Task 5 |
| 3.3 ampliar testes de detalhe | Task 2 |
| 4.1 addComment / deleteComment | Task 3 |
| 4.1 detail inclui comments | Task 3 |
| 4.2 ideasApi.addComment / deleteComment | Task 6 |
| 4.2 IdeaDetailPage seção de comentários | Task 6 |
| 4.3 idea-comments.test.js | Task 3 |
| 5.1 EmailChangeToken migration | Task 1 |
| 5.2 PATCH /auth/me | Task 4 |
| 5.2 POST /auth/request-email-change | Task 4 |
| 5.2 GET /auth/confirm-email-change/:token | Task 4 |
| 5.3 ProfilePage | Task 7 |
| 5.3 ConfirmEmailChangePage | Task 7 |
| 5.3 authApi updateMe/requestEmailChange/confirmEmailChange | Task 7 |
| 5.3 Header "Meu perfil" + BREADCRUMBS | Task 8 |
| 5.3 rotas /perfil e /confirmar-email/:token | Task 8 |
| 5.4 profile-api.test.js | Task 4 |

Todas as seções cobertas. Sem gaps.
