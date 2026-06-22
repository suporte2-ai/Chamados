# Helpdesk Phase 1: Database Schema, Migrations & Seed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the backend project skeleton (Node.js + Express + Prisma + PostgreSQL, plain JavaScript), define the full database schema from the design spec, run the migrations, and produce a working seed script with realistic example data (users of every role, ~50 tickets with internally-consistent SLA/time-tracking timestamps, ~9 ideas).

**Architecture:** Single `backend/` Node.js project. Prisma is the source of truth for the schema (`backend/prisma/schema.prisma`); each task adds a focused slice of models, migrates, and proves the slice works with a Jest + Prisma Client integration test against the real PostgreSQL instance defined in `docker-compose.yml`. The seed script (`backend/prisma/seed.js`) reuses the exact same event-log invariants (`TicketTimeLog`, pause discounting) that the real application will implement in Phase 3, so dashboard math is correct from day one.

**Tech Stack:** Node.js (CommonJS, no TypeScript), Express, Prisma ORM, PostgreSQL 16, Jest + Supertest for tests, bcrypt for seed password hashing, Docker Compose for local Postgres.

**Spec reference:** `docs/superpowers/specs/2026-06-22-helpdesk-design.md`, sections 2-5 and 9.

**Convention:** every command below assumes your shell's current directory is `backend/` unless explicitly stated otherwise (e.g. "from repo root").

---

## File Structure

```
/ (repo root)
  docker-compose.yml
  .gitignore
  README.md
  /backend
    package.json
    .env.example
    Dockerfile
    /prisma
      schema.prisma
      seed.js
    /src
      server.js
      /lib
        prisma.js
    /scripts
      verify-seed.js
    /tests
      health.test.js
      identity-rbac.test.js
      ticket-core.test.js
      ticket-time-tracking.test.js
      ideas.test.js
      notifications.test.js
```

- `src/lib/prisma.js` — single shared `PrismaClient` instance, reused by the app and by tests/seed.
- `src/server.js` — minimal Express app with a health check; later phases add routers here.
- `prisma/schema.prisma` — full data model, built up incrementally task by task.
- `prisma/seed.js` — idempotent seed script (wipes and repopulates).
- `scripts/verify-seed.js` — standalone count check, safe to run after seeding without disturbing data (unlike the test suite, which wipes its own tables).
- `tests/*.test.js` — one file per schema slice; each file creates and tears down only the rows it needs, so files are independent and re-runnable.

---

### Task 1: Backend project scaffolding + health check

**Files:**
- Create: `backend/package.json`
- Create: `backend/.env.example`
- Create: `backend/src/server.js`
- Create: `backend/tests/health.test.js`
- Create: `.gitignore` (repo root)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/health.test.js`:

```js
const request = require('supertest');
const app = require('../src/server');

test('GET /health returns ok status', async () => {
  const response = await request(app).get('/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
});
```

- [ ] **Step 2: Create package.json and install dependencies**

Create `backend/package.json`:

```json
{
  "name": "helpdesk-backend",
  "version": "1.0.0",
  "private": true,
  "main": "src/server.js",
  "scripts": {
    "dev": "nodemon src/server.js",
    "start": "node src/server.js",
    "test": "jest --runInBand",
    "prisma:migrate": "prisma migrate dev",
    "prisma:generate": "prisma generate",
    "db:seed": "node prisma/seed.js",
    "db:verify-seed": "node scripts/verify-seed.js"
  },
  "prisma": {
    "seed": "node prisma/seed.js"
  },
  "jest": {
    "testEnvironment": "node",
    "testTimeout": 20000
  },
  "dependencies": {
    "express": "^4.19.2",
    "dotenv": "^16.4.5",
    "@prisma/client": "^5.20.0"
  },
  "devDependencies": {
    "prisma": "^5.20.0",
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "nodemon": "^3.1.4"
  }
}
```

Run (from `backend/`):
```bash
npm install
```
Expected: installs without errors, creates `node_modules/` and `package-lock.json`.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest tests/health.test.js`
Expected: FAIL with `Cannot find module '../src/server'`.

- [ ] **Step 4: Create the .env.example**

Create `backend/.env.example`:

```
DATABASE_URL="postgresql://helpdesk:helpdesk@localhost:5432/helpdesk?schema=public"
PORT=4000
```

Copy it to a real `.env` you'll use locally:
```bash
cp .env.example .env
```

- [ ] **Step 5: Implement the Express app**

Create `backend/src/server.js`:

```js
require('dotenv').config();
const express = require('express');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 4000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

module.exports = app;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest tests/health.test.js`
Expected: PASS (1 test).

- [ ] **Step 7: Add repo-root .gitignore**

Create `.gitignore` (repo root):

```
node_modules/
.env
backend/uploads/
```

- [ ] **Step 8: Commit**

```bash
git init
git add backend/package.json backend/.env.example backend/src/server.js backend/tests/health.test.js .gitignore
git commit -m "feat: scaffold backend Express app with health check"
```

(If the repo was already initialized, skip `git init`.)

---

### Task 2: PostgreSQL via Docker Compose

**Files:**
- Create: `docker-compose.yml` (repo root)
- Create: `backend/Dockerfile`

- [ ] **Step 1: Write docker-compose.yml**

Create `docker-compose.yml` (repo root):

```yaml
version: "3.9"
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: helpdesk
      POSTGRES_PASSWORD: helpdesk
      POSTGRES_DB: helpdesk
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  backend:
    build: ./backend
    restart: unless-stopped
    depends_on:
      - postgres
    environment:
      DATABASE_URL: "postgresql://helpdesk:helpdesk@postgres:5432/helpdesk?schema=public"
      PORT: 4000
    ports:
      - "4000:4000"
    volumes:
      - ./backend:/app
      - /app/node_modules

volumes:
  postgres_data:
```

- [ ] **Step 2: Write the backend Dockerfile**

Create `backend/Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npx prisma generate

EXPOSE 4000

CMD ["npm", "run", "dev"]
```

- [ ] **Step 3: Start Postgres and verify it's reachable**

From repo root:
```bash
docker compose up -d postgres
docker compose ps
```
Expected: `postgres` service shows `running` (or `healthy`) state.

```bash
docker compose exec postgres pg_isready -U helpdesk
```
Expected: `... accepting connections`.

Keep this Postgres container running for the rest of this plan — every later task's `npx prisma migrate dev` and `npx jest` commands connect to it via `backend/.env`'s `DATABASE_URL` (`localhost:5432`, matching the `ports` mapping above).

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml backend/Dockerfile
git commit -m "feat: add docker-compose Postgres service and backend Dockerfile"
```

---

### Task 3: Identity & RBAC schema (Role, RolePermission, RoleFieldVisibility, Sector, User, PasswordResetToken)

**Files:**
- Create: `backend/prisma/schema.prisma`
- Create: `backend/src/lib/prisma.js`
- Create: `backend/tests/identity-rbac.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/identity-rbac.test.js`:

```js
const prisma = require('../src/lib/prisma');

afterAll(async () => {
  await prisma.rolePermission.deleteMany();
  await prisma.roleFieldVisibility.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.sector.deleteMany();
  await prisma.role.deleteMany();
  await prisma.$disconnect();
});

test('creates a role with permissions and field visibility', async () => {
  const role = await prisma.role.create({
    data: {
      name: 'Técnico/Atendente',
      level: 3,
      permissions: {
        create: [{ permissionKey: 'view_internal_notes', enabled: true }],
      },
      fieldVisibilities: {
        create: [{ fieldKey: 'estimated_cost', visible: false }],
      },
    },
    include: { permissions: true, fieldVisibilities: true },
  });

  expect(role.permissions).toHaveLength(1);
  expect(role.fieldVisibilities[0].visible).toBe(false);
});

test('creates a sector and a user linked to a role and sector', async () => {
  const sector = await prisma.sector.create({ data: { name: 'TI' } });
  const role = await prisma.role.create({ data: { name: 'Usuário Final', level: 1 } });

  const user = await prisma.user.create({
    data: {
      name: 'Maria Souza',
      email: 'maria@example.com',
      passwordHash: 'hashed-password',
      roleId: role.id,
      sectorId: sector.id,
    },
  });

  expect(user.active).toBe(true);
  expect(user.sectorId).toBe(sector.id);
});

test('enforces unique email on users', async () => {
  const sector = await prisma.sector.create({ data: { name: 'RH' } });
  const role = await prisma.role.create({ data: { name: 'Gestor', level: 2 } });

  await prisma.user.create({
    data: {
      name: 'Carlos Lima',
      email: 'duplicado@example.com',
      passwordHash: 'hash1',
      roleId: role.id,
      sectorId: sector.id,
    },
  });

  await expect(
    prisma.user.create({
      data: {
        name: 'Outro Usuário',
        email: 'duplicado@example.com',
        passwordHash: 'hash2',
        roleId: role.id,
        sectorId: sector.id,
      },
    })
  ).rejects.toThrow();
});

test('creates a password reset token for a user', async () => {
  const sector = await prisma.sector.create({ data: { name: 'Financeiro' } });
  const role = await prisma.role.create({ data: { name: 'Administrador', level: 4 } });
  const user = await prisma.user.create({
    data: {
      name: 'Ana Paula',
      email: 'ana@example.com',
      passwordHash: 'hash',
      roleId: role.id,
      sectorId: sector.id,
    },
  });

  const token = await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      token: 'reset-token-123',
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });

  expect(token.usedAt).toBeNull();
});
```

- [ ] **Step 2: Create the Prisma Client singleton**

Create `backend/src/lib/prisma.js`:

```js
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = prisma;
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest tests/identity-rbac.test.js`
Expected: FAIL — `@prisma/client did not initialize yet` or `Cannot find module '@prisma/client'` (no schema/migration exists yet).

- [ ] **Step 4: Write the Prisma schema (identity & RBAC models)**

Create `backend/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Role {
  id              Int      @id @default(autoincrement())
  name            String   @unique
  level           Int
  isSystemDefault Boolean  @default(false)
  createdAt       DateTime @default(now())

  users             User[]
  permissions       RolePermission[]
  fieldVisibilities RoleFieldVisibility[]

  @@map("roles")
}

model RolePermission {
  id            Int     @id @default(autoincrement())
  roleId        Int
  permissionKey String
  enabled       Boolean @default(false)

  role Role @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@unique([roleId, permissionKey])
  @@map("role_permissions")
}

model RoleFieldVisibility {
  id       Int     @id @default(autoincrement())
  roleId   Int
  fieldKey String
  visible  Boolean @default(true)

  role Role @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@unique([roleId, fieldKey])
  @@map("role_field_visibilities")
}

model Sector {
  id   Int    @id @default(autoincrement())
  name String @unique

  users   User[]

  @@map("sectors")
}

model User {
  id           Int       @id @default(autoincrement())
  name         String
  email        String    @unique
  passwordHash String
  roleId       Int
  sectorId     Int
  active       Boolean   @default(true)
  lastLoginAt  DateTime?
  createdAt    DateTime  @default(now())

  role   Role   @relation(fields: [roleId], references: [id])
  sector Sector @relation(fields: [sectorId], references: [id])

  resetTokens PasswordResetToken[]

  @@map("users")
}

model PasswordResetToken {
  id        Int       @id @default(autoincrement())
  userId    Int
  token     String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("password_reset_tokens")
}
```

- [ ] **Step 5: Run the migration**

Run:
```bash
npx prisma migrate dev --name init_identity_rbac
```
Expected: creates `backend/prisma/migrations/<timestamp>_init_identity_rbac/`, prints `Your database is now in sync with your schema.`

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest tests/identity-rbac.test.js`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/prisma backend/src/lib/prisma.js backend/tests/identity-rbac.test.js
git commit -m "feat: add identity and RBAC schema (Role, User, Sector, PasswordResetToken)"
```

---

### Task 4: Ticket core schema (Category, Subcategory, SlaConfig, Ticket)

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/tests/ticket-core.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/ticket-core.test.js`:

```js
const prisma = require('../src/lib/prisma');

let sector;
let role;
let requester;

beforeAll(async () => {
  sector = await prisma.sector.create({ data: { name: 'Sector Teste Core' } });
  role = await prisma.role.create({ data: { name: 'Role Teste Core', level: 1 } });
  requester = await prisma.user.create({
    data: {
      name: 'Solicitante Teste',
      email: 'solicitante.core@example.com',
      passwordHash: 'hash',
      roleId: role.id,
      sectorId: sector.id,
    },
  });
});

afterAll(async () => {
  await prisma.ticket.deleteMany();
  await prisma.subcategory.deleteMany();
  await prisma.category.deleteMany();
  await prisma.slaConfig.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await prisma.sector.deleteMany();
  await prisma.$disconnect();
});

test('creates a category with subcategories', async () => {
  const category = await prisma.category.create({
    data: {
      name: 'TI Teste',
      subcategories: { create: [{ name: 'Hardware Teste' }, { name: 'Software Teste' }] },
    },
    include: { subcategories: true },
  });

  expect(category.subcategories).toHaveLength(2);
});

test('enforces unique subcategory name within the same category', async () => {
  const category = await prisma.category.create({ data: { name: 'RH Teste' } });
  await prisma.subcategory.create({ data: { categoryId: category.id, name: 'Admissão Teste' } });

  await expect(
    prisma.subcategory.create({ data: { categoryId: category.id, name: 'Admissão Teste' } })
  ).rejects.toThrow();
});

test('creates an SLA config per urgency and enforces uniqueness', async () => {
  await prisma.slaConfig.create({ data: { urgency: 'CRITICO', firstResponseHours: 1, resolutionHours: 4 } });

  await expect(
    prisma.slaConfig.create({ data: { urgency: 'CRITICO', firstResponseHours: 2, resolutionHours: 6 } })
  ).rejects.toThrow();
});

test('creates a ticket with default status ABERTO and required relations', async () => {
  const category = await prisma.category.create({
    data: { name: 'Financeiro Teste', subcategories: { create: [{ name: 'Pagamentos Teste' }] } },
    include: { subcategories: true },
  });

  const now = new Date();
  const ticket = await prisma.ticket.create({
    data: {
      title: 'Erro ao processar pagamento',
      description: 'O sistema retorna erro ao tentar processar o pagamento.',
      categoryId: category.id,
      subcategoryId: category.subcategories[0].id,
      urgency: 'ALTO',
      requesterId: requester.id,
      sectorId: sector.id,
      slaFirstResponseDeadline: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      slaResolutionDeadline: new Date(now.getTime() + 8 * 60 * 60 * 1000),
    },
  });

  expect(ticket.status).toBe('ABERTO');
  expect(ticket.assignedToId).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/ticket-core.test.js`
Expected: FAIL — `Cannot read properties of undefined (reading 'create')` (no `category`/`ticket` model on the Prisma Client yet).

- [ ] **Step 3: Add ticket core models to the schema**

Append to `backend/prisma/schema.prisma` (after the `PasswordResetToken` model):

```prisma
enum TicketUrgency {
  CRITICO
  ALTO
  MEDIO
  BAIXO
}

enum TicketStatus {
  ABERTO
  EM_ANDAMENTO
  AGUARDANDO
  RESOLVIDO
  FECHADO
}

model Category {
  id   Int    @id @default(autoincrement())
  name String @unique

  subcategories Subcategory[]
  tickets       Ticket[]

  @@map("categories")
}

model Subcategory {
  id         Int    @id @default(autoincrement())
  categoryId Int
  name       String

  category Category @relation(fields: [categoryId], references: [id])
  tickets  Ticket[]

  @@unique([categoryId, name])
  @@map("subcategories")
}

model SlaConfig {
  id                 Int           @id @default(autoincrement())
  urgency            TicketUrgency @unique
  firstResponseHours Int
  resolutionHours    Int

  @@map("sla_configs")
}

model Ticket {
  id                         Int           @id @default(autoincrement())
  title                       String
  description                 String
  categoryId                   Int
  subcategoryId                Int
  urgency                      TicketUrgency
  status                       TicketStatus  @default(ABERTO)
  requesterId                  Int
  assignedToId                 Int?
  sectorId                     Int
  estimatedCost                Decimal?      @db.Decimal(10, 2)
  createdAt                    DateTime      @default(now())
  firstResponseAt              DateTime?
  resolvedAt                   DateTime?
  closedAt                     DateTime?
  timeToFirstResponseMinutes   Int?
  timeToResolutionMinutes      Int?
  slaFirstResponseDeadline     DateTime
  slaResolutionDeadline        DateTime

  category    Category    @relation(fields: [categoryId], references: [id])
  subcategory Subcategory @relation(fields: [subcategoryId], references: [id])
  requester   User        @relation("TicketRequester", fields: [requesterId], references: [id])
  assignee    User?       @relation("TicketAssignee", fields: [assignedToId], references: [id])
  sector      Sector      @relation(fields: [sectorId], references: [id])

  @@index([status])
  @@index([urgency])
  @@index([assignedToId])
  @@index([createdAt])
  @@map("tickets")
}
```

Also update the `User` model to add the two reverse relations (replace the existing `User` model block):

```prisma
model User {
  id           Int       @id @default(autoincrement())
  name         String
  email        String    @unique
  passwordHash String
  roleId       Int
  sectorId     Int
  active       Boolean   @default(true)
  lastLoginAt  DateTime?
  createdAt    DateTime  @default(now())

  role   Role   @relation(fields: [roleId], references: [id])
  sector Sector @relation(fields: [sectorId], references: [id])

  resetTokens      PasswordResetToken[]
  ticketsRequested Ticket[] @relation("TicketRequester")
  ticketsAssigned  Ticket[] @relation("TicketAssignee")

  @@map("users")
}
```

And update `Sector` to add the reverse relation (replace the existing `Sector` model block):

```prisma
model Sector {
  id   Int    @id @default(autoincrement())
  name String @unique

  users   User[]
  tickets Ticket[]

  @@map("sectors")
}
```

- [ ] **Step 4: Run the migration**

Run:
```bash
npx prisma migrate dev --name add_ticket_core
```
Expected: `Your database is now in sync with your schema.`

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest tests/ticket-core.test.js`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/prisma backend/tests/ticket-core.test.js
git commit -m "feat: add ticket core schema (Category, Subcategory, SlaConfig, Ticket)"
```

---

### Task 5: Ticket time tracking & comments schema (TicketTimeLog, TicketComment, TicketAttachment)

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/tests/ticket-time-tracking.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/ticket-time-tracking.test.js`:

```js
const prisma = require('../src/lib/prisma');

let sector;
let role;
let user;
let ticket;

beforeAll(async () => {
  sector = await prisma.sector.create({ data: { name: 'Sector Teste TimeLog' } });
  role = await prisma.role.create({ data: { name: 'Role Teste TimeLog', level: 1 } });
  user = await prisma.user.create({
    data: {
      name: 'Usuário Teste TimeLog',
      email: 'timelog@example.com',
      passwordHash: 'hash',
      roleId: role.id,
      sectorId: sector.id,
    },
  });

  const category = await prisma.category.create({
    data: { name: 'Categoria Teste TimeLog', subcategories: { create: [{ name: 'Sub Teste TimeLog' }] } },
    include: { subcategories: true },
  });

  const now = new Date();
  ticket = await prisma.ticket.create({
    data: {
      title: 'Chamado teste timelog',
      description: 'Descrição de teste',
      categoryId: category.id,
      subcategoryId: category.subcategories[0].id,
      urgency: 'MEDIO',
      requesterId: user.id,
      sectorId: sector.id,
      slaFirstResponseDeadline: new Date(now.getTime() + 4 * 60 * 60 * 1000),
      slaResolutionDeadline: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    },
  });
});

afterAll(async () => {
  await prisma.ticketAttachment.deleteMany();
  await prisma.ticketComment.deleteMany();
  await prisma.ticketTimeLog.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.subcategory.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await prisma.sector.deleteMany();
  await prisma.$disconnect();
});

test('creates a CREATED time log entry for a ticket', async () => {
  const log = await prisma.ticketTimeLog.create({
    data: {
      ticketId: ticket.id,
      eventType: 'CREATED',
      toStatus: 'ABERTO',
      authorId: user.id,
    },
  });

  expect(log.eventType).toBe('CREATED');
});

test('creates a public comment and an internal note, defaulting to public', async () => {
  const publicComment = await prisma.ticketComment.create({
    data: { ticketId: ticket.id, authorId: user.id, body: 'Comentário público' },
  });
  const internalNote = await prisma.ticketComment.create({
    data: { ticketId: ticket.id, authorId: user.id, body: 'Nota interna', isInternal: true },
  });

  expect(publicComment.isInternal).toBe(false);
  expect(internalNote.isInternal).toBe(true);
});

test('creates an attachment linked to a comment and one linked directly to a ticket', async () => {
  const comment = await prisma.ticketComment.create({
    data: { ticketId: ticket.id, authorId: user.id, body: 'Comentário com anexo' },
  });

  const attachmentOnComment = await prisma.ticketAttachment.create({
    data: {
      ticketId: ticket.id,
      commentId: comment.id,
      fileName: 'print.png',
      filePath: '/uploads/print.png',
      uploadedById: user.id,
    },
  });

  const attachmentOnTicket = await prisma.ticketAttachment.create({
    data: {
      ticketId: ticket.id,
      fileName: 'documento.pdf',
      filePath: '/uploads/documento.pdf',
      uploadedById: user.id,
    },
  });

  expect(attachmentOnComment.commentId).toBe(comment.id);
  expect(attachmentOnTicket.commentId).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/ticket-time-tracking.test.js`
Expected: FAIL — `Cannot read properties of undefined (reading 'create')` for `ticketTimeLog`.

- [ ] **Step 3: Add time tracking and comment models to the schema**

Append to `backend/prisma/schema.prisma`:

```prisma
enum TicketTimeLogEventType {
  CREATED
  STATUS_CHANGE
  FIRST_RESPONSE
  PAUSE_START
  PAUSE_END
  RESOLVED
  CLOSED
  REOPENED
}

model TicketTimeLog {
  id         Int                    @id @default(autoincrement())
  ticketId   Int
  eventType  TicketTimeLogEventType
  fromStatus TicketStatus?
  toStatus   TicketStatus?
  authorId   Int
  occurredAt DateTime               @default(now())
  note       String?

  ticket Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  author User   @relation(fields: [authorId], references: [id])

  @@index([ticketId, occurredAt])
  @@map("ticket_time_logs")
}

model TicketComment {
  id         Int      @id @default(autoincrement())
  ticketId   Int
  authorId   Int
  body       String
  isInternal Boolean  @default(false)
  createdAt  DateTime @default(now())

  ticket      Ticket             @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  author      User               @relation(fields: [authorId], references: [id])
  attachments TicketAttachment[]

  @@map("ticket_comments")
}

model TicketAttachment {
  id           Int      @id @default(autoincrement())
  ticketId     Int
  commentId    Int?
  fileName     String
  filePath     String
  uploadedById Int
  createdAt    DateTime @default(now())

  ticket   Ticket         @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  comment  TicketComment? @relation(fields: [commentId], references: [id], onDelete: SetNull)
  uploader User           @relation(fields: [uploadedById], references: [id])

  @@map("ticket_attachments")
}
```

Also update the `Ticket` model to add the reverse relations (add these three lines inside the `Ticket` model, alongside the existing relation fields):

```prisma
  timeLogs    TicketTimeLog[]
  comments    TicketComment[]
  attachments TicketAttachment[]
```

And update the `User` model to add reverse relations (add inside the `User` model):

```prisma
  ticketTimeLogs    TicketTimeLog[]
  ticketComments    TicketComment[]
  ticketAttachments TicketAttachment[]
```

- [ ] **Step 4: Run the migration**

Run:
```bash
npx prisma migrate dev --name add_ticket_time_tracking
```
Expected: `Your database is now in sync with your schema.`

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest tests/ticket-time-tracking.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/prisma backend/tests/ticket-time-tracking.test.js
git commit -m "feat: add ticket time tracking and comment/attachment schema"
```

---

### Task 6: Ideas schema (Idea, IdeaVote, IdeaComment)

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/tests/ideas.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/ideas.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/ideas.test.js`
Expected: FAIL — `Cannot read properties of undefined (reading 'create')` for `idea`.

- [ ] **Step 3: Add idea models to the schema**

Append to `backend/prisma/schema.prisma`:

```prisma
enum IdeaStatus {
  NOVA
  EM_ANALISE
  APROVADA
  EM_IMPLEMENTACAO
  IMPLEMENTADA
  ARQUIVADA
}

model Idea {
  id              Int        @id @default(autoincrement())
  title           String
  description     String
  areaImpacted    String
  expectedBenefit String
  authorId        Int
  isAnonymous     Boolean    @default(false)
  status          IdeaStatus @default(NOVA)
  createdAt       DateTime   @default(now())

  author   User          @relation(fields: [authorId], references: [id])
  votes    IdeaVote[]
  comments IdeaComment[]

  @@map("ideas")
}

model IdeaVote {
  id        Int      @id @default(autoincrement())
  ideaId    Int
  userId    Int
  createdAt DateTime @default(now())

  idea Idea @relation(fields: [ideaId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id])

  @@unique([ideaId, userId])
  @@map("idea_votes")
}

model IdeaComment {
  id        Int      @id @default(autoincrement())
  ideaId    Int
  authorId  Int
  body      String
  createdAt DateTime @default(now())

  idea   Idea @relation(fields: [ideaId], references: [id], onDelete: Cascade)
  author User @relation(fields: [authorId], references: [id])

  @@map("idea_comments")
}
```

Also update the `User` model to add reverse relations (add inside the `User` model):

```prisma
  ideas        Idea[]
  ideaVotes    IdeaVote[]
  ideaComments IdeaComment[]
```

- [ ] **Step 4: Run the migration**

Run:
```bash
npx prisma migrate dev --name add_ideas
```
Expected: `Your database is now in sync with your schema.`

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest tests/ideas.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/prisma backend/tests/ideas.test.js
git commit -m "feat: add ideas schema (Idea, IdeaVote, IdeaComment)"
```

---

### Task 7: Notification schema

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/tests/notifications.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/notifications.test.js`:

```js
const prisma = require('../src/lib/prisma');

let sector;
let role;
let user;

beforeAll(async () => {
  sector = await prisma.sector.create({ data: { name: 'Sector Teste Notif' } });
  role = await prisma.role.create({ data: { name: 'Role Teste Notif', level: 1 } });
  user = await prisma.user.create({
    data: {
      name: 'Usuário Teste Notif',
      email: 'notif@example.com',
      passwordHash: 'hash',
      roleId: role.id,
      sectorId: sector.id,
    },
  });
});

afterAll(async () => {
  await prisma.notification.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await prisma.sector.deleteMany();
  await prisma.$disconnect();
});

test('creates a notification defaulting to unread', async () => {
  const notification = await prisma.notification.create({
    data: {
      userId: user.id,
      type: 'TICKET_ASSIGNED',
      message: 'Você recebeu um novo chamado.',
      link: '/tickets/1',
    },
  });

  expect(notification.isRead).toBe(false);
});

test('marks a notification as read', async () => {
  const notification = await prisma.notification.create({
    data: { userId: user.id, type: 'TICKET_UPDATED', message: 'Chamado atualizado.' },
  });

  const updated = await prisma.notification.update({
    where: { id: notification.id },
    data: { isRead: true },
  });

  expect(updated.isRead).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/notifications.test.js`
Expected: FAIL — `Cannot read properties of undefined (reading 'create')` for `notification`.

- [ ] **Step 3: Add the Notification model to the schema**

Append to `backend/prisma/schema.prisma`:

```prisma
model Notification {
  id        Int      @id @default(autoincrement())
  userId    Int
  type      String
  message   String
  link      String?
  isRead    Boolean  @default(false)
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, isRead])
  @@map("notifications")
}
```

Also update the `User` model to add the reverse relation (add inside the `User` model):

```prisma
  notifications Notification[]
```

- [ ] **Step 4: Run the migration**

Run:
```bash
npx prisma migrate dev --name add_notifications
```
Expected: `Your database is now in sync with your schema.`

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest tests/notifications.test.js`
Expected: PASS (2 tests).

- [ ] **Step 6: Run the full test suite to confirm nothing regressed**

Run: `npx jest --runInBand`
Expected: PASS, 6 test suites, 17 tests total.

- [ ] **Step 7: Commit**

```bash
git add backend/prisma backend/tests/notifications.test.js
git commit -m "feat: add notification schema"
```

---

### Task 8: Seed script with example data

**Files:**
- Create: `backend/prisma/seed.js`
- Create: `backend/scripts/verify-seed.js`
- Modify: `backend/package.json` (add `bcrypt` dependency)

- [ ] **Step 1: Add bcrypt dependency**

Run (from `backend/`):
```bash
npm install bcrypt
```
Expected: adds `bcrypt` to `dependencies` in `package.json` and installs without errors.

- [ ] **Step 2: Write the seed script**

Create `backend/prisma/seed.js`:

```js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const URGENCY_SLA_HOURS = {
  CRITICO: { firstResponseHours: 1, resolutionHours: 4 },
  ALTO: { firstResponseHours: 2, resolutionHours: 8 },
  MEDIO: { firstResponseHours: 4, resolutionHours: 24 },
  BAIXO: { firstResponseHours: 8, resolutionHours: 72 },
};

const TICKET_TITLES = [
  'Computador não liga',
  'Erro ao acessar sistema financeiro',
  'Solicitação de novo crachá',
  'Internet instável no setor',
  'Pedido de reembolso de viagem',
  'Impressora sem tonner',
  'Acesso negado à pasta compartilhada',
  'Dúvida sobre benefício de saúde',
  'Lentidão no sistema de RH',
  'Manutenção do ar-condicionado',
];

const IDEA_DEFINITIONS = [
  { title: 'Padronizar respostas automáticas de chamados', areaImpacted: 'TI', expectedBenefit: 'Reduz tempo de primeira resposta', status: 'IMPLEMENTADA' },
  { title: 'Checklist de onboarding para novos colaboradores', areaImpacted: 'RH', expectedBenefit: 'Reduz erros no processo de admissão', status: 'EM_IMPLEMENTACAO' },
  { title: 'Aprovação digital de reembolsos', areaImpacted: 'Financeiro', expectedBenefit: 'Agiliza reembolsos em até 2 dias', status: 'APROVADA' },
  { title: 'Manutenção preventiva trimestral de ar-condicionado', areaImpacted: 'Infraestrutura', expectedBenefit: 'Reduz chamados de manutenção corretiva', status: 'EM_ANALISE' },
  { title: 'Base de conhecimento self-service', areaImpacted: 'TI', expectedBenefit: 'Reduz volume de chamados repetitivos', status: 'NOVA' },
  { title: 'Pesquisa de satisfação pós-fechamento', areaImpacted: 'TI', expectedBenefit: 'Mede qualidade do atendimento', status: 'NOVA' },
  { title: 'Revisão do plano de benefícios', areaImpacted: 'RH', expectedBenefit: 'Aumenta satisfação dos colaboradores', status: 'ARQUIVADA' },
  { title: 'Dashboard de gastos por setor', areaImpacted: 'Financeiro', expectedBenefit: 'Melhora visibilidade orçamentária', status: 'EM_ANALISE' },
  { title: 'App de abertura de chamados via celular', areaImpacted: 'TI', expectedBenefit: 'Facilita abertura de chamados em campo', status: 'APROVADA' },
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(array) {
  return array[randomInt(0, array.length - 1)];
}

async function clearDatabase() {
  await prisma.notification.deleteMany();
  await prisma.ideaComment.deleteMany();
  await prisma.ideaVote.deleteMany();
  await prisma.idea.deleteMany();
  await prisma.ticketAttachment.deleteMany();
  await prisma.ticketComment.deleteMany();
  await prisma.ticketTimeLog.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.subcategory.deleteMany();
  await prisma.category.deleteMany();
  await prisma.slaConfig.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.sector.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.roleFieldVisibility.deleteMany();
  await prisma.role.deleteMany();
}

async function seedRolesAndPermissions() {
  const admin = await prisma.role.create({ data: { name: 'Administrador', level: 4, isSystemDefault: true } });
  const gestor = await prisma.role.create({ data: { name: 'Gestor', level: 3, isSystemDefault: true } });
  const tecnico = await prisma.role.create({ data: { name: 'Técnico/Atendente', level: 2, isSystemDefault: true } });
  const usuarioFinal = await prisma.role.create({ data: { name: 'Usuário Final', level: 1, isSystemDefault: true } });

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

  const rolePermissionMatrix = {
    [admin.id]: allPermissionKeys,
    [gestor.id]: [
      'view_performance_panel',
      'view_financial_reports',
      'reassign_tickets',
      'close_tickets',
      'view_internal_notes',
      'reopen_tickets',
    ],
    [tecnico.id]: ['view_internal_notes', 'reopen_tickets', 'view_own_metrics'],
    [usuarioFinal.id]: [],
  };

  for (const [roleId, enabledKeys] of Object.entries(rolePermissionMatrix)) {
    for (const key of allPermissionKeys) {
      await prisma.rolePermission.create({
        data: { roleId: Number(roleId), permissionKey: key, enabled: enabledKeys.includes(key) },
      });
    }
  }

  const allFieldKeys = ['assigned_to', 'estimated_cost', 'internal_notes', 'sla_badge'];

  const fieldVisibilityMatrix = {
    [admin.id]: allFieldKeys,
    [gestor.id]: allFieldKeys,
    [tecnico.id]: ['assigned_to', 'sla_badge'],
    [usuarioFinal.id]: [],
  };

  for (const [roleId, visibleKeys] of Object.entries(fieldVisibilityMatrix)) {
    for (const key of allFieldKeys) {
      await prisma.roleFieldVisibility.create({
        data: { roleId: Number(roleId), fieldKey: key, visible: visibleKeys.includes(key) },
      });
    }
  }

  return { admin, gestor, tecnico, usuarioFinal };
}

async function seedSectors() {
  const names = ['TI', 'RH', 'Financeiro'];
  const sectors = [];
  for (const name of names) {
    sectors.push(await prisma.sector.create({ data: { name } }));
  }
  return sectors;
}

async function seedCategories() {
  const definitions = [
    { name: 'TI', subcategories: ['Hardware', 'Software', 'Rede'] },
    { name: 'RH', subcategories: ['Admissão', 'Benefícios'] },
    { name: 'Financeiro', subcategories: ['Pagamentos', 'Reembolsos'] },
    { name: 'Infraestrutura', subcategories: ['Manutenção', 'Predial'] },
  ];

  const categories = [];
  for (const def of definitions) {
    categories.push(
      await prisma.category.create({
        data: { name: def.name, subcategories: { create: def.subcategories.map((name) => ({ name })) } },
        include: { subcategories: true },
      })
    );
  }
  return categories;
}

async function seedSlaConfig() {
  for (const [urgency, hours] of Object.entries(URGENCY_SLA_HOURS)) {
    await prisma.slaConfig.create({
      data: { urgency, firstResponseHours: hours.firstResponseHours, resolutionHours: hours.resolutionHours },
    });
  }
}

async function seedUsers(roles, sectors) {
  const passwordHash = await bcrypt.hash('Senha123!', 10);

  const definitions = [
    { name: 'Ana Souza', email: 'admin@helpdesk.com', roleId: roles.admin.id, sectorId: sectors[0].id },
    { name: 'Beatriz Lima', email: 'gestor1@helpdesk.com', roleId: roles.gestor.id, sectorId: sectors[0].id },
    { name: 'Renato Alves', email: 'gestor2@helpdesk.com', roleId: roles.gestor.id, sectorId: sectors[1].id },
    { name: 'Carla Mendes', email: 'tecnico1@helpdesk.com', roleId: roles.tecnico.id, sectorId: sectors[0].id },
    { name: 'Diego Santos', email: 'tecnico2@helpdesk.com', roleId: roles.tecnico.id, sectorId: sectors[0].id },
    { name: 'Fernanda Costa', email: 'tecnico3@helpdesk.com', roleId: roles.tecnico.id, sectorId: sectors[1].id },
    { name: 'Gustavo Pereira', email: 'tecnico4@helpdesk.com', roleId: roles.tecnico.id, sectorId: sectors[2].id },
    { name: 'Helena Rocha', email: 'usuario1@helpdesk.com', roleId: roles.usuarioFinal.id, sectorId: sectors[0].id },
    { name: 'Igor Martins', email: 'usuario2@helpdesk.com', roleId: roles.usuarioFinal.id, sectorId: sectors[1].id },
    { name: 'Julia Ferreira', email: 'usuario3@helpdesk.com', roleId: roles.usuarioFinal.id, sectorId: sectors[2].id },
  ];

  const users = [];
  for (const def of definitions) {
    users.push(await prisma.user.create({ data: { ...def, passwordHash } }));
  }
  return users;
}

async function createTicketWithTimeline({
  title,
  category,
  subcategory,
  urgency,
  requester,
  assignee,
  sector,
  createdAt,
  finalStatus,
  hadPause,
}) {
  const sla = URGENCY_SLA_HOURS[urgency];
  const slaFirstResponseDeadline = new Date(createdAt.getTime() + sla.firstResponseHours * HOUR_MS);
  const slaResolutionDeadline = new Date(createdAt.getTime() + sla.resolutionHours * HOUR_MS);

  const ticket = await prisma.ticket.create({
    data: {
      title,
      description: `Descrição detalhada do chamado: ${title}.`,
      categoryId: category.id,
      subcategoryId: subcategory.id,
      urgency,
      status: 'ABERTO',
      requesterId: requester.id,
      assignedToId: assignee ? assignee.id : null,
      sectorId: sector.id,
      createdAt,
      slaFirstResponseDeadline,
      slaResolutionDeadline,
    },
  });

  await prisma.ticketTimeLog.create({
    data: { ticketId: ticket.id, eventType: 'CREATED', toStatus: 'ABERTO', authorId: requester.id, occurredAt: createdAt },
  });

  if (finalStatus === 'ABERTO') {
    return ticket;
  }

  const firstResponseAt = new Date(createdAt.getTime() + randomInt(15, 180) * MINUTE_MS);
  await prisma.ticketTimeLog.create({
    data: {
      ticketId: ticket.id,
      eventType: 'FIRST_RESPONSE',
      fromStatus: 'ABERTO',
      toStatus: 'EM_ANDAMENTO',
      authorId: assignee.id,
      occurredAt: firstResponseAt,
    },
  });
  const timeToFirstResponseMinutes = Math.round((firstResponseAt - createdAt) / MINUTE_MS);

  if (finalStatus === 'AGUARDANDO') {
    const pauseStart = new Date(firstResponseAt.getTime() + randomInt(30, 120) * MINUTE_MS);
    await prisma.ticketTimeLog.create({
      data: {
        ticketId: ticket.id,
        eventType: 'PAUSE_START',
        fromStatus: 'EM_ANDAMENTO',
        toStatus: 'AGUARDANDO',
        authorId: assignee.id,
        occurredAt: pauseStart,
      },
    });
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: 'AGUARDANDO', firstResponseAt, timeToFirstResponseMinutes },
    });
    return ticket;
  }

  if (finalStatus === 'EM_ANDAMENTO') {
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: 'EM_ANDAMENTO', firstResponseAt, timeToFirstResponseMinutes },
    });
    return ticket;
  }

  let cursor = firstResponseAt;
  let pauseMinutes = 0;

  if (hadPause) {
    const pauseStart = new Date(cursor.getTime() + randomInt(30, 120) * MINUTE_MS);
    const pauseEnd = new Date(pauseStart.getTime() + randomInt(60, 480) * MINUTE_MS);

    await prisma.ticketTimeLog.create({
      data: {
        ticketId: ticket.id,
        eventType: 'PAUSE_START',
        fromStatus: 'EM_ANDAMENTO',
        toStatus: 'AGUARDANDO',
        authorId: assignee.id,
        occurredAt: pauseStart,
      },
    });
    await prisma.ticketTimeLog.create({
      data: {
        ticketId: ticket.id,
        eventType: 'PAUSE_END',
        fromStatus: 'AGUARDANDO',
        toStatus: 'EM_ANDAMENTO',
        authorId: assignee.id,
        occurredAt: pauseEnd,
      },
    });

    pauseMinutes = Math.round((pauseEnd - pauseStart) / MINUTE_MS);
    cursor = pauseEnd;
  }

  const resolvedAt = new Date(cursor.getTime() + randomInt(60, 2880) * MINUTE_MS);
  await prisma.ticketTimeLog.create({
    data: {
      ticketId: ticket.id,
      eventType: 'RESOLVED',
      fromStatus: 'EM_ANDAMENTO',
      toStatus: 'RESOLVIDO',
      authorId: assignee.id,
      occurredAt: resolvedAt,
    },
  });
  const timeToResolutionMinutes = Math.round((resolvedAt - createdAt) / MINUTE_MS) - pauseMinutes;

  if (finalStatus === 'RESOLVIDO') {
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: 'RESOLVIDO', firstResponseAt, timeToFirstResponseMinutes, resolvedAt, timeToResolutionMinutes },
    });
    return ticket;
  }

  const closedAt = new Date(resolvedAt.getTime() + randomInt(60, 1440) * MINUTE_MS);
  await prisma.ticketTimeLog.create({
    data: {
      ticketId: ticket.id,
      eventType: 'CLOSED',
      fromStatus: 'RESOLVIDO',
      toStatus: 'FECHADO',
      authorId: assignee.id,
      occurredAt: closedAt,
    },
  });
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      status: 'FECHADO',
      firstResponseAt,
      timeToFirstResponseMinutes,
      resolvedAt,
      timeToResolutionMinutes,
      closedAt,
    },
  });
  return ticket;
}

async function seedTickets(categories, sectors, users) {
  const technicians = users.filter((u) => u.email.startsWith('tecnico'));
  const finalUsers = users.filter((u) => u.email.startsWith('usuario'));
  const urgencies = ['CRITICO', 'ALTO', 'MEDIO', 'BAIXO'];
  const statusPool = ['ABERTO', 'EM_ANDAMENTO', 'AGUARDANDO', 'RESOLVIDO', 'RESOLVIDO', 'FECHADO', 'FECHADO'];
  const now = new Date();

  for (let i = 0; i < 50; i += 1) {
    const category = pick(categories);
    const subcategory = pick(category.subcategories);
    const urgency = pick(urgencies);
    const finalStatus = pick(statusPool);
    const requester = pick(finalUsers);
    const assignee = pick(technicians);
    const sector = sectors.find((s) => s.id === requester.sectorId);
    const createdAt = new Date(now.getTime() - randomInt(0, 30 * 24 * 60) * MINUTE_MS);

    await createTicketWithTimeline({
      title: pick(TICKET_TITLES),
      category,
      subcategory,
      urgency,
      requester,
      assignee: finalStatus === 'ABERTO' ? null : assignee,
      sector,
      createdAt,
      finalStatus,
      hadPause: randomInt(0, 1) === 1,
    });
  }
}

async function seedIdeas(users) {
  for (const def of IDEA_DEFINITIONS) {
    const author = pick(users);
    const idea = await prisma.idea.create({
      data: {
        title: def.title,
        description: `Proposta de melhoria: ${def.title}.`,
        areaImpacted: def.areaImpacted,
        expectedBenefit: def.expectedBenefit,
        authorId: author.id,
        isAnonymous: Math.random() < 0.2,
        status: def.status,
      },
    });

    const voters = users.filter(() => Math.random() < 0.4);
    for (const voter of voters) {
      await prisma.ideaVote.create({ data: { ideaId: idea.id, userId: voter.id } });
    }

    if (def.status !== 'NOVA') {
      const reviewer = pick(users);
      await prisma.ideaComment.create({
        data: { ideaId: idea.id, authorId: reviewer.id, body: `Status atualizado para ${def.status}.` },
      });
    }
  }
}

async function main() {
  await clearDatabase();
  const roles = await seedRolesAndPermissions();
  const sectors = await seedSectors();
  const categories = await seedCategories();
  await seedSlaConfig();
  const users = await seedUsers(roles, sectors);
  await seedTickets(categories, sectors, users);
  await seedIdeas(users);

  console.log('Seed concluído com sucesso.');
  console.log('Login do administrador: admin@helpdesk.com / Senha123!');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 3: Write the verification script**

Create `backend/scripts/verify-seed.js`:

```js
const prisma = require('../src/lib/prisma');

async function main() {
  const counts = {
    Roles: await prisma.role.count(),
    Sectors: await prisma.sector.count(),
    Categories: await prisma.category.count(),
    SlaConfigs: await prisma.slaConfig.count(),
    Users: await prisma.user.count(),
    Tickets: await prisma.ticket.count(),
    Ideas: await prisma.idea.count(),
  };

  console.log(counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 4: Run the seed**

Run (from `backend/`):
```bash
npm run db:seed
```
Expected output ends with:
```
Seed concluído com sucesso.
Login do administrador: admin@helpdesk.com / Senha123!
```

- [ ] **Step 5: Verify the seeded counts**

Run:
```bash
npm run db:verify-seed
```
Expected output:
```
{
  Roles: 4,
  Sectors: 3,
  Categories: 4,
  SlaConfigs: 4,
  Users: 10,
  Tickets: 50,
  Ideas: 9
}
```

- [ ] **Step 6: Note the test/seed interaction**

`npx jest` and `npm run db:seed` both wipe and repopulate the same tables. Don't run them back-to-back expecting both data sets to coexist — running the test suite after seeding will delete the seed data (each test file cleans up its own tables), and re-running the seed will wipe any data you created by hand while testing the app. Treat them as two different workflows: `npx jest` to verify schema correctness, `npm run db:seed` to get a populated demo database. This is documented in the README in Task 9.

- [ ] **Step 7: Commit**

```bash
git add backend/prisma/seed.js backend/scripts/verify-seed.js backend/package.json backend/package-lock.json
git commit -m "feat: add seed script with example roles, users, tickets and ideas"
```

---

### Task 9: README setup instructions

**Files:**
- Create: `README.md` (repo root)

- [ ] **Step 1: Write the README**

Create `README.md` (repo root):

```markdown
# Sistema de Chamados (Helpdesk)

Sistema completo de helpdesk/ticketing com painel web. Veja o design completo
em `docs/superpowers/specs/2026-06-22-helpdesk-design.md`.

## Status atual

Esta é a Fase 1 do projeto: schema do banco de dados, migrations e dados de
exemplo (seed). As fases seguintes (autenticação, módulo de chamados, painel
de desempenho, ideias, dashboard e admin) ainda serão adicionadas — esta
seção do README será expandida a cada fase.

## Stack

- Backend: Node.js + Express + Prisma ORM + PostgreSQL
- Frontend: React (Vite) + Tailwind CSS (ainda não iniciado)

## Pré-requisitos

- Node.js 20+
- Docker e Docker Compose (para o PostgreSQL local)

## Como rodar localmente

1. Suba o banco de dados PostgreSQL:

   ```bash
   docker compose up -d postgres
   ```

2. Instale as dependências do backend:

   ```bash
   cd backend
   npm install
   ```

3. Copie o arquivo de variáveis de ambiente:

   ```bash
   cp .env.example .env
   ```

4. Rode as migrations:

   ```bash
   npx prisma migrate dev
   ```

5. Popule o banco com dados de exemplo:

   ```bash
   npm run db:seed
   ```

   Isso cria 4 perfis (Administrador, Gestor, Técnico/Atendente, Usuário
   Final), 3 setores, categorias/subcategorias, configuração de SLA por
   urgência, 10 usuários de exemplo e ~50 chamados com timestamps variados.

6. Para criar o primeiro administrador (já incluído no seed):

   - **E-mail:** `admin@helpdesk.com`
   - **Senha:** `Senha123!`

   (A autenticação real ainda será implementada na próxima fase; por
   enquanto este usuário existe apenas no banco de dados.)

## Variáveis de ambiente (backend/.env)

| Variável       | Descrição                                  | Exemplo                                                              |
|----------------|---------------------------------------------|-----------------------------------------------------------------------|
| `DATABASE_URL` | String de conexão do PostgreSQL             | `postgresql://helpdesk:helpdesk@localhost:5432/helpdesk?schema=public` |
| `PORT`         | Porta em que o backend Express escuta       | `4000`                                                                 |

## Testes

```bash
cd backend
npx jest --runInBand
```

**Importante:** os testes e o seed (`npm run db:seed`) operam sobre as
mesmas tabelas e cada um limpa os dados que usa. Não rode `npx jest` depois
de `npm run db:seed` esperando que os dados de exemplo permaneçam — execute
um ou outro dependendo do que você precisa no momento (verificar o schema
vs. ter uma base de demonstração populada).

## Verificar dados de exemplo

```bash
cd backend
npm run db:verify-seed
```
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add Phase 1 setup instructions to README"
```

---

## Self-Review Notes

- **Spec coverage:** every model in spec section 4 (Role, RolePermission, RoleFieldVisibility, Sector, User, PasswordResetToken, Category, Subcategory, SlaConfig, Ticket, TicketTimeLog, TicketComment, TicketAttachment, Idea, IdeaVote, IdeaComment, Notification) is created across Tasks 3-7, with the indexes from section 4 applied to `Ticket` and `TicketTimeLog`. The seed (Task 8) matches the section 9 "conjunto moderado" sizing (10 users, 50 tickets, 9 ideas) and follows the exact pause/first-response/reopen invariants from section 5 (forced pause closure, first-response restricted to the assignee's visible actions) — `REOPENED` itself isn't exercised in seed data since no application logic exists yet to trigger it; that's exercised when Phase 3 builds the reopen endpoint.
- **No placeholders:** every step has runnable code or an exact command with expected output.
- **Naming consistency:** `SlaConfig` (not `SLAConfig`) is used consistently in schema, tests, and seed so the Prisma Client accessor is the readable `prisma.slaConfig` rather than `prisma.sLAConfig`. `timeToFirstResponseMinutes` / `timeToResolutionMinutes` field names match the spec and are used identically in Task 4's schema and Task 8's seed calculations.
