# Fase 6 — Módulo de Notificações (Backend)

Data: 2026-06-25

## 1. Visão geral

Fase 6 implementa um sistema de notificações in-app para o helpdesk. Eventos relevantes em tickets e ideias geram registros de notificação para os usuários afetados. Um serviço centralizado (`notificationService.js`) encapsula toda a lógica de criação, mantendo os controllers limpos e preparando a arquitetura para canais adicionais (ex: email) no futuro.

O modelo `Notification` já existe no schema Prisma — nenhuma migration é necessária.

Nenhum frontend é criado nesta fase.

## 2. Escopo

**Incluído:**
- Serviço `notificationService.js` com funções por tipo de evento
- 6 tipos de notificação (4 de tickets, 1 de ideia, 1 de voto)
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
| `TICKET_ASSIGNED` | `assignedToId` mudou via `PATCH /tickets/:id` | Novo técnico atribuído |
| `TICKET_STATUS_CHANGED` | Status mudou via `PATCH /tickets/:id` (transição não-reopen) | Solicitante (`requesterId`) |
| `TICKET_COMMENT` | Novo comentário adicionado | Técnico atribuído + solicitante, exceto autor do comentário e exceto solicitante em notas internas |
| `TICKET_REOPENED` | Status mudou de `RESOLVIDO` para `EM_ANDAMENTO` (detectado via `isReopen()`) | Técnico atribuído (se houver) |
| `IDEA_STATUS_CHANGED` | Status da ideia mudou | Autor da ideia |
| `IDEA_VOTE` | Ideia recebeu voto (votante ≠ autor) | Autor da ideia |

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

async function notifyTicketComment(ticket, commentAuthorId, isInternal)
// Cria até 2 notificações:
//   - assignedToId (se existir e ≠ commentAuthorId)
//   - requesterId (se ≠ commentAuthorId E isInternal === false)
// message: "Novo comentário no chamado #<id>: <title>"
// link: /tickets/<id>

async function notifyTicketReopened(assigneeId, ticket)
// message: "O chamado #<id> foi reaberto: <title>"
// link: /tickets/<id>

// Notificações de ideias
async function notifyIdeaStatusChanged(authorId, idea)
// message: "Sua ideia '<title>' mudou para <status>"
// link: /ideas/<id>

async function notifyIdeaVote(authorId, voterId, idea)
// Pula silenciosamente se voterId === authorId (auto-voto)
// message: "Sua ideia '<title>' recebeu um novo voto"
// link: /ideas/<id>
```

### Função interna

```js
async function notify({ userId, type, message, link }) {
  if (!userId) return;  // guard: nunca criar notificação com userId nulo
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

### tickets.controller.js — função `update`

O `PATCH /tickets/:id` é o único ponto de trigger para tickets. A função lê o ticket atual antes de aplicar mudanças (`const ticket = await prisma.ticket.findUnique(...)`). As notificações são chamadas após a operação bem-sucedida, comparando valores anteriores com os novos:

| Condição | Chamada ao serviço |
|----------|-------------------|
| `body.assignedToId` existe e difere de `ticket.assignedToId` | `notifyTicketAssigned(body.assignedToId, updatedTicket)` |
| `body.status` existe, transição bem-sucedida, e `isReopen(ticket.status, body.status)` é `true` | `notifyTicketReopened(updatedTicket.assignedToId, updatedTicket)` (pula se assignedToId nulo) |
| `body.status` existe, transição bem-sucedida, e `isReopen(...)` é `false` | `notifyTicketStatusChanged(updatedTicket.requesterId, updatedTicket)` |

`isReopen` já está implementado em `backend/src/lib/ticketStatus.js` — importar e reutilizar.

**Nota:** `POST /tickets` (create) **não** gera `TICKET_ASSIGNED` — o fluxo atual não aceita `assignedToId` na criação.

### ticketComments.controller.js — função `create`

Após inserir o comentário com sucesso:

```js
await notifyTicketComment(ticket, req.user.id, body.isInternal ?? false);
```

O objeto `ticket` já está disponível (lido para verificação de visibilidade antes da inserção).

### ideas.controller.js

| Função | Condição | Chamada ao serviço |
|--------|----------|-------------------|
| `updateStatus` | sempre (após update bem-sucedido) | `notifyIdeaStatusChanged(idea.authorId, idea)` — usar objeto `idea` pré-serialização |
| `toggleVote` | voto adicionado (`voted === true`) | `notifyIdeaVote(idea.authorId, req.user.id, idea)` |

## 8. Arquitetura

```
backend/src/lib/
  notificationService.js    (serviço centralizado, funções por evento)
backend/src/modules/notifications/
  notifications.controller.js   (list, markRead, markAllRead)
  notifications.routes.js       (per-route auth — nunca router.use())
backend/tests/
  notifications-api.test.js     (~13 testes de integração)
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

## 9. Testes de integração (13)

**Setup (beforeAll):**
- 1 setor
- Role `gestor` com permissões `reassign_tickets`, `close_tickets`, `manage_ideas`
- Role `tecnico` sem permissões especiais
- 3 usuários: `gestor` (role gestor), `tech` (role tecnico), `requester` (role tecnico)
- 1 categoria + 1 subcategoria
- 1 ticket criado pelo `requester`, atribuído ao `tech`, status `ABERTO`
- 1 ideia criada pelo `tech`, status `EM_ANALISE`
- Notificações extras criadas diretamente via Prisma para testes de endpoint

**Casos de endpoint:**
1. `GET /notifications` retorna notificações do usuário logado em ordem `createdAt` desc
2. `GET /notifications?unreadOnly=true` retorna apenas não lidas
3. `GET /notifications` não retorna notificações de outros usuários
4. `PATCH /notifications/read-all` marca todas como lidas, retorna `{ updated: N }`
5. `PATCH /notifications/:id/read` marca uma como lida
6. `PATCH /notifications/:id/read` é idempotente (já lida → 200)
7. `PATCH /notifications/:id/read` retorna 404 para inexistente
8. `PATCH /notifications/:id/read` retorna 403 para notificação de outro usuário

**Casos de trigger:**
9. `PATCH /tickets/:id` com novo `assignedToId` cria `TICKET_ASSIGNED` para o novo técnico (gestor faz o PATCH)
10. `PATCH /tickets/:id` com mudança de `status` (não-reopen) cria `TICKET_STATUS_CHANGED` para o solicitante (gestor faz o PATCH)
11. `POST /tickets/:id/comments` cria `TICKET_COMMENT` para o técnico atribuído (requester comenta)
12. `PATCH /ideas/:id/status` cria `IDEA_STATUS_CHANGED` para o autor da ideia (gestor muda status)
13. `POST /ideas/:id/vote` com votante ≠ autor cria `IDEA_VOTE` para o autor (requester vota)

## 10. Ordem de implementação

1. Criar `notificationService.js` com todas as funções (sem DB calls por enquanto, usando `notify` interno)
2. Integrar o serviço nos controllers existentes (tickets, comments, ideas)
3. Criar `notifications.controller.js` + `notifications.routes.js` + montar em `server.js`
4. Criar `notifications-api.test.js` e rodar suite completa
