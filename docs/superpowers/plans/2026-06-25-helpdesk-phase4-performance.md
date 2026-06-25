# Fase 4 — API de Desempenho da Equipe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar três endpoints REST (`/api/performance/summary`, `/api/performance/users/:id/drilldown`, `/api/performance/export`) que agregam métricas de atendimento com filtros por período, setor e categoria, incluindo exportação CSV e PDF.

**Architecture:** Módulo `performance` com controller + routes seguindo o padrão dos módulos existentes. Helpers puros `csvExport.js` e `pdfExport.js` recebem o objeto `summary` montado pelo controller e serializam — sem acesso ao banco. Queries de agregação usam Prisma ORM onde possível e `$queryRaw` somente para a comparação coluna-a-coluna de SLA (`resolvedAt <= slaResolutionDeadline`).

**Tech Stack:** Node.js + Express 4 + Prisma 5 + PostgreSQL + Jest + Supertest + pdfkit

## Global Constraints

- Per-route auth: `const auth = [asyncHandler(authenticate), requirePermission('view_performance_panel')]` — nunca `router.use()`
- Nomes no banco: tabela `"tickets"` (minúsculo via `@@map`); colunas em camelCase com aspas duplas no SQL raw: `"createdAt"`, `"resolvedAt"`, `"slaResolutionDeadline"`, `"sectorId"`, `"categoryId"`, `"assignedToId"`
- `from`/`to` aceitam `YYYY-MM-DD`; backend normaliza `from` para `T00:00:00.000Z` e `to` para `T23:59:59.999Z`
- `avgFirstResponseMinutes`, `avgResolutionMinutes`: arredondados com `Math.round`; `null` se sem dados
- `slaComplianceRate`: fração (0.0–1.0), `Math.round(compliant/total * 100) / 100`; `null` se sem chamados resolvidos
- `byStatus` e `byUrgency` no drilldown: inicializar com todos os valores do enum em `0` antes de sobrepor com o `groupBy`
- `sectorId`/`categoryId` inexistente → 200 com resultados vazios (filtro não casa nada), não 404
- Permissão `view_performance_panel` já existe em `PERMISSION_KEYS` e no seed — NÃO duplicar
- Testes de integração contra Postgres real (sem mocks), padrão de `beforeAll`/`afterAll` dos outros módulos
- Diretório de trabalho: `C:/Users/Marcelo/Desktop/CHAMADOS`

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---------|------|-----------------|
| `backend/src/lib/csvExport.js` | Criar | Serializa objeto `summary` para string CSV |
| `backend/src/lib/pdfExport.js` | Criar | Serializa objeto `summary` para Buffer PDF (pdfkit) |
| `backend/src/modules/performance/performance.controller.js` | Criar | Funções `summary`, `drilldown`, `exportData` + helper `buildSummary` |
| `backend/src/modules/performance/performance.routes.js` | Criar | 3 rotas GET com per-route auth |
| `backend/src/server.js` | Modificar | `app.use('/api', performanceRoutes)` |
| `backend/tests/csv-export-lib.test.js` | Criar | Testes unitários do helper CSV |
| `backend/tests/pdf-export-lib.test.js` | Criar | Teste básico do helper PDF |
| `backend/tests/performance-api.test.js` | Criar | 10 testes de integração |
| `backend/package.json` | Modificar | `npm install pdfkit` |

---

### Task 1: Verificar permissão view_performance_panel

**Files:**
- Read-only: `backend/src/lib/permissions.js`, `backend/prisma/seed.js`

**Interfaces:**
- Produces: confirmação de que `'view_performance_panel'` existe em `PERMISSION_KEYS` (linha 6) e no `rolePermissionMatrix` do seed. Nenhum arquivo modificado se tudo correto.

- [ ] **Step 1: Verificar permissions.js**

```bash
cd backend
node -e "const { PERMISSION_KEYS } = require('./src/lib/permissions'); console.log(PERMISSION_KEYS.includes('view_performance_panel'));"
```
Expected output: `true`

- [ ] **Step 2: Verificar seed.js**

```bash
grep -n "view_performance_panel" prisma/seed.js
```
Expected: pelo menos 2 ocorrências (Gestor e/ou `allPermissionKeys` para Admin).

- [ ] **Step 3: Se a permissão faltar (improvável), adicionar**

Somente se o Step 1 retornar `false`: adicionar `'view_performance_panel'` ao array `PERMISSION_KEYS` em `backend/src/lib/permissions.js` e ao `rolePermissionMatrix` para Gestor e Admin em `backend/prisma/seed.js`. Confirmar com `npm test -- --testPathPattern=permissions-lib --no-coverage`.

Se tudo já existir (esperado), não modificar nada e seguir para Task 2.

---

### Task 2: Helper csvExport.js

**Files:**
- Create: `backend/src/lib/csvExport.js`
- Test: `backend/tests/csv-export-lib.test.js`

**Interfaces:**
- Consumes: objeto `summary` com shape `{ period: { from, to }, overall: { totalTickets, avgFirstResponseMinutes, avgResolutionMinutes, slaComplianceRate }, byUser: [{ userId, userName, sectorName, totalTickets, avgFirstResponseMinutes, avgResolutionMinutes, slaComplianceRate }] }`
- Produces: `generateCsv(summary)` → `string` (CSV)

- [ ] **Step 1: Criar o arquivo de teste**

Criar `backend/tests/csv-export-lib.test.js`:

```js
const { generateCsv } = require('../src/lib/csvExport');

const baseSummary = {
  period: { from: '2026-06-01', to: '2026-06-25' },
  overall: {
    totalTickets: 10,
    avgFirstResponseMinutes: 30,
    avgResolutionMinutes: 120,
    slaComplianceRate: 0.8,
  },
  byUser: [
    {
      userId: 1,
      userName: 'Ana Lima',
      sectorName: 'TI',
      totalTickets: 10,
      avgFirstResponseMinutes: 30,
      avgResolutionMinutes: 120,
      slaComplianceRate: 0.8,
    },
  ],
};

test('generates CSV with correct structure and headers', () => {
  const csv = generateCsv(baseSummary);
  const lines = csv.split('\n');

  expect(lines[0]).toBe('De,Até');
  expect(lines[1]).toBe('2026-06-01,2026-06-25');
  expect(lines[2]).toBe('');
  expect(lines[3]).toBe('Total de chamados,Média 1ª resposta (min),Média resolução (min),SLA cumprido');
  expect(lines[4]).toBe('10,30,120,80%');
  expect(lines[5]).toBe('');
  expect(lines[6]).toBe('Técnico,Setor,Chamados,Média 1ª resposta (min),Média resolução (min),SLA cumprido');
  expect(lines[7]).toBe('Ana Lima,TI,10,30,120,80%');
});

test('formats null values as N/A', () => {
  const summary = {
    ...baseSummary,
    overall: {
      totalTickets: 5,
      avgFirstResponseMinutes: null,
      avgResolutionMinutes: null,
      slaComplianceRate: null,
    },
    byUser: [
      { ...baseSummary.byUser[0], avgFirstResponseMinutes: null, avgResolutionMinutes: null, slaComplianceRate: null },
    ],
  };

  const csv = generateCsv(summary);
  const lines = csv.split('\n');

  expect(lines[4]).toBe('5,N/A,N/A,N/A');
  expect(lines[7]).toContain('N/A,N/A,N/A');
});

test('handles empty byUser list', () => {
  const summary = { ...baseSummary, byUser: [] };
  const csv = generateCsv(summary);
  const lines = csv.split('\n');

  expect(lines[6]).toBe('Técnico,Setor,Chamados,Média 1ª resposta (min),Média resolução (min),SLA cumprido');
  expect(lines[7]).toBeUndefined();
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd backend
npx jest tests/csv-export-lib.test.js --no-coverage
```
Expected: FAIL — `Cannot find module '../src/lib/csvExport'`

- [ ] **Step 3: Implementar csvExport.js**

Criar `backend/src/lib/csvExport.js`:

```js
function fmt(val) {
  return val === null || val === undefined ? 'N/A' : String(val);
}

function fmtRate(rate) {
  return rate === null || rate === undefined ? 'N/A' : Math.round(rate * 100) + '%';
}

function generateCsv(summary) {
  const { period, overall, byUser } = summary;
  const lines = [];

  lines.push('De,Até');
  lines.push(`${period.from},${period.to}`);
  lines.push('');

  lines.push('Total de chamados,Média 1ª resposta (min),Média resolução (min),SLA cumprido');
  lines.push(
    `${overall.totalTickets},${fmt(overall.avgFirstResponseMinutes)},${fmt(overall.avgResolutionMinutes)},${fmtRate(overall.slaComplianceRate)}`
  );
  lines.push('');

  lines.push('Técnico,Setor,Chamados,Média 1ª resposta (min),Média resolução (min),SLA cumprido');
  for (const u of byUser) {
    lines.push(
      `${u.userName},${u.sectorName},${u.totalTickets},${fmt(u.avgFirstResponseMinutes)},${fmt(u.avgResolutionMinutes)},${fmtRate(u.slaComplianceRate)}`
    );
  }

  return lines.join('\n');
}

module.exports = { generateCsv };
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
npx jest tests/csv-export-lib.test.js --no-coverage
```
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/Marcelo/Desktop/CHAMADOS"
git add backend/src/lib/csvExport.js backend/tests/csv-export-lib.test.js
git commit -m "feat: add CSV export helper for performance report"
```

---

### Task 3: Helper pdfExport.js

**Files:**
- Modify: `backend/package.json` (instalar pdfkit)
- Create: `backend/src/lib/pdfExport.js`
- Test: `backend/tests/pdf-export-lib.test.js`

**Interfaces:**
- Consumes: mesmo shape de `summary` que `generateCsv`
- Produces: `generatePdf(summary)` → `Promise<Buffer>` (PDF com magic bytes `%PDF`)

- [ ] **Step 1: Instalar pdfkit**

```bash
cd backend
npm install pdfkit
```
Expected: pdfkit adicionado ao `package.json` dependencies.

- [ ] **Step 2: Criar o arquivo de teste**

Criar `backend/tests/pdf-export-lib.test.js`:

```js
const { generatePdf } = require('../src/lib/pdfExport');

const summary = {
  period: { from: '2026-06-01', to: '2026-06-25' },
  overall: {
    totalTickets: 10,
    avgFirstResponseMinutes: 30,
    avgResolutionMinutes: 120,
    slaComplianceRate: 0.8,
  },
  byUser: [
    {
      userId: 1,
      userName: 'Ana Lima',
      sectorName: 'TI',
      totalTickets: 10,
      avgFirstResponseMinutes: 30,
      avgResolutionMinutes: 120,
      slaComplianceRate: 0.8,
    },
  ],
};

test('generates a non-empty PDF buffer with correct magic bytes', async () => {
  const buffer = await generatePdf(summary);
  expect(Buffer.isBuffer(buffer)).toBe(true);
  expect(buffer.length).toBeGreaterThan(100);
  expect(buffer.slice(0, 4).toString()).toBe('%PDF');
});

test('handles null values without throwing', async () => {
  const nullSummary = {
    ...summary,
    overall: { totalTickets: 0, avgFirstResponseMinutes: null, avgResolutionMinutes: null, slaComplianceRate: null },
    byUser: [],
  };
  await expect(generatePdf(nullSummary)).resolves.toBeInstanceOf(Buffer);
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

```bash
npx jest tests/pdf-export-lib.test.js --no-coverage
```
Expected: FAIL — `Cannot find module '../src/lib/pdfExport'`

- [ ] **Step 4: Implementar pdfExport.js**

Criar `backend/src/lib/pdfExport.js`:

```js
const PDFDocument = require('pdfkit');

function fmt(val) {
  return val === null || val === undefined ? 'N/A' : String(val);
}

function fmtRate(rate) {
  return rate === null || rate === undefined ? 'N/A' : Math.round(rate * 100) + '%';
}

async function generatePdf(summary) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const { period, overall, byUser } = summary;

    doc.fontSize(16).text('Relatório de Desempenho da Equipe', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Período: ${period.from} a ${period.to}`);
    doc.moveDown();

    doc.fontSize(13).text('Métricas Gerais');
    doc.fontSize(10);
    doc.text(`Total de chamados: ${overall.totalTickets}`);
    doc.text(`Média 1ª resposta: ${fmt(overall.avgFirstResponseMinutes)} min`);
    doc.text(`Média resolução: ${fmt(overall.avgResolutionMinutes)} min`);
    doc.text(`SLA cumprido: ${fmtRate(overall.slaComplianceRate)}`);
    doc.moveDown();

    if (byUser.length > 0) {
      doc.fontSize(13).text('Por Técnico');
      doc.fontSize(10);
      for (const u of byUser) {
        doc.text(
          `${u.userName} (${u.sectorName}) — ${u.totalTickets} chamados | ` +
          `1ª resp: ${fmt(u.avgFirstResponseMinutes)} min | ` +
          `Resolução: ${fmt(u.avgResolutionMinutes)} min | ` +
          `SLA: ${fmtRate(u.slaComplianceRate)}`
        );
      }
    }

    doc.end();
  });
}

module.exports = { generatePdf };
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

```bash
npx jest tests/pdf-export-lib.test.js --no-coverage
```
Expected: PASS (2 testes)

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/Marcelo/Desktop/CHAMADOS"
git add backend/package.json backend/package-lock.json backend/src/lib/pdfExport.js backend/tests/pdf-export-lib.test.js
git commit -m "feat: add PDF export helper for performance report"
```

---

### Task 4: API de performance (controller + routes + testes de integração)

**Files:**
- Create: `backend/src/modules/performance/performance.controller.js`
- Create: `backend/src/modules/performance/performance.routes.js`
- Modify: `backend/src/server.js`
- Test: `backend/tests/performance-api.test.js`

**Interfaces:**
- Consumes:
  - `prisma` de `../../lib/prisma`
  - `Prisma` (namespace) de `@prisma/client`
  - `calculateSlaBadge(ticket)` de `../../lib/slaBadge` — recebe `{ status, resolvedAt, createdAt, slaResolutionDeadline, slaFirstResponseDeadline }`
  - `generateCsv(summary)` de `../../lib/csvExport`
  - `generatePdf(summary)` de `../../lib/pdfExport`
  - `authenticate` de `../../middleware/authenticate`
  - `requirePermission` de `../../middleware/requirePermission`
  - `asyncHandler` de `../../lib/asyncHandler`
- Produces:
  - `GET /api/performance/summary` → JSON
  - `GET /api/performance/users/:id/drilldown` → JSON
  - `GET /api/performance/export` → file download

- [ ] **Step 1: Criar o arquivo de teste de integração**

Criar `backend/tests/performance-api.test.js`:

```js
const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');

const ids = { sectors: [], roles: [], users: [], categories: [], tickets: [] };

let techToken;
let noPermToken;
let techUserId;

// Datas fixas para controle do período nos testes
const PERIOD_FROM = '2026-01-01';
const PERIOD_TO = '2026-12-31';
const inPeriod = (offsetDays = 0) =>
  new Date(`2026-06-${String(10 + offsetDays).padStart(2, '0')}T10:00:00.000Z`);

beforeAll(async () => {
  const sector = await prisma.sector.create({ data: { name: 'Setor Perf API Test' } });
  ids.sectors.push(sector.id);

  const techRole = await prisma.role.create({
    data: {
      name: 'Role Perf API Tech',
      level: 2,
      permissions: { create: [{ permissionKey: 'view_performance_panel', enabled: true }] },
    },
  });
  ids.roles.push(techRole.id);

  const noPermRole = await prisma.role.create({
    data: { name: 'Role Perf API NoPerm', level: 1 },
  });
  ids.roles.push(noPermRole.id);

  const techUser = await prisma.user.create({
    data: {
      name: 'Tech Perf API',
      email: 'perf-api.tech@example.com',
      passwordHash: 'hash',
      roleId: techRole.id,
      sectorId: sector.id,
    },
  });
  ids.users.push(techUser.id);
  techUserId = techUser.id;
  techToken = signAccessToken(techUser.id);

  const noPermUser = await prisma.user.create({
    data: {
      name: 'NoPerm Perf API',
      email: 'perf-api.noperm@example.com',
      passwordHash: 'hash',
      roleId: noPermRole.id,
      sectorId: sector.id,
    },
  });
  ids.users.push(noPermUser.id);
  noPermToken = signAccessToken(noPermUser.id);

  const category = await prisma.category.create({
    data: {
      name: 'Cat Perf API',
      subcategories: { create: [{ name: 'Sub Perf API' }] },
    },
    include: { subcategories: true },
  });
  ids.categories.push(category.id);
  const subcategoryId = category.subcategories[0].id;

  const baseTicket = {
    categoryId: category.id,
    subcategoryId,
    requesterId: techUser.id,
    sectorId: sector.id,
    urgency: 'MEDIO',
    slaFirstResponseDeadline: new Date('2026-06-10T18:00:00.000Z'),
    slaResolutionDeadline: new Date('2026-06-11T10:00:00.000Z'),
  };

  // Ticket 1: assignado ao tech, RESOLVIDO, SLA cumprido
  const t1 = await prisma.ticket.create({
    data: {
      ...baseTicket,
      title: 'Ticket Perf 1',
      description: 'desc',
      assignedToId: techUser.id,
      status: 'RESOLVIDO',
      createdAt: inPeriod(0),
      firstResponseAt: new Date(inPeriod(0).getTime() + 30 * 60 * 1000),
      timeToFirstResponseMinutes: 30,
      resolvedAt: new Date(inPeriod(0).getTime() + 120 * 60 * 1000),
      timeToResolutionMinutes: 120,
      // resolvedAt (2026-06-10T12:00) <= slaResolutionDeadline (2026-06-11T10:00) → SLA cumprido
    },
  });
  ids.tickets.push(t1.id);

  // Ticket 2: assignado ao tech, RESOLVIDO, SLA perdido
  const t2 = await prisma.ticket.create({
    data: {
      ...baseTicket,
      title: 'Ticket Perf 2',
      description: 'desc',
      assignedToId: techUser.id,
      status: 'RESOLVIDO',
      createdAt: inPeriod(1),
      firstResponseAt: new Date(inPeriod(1).getTime() + 60 * 60 * 1000),
      timeToFirstResponseMinutes: 60,
      resolvedAt: new Date(inPeriod(1).getTime() + 30 * 60 * 60 * 1000),
      timeToResolutionMinutes: 1800,
      // resolvedAt (2026-06-11T16:00) > slaResolutionDeadline (2026-06-11T10:00) → SLA perdido
    },
  });
  ids.tickets.push(t2.id);

  // Ticket 3: assignado ao tech, ABERTO (sem resolvedAt)
  const t3 = await prisma.ticket.create({
    data: {
      ...baseTicket,
      title: 'Ticket Perf 3',
      description: 'desc',
      assignedToId: techUser.id,
      status: 'ABERTO',
      urgency: 'ALTO',
      createdAt: inPeriod(2),
    },
  });
  ids.tickets.push(t3.id);
});

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { id: { in: ids.tickets } } });
  await prisma.subcategory.deleteMany({ where: { categoryId: { in: ids.categories } } });
  await prisma.category.deleteMany({ where: { id: { in: ids.categories } } });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  await prisma.role.deleteMany({ where: { id: { in: ids.roles } } });
  await prisma.sector.deleteMany({ where: { id: { in: ids.sectors } } });
  await prisma.$disconnect();
});

// --- summary ---

test('GET /summary retorna métricas corretas para o período', async () => {
  const res = await request(app)
    .get(`/api/performance/summary?from=${PERIOD_FROM}&to=${PERIOD_TO}`)
    .set('Authorization', `Bearer ${techToken}`);

  expect(res.status).toBe(200);
  expect(res.body.overall.totalTickets).toBe(3);
  // 2 resolvidos: avg timeToFirstResponseMinutes = round((30+60)/2) = 45
  expect(res.body.overall.avgFirstResponseMinutes).toBe(45);
  // avg timeToResolutionMinutes = round((120+1800)/2) = 960
  expect(res.body.overall.avgResolutionMinutes).toBe(960);
  // SLA: 1 cumprido de 2 resolvidos = 0.5
  expect(res.body.overall.slaComplianceRate).toBe(0.5);
  // byUser deve conter o técnico
  expect(res.body.byUser).toHaveLength(1);
  expect(res.body.byUser[0].userId).toBe(techUserId);
  expect(res.body.byUser[0].totalTickets).toBe(3);
});

test('GET /summary retorna 400 sem from/to', async () => {
  const res = await request(app)
    .get('/api/performance/summary')
    .set('Authorization', `Bearer ${techToken}`);
  expect(res.status).toBe(400);
});

test('GET /summary retorna 400 com from > to', async () => {
  const res = await request(app)
    .get('/api/performance/summary?from=2026-12-31&to=2026-01-01')
    .set('Authorization', `Bearer ${techToken}`);
  expect(res.status).toBe(400);
});

test('GET /summary retorna 403 sem view_performance_panel', async () => {
  const res = await request(app)
    .get(`/api/performance/summary?from=${PERIOD_FROM}&to=${PERIOD_TO}`)
    .set('Authorization', `Bearer ${noPermToken}`);
  expect(res.status).toBe(403);
});

// --- drilldown ---

test('GET /users/:id/drilldown retorna métricas e byStatus com zeros', async () => {
  const res = await request(app)
    .get(`/api/performance/users/${techUserId}/drilldown?from=${PERIOD_FROM}&to=${PERIOD_TO}`)
    .set('Authorization', `Bearer ${techToken}`);

  expect(res.status).toBe(200);
  expect(res.body.user.id).toBe(techUserId);
  expect(res.body.metrics.totalTickets).toBe(3);
  expect(res.body.metrics.byStatus.ABERTO).toBe(1);
  expect(res.body.metrics.byStatus.RESOLVIDO).toBe(2);
  expect(res.body.metrics.byStatus.EM_ANDAMENTO).toBe(0);
  expect(res.body.metrics.byUrgency.MEDIO).toBe(2);
  expect(res.body.metrics.byUrgency.ALTO).toBe(1);
  expect(res.body.tickets).toHaveLength(3);
  // todos os tickets têm slaBadge
  expect(['verde', 'amarelo', 'vermelho']).toContain(res.body.tickets[0].slaBadge);
});

test('GET /users/:id/drilldown retorna 404 para usuário inexistente', async () => {
  const res = await request(app)
    .get(`/api/performance/users/999999/drilldown?from=${PERIOD_FROM}&to=${PERIOD_TO}`)
    .set('Authorization', `Bearer ${techToken}`);
  expect(res.status).toBe(404);
});

// --- export ---

test('GET /export?format=csv retorna 200 com Content-Type text/csv', async () => {
  const res = await request(app)
    .get(`/api/performance/export?from=${PERIOD_FROM}&to=${PERIOD_TO}&format=csv`)
    .set('Authorization', `Bearer ${techToken}`);

  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/text\/csv/);
  expect(res.headers['content-disposition']).toMatch(/attachment/);
  expect(res.text).toContain('De,Até');
});

test('GET /export?format=pdf retorna 200 com Content-Type application/pdf', async () => {
  const res = await request(app)
    .get(`/api/performance/export?from=${PERIOD_FROM}&to=${PERIOD_TO}&format=pdf`)
    .set('Authorization', `Bearer ${techToken}`);

  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/application\/pdf/);
  expect(res.body).toBeDefined();
});

test('GET /export sem permissão retorna 403', async () => {
  const res = await request(app)
    .get(`/api/performance/export?from=${PERIOD_FROM}&to=${PERIOD_TO}&format=csv`)
    .set('Authorization', `Bearer ${noPermToken}`);
  expect(res.status).toBe(403);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd backend
npx jest tests/performance-api.test.js --no-coverage
```
Expected: FAIL — rotas `/api/performance/*` retornam 404.

- [ ] **Step 3: Criar performance.controller.js**

Criar `backend/src/modules/performance/performance.controller.js`:

```js
const { Prisma } = require('@prisma/client');
const prisma = require('../../lib/prisma');
const { calculateSlaBadge } = require('../../lib/slaBadge');
const { generateCsv } = require('../../lib/csvExport');
const { generatePdf } = require('../../lib/pdfExport');

const STATUS_KEYS = ['ABERTO', 'EM_ANDAMENTO', 'AGUARDANDO', 'RESOLVIDO', 'FECHADO'];
const URGENCY_KEYS = ['CRITICO', 'ALTO', 'MEDIO', 'BAIXO'];

function parseDates(req, res) {
  const { from, to } = req.query;
  if (!from || !to) {
    res.status(400).json({ error: 'Os parâmetros from e to são obrigatórios (YYYY-MM-DD).' });
    return null;
  }
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    res.status(400).json({ error: 'Formato de data inválido. Use YYYY-MM-DD.' });
    return null;
  }
  if (fromDate > toDate) {
    res.status(400).json({ error: 'from não pode ser posterior a to.' });
    return null;
  }
  return { fromDate, toDate, from, to };
}

function parseFilters(req, res) {
  const { sectorId, categoryId } = req.query;
  const filters = {};
  if (sectorId !== undefined) {
    const parsed = Number(sectorId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      res.status(400).json({ error: 'sectorId deve ser um número inteiro positivo.' });
      return null;
    }
    filters.sectorId = parsed;
  }
  if (categoryId !== undefined) {
    const parsed = Number(categoryId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      res.status(400).json({ error: 'categoryId deve ser um número inteiro positivo.' });
      return null;
    }
    filters.categoryId = parsed;
  }
  return filters;
}

function roundOrNull(val) {
  return val != null ? Math.round(val) : null;
}

async function buildSummary(fromDate, toDate, from, to, filters) {
  const where = {
    createdAt: { gte: fromDate, lte: toDate },
    ...(filters.sectorId ? { sectorId: filters.sectorId } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
  };

  // Métricas gerais via Prisma ORM
  const agg = await prisma.ticket.aggregate({
    where,
    _count: { id: true },
    _avg: { timeToFirstResponseMinutes: true, timeToResolutionMinutes: true },
  });

  // SLA overall via $queryRaw (comparação coluna-a-coluna)
  const sectorClause = filters.sectorId ? Prisma.sql`AND "sectorId" = ${filters.sectorId}` : Prisma.empty;
  const categoryClause = filters.categoryId ? Prisma.sql`AND "categoryId" = ${filters.categoryId}` : Prisma.empty;

  const [slaRow] = await prisma.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE "resolvedAt" IS NOT NULL)::int AS total_resolved,
      COUNT(*) FILTER (WHERE "resolvedAt" IS NOT NULL AND "resolvedAt" <= "slaResolutionDeadline")::int AS compliant
    FROM "tickets"
    WHERE "createdAt" >= ${fromDate} AND "createdAt" <= ${toDate}
    ${sectorClause} ${categoryClause}
  `;

  const overallSlaRate =
    slaRow.total_resolved > 0
      ? Math.round((slaRow.compliant / slaRow.total_resolved) * 100) / 100
      : null;

  // Métricas por técnico via groupBy
  const byUserAgg = await prisma.ticket.groupBy({
    by: ['assignedToId'],
    where: { assignedToId: { not: null }, ...where },
    _count: { id: true },
    _avg: { timeToFirstResponseMinutes: true, timeToResolutionMinutes: true },
    orderBy: { _count: { id: 'desc' } },
  });

  // SLA por técnico via $queryRaw
  const userIds = byUserAgg.map((u) => u.assignedToId);
  let userSlaMap = {};
  if (userIds.length > 0) {
    const userSlaRows = await prisma.$queryRaw`
      SELECT
        "assignedToId" AS user_id,
        COUNT(*) FILTER (WHERE "resolvedAt" IS NOT NULL)::int AS total_resolved,
        COUNT(*) FILTER (WHERE "resolvedAt" IS NOT NULL AND "resolvedAt" <= "slaResolutionDeadline")::int AS compliant
      FROM "tickets"
      WHERE "assignedToId" IN (${Prisma.join(userIds)})
        AND "createdAt" >= ${fromDate} AND "createdAt" <= ${toDate}
        ${sectorClause} ${categoryClause}
      GROUP BY "assignedToId"
    `;
    for (const r of userSlaRows) {
      userSlaMap[r.user_id] =
        r.total_resolved > 0 ? Math.round((r.compliant / r.total_resolved) * 100) / 100 : null;
    }
  }

  // Enriquecer com userName/sectorName
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, include: { sector: true } })
      : [];
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  const byUser = byUserAgg.map((row) => {
    const u = userMap[row.assignedToId];
    return {
      userId: row.assignedToId,
      userName: u?.name ?? 'Desconhecido',
      sectorName: u?.sector?.name ?? null,
      totalTickets: row._count.id,
      avgFirstResponseMinutes: roundOrNull(row._avg.timeToFirstResponseMinutes),
      avgResolutionMinutes: roundOrNull(row._avg.timeToResolutionMinutes),
      slaComplianceRate: userSlaMap[row.assignedToId] ?? null,
    };
  });

  return {
    period: { from, to },
    overall: {
      totalTickets: agg._count.id,
      avgFirstResponseMinutes: roundOrNull(agg._avg.timeToFirstResponseMinutes),
      avgResolutionMinutes: roundOrNull(agg._avg.timeToResolutionMinutes),
      slaComplianceRate: overallSlaRate,
    },
    byUser,
  };
}

async function summary(req, res) {
  const dates = parseDates(req, res);
  if (!dates) return;
  const filters = parseFilters(req, res);
  if (filters === null) return;

  const result = await buildSummary(dates.fromDate, dates.toDate, dates.from, dates.to, filters);
  res.json(result);
}

async function drilldown(req, res) {
  const userId = Number(req.params.id);
  const dates = parseDates(req, res);
  if (!dates) return;
  const { fromDate, toDate } = dates;

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { sector: true } });
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

  const where = { assignedToId: userId, createdAt: { gte: fromDate, lte: toDate } };

  const agg = await prisma.ticket.aggregate({
    where,
    _count: { id: true },
    _avg: { timeToFirstResponseMinutes: true, timeToResolutionMinutes: true },
  });

  const [slaRow] = await prisma.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE "resolvedAt" IS NOT NULL)::int AS total_resolved,
      COUNT(*) FILTER (WHERE "resolvedAt" IS NOT NULL AND "resolvedAt" <= "slaResolutionDeadline")::int AS compliant
    FROM "tickets"
    WHERE "assignedToId" = ${userId}
      AND "createdAt" >= ${fromDate} AND "createdAt" <= ${toDate}
  `;
  const slaComplianceRate =
    slaRow.total_resolved > 0
      ? Math.round((slaRow.compliant / slaRow.total_resolved) * 100) / 100
      : null;

  const statusGroups = await prisma.ticket.groupBy({ by: ['status'], where, _count: { id: true } });
  const byStatus = Object.fromEntries(STATUS_KEYS.map((s) => [s, 0]));
  for (const g of statusGroups) byStatus[g.status] = g._count.id;

  const urgencyGroups = await prisma.ticket.groupBy({ by: ['urgency'], where, _count: { id: true } });
  const byUrgency = Object.fromEntries(URGENCY_KEYS.map((u) => [u, 0]));
  for (const g of urgencyGroups) byUrgency[g.urgency] = g._count.id;

  const tickets = await prisma.ticket.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, title: true, urgency: true, status: true,
      createdAt: true, resolvedAt: true,
      slaResolutionDeadline: true, slaFirstResponseDeadline: true,
    },
  });

  res.json({
    user: { id: user.id, name: user.name, sectorName: user.sector?.name ?? null },
    metrics: {
      totalTickets: agg._count.id,
      avgFirstResponseMinutes: roundOrNull(agg._avg.timeToFirstResponseMinutes),
      avgResolutionMinutes: roundOrNull(agg._avg.timeToResolutionMinutes),
      slaComplianceRate,
      byStatus,
      byUrgency,
    },
    tickets: tickets.map((t) => ({
      id: t.id,
      title: t.title,
      urgency: t.urgency,
      status: t.status,
      createdAt: t.createdAt,
      resolvedAt: t.resolvedAt,
      slaBadge: calculateSlaBadge(t),
    })),
  });
}

async function exportData(req, res) {
  const { format } = req.query;
  if (!format || !['csv', 'pdf'].includes(format)) {
    return res.status(400).json({ error: 'O parâmetro format é obrigatório e deve ser "csv" ou "pdf".' });
  }

  const dates = parseDates(req, res);
  if (!dates) return;
  const filters = parseFilters(req, res);
  if (filters === null) return;

  const summaryData = await buildSummary(dates.fromDate, dates.toDate, dates.from, dates.to, filters);
  const dateStr = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    const csv = generateCsv(summaryData);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="performance-${dateStr}.csv"`);
    return res.send(csv);
  }

  const pdfBuffer = await generatePdf(summaryData);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="performance-${dateStr}.pdf"`);
  res.end(pdfBuffer);
}

module.exports = { summary, drilldown, exportData };
```

- [ ] **Step 4: Criar performance.routes.js**

Criar `backend/src/modules/performance/performance.routes.js`:

```js
const express = require('express');
const authenticate = require('../../middleware/authenticate');
const requirePermission = require('../../middleware/requirePermission');
const asyncHandler = require('../../lib/asyncHandler');
const controller = require('./performance.controller');

const router = express.Router();

const auth = [asyncHandler(authenticate), requirePermission('view_performance_panel')];

router.get('/performance/summary', ...auth, asyncHandler(controller.summary));
router.get('/performance/users/:id/drilldown', ...auth, asyncHandler(controller.drilldown));
router.get('/performance/export', ...auth, asyncHandler(controller.exportData));

module.exports = router;
```

- [ ] **Step 5: Montar as rotas em server.js**

Em `backend/src/server.js`, adicionar após os outros requires:

```js
const performanceRoutes = require('./modules/performance/performance.routes');
```

E após `app.use('/api', ticketsRoutes);`:

```js
app.use('/api', performanceRoutes);
```

- [ ] **Step 6: Rodar os testes de integração**

```bash
cd backend
npx jest tests/performance-api.test.js --no-coverage --runInBand
```
Expected: PASS (10 testes)

- [ ] **Step 7: Rodar a suite completa**

```bash
npm test -- --runInBand
```
Expected: todas as suítes passam.

- [ ] **Step 8: Commit**

```bash
cd "C:/Users/Marcelo/Desktop/CHAMADOS"
git add backend/src/modules/performance backend/src/server.js backend/tests/performance-api.test.js
git commit -m "feat: add performance API (summary, drilldown, export CSV/PDF)"
```
