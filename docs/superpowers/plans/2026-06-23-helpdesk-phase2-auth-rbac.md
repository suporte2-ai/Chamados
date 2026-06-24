# Helpdesk Fase 2: Autenticação + RBAC — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar autenticação JWT completa (login, refresh com rotação, logout, perfil, recuperação de senha) e a gestão de usuários/roles/permissões (RBAC) sobre o schema já existente, com middleware declarativo de autorização por permissão.

**Architecture:** Continuação do projeto `backend/` (Node.js + Express + Prisma + PostgreSQL, CommonJS puro). Cada tarefa adiciona uma camada: primeiro os blocos puros sem I/O (catálogo de permissões, helpers JWT), depois o middleware de autenticação/autorização, depois as rotas de auth, depois os módulos de usuários e roles. Todas as rotas HTTP são testadas com Jest + Supertest contra o PostgreSQL real do `docker-compose.yml` — mesmo padrão da Fase 1.

**Tech Stack:** Node.js (CommonJS), Express, Prisma ORM, PostgreSQL 16, Jest + Supertest, bcrypt (já instalado), jsonwebtoken (novo), cookie-parser (novo).

**Spec reference:** `docs/superpowers/specs/2026-06-23-helpdesk-phase2-auth-rbac-design.md`, seções 2-9.

**Convention:** todo comando abaixo assume que o diretório atual do shell é `backend/`, salvo indicação contrária (ex: "a partir da raiz do repositório").

## Global Constraints

- Access token: expira em `JWT_ACCESS_EXPIRES` (padrão `15m`), enviado via header `Authorization: Bearer`.
- Refresh token: expira em `JWT_REFRESH_EXPIRES` (padrão `7d`), enviado via cookie httpOnly (`path=/api/auth`), com **rotação** a cada uso (`User.refreshTokenVersion` incrementado).
- Token de reset de senha: expira em `RESET_TOKEN_EXPIRES_HOURS` (padrão `1`), armazenado como hash SHA-256 em `PasswordResetToken.token`.
- Catálogo de `permissionKey`/`fieldKey` é fixo no código (`src/lib/permissions.js`), nunca string livre vinda do cliente sem validação.
- Login com usuário `active=false` → `403`. Credenciais erradas → `401`.
- Sem biblioteca de validação de request body — checks manuais no início de cada handler, como já é o padrão do projeto.

---

## File Structure

```
/backend
  .env.example                          (modificado — novas variáveis JWT/reset)
  /prisma
    schema.prisma                       (modificado — User.refreshTokenVersion)
    seed.js                             (modificado — reusa lib/permissions.js)
  /src
    server.js                           (modificado — monta novos routers)
    lib/
      permissions.js                    (novo)
      jwt.js                            (novo)
    middleware/
      authenticate.js                   (novo)
      requirePermission.js              (novo)
    modules/
      auth/
        auth.routes.js                  (novo)
        auth.controller.js              (novo)
      users/
        users.routes.js                 (novo)
        users.controller.js             (novo)
      roles/
        roles.routes.js                 (novo)
        roles.controller.js             (novo)
      permissions/
        permissions.routes.js           (novo)
  /tests
    permissions-lib.test.js             (novo)
    jwt.test.js                         (novo)
    rbac-middleware.test.js             (novo)
    auth.test.js                        (novo)
    users-api.test.js                   (novo)
    roles-api.test.js                   (novo)
```

- `src/lib/permissions.js` — única fonte de verdade para `PERMISSION_KEYS`/`FIELD_KEYS`, consumida pelo seed, pelos controllers de roles e pela rota de catálogo.
- `src/lib/jwt.js` — única fonte de verdade para assinar/verificar access e refresh tokens.
- `src/middleware/` — `authenticate` (popula `req.user`) e `requirePermission(key)` (factory usada declarativamente nas rotas).
- `src/modules/<nome>/` — cada módulo HTTP tem `*.routes.js` (registro de rotas + middlewares) e `*.controller.js` (handlers), seguindo o padrão de pastas já anunciado na spec geral da Fase 1.

---

### Task 1: Coluna `User.refreshTokenVersion`

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/tests/identity-rbac.test.js`

**Interfaces:**
- Produces: `User.refreshTokenVersion: number` (default `0`), usado pelas Tasks 5-7 para rotação/revogação de refresh tokens.

- [ ] **Step 1: Escrever o teste que falha**

Em `backend/tests/identity-rbac.test.js`, no teste `'creates a sector and a user linked to a role and sector'`, adicione a asserção abaixo logo após `expect(user.sectorId).toBe(sector.id);`:

```js
  expect(user.refreshTokenVersion).toBe(0);
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest tests/identity-rbac.test.js`
Expected: FAIL — `expect(received).toBe(expected)` com `received: undefined`.

- [ ] **Step 3: Adicionar o campo ao schema**

Em `backend/prisma/schema.prisma`, no model `User`, adicione a linha abaixo logo após `active Boolean @default(true)`:

```prisma
  refreshTokenVersion Int       @default(0)
```

- [ ] **Step 4: Rodar a migration**

Run:
```bash
npx prisma migrate dev --name add_user_refresh_token_version
```
Expected: `Your database is now in sync with your schema.`

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx jest tests/identity-rbac.test.js`
Expected: PASS (4 testes).

- [ ] **Step 6: Commit**

```bash
git add backend/prisma backend/tests/identity-rbac.test.js
git commit -m "feat: add User.refreshTokenVersion for refresh token rotation"
```

---

### Task 2: Catálogo de permissões (`src/lib/permissions.js`)

**Files:**
- Create: `backend/src/lib/permissions.js`
- Create: `backend/tests/permissions-lib.test.js`
- Modify: `backend/prisma/seed.js`

**Interfaces:**
- Produces: `PERMISSION_KEYS: string[]`, `FIELD_KEYS: string[]` — usados pelas Tasks 6 e 7 (validação de toggles) e pela rota `GET /api/permissions/catalog`.

- [ ] **Step 1: Escrever o teste que falha**

Create `backend/tests/permissions-lib.test.js`:

```js
const { PERMISSION_KEYS, FIELD_KEYS } = require('../src/lib/permissions');

test('exposes the fixed catalog of permission keys', () => {
  expect(PERMISSION_KEYS).toContain('manage_users');
  expect(PERMISSION_KEYS).toContain('view_internal_notes');
  expect(PERMISSION_KEYS).toContain('reopen_tickets');
});

test('exposes the fixed catalog of field visibility keys', () => {
  expect(FIELD_KEYS).toEqual(['assigned_to', 'estimated_cost', 'internal_notes', 'sla_badge']);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest tests/permissions-lib.test.js`
Expected: FAIL — `Cannot find module '../src/lib/permissions'`.

- [ ] **Step 3: Implementar o catálogo**

Create `backend/src/lib/permissions.js`:

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
];

const FIELD_KEYS = ['assigned_to', 'estimated_cost', 'internal_notes', 'sla_badge'];

module.exports = { PERMISSION_KEYS, FIELD_KEYS };
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx jest tests/permissions-lib.test.js`
Expected: PASS (2 testes).

- [ ] **Step 5: Remover a duplicação no seed**

Em `backend/prisma/seed.js`, adicione o import no topo do arquivo (logo após a linha `const bcrypt = require('bcrypt');`):

```js
const { PERMISSION_KEYS, FIELD_KEYS } = require('../src/lib/permissions');
```

Dentro de `seedRolesAndPermissions`, substitua a declaração local:

```js
  const allPermissionKeys = [
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
  ];
```

por:

```js
  const allPermissionKeys = PERMISSION_KEYS;
```

E substitua:

```js
  const allFieldKeys = ['assigned_to', 'estimated_cost', 'internal_notes', 'sla_badge'];
```

por:

```js
  const allFieldKeys = FIELD_KEYS;
```

- [ ] **Step 6: Confirmar que o seed continua funcionando**

Run:
```bash
npm run db:seed
```
Expected: termina com `Seed concluído com sucesso.` (mesmo comportamento de antes — o conteúdo dos arrays não mudou, só a origem).

- [ ] **Step 7: Commit**

```bash
git add backend/src/lib/permissions.js backend/tests/permissions-lib.test.js backend/prisma/seed.js
git commit -m "feat: add fixed permission/field key catalog and reuse it in the seed script"
```

---

### Task 3: Helpers JWT (`src/lib/jwt.js`)

**Files:**
- Create: `backend/src/lib/jwt.js`
- Create: `backend/tests/jwt.test.js`
- Modify: `backend/.env.example`

**Interfaces:**
- Consumes: `process.env.JWT_ACCESS_SECRET`, `process.env.JWT_REFRESH_SECRET`, `process.env.JWT_ACCESS_EXPIRES`, `process.env.JWT_REFRESH_EXPIRES`.
- Produces: `signAccessToken(userId: number): string`, `verifyAccessToken(token: string): { sub: number, iat, exp }`, `signRefreshToken(userId: number, version: number): string`, `verifyRefreshToken(token: string): { sub: number, ver: number, iat, exp }`. Usados pelas Tasks 4 e 5.

- [ ] **Step 1: Instalar a dependência**

Run (from `backend/`):
```bash
npm install jsonwebtoken
```
Expected: adiciona `jsonwebtoken` em `dependencies` no `package.json`.

- [ ] **Step 2: Adicionar variáveis de ambiente**

Em `backend/.env.example`, adicione ao final do arquivo:

```
JWT_ACCESS_SECRET=troque-por-um-segredo-forte-de-access-token
JWT_REFRESH_SECRET=troque-por-um-segredo-forte-de-refresh-token
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
RESET_TOKEN_EXPIRES_HOURS=1
```

Copie os mesmos valores para o seu `backend/.env` local (com segredos reais, se desejar):
```bash
cat .env.example >> .env
```
(Se isso duplicar `DATABASE_URL`/`PORT` no seu `.env` local, remova as linhas duplicadas manualmente — o importante é que as 5 novas variáveis estejam presentes uma única vez.)

- [ ] **Step 3: Escrever o teste que falha**

Create `backend/tests/jwt.test.js`:

```js
require('dotenv').config();
const {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require('../src/lib/jwt');

test('signs and verifies an access token', () => {
  const token = signAccessToken(42);
  const payload = verifyAccessToken(token);
  expect(payload.sub).toBe(42);
});

test('signs and verifies a refresh token carrying a version claim', () => {
  const token = signRefreshToken(42, 3);
  const payload = verifyRefreshToken(token);
  expect(payload.sub).toBe(42);
  expect(payload.ver).toBe(3);
});

test('rejects a tampered access token', () => {
  const token = signAccessToken(42);
  expect(() => verifyAccessToken(`${token}x`)).toThrow();
});

test('rejects an access token verified as a refresh token', () => {
  const token = signAccessToken(42);
  expect(() => verifyRefreshToken(token)).toThrow();
});
```

- [ ] **Step 4: Rodar o teste e confirmar que falha**

Run: `npx jest tests/jwt.test.js`
Expected: FAIL — `Cannot find module '../src/lib/jwt'`.

- [ ] **Step 5: Implementar o módulo**

Create `backend/src/lib/jwt.js`:

```js
require('dotenv').config();
const jwt = require('jsonwebtoken');

function signAccessToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

function signRefreshToken(userId, version) {
  return jwt.sign({ sub: userId, ver: version }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d',
  });
}

function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

module.exports = { signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken };
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

Run: `npx jest tests/jwt.test.js`
Expected: PASS (4 testes).

- [ ] **Step 7: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/.env.example backend/src/lib/jwt.js backend/tests/jwt.test.js
git commit -m "feat: add JWT signing/verification helpers for access and refresh tokens"
```

---

### Task 4: Middleware `authenticate` e `requirePermission`

**Files:**
- Create: `backend/src/middleware/authenticate.js`
- Create: `backend/src/middleware/requirePermission.js`
- Create: `backend/tests/rbac-middleware.test.js`

**Interfaces:**
- Consumes: `signAccessToken`/`verifyAccessToken` (Task 3, via `authenticate`'s próprio uso interno de `verifyAccessToken`), `prisma` (`../lib/prisma`).
- Produces: `authenticate(req, res, next)` — popula `req.user = { id, roleId, sectorId, permissions: Set<string>, fieldVisibilities: Set<string> }`. `requirePermission(key: string)` — retorna um middleware `(req, res, next)`. Usados por todas as rotas das Tasks 5-7.

- [ ] **Step 1: Escrever o teste que falha**

Create `backend/tests/rbac-middleware.test.js`:

```js
const express = require('express');
const request = require('supertest');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');
const authenticate = require('../src/middleware/authenticate');
const requirePermission = require('../src/middleware/requirePermission');

const createdRoleIds = [];
const createdSectorIds = [];
const createdUserIds = [];

let app;
let userWithPermission;
let userWithoutPermission;
let inactiveUser;

beforeAll(async () => {
  const sector = await prisma.sector.create({ data: { name: 'Sector Teste RBAC Middleware' } });
  createdSectorIds.push(sector.id);

  const roleWithPermission = await prisma.role.create({
    data: {
      name: 'Role Teste RBAC ComPermissao',
      level: 2,
      permissions: { create: [{ permissionKey: 'manage_users', enabled: true }] },
    },
  });
  const roleWithoutPermission = await prisma.role.create({
    data: { name: 'Role Teste RBAC SemPermissao', level: 1 },
  });
  createdRoleIds.push(roleWithPermission.id, roleWithoutPermission.id);

  userWithPermission = await prisma.user.create({
    data: {
      name: 'Usuário Com Permissão',
      email: 'rbac.com@example.com',
      passwordHash: 'hash',
      roleId: roleWithPermission.id,
      sectorId: sector.id,
    },
  });
  userWithoutPermission = await prisma.user.create({
    data: {
      name: 'Usuário Sem Permissão',
      email: 'rbac.sem@example.com',
      passwordHash: 'hash',
      roleId: roleWithoutPermission.id,
      sectorId: sector.id,
    },
  });
  inactiveUser = await prisma.user.create({
    data: {
      name: 'Usuário Inativo',
      email: 'rbac.inativo@example.com',
      passwordHash: 'hash',
      roleId: roleWithPermission.id,
      sectorId: sector.id,
      active: false,
    },
  });
  createdUserIds.push(userWithPermission.id, userWithoutPermission.id, inactiveUser.id);

  app = express();
  app.get('/protected', authenticate, requirePermission('manage_users'), (req, res) => {
    res.json({ ok: true });
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
  await prisma.sector.deleteMany({ where: { id: { in: createdSectorIds } } });
  await prisma.$disconnect();
});

test('rejects requests without a token', async () => {
  const response = await request(app).get('/protected');
  expect(response.status).toBe(401);
});

test('rejects requests with an invalid token', async () => {
  const response = await request(app).get('/protected').set('Authorization', 'Bearer invalid-token');
  expect(response.status).toBe(401);
});

test('rejects a token for an inactive user', async () => {
  const token = signAccessToken(inactiveUser.id);
  const response = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
  expect(response.status).toBe(401);
});

test('rejects a user without the required permission', async () => {
  const token = signAccessToken(userWithoutPermission.id);
  const response = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
  expect(response.status).toBe(403);
});

test('allows a user with the required permission', async () => {
  const token = signAccessToken(userWithPermission.id);
  const response = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ ok: true });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest tests/rbac-middleware.test.js`
Expected: FAIL — `Cannot find module '../src/middleware/authenticate'`.

- [ ] **Step 3: Implementar `authenticate`**

Create `backend/src/middleware/authenticate.js`:

```js
const prisma = require('../lib/prisma');
const { verifyAccessToken } = require('../lib/jwt');

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Token de acesso ausente.' });
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    return res.status(401).json({ error: 'Token de acesso inválido ou expirado.' });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { role: { include: { permissions: true, fieldVisibilities: true } } },
  });

  if (!user || !user.active) {
    return res.status(401).json({ error: 'Usuário não encontrado ou inativo.' });
  }

  req.user = {
    id: user.id,
    roleId: user.roleId,
    sectorId: user.sectorId,
    permissions: new Set(
      user.role.permissions.filter((permission) => permission.enabled).map((permission) => permission.permissionKey)
    ),
    fieldVisibilities: new Set(
      user.role.fieldVisibilities.filter((field) => field.visible).map((field) => field.fieldKey)
    ),
  };

  next();
}

module.exports = authenticate;
```

- [ ] **Step 4: Implementar `requirePermission`**

Create `backend/src/middleware/requirePermission.js`:

```js
function requirePermission(key) {
  return (req, res, next) => {
    if (!req.user || !req.user.permissions.has(key)) {
      return res.status(403).json({ error: 'Permissão insuficiente.' });
    }
    next();
  };
}

module.exports = requirePermission;
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx jest tests/rbac-middleware.test.js`
Expected: PASS (5 testes).

- [ ] **Step 6: Commit**

```bash
git add backend/src/middleware backend/tests/rbac-middleware.test.js
git commit -m "feat: add authenticate and requirePermission middleware"
```

---

### Task 5: Rotas de autenticação (login, refresh, logout, me, forgot/reset-password)

**Files:**
- Create: `backend/src/modules/auth/auth.controller.js`
- Create: `backend/src/modules/auth/auth.routes.js`
- Create: `backend/tests/auth.test.js`
- Modify: `backend/src/server.js`

**Interfaces:**
- Consumes: `signAccessToken`, `signRefreshToken`, `verifyRefreshToken` (Task 3), `authenticate` (Task 4), `prisma` (`../../lib/prisma`).
- Produces: rotas montadas em `/api/auth` (`login`, `refresh`, `logout`, `me`, `forgot-password`, `reset-password`).

- [ ] **Step 1: Instalar a dependência**

Run (from `backend/`):
```bash
npm install cookie-parser
```

- [ ] **Step 2: Escrever o teste que falha**

Create `backend/tests/auth.test.js`:

```js
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
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `npx jest tests/auth.test.js`
Expected: FAIL — `404` em `POST /api/auth/login` (rota ainda não existe).

- [ ] **Step 4: Implementar o controller**

Create `backend/src/modules/auth/auth.controller.js`:

```js
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const prisma = require('../../lib/prisma');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../../lib/jwt');

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_PATH = '/api/auth';

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

async function buildProfilePayload(user) {
  const role = await prisma.role.findUnique({
    where: { id: user.roleId },
    include: { permissions: true, fieldVisibilities: true },
  });

  return {
    user: { id: user.id, name: user.name, email: user.email, sectorId: user.sectorId },
    role: { id: role.id, name: role.name },
    permissions: role.permissions.filter((permission) => permission.enabled).map((permission) => permission.permissionKey),
    fieldVisibilities: role.fieldVisibilities.map((field) => ({ fieldKey: field.fieldKey, visible: field.visible })),
  };
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  if (!user.active) {
    return res.status(403).json({ error: 'Usuário desativado.' });
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const accessToken = signAccessToken(user.id);
  const refreshToken = signRefreshToken(user.id, user.refreshTokenVersion);
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());

  const profile = await buildProfilePayload(user);
  res.json({ accessToken, ...profile });
}

async function refresh(req, res) {
  const token = req.cookies[REFRESH_COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'Refresh token ausente.' });
  }

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch (error) {
    return res.status(401).json({ error: 'Refresh token inválido ou expirado.' });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.active || user.refreshTokenVersion !== payload.ver) {
    return res.status(401).json({ error: 'Refresh token inválido ou expirado.' });
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { refreshTokenVersion: { increment: 1 } },
  });

  const accessToken = signAccessToken(updatedUser.id);
  const newRefreshToken = signRefreshToken(updatedUser.id, updatedUser.refreshTokenVersion);
  res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, refreshCookieOptions());

  res.json({ accessToken });
}

async function logout(req, res) {
  await prisma.user.update({
    where: { id: req.user.id },
    data: { refreshTokenVersion: { increment: 1 } },
  });
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  res.status(204).send();
}

async function me(req, res) {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const profile = await buildProfilePayload(user);
  res.json(profile);
}

async function forgotPassword(req, res) {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'E-mail é obrigatório.' });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (user && user.active) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(
      Date.now() + Number(process.env.RESET_TOKEN_EXPIRES_HOURS || 1) * 60 * 60 * 1000
    );

    await prisma.passwordResetToken.create({
      data: { userId: user.id, token: hashedToken, expiresAt },
    });

    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password/${rawToken}`;
    console.log(`Link de redefinição de senha para ${email}: ${resetLink}`);
  }

  res.status(200).json({ message: 'Se o e-mail existir, um link de redefinição foi enviado.' });
}

async function resetPassword(req, res) {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token e nova senha são obrigatórios.' });
  }

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { token: hashedToken } });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return res.status(400).json({ error: 'Token inválido ou expirado.' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash, refreshTokenVersion: { increment: 1 } },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
  ]);

  res.status(200).json({ message: 'Senha redefinida com sucesso.' });
}

module.exports = { login, refresh, logout, me, forgotPassword, resetPassword };
```

- [ ] **Step 5: Implementar as rotas**

Create `backend/src/modules/auth/auth.routes.js`:

```js
const express = require('express');
const authenticate = require('../../middleware/authenticate');
const controller = require('./auth.controller');

const router = express.Router();

router.post('/login', controller.login);
router.post('/refresh', controller.refresh);
router.post('/logout', authenticate, controller.logout);
router.get('/me', authenticate, controller.me);
router.post('/forgot-password', controller.forgotPassword);
router.post('/reset-password', controller.resetPassword);

module.exports = router;
```

- [ ] **Step 6: Montar as rotas no servidor**

Em `backend/src/server.js`, substitua o conteúdo inteiro por:

```js
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const authRoutes = require('./modules/auth/auth.routes');

const app = express();
app.use(express.json());
app.use(cookieParser());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);

const PORT = process.env.PORT || 4000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

module.exports = app;
```

- [ ] **Step 7: Rodar o teste e confirmar que passa**

Run: `npx jest tests/auth.test.js --runInBand`
Expected: PASS (9 testes).

- [ ] **Step 8: Rodar a suíte completa para confirmar que nada quebrou**

Run: `npx jest --runInBand`
Expected: PASS em todas as suítes.

- [ ] **Step 9: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/server.js backend/src/modules/auth backend/tests/auth.test.js
git commit -m "feat: add JWT auth routes (login, refresh, logout, me, password reset)"
```

---

### Task 6: API de usuários (`/api/users`)

**Files:**
- Create: `backend/src/modules/users/users.controller.js`
- Create: `backend/src/modules/users/users.routes.js`
- Create: `backend/tests/users-api.test.js`
- Modify: `backend/src/server.js`

**Interfaces:**
- Consumes: `authenticate`, `requirePermission` (Task 4).
- Produces: rotas montadas em `/api/users` (`GET /`, `POST /`, `PATCH /:id`), todas atrás de `requirePermission('manage_users')`.

- [ ] **Step 1: Escrever o teste que falha**

Create `backend/tests/users-api.test.js`:

```js
const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');

const createdRoleIds = [];
const createdSectorIds = [];
const createdUserIds = [];

let sector;
let adminRole;
let adminUser;
let adminToken;

beforeAll(async () => {
  sector = await prisma.sector.create({ data: { name: 'Sector Teste Users API' } });
  adminRole = await prisma.role.create({
    data: {
      name: 'Role Teste Users API Admin',
      level: 4,
      permissions: { create: [{ permissionKey: 'manage_users', enabled: true }] },
    },
  });
  createdSectorIds.push(sector.id);
  createdRoleIds.push(adminRole.id);

  adminUser = await prisma.user.create({
    data: {
      name: 'Admin Teste Users API',
      email: 'users-api.admin@example.com',
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

test('GET /api/users requires authentication', async () => {
  const response = await request(app).get('/api/users');
  expect(response.status).toBe(401);
});

test('POST /api/users creates a user with an admin-supplied password', async () => {
  const response = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: 'Novo Usuário',
      email: 'novo.usuario.api@example.com',
      password: 'SenhaInicial123!',
      roleId: adminRole.id,
      sectorId: sector.id,
    });

  expect(response.status).toBe(201);
  expect(response.body.email).toBe('novo.usuario.api@example.com');
  expect(response.body.passwordHash).not.toBe('SenhaInicial123!');
  createdUserIds.push(response.body.id);
});

test('POST /api/users rejects a duplicate email with 409', async () => {
  const response = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: 'Outro Usuário',
      email: 'novo.usuario.api@example.com',
      password: 'OutraSenha456!',
      roleId: adminRole.id,
      sectorId: sector.id,
    });

  expect(response.status).toBe(409);
});

test('PATCH /api/users/:id soft-deletes a user by setting active to false', async () => {
  const created = await prisma.user.create({
    data: {
      name: 'Usuário Para Desativar',
      email: 'desativar.api@example.com',
      passwordHash: 'hash',
      roleId: adminRole.id,
      sectorId: sector.id,
    },
  });
  createdUserIds.push(created.id);

  const response = await request(app)
    .patch(`/api/users/${created.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ active: false });

  expect(response.status).toBe(200);
  expect(response.body.active).toBe(false);
});

test('GET /api/users lists users when authenticated with manage_users', async () => {
  const response = await request(app).get('/api/users').set('Authorization', `Bearer ${adminToken}`);

  expect(response.status).toBe(200);
  expect(Array.isArray(response.body)).toBe(true);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest tests/users-api.test.js`
Expected: FAIL — `404` em `GET /api/users` (rota ainda não existe).

- [ ] **Step 3: Implementar o controller**

Create `backend/src/modules/users/users.controller.js`:

```js
const bcrypt = require('bcrypt');
const prisma = require('../../lib/prisma');

async function list(req, res) {
  const users = await prisma.user.findMany({
    include: {
      role: { select: { id: true, name: true } },
      sector: { select: { id: true, name: true } },
    },
    orderBy: { id: 'asc' },
  });
  res.json(users);
}

async function create(req, res) {
  const { name, email, password, roleId, sectorId } = req.body;
  if (!name || !email || !password || !roleId || !sectorId) {
    return res.status(400).json({ error: 'name, email, password, roleId e sectorId são obrigatórios.' });
  }

  const [role, sector, existing] = await Promise.all([
    prisma.role.findUnique({ where: { id: roleId } }),
    prisma.sector.findUnique({ where: { id: sectorId } }),
    prisma.user.findUnique({ where: { email } }),
  ]);

  if (!role || !sector) {
    return res.status(400).json({ error: 'roleId ou sectorId inválido.' });
  }
  if (existing) {
    return res.status(409).json({ error: 'E-mail já está em uso.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { name, email, passwordHash, roleId, sectorId } });
  res.status(201).json(user);
}

async function update(req, res) {
  const id = Number(req.params.id);
  const { name, email, roleId, sectorId, active } = req.body;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  const data = {};
  if (name !== undefined) data.name = name;
  if (email !== undefined) data.email = email;
  if (roleId !== undefined) data.roleId = roleId;
  if (sectorId !== undefined) data.sectorId = sectorId;
  if (active !== undefined) data.active = active;

  const updated = await prisma.user.update({ where: { id }, data });
  res.json(updated);
}

module.exports = { list, create, update };
```

- [ ] **Step 4: Implementar as rotas**

Create `backend/src/modules/users/users.routes.js`:

```js
const express = require('express');
const authenticate = require('../../middleware/authenticate');
const requirePermission = require('../../middleware/requirePermission');
const controller = require('./users.controller');

const router = express.Router();

router.use(authenticate, requirePermission('manage_users'));

router.get('/', controller.list);
router.post('/', controller.create);
router.patch('/:id', controller.update);

module.exports = router;
```

- [ ] **Step 5: Montar as rotas no servidor**

Em `backend/src/server.js`, adicione o import junto aos demais:

```js
const usersRoutes = require('./modules/users/users.routes');
```

E adicione a montagem logo após `app.use('/api/auth', authRoutes);`:

```js
app.use('/api/users', usersRoutes);
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

Run: `npx jest tests/users-api.test.js --runInBand`
Expected: PASS (5 testes).

- [ ] **Step 7: Commit**

```bash
git add backend/src/server.js backend/src/modules/users backend/tests/users-api.test.js
git commit -m "feat: add users API (list, create, soft-delete via PATCH)"
```

---

### Task 7: API de roles e catálogo de permissões (`/api/roles`, `/api/permissions/catalog`)

**Files:**
- Create: `backend/src/modules/roles/roles.controller.js`
- Create: `backend/src/modules/roles/roles.routes.js`
- Create: `backend/src/modules/permissions/permissions.routes.js`
- Create: `backend/tests/roles-api.test.js`
- Modify: `backend/src/server.js`

**Interfaces:**
- Consumes: `authenticate`, `requirePermission` (Task 4), `PERMISSION_KEYS`, `FIELD_KEYS` (Task 2).
- Produces: rotas montadas em `/api/roles` (`GET /`, `POST /`, `PATCH /:id`, `DELETE /:id`, `PATCH /:id/permissions`, `PATCH /:id/field-visibility`) atrás de `requirePermission('manage_users')`; rota `GET /api/permissions/catalog` atrás apenas de `authenticate`.

- [ ] **Step 1: Escrever o teste que falha**

Create `backend/tests/roles-api.test.js`:

```js
const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');

const createdRoleIds = [];
const createdSectorIds = [];
const createdUserIds = [];

let sector;
let adminRole;
let adminUser;
let adminToken;

beforeAll(async () => {
  sector = await prisma.sector.create({ data: { name: 'Sector Teste Roles API' } });
  adminRole = await prisma.role.create({
    data: {
      name: 'Role Teste Roles API Admin',
      level: 4,
      permissions: { create: [{ permissionKey: 'manage_users', enabled: true }] },
    },
  });
  createdSectorIds.push(sector.id);
  createdRoleIds.push(adminRole.id);

  adminUser = await prisma.user.create({
    data: {
      name: 'Admin Teste Roles API',
      email: 'roles-api.admin@example.com',
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

test('GET /api/permissions/catalog returns the fixed key lists for any authenticated user', async () => {
  const response = await request(app)
    .get('/api/permissions/catalog')
    .set('Authorization', `Bearer ${adminToken}`);

  expect(response.status).toBe(200);
  expect(response.body.permissionKeys).toContain('manage_users');
  expect(response.body.fieldKeys).toEqual(['assigned_to', 'estimated_cost', 'internal_notes', 'sla_badge']);
});

test('POST /api/roles creates a non-system role', async () => {
  const response = await request(app)
    .post('/api/roles')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Role Teste Roles API Nova', level: 2 });

  expect(response.status).toBe(201);
  expect(response.body.isSystemDefault).toBe(false);
  createdRoleIds.push(response.body.id);
});

test('PATCH /api/roles/:id/permissions rejects an unknown permissionKey with 400', async () => {
  const role = await prisma.role.create({ data: { name: 'Role Teste Roles API Toggle', level: 1 } });
  createdRoleIds.push(role.id);

  const response = await request(app)
    .patch(`/api/roles/${role.id}/permissions`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send([{ permissionKey: 'chave_inexistente', enabled: true }]);

  expect(response.status).toBe(400);
});

test('PATCH /api/roles/:id/permissions toggles a valid permissionKey', async () => {
  const role = await prisma.role.create({ data: { name: 'Role Teste Roles API Toggle Valido', level: 1 } });
  createdRoleIds.push(role.id);

  const response = await request(app)
    .patch(`/api/roles/${role.id}/permissions`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send([{ permissionKey: 'view_internal_notes', enabled: true }]);

  expect(response.status).toBe(200);
  expect(response.body.some((p) => p.permissionKey === 'view_internal_notes' && p.enabled)).toBe(true);
});

test('PATCH /api/roles/:id/field-visibility toggles a valid fieldKey', async () => {
  const role = await prisma.role.create({ data: { name: 'Role Teste Roles API Field', level: 1 } });
  createdRoleIds.push(role.id);

  const response = await request(app)
    .patch(`/api/roles/${role.id}/field-visibility`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send([{ fieldKey: 'estimated_cost', visible: false }]);

  expect(response.status).toBe(200);
  expect(response.body.some((f) => f.fieldKey === 'estimated_cost' && f.visible === false)).toBe(true);
});

test('DELETE /api/roles/:id returns 409 for a system default role', async () => {
  const systemRole = await prisma.role.create({
    data: { name: 'Role Teste Roles API Sistema', level: 1, isSystemDefault: true },
  });
  createdRoleIds.push(systemRole.id);

  const response = await request(app)
    .delete(`/api/roles/${systemRole.id}`)
    .set('Authorization', `Bearer ${adminToken}`);

  expect(response.status).toBe(409);
});

test('DELETE /api/roles/:id returns 409 when users are linked to the role', async () => {
  const roleWithUsers = await prisma.role.create({ data: { name: 'Role Teste Roles API ComUsuario', level: 1 } });
  createdRoleIds.push(roleWithUsers.id);

  const linkedUser = await prisma.user.create({
    data: {
      name: 'Usuário Vinculado',
      email: 'vinculado.roles-api@example.com',
      passwordHash: 'hash',
      roleId: roleWithUsers.id,
      sectorId: sector.id,
    },
  });
  createdUserIds.push(linkedUser.id);

  const response = await request(app)
    .delete(`/api/roles/${roleWithUsers.id}`)
    .set('Authorization', `Bearer ${adminToken}`);

  expect(response.status).toBe(409);
});

test('DELETE /api/roles/:id deletes a non-system role with no linked users', async () => {
  const deletableRole = await prisma.role.create({ data: { name: 'Role Teste Roles API Deletavel', level: 1 } });

  const response = await request(app)
    .delete(`/api/roles/${deletableRole.id}`)
    .set('Authorization', `Bearer ${adminToken}`);

  expect(response.status).toBe(204);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest tests/roles-api.test.js`
Expected: FAIL — `404` em `GET /api/permissions/catalog` (rota ainda não existe).

- [ ] **Step 3: Implementar o controller de roles**

Create `backend/src/modules/roles/roles.controller.js`:

```js
const prisma = require('../../lib/prisma');
const { PERMISSION_KEYS, FIELD_KEYS } = require('../../lib/permissions');

async function list(req, res) {
  const roles = await prisma.role.findMany({
    include: { permissions: true, fieldVisibilities: true },
    orderBy: { id: 'asc' },
  });
  res.json(roles);
}

async function create(req, res) {
  const { name, level } = req.body;
  if (!name || level === undefined) {
    return res.status(400).json({ error: 'name e level são obrigatórios.' });
  }
  const role = await prisma.role.create({ data: { name, level } });
  res.status(201).json(role);
}

async function update(req, res) {
  const id = Number(req.params.id);
  const { name, level } = req.body;

  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) {
    return res.status(404).json({ error: 'Role não encontrada.' });
  }

  const data = {};
  if (name !== undefined) data.name = name;
  if (level !== undefined) data.level = level;

  const updated = await prisma.role.update({ where: { id }, data });
  res.json(updated);
}

async function remove(req, res) {
  const id = Number(req.params.id);

  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) {
    return res.status(404).json({ error: 'Role não encontrada.' });
  }
  if (role.isSystemDefault) {
    return res.status(409).json({ error: 'Não é possível excluir um perfil padrão do sistema.' });
  }

  const usersWithRole = await prisma.user.count({ where: { roleId: id } });
  if (usersWithRole > 0) {
    return res.status(409).json({ error: 'Existem usuários vinculados a este perfil.' });
  }

  await prisma.role.delete({ where: { id } });
  res.status(204).send();
}

async function updatePermissions(req, res) {
  const id = Number(req.params.id);
  const updates = req.body;

  if (!Array.isArray(updates)) {
    return res.status(400).json({ error: 'Corpo deve ser um array de { permissionKey, enabled }.' });
  }
  for (const update of updates) {
    if (!PERMISSION_KEYS.includes(update.permissionKey)) {
      return res.status(400).json({ error: `permissionKey inválido: ${update.permissionKey}` });
    }
  }

  await prisma.$transaction(
    updates.map((update) =>
      prisma.rolePermission.upsert({
        where: { roleId_permissionKey: { roleId: id, permissionKey: update.permissionKey } },
        update: { enabled: update.enabled },
        create: { roleId: id, permissionKey: update.permissionKey, enabled: update.enabled },
      })
    )
  );

  const permissions = await prisma.rolePermission.findMany({ where: { roleId: id } });
  res.json(permissions);
}

async function updateFieldVisibility(req, res) {
  const id = Number(req.params.id);
  const updates = req.body;

  if (!Array.isArray(updates)) {
    return res.status(400).json({ error: 'Corpo deve ser um array de { fieldKey, visible }.' });
  }
  for (const update of updates) {
    if (!FIELD_KEYS.includes(update.fieldKey)) {
      return res.status(400).json({ error: `fieldKey inválido: ${update.fieldKey}` });
    }
  }

  await prisma.$transaction(
    updates.map((update) =>
      prisma.roleFieldVisibility.upsert({
        where: { roleId_fieldKey: { roleId: id, fieldKey: update.fieldKey } },
        update: { visible: update.visible },
        create: { roleId: id, fieldKey: update.fieldKey, visible: update.visible },
      })
    )
  );

  const fieldVisibilities = await prisma.roleFieldVisibility.findMany({ where: { roleId: id } });
  res.json(fieldVisibilities);
}

module.exports = { list, create, update, remove, updatePermissions, updateFieldVisibility };
```

- [ ] **Step 4: Implementar as rotas de roles**

Create `backend/src/modules/roles/roles.routes.js`:

```js
const express = require('express');
const authenticate = require('../../middleware/authenticate');
const requirePermission = require('../../middleware/requirePermission');
const controller = require('./roles.controller');

const router = express.Router();

router.use(authenticate, requirePermission('manage_users'));

router.get('/', controller.list);
router.post('/', controller.create);
router.patch('/:id', controller.update);
router.delete('/:id', controller.remove);
router.patch('/:id/permissions', controller.updatePermissions);
router.patch('/:id/field-visibility', controller.updateFieldVisibility);

module.exports = router;
```

- [ ] **Step 5: Implementar a rota de catálogo de permissões**

Create `backend/src/modules/permissions/permissions.routes.js`:

```js
const express = require('express');
const authenticate = require('../../middleware/authenticate');
const { PERMISSION_KEYS, FIELD_KEYS } = require('../../lib/permissions');

const router = express.Router();

router.get('/catalog', authenticate, (req, res) => {
  res.json({ permissionKeys: PERMISSION_KEYS, fieldKeys: FIELD_KEYS });
});

module.exports = router;
```

- [ ] **Step 6: Montar as rotas no servidor**

Em `backend/src/server.js`, adicione os imports junto aos demais:

```js
const rolesRoutes = require('./modules/roles/roles.routes');
const permissionsRoutes = require('./modules/permissions/permissions.routes');
```

E adicione a montagem logo após `app.use('/api/users', usersRoutes);`:

```js
app.use('/api/roles', rolesRoutes);
app.use('/api/permissions', permissionsRoutes);
```

- [ ] **Step 7: Rodar o teste e confirmar que passa**

Run: `npx jest tests/roles-api.test.js --runInBand`
Expected: PASS (8 testes).

- [ ] **Step 8: Rodar a suíte completa para confirmar que nada quebrou**

Run: `npx jest --runInBand`
Expected: PASS em todas as suítes (Fase 1 + Fase 2).

- [ ] **Step 9: Commit**

```bash
git add backend/src/server.js backend/src/modules/roles backend/src/modules/permissions backend/tests/roles-api.test.js
git commit -m "feat: add roles API and permissions catalog endpoint"
```

---

### Task 8: Atualizar o README com a Fase 2

**Files:**
- Modify: `README.md`

- [x] **Step 1: Atualizar a seção "Status atual"**

Em `README.md`, substitua o parágrafo da seção `## Status atual` por:

```markdown
## Status atual

Fases 1 e 2 concluídas: schema do banco de dados, migrations, dados de
exemplo (seed), autenticação JWT (login, refresh com rotação, logout,
recuperação de senha) e gestão de usuários/roles/permissões (RBAC). As
fases seguintes (módulo de chamados, painel de desempenho, ideias,
dashboard e admin) ainda serão adicionadas — esta seção do README será
expandida a cada fase.
```

- [x] **Step 2: Adicionar variáveis de ambiente novas à tabela**

Na seção `## Variáveis de ambiente (backend/.env)`, adicione as linhas abaixo à tabela existente:

```markdown
| `JWT_ACCESS_SECRET`         | Segredo de assinatura do access token       | string aleatória forte                                                 |
| `JWT_REFRESH_SECRET`        | Segredo de assinatura do refresh token      | string aleatória forte (diferente do access)                          |
| `JWT_ACCESS_EXPIRES`        | Validade do access token                    | `15m`                                                                  |
| `JWT_REFRESH_EXPIRES`       | Validade do refresh token                   | `7d`                                                                   |
| `RESET_TOKEN_EXPIRES_HOURS` | Validade do link de redefinição de senha    | `1`                                                                    |
```

- [x] **Step 3: Adicionar uma seção sobre autenticação**

Adicione ao final do `README.md`, antes da seção `## Verificar dados de exemplo`:

```markdown
## Autenticação (Fase 2)

- `POST /api/auth/login` — `{ email, password }`, retorna `accessToken` no
  corpo e seta o refresh token em cookie httpOnly (`path=/api/auth`).
- `POST /api/auth/refresh` — lê o cookie de refresh, rotaciona e retorna um
  novo `accessToken`.
- `POST /api/auth/logout` — requer `Authorization: Bearer <accessToken>`;
  invalida o refresh token atual.
- `GET /api/auth/me` — retorna o perfil do usuário logado.
- `POST /api/auth/forgot-password` / `POST /api/auth/reset-password` — sem
  SMTP configurado, o link de redefinição é apenas logado no console do
  backend (modo dev).
- Rotas administrativas (`/api/users`, `/api/roles`,
  `/api/permissions/catalog`) exigem `Authorization: Bearer <accessToken>`
  de um usuário com a permissão `manage_users` (exceto o catálogo, que só
  exige estar autenticado).
- Use o usuário semeado `admin@helpdesk.com` / `Senha123!` para obter um
  token via `POST /api/auth/login` e testar as rotas administrativas.
```

- [x] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document Phase 2 auth endpoints and environment variables"
```

---

## Self-Review Notes

- **Cobertura da spec:** schema (seção 2) → Task 1; dependências (seção 3) → Tasks 3 e 5; variáveis de ambiente (seção 4) → Tasks 3 e 8; middleware/catálogo (seção 5) → Tasks 2 e 4; endpoints de auth (seção 6) → Task 5; endpoints de usuários/roles/catálogo (seção 7) → Tasks 6 e 7; estrutura de arquivos (seção 8) → refletida no `File Structure` acima; testes (seção 9) → um arquivo de teste por task, mesmos cenários listados na spec.
- **Sem placeholders:** todo step tem código completo executável ou comando exato com saída esperada.
- **Consistência de nomes:** `signAccessToken`/`verifyAccessToken`/`signRefreshToken`/`verifyRefreshToken` (Task 3) são usados com a mesma assinatura em `authenticate.js` (Task 4) e `auth.controller.js` (Task 5). `PERMISSION_KEYS`/`FIELD_KEYS` (Task 2) são usados com o mesmo nome em `roles.controller.js` e `permissions.routes.js` (Task 7) e em `seed.js`. `req.user.permissions`/`req.user.fieldVisibilities` (Sets, Task 4) são consumidos apenas por `requirePermission`, que usa `.has(key)` — compatível com `Set`.
- **Decisão registrada:** não existe `DELETE /api/users/:id` dedicado nesta fase — soft delete é feito via `PATCH /api/users/:id` com `{ active: false }`, conforme decidido na spec (seção 7) e refletido no teste da Task 6.
