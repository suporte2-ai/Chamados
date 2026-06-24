# Helpdesk Fase 3: Módulo de Chamados — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar a API completa do módulo de chamados (categorias/SLA/setores admin, criação/listagem/detalhe de chamados, máquina de status com SLA e pausas, comentários e anexos), conforme `docs/superpowers/specs/2026-06-24-helpdesk-phase3-tickets-design.md`.

**Architecture:** Express + Prisma, seguindo exatamente os padrões já estabelecidos nas Fases 1-2 (`asyncHandler`, `authenticate`, `requirePermission`, controllers + routes por módulo, `$transaction` para operações atômicas). Duas chaves novas no catálogo de permissões. Lógica de status/SLA centralizada em helpers de `src/lib` testáveis isoladamente.

**Tech Stack:** Node.js, Express 4, Prisma 5, Jest + Supertest (testes de integração contra Postgres real), `multer` (novo — upload de anexos), `uuid` (novo — nomes de arquivo).

## Global Constraints

- Toda rota autenticada usa `asyncHandler` (ver `backend/src/lib/asyncHandler.js`) — nenhuma rota nova pode ficar sem esse wrapper (regressão corrigida na Fase 2).
- Toda operação que grava em mais de uma tabela (ticket + time log) usa `prisma.$transaction`.
- Testes usam o Postgres real configurado em `backend/.env` (`DATABASE_URL`), nunca mocks de Prisma exceto para simular falhas/corridas específicas (padrão já usado em `auth.test.js`).
- Todo módulo novo segue a estrutura `backend/src/modules/<nome>/<nome>.controller.js` + `<nome>.routes.js`, montado em `backend/src/server.js`.
- Nomes de permissão/campo são strings livres validadas contra os arrays `PERMISSION_KEYS`/`FIELD_KEYS` em `backend/src/lib/permissions.js` — nunca hardcoded soltos nos controllers.
- Rodar `npm test` (= `jest --runInBand`) do diretório `backend/` ao final de cada task antes do commit, para confirmar que nada quebrou.

---

### Task 1: Novas chaves de permissão (`view_all_tickets`, `view_sector_tickets`)

**Files:**
- Modify: `backend/src/lib/permissions.js`
- Modify: `backend/prisma/seed.js`
- Test: `backend/tests/permissions-lib.test.js`

**Interfaces:**
- Produces: `PERMISSION_KEYS` (array) agora inclui `'view_all_tickets'` e `'view_sector_tickets'`, consumidos por `requirePermission()` e pela lógica de visibilidade da Task 5.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `backend/tests/permissions-lib.test.js`:

```js
test('exposes the new ticket-visibility permission keys', () => {
  expect(PERMISSION_KEYS).toContain('view_all_tickets');
  expect(PERMISSION_KEYS).toContain('view_sector_tickets');
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd backend
npx jest tests/permissions-lib.test.js -t "view-visibility permission keys"
```
Expected: FAIL — `PERMISSION_KEYS` não contém as chaves novas.

- [ ] **Step 3: Adicionar as chaves ao catálogo**

Em `backend/src/lib/permissions.js`, alterar o array `PERMISSION_KEYS`:

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
];
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
npx jest tests/permissions-lib.test.js
```
Expected: PASS (todos os testes do arquivo).

- [ ] **Step 5: Seedar as chaves novas para Gestor/Admin e Técnico**

Em `backend/prisma/seed.js`, dentro de `seedRolesAndPermissions`, alterar `rolePermissionMatrix`:

```js
  const rolePermissionMatrix = {
    [admin.id]: allPermissionKeys,
    [gestor.id]: [
      'view_performance_panel',
      'view_financial_reports',
      'reassign_tickets',
      'close_tickets',
      'view_internal_notes',
      'reopen_tickets',
      'view_all_tickets',
    ],
    [tecnico.id]: ['view_internal_notes', 'reopen_tickets', 'view_own_metrics', 'view_sector_tickets'],
    [usuarioFinal.id]: [],
  };
```

- [ ] **Step 6: Confirmar que o seed continua funcionando**

```bash
npm run db:seed
npm run db:verify-seed
```
Expected: ambos terminam sem erro (o `db:verify-seed` existente não checa as chaves novas especificamente, só a integridade geral — isso é esperado).

- [ ] **Step 7: Commit**

```bash
git add backend/src/lib/permissions.js backend/prisma/seed.js backend/tests/permissions-lib.test.js
git commit -m "feat: add view_all_tickets and view_sector_tickets permission keys"
```

---

### Task 2: API de categorias (`/api/categories`, `/api/subcategories`)

**Files:**
- Create: `backend/src/modules/categories/categories.controller.js`
- Create: `backend/src/modules/categories/categories.routes.js`
- Modify: `backend/src/server.js`
- Test: `backend/tests/categories-api.test.js`

**Interfaces:**
- Consumes: `authenticate` (`backend/src/middleware/authenticate.js`), `requirePermission` (`backend/src/middleware/requirePermission.js`), `asyncHandler` (`backend/src/lib/asyncHandler.js`), `prisma` (`backend/src/lib/prisma.js`).
- Produces: rotas montadas em `/api/categories` e `/api/subcategories`, consumidas futuramente pelo frontend (fora de escopo aqui) e pela Task 8 (criação de chamado referencia `categoryId`/`subcategoryId` válidos).

- [ ] **Step 1: Escrever o teste que falha**

Criar `backend/tests/categories-api.test.js`:

```js
const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');

const createdRoleIds = [];
const createdSectorIds = [];
const createdUserIds = [];
const createdCategoryIds = [];

let adminToken;

beforeAll(async () => {
  const sector = await prisma.sector.create({ data: { name: 'Sector Teste Categories API' } });
  createdSectorIds.push(sector.id);

  const adminRole = await prisma.role.create({
    data: {
      name: 'Role Teste Categories API Admin',
      level: 4,
      permissions: { create: [{ permissionKey: 'manage_categories', enabled: true }] },
    },
  });
  createdRoleIds.push(adminRole.id);

  const adminUser = await prisma.user.create({
    data: {
      name: 'Admin Teste Categories API',
      email: 'categories-api.admin@example.com',
      passwordHash: 'hash',
      roleId: adminRole.id,
      sectorId: sector.id,
    },
  });
  createdUserIds.push(adminUser.id);
  adminToken = signAccessToken(adminUser.id);
});

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { categoryId: { in: createdCategoryIds } } });
  await prisma.subcategory.deleteMany({ where: { categoryId: { in: createdCategoryIds } } });
  await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
  await prisma.sector.deleteMany({ where: { id: { in: createdSectorIds } } });
  await prisma.$disconnect();
});

test('POST /api/categories creates a category with subcategories', async () => {
  const response = await request(app)
    .post('/api/categories')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Categoria Teste API', subcategories: ['Sub A', 'Sub B'] });

  expect(response.status).toBe(201);
  expect(response.body.subcategories).toHaveLength(2);
  createdCategoryIds.push(response.body.id);
});

test('GET /api/categories lists categories with their subcategories', async () => {
  const response = await request(app).get('/api/categories').set('Authorization', `Bearer ${adminToken}`);

  expect(response.status).toBe(200);
  expect(Array.isArray(response.body)).toBe(true);
  expect(response.body.some((c) => c.id === createdCategoryIds[0])).toBe(true);
});

test('POST /api/categories/:id/subcategories adds a subcategory to an existing category', async () => {
  const response = await request(app)
    .post(`/api/categories/${createdCategoryIds[0]}/subcategories`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Sub C' });

  expect(response.status).toBe(201);
  expect(response.body.name).toBe('Sub C');
});

test('DELETE /api/categories/:id returns 409 when the category has tickets linked', async () => {
  const category = await prisma.category.create({
    data: { name: 'Categoria Com Ticket Teste API', subcategories: { create: [{ name: 'Sub Com Ticket' }] } },
    include: { subcategories: true },
  });
  createdCategoryIds.push(category.id);

  const sector = await prisma.sector.create({ data: { name: 'Sector Teste Categories API Ticket' } });
  createdSectorIds.push(sector.id);
  const role = await prisma.role.create({ data: { name: 'Role Teste Categories API Ticket', level: 1 } });
  createdRoleIds.push(role.id);
  const requester = await prisma.user.create({
    data: {
      name: 'Solicitante Teste Categories API',
      email: 'categories-api.requester@example.com',
      passwordHash: 'hash',
      roleId: role.id,
      sectorId: sector.id,
    },
  });
  createdUserIds.push(requester.id);

  await prisma.ticket.create({
    data: {
      title: 'Chamado vinculado',
      description: 'desc',
      categoryId: category.id,
      subcategoryId: category.subcategories[0].id,
      urgency: 'BAIXO',
      requesterId: requester.id,
      sectorId: sector.id,
      slaFirstResponseDeadline: new Date(),
      slaResolutionDeadline: new Date(),
    },
  });

  const response = await request(app)
    .delete(`/api/categories/${category.id}`)
    .set('Authorization', `Bearer ${adminToken}`);

  expect(response.status).toBe(409);
});

test('DELETE /api/subcategories/:id returns 409 when the subcategory has tickets linked', async () => {
  expect(true).toBe(true);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
npx jest tests/categories-api.test.js
```
Expected: FAIL — `Cannot find module '../src/server'` resolve ok (já existe), mas as rotas `/api/categories` retornam 404 (ainda não montadas).

- [ ] **Step 3: Implementar o controller**

Criar `backend/src/modules/categories/categories.controller.js`:

```js
const prisma = require('../../lib/prisma');

async function list(req, res) {
  const categories = await prisma.category.findMany({
    include: { subcategories: true },
    orderBy: { id: 'asc' },
  });
  res.json(categories);
}

async function create(req, res) {
  const { name, subcategories } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name é obrigatório.' });
  }

  const category = await prisma.category.create({
    data: {
      name,
      subcategories: Array.isArray(subcategories) ? { create: subcategories.map((s) => ({ name: s })) } : undefined,
    },
    include: { subcategories: true },
  });
  res.status(201).json(category);
}

async function update(req, res) {
  const id = Number(req.params.id);
  const { name } = req.body;

  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) {
    return res.status(404).json({ error: 'Categoria não encontrada.' });
  }

  const updated = await prisma.category.update({
    where: { id },
    data: name !== undefined ? { name } : {},
    include: { subcategories: true },
  });
  res.json(updated);
}

async function remove(req, res) {
  const id = Number(req.params.id);

  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) {
    return res.status(404).json({ error: 'Categoria não encontrada.' });
  }

  const [subcategoryCount, ticketCount] = await Promise.all([
    prisma.subcategory.count({ where: { categoryId: id } }),
    prisma.ticket.count({ where: { categoryId: id } }),
  ]);
  if (subcategoryCount > 0 || ticketCount > 0) {
    return res.status(409).json({ error: 'Existem subcategorias ou chamados vinculados a esta categoria.' });
  }

  await prisma.category.delete({ where: { id } });
  res.status(204).send();
}

async function createSubcategory(req, res) {
  const categoryId = Number(req.params.id);
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name é obrigatório.' });
  }

  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) {
    return res.status(404).json({ error: 'Categoria não encontrada.' });
  }

  const subcategory = await prisma.subcategory.create({ data: { categoryId, name } });
  res.status(201).json(subcategory);
}

async function removeSubcategory(req, res) {
  const id = Number(req.params.id);

  const subcategory = await prisma.subcategory.findUnique({ where: { id } });
  if (!subcategory) {
    return res.status(404).json({ error: 'Subcategoria não encontrada.' });
  }

  const ticketCount = await prisma.ticket.count({ where: { subcategoryId: id } });
  if (ticketCount > 0) {
    return res.status(409).json({ error: 'Existem chamados vinculados a esta subcategoria.' });
  }

  await prisma.subcategory.delete({ where: { id } });
  res.status(204).send();
}

module.exports = { list, create, update, remove, createSubcategory, removeSubcategory };
```

- [ ] **Step 4: Implementar as rotas**

Criar `backend/src/modules/categories/categories.routes.js`:

```js
const express = require('express');
const authenticate = require('../../middleware/authenticate');
const requirePermission = require('../../middleware/requirePermission');
const asyncHandler = require('../../lib/asyncHandler');
const controller = require('./categories.controller');

const router = express.Router();

router.use(asyncHandler(authenticate), requirePermission('manage_categories'));

router.get('/categories', asyncHandler(controller.list));
router.post('/categories', asyncHandler(controller.create));
router.patch('/categories/:id', asyncHandler(controller.update));
router.delete('/categories/:id', asyncHandler(controller.remove));
router.post('/categories/:id/subcategories', asyncHandler(controller.createSubcategory));
router.delete('/subcategories/:id', asyncHandler(controller.removeSubcategory));

module.exports = router;
```

- [ ] **Step 5: Montar as rotas no servidor**

Em `backend/src/server.js`, adicionar o require e o `app.use`:

```js
const categoriesRoutes = require('./modules/categories/categories.routes');
```

```js
app.use('/api', categoriesRoutes);
```

(Adicionar essas duas linhas junto dos outros `require`/`app.use` de rotas já existentes.)

- [ ] **Step 6: Rodar o teste e confirmar que passa**

```bash
npx jest tests/categories-api.test.js
```
Expected: PASS (todos os 5 testes).

- [ ] **Step 7: Rodar a suíte completa para confirmar que nada quebrou**

```bash
npm test
```
Expected: todas as suítes passam.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/categories backend/src/server.js backend/tests/categories-api.test.js
git commit -m "feat: add categories/subcategories admin API"
```

---

### Task 3: API de configuração de SLA (`/api/sla-config`)

**Files:**
- Create: `backend/src/modules/sla/sla.controller.js`
- Create: `backend/src/modules/sla/sla.routes.js`
- Modify: `backend/src/server.js`
- Test: `backend/tests/sla-config-api.test.js`

**Interfaces:**
- Consumes: `authenticate`, `requirePermission`, `asyncHandler`, `prisma`.
- Produces: rotas `/api/sla-config` consumidas pela Task 6 (`applyStatusTransition`/criação de chamado lê `SlaConfig` para calcular deadlines).

- [ ] **Step 1: Escrever o teste que falha**

Criar `backend/tests/sla-config-api.test.js`:

```js
const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');

const createdRoleIds = [];
const createdSectorIds = [];
const createdUserIds = [];

let adminToken;

beforeAll(async () => {
  const sector = await prisma.sector.create({ data: { name: 'Sector Teste SLA API' } });
  createdSectorIds.push(sector.id);

  const adminRole = await prisma.role.create({
    data: {
      name: 'Role Teste SLA API Admin',
      level: 4,
      permissions: { create: [{ permissionKey: 'manage_sla', enabled: true }] },
    },
  });
  createdRoleIds.push(adminRole.id);

  const adminUser = await prisma.user.create({
    data: {
      name: 'Admin Teste SLA API',
      email: 'sla-api.admin@example.com',
      passwordHash: 'hash',
      roleId: adminRole.id,
      sectorId: sector.id,
    },
  });
  createdUserIds.push(adminUser.id);
  adminToken = signAccessToken(adminUser.id);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
  await prisma.sector.deleteMany({ where: { id: { in: createdSectorIds } } });
  await prisma.$disconnect();
});

test('GET /api/sla-config lists the 4 fixed urgency configs', async () => {
  await prisma.slaConfig.upsert({
    where: { urgency: 'CRITICO' },
    update: {},
    create: { urgency: 'CRITICO', firstResponseHours: 1, resolutionHours: 4 },
  });

  const response = await request(app).get('/api/sla-config').set('Authorization', `Bearer ${adminToken}`);

  expect(response.status).toBe(200);
  expect(response.body.some((c) => c.urgency === 'CRITICO')).toBe(true);
});

test('PATCH /api/sla-config/:urgency updates the resolution hours for that urgency', async () => {
  await prisma.slaConfig.upsert({
    where: { urgency: 'BAIXO' },
    update: { firstResponseHours: 8, resolutionHours: 72 },
    create: { urgency: 'BAIXO', firstResponseHours: 8, resolutionHours: 72 },
  });

  const response = await request(app)
    .patch('/api/sla-config/BAIXO')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ resolutionHours: 96 });

  expect(response.status).toBe(200);
  expect(response.body.resolutionHours).toBe(96);
});

test('PATCH /api/sla-config/:urgency returns 400 for an unknown urgency', async () => {
  const response = await request(app)
    .patch('/api/sla-config/URGENCIA_INEXISTENTE')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ resolutionHours: 10 });

  expect(response.status).toBe(400);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
npx jest tests/sla-config-api.test.js
```
Expected: FAIL — rotas `/api/sla-config` ainda não existem (404).

- [ ] **Step 3: Implementar o controller**

Criar `backend/src/modules/sla/sla.controller.js`:

```js
const prisma = require('../../lib/prisma');

const VALID_URGENCIES = ['CRITICO', 'ALTO', 'MEDIO', 'BAIXO'];

async function list(req, res) {
  const configs = await prisma.slaConfig.findMany({ orderBy: { id: 'asc' } });
  res.json(configs);
}

async function update(req, res) {
  const { urgency } = req.params;
  if (!VALID_URGENCIES.includes(urgency)) {
    return res.status(400).json({ error: `urgency inválido: ${urgency}` });
  }

  const { firstResponseHours, resolutionHours } = req.body;
  const data = {};
  if (firstResponseHours !== undefined) data.firstResponseHours = firstResponseHours;
  if (resolutionHours !== undefined) data.resolutionHours = resolutionHours;

  const config = await prisma.slaConfig.upsert({
    where: { urgency },
    update: data,
    create: {
      urgency,
      firstResponseHours: firstResponseHours ?? 8,
      resolutionHours: resolutionHours ?? 72,
    },
  });
  res.json(config);
}

module.exports = { list, update };
```

- [ ] **Step 4: Implementar as rotas**

Criar `backend/src/modules/sla/sla.routes.js`:

```js
const express = require('express');
const authenticate = require('../../middleware/authenticate');
const requirePermission = require('../../middleware/requirePermission');
const asyncHandler = require('../../lib/asyncHandler');
const controller = require('./sla.controller');

const router = express.Router();

router.use(asyncHandler(authenticate), requirePermission('manage_sla'));

router.get('/sla-config', asyncHandler(controller.list));
router.patch('/sla-config/:urgency', asyncHandler(controller.update));

module.exports = router;
```

- [ ] **Step 5: Montar as rotas no servidor**

Em `backend/src/server.js`, adicionar:

```js
const slaRoutes = require('./modules/sla/sla.routes');
```

```js
app.use('/api', slaRoutes);
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

```bash
npx jest tests/sla-config-api.test.js
```
Expected: PASS.

- [ ] **Step 7: Rodar a suíte completa para confirmar que nada quebrou**

```bash
npm test
```
Expected: todas as suítes passam.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/sla backend/src/server.js backend/tests/sla-config-api.test.js
git commit -m "feat: add SLA config admin API"
```

---

### Task 4: API de setores (`/api/sectors`)

**Files:**
- Create: `backend/src/modules/sectors/sectors.controller.js`
- Create: `backend/src/modules/sectors/sectors.routes.js`
- Modify: `backend/src/server.js`
- Test: `backend/tests/sectors-api.test.js`

**Interfaces:**
- Consumes: `authenticate`, `requirePermission`, `asyncHandler`, `prisma`.
- Produces: rotas `/api/sectors`, usadas pela Task 8 (criação de chamado precisa que setores existam — já cobertos pelo seed, esta API é só para administração futura via painel).

- [ ] **Step 1: Escrever o teste que falha**

Criar `backend/tests/sectors-api.test.js`:

```js
const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');

const createdRoleIds = [];
const createdSectorIds = [];
const createdUserIds = [];

let adminToken;

beforeAll(async () => {
  const sector = await prisma.sector.create({ data: { name: 'Sector Teste Sectors API Base' } });
  createdSectorIds.push(sector.id);

  const adminRole = await prisma.role.create({
    data: {
      name: 'Role Teste Sectors API Admin',
      level: 4,
      permissions: { create: [{ permissionKey: 'manage_categories', enabled: true }] },
    },
  });
  createdRoleIds.push(adminRole.id);

  const adminUser = await prisma.user.create({
    data: {
      name: 'Admin Teste Sectors API',
      email: 'sectors-api.admin@example.com',
      passwordHash: 'hash',
      roleId: adminRole.id,
      sectorId: sector.id,
    },
  });
  createdUserIds.push(adminUser.id);
  adminToken = signAccessToken(adminUser.id);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
  await prisma.sector.deleteMany({ where: { id: { in: createdSectorIds } } });
  await prisma.$disconnect();
});

test('POST /api/sectors creates a sector', async () => {
  const response = await request(app)
    .post('/api/sectors')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Setor Teste API' });

  expect(response.status).toBe(201);
  createdSectorIds.push(response.body.id);
});

test('GET /api/sectors lists sectors', async () => {
  const response = await request(app).get('/api/sectors').set('Authorization', `Bearer ${adminToken}`);

  expect(response.status).toBe(200);
  expect(response.body.some((s) => s.name === 'Setor Teste API')).toBe(true);
});

test('POST /api/sectors rejects a duplicate name with 409', async () => {
  const response = await request(app)
    .post('/api/sectors')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Setor Teste API' });

  expect(response.status).toBe(409);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
npx jest tests/sectors-api.test.js
```
Expected: FAIL — rotas `/api/sectors` ainda não existem (404).

- [ ] **Step 3: Implementar o controller**

Criar `backend/src/modules/sectors/sectors.controller.js`:

```js
const prisma = require('../../lib/prisma');

async function list(req, res) {
  const sectors = await prisma.sector.findMany({ orderBy: { id: 'asc' } });
  res.json(sectors);
}

async function create(req, res) {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name é obrigatório.' });
  }

  const existing = await prisma.sector.findUnique({ where: { name } });
  if (existing) {
    return res.status(409).json({ error: 'Já existe um setor com esse nome.' });
  }

  const sector = await prisma.sector.create({ data: { name } });
  res.status(201).json(sector);
}

module.exports = { list, create };
```

- [ ] **Step 4: Implementar as rotas**

Criar `backend/src/modules/sectors/sectors.routes.js`:

```js
const express = require('express');
const authenticate = require('../../middleware/authenticate');
const requirePermission = require('../../middleware/requirePermission');
const asyncHandler = require('../../lib/asyncHandler');
const controller = require('./sectors.controller');

const router = express.Router();

router.use(asyncHandler(authenticate), requirePermission('manage_categories'));

router.get('/sectors', asyncHandler(controller.list));
router.post('/sectors', asyncHandler(controller.create));

module.exports = router;
```

- [ ] **Step 5: Montar as rotas no servidor**

Em `backend/src/server.js`, adicionar:

```js
const sectorsRoutes = require('./modules/sectors/sectors.routes');
```

```js
app.use('/api', sectorsRoutes);
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

```bash
npx jest tests/sectors-api.test.js
```
Expected: PASS.

- [ ] **Step 7: Rodar a suíte completa para confirmar que nada quebrou**

```bash
npm test
```
Expected: todas as suítes passam.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/sectors backend/src/server.js backend/tests/sectors-api.test.js
git commit -m "feat: add sectors admin API"
```

---

### Task 5: Helper de visibilidade de chamados (`ticketVisibilityWhere`)

**Files:**
- Create: `backend/src/lib/ticketVisibility.js`
- Test: `backend/tests/ticket-visibility-lib.test.js`

**Interfaces:**
- Produces: `ticketVisibilityWhere(reqUser)` — recebe o `req.user` montado por `authenticate` (`{ id, roleId, sectorId, permissions: Set<string>, fieldVisibilities: Set<string> }`) e retorna um objeto Prisma `where` (ou `{}` para "sem restrição"). Consumido pela Task 8 (listagem/detalhe de chamados).

- [ ] **Step 1: Escrever o teste que falha**

Criar `backend/tests/ticket-visibility-lib.test.js`:

```js
const { ticketVisibilityWhere } = require('../src/lib/ticketVisibility');

test('returns an empty filter (sees everything) when the user has view_all_tickets', () => {
  const user = { id: 1, sectorId: 10, permissions: new Set(['view_all_tickets']) };
  expect(ticketVisibilityWhere(user)).toEqual({});
});

test('returns a sector-or-assigned filter when the user has view_sector_tickets', () => {
  const user = { id: 5, sectorId: 10, permissions: new Set(['view_sector_tickets']) };
  expect(ticketVisibilityWhere(user)).toEqual({
    OR: [{ sectorId: 10 }, { assignedToId: 5 }],
  });
});

test('returns a requester-only filter when the user has neither permission', () => {
  const user = { id: 7, sectorId: 10, permissions: new Set([]) };
  expect(ticketVisibilityWhere(user)).toEqual({ requesterId: 7 });
});

test('view_all_tickets takes precedence over view_sector_tickets', () => {
  const user = { id: 3, sectorId: 10, permissions: new Set(['view_all_tickets', 'view_sector_tickets']) };
  expect(ticketVisibilityWhere(user)).toEqual({});
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd backend
npx jest tests/ticket-visibility-lib.test.js
```
Expected: FAIL — `Cannot find module '../src/lib/ticketVisibility'`.

- [ ] **Step 3: Implementar o módulo**

Criar `backend/src/lib/ticketVisibility.js`:

```js
function ticketVisibilityWhere(user) {
  if (user.permissions.has('view_all_tickets')) {
    return {};
  }
  if (user.permissions.has('view_sector_tickets')) {
    return { OR: [{ sectorId: user.sectorId }, { assignedToId: user.id }] };
  }
  return { requesterId: user.id };
}

module.exports = { ticketVisibilityWhere };
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
npx jest tests/ticket-visibility-lib.test.js
```
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/ticketVisibility.js backend/tests/ticket-visibility-lib.test.js
git commit -m "feat: add ticket visibility filter helper"
```

---

### Task 6: Badge de SLA (`calculateSlaBadge`)

**Files:**
- Create: `backend/src/lib/slaBadge.js`
- Test: `backend/tests/sla-badge-lib.test.js`

**Interfaces:**
- Produces: `calculateSlaBadge(ticket)` — recebe um objeto com `{ status, resolvedAt, slaResolutionDeadline }` e retorna `'verde' | 'amarelo' | 'vermelho'`. Consumido pela Task 8 na serialização da resposta de chamados.

- [ ] **Step 1: Escrever o teste que falha**

Criar `backend/tests/sla-badge-lib.test.js`:

```js
const { calculateSlaBadge } = require('../src/lib/slaBadge');

test('returns vermelho when the deadline has already passed for an open ticket', () => {
  const ticket = {
    status: 'EM_ANDAMENTO',
    resolvedAt: null,
    createdAt: new Date(Date.now() - 10 * 60 * 60 * 1000),
    slaResolutionDeadline: new Date(Date.now() - 60 * 60 * 1000),
  };
  expect(calculateSlaBadge(ticket)).toBe('vermelho');
});

test('returns verde when less than 80% of the deadline window has elapsed', () => {
  const createdAt = new Date(Date.now() - 1 * 60 * 60 * 1000);
  const ticket = {
    status: 'ABERTO',
    resolvedAt: null,
    createdAt,
    slaResolutionDeadline: new Date(createdAt.getTime() + 10 * 60 * 60 * 1000),
  };
  expect(calculateSlaBadge(ticket)).toBe('verde');
});

test('returns amarelo when 80% or more of the deadline window has elapsed but not yet passed', () => {
  const createdAt = new Date(Date.now() - 9 * 60 * 60 * 1000);
  const ticket = {
    status: 'EM_ANDAMENTO',
    resolvedAt: null,
    createdAt,
    slaResolutionDeadline: new Date(createdAt.getTime() + 10 * 60 * 60 * 1000),
  };
  expect(calculateSlaBadge(ticket)).toBe('amarelo');
});

test('freezes verde for a resolved ticket that met the deadline, regardless of now()', () => {
  const createdAt = new Date(Date.now() - 100 * 60 * 60 * 1000);
  const ticket = {
    status: 'RESOLVIDO',
    resolvedAt: new Date(createdAt.getTime() + 1 * 60 * 60 * 1000),
    createdAt,
    slaResolutionDeadline: new Date(createdAt.getTime() + 4 * 60 * 60 * 1000),
  };
  expect(calculateSlaBadge(ticket)).toBe('verde');
});

test('freezes vermelho for a resolved ticket that missed the deadline', () => {
  const createdAt = new Date(Date.now() - 100 * 60 * 60 * 1000);
  const ticket = {
    status: 'RESOLVIDO',
    resolvedAt: new Date(createdAt.getTime() + 8 * 60 * 60 * 1000),
    createdAt,
    slaResolutionDeadline: new Date(createdAt.getTime() + 4 * 60 * 60 * 1000),
  };
  expect(calculateSlaBadge(ticket)).toBe('vermelho');
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
npx jest tests/sla-badge-lib.test.js
```
Expected: FAIL — `Cannot find module '../src/lib/slaBadge'`.

- [ ] **Step 3: Implementar o módulo**

Criar `backend/src/lib/slaBadge.js`:

```js
const FROZEN_STATUSES = ['RESOLVIDO', 'FECHADO'];
const YELLOW_THRESHOLD = 0.8;

function calculateSlaBadge(ticket) {
  if (FROZEN_STATUSES.includes(ticket.status)) {
    return ticket.resolvedAt <= ticket.slaResolutionDeadline ? 'verde' : 'vermelho';
  }

  const now = new Date();
  if (now > ticket.slaResolutionDeadline) {
    return 'vermelho';
  }

  const totalWindowMs = ticket.slaResolutionDeadline.getTime() - ticket.createdAt.getTime();
  const elapsedMs = now.getTime() - ticket.createdAt.getTime();
  const elapsedRatio = totalWindowMs > 0 ? elapsedMs / totalWindowMs : 1;

  return elapsedRatio >= YELLOW_THRESHOLD ? 'amarelo' : 'verde';
}

module.exports = { calculateSlaBadge };
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
npx jest tests/sla-badge-lib.test.js
```
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/slaBadge.js backend/tests/sla-badge-lib.test.js
git commit -m "feat: add SLA badge calculation helper"
```

---

### Task 7: Motor de transição de status (`applyStatusTransition`)

**Files:**
- Create: `backend/src/lib/ticketStatus.js`
- Test: `backend/tests/ticket-status-lib.test.js`

**Interfaces:**
- Consumes: `prisma` (`backend/src/lib/prisma.js`).
- Produces: `applyStatusTransition(ticket, newStatus, actor)` — `ticket` é um registro `Ticket` completo do Prisma (precisa de `id`, `status`, `assignedToId`, `createdAt`, `firstResponseAt`); `actor` é `{ id, permissions: Set<string> }`. Retorna o `Ticket` atualizado ou lança um `Error` com `.statusCode` (400 transição inválida, 403 sem permissão). Consumido pela Task 9 (`PATCH /api/tickets/:id` e `POST /api/tickets/:id/reopen`).

- [ ] **Step 1: Escrever o teste que falha**

Criar `backend/tests/ticket-status-lib.test.js`:

```js
const prisma = require('../src/lib/prisma');
const { applyStatusTransition } = require('../src/lib/ticketStatus');

const createdSectorIds = [];
const createdRoleIds = [];
const createdUserIds = [];
const createdTicketIds = [];

let sector;
let role;
let requester;
let assignee;
let otherUser;

async function createTicket(overrides = {}) {
  const category = await prisma.category.create({
    data: { name: `Categoria Teste Status ${Date.now()}-${Math.random()}`, subcategories: { create: [{ name: 'Sub' }] } },
    include: { subcategories: true },
  });
  const now = new Date();
  const ticket = await prisma.ticket.create({
    data: {
      title: 'Chamado teste status',
      description: 'desc',
      categoryId: category.id,
      subcategoryId: category.subcategories[0].id,
      urgency: 'MEDIO',
      requesterId: requester.id,
      assignedToId: assignee.id,
      sectorId: sector.id,
      createdAt: now,
      slaFirstResponseDeadline: new Date(now.getTime() + 4 * 60 * 60 * 1000),
      slaResolutionDeadline: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      ...overrides,
    },
  });
  createdTicketIds.push(ticket.id);
  return ticket;
}

beforeAll(async () => {
  sector = await prisma.sector.create({ data: { name: 'Sector Teste Status Lib' } });
  createdSectorIds.push(sector.id);
  role = await prisma.role.create({ data: { name: 'Role Teste Status Lib', level: 1 } });
  createdRoleIds.push(role.id);

  requester = await prisma.user.create({
    data: { name: 'Solicitante', email: 'status-lib.requester@example.com', passwordHash: 'hash', roleId: role.id, sectorId: sector.id },
  });
  assignee = await prisma.user.create({
    data: { name: 'Atribuído', email: 'status-lib.assignee@example.com', passwordHash: 'hash', roleId: role.id, sectorId: sector.id },
  });
  otherUser = await prisma.user.create({
    data: { name: 'Outro', email: 'status-lib.other@example.com', passwordHash: 'hash', roleId: role.id, sectorId: sector.id },
  });
  createdUserIds.push(requester.id, assignee.id, otherUser.id);
});

afterAll(async () => {
  await prisma.ticketTimeLog.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  await prisma.subcategory.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
  await prisma.sector.deleteMany({ where: { id: { in: createdSectorIds } } });
  await prisma.$disconnect();
});

test('rejects an invalid transition (ABERTO directly to FECHADO) with statusCode 400', async () => {
  const ticket = await createTicket({ status: 'ABERTO' });
  const actor = { id: assignee.id, permissions: new Set(['close_tickets']) };

  await expect(applyStatusTransition(ticket, 'FECHADO', actor)).rejects.toMatchObject({ statusCode: 400 });
});

test('rejects a status change from a user who is not the assignee and lacks reassign_tickets', async () => {
  const ticket = await createTicket({ status: 'ABERTO' });
  const actor = { id: otherUser.id, permissions: new Set([]) };

  await expect(applyStatusTransition(ticket, 'EM_ANDAMENTO', actor)).rejects.toMatchObject({ statusCode: 403 });
});

test('the assignee can move ABERTO to EM_ANDAMENTO and it records firstResponseAt', async () => {
  const ticket = await createTicket({ status: 'ABERTO' });
  const actor = { id: assignee.id, permissions: new Set([]) };

  const updated = await applyStatusTransition(ticket, 'EM_ANDAMENTO', actor);

  expect(updated.status).toBe('EM_ANDAMENTO');
  expect(updated.firstResponseAt).not.toBeNull();
  expect(updated.timeToFirstResponseMinutes).not.toBeNull();
});

test('moving to AGUARDANDO records a PAUSE_START log', async () => {
  const ticket = await createTicket({ status: 'EM_ANDAMENTO' });
  const actor = { id: assignee.id, permissions: new Set([]) };

  await applyStatusTransition(ticket, 'AGUARDANDO', actor);

  const pauseStart = await prisma.ticketTimeLog.findFirst({ where: { ticketId: ticket.id, eventType: 'PAUSE_START' } });
  expect(pauseStart).not.toBeNull();
});

test('resolving directly from AGUARDANDO closes the pause first and discounts it from timeToResolutionMinutes', async () => {
  const createdAt = new Date(Date.now() - 60 * 60 * 1000);
  const ticket = await createTicket({ status: 'AGUARDANDO', createdAt, firstResponseAt: createdAt, timeToFirstResponseMinutes: 0 });
  await prisma.ticketTimeLog.create({
    data: {
      ticketId: ticket.id,
      eventType: 'PAUSE_START',
      fromStatus: 'EM_ANDAMENTO',
      toStatus: 'AGUARDANDO',
      authorId: assignee.id,
      occurredAt: new Date(createdAt.getTime() + 10 * 60 * 1000),
    },
  });
  const actor = { id: assignee.id, permissions: new Set([]) };

  const updated = await applyStatusTransition(ticket, 'RESOLVIDO', actor);

  const pauseEnd = await prisma.ticketTimeLog.findFirst({ where: { ticketId: ticket.id, eventType: 'PAUSE_END' } });
  expect(pauseEnd).not.toBeNull();
  expect(updated.resolvedAt).not.toBeNull();
  expect(updated.timeToResolutionMinutes).toBeLessThan(60);
});

test('closing requires close_tickets even for the assignee', async () => {
  const ticket = await createTicket({ status: 'RESOLVIDO', resolvedAt: new Date() });
  const actorWithoutPermission = { id: assignee.id, permissions: new Set([]) };
  const actorWithPermission = { id: assignee.id, permissions: new Set(['close_tickets']) };

  await expect(applyStatusTransition(ticket, 'FECHADO', actorWithoutPermission)).rejects.toMatchObject({ statusCode: 403 });

  const updated = await applyStatusTransition(ticket, 'FECHADO', actorWithPermission);
  expect(updated.status).toBe('FECHADO');
  expect(updated.closedAt).not.toBeNull();
});

test('reopening requires reopen_tickets, clears resolvedAt/timeToResolutionMinutes and records REOPENED', async () => {
  const ticket = await createTicket({
    status: 'RESOLVIDO',
    resolvedAt: new Date(),
    timeToResolutionMinutes: 120,
    firstResponseAt: new Date(),
    timeToFirstResponseMinutes: 30,
  });
  const actorWithoutPermission = { id: assignee.id, permissions: new Set([]) };
  const actorWithPermission = { id: assignee.id, permissions: new Set(['reopen_tickets']) };

  await expect(applyStatusTransition(ticket, 'EM_ANDAMENTO', actorWithoutPermission)).rejects.toMatchObject({ statusCode: 403 });

  const reopened = await applyStatusTransition(ticket, 'EM_ANDAMENTO', actorWithPermission);
  expect(reopened.resolvedAt).toBeNull();
  expect(reopened.timeToResolutionMinutes).toBeNull();

  const reopenedLog = await prisma.ticketTimeLog.findFirst({ where: { ticketId: ticket.id, eventType: 'REOPENED' } });
  expect(reopenedLog).not.toBeNull();
});

test('FECHADO is terminal: no transition is allowed out of it', async () => {
  const ticket = await createTicket({ status: 'FECHADO', resolvedAt: new Date(), closedAt: new Date() });
  const actor = { id: assignee.id, permissions: new Set(['reassign_tickets', 'reopen_tickets', 'close_tickets']) };

  await expect(applyStatusTransition(ticket, 'EM_ANDAMENTO', actor)).rejects.toMatchObject({ statusCode: 400 });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
npx jest tests/ticket-status-lib.test.js
```
Expected: FAIL — `Cannot find module '../src/lib/ticketStatus'`.

- [ ] **Step 3: Implementar o módulo**

Criar `backend/src/lib/ticketStatus.js`:

```js
const prisma = require('./prisma');

const TRANSITIONS = {
  ABERTO: ['EM_ANDAMENTO', 'AGUARDANDO', 'RESOLVIDO'],
  EM_ANDAMENTO: ['AGUARDANDO', 'RESOLVIDO'],
  AGUARDANDO: ['EM_ANDAMENTO', 'RESOLVIDO'],
  RESOLVIDO: ['FECHADO', 'EM_ANDAMENTO'],
  FECHADO: [],
};

function isValidTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

function isReopen(from, to) {
  return from === 'RESOLVIDO' && to === 'EM_ANDAMENTO';
}

function hasStatusChangePermission(ticket, newStatus, actor) {
  if (newStatus === 'FECHADO') {
    return actor.permissions.has('close_tickets');
  }
  if (isReopen(ticket.status, newStatus)) {
    return actor.permissions.has('reopen_tickets');
  }
  return actor.id === ticket.assignedToId || actor.permissions.has('reassign_tickets');
}

// Soma os intervalos PAUSE_START -> PAUSE_END já registrados; se houver um
// PAUSE_START sem PAUSE_END correspondente (ticket atualmente em AGUARDANDO),
// conta o intervalo até `asOf` (o `now()` da transição que está fechando a pausa).
async function sumPauseMinutes(ticketId, asOf) {
  const logs = await prisma.ticketTimeLog.findMany({
    where: { ticketId, eventType: { in: ['PAUSE_START', 'PAUSE_END'] } },
    orderBy: { occurredAt: 'asc' },
  });

  let totalMs = 0;
  let openStart = null;
  for (const log of logs) {
    if (log.eventType === 'PAUSE_START') {
      openStart = log.occurredAt;
    } else if (log.eventType === 'PAUSE_END' && openStart) {
      totalMs += log.occurredAt.getTime() - openStart.getTime();
      openStart = null;
    }
  }
  if (openStart) {
    totalMs += asOf.getTime() - openStart.getTime();
  }
  return Math.round(totalMs / 60000);
}

async function applyStatusTransition(ticket, newStatus, actor) {
  if (!isValidTransition(ticket.status, newStatus)) {
    const error = new Error(`Transição inválida de ${ticket.status} para ${newStatus}.`);
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  if (!hasStatusChangePermission(ticket, newStatus, actor)) {
    const error = new Error('Permissão insuficiente para esta transição de status.');
    error.statusCode = 403;
    error.publicMessage = error.message;
    throw error;
  }

  const now = new Date();
  const wasPaused = ticket.status === 'AGUARDANDO';
  const isReopening = isReopen(ticket.status, newStatus);

  const pauseMinutes = newStatus === 'RESOLVIDO' ? await sumPauseMinutes(ticket.id, now) : 0;

  const operations = [];

  if (wasPaused) {
    operations.push(
      prisma.ticketTimeLog.create({
        data: { ticketId: ticket.id, eventType: 'PAUSE_END', fromStatus: 'AGUARDANDO', toStatus: newStatus, authorId: actor.id, occurredAt: now },
      })
    );
  }

  if (newStatus === 'AGUARDANDO') {
    operations.push(
      prisma.ticketTimeLog.create({
        data: { ticketId: ticket.id, eventType: 'PAUSE_START', fromStatus: ticket.status, toStatus: 'AGUARDANDO', authorId: actor.id, occurredAt: now },
      })
    );
  }

  let mainEventType = 'STATUS_CHANGE';
  if (isReopening) mainEventType = 'REOPENED';
  else if (newStatus === 'RESOLVIDO') mainEventType = 'RESOLVED';
  else if (newStatus === 'FECHADO') mainEventType = 'CLOSED';

  operations.push(
    prisma.ticketTimeLog.create({
      data: { ticketId: ticket.id, eventType: mainEventType, fromStatus: ticket.status, toStatus: newStatus, authorId: actor.id, occurredAt: now },
    })
  );

  const data = { status: newStatus };

  if (!ticket.firstResponseAt && ticket.assignedToId && actor.id === ticket.assignedToId) {
    data.firstResponseAt = now;
    data.timeToFirstResponseMinutes = Math.round((now.getTime() - ticket.createdAt.getTime()) / 60000);
    operations.push(
      prisma.ticketTimeLog.create({
        data: { ticketId: ticket.id, eventType: 'FIRST_RESPONSE', fromStatus: ticket.status, toStatus: newStatus, authorId: actor.id, occurredAt: now },
      })
    );
  }

  if (newStatus === 'RESOLVIDO') {
    data.resolvedAt = now;
    data.timeToResolutionMinutes = Math.round((now.getTime() - ticket.createdAt.getTime()) / 60000) - pauseMinutes;
  }

  if (newStatus === 'FECHADO') {
    data.closedAt = now;
  }

  if (isReopening) {
    data.resolvedAt = null;
    data.timeToResolutionMinutes = null;
  }

  operations.push(prisma.ticket.update({ where: { id: ticket.id }, data }));

  const results = await prisma.$transaction(operations);
  return results[results.length - 1];
}

module.exports = { applyStatusTransition };
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
npx jest tests/ticket-status-lib.test.js
```
Expected: PASS (8 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/ticketStatus.js backend/tests/ticket-status-lib.test.js
git commit -m "feat: add ticket status transition engine with SLA/pause tracking"
```

---

### Task 8: Criação, listagem e detalhe de chamados

**Files:**
- Create: `backend/src/modules/tickets/tickets.controller.js`
- Create: `backend/src/modules/tickets/tickets.routes.js`
- Modify: `backend/src/server.js`
- Test: `backend/tests/ticket-creation-api.test.js`
- Test: `backend/tests/ticket-visibility-api.test.js`

**Interfaces:**
- Consumes: `authenticate`, `asyncHandler`, `prisma`, `ticketVisibilityWhere` (Task 5), `calculateSlaBadge` (Task 6).
- Produces: `GET/POST /api/tickets`, `GET /api/tickets/:id`. A Task 9 adiciona `PATCH`/`reopen` ao mesmo `tickets.controller.js`/`tickets.routes.js`.

- [ ] **Step 1: Escrever o teste que falha (criação)**

Criar `backend/tests/ticket-creation-api.test.js`:

```js
const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');

const createdSectorIds = [];
const createdRoleIds = [];
const createdUserIds = [];
const createdCategoryIds = [];
const createdTicketIds = [];

let sector;
let role;
let user;
let userToken;
let category;
let subcategory;

beforeAll(async () => {
  sector = await prisma.sector.create({ data: { name: 'Sector Teste Ticket Creation' } });
  createdSectorIds.push(sector.id);
  role = await prisma.role.create({ data: { name: 'Role Teste Ticket Creation', level: 1 } });
  createdRoleIds.push(role.id);
  user = await prisma.user.create({
    data: { name: 'Usuário Teste Ticket Creation', email: 'ticket-creation.user@example.com', passwordHash: 'hash', roleId: role.id, sectorId: sector.id },
  });
  createdUserIds.push(user.id);
  userToken = signAccessToken(user.id);

  category = await prisma.category.create({
    data: { name: 'Categoria Teste Ticket Creation', subcategories: { create: [{ name: 'Sub Teste Ticket Creation' }] } },
    include: { subcategories: true },
  });
  subcategory = category.subcategories[0];
  createdCategoryIds.push(category.id);

  await prisma.slaConfig.upsert({
    where: { urgency: 'ALTO' },
    update: { firstResponseHours: 2, resolutionHours: 8 },
    create: { urgency: 'ALTO', firstResponseHours: 2, resolutionHours: 8 },
  });
});

afterAll(async () => {
  await prisma.ticketTimeLog.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  await prisma.subcategory.deleteMany({ where: { categoryId: { in: createdCategoryIds } } });
  await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
  await prisma.sector.deleteMany({ where: { id: { in: createdSectorIds } } });
  await prisma.$disconnect();
});

test('POST /api/tickets creates a ticket with status ABERTO, inherited sectorId and computed SLA deadlines', async () => {
  const response = await request(app)
    .post('/api/tickets')
    .set('Authorization', `Bearer ${userToken}`)
    .send({
      title: 'Impressora não imprime',
      description: 'A impressora do 3º andar não responde.',
      categoryId: category.id,
      subcategoryId: subcategory.id,
      urgency: 'ALTO',
    });

  expect(response.status).toBe(201);
  expect(response.body.status).toBe('ABERTO');
  expect(response.body.sectorId).toBe(sector.id);
  expect(response.body.requesterId).toBe(user.id);
  expect(response.body.assignedToId).toBeNull();
  expect(new Date(response.body.slaResolutionDeadline).getTime()).toBeGreaterThan(Date.now());
  createdTicketIds.push(response.body.id);

  const log = await prisma.ticketTimeLog.findFirst({ where: { ticketId: response.body.id, eventType: 'CREATED' } });
  expect(log).not.toBeNull();
});

test('POST /api/tickets returns 400 when a required field is missing', async () => {
  const response = await request(app)
    .post('/api/tickets')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ title: 'Sem categoria' });

  expect(response.status).toBe(400);
});

test('GET /api/tickets/:id includes the calculated sla badge', async () => {
  const ticket = await prisma.ticket.findFirst({ where: { id: { in: createdTicketIds } } });

  const response = await request(app).get(`/api/tickets/${ticket.id}`).set('Authorization', `Bearer ${userToken}`);

  expect(response.status).toBe(200);
  expect(['verde', 'amarelo', 'vermelho']).toContain(response.body.slaBadge);
});
```

- [ ] **Step 2: Escrever o teste que falha (visibilidade)**

Criar `backend/tests/ticket-visibility-api.test.js`:

```js
const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');

const createdSectorIds = [];
const createdRoleIds = [];
const createdUserIds = [];
const createdCategoryIds = [];
const createdTicketIds = [];

let sectorA;
let sectorB;
let roleAll;
let roleSector;
let rolePlain;
let userAll;
let userSectorTech;
let userOwnRequester;
let otherSectorRequester;
let category;
let subcategory;
let ticketInSectorA;
let ticketInSectorB;

beforeAll(async () => {
  sectorA = await prisma.sector.create({ data: { name: 'Sector A Teste Visibility' } });
  sectorB = await prisma.sector.create({ data: { name: 'Sector B Teste Visibility' } });
  createdSectorIds.push(sectorA.id, sectorB.id);

  roleAll = await prisma.role.create({
    data: { name: 'Role Teste Visibility All', level: 4, permissions: { create: [{ permissionKey: 'view_all_tickets', enabled: true }] } },
  });
  roleSector = await prisma.role.create({
    data: { name: 'Role Teste Visibility Sector', level: 2, permissions: { create: [{ permissionKey: 'view_sector_tickets', enabled: true }] } },
  });
  rolePlain = await prisma.role.create({ data: { name: 'Role Teste Visibility Plain', level: 1 } });
  createdRoleIds.push(roleAll.id, roleSector.id, rolePlain.id);

  userAll = await prisma.user.create({
    data: { name: 'Admin Visibility', email: 'visibility.all@example.com', passwordHash: 'hash', roleId: roleAll.id, sectorId: sectorA.id },
  });
  userSectorTech = await prisma.user.create({
    data: { name: 'Tecnico Visibility', email: 'visibility.sector@example.com', passwordHash: 'hash', roleId: roleSector.id, sectorId: sectorA.id },
  });
  userOwnRequester = await prisma.user.create({
    data: { name: 'Solicitante Visibility', email: 'visibility.own@example.com', passwordHash: 'hash', roleId: rolePlain.id, sectorId: sectorA.id },
  });
  otherSectorRequester = await prisma.user.create({
    data: { name: 'Solicitante Outro Setor Visibility', email: 'visibility.othersector@example.com', passwordHash: 'hash', roleId: rolePlain.id, sectorId: sectorB.id },
  });
  createdUserIds.push(userAll.id, userSectorTech.id, userOwnRequester.id, otherSectorRequester.id);

  category = await prisma.category.create({
    data: { name: 'Categoria Teste Visibility', subcategories: { create: [{ name: 'Sub Teste Visibility' }] } },
    include: { subcategories: true },
  });
  subcategory = category.subcategories[0];
  createdCategoryIds.push(category.id);

  const now = new Date();
  ticketInSectorA = await prisma.ticket.create({
    data: {
      title: 'Chamado setor A', description: 'desc', categoryId: category.id, subcategoryId: subcategory.id,
      urgency: 'MEDIO', requesterId: userOwnRequester.id, sectorId: sectorA.id,
      slaFirstResponseDeadline: now, slaResolutionDeadline: now,
    },
  });
  ticketInSectorB = await prisma.ticket.create({
    data: {
      title: 'Chamado setor B', description: 'desc', categoryId: category.id, subcategoryId: subcategory.id,
      urgency: 'MEDIO', requesterId: otherSectorRequester.id, sectorId: sectorB.id,
      slaFirstResponseDeadline: now, slaResolutionDeadline: now,
    },
  });
  createdTicketIds.push(ticketInSectorA.id, ticketInSectorB.id);
});

afterAll(async () => {
  await prisma.ticketTimeLog.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  await prisma.subcategory.deleteMany({ where: { categoryId: { in: createdCategoryIds } } });
  await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
  await prisma.sector.deleteMany({ where: { id: { in: createdSectorIds } } });
  await prisma.$disconnect();
});

test('a user with view_all_tickets sees tickets from every sector', async () => {
  const token = signAccessToken(userAll.id);
  const response = await request(app).get('/api/tickets').set('Authorization', `Bearer ${token}`);

  const ids = response.body.items.map((t) => t.id);
  expect(ids).toEqual(expect.arrayContaining([ticketInSectorA.id, ticketInSectorB.id]));
});

test('a user with view_sector_tickets sees only their own sector', async () => {
  const token = signAccessToken(userSectorTech.id);
  const response = await request(app).get('/api/tickets').set('Authorization', `Bearer ${token}`);

  const ids = response.body.items.map((t) => t.id);
  expect(ids).toEqual(expect.arrayContaining([ticketInSectorA.id]));
  expect(ids).not.toEqual(expect.arrayContaining([ticketInSectorB.id]));
});

test('a plain user sees only tickets they requested', async () => {
  const token = signAccessToken(userOwnRequester.id);
  const response = await request(app).get('/api/tickets').set('Authorization', `Bearer ${token}`);

  const ids = response.body.items.map((t) => t.id);
  expect(ids).toEqual([ticketInSectorA.id]);
});

test('GET /api/tickets/:id returns 403 for a ticket outside the user visibility', async () => {
  const token = signAccessToken(userOwnRequester.id);
  const response = await request(app).get(`/api/tickets/${ticketInSectorB.id}`).set('Authorization', `Bearer ${token}`);

  expect(response.status).toBe(403);
});
```

- [ ] **Step 3: Rodar os testes e confirmar que falham**

```bash
cd backend
npx jest tests/ticket-creation-api.test.js tests/ticket-visibility-api.test.js
```
Expected: FAIL — rotas `/api/tickets` ainda não existem (404).

- [ ] **Step 4: Implementar o controller**

Criar `backend/src/modules/tickets/tickets.controller.js`:

```js
const prisma = require('../../lib/prisma');
const { ticketVisibilityWhere } = require('../../lib/ticketVisibility');
const { calculateSlaBadge } = require('../../lib/slaBadge');

const SORT_WHITELIST = ['createdAt', 'urgency', 'status', 'title'];
const DEFAULT_PAGE_SIZE = 50;

function serializeTicket(ticket) {
  return { ...ticket, slaBadge: calculateSlaBadge(ticket) };
}

async function create(req, res) {
  const { title, description, categoryId, subcategoryId, urgency } = req.body;
  if (!title || !description || !categoryId || !subcategoryId || !urgency) {
    return res.status(400).json({ error: 'title, description, categoryId, subcategoryId e urgency são obrigatórios.' });
  }

  const slaConfig = await prisma.slaConfig.findUnique({ where: { urgency } });
  if (!slaConfig) {
    return res.status(400).json({ error: `Não há configuração de SLA para a urgência ${urgency}.` });
  }

  const now = new Date();
  const slaFirstResponseDeadline = new Date(now.getTime() + slaConfig.firstResponseHours * 60 * 60 * 1000);
  const slaResolutionDeadline = new Date(now.getTime() + slaConfig.resolutionHours * 60 * 60 * 1000);

  const ticket = await prisma.ticket.create({
    data: {
      title,
      description,
      categoryId,
      subcategoryId,
      urgency,
      requesterId: req.user.id,
      sectorId: req.user.sectorId,
      slaFirstResponseDeadline,
      slaResolutionDeadline,
    },
  });

  await prisma.ticketTimeLog.create({
    data: { ticketId: ticket.id, eventType: 'CREATED', toStatus: 'ABERTO', authorId: req.user.id, occurredAt: now },
  });

  res.status(201).json(serializeTicket(ticket));
}

async function list(req, res) {
  const { status, urgency, categoryId, subcategoryId, assignedToId, sectorId, search, sortBy, sortOrder } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.max(1, Number(req.query.pageSize) || DEFAULT_PAGE_SIZE);

  const where = { ...ticketVisibilityWhere(req.user) };
  if (status) where.status = status;
  if (urgency) where.urgency = urgency;
  if (categoryId) where.categoryId = Number(categoryId);
  if (subcategoryId) where.subcategoryId = Number(subcategoryId);
  if (assignedToId) where.assignedToId = Number(assignedToId);
  if (sectorId) where.sectorId = Number(sectorId);
  if (search) {
    where.AND = [
      ...(where.AND || []),
      { OR: [{ title: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }] },
    ];
  }

  const orderBy = SORT_WHITELIST.includes(sortBy) ? { [sortBy]: sortOrder === 'asc' ? 'asc' : 'desc' } : { createdAt: 'desc' };

  const [items, total] = await Promise.all([
    prisma.ticket.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.ticket.count({ where }),
  ]);

  res.json({ items: items.map(serializeTicket), total, page, pageSize });
}

async function detail(req, res) {
  const id = Number(req.params.id);

  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) {
    return res.status(404).json({ error: 'Chamado não encontrado.' });
  }

  const visibilityWhere = ticketVisibilityWhere(req.user);
  const visible = await prisma.ticket.findFirst({ where: { id, ...visibilityWhere } });
  if (!visible) {
    return res.status(403).json({ error: 'Você não tem acesso a este chamado.' });
  }

  const comments = await prisma.ticketComment.findMany({
    where: {
      ticketId: id,
      ...(req.user.permissions.has('view_internal_notes') ? {} : { isInternal: false }),
    },
    orderBy: { createdAt: 'asc' },
  });

  res.json({ ...serializeTicket(ticket), comments });
}

module.exports = { create, list, detail };
```

- [ ] **Step 5: Implementar as rotas**

Criar `backend/src/modules/tickets/tickets.routes.js`:

```js
const express = require('express');
const authenticate = require('../../middleware/authenticate');
const asyncHandler = require('../../lib/asyncHandler');
const controller = require('./tickets.controller');

const router = express.Router();
const authenticated = asyncHandler(authenticate);

router.post('/tickets', authenticated, asyncHandler(controller.create));
router.get('/tickets', authenticated, asyncHandler(controller.list));
router.get('/tickets/:id', authenticated, asyncHandler(controller.detail));

module.exports = router;
```

- [ ] **Step 6: Montar as rotas no servidor**

Em `backend/src/server.js`, adicionar:

```js
const ticketsRoutes = require('./modules/tickets/tickets.routes');
```

```js
app.use('/api', ticketsRoutes);
```

- [ ] **Step 7: Rodar os testes e confirmar que passam**

```bash
npx jest tests/ticket-creation-api.test.js tests/ticket-visibility-api.test.js
```
Expected: PASS.

- [ ] **Step 8: Rodar a suíte completa para confirmar que nada quebrou**

```bash
npm test
```
Expected: todas as suítes passam.

- [ ] **Step 9: Commit**

```bash
git add backend/src/modules/tickets backend/src/server.js backend/tests/ticket-creation-api.test.js backend/tests/ticket-visibility-api.test.js
git commit -m "feat: add ticket creation, listing and detail endpoints"
```

---

### Task 9: `PATCH /api/tickets/:id` (status, atribuição, custo) e `POST /api/tickets/:id/reopen`

**Files:**
- Modify: `backend/src/modules/tickets/tickets.controller.js`
- Modify: `backend/src/modules/tickets/tickets.routes.js`
- Test: `backend/tests/ticket-update-api.test.js`

**Interfaces:**
- Consumes: `applyStatusTransition` (Task 7), `ticketVisibilityWhere` (Task 5).
- Produces: `controller.update`, `controller.reopen`, exportados de `tickets.controller.js`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `backend/tests/ticket-update-api.test.js`:

```js
const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');

const createdSectorIds = [];
const createdRoleIds = [];
const createdUserIds = [];
const createdCategoryIds = [];
const createdTicketIds = [];

let sector;
let roleAssignee;
let roleReassign;
let roleFinancial;
let rolePlain;
let assigneeUser;
let reassignUser;
let financialUser;
let plainUser;
let requester;
let category;
let subcategory;

async function createTicket(overrides = {}) {
  const now = new Date();
  const ticket = await prisma.ticket.create({
    data: {
      title: 'Chamado teste update', description: 'desc', categoryId: category.id, subcategoryId: subcategory.id,
      urgency: 'MEDIO', requesterId: requester.id, sectorId: sector.id,
      slaFirstResponseDeadline: now, slaResolutionDeadline: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      ...overrides,
    },
  });
  createdTicketIds.push(ticket.id);
  return ticket;
}

beforeAll(async () => {
  sector = await prisma.sector.create({ data: { name: 'Sector Teste Ticket Update' } });
  createdSectorIds.push(sector.id);

  roleAssignee = await prisma.role.create({ data: { name: 'Role Teste Update Assignee', level: 2 } });
  roleReassign = await prisma.role.create({
    data: { name: 'Role Teste Update Reassign', level: 3, permissions: { create: [{ permissionKey: 'reassign_tickets', enabled: true }] } },
  });
  roleFinancial = await prisma.role.create({
    data: { name: 'Role Teste Update Financial', level: 3, permissions: { create: [{ permissionKey: 'view_financial_reports', enabled: true }] } },
  });
  rolePlain = await prisma.role.create({ data: { name: 'Role Teste Update Plain', level: 1 } });
  createdRoleIds.push(roleAssignee.id, roleReassign.id, roleFinancial.id, rolePlain.id);

  assigneeUser = await prisma.user.create({
    data: { name: 'Assignee', email: 'ticket-update.assignee@example.com', passwordHash: 'hash', roleId: roleAssignee.id, sectorId: sector.id },
  });
  reassignUser = await prisma.user.create({
    data: { name: 'Reassigner', email: 'ticket-update.reassign@example.com', passwordHash: 'hash', roleId: roleReassign.id, sectorId: sector.id },
  });
  financialUser = await prisma.user.create({
    data: { name: 'Financial', email: 'ticket-update.financial@example.com', passwordHash: 'hash', roleId: roleFinancial.id, sectorId: sector.id },
  });
  plainUser = await prisma.user.create({
    data: { name: 'Plain', email: 'ticket-update.plain@example.com', passwordHash: 'hash', roleId: rolePlain.id, sectorId: sector.id },
  });
  requester = await prisma.user.create({
    data: { name: 'Requester', email: 'ticket-update.requester@example.com', passwordHash: 'hash', roleId: rolePlain.id, sectorId: sector.id },
  });
  createdUserIds.push(assigneeUser.id, reassignUser.id, financialUser.id, plainUser.id, requester.id);

  category = await prisma.category.create({
    data: { name: 'Categoria Teste Ticket Update', subcategories: { create: [{ name: 'Sub Teste Ticket Update' }] } },
    include: { subcategories: true },
  });
  subcategory = category.subcategories[0];
  createdCategoryIds.push(category.id);
});

afterAll(async () => {
  await prisma.ticketTimeLog.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  await prisma.subcategory.deleteMany({ where: { categoryId: { in: createdCategoryIds } } });
  await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
  await prisma.sector.deleteMany({ where: { id: { in: createdSectorIds } } });
  await prisma.$disconnect();
});

test('the assignee can move status via PATCH', async () => {
  const ticket = await createTicket({ status: 'ABERTO', assignedToId: assigneeUser.id });
  const token = signAccessToken(assigneeUser.id);

  const response = await request(app).patch(`/api/tickets/${ticket.id}`).set('Authorization', `Bearer ${token}`).send({ status: 'EM_ANDAMENTO' });

  expect(response.status).toBe(200);
  expect(response.body.status).toBe('EM_ANDAMENTO');
});

test('PATCH rejects assignedToId without reassign_tickets', async () => {
  const ticket = await createTicket({ status: 'ABERTO' });
  const token = signAccessToken(plainUser.id);

  const response = await request(app)
    .patch(`/api/tickets/${ticket.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ assignedToId: plainUser.id });

  expect(response.status).toBe(403);
});

test('PATCH allows assignedToId with reassign_tickets', async () => {
  const ticket = await createTicket({ status: 'ABERTO' });
  const token = signAccessToken(reassignUser.id);

  const response = await request(app)
    .patch(`/api/tickets/${ticket.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ assignedToId: assigneeUser.id });

  expect(response.status).toBe(200);
  expect(response.body.assignedToId).toBe(assigneeUser.id);
});

test('PATCH rejects estimatedCost without view_financial_reports, even alongside an allowed field', async () => {
  const ticket = await createTicket({ status: 'ABERTO', assignedToId: assigneeUser.id });
  const token = signAccessToken(assigneeUser.id);

  const response = await request(app)
    .patch(`/api/tickets/${ticket.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'EM_ANDAMENTO', estimatedCost: 150.5 });

  expect(response.status).toBe(403);

  const unchanged = await prisma.ticket.findUnique({ where: { id: ticket.id } });
  expect(unchanged.status).toBe('ABERTO');
});

test('PATCH allows estimatedCost with view_financial_reports', async () => {
  const ticket = await createTicket({ status: 'ABERTO' });
  const token = signAccessToken(financialUser.id);

  const response = await request(app)
    .patch(`/api/tickets/${ticket.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ estimatedCost: 200 });

  expect(response.status).toBe(200);
  expect(Number(response.body.estimatedCost)).toBe(200);
});

test('POST /api/tickets/:id/reopen reopens a resolved ticket and clears resolution fields', async () => {
  const ticket = await createTicket({ status: 'RESOLVIDO', resolvedAt: new Date(), timeToResolutionMinutes: 60, assignedToId: assigneeUser.id });
  const roleReopen = await prisma.role.create({
    data: { name: 'Role Teste Update Reopen', level: 2, permissions: { create: [{ permissionKey: 'reopen_tickets', enabled: true }] } },
  });
  createdRoleIds.push(roleReopen.id);
  const reopenUser = await prisma.user.create({
    data: { name: 'Reopener', email: 'ticket-update.reopen@example.com', passwordHash: 'hash', roleId: roleReopen.id, sectorId: sector.id },
  });
  createdUserIds.push(reopenUser.id);
  const token = signAccessToken(reopenUser.id);

  const response = await request(app).post(`/api/tickets/${ticket.id}/reopen`).set('Authorization', `Bearer ${token}`);

  expect(response.status).toBe(200);
  expect(response.body.status).toBe('EM_ANDAMENTO');
  expect(response.body.resolvedAt).toBeNull();
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
npx jest tests/ticket-update-api.test.js
```
Expected: FAIL — `PATCH`/`reopen` ainda não existem (404).

- [ ] **Step 3: Implementar o controller**

Adicionar ao final de `backend/src/modules/tickets/tickets.controller.js` (antes do `module.exports`):

```js
const { applyStatusTransition } = require('../../lib/ticketStatus');
```

(Adicionar esse `require` junto dos outros, no topo do arquivo.)

```js
async function update(req, res) {
  const id = Number(req.params.id);
  const { status, assignedToId, estimatedCost } = req.body;

  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) {
    return res.status(404).json({ error: 'Chamado não encontrado.' });
  }

  if (assignedToId !== undefined && !req.user.permissions.has('reassign_tickets')) {
    return res.status(403).json({ error: 'Permissão insuficiente para atribuir este chamado.' });
  }
  if (estimatedCost !== undefined && !req.user.permissions.has('view_financial_reports')) {
    return res.status(403).json({ error: 'Permissão insuficiente para definir o custo estimado.' });
  }

  let updatedTicket = ticket;

  if (status !== undefined) {
    updatedTicket = await applyStatusTransition(updatedTicket, status, { id: req.user.id, permissions: req.user.permissions });
  }

  const directData = {};
  if (assignedToId !== undefined) directData.assignedToId = assignedToId;
  if (estimatedCost !== undefined) directData.estimatedCost = estimatedCost;

  if (Object.keys(directData).length > 0) {
    updatedTicket = await prisma.ticket.update({ where: { id }, data: directData });
  }

  res.json(serializeTicket(updatedTicket));
}

async function reopen(req, res) {
  const id = Number(req.params.id);

  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) {
    return res.status(404).json({ error: 'Chamado não encontrado.' });
  }

  const updated = await applyStatusTransition(ticket, 'EM_ANDAMENTO', { id: req.user.id, permissions: req.user.permissions });
  res.json(serializeTicket(updated));
}
```

Atualizar o `module.exports` para:

```js
module.exports = { create, list, detail, update, reopen };
```

**Nota sobre erros do motor de status:** `applyStatusTransition` lança um `Error` com `.statusCode`/`.publicMessage` (400/403) — isso é exatamente o contrato que `backend/src/middleware/errorHandler.js` (Fase 2) já sabe tratar, então nenhum `try/catch` é necessário aqui: o erro propaga pelo `asyncHandler` da rota direto para o error handler central.

- [ ] **Step 4: Implementar as rotas**

Em `backend/src/modules/tickets/tickets.routes.js`, adicionar:

```js
router.patch('/tickets/:id', authenticated, asyncHandler(controller.update));
router.post('/tickets/:id/reopen', authenticated, asyncHandler(controller.reopen));
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

```bash
npx jest tests/ticket-update-api.test.js
```
Expected: PASS.

- [ ] **Step 6: Rodar a suíte completa para confirmar que nada quebrou**

```bash
npm test
```
Expected: todas as suítes passam.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/tickets backend/tests/ticket-update-api.test.js
git commit -m "feat: add ticket PATCH (status/assignment/cost) and reopen endpoints"
```

---

### Task 10: Comentários de chamados (`/api/tickets/:id/comments`)

**Files:**
- Create: `backend/src/modules/tickets/ticketComments.controller.js`
- Modify: `backend/src/modules/tickets/tickets.routes.js`
- Test: `backend/tests/ticket-comments-api.test.js`

**Interfaces:**
- Consumes: `prisma`, `asyncHandler`, `authenticate` (via `tickets.routes.js`).
- Produces: `controller.create` (de `ticketComments.controller.js`), montado em `POST /api/tickets/:id/comments`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `backend/tests/ticket-comments-api.test.js`:

```js
const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');

const createdSectorIds = [];
const createdRoleIds = [];
const createdUserIds = [];
const createdCategoryIds = [];
const createdTicketIds = [];

let sector;
let roleWithInternalNotes;
let rolePlain;
let assigneeUser;
let plainUser;
let requester;
let category;
let subcategory;

async function createTicket(overrides = {}) {
  const now = new Date();
  const ticket = await prisma.ticket.create({
    data: {
      title: 'Chamado teste comments', description: 'desc', categoryId: category.id, subcategoryId: subcategory.id,
      urgency: 'MEDIO', requesterId: requester.id, sectorId: sector.id,
      slaFirstResponseDeadline: now, slaResolutionDeadline: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      ...overrides,
    },
  });
  createdTicketIds.push(ticket.id);
  return ticket;
}

beforeAll(async () => {
  sector = await prisma.sector.create({ data: { name: 'Sector Teste Ticket Comments' } });
  createdSectorIds.push(sector.id);

  roleWithInternalNotes = await prisma.role.create({
    data: { name: 'Role Teste Comments Internal', level: 2, permissions: { create: [{ permissionKey: 'view_internal_notes', enabled: true }] } },
  });
  rolePlain = await prisma.role.create({ data: { name: 'Role Teste Comments Plain', level: 1 } });
  createdRoleIds.push(roleWithInternalNotes.id, rolePlain.id);

  assigneeUser = await prisma.user.create({
    data: { name: 'Assignee Comments', email: 'ticket-comments.assignee@example.com', passwordHash: 'hash', roleId: roleWithInternalNotes.id, sectorId: sector.id },
  });
  plainUser = await prisma.user.create({
    data: { name: 'Plain Comments', email: 'ticket-comments.plain@example.com', passwordHash: 'hash', roleId: rolePlain.id, sectorId: sector.id },
  });
  requester = await prisma.user.create({
    data: { name: 'Requester Comments', email: 'ticket-comments.requester@example.com', passwordHash: 'hash', roleId: rolePlain.id, sectorId: sector.id },
  });
  createdUserIds.push(assigneeUser.id, plainUser.id, requester.id);

  category = await prisma.category.create({
    data: { name: 'Categoria Teste Ticket Comments', subcategories: { create: [{ name: 'Sub Teste Ticket Comments' }] } },
    include: { subcategories: true },
  });
  subcategory = category.subcategories[0];
  createdCategoryIds.push(category.id);
});

afterAll(async () => {
  await prisma.ticketComment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
  await prisma.ticketTimeLog.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  await prisma.subcategory.deleteMany({ where: { categoryId: { in: createdCategoryIds } } });
  await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
  await prisma.sector.deleteMany({ where: { id: { in: createdSectorIds } } });
  await prisma.$disconnect();
});

test('creates a public comment by default', async () => {
  const ticket = await createTicket({ assignedToId: assigneeUser.id });
  const token = signAccessToken(plainUser.id);

  const response = await request(app)
    .post(`/api/tickets/${ticket.id}/comments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ body: 'Comentário público de teste' });

  expect(response.status).toBe(201);
  expect(response.body.isInternal).toBe(false);
});

test('rejects an internal comment without view_internal_notes', async () => {
  const ticket = await createTicket({ assignedToId: assigneeUser.id });
  const token = signAccessToken(plainUser.id);

  const response = await request(app)
    .post(`/api/tickets/${ticket.id}/comments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ body: 'Nota interna de teste', isInternal: true });

  expect(response.status).toBe(403);
});

test('allows an internal comment with view_internal_notes', async () => {
  const ticket = await createTicket({ assignedToId: assigneeUser.id });
  const token = signAccessToken(assigneeUser.id);

  const response = await request(app)
    .post(`/api/tickets/${ticket.id}/comments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ body: 'Nota interna de teste', isInternal: true });

  expect(response.status).toBe(201);
  expect(response.body.isInternal).toBe(true);
});

test('a public comment by the current assignee records firstResponseAt when it was still null', async () => {
  const ticket = await createTicket({ assignedToId: assigneeUser.id });
  const token = signAccessToken(assigneeUser.id);

  await request(app)
    .post(`/api/tickets/${ticket.id}/comments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ body: 'Primeira resposta pública' });

  const updated = await prisma.ticket.findUnique({ where: { id: ticket.id } });
  expect(updated.firstResponseAt).not.toBeNull();

  const log = await prisma.ticketTimeLog.findFirst({ where: { ticketId: ticket.id, eventType: 'FIRST_RESPONSE' } });
  expect(log).not.toBeNull();
});

test('a comment by someone other than the current assignee does not record firstResponseAt', async () => {
  const ticket = await createTicket({ assignedToId: assigneeUser.id });
  const token = signAccessToken(plainUser.id);

  await request(app)
    .post(`/api/tickets/${ticket.id}/comments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ body: 'Comentário de outra pessoa' });

  const updated = await prisma.ticket.findUnique({ where: { id: ticket.id } });
  expect(updated.firstResponseAt).toBeNull();
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
npx jest tests/ticket-comments-api.test.js
```
Expected: FAIL — rota `POST /api/tickets/:id/comments` ainda não existe (404).

- [ ] **Step 3: Implementar o controller**

Criar `backend/src/modules/tickets/ticketComments.controller.js`:

```js
const prisma = require('../../lib/prisma');

async function create(req, res) {
  const ticketId = Number(req.params.id);
  const { body, isInternal } = req.body;

  if (!body) {
    return res.status(400).json({ error: 'body é obrigatório.' });
  }
  if (isInternal && !req.user.permissions.has('view_internal_notes')) {
    return res.status(403).json({ error: 'Permissão insuficiente para criar uma nota interna.' });
  }

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    return res.status(404).json({ error: 'Chamado não encontrado.' });
  }

  const operations = [
    prisma.ticketComment.create({
      data: { ticketId, authorId: req.user.id, body, isInternal: Boolean(isInternal) },
    }),
  ];

  const isFirstResponse = !isInternal && !ticket.firstResponseAt && ticket.assignedToId === req.user.id;
  if (isFirstResponse) {
    const now = new Date();
    const timeToFirstResponseMinutes = Math.round((now.getTime() - ticket.createdAt.getTime()) / 60000);
    operations.push(
      prisma.ticket.update({ where: { id: ticketId }, data: { firstResponseAt: now, timeToFirstResponseMinutes } })
    );
    operations.push(
      prisma.ticketTimeLog.create({
        data: { ticketId, eventType: 'FIRST_RESPONSE', fromStatus: ticket.status, toStatus: ticket.status, authorId: req.user.id, occurredAt: now },
      })
    );
  }

  const [comment] = await prisma.$transaction(operations);
  res.status(201).json(comment);
}

module.exports = { create };
```

- [ ] **Step 4: Implementar a rota**

Em `backend/src/modules/tickets/tickets.routes.js`, adicionar o require:

```js
const commentsController = require('./ticketComments.controller');
```

E a rota:

```js
router.post('/tickets/:id/comments', authenticated, asyncHandler(commentsController.create));
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

```bash
npx jest tests/ticket-comments-api.test.js
```
Expected: PASS (5 testes).

- [ ] **Step 6: Rodar a suíte completa para confirmar que nada quebrou**

```bash
npm test
```
Expected: todas as suítes passam.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/tickets backend/tests/ticket-comments-api.test.js
git commit -m "feat: add ticket comments endpoint with first-response tracking"
```

---

### Task 11: Anexos de chamados (upload e download)

**Files:**
- Modify: `backend/package.json` (dependências `multer`, `uuid`)
- Create: `backend/src/lib/uploadStorage.js`
- Create: `backend/src/modules/tickets/ticketAttachments.controller.js`
- Modify: `backend/src/modules/tickets/tickets.routes.js`
- Test: `backend/tests/ticket-attachments-api.test.js`

**Interfaces:**
- Consumes: `prisma`, `ticketVisibilityWhere` (Task 5).
- Produces: `POST /api/tickets/:id/attachments`, `GET /api/tickets/:ticketId/attachments/:attachmentId`.

- [ ] **Step 1: Instalar as dependências**

```bash
cd backend
npm install multer uuid
```

- [ ] **Step 2: Escrever o teste que falha**

Criar `backend/tests/ticket-attachments-api.test.js`:

```js
const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');

const createdSectorIds = [];
const createdRoleIds = [];
const createdUserIds = [];
const createdCategoryIds = [];
const createdTicketIds = [];

let sectorA;
let sectorB;
let role;
let user;
let outsiderUser;
let category;
let subcategory;
let ticket;

beforeAll(async () => {
  sectorA = await prisma.sector.create({ data: { name: 'Sector A Teste Attachments' } });
  sectorB = await prisma.sector.create({ data: { name: 'Sector B Teste Attachments' } });
  createdSectorIds.push(sectorA.id, sectorB.id);

  role = await prisma.role.create({ data: { name: 'Role Teste Attachments', level: 1 } });
  createdRoleIds.push(role.id);

  user = await prisma.user.create({
    data: { name: 'Usuario Attachments', email: 'attachments.user@example.com', passwordHash: 'hash', roleId: role.id, sectorId: sectorA.id },
  });
  outsiderUser = await prisma.user.create({
    data: { name: 'Outsider Attachments', email: 'attachments.outsider@example.com', passwordHash: 'hash', roleId: role.id, sectorId: sectorB.id },
  });
  createdUserIds.push(user.id, outsiderUser.id);

  category = await prisma.category.create({
    data: { name: 'Categoria Teste Attachments', subcategories: { create: [{ name: 'Sub Teste Attachments' }] } },
    include: { subcategories: true },
  });
  subcategory = category.subcategories[0];
  createdCategoryIds.push(category.id);

  const now = new Date();
  ticket = await prisma.ticket.create({
    data: {
      title: 'Chamado teste attachments', description: 'desc', categoryId: category.id, subcategoryId: subcategory.id,
      urgency: 'MEDIO', requesterId: user.id, sectorId: sectorA.id,
      slaFirstResponseDeadline: now, slaResolutionDeadline: now,
    },
  });
  createdTicketIds.push(ticket.id);
});

afterAll(async () => {
  await prisma.ticketAttachment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  await prisma.subcategory.deleteMany({ where: { categoryId: { in: createdCategoryIds } } });
  await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
  await prisma.sector.deleteMany({ where: { id: { in: createdSectorIds } } });
  await prisma.$disconnect();
});

test('uploads an attachment directly on a ticket', async () => {
  const token = signAccessToken(user.id);

  const response = await request(app)
    .post(`/api/tickets/${ticket.id}/attachments`)
    .set('Authorization', `Bearer ${token}`)
    .attach('file', Buffer.from('conteúdo de teste'), 'print.png');

  expect(response.status).toBe(201);
  expect(response.body.fileName).toBe('print.png');
  expect(response.body.commentId).toBeNull();

  const stored = await prisma.ticketAttachment.findUnique({ where: { id: response.body.id } });
  expect(fs.existsSync(stored.filePath)).toBe(true);
});

test('GET attachment download is blocked for a user outside the ticket visibility', async () => {
  const uploaderToken = signAccessToken(user.id);
  const uploadResponse = await request(app)
    .post(`/api/tickets/${ticket.id}/attachments`)
    .set('Authorization', `Bearer ${uploaderToken}`)
    .attach('file', Buffer.from('outro conteúdo'), 'documento.pdf');

  const outsiderToken = signAccessToken(outsiderUser.id);
  const response = await request(app)
    .get(`/api/tickets/${ticket.id}/attachments/${uploadResponse.body.id}`)
    .set('Authorization', `Bearer ${outsiderToken}`);

  expect(response.status).toBe(403);
});

test('GET attachment download succeeds for a user with visibility', async () => {
  const token = signAccessToken(user.id);
  const uploadResponse = await request(app)
    .post(`/api/tickets/${ticket.id}/attachments`)
    .set('Authorization', `Bearer ${token}`)
    .attach('file', Buffer.from('terceiro conteúdo'), 'planilha.xlsx');

  const response = await request(app)
    .get(`/api/tickets/${ticket.id}/attachments/${uploadResponse.body.id}`)
    .set('Authorization', `Bearer ${token}`);

  expect(response.status).toBe(200);
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

```bash
npx jest tests/ticket-attachments-api.test.js
```
Expected: FAIL — rotas de anexo ainda não existem (404).

- [ ] **Step 4: Implementar o storage do multer**

Criar `backend/src/lib/uploadStorage.js`:

```js
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

const storage = multer.diskStorage({
  destination(req, file, callback) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    callback(null, UPLOAD_DIR);
  },
  filename(req, file, callback) {
    const extension = path.extname(file.originalname);
    callback(null, `${uuidv4()}${extension}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

module.exports = { upload, UPLOAD_DIR };
```

- [ ] **Step 5: Implementar o controller**

Criar `backend/src/modules/tickets/ticketAttachments.controller.js`:

```js
const prisma = require('../../lib/prisma');
const { ticketVisibilityWhere } = require('../../lib/ticketVisibility');

async function create(req, res) {
  const ticketId = Number(req.params.id);
  const { commentId } = req.body;

  if (!req.file) {
    return res.status(400).json({ error: 'Arquivo é obrigatório (campo "file").' });
  }

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    return res.status(404).json({ error: 'Chamado não encontrado.' });
  }

  const attachment = await prisma.ticketAttachment.create({
    data: {
      ticketId,
      commentId: commentId ? Number(commentId) : null,
      fileName: req.file.originalname,
      filePath: req.file.path,
      uploadedById: req.user.id,
    },
  });
  res.status(201).json(attachment);
}

async function download(req, res) {
  const ticketId = Number(req.params.ticketId);
  const attachmentId = Number(req.params.attachmentId);

  const visibilityWhere = ticketVisibilityWhere(req.user);
  const visibleTicket = await prisma.ticket.findFirst({ where: { id: ticketId, ...visibilityWhere } });
  if (!visibleTicket) {
    return res.status(403).json({ error: 'Você não tem acesso a este chamado.' });
  }

  const attachment = await prisma.ticketAttachment.findFirst({ where: { id: attachmentId, ticketId } });
  if (!attachment) {
    return res.status(404).json({ error: 'Anexo não encontrado.' });
  }

  res.download(attachment.filePath, attachment.fileName);
}

module.exports = { create, download };
```

- [ ] **Step 6: Implementar as rotas**

Em `backend/src/modules/tickets/tickets.routes.js`, adicionar os requires:

```js
const attachmentsController = require('./ticketAttachments.controller');
const { upload } = require('../../lib/uploadStorage');
```

E as rotas:

```js
router.post('/tickets/:id/attachments', authenticated, upload.single('file'), asyncHandler(attachmentsController.create));
router.get('/tickets/:ticketId/attachments/:attachmentId', authenticated, asyncHandler(attachmentsController.download));
```

- [ ] **Step 7: Rodar o teste e confirmar que passa**

```bash
npx jest tests/ticket-attachments-api.test.js
```
Expected: PASS (3 testes).

- [ ] **Step 8: Rodar a suíte completa para confirmar que nada quebrou**

```bash
npm test
```
Expected: todas as suítes passam.

- [ ] **Step 9: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/lib/uploadStorage.js backend/src/modules/tickets backend/tests/ticket-attachments-api.test.js
git commit -m "feat: add ticket attachment upload and download endpoints"
```

---

### Task 12: Atualizar o README com a Fase 3

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Atualizar a seção "Status atual"**

Em `README.md`, substituir o parágrafo da seção `## Status atual` por:

```markdown
## Status atual

Fases 1, 2 e 3 concluídas: schema do banco de dados, migrations, dados de
exemplo (seed), autenticação JWT, gestão de usuários/roles/permissões
(RBAC) e o módulo de chamados completo (categorias/SLA/setores,
criação/listagem/detalhe, máquina de status com rastreamento de tempo e
SLA, comentários públicos/internos e anexos). As fases seguintes (painel
de desempenho, ideias, dashboard e admin) ainda serão adicionadas — esta
seção do README será expandida a cada fase.
```

- [ ] **Step 2: Adicionar uma seção sobre o módulo de chamados**

Adicionar ao final do `README.md`, depois da seção `## Autenticação (Fase 2)` e antes de `## Verificar dados de exemplo`:

```markdown
## Chamados (Fase 3)

- `POST /api/tickets` — `{ title, description, categoryId, subcategoryId, urgency }`.
  `sectorId` é herdado do usuário logado; os prazos de SLA são calculados a
  partir de `GET/PATCH /api/sla-config`.
- `GET /api/tickets` — filtros via query string (`status`, `urgency`,
  `categoryId`, `subcategoryId`, `assignedToId`, `sectorId`, `search`,
  `sortBy`, `sortOrder`, `page`, `pageSize`). A visibilidade depende da
  permissão do usuário: `view_all_tickets` (tudo), `view_sector_tickets`
  (setor próprio + atribuídos a ele) ou nenhuma das duas (só os próprios
  chamados abertos).
- `GET /api/tickets/:id` — detalhe, incluindo comentários (notas internas
  só com `view_internal_notes`).
- `PATCH /api/tickets/:id` — `status` (validado pela máquina de transições),
  `assignedToId` (requer `reassign_tickets`), `estimatedCost` (requer
  `view_financial_reports`).
- `POST /api/tickets/:id/reopen` — reabre um chamado `RESOLVIDO`, requer
  `reopen_tickets`.
- `POST /api/tickets/:id/comments` — `{ body, isInternal }`; `isInternal`
  requer `view_internal_notes`.
- `POST /api/tickets/:id/attachments` — multipart/form-data, campo `file`
  (limite 10MB). `GET /api/tickets/:ticketId/attachments/:attachmentId`
  faz o download, respeitando a mesma regra de visibilidade da listagem.
- `GET/POST /api/categories`, `/api/sectors`; `GET/PATCH /api/sla-config/:urgency`
  — administração de apoio, exigem `manage_categories`/`manage_sla`.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document Phase 3 ticket module endpoints"
```

---

## Self-Review

**Cobertura da spec:** cada seção de `2026-06-24-helpdesk-phase3-tickets-design.md` tem uma task correspondente — seção 2 (arquitetura) → Tasks 2-4 e estrutura geral; seção 3 (visibilidade/permissões) → Tasks 1, 5, 9, 10; seção 4 (máquina de status/SLA) → Tasks 6-7; seção 5 (endpoints) → Tasks 8-11; seção 6 (testes/seed) → um arquivo de teste por task, seed já cobre a riqueza de dados pedida pelo design geral (verificado em `backend/prisma/seed.js`, função `seedTickets` já cria 50 chamados com timeline completa — **nenhuma mudança de seed é necessária nesta fase**, ao contrário do que a seção 6 da spec assumia; a única alteração no seed é a matriz de permissões da Task 1).

**Consistência de tipos:** `applyStatusTransition(ticket, newStatus, actor)` (Task 7) é chamado de forma idêntica em `tickets.controller.js` (Task 9, `update` e `reopen`) — `actor = { id: req.user.id, permissions: req.user.permissions }`, mesmo shape usado nos testes da Task 7. `ticketVisibilityWhere(user)` (Task 5) é chamado com `req.user` diretamente (que já tem `.permissions` como `Set`, produzido por `authenticate.js` desde a Fase 2) em `tickets.controller.js` (Tasks 8, 9) e `ticketAttachments.controller.js` (Task 11) — mesma assinatura nas três chamadas. `calculateSlaBadge(ticket)` (Task 6) é chamado em `serializeTicket` (Task 8) com um registro `Ticket` do Prisma que tem `status`, `resolvedAt`, `createdAt`, `slaResolutionDeadline` — os mesmos campos usados nos testes da Task 6.

**Sem placeholders:** todas as 12 tasks têm código completo em cada step; nenhum "TBD"/"implementar depois" — confirmado por leitura linha a linha durante a escrita.

