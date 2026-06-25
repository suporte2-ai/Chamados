# Fase 6 — Módulo de Notificações (Backend)

Data: 2026-06-25

## 1. Visão geral

Fase 6 implementa um sistema de notificações in-app para o helpdesk. Eventos relevantes em tickets e ideias geram registros de notificação para os usuários afetados. Um serviço centralizado (`notificationService.js`) encapsula toda a lógica de criação, mantendo os controllers limpos e preparando a arquitetura para canais adicionais (ex: email) no futuro.

O modelo `Notification` já existe no schema Prisma — nenhuma migration é necessária.

Nenhum frontend é criado nesta fase.

## 2. Escopo

**Incluído:**
- Serviço `notificationService.js` com funções por tipo de evento
- 6 tipos de notificação (3 de tickets, 1 de comentário, 1 de ideia, 1 de voto)
- Integração nos controllers existentes (tickets, comments, ideas)
- API REST para listar, marcar uma e marcar todas como lidas
- Testes de integração contra Postgres real

**Excluído:**
- Entrega por email ou push (arquitetura preparada, sem implementação)
- Notificações em tempo real (WebSocket/SSE — fase futura)
- Frontend/UI

## 3. Modelo de dados existente

O schema já define (não alterar):

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

## 4. Tipos de evento

| type | Evento | Destinatário |
|------|--------|--------------|
| `TICKET_ASSIGNED` | Técnico atribuído ao ticket (criação ou update) | Técnico atribuído |
| `TICKET_STATUS_CHANGED` | Status do ticket mudou | Solicitante (`requesterId`) |
| `TICKET_COMMENT` | Novo comentário adicionado | Técnico atribuído + solicitante, exceto o autor do comentário |
| `TICKET_REOPENED` | Ticket reaberto | Técnico atribuído |
| `IDEA_STATUS_CHANGED` | Status da ideia mudou | Autor da ideia |
| `IDEA_VOTE` | Ideia recebeu voto (toggle adicionando) | Autor da ideia |

O campo `link` contém o caminho relativo para navegação no frontend (ex: `/tickets/42`, `/ideas/7`). O campo `message` é sempre em português.

## 5. Serviço de notificações

**Arquivo:** `backend/src/lib/notificationService.js`

### Interface pública

```js
// Notificações de tickets
async function notifyTicketAssigned(assigneeId, ticket)
// message: "Você foi atribuído ao chamado #<id>: <title>"
// link: /tickets/<id>

async function notifyTicketStatusChanged(requesterId, ticket)
// message: "O chamado #<id> mudou para <status>"
// link: /tickets/<id>

async function notifyTicketComment(ticket, commentAuthorId)
// Cria até 2 notificações (assignedToId + requesterId), pulando o commentAuthorId e IDs nulos
// message: "Novo comentário no chamado #<id>: <title>"
// link: /tickets/<id>

async function notifyTicketReopened(assigneeId, ticket)
// message: "O chamado #<id> foi reaberto: <title>"
// link: /tickets/<id>

// Notificações de ideias
async function notifyIdeaStatusChanged(authorId, idea)
// message: "Sua ideia '<title>' mudou para <status>"
// link: /ideas/<id>

async function notifyIdeaVote(authorId, idea)
// message: "Sua ideia '<title>' recebeu um novo voto"
// link: /ideas/<id>
```

### Função interna

```js
async function notify({ userId, type, message, link }) {
  await prisma.notification.create({ data: { userId, type, message, link } });
}
```

### Comportamento de falha

Cada função pública envolve a criação em `try/catch`. Erros de notificação são silenciosos — não interrompem a operação principal do controller. Erros são logados em `console.error` para rastreabilidade.

### Extensibilidade

Para adicionar email no futuro: acrescentar `await sendEmail(...)` dentro de cada função pública do serviço, sem tocar nos controllers.

## 6. Endpoints

### 6.1 GET /api/notifications

**Auth:** qualquer autenticado

**Query params:**

| Param | Tipo | Descrição |
|-------|------|-----------|
| `unreadOnly` | `"true"` | Se presente e `"true"`, retorna apenas não lidas |

**Resposta 200:** array de notificações do usuário logado, ordenado por `createdAt` desc.

```json
[
  {
    "id": 1,
    "type": "TICKET_ASSIGNED",
    "message": "Você foi atribuído ao chamado #5: Impressora não funciona",
    "link": "/tickets/5",
    "isRead": false,
    "createdAt": "2026-06-25T10:00:00.000Z"
  }
]
```

Nunca retorna notificações de outros usuários.

---

### 6.2 PATCH /api/notifications/read-all

**Auth:** qualquer autenticado

Marca todas as notificações não lidas do usuário logado como lidas via `updateMany`.

**Resposta 200:** `{ updated: N }` com a contagem de registros atualizados.

---

### 6.3 PATCH /api/notifications/:id/read

**Auth:** qualquer autenticado

**Validações (nessa ordem):**
1. Notificação inexistente → 404
2. Notificação pertence a outro usuário → 403
3. Já lida → 200 sem erro (idempotente)

**Resposta 200:** objeto notificação atualizado com `isRead: true`.

## 7. Pontos de integração

### tickets.controller.js

| Função | Evento | Chamada ao serviço |
|--------|--------|-------------------|
| `create` | `assignedToId` presente no body | `notifyTicketAssigned(assignedToId, ticket)` |
| `update` | `assignedToId` no body difere do atual no banco | `notifyTicketAssigned(newAssigneeId, ticket)` |
| `update` | `status` mudou | `notifyTicketStatusChanged(ticket.requesterId, ticket)` |
| `reopen` | sempre | `notifyTicketReopened(ticket.assignedToId, ticket)` (se houver assignee) |

### ticketComments.controller.js

| Função | Evento | Chamada ao serviço |
|--------|--------|-------------------|
| `create` | sempre | `notifyTicketComment(ticket, req.user.id)` |

### ideas.controller.js

| Função | Evento | Chamada ao serviço |
|--------|--------|-------------------|
| `updateStatus` | sempre | `notifyIdeaStatusChanged(idea.authorId, idea)` |
| `toggleVote` | voto adicionado (`voted: true`) | `notifyIdeaVote(idea.authorId, idea)` |

## 8. Arquitetura

```
backend/src/lib/
  notificationService.js    (serviço centralizado, funções por evento)
backend/src/modules/notifications/
  notifications.controller.js   (list, markRead, markAllRead)
  notifications.routes.js       (per-route auth — nunca router.use())
backend/tests/
  notifications-api.test.js     (~12 testes de integração)
```

`backend/src/server.js` recebe `app.use('/api', notificationsRoutes)`.

### Padrão de auth por rota

```js
const authenticated = asyncHandler(authenticate);

router.get('/notifications', authenticated, asyncHandler(controller.list));
router.patch('/notifications/read-all', authenticated, asyncHandler(controller.markAllRead));
router.patch('/notifications/:id/read', authenticated, asyncHandler(controller.markRead));
```

**Atenção:** `/notifications/read-all` deve vir **antes** de `/notifications/:id/read` para que o Express não interprete `read-all` como `:id`.

## 9. Testes de integração (12)

**Setup (beforeAll):** cria 2 usuários (user1, user2), sector, roles sem permissões especiais. Cria notificações diretamente via Prisma para user1.

**Casos de endpoint:**
1. `GET /notifications` retorna notificações do usuário logado em ordem desc
2. `GET /notifications?unreadOnly=true` retorna apenas não lidas
3. `GET /notifications` não retorna notificações de outros usuários
4. `PATCH /notifications/read-all` marca todas como lidas, retorna `{ updated: N }`
5. `PATCH /notifications/:id/read` marca uma como lida
6. `PATCH /notifications/:id/read` é idempotente (já lida → 200)
7. `PATCH /notifications/:id/read` retorna 404 para inexistente
8. `PATCH /notifications/:id/read` retorna 403 para notificação de outro usuário

**Casos de trigger:**
9. Atribuir ticket via `POST /tickets` (com assignedToId) cria `TICKET_ASSIGNED`
10. Mudar status via `PATCH /tickets/:id` cria `TICKET_STATUS_CHANGED` para solicitante
11. Criar comentário via `POST /tickets/:id/comments` cria `TICKET_COMMENT`
12. Mudar status de ideia via `PATCH /ideas/:id/status` cria `IDEA_STATUS_CHANGED`

## 10. Ordem de implementação

1. Criar `notificationService.js` com todas as funções e testes unitários básicos
2. Integrar o serviço nos controllers existentes (tickets, comments, ideas)
3. Criar `notifications.controller.js` + `notifications.routes.js` + montar em `server.js`
4. Criar `notifications-api.test.js` e rodar suite completa
