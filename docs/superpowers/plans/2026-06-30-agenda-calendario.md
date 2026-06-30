# Agenda / Calendário — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar agenda estilo calendário onde admins/gestores criam eventos (reuniões, convocações) para empresa/setor/usuários específicos, com RSVP e notificações automáticas 3 e 1 dia antes.

**Architecture:** Módulo `backend/src/modules/events/` com controller + routes seguindo padrão do módulo `ideas`. Cron diário em `backend/src/lib/eventNotificationCron.js` usando `node-cron`, registrado dentro do `require.main === module` guard em `server.js`. Frontend: `AgendaPage.jsx` com toggle grade mensal / lista cronológica, modais de criação e detalhe inline (sem Radix Dialog).

**Tech Stack:** Node.js, Express, Prisma/PostgreSQL, node-cron (nova dep backend), React 18, TanStack Query v5, Tailwind CSS, Lucide React, Zustand.

## Global Constraints

- Nova dependência backend: `node-cron` — instalar com `npm install node-cron` na pasta `backend/`
- Sem novas dependências frontend — todas as libs necessárias já estão instaladas
- Cron registrado apenas dentro de `if (require.main === module)` em `server.js` (linha 64) — nunca no nível superior do módulo
- `scope='SETOR'` usa apenas `User.sectorId` (FK principal), NÃO `UserSector` (vínculos secundários)
- `manage_events` deve aparecer TANTO em `PERMISSION_KEYS` (permissions.js) QUANTO na matriz do Gestor (seed.js) — ambos obrigatórios
- Notificações de convite enviadas individualmente (loop for, não `createMany`) para garantir isolamento de falhas
- Race condition do cron: atualizar flag ANTES de enviar notificação; capturar P2025 silenciosamente (attendee deletado por cascade)
- Modal pattern: `<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">` — igual ao AdminUsersPage.jsx (sem Radix Dialog)
- Testes backend: Jest + Supertest + Prisma real (sem mocks de banco) — mesmo padrão de todos os outros testes da suite
- Testes de cron: Jest com mocks de `prisma` e `notificationService` via `jest.mock` (unitários, sem banco)
- Comando de testes: `cd backend && npm test -- tests/events-api.test.js` / `npm test -- tests/events-cron.test.js`

---

## File Map

**Backend — criar:**
- `backend/src/modules/events/events.controller.js`
- `backend/src/modules/events/events.routes.js`
- `backend/src/lib/eventNotificationCron.js`
- `backend/tests/events-api.test.js`
- `backend/tests/events-cron.test.js`

**Backend — modificar:**
- `backend/prisma/schema.prisma` — adicionar Event, EventAttendee, relações em User e Sector
- `backend/src/lib/permissions.js` — adicionar `'manage_events'` ao array
- `backend/prisma/seed.js` — adicionar `manage_events` ao Gestor e eventos ao `clearDatabase`
- `backend/src/lib/notificationService.js` — adicionar 3 funções de evento
- `backend/src/server.js` — montar events routes + registrar cron

**Frontend — criar:**
- `frontend/src/api/events.js`
- `frontend/src/pages/AgendaPage.jsx`
- `frontend/src/pages/agenda/CalendarGrid.jsx`
- `frontend/src/pages/agenda/EventListView.jsx`
- `frontend/src/pages/agenda/EventCard.jsx`
- `frontend/src/pages/agenda/EventModal.jsx`
- `frontend/src/pages/agenda/EventDetailModal.jsx`

**Frontend — modificar:**
- `frontend/src/App.jsx` — lazy import + rota `/agenda`
- `frontend/src/components/layout/Sidebar.jsx` — item "Agenda" com ícone Calendar

---

### Task 1: Prisma migration — Event + EventAttendee

**Files:**
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**
- Produz: tabelas `events` e `event_attendees` no banco; modelos `prisma.event` e `prisma.eventAttendee` disponíveis para Tasks 4 e 5

---

- [ ] **Step 1: Adicionar relações ao modelo User**

Em `backend/prisma/schema.prisma`, encontrar o modelo `User`. Após a linha `userSectors UserSector[]` (linha 89) e antes do fechamento `@@map("users")`, adicionar:

```prisma
  eventsCreated  Event[]         @relation("EventsCreated")
  eventAttendees EventAttendee[]
```

O bloco final do modelo User deve ficar:
```prisma
  notifications Notification[]
  emailChangeTokens EmailChangeToken[]
  userSectors       UserSector[]

  eventsCreated  Event[]         @relation("EventsCreated")
  eventAttendees EventAttendee[]

  @@map("users")
}
```

- [ ] **Step 2: Adicionar relação ao modelo Sector**

Em `backend/prisma/schema.prisma`, encontrar o modelo `Sector`. Após a linha `userSectors UserSector[]` e antes do fechamento `@@map("sectors")`, adicionar:

```prisma
  events Event[]
```

O bloco final do modelo Sector deve ficar:
```prisma
  users       User[]
  tickets     Ticket[]
  userSectors UserSector[]
  events      Event[]

  @@map("sectors")
}
```

- [ ] **Step 3: Adicionar modelos Event e EventAttendee no final do schema**

Ao final de `backend/prisma/schema.prisma` (após o fechamento `}` do modelo `UserSector`, linha 345), adicionar:

```prisma

model Event {
  id          Int            @id @default(autoincrement())
  title       String
  description String?
  location    String?
  startAt     DateTime
  endAt       DateTime
  scope       String
  sectorId    Int?
  sector      Sector?        @relation(fields: [sectorId], references: [id], onDelete: SetNull)
  createdById Int
  createdBy   User           @relation("EventsCreated", fields: [createdById], references: [id], onDelete: Cascade)
  attendees   EventAttendee[]
  createdAt   DateTime       @default(now())

  @@index([startAt])
  @@index([sectorId])
  @@map("events")
}

model EventAttendee {
  id         Int      @id @default(autoincrement())
  eventId    Int
  event      Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  userId     Int
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  rsvp       String   @default("PENDENTE")
  notified3d Boolean  @default(false)
  notified1d Boolean  @default(false)
  createdAt  DateTime @default(now())

  @@unique([eventId, userId])
  @@index([userId])
  @@map("event_attendees")
}
```

- [ ] **Step 4: Rodar a migration**

```
cd backend && npx prisma migrate dev --name add_events
```

Esperado: saída com "Your database is now in sync with your schema." e criação de dois novos arquivos de migração em `backend/prisma/migrations/`.

- [ ] **Step 5: Verificar que os modelos existem**

```
cd backend && node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();Promise.all([p.event.count(),p.eventAttendee.count()]).then(console.log).finally(()=>p.\$disconnect())"
```

Esperado: `[ 0, 0 ]` sem erro.

- [ ] **Step 6: Garantir que os testes existentes ainda passam**

```
cd backend && npm test -- tests/ideas-api.test.js
```

Esperado: todos os testes passando (a migration não deve quebrar nada existente).

- [ ] **Step 7: Commit**

```
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat: add Event and EventAttendee to Prisma schema"
```

---

### Task 2: Permission setup — manage_events

**Files:**
- Modify: `backend/src/lib/permissions.js`
- Modify: `backend/prisma/seed.js`

**Interfaces:**
- Consumes: nada (standalone)
- Produz: chave `'manage_events'` disponível em `PERMISSION_KEYS` e na matriz do Gestor no seed; necessário para Task 4 (requirePermission) e Task 6 (ProtectedRoute)

---

- [ ] **Step 1: Escrever o teste de permissão**

Em `backend/tests/permissions-lib.test.js`, verificar se o arquivo já existe. Se sim, abrir e adicionar ao final:

```js
test('PERMISSION_KEYS inclui manage_events', () => {
  const { PERMISSION_KEYS } = require('../src/lib/permissions');
  expect(PERMISSION_KEYS).toContain('manage_events');
});
```

Se o arquivo não existir, criar `backend/tests/permissions-manage-events.test.js` com:

```js
const { PERMISSION_KEYS } = require('../src/lib/permissions');

test('PERMISSION_KEYS inclui manage_events', () => {
  expect(PERMISSION_KEYS).toContain('manage_events');
});
```

- [ ] **Step 2: Rodar o teste — deve falhar**

```
cd backend && npm test -- tests/permissions-lib.test.js
```

(ou `permissions-manage-events.test.js` se criado novo)

Esperado: FAIL — `manage_events` não encontrado.

- [ ] **Step 3: Adicionar manage_events ao PERMISSION_KEYS**

Em `backend/src/lib/permissions.js`, modificar o array `PERMISSION_KEYS` adicionando `'manage_events'` ao final:

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
  'manage_events',
];
```

- [ ] **Step 4: Rodar o teste — deve passar**

```
cd backend && npm test -- tests/permissions-lib.test.js
```

Esperado: PASS.

- [ ] **Step 5: Adicionar manage_events ao Gestor no seed**

Em `backend/prisma/seed.js`, na função `seedRolesAndPermissions()`, encontrar o array do `[gestor.id]` e adicionar `'manage_events'`:

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
  'manage_events',
],
```

- [ ] **Step 6: Adicionar eventos ao clearDatabase do seed**

Em `backend/prisma/seed.js`, na função `clearDatabase()`, adicionar ANTES das linhas que deletam `user` e `sector` (para respeitar as FK):

```js
await prisma.eventAttendee.deleteMany();
await prisma.event.deleteMany();
```

O bloco `clearDatabase` deve incluir:
```js
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
  await prisma.eventAttendee.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany();
  await prisma.sector.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.roleFieldVisibility.deleteMany();
  await prisma.role.deleteMany();
}
```

- [ ] **Step 7: Commit**

```
git add backend/src/lib/permissions.js backend/prisma/seed.js backend/tests/
git commit -m "feat: add manage_events permission key and assign to Gestor role"
```

---

### Task 3: Notification service — event functions

**Files:**
- Modify: `backend/src/lib/notificationService.js`

**Interfaces:**
- Consumes: função privada `notify({ userId, type, message, link })` já existente no módulo
- Produz: exports `notifyEventInvitation(userId, event)`, `notifyEventReminder(userId, event, daysAhead)`, `notifyEventCancelled(userId, event)` — consumidos por Task 4 (controller) e Task 5 (cron)

---

- [ ] **Step 1: Adicionar as três funções ao notificationService.js**

Em `backend/src/lib/notificationService.js`, adicionar após a função `notifyIdeaVote` e antes do `module.exports`:

```js
async function notifyEventInvitation(userId, event) {
  try {
    await notify({
      userId,
      type: 'EVENT_INVITATION',
      message: `Você foi convocado para: ${event.title} em ${new Date(event.startAt).toLocaleDateString('pt-BR')}`,
      link: '/agenda',
    });
  } catch (err) {
    console.error('notifyEventInvitation error:', err);
  }
}

async function notifyEventReminder(userId, event, daysAhead) {
  try {
    await notify({
      userId,
      type: 'EVENT_REMINDER',
      message: `Lembrete: ${event.title} acontece em ${daysAhead} dia${daysAhead > 1 ? 's' : ''}`,
      link: '/agenda',
    });
  } catch (err) {
    console.error('notifyEventReminder error:', err);
  }
}

async function notifyEventCancelled(userId, event) {
  try {
    await notify({
      userId,
      type: 'EVENT_CANCELLED',
      message: `O evento "${event.title}" foi cancelado`,
      link: '/agenda',
    });
  } catch (err) {
    console.error('notifyEventCancelled error:', err);
  }
}
```

- [ ] **Step 2: Adicionar as três funções ao module.exports**

Substituir o bloco `module.exports` existente por:

```js
module.exports = {
  notifyTicketAssigned,
  notifyTicketStatusChanged,
  notifyTicketComment,
  notifyTicketReopened,
  notifyIdeaStatusChanged,
  notifyIdeaVote,
  notifyEventInvitation,
  notifyEventReminder,
  notifyEventCancelled,
};
```

- [ ] **Step 3: Verificar que as funções são exportadas**

```
cd backend && node -e "const s=require('./src/lib/notificationService');console.log(typeof s.notifyEventInvitation, typeof s.notifyEventReminder, typeof s.notifyEventCancelled)"
```

Esperado: `function function function`

- [ ] **Step 4: Garantir que testes de notificações existentes ainda passam**

```
cd backend && npm test -- tests/notifications.test.js tests/notifications-api.test.js
```

Esperado: todos passando.

- [ ] **Step 5: Commit**

```
git add backend/src/lib/notificationService.js
git commit -m "feat: add notifyEventInvitation, notifyEventReminder, notifyEventCancelled"
```

---

### Task 4: Events backend API

**Files:**
- Create: `backend/src/modules/events/events.controller.js`
- Create: `backend/src/modules/events/events.routes.js`
- Modify: `backend/src/server.js`
- Create: `backend/tests/events-api.test.js`

**Interfaces:**
- Consumes: `prisma.event`, `prisma.eventAttendee`, `prisma.user`, `prisma.sector` (Task 1); `manage_events` em PERMISSION_KEYS (Task 2); `notifyEventInvitation`, `notifyEventCancelled` (Task 3)
- Produz: 8 endpoints REST consumidos pela Task 6 (frontend)

---

- [ ] **Step 1: Escrever os testes**

Criar `backend/tests/events-api.test.js`:

```js
const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');

const ids = { sectors: [], roles: [], users: [], events: [] };

let adminToken, gestorToken, userToken;
let adminId, gestorId, userId1, userId2;
let sectorId;
let eventId;

beforeAll(async () => {
  const sector = await prisma.sector.create({ data: { name: 'Setor Eventos Test' } });
  sectorId = sector.id;
  ids.sectors.push(sector.id);

  const adminRole = await prisma.role.create({
    data: {
      name: 'Role Events Admin',
      level: 4,
      permissions: { create: [{ permissionKey: 'manage_events', enabled: true }] },
    },
  });
  ids.roles.push(adminRole.id);

  const gestorRole = await prisma.role.create({
    data: {
      name: 'Role Events Gestor',
      level: 3,
      permissions: { create: [{ permissionKey: 'manage_events', enabled: true }] },
    },
  });
  ids.roles.push(gestorRole.id);

  const userRole = await prisma.role.create({
    data: { name: 'Role Events User', level: 1 },
  });
  ids.roles.push(userRole.id);

  const admin = await prisma.user.create({
    data: { name: 'Admin Eventos', email: 'events-admin@test.com', passwordHash: 'x', roleId: adminRole.id, sectorId: sector.id },
  });
  adminId = admin.id;
  ids.users.push(admin.id);
  adminToken = signAccessToken(admin.id);

  const gestor = await prisma.user.create({
    data: { name: 'Gestor Eventos', email: 'events-gestor@test.com', passwordHash: 'x', roleId: gestorRole.id, sectorId: sector.id },
  });
  gestorId = gestor.id;
  ids.users.push(gestor.id);
  gestorToken = signAccessToken(gestor.id);

  const user1 = await prisma.user.create({
    data: { name: 'User1 Eventos', email: 'events-user1@test.com', passwordHash: 'x', roleId: userRole.id, sectorId: sector.id },
  });
  userId1 = user1.id;
  ids.users.push(user1.id);
  userToken = signAccessToken(user1.id);

  const user2 = await prisma.user.create({
    data: { name: 'User2 Eventos', email: 'events-user2@test.com', passwordHash: 'x', roleId: userRole.id, sectorId: sector.id },
  });
  userId2 = user2.id;
  ids.users.push(user2.id);
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: ids.users } } });
  await prisma.eventAttendee.deleteMany({ where: { eventId: { in: ids.events } } });
  await prisma.event.deleteMany({ where: { id: { in: ids.events } } });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  await prisma.role.deleteMany({ where: { id: { in: ids.roles } } });
  await prisma.sector.deleteMany({ where: { id: { in: ids.sectors } } });
  await prisma.$disconnect();
});

// --- lookup ---

test('GET /events/lookup/sectors retorna setores para manage_events', async () => {
  const res = await request(app).get('/api/events/lookup/sectors').set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  expect(res.body.find(s => s.id === sectorId)).toBeTruthy();
});

test('GET /events/lookup/sectors retorna 403 para usuário sem permissão', async () => {
  const res = await request(app).get('/api/events/lookup/sectors').set('Authorization', `Bearer ${userToken}`);
  expect(res.status).toBe(403);
});

test('GET /events/lookup/users retorna usuários ativos para manage_events', async () => {
  const res = await request(app).get('/api/events/lookup/users').set('Authorization', `Bearer ${gestorToken}`);
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  const found = res.body.find(u => u.id === userId1);
  expect(found).toBeTruthy();
  expect(found.sector).toBeTruthy();
});

// --- create ---

test('POST /events cria evento scope=USUARIO com attendees corretos', async () => {
  const res = await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${gestorToken}`)
    .send({
      title: 'Reunião TI',
      startAt: '2026-08-10T14:00:00.000Z',
      endAt: '2026-08-10T15:00:00.000Z',
      scope: 'USUARIO',
      userIds: [userId1, userId2],
    });
  expect(res.status).toBe(201);
  expect(res.body.attendeeCount).toBe(2);
  eventId = res.body.id;
  ids.events.push(eventId);
});

test('POST /events scope=SETOR cria attendees do setor', async () => {
  const res = await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      title: 'Reunião Setor',
      startAt: '2026-08-11T09:00:00.000Z',
      endAt: '2026-08-11T10:00:00.000Z',
      scope: 'SETOR',
      sectorId,
    });
  expect(res.status).toBe(201);
  expect(res.body.attendeeCount).toBeGreaterThanOrEqual(1);
  ids.events.push(res.body.id);
});

test('POST /events sem title retorna 400', async () => {
  const res = await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ startAt: '2026-08-10T14:00:00.000Z', endAt: '2026-08-10T15:00:00.000Z', scope: 'EMPRESA' });
  expect(res.status).toBe(400);
});

test('POST /events scope=USUARIO com userIds vazio retorna 422', async () => {
  const res = await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: 'X', startAt: '2026-08-10T14:00:00.000Z', endAt: '2026-08-10T15:00:00.000Z', scope: 'USUARIO', userIds: [] });
  expect(res.status).toBe(422);
});

test('POST /events endAt <= startAt retorna 400', async () => {
  const res = await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: 'X', startAt: '2026-08-10T15:00:00.000Z', endAt: '2026-08-10T14:00:00.000Z', scope: 'EMPRESA' });
  expect(res.status).toBe(400);
});

test('POST /events sem manage_events retorna 403', async () => {
  const res = await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ title: 'X', startAt: '2026-08-10T14:00:00.000Z', endAt: '2026-08-10T15:00:00.000Z', scope: 'EMPRESA' });
  expect(res.status).toBe(403);
});

// --- list ---

test('GET /events retorna apenas eventos do usuário logado com myRsvp', async () => {
  const res = await request(app).get('/api/events').set('Authorization', `Bearer ${userToken}`);
  expect(res.status).toBe(200);
  const myEvent = res.body.find(e => e.id === eventId);
  expect(myEvent).toBeTruthy();
  expect(myEvent.myRsvp).toBe('PENDENTE');
  expect(myEvent.attendeeCount).toBeDefined();
});

test('GET /events não retorna eventos de outros usuários', async () => {
  const otherRole = await prisma.role.create({ data: { name: 'Role Other Evt', level: 1 } });
  ids.roles.push(otherRole.id);
  const other = await prisma.user.create({
    data: { name: 'Other', email: 'events-other@test.com', passwordHash: 'x', roleId: otherRole.id, sectorId },
  });
  ids.users.push(other.id);
  const otherToken = signAccessToken(other.id);

  const res = await request(app).get('/api/events').set('Authorization', `Bearer ${otherToken}`);
  expect(res.status).toBe(200);
  expect(res.body.find(e => e.id === eventId)).toBeUndefined();
});

// --- detail ---

test('GET /events/:id retorna evento com myRsvp para participante', async () => {
  const res = await request(app).get(`/api/events/${eventId}`).set('Authorization', `Bearer ${userToken}`);
  expect(res.status).toBe(200);
  expect(res.body.id).toBe(eventId);
  expect(res.body.myRsvp).toBe('PENDENTE');
});

test('GET /events/:id inclui attendees para criador', async () => {
  const res = await request(app).get(`/api/events/${eventId}`).set('Authorization', `Bearer ${gestorToken}`);
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body.attendees)).toBe(true);
});

test('GET /events/:id retorna 404 para usuário não convidado', async () => {
  const role = await prisma.role.create({ data: { name: 'Role NoInv', level: 1 } });
  ids.roles.push(role.id);
  const stranger = await prisma.user.create({
    data: { name: 'Stranger', email: 'events-stranger@test.com', passwordHash: 'x', roleId: role.id, sectorId },
  });
  ids.users.push(stranger.id);
  const strangerToken = signAccessToken(stranger.id);

  const res = await request(app).get(`/api/events/${eventId}`).set('Authorization', `Bearer ${strangerToken}`);
  expect(res.status).toBe(404);
});

// --- rsvp ---

test('PATCH /events/:id/rsvp atualiza rsvp do usuário logado', async () => {
  const res = await request(app)
    .patch(`/api/events/${eventId}/rsvp`)
    .set('Authorization', `Bearer ${userToken}`)
    .send({ rsvp: 'CONFIRMADO' });
  expect(res.status).toBe(200);
  expect(res.body.rsvp).toBe('CONFIRMADO');
});

test('PATCH /events/:id/rsvp rsvp inválido retorna 400', async () => {
  const res = await request(app)
    .patch(`/api/events/${eventId}/rsvp`)
    .set('Authorization', `Bearer ${userToken}`)
    .send({ rsvp: 'TALVEZ' });
  expect(res.status).toBe(400);
});

test('PATCH /events/:id/rsvp retorna 404 para não participante', async () => {
  const role = await prisma.role.create({ data: { name: 'Role NoRsvp', level: 1 } });
  ids.roles.push(role.id);
  const stranger = await prisma.user.create({
    data: { name: 'No RSVP', email: 'events-norsvp@test.com', passwordHash: 'x', roleId: role.id, sectorId },
  });
  ids.users.push(stranger.id);
  const strangerToken = signAccessToken(stranger.id);

  const res = await request(app)
    .patch(`/api/events/${eventId}/rsvp`)
    .set('Authorization', `Bearer ${strangerToken}`)
    .send({ rsvp: 'CONFIRMADO' });
  expect(res.status).toBe(404);
});

// --- update ---

test('PATCH /events/:id atualiza título e reseta flags de notificação', async () => {
  const res = await request(app)
    .patch(`/api/events/${eventId}`)
    .set('Authorization', `Bearer ${gestorToken}`)
    .send({ title: 'Reunião TI Atualizada', startAt: '2026-08-10T16:00:00.000Z' });
  expect(res.status).toBe(200);
  expect(res.body.title).toBe('Reunião TI Atualizada');
});

test('PATCH /events/:id retorna 403 para gestor que não criou o evento', async () => {
  const anotherGestorRole = await prisma.role.create({
    data: {
      name: 'Role Another Gestor',
      level: 3,
      permissions: { create: [{ permissionKey: 'manage_events', enabled: true }] },
    },
  });
  ids.roles.push(anotherGestorRole.id);
  const anotherGestor = await prisma.user.create({
    data: { name: 'Other Gestor', email: 'events-othergestor@test.com', passwordHash: 'x', roleId: anotherGestorRole.id, sectorId },
  });
  ids.users.push(anotherGestor.id);
  const otherGestorToken = signAccessToken(anotherGestor.id);

  const res = await request(app)
    .patch(`/api/events/${eventId}`)
    .set('Authorization', `Bearer ${otherGestorToken}`)
    .send({ title: 'Hackeado' });
  expect(res.status).toBe(403);
});

// --- delete ---

test('DELETE /events/:id cancela evento e envia notificações', async () => {
  const toDelete = await prisma.event.create({
    data: {
      title: 'Para Deletar',
      startAt: new Date('2026-08-20T10:00:00Z'),
      endAt: new Date('2026-08-20T11:00:00Z'),
      scope: 'USUARIO',
      createdById: gestorId,
      attendees: { create: [{ userId: userId1 }] },
    },
  });
  ids.events.push(toDelete.id);

  const res = await request(app)
    .delete(`/api/events/${toDelete.id}`)
    .set('Authorization', `Bearer ${gestorToken}`);
  expect(res.status).toBe(204);

  const deleted = await prisma.event.findUnique({ where: { id: toDelete.id } });
  expect(deleted).toBeNull();
});
```

- [ ] **Step 2: Rodar os testes — devem falhar com 404 (rotas não existem)**

```
cd backend && npm test -- tests/events-api.test.js
```

Esperado: falhar com "404" ou "Cannot find module" — confirma que os testes estão corretamente aguardando a implementação.

- [ ] **Step 3: Criar events.controller.js**

Criar `backend/src/modules/events/events.controller.js`:

```js
const prisma = require('../../lib/prisma');
const { notifyEventInvitation, notifyEventCancelled } = require('../../lib/notificationService');

const VALID_SCOPES = ['EMPRESA', 'SETOR', 'USUARIO'];
const VALID_RSVP   = ['CONFIRMADO', 'RECUSADO'];

async function listLookupSectors(req, res) {
  const sectors = await prisma.sector.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  res.json(sectors);
}

async function listLookupUsers(req, res) {
  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, sector: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
  });
  res.json(users);
}

async function create(req, res) {
  const { title, description, location, startAt, endAt, scope, sectorId, userIds } = req.body;

  if (!title || !startAt || !endAt || !scope) {
    return res.status(400).json({ error: 'title, startAt, endAt e scope são obrigatórios.' });
  }
  if (!VALID_SCOPES.includes(scope)) {
    return res.status(400).json({ error: `scope inválido. Valores aceitos: ${VALID_SCOPES.join(', ')}.` });
  }
  if (new Date(endAt) <= new Date(startAt)) {
    return res.status(400).json({ error: 'endAt deve ser posterior a startAt.' });
  }
  if (scope === 'SETOR' && !sectorId) {
    return res.status(400).json({ error: 'sectorId é obrigatório quando scope=SETOR.' });
  }
  if (scope === 'USUARIO' && (!Array.isArray(userIds) || userIds.length === 0)) {
    return res.status(422).json({ error: 'userIds deve ter ao menos 1 elemento quando scope=USUARIO.' });
  }

  const event = await prisma.event.create({
    data: {
      title,
      description: description ?? null,
      location: location ?? null,
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      scope,
      sectorId: scope === 'SETOR' ? Number(sectorId) : null,
      createdById: req.user.id,
    },
  });

  let attendeeUserIds = [];
  if (scope === 'EMPRESA') {
    const users = await prisma.user.findMany({ where: { active: true }, select: { id: true } });
    attendeeUserIds = users.map(u => u.id);
  } else if (scope === 'SETOR') {
    const users = await prisma.user.findMany({ where: { active: true, sectorId: Number(sectorId) }, select: { id: true } });
    attendeeUserIds = users.map(u => u.id);
  } else {
    attendeeUserIds = userIds.map(Number);
  }

  if (attendeeUserIds.length > 0) {
    await prisma.eventAttendee.createMany({
      data: attendeeUserIds.map(userId => ({ eventId: event.id, userId })),
      skipDuplicates: true,
    });
    for (const userId of attendeeUserIds) {
      await notifyEventInvitation(userId, event);
    }
  }

  res.status(201).json({ id: event.id, title: event.title, startAt: event.startAt, attendeeCount: attendeeUserIds.length });
}

async function list(req, res) {
  const { from, to } = req.query;
  const where = {
    attendees: { some: { userId: req.user.id } },
    ...(from || to
      ? { startAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
      : {}),
  };

  const events = await prisma.event.findMany({
    where,
    orderBy: { startAt: 'asc' },
    include: {
      createdBy: { select: { id: true, name: true } },
      attendees: { where: { userId: req.user.id }, select: { rsvp: true } },
      _count: { select: { attendees: true } },
    },
  });

  res.json(events.map(e => ({
    id: e.id,
    title: e.title,
    description: e.description,
    location: e.location,
    startAt: e.startAt,
    endAt: e.endAt,
    scope: e.scope,
    createdBy: e.createdBy,
    myRsvp: e.attendees[0]?.rsvp ?? null,
    attendeeCount: e._count.attendees,
  })));
}

async function detail(req, res) {
  const id = Number(req.params.id);
  const hasManage = req.user.permissions.has('manage_events');

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true } },
      attendees: {
        where: { userId: req.user.id },
        select: { rsvp: true },
      },
      _count: { select: { attendees: true } },
    },
  });

  if (!event) return res.status(404).json({ error: 'Evento não encontrado.' });

  const myAttendee = event.attendees[0];
  const isCreator  = event.createdBy.id === req.user.id;

  // Usuário não é participante nem criador/admin
  if (!myAttendee && !(hasManage && isCreator) && !req.user.permissions.has('manage_users')) {
    return res.status(404).json({ error: 'Evento não encontrado.' });
  }

  let attendees = undefined;
  if (hasManage && (isCreator || req.user.permissions.has('manage_users'))) {
    const rows = await prisma.eventAttendee.findMany({
      where: { eventId: id },
      include: { user: { select: { id: true, name: true, sector: { select: { name: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    attendees = rows.map(a => ({ userId: a.userId, name: a.user.name, sector: a.user.sector?.name ?? null, rsvp: a.rsvp }));
  }

  res.json({
    id: event.id,
    title: event.title,
    description: event.description,
    location: event.location,
    startAt: event.startAt,
    endAt: event.endAt,
    scope: event.scope,
    createdBy: event.createdBy,
    myRsvp: myAttendee?.rsvp ?? null,
    attendeeCount: event._count.attendees,
    attendees,
  });
}

async function update(req, res) {
  const id = Number(req.params.id);
  const { title, description, location, startAt, endAt } = req.body;

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return res.status(404).json({ error: 'Evento não encontrado.' });

  const isAdmin = req.user.permissions.has('manage_users');
  if (event.createdById !== req.user.id && !isAdmin) {
    return res.status(403).json({ error: 'Apenas o criador ou admin pode editar este evento.' });
  }

  if (startAt && endAt && new Date(endAt) <= new Date(startAt)) {
    return res.status(400).json({ error: 'endAt deve ser posterior a startAt.' });
  }
  if (startAt && !endAt && new Date(startAt) >= event.endAt) {
    return res.status(400).json({ error: 'endAt deve ser posterior a startAt.' });
  }

  const data = {};
  if (title !== undefined)       data.title       = title;
  if (description !== undefined) data.description = description;
  if (location !== undefined)    data.location    = location;
  if (startAt !== undefined)     data.startAt     = new Date(startAt);
  if (endAt !== undefined)       data.endAt       = new Date(endAt);

  const updated = await prisma.event.update({ where: { id }, data });

  if (startAt !== undefined || endAt !== undefined) {
    await prisma.eventAttendee.updateMany({
      where: { eventId: id },
      data: { notified3d: false, notified1d: false },
    });
  }

  res.json({ id: updated.id, title: updated.title, startAt: updated.startAt, endAt: updated.endAt });
}

async function remove(req, res) {
  const id = Number(req.params.id);

  const event = await prisma.event.findUnique({
    where: { id },
    include: { attendees: { select: { userId: true } } },
  });
  if (!event) return res.status(404).json({ error: 'Evento não encontrado.' });

  const isAdmin = req.user.permissions.has('manage_users');
  if (event.createdById !== req.user.id && !isAdmin) {
    return res.status(403).json({ error: 'Apenas o criador ou admin pode cancelar este evento.' });
  }

  const attendeeIds = event.attendees.map(a => a.userId);

  await prisma.event.delete({ where: { id } });

  for (const userId of attendeeIds) {
    await notifyEventCancelled(userId, event);
  }

  res.status(204).end();
}

async function updateRsvp(req, res) {
  const id   = Number(req.params.id);
  const { rsvp } = req.body;

  if (!VALID_RSVP.includes(rsvp)) {
    return res.status(400).json({ error: `rsvp inválido. Valores aceitos: ${VALID_RSVP.join(', ')}.` });
  }

  const attendee = await prisma.eventAttendee.findUnique({
    where: { eventId_userId: { eventId: id, userId: req.user.id } },
  });
  if (!attendee) return res.status(404).json({ error: 'Você não é participante deste evento.' });

  const updated = await prisma.eventAttendee.update({
    where: { id: attendee.id },
    data: { rsvp },
  });

  res.json({ rsvp: updated.rsvp });
}

module.exports = { listLookupSectors, listLookupUsers, create, list, detail, update, remove, updateRsvp };
```

- [ ] **Step 4: Criar events.routes.js**

Criar `backend/src/modules/events/events.routes.js`:

```js
const express = require('express');
const authenticate = require('../../middleware/authenticate');
const requirePermission = require('../../middleware/requirePermission');
const asyncHandler = require('../../lib/asyncHandler');
const controller = require('./events.controller');

const router = express.Router();

const authenticated  = asyncHandler(authenticate);
const manageEvents   = [asyncHandler(authenticate), requirePermission('manage_events')];

router.get('/events/lookup/sectors', ...manageEvents, asyncHandler(controller.listLookupSectors));
router.get('/events/lookup/users',   ...manageEvents, asyncHandler(controller.listLookupUsers));
router.post('/events',               ...manageEvents, asyncHandler(controller.create));
router.get('/events',                authenticated,   asyncHandler(controller.list));
router.get('/events/:id',            authenticated,   asyncHandler(controller.detail));
router.patch('/events/:id',          ...manageEvents, asyncHandler(controller.update));
router.delete('/events/:id',         ...manageEvents, asyncHandler(controller.remove));
router.patch('/events/:id/rsvp',     authenticated,   asyncHandler(controller.updateRsvp));

module.exports = router;
```

- [ ] **Step 5: Montar rotas em server.js**

Em `backend/src/server.js`, adicionar o require junto com os outros:

```js
const eventsRoutes = require('./modules/events/events.routes');
```

E adicionar o mount após `notificationsRoutes`:

```js
app.use('/api', eventsRoutes);
```

- [ ] **Step 6: Rodar os testes**

```
cd backend && npm test -- tests/events-api.test.js
```

Esperado: todos os testes passando.

- [ ] **Step 7: Garantir que nenhum teste existente quebrou**

```
cd backend && npm test -- tests/ideas-api.test.js tests/notifications-api.test.js tests/identity-rbac.test.js
```

Esperado: todos passando.

- [ ] **Step 8: Commit**

```
git add backend/src/modules/events/ backend/src/server.js backend/tests/events-api.test.js
git commit -m "feat: add events API (CRUD + RSVP + lookup endpoints)"
```

---

### Task 5: Event cron job

**Files:**
- Create: `backend/src/lib/eventNotificationCron.js`
- Create: `backend/tests/events-cron.test.js`
- Modify: `backend/src/server.js`

**Interfaces:**
- Consumes: `prisma.eventAttendee` (Task 1); `notifyEventReminder` (Task 3)
- Produz: `start()` export registrado no server.js para disparar cron diário; `runCron()` export para testes unitários

---

- [ ] **Step 1: Instalar node-cron**

```
cd backend && npm install node-cron
```

Verificar que `package.json` tem `"node-cron"` em `dependencies`.

- [ ] **Step 2: Escrever os testes do cron**

Criar `backend/tests/events-cron.test.js`:

```js
jest.mock('../src/lib/prisma', () => ({
  eventAttendee: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock('../src/lib/notificationService', () => ({
  notifyEventReminder: jest.fn().mockResolvedValue(undefined),
}));

const prisma = require('../src/lib/prisma');
const { notifyEventReminder } = require('../src/lib/notificationService');
const { runCron } = require('../src/lib/eventNotificationCron');

beforeEach(() => {
  jest.clearAllMocks();
});

test('runCron envia notificação de 3 dias e marca notified3d=true', async () => {
  const fakeAttendee3d = { id: 1, userId: 10, event: { id: 5, title: 'Reunião 3d', startAt: new Date() } };
  prisma.eventAttendee.findMany
    .mockResolvedValueOnce([fakeAttendee3d])
    .mockResolvedValueOnce([]);
  prisma.eventAttendee.update.mockResolvedValue({ ...fakeAttendee3d, notified3d: true });

  await runCron();

  expect(prisma.eventAttendee.update).toHaveBeenCalledWith({
    where: { id: 1 },
    data: { notified3d: true },
  });
  expect(notifyEventReminder).toHaveBeenCalledWith(10, fakeAttendee3d.event, 3);
});

test('runCron envia notificação de 1 dia e marca notified1d=true', async () => {
  const fakeAttendee1d = { id: 2, userId: 11, event: { id: 6, title: 'Reunião 1d', startAt: new Date() } };
  prisma.eventAttendee.findMany
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([fakeAttendee1d]);
  prisma.eventAttendee.update.mockResolvedValue({ ...fakeAttendee1d, notified1d: true });

  await runCron();

  expect(prisma.eventAttendee.update).toHaveBeenCalledWith({
    where: { id: 2 },
    data: { notified1d: true },
  });
  expect(notifyEventReminder).toHaveBeenCalledWith(11, fakeAttendee1d.event, 1);
});

test('runCron ignora P2025 silenciosamente (attendee deletado)', async () => {
  const fakeAttendee = { id: 3, userId: 12, event: { id: 7, title: 'Cancelado', startAt: new Date() } };
  prisma.eventAttendee.findMany
    .mockResolvedValueOnce([fakeAttendee])
    .mockResolvedValueOnce([]);

  const p2025 = new Error('Record not found');
  p2025.code = 'P2025';
  prisma.eventAttendee.update.mockRejectedValue(p2025);

  await expect(runCron()).resolves.not.toThrow();
  expect(notifyEventReminder).not.toHaveBeenCalled();
});

test('runCron propaga erros não-P2025 via console.error mas não lança', async () => {
  const fakeAttendee = { id: 4, userId: 13, event: { id: 8, title: 'Erro', startAt: new Date() } };
  prisma.eventAttendee.findMany
    .mockResolvedValueOnce([fakeAttendee])
    .mockResolvedValueOnce([]);

  const genericError = new Error('DB connection lost');
  prisma.eventAttendee.update.mockRejectedValue(genericError);

  const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  await expect(runCron()).resolves.not.toThrow();
  expect(consoleSpy).toHaveBeenCalled();
  consoleSpy.mockRestore();
});
```

- [ ] **Step 3: Rodar os testes — devem falhar**

```
cd backend && npm test -- tests/events-cron.test.js
```

Esperado: FAIL — `runCron` não existe.

- [ ] **Step 4: Criar eventNotificationCron.js**

Criar `backend/src/lib/eventNotificationCron.js`:

```js
const cron = require('node-cron');
const prisma = require('./prisma');
const { notifyEventReminder } = require('./notificationService');

function startOfDay(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

async function runCron() {
  const now = new Date();

  const in3Start = startOfDay(addDays(now, 3));
  const in3End   = endOfDay(addDays(now, 3));

  const attendees3d = await prisma.eventAttendee.findMany({
    where: { notified3d: false, event: { startAt: { gte: in3Start, lte: in3End } } },
    include: { event: true },
  });

  for (const a of attendees3d) {
    try {
      await prisma.eventAttendee.update({ where: { id: a.id }, data: { notified3d: true } });
      await notifyEventReminder(a.userId, a.event, 3);
    } catch (err) {
      if (err.code !== 'P2025') console.error('eventCron 3d error:', err);
    }
  }

  const in1Start = startOfDay(addDays(now, 1));
  const in1End   = endOfDay(addDays(now, 1));

  const attendees1d = await prisma.eventAttendee.findMany({
    where: { notified1d: false, event: { startAt: { gte: in1Start, lte: in1End } } },
    include: { event: true },
  });

  for (const a of attendees1d) {
    try {
      await prisma.eventAttendee.update({ where: { id: a.id }, data: { notified1d: true } });
      await notifyEventReminder(a.userId, a.event, 1);
    } catch (err) {
      if (err.code !== 'P2025') console.error('eventCron 1d error:', err);
    }
  }
}

function start() {
  // Executa às 00:05 todo dia
  cron.schedule('5 0 * * *', () => {
    runCron().catch(err => console.error('eventCron fatal error:', err));
  });
}

module.exports = { start, runCron };
```

- [ ] **Step 5: Registrar o cron em server.js**

Em `backend/src/server.js`, dentro do bloco `if (require.main === module)` (linha 64), após o `app.listen`, adicionar:

```js
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
  require('./lib/eventNotificationCron').start();
}
```

- [ ] **Step 6: Rodar os testes do cron**

```
cd backend && npm test -- tests/events-cron.test.js
```

Esperado: 4 testes passando.

- [ ] **Step 7: Garantir que os testes da API de eventos ainda passam**

```
cd backend && npm test -- tests/events-api.test.js
```

Esperado: todos passando (o cron não é registrado durante testes pois `require.main !== module`).

- [ ] **Step 8: Commit**

```
git add backend/src/lib/eventNotificationCron.js backend/src/server.js backend/tests/events-cron.test.js backend/package.json backend/package-lock.json
git commit -m "feat: add daily event notification cron (3d and 1d reminders)"
```

---

### Task 6: Frontend — Agenda page e componentes

**Files:**
- Create: `frontend/src/api/events.js`
- Create: `frontend/src/pages/AgendaPage.jsx`
- Create: `frontend/src/pages/agenda/CalendarGrid.jsx`
- Create: `frontend/src/pages/agenda/EventListView.jsx`
- Create: `frontend/src/pages/agenda/EventCard.jsx`
- Create: `frontend/src/pages/agenda/EventModal.jsx`
- Create: `frontend/src/pages/agenda/EventDetailModal.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/layout/Sidebar.jsx`

**Interfaces:**
- Consumes: endpoints `/api/events/*` (Task 4); `manage_events` no store do Zustand; `useAuthStore` existente
- Produz: `/agenda` acessível a todos os usuários autenticados; botão de criação visível apenas para `manage_events`

---

- [ ] **Step 1: Criar o API client de eventos**

Criar `frontend/src/api/events.js`:

```js
import api from '@/lib/axios'

export const eventsApi = {
  list:          (params) => api.get('/events', { params }).then(r => r.data),
  get:           (id)     => api.get(`/events/${id}`).then(r => r.data),
  create:        (data)   => api.post('/events', data).then(r => r.data),
  update:        (id, data) => api.patch(`/events/${id}`, data).then(r => r.data),
  delete:        (id)     => api.delete(`/events/${id}`).then(r => r.data),
  rsvp:          (id, rsvp) => api.patch(`/events/${id}/rsvp`, { rsvp }).then(r => r.data),
  lookupSectors: ()       => api.get('/events/lookup/sectors').then(r => r.data),
  lookupUsers:   ()       => api.get('/events/lookup/users').then(r => r.data),
}
```

- [ ] **Step 2: Criar EventCard.jsx**

Criar `frontend/src/pages/agenda/EventCard.jsx`:

```jsx
import { cn } from '@/lib/utils'

const SCOPE_LABELS = { EMPRESA: 'Empresa', SETOR: 'Setor', USUARIO: 'Individual' }
const SCOPE_COLORS = {
  EMPRESA:  'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  SETOR:    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  USUARIO:  'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
}
const RSVP_COLORS = {
  PENDENTE:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  CONFIRMADO: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  RECUSADO:   'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}
const RSVP_LABELS = { PENDENTE: 'Pendente', CONFIRMADO: 'Confirmado', RECUSADO: 'Recusado' }

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function EventCard({ event, onClick }) {
  return (
    <div
      onClick={onClick}
      className="border border-border rounded-lg p-4 bg-card hover:bg-muted/30 cursor-pointer transition-colors space-y-2"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-foreground text-sm">{event.title}</span>
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium shrink-0', SCOPE_COLORS[event.scope])}>
          {SCOPE_LABELS[event.scope]}
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{formatTime(event.startAt)} – {formatTime(event.endAt)}</span>
        {event.location && <span>· {event.location}</span>}
      </div>
      <div className="flex items-center gap-2">
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', RSVP_COLORS[event.myRsvp ?? 'PENDENTE'])}>
          {RSVP_LABELS[event.myRsvp ?? 'PENDENTE']}
        </span>
        <span className="text-xs text-muted-foreground">{event.attendeeCount} participante{event.attendeeCount !== 1 ? 's' : ''}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Criar CalendarGrid.jsx**

Criar `frontend/src/pages/agenda/CalendarGrid.jsx`:

```jsx
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function getDotColor(events) {
  if (!events || events.length === 0) return null
  const hasPendente   = events.some(e => (e.myRsvp ?? 'PENDENTE') === 'PENDENTE')
  const allConfirmado = events.every(e => e.myRsvp === 'CONFIRMADO')
  if (hasPendente)   return 'bg-yellow-400'
  if (allConfirmado) return 'bg-green-500'
  return 'bg-slate-400'
}

export default function CalendarGrid({ events, onDayClick }) {
  const today = new Date()
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() })

  const { cells, monthLabel } = useMemo(() => {
    const { year, month } = cursor
    const label = new Date(year, month, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const grid = []
    for (let i = 0; i < firstDay; i++) grid.push(null)
    for (let d = 1; d <= daysInMonth; d++) grid.push(new Date(year, month, d))
    return { cells: grid, monthLabel: label.charAt(0).toUpperCase() + label.slice(1) }
  }, [cursor])

  function prev() {
    setCursor(c => {
      const m = c.month === 0 ? 11 : c.month - 1
      const y = c.month === 0 ? c.year - 1 : c.year
      return { year: y, month: m }
    })
  }
  function next() {
    setCursor(c => {
      const m = c.month === 11 ? 0 : c.month + 1
      const y = c.month === 11 ? c.year + 1 : c.year
      return { year: y, month: m }
    })
  }

  const dayEvents = useMemo(() => {
    const map = {}
    for (const e of events) {
      const key = new Date(e.startAt).toDateString()
      if (!map[key]) map[key] = []
      map[key].push(e)
    }
    return map
  }, [events])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={prev} className="p-1 rounded hover:bg-muted/40">
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <span className="font-semibold text-foreground text-sm">{monthLabel}</span>
        <button onClick={next} className="p-1 rounded hover:bg-muted/40">
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center">
        {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => (
          <div key={d} className="text-xs font-medium text-muted-foreground py-1">{d}</div>
        ))}
        {cells.map((date, idx) => {
          if (!date) return <div key={`empty-${idx}`} />
          const evs  = dayEvents[date.toDateString()] ?? []
          const dot  = getDotColor(evs)
          const isToday = isSameDay(date, new Date())
          return (
            <div
              key={date.toDateString()}
              onClick={() => evs.length > 0 && onDayClick(date, evs)}
              className={cn(
                'flex flex-col items-center py-1 rounded-lg transition-colors',
                evs.length > 0 ? 'cursor-pointer hover:bg-muted/40' : 'cursor-default',
              )}
            >
              <span className={cn(
                'text-xs w-7 h-7 flex items-center justify-center rounded-full',
                isToday ? 'bg-blue-600 text-white font-bold' : 'text-foreground',
              )}>
                {date.getDate()}
              </span>
              {dot && <div className={cn('w-1.5 h-1.5 rounded-full mt-0.5', dot)} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Criar EventListView.jsx**

Criar `frontend/src/pages/agenda/EventListView.jsx`:

```jsx
import EventCard from './EventCard'

function groupByDate(events) {
  const groups = []
  const seen = new Map()
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  for (const e of events) {
    const d = new Date(e.startAt)
    const key = d.toDateString()
    let label
    if (d.toDateString() === today.toDateString()) label = 'Hoje'
    else if (d.toDateString() === tomorrow.toDateString()) label = 'Amanhã'
    else label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

    if (!seen.has(key)) {
      seen.set(key, { label, events: [] })
      groups.push(seen.get(key))
    }
    seen.get(key).events.push(e)
  }
  return groups
}

export default function EventListView({ events, onEventClick }) {
  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        Nenhum evento próximo encontrado.
      </div>
    )
  }

  const groups = groupByDate(events)

  return (
    <div className="space-y-6">
      {groups.map(g => (
        <div key={g.label} className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{g.label}</h3>
          {g.events.map(e => (
            <EventCard key={e.id} event={e} onClick={() => onEventClick(e)} />
          ))}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Criar EventModal.jsx (criação)**

Criar `frontend/src/pages/agenda/EventModal.jsx`:

```jsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { eventsApi } from '@/api/events'

export default function EventModal({ onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    title: '', description: '', location: '',
    date: '', startTime: '', endTime: '',
    scope: 'EMPRESA', sectorId: '', userIds: [],
  })

  const { data: sectors = [] } = useQuery({
    queryKey: ['events-lookup-sectors'],
    queryFn: eventsApi.lookupSectors,
  })
  const { data: users = [] } = useQuery({
    queryKey: ['events-lookup-users'],
    queryFn: eventsApi.lookupUsers,
    enabled: form.scope === 'USUARIO',
  })

  const mutation = useMutation({
    mutationFn: eventsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] })
      toast.success('Evento criado com sucesso!')
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.error ?? 'Erro ao criar evento'),
  })

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function toggleUser(id) {
    setForm(f => ({
      ...f,
      userIds: f.userIds.includes(id) ? f.userIds.filter(u => u !== id) : [...f.userIds, id],
    }))
  }

  function submit(e) {
    e.preventDefault()
    if (!form.date || !form.startTime || !form.endTime) {
      toast.error('Preencha data, hora início e hora fim.')
      return
    }
    const startAt = new Date(`${form.date}T${form.startTime}:00`).toISOString()
    const endAt   = new Date(`${form.date}T${form.endTime}:00`).toISOString()
    const payload = {
      title: form.title,
      description: form.description || undefined,
      location: form.location || undefined,
      startAt,
      endAt,
      scope: form.scope,
      sectorId: form.scope === 'SETOR' ? Number(form.sectorId) : undefined,
      userIds: form.scope === 'USUARIO' ? form.userIds : undefined,
    }
    mutation.mutate(payload)
  }

  const inputCls = 'border border-border rounded-md px-3 py-2 text-sm w-full bg-background text-foreground'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Novo Evento</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Título *</label>
            <Input value={form.title} onChange={e => set('title', e.target.value)} required placeholder="Título do evento" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Data *</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} required className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Início *</label>
              <input type="time" value={form.startTime} onChange={e => set('startTime', e.target.value)} required className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Fim *</label>
              <input type="time" value={form.endTime} onChange={e => set('endTime', e.target.value)} required className={inputCls} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Local</label>
            <Input value={form.location} onChange={e => set('location', e.target.value)} placeholder="Sala / link de reunião" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Descrição</label>
            <Textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} placeholder="Detalhes do evento" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Público *</label>
            <div className="flex gap-3">
              {[['EMPRESA','Toda a empresa'], ['SETOR','Setor'], ['USUARIO','Usuários específicos']].map(([v, l]) => (
                <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" name="scope" value={v} checked={form.scope === v} onChange={() => set('scope', v)} />
                  {l}
                </label>
              ))}
            </div>
          </div>

          {form.scope === 'SETOR' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Setor *</label>
              <select value={form.sectorId} onChange={e => set('sectorId', e.target.value)} required className={inputCls}>
                <option value="">Selecione um setor</option>
                {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {form.scope === 'USUARIO' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Usuários *</label>
              <div className="border border-border rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
                {users.map(u => (
                  <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/30 px-1 rounded">
                    <input type="checkbox" checked={form.userIds.includes(u.id)} onChange={() => toggleUser(u.id)} />
                    <span>{u.name}</span>
                    {u.sector && <span className="text-xs text-muted-foreground">({u.sector.name})</span>}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Criando...' : 'Criar Evento'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Criar EventDetailModal.jsx**

Criar `frontend/src/pages/agenda/EventDetailModal.jsx`:

```jsx
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { X, MapPin, Clock, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { eventsApi } from '@/api/events'
import { useAuthStore } from '@/stores/authStore'

const RSVP_COLORS = {
  PENDENTE:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  CONFIRMADO: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  RECUSADO:   'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}
const RSVP_LABELS = { PENDENTE: 'Pendente', CONFIRMADO: 'Confirmado', RECUSADO: 'Recusado' }
const SCOPE_LABELS = { EMPRESA: 'Toda a empresa', SETOR: 'Setor', USUARIO: 'Usuários específicos' }

function formatDateTime(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
    + ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function EventDetailModal({ event, onClose }) {
  const qc = useQueryClient()
  const permissions = useAuthStore(s => s.permissions)

  const rsvpMutation = useMutation({
    mutationFn: (rsvp) => eventsApi.rsvp(event.id, rsvp),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] })
      toast.success('Presença atualizada!')
      onClose()
    },
    onError: () => toast.error('Erro ao atualizar presença'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => eventsApi.delete(event.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] })
      toast.success('Evento cancelado.')
      onClose()
    },
    onError: () => toast.error('Erro ao cancelar evento'),
  })

  const canManage = permissions.has('manage_events')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-semibold text-foreground text-base leading-tight">{event.title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0" />
            <span>{formatDateTime(event.startAt)} – {new Date(event.endAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          {event.location && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0" />
              <span>{event.location}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4 shrink-0" />
            <span>{SCOPE_LABELS[event.scope]} · {event.attendeeCount} participante{event.attendeeCount !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {event.description && (
          <p className="text-sm text-foreground whitespace-pre-line">{event.description}</p>
        )}

        <div className="border-t border-border pt-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Sua presença</p>
          <div className="flex items-center gap-2">
            <span className={cn('text-xs px-2 py-1 rounded-full font-medium', RSVP_COLORS[event.myRsvp ?? 'PENDENTE'])}>
              {RSVP_LABELS[event.myRsvp ?? 'PENDENTE']}
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={event.myRsvp === 'CONFIRMADO' ? 'default' : 'outline'}
              onClick={() => rsvpMutation.mutate('CONFIRMADO')}
              disabled={rsvpMutation.isPending}
            >
              Confirmar
            </Button>
            <Button
              size="sm"
              variant={event.myRsvp === 'RECUSADO' ? 'destructive' : 'outline'}
              onClick={() => rsvpMutation.mutate('RECUSADO')}
              disabled={rsvpMutation.isPending}
            >
              Recusar
            </Button>
          </div>
        </div>

        {event.attendees && (
          <div className="border-t border-border pt-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Participantes</p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {event.attendees.map(a => (
                <div key={a.userId} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="text-foreground">{a.name}</span>
                    {a.sector && <span className="text-xs text-muted-foreground ml-1">({a.sector})</span>}
                  </div>
                  <span className={cn('text-xs px-1.5 py-0.5 rounded-full', RSVP_COLORS[a.rsvp])}>
                    {RSVP_LABELS[a.rsvp]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {canManage && (
          <div className="border-t border-border pt-3 flex justify-end">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => { if (confirm('Cancelar este evento?')) deleteMutation.mutate() }}
              disabled={deleteMutation.isPending}
            >
              Cancelar Evento
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Criar AgendaPage.jsx**

Criar `frontend/src/pages/AgendaPage.jsx`:

```jsx
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Calendar, List, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { eventsApi } from '@/api/events'
import CalendarGrid from './agenda/CalendarGrid'
import EventListView from './agenda/EventListView'
import EventCard from './agenda/EventCard'
import EventModal from './agenda/EventModal'
import EventDetailModal from './agenda/EventDetailModal'

export default function AgendaPage() {
  const permissions = useAuthStore(s => s.permissions)
  const [view, setView] = useState('calendar')
  const [showCreate, setShowCreate] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [dayPanel, setDayPanel] = useState(null) // { date, events }

  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10)
  const to   = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString().slice(0, 10)

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['events', from, to],
    queryFn: () => eventsApi.list({ from, to }),
  })

  const futureEvents = useMemo(
    () => events.filter(e => new Date(e.startAt) >= new Date()).sort((a, b) => new Date(a.startAt) - new Date(b.startAt)),
    [events]
  )

  async function openEvent(e) {
    try {
      const detail = await eventsApi.get(e.id)
      setSelectedEvent(detail)
    } catch {
      setSelectedEvent(e)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Agenda</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setView('calendar')}
              className={cn('px-3 py-1.5 text-sm transition-colors', view === 'calendar' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/40')}
            >
              <Calendar className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView('list')}
              className={cn('px-3 py-1.5 text-sm transition-colors border-l border-border', view === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/40')}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          {permissions.has('manage_events') && (
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Novo Evento
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : view === 'calendar' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1">
            <div className="bg-card border border-border rounded-xl p-4">
              <CalendarGrid
                events={events}
                onDayClick={(date, evs) => setDayPanel({ date, events: evs })}
              />
            </div>
          </div>
          <div className="md:col-span-2 space-y-2">
            {dayPanel ? (
              <>
                <h3 className="text-sm font-medium text-muted-foreground">
                  {dayPanel.date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                </h3>
                {dayPanel.events.map(e => (
                  <EventCard key={e.id} event={e} onClick={() => openEvent(e)} />
                ))}
              </>
            ) : (
              <div className="text-center py-12 text-sm text-muted-foreground">
                Clique em um dia com eventos para ver detalhes.
              </div>
            )}
          </div>
        </div>
      ) : (
        <EventListView events={futureEvents} onEventClick={openEvent} />
      )}

      {showCreate && <EventModal onClose={() => setShowCreate(false)} />}
      {selectedEvent && <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
    </div>
  )
}
```

- [ ] **Step 8: Adicionar rota /agenda no App.jsx**

Em `frontend/src/App.jsx`, adicionar o lazy import junto com os demais (após a linha `const ProfilePage`):

```js
const AgendaPage = lazy(() => import('@/pages/AgendaPage'))
```

Adicionar a rota dentro do bloco `children` do `ProtectedRoute`, após a rota das ideas:

```js
{ path: 'agenda', element: <Suspense fallback={<F />}><AgendaPage /></Suspense> },
```

- [ ] **Step 9: Adicionar item Agenda no Sidebar**

Em `frontend/src/components/layout/Sidebar.jsx`, adicionar `Calendar` ao import do lucide-react:

```js
import { Ticket, PlusCircle, X, LayoutDashboard, BarChart2, Lightbulb, Settings, ChevronDown, ChevronUp, Calendar } from 'lucide-react'
```

Em `SidebarContent`, adicionar o item após `<NavItem to="/ideas" ...>`:

```jsx
<NavItem to="/agenda" icon={Calendar} label="Agenda" onClick={onClose} />
```

- [ ] **Step 10: Verificar no navegador**

Com os servidores já rodando (backend na porta 4000, frontend na porta 5173):

1. Navegar para `http://localhost:5173/agenda`
2. Verificar que a grade mensal carrega sem erros no console
3. Clicar no toggle lista — verificar que a lista de eventos futuros aparece
4. Com usuário com `manage_events`: clicar em "+ Novo Evento" — verificar modal de criação
5. Criar um evento para "Usuários específicos" com 1 usuário
6. Verificar que o evento aparece na agenda do usuário convidado
7. Clicar no evento → modal de detalhe → clicar "Confirmar" → RSVP atualiza

- [ ] **Step 11: Commit**

```
git add frontend/src/api/events.js frontend/src/pages/AgendaPage.jsx frontend/src/pages/agenda/ frontend/src/App.jsx frontend/src/components/layout/Sidebar.jsx
git commit -m "feat: add agenda calendar page with monthly grid, list view, event modals and RSVP"
```

---

## Verificação Final

Após todos os tasks:

```
cd backend && npm test
```

Esperado: todos os testes passando (incluindo events-api.test.js e events-cron.test.js).

Checar manualmente:
- Usuário com `manage_events` consegue criar evento para empresa, setor e usuários específicos
- Usuário sem `manage_events` não vê o botão "+ Novo Evento"
- RSVP atualiza em tempo real (query invalidada após PATCH)
- Grade mensal mostra pontos nos dias com eventos (amarelo=pendente, verde=confirmado, cinza=recusado)
- Lista agrupa eventos por data com labels "Hoje", "Amanhã", data completa
- Cancelamento de evento retorna 204 e exibe toast de confirmação
- Cron não é disparado nos testes (require.main guard funciona)
