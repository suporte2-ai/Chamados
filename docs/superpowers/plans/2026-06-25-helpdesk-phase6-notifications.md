# Fase 6 — Notificações: Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar notificações in-app para eventos de tickets e ideias, com serviço centralizado e API REST para leitura e marcação.

**Architecture:** Um helper `notificationService.js` encapsula 6 funções de notificação com try/catch silencioso (fire-and-forget). Os controllers existentes chamam essas funções sem `await` após mutações bem-sucedidas. Um módulo `notifications` expõe 3 endpoints para listar e marcar notificações como lidas.

**Tech Stack:** Node.js, Express 4, Prisma 5 ORM, PostgreSQL, Jest, Supertest

## Global Constraints

- **Nenhuma migration nova** — o modelo `Notification` já existe no schema com campos: `id`, `userId`, `type` (String), `message` (String), `link` (String?), `isRead` (Boolean default false), `createdAt`, índice em `(userId, isRead)`
- **Per-route auth:** `const authenticated = asyncHandler(authenticate)` — NUNCA `router.use()`
- **Imports de auth:** `authenticate` de `../../middleware/authenticate` (sem chaves), `asyncHandler` de `../../lib/asyncHandler`
- **Fire-and-forget:** notificações chamadas SEM `await` nos controllers; try/catch interno no serviço garante que erros não propagam
- **Ordem de rotas:** `/notifications/read-all` ANTES de `/notifications/:id/read` — Express casaria `read-all` como `:id` caso contrário
- **Guard userId:** função `notify()` interna retorna imediatamente se `!userId`
- **Comentários internos:** `notifyTicketComment` pula o solicitante quando `isInternal === true`
- **Auto-voto:** `notifyIdeaVote` pula quando `voterId === authorId`
- **Mensagens em português:** `link` sempre `/tickets/<id>` ou `/ideas/<id>`
- **Trigger de atribuição:** só em `PATCH /tickets/:id` (`update`), não em `POST /tickets` (create não aceita `assignedToId`)
- **Detecção de reopen inline:** `ticket.status === 'RESOLVIDO' && status === 'EM_ANDAMENTO'` — `isReopen` não é exportado por `ticketStatus.js`

---

### Task 1: notificationService + integração nos controllers

**Files:**
- Create: `backend/src/lib/notificationService.js`
- Modify: `backend/src/modules/tickets/tickets.controller.js`
- Modify: `backend/src/modules/tickets/ticketComments.controller.js`
- Modify: `backend/src/modules/ideas/ideas.controller.js`

**Interfaces:**
- Produces (para Task 2):
  ```js
  notifyTicketAssigned(assigneeId, ticket)
  notifyTicketStatusChanged(requesterId, ticket)
  notifyTicketComment(ticket, commentAuthorId, isInternal)
  notifyTicketReopened(assigneeId, ticket)
  notifyIdeaStatusChanged(authorId, idea)
  notifyIdeaVote(authorId, voterId, idea)
  ```

- [ ] **Step 1: Criar `backend/src/lib/notificationService.js`**

```js
const prisma = require('./prisma');

async function notify({ userId, type, message, link }) {
  if (!userId) return;
  await prisma.notification.create({ data: { userId, type, message, link } });
}

async function notifyTicketAssigned(assigneeId, ticket) {
  try {
    await notify({
      userId: assigneeId,
      type: 'TICKET_ASSIGNED',
      message: `Você foi atribuído ao chamado #${ticket.id}: ${ticket.title}`,
      link: `/tickets/${ticket.id}`,
    });
  } catch (err) {
    console.error('notifyTicketAssigned error:', err);
  }
}

async function notifyTicketStatusChanged(requesterId, ticket) {
  try {
    await notify({
      userId: requesterId,
      type: 'TICKET_STATUS_CHANGED',
      message: `O chamado #${ticket.id} mudou para ${ticket.status}`,
      link: `/tickets/${ticket.id}`,
    });
  } catch (err) {
    console.error('notifyTicketStatusChanged error:', err);
  }
}

async function notifyTicketComment(ticket, commentAuthorId, isInternal) {
  try {
    const targets = new Set();
    if (ticket.assignedToId && ticket.assignedToId !== commentAuthorId) {
      targets.add(ticket.assignedToId);
    }
    if (!isInternal && ticket.requesterId && ticket.requesterId !== commentAuthorId) {
      targets.add(ticket.requesterId);
    }
    for (const userId of targets) {
      await notify({
        userId,
        type: 'TICKET_COMMENT',
        message: `Novo comentário no chamado #${ticket.id}: ${ticket.title}`,
        link: `/tickets/${ticket.id}`,
      });
    }
  } catch (err) {
    console.error('notifyTicketComment error:', err);
  }
}

async function notifyTicketReopened(assigneeId, ticket) {
  try {
    await notify({
      userId: assigneeId,
      type: 'TICKET_REOPENED',
      message: `O chamado #${ticket.id} foi reaberto: ${ticket.title}`,
      link: `/tickets/${ticket.id}`,
    });
  } catch (err) {
    console.error('notifyTicketReopened error:', err);
  }
}

async function notifyIdeaStatusChanged(authorId, idea) {
  try {
    await notify({
      userId: authorId,
      type: 'IDEA_STATUS_CHANGED',
      message: `Sua ideia '${idea.title}' mudou para ${idea.status}`,
      link: `/ideas/${idea.id}`,
    });
  } catch (err) {
    console.error('notifyIdeaStatusChanged error:', err);
  }
}

async function notifyIdeaVote(authorId, voterId, idea) {
  try {
    if (voterId === authorId) return;
    await notify({
      userId: authorId,
      type: 'IDEA_VOTE',
      message: `Sua ideia '${idea.title}' recebeu um novo voto`,
      link: `/ideas/${idea.id}`,
    });
  } catch (err) {
    console.error('notifyIdeaVote error:', err);
  }
}

module.exports = {
  notifyTicketAssigned,
  notifyTicketStatusChanged,
  notifyTicketComment,
  notifyTicketReopened,
  notifyIdeaStatusChanged,
  notifyIdeaVote,
};
```

- [ ] **Step 2: Integrar em `backend/src/modules/tickets/tickets.controller.js`**

Adicionar import no topo do arquivo (após as 4 linhas de `require` existentes):

```js
const {
  notifyTicketAssigned,
  notifyTicketStatusChanged,
  notifyTicketReopened,
} = require('../../lib/notificationService');
```

Na função `update`, substituir a linha final `res.json(serializeTicket(updatedTicket));` por:

```js
  if (directData.assignedToId !== undefined && directData.assignedToId !== ticket.assignedToId) {
    notifyTicketAssigned(directData.assignedToId, updatedTicket);
  }
  if (hasStatusChange) {
    const wasReopen = ticket.status === 'RESOLVIDO' && status === 'EM_ANDAMENTO';
    if (wasReopen) {
      notifyTicketReopened(updatedTicket.assignedToId, updatedTicket);
    } else {
      notifyTicketStatusChanged(updatedTicket.requesterId, updatedTicket);
    }
  }

  res.json(serializeTicket(updatedTicket));
```

Na função `reopen`, substituir `res.json(serializeTicket(updated));` por:

```js
  notifyTicketReopened(updated.assignedToId, updated);
  res.json(serializeTicket(updated));
```

- [ ] **Step 3: Integrar em `backend/src/modules/tickets/ticketComments.controller.js`**

Adicionar import no topo (após as 2 linhas de `require` existentes):

```js
const { notifyTicketComment } = require('../../lib/notificationService');
```

Substituir as duas últimas linhas da função `create` (`const [comment] = ...` e `res.status(201)...`) por:

```js
  const [comment] = await prisma.$transaction(operations);
  notifyTicketComment(ticket, req.user.id, Boolean(isInternal));
  res.status(201).json(comment);
```

- [ ] **Step 4: Integrar em `backend/src/modules/ideas/ideas.controller.js`**

Adicionar import no topo (após a linha `const prisma = require('./prisma');`):

```js
const { notifyIdeaStatusChanged, notifyIdeaVote } = require('../../lib/notificationService');
```

Na função `updateStatus`, substituir a última linha `res.json(serialize(updated, req.user.id, true));` por:

```js
  notifyIdeaStatusChanged(idea.authorId, updated);
  res.json(serialize(updated, req.user.id, true));
```

(`idea` é o resultado do `findUnique` na linha 117 — tem `authorId` e `title` antes da serialização.)

Na função `toggleVote`, substituir a última linha `res.json({ voted: !existing, voteCount });` por:

```js
  if (!existing) {
    notifyIdeaVote(idea.authorId, req.user.id, idea);
  }
  res.json({ voted: !existing, voteCount });
```

- [ ] **Step 5: Verificar que a suite existente ainda passa**

```
cd backend && npx jest --no-coverage --runInBand
```

Esperado: 151/152 (falha pré-existente em `ticket-core.test.js:54` é conhecida e não relacionada).

- [ ] **Step 6: Commit**

```
git add backend/src/lib/notificationService.js \
        backend/src/modules/tickets/tickets.controller.js \
        backend/src/modules/tickets/ticketComments.controller.js \
        backend/src/modules/ideas/ideas.controller.js
git commit -m "feat: add notification service and integrate triggers into controllers"
```

---

### Task 2: API de notificações + testes

**Files:**
- Create: `backend/src/modules/notifications/notifications.controller.js`
- Create: `backend/src/modules/notifications/notifications.routes.js`
- Modify: `backend/src/server.js`
- Create: `backend/tests/notifications-api.test.js`

**Interfaces:**
- Consumes (de Task 1): `notificationService.js` (via triggers nos controllers)
- Produces: `GET /api/notifications`, `PATCH /api/notifications/read-all`, `PATCH /api/notifications/:id/read`

- [ ] **Step 1: Criar `backend/src/modules/notifications/notifications.controller.js`**

```js
const prisma = require('../../lib/prisma');

async function list(req, res) {
  const { unreadOnly } = req.query;
  const where = {
    userId: req.user.id,
    ...(unreadOnly === 'true' ? { isRead: false } : {}),
  };

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  res.json(notifications);
}

async function markAllRead(req, res) {
  const result = await prisma.notification.updateMany({
    where: { userId: req.user.id, isRead: false },
    data: { isRead: true },
  });

  res.json({ updated: result.count });
}

async function markRead(req, res) {
  const id = Number(req.params.id);

  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification) {
    return res.status(404).json({ error: 'Notificação não encontrada.' });
  }
  if (notification.userId !== req.user.id) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }
  if (notification.isRead) {
    return res.json(notification);
  }

  const updated = await prisma.notification.update({
    where: { id },
    data: { isRead: true },
  });

  res.json(updated);
}

module.exports = { list, markAllRead, markRead };
```

- [ ] **Step 2: Criar `backend/src/modules/notifications/notifications.routes.js`**

```js
const express = require('express');
const authenticate = require('../../middleware/authenticate');
const asyncHandler = require('../../lib/asyncHandler');
const controller = require('./notifications.controller');

const router = express.Router();
const authenticated = asyncHandler(authenticate);

// read-all MUST come before /:id/read — otherwise Express matches 'read-all' as :id
router.get('/notifications', authenticated, asyncHandler(controller.list));
router.patch('/notifications/read-all', authenticated, asyncHandler(controller.markAllRead));
router.patch('/notifications/:id/read', authenticated, asyncHandler(controller.markRead));

module.exports = router;
```

- [ ] **Step 3: Montar em `backend/src/server.js`**

Adicionar import após a linha `const ideasRoutes = require('./modules/ideas/ideas.routes');`:

```js
const notificationsRoutes = require('./modules/notifications/notifications.routes');
```

Adicionar montagem após a linha `app.use('/api', ideasRoutes);`:

```js
app.use('/api', notificationsRoutes);
```

- [ ] **Step 4: Criar `backend/tests/notifications-api.test.js`**

```js
const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');

const ids = { sectors: [], roles: [], users: [], categories: [], tickets: [], ideas: [], notifications: [] };

let gestorToken, techToken, requesterToken;
let gestorId, techId, requesterId;
let ticketId, ideaId, idea2Id;
let notifReadId;

beforeAll(async () => {
  const sector = await prisma.sector.create({ data: { name: 'Setor Notif Test' } });
  ids.sectors.push(sector.id);

  const gestorRole = await prisma.role.create({
    data: {
      name: 'Gestor Notif Test',
      level: 3,
      permissions: {
        create: [
          { permissionKey: 'reassign_tickets', enabled: true },
          { permissionKey: 'close_tickets', enabled: true },
          { permissionKey: 'manage_ideas', enabled: true },
          { permissionKey: 'reopen_tickets', enabled: true },
        ],
      },
    },
  });
  ids.roles.push(gestorRole.id);

  const techRole = await prisma.role.create({
    data: { name: 'Tech Notif Test', level: 1 },
  });
  ids.roles.push(techRole.id);

  const gestor = await prisma.user.create({
    data: { name: 'Gestor Notif', email: 'gestor.notif@example.com', passwordHash: 'hash', roleId: gestorRole.id, sectorId: sector.id },
  });
  ids.users.push(gestor.id);
  gestorId = gestor.id;
  gestorToken = signAccessToken(gestor.id);

  const tech = await prisma.user.create({
    data: { name: 'Tech Notif', email: 'tech.notif@example.com', passwordHash: 'hash', roleId: techRole.id, sectorId: sector.id },
  });
  ids.users.push(tech.id);
  techId = tech.id;
  techToken = signAccessToken(tech.id);

  const requester = await prisma.user.create({
    data: { name: 'Requester Notif', email: 'requester.notif@example.com', passwordHash: 'hash', roleId: techRole.id, sectorId: sector.id },
  });
  ids.users.push(requester.id);
  requesterId = requester.id;
  requesterToken = signAccessToken(requester.id);

  const category = await prisma.category.create({
    data: {
      name: 'Cat Notif Test',
      subcategories: { create: [{ name: 'Sub Notif Test' }] },
    },
    include: { subcategories: true },
  });
  ids.categories.push(category.id);

  const ticket = await prisma.ticket.create({
    data: {
      title: 'Ticket Notif Test',
      description: 'desc',
      categoryId: category.id,
      subcategoryId: category.subcategories[0].id,
      urgency: 'MEDIO',
      requesterId: requesterId,
      sectorId: sector.id,
      assignedToId: techId,
      slaFirstResponseDeadline: new Date(Date.now() + 4 * 60 * 60 * 1000),
      slaResolutionDeadline: new Date(Date.now() + 8 * 60 * 60 * 1000),
    },
  });
  ids.tickets.push(ticket.id);
  ticketId = ticket.id;

  // idea for status-change trigger test
  const idea = await prisma.idea.create({
    data: { title: 'Ideia Notif Test', description: 'desc', areaImpacted: 'TI', expectedBenefit: 'Produtividade', authorId: techId, status: 'EM_ANALISE' },
  });
  ids.ideas.push(idea.id);
  ideaId = idea.id;

  // idea2 for vote trigger test (stays EM_ANALISE throughout)
  const idea2 = await prisma.idea.create({
    data: { title: 'Ideia Vote Test', description: 'desc', areaImpacted: 'RH', expectedBenefit: 'Engajamento', authorId: techId, status: 'EM_ANALISE' },
  });
  ids.ideas.push(idea2.id);
  idea2Id = idea2.id;

  // Direct notifications for endpoint tests
  const nUnread = await prisma.notification.create({
    data: { userId: techId, type: 'TICKET_ASSIGNED', message: 'Notif unread', link: '/tickets/1', isRead: false },
  });
  const nRead = await prisma.notification.create({
    data: { userId: techId, type: 'TICKET_COMMENT', message: 'Notif read', link: '/tickets/1', isRead: true },
  });
  const nGestor = await prisma.notification.create({
    data: { userId: gestorId, type: 'IDEA_VOTE', message: 'Notif gestor', link: '/ideas/1', isRead: false },
  });
  ids.notifications.push(nUnread.id, nRead.id, nGestor.id);
  notifReadId = nRead.id;
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: ids.users } } });
  await prisma.ideaVote.deleteMany({ where: { ideaId: { in: ids.ideas } } });
  await prisma.idea.deleteMany({ where: { id: { in: ids.ideas } } });
  await prisma.ticketComment.deleteMany({ where: { ticketId: { in: ids.tickets } } });
  await prisma.ticketTimeLog.deleteMany({ where: { ticketId: { in: ids.tickets } } });
  await prisma.ticket.deleteMany({ where: { id: { in: ids.tickets } } });
  await prisma.subcategory.deleteMany({ where: { categoryId: { in: ids.categories } } });
  await prisma.category.deleteMany({ where: { id: { in: ids.categories } } });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  await prisma.role.deleteMany({ where: { id: { in: ids.roles } } });
  await prisma.sector.deleteMany({ where: { id: { in: ids.sectors } } });
  await prisma.$disconnect();
});

// --- endpoint tests ---

test('GET /notifications retorna notificações do usuário em ordem createdAt desc', async () => {
  const res = await request(app)
    .get('/api/notifications')
    .set('Authorization', `Bearer ${techToken}`);

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  expect(res.body.length).toBeGreaterThanOrEqual(2);
  const dates = res.body.map((n) => new Date(n.createdAt).getTime());
  for (let i = 1; i < dates.length; i++) {
    expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
  }
});

test('GET /notifications?unreadOnly=true retorna apenas não lidas', async () => {
  const res = await request(app)
    .get('/api/notifications?unreadOnly=true')
    .set('Authorization', `Bearer ${techToken}`);

  expect(res.status).toBe(200);
  expect(res.body.length).toBeGreaterThanOrEqual(1);
  expect(res.body.every((n) => n.isRead === false)).toBe(true);
});

test('GET /notifications não retorna notificações de outros usuários', async () => {
  const res = await request(app)
    .get('/api/notifications')
    .set('Authorization', `Bearer ${techToken}`);

  expect(res.status).toBe(200);
  expect(res.body.every((n) => n.userId === techId)).toBe(true);
});

test('PATCH /notifications/read-all marca todas como lidas e retorna count', async () => {
  const extra = await prisma.notification.create({
    data: { userId: techId, type: 'TICKET_ASSIGNED', message: 'Extra unread', link: '/tickets/1', isRead: false },
  });
  ids.notifications.push(extra.id);

  const res = await request(app)
    .patch('/api/notifications/read-all')
    .set('Authorization', `Bearer ${techToken}`);

  expect(res.status).toBe(200);
  expect(res.body.updated).toBeGreaterThanOrEqual(1);

  const remaining = await prisma.notification.findMany({ where: { userId: techId, isRead: false } });
  expect(remaining).toHaveLength(0);
});

test('PATCH /notifications/:id/read marca uma notificação como lida', async () => {
  const n = await prisma.notification.create({
    data: { userId: techId, type: 'TICKET_STATUS_CHANGED', message: 'Mark one', link: '/tickets/1', isRead: false },
  });
  ids.notifications.push(n.id);

  const res = await request(app)
    .patch(`/api/notifications/${n.id}/read`)
    .set('Authorization', `Bearer ${techToken}`);

  expect(res.status).toBe(200);
  expect(res.body.isRead).toBe(true);
});

test('PATCH /notifications/:id/read é idempotente (já lida → 200)', async () => {
  const res = await request(app)
    .patch(`/api/notifications/${notifReadId}/read`)
    .set('Authorization', `Bearer ${techToken}`);

  expect(res.status).toBe(200);
  expect(res.body.isRead).toBe(true);
});

test('PATCH /notifications/:id/read retorna 404 para notificação inexistente', async () => {
  const res = await request(app)
    .patch('/api/notifications/999999/read')
    .set('Authorization', `Bearer ${techToken}`);

  expect(res.status).toBe(404);
});

test('PATCH /notifications/:id/read retorna 403 para notificação de outro usuário', async () => {
  // ids.notifications[2] belongs to gestorId; techToken should get 403
  const gestorNotifId = ids.notifications[2];
  const res = await request(app)
    .patch(`/api/notifications/${gestorNotifId}/read`)
    .set('Authorization', `Bearer ${techToken}`);

  expect(res.status).toBe(403);
});

// --- trigger tests (sequential, share ticket/idea state) ---

test('PATCH /tickets/:id com novo assignedToId cria TICKET_ASSIGNED para o assignee', async () => {
  // Reassign from techId to gestorId using gestor (has reassign_tickets)
  const res = await request(app)
    .patch(`/api/tickets/${ticketId}`)
    .set('Authorization', `Bearer ${gestorToken}`)
    .send({ assignedToId: gestorId });

  expect(res.status).toBe(200);

  const notif = await prisma.notification.findFirst({
    where: { userId: gestorId, type: 'TICKET_ASSIGNED', link: `/tickets/${ticketId}` },
  });
  expect(notif).not.toBeNull();
  expect(notif.message).toContain(`#${ticketId}`);
});

test('PATCH /tickets/:id muda status cria TICKET_STATUS_CHANGED para solicitante', async () => {
  // Ticket is now assigned to gestorId; gestor changes status ABERTO → EM_ANDAMENTO
  const res = await request(app)
    .patch(`/api/tickets/${ticketId}`)
    .set('Authorization', `Bearer ${gestorToken}`)
    .send({ status: 'EM_ANDAMENTO' });

  expect(res.status).toBe(200);

  const notif = await prisma.notification.findFirst({
    where: { userId: requesterId, type: 'TICKET_STATUS_CHANGED', link: `/tickets/${ticketId}` },
  });
  expect(notif).not.toBeNull();
});

test('POST /tickets/:id/comments cria TICKET_COMMENT para assignee', async () => {
  // Ticket is EM_ANDAMENTO assigned to gestorId; requester comments → gestorId notified
  const res = await request(app)
    .post(`/api/tickets/${ticketId}/comments`)
    .set('Authorization', `Bearer ${requesterToken}`)
    .send({ body: 'Comentário trigger test', isInternal: false });

  expect(res.status).toBe(201);

  const notif = await prisma.notification.findFirst({
    where: { userId: gestorId, type: 'TICKET_COMMENT', link: `/tickets/${ticketId}` },
  });
  expect(notif).not.toBeNull();
});

test('PATCH /ideas/:id/status cria IDEA_STATUS_CHANGED para autor da ideia', async () => {
  const res = await request(app)
    .patch(`/api/ideas/${ideaId}/status`)
    .set('Authorization', `Bearer ${gestorToken}`)
    .send({ status: 'APROVADA' });

  expect(res.status).toBe(200);

  const notif = await prisma.notification.findFirst({
    where: { userId: techId, type: 'IDEA_STATUS_CHANGED', link: `/ideas/${ideaId}` },
  });
  expect(notif).not.toBeNull();
  expect(notif.message).toContain('APROVADA');
});

test('POST /ideas/:id/vote cria IDEA_VOTE para autor quando votante é diferente do autor', async () => {
  // requester votes on idea2 (authored by techId) → techId gets IDEA_VOTE
  const res = await request(app)
    .post(`/api/ideas/${idea2Id}/vote`)
    .set('Authorization', `Bearer ${requesterToken}`);

  expect(res.status).toBe(200);
  expect(res.body.voted).toBe(true);

  const notif = await prisma.notification.findFirst({
    where: { userId: techId, type: 'IDEA_VOTE', link: `/ideas/${idea2Id}` },
  });
  expect(notif).not.toBeNull();
});
```

- [ ] **Step 5: Rodar os testes da Fase 6**

```
cd backend && npx jest tests/notifications-api.test.js --no-coverage --runInBand
```

Esperado: 13/13 passando.

- [ ] **Step 6: Rodar a suite completa para verificar regressões**

```
cd backend && npx jest --no-coverage --runInBand
```

Esperado: 164/165 passando (1 falha pré-existente em `ticket-core.test.js:54`).

- [ ] **Step 7: Commit**

```
git add backend/src/modules/notifications/notifications.controller.js \
        backend/src/modules/notifications/notifications.routes.js \
        backend/src/server.js \
        backend/tests/notifications-api.test.js
git commit -m "feat: add notifications API and integration tests"
```
