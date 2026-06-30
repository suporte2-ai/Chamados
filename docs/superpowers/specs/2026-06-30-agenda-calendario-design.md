# Agenda / Calendário — Design Spec

**Data:** 2026-06-30
**Status:** Aprovado

## 1. Visão Geral

Adicionar uma agenda estilo calendário ao sistema de chamados, permitindo que admins e gestores criem eventos (reuniões, convocações) direcionados a toda a empresa, a um setor específico ou a usuários individuais. Cada usuário vê apenas os eventos aos quais foi convocado e pode confirmar ou recusar presença. Notificações automáticas são enviadas 3 dias e 1 dia antes de cada evento.

## 2. Stack e Convenções

Inalteradas das fases anteriores:
- **Backend:** Node.js + Express + Prisma + PostgreSQL, porta 4000
- **Frontend:** React 18, Vite 5, Tailwind CSS 3, shadcn/ui, React Router v6, Zustand 4, TanStack Query v5, Axios 1
- **Auth:** JWT access token em variável de módulo, refresh via cookie httpOnly
- **Notificações:** função privada `notify()` em `backend/src/lib/notificationService.js` — o cron adiciona duas funções exportadas novas (`notifyEventReminder`, `notifyEventCancelled`) seguindo o padrão existente do módulo
- **Nova dependência backend:** `node-cron` (cron job diário)

## 3. Modelo de Dados

### Nova tabela `Event`

```prisma
model Event {
  id          Int            @id @default(autoincrement())
  title       String
  description String?
  location    String?
  startAt     DateTime
  endAt       DateTime
  scope       String         // 'EMPRESA' | 'SETOR' | 'USUARIO'
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
```

### Nova tabela `EventAttendee`

```prisma
model EventAttendee {
  id          Int      @id @default(autoincrement())
  eventId     Int
  event       Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  userId      Int
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  rsvp        String   @default("PENDENTE")  // 'PENDENTE' | 'CONFIRMADO' | 'RECUSADO'
  notified3d  Boolean  @default(false)
  notified1d  Boolean  @default(false)
  createdAt   DateTime @default(now())

  @@unique([eventId, userId])
  @@index([userId])
  @@map("event_attendees")
}
```

### Atualizações aos models existentes

```prisma
// User
eventsCreated  Event[]         @relation("EventsCreated")
eventAttendees EventAttendee[]

// Sector
events Event[]
```

### Regras de integridade

- `scope` aceita apenas `'EMPRESA'`, `'SETOR'` ou `'USUARIO'` (validado no controller)
- `sectorId` obrigatório quando `scope='SETOR'`; deve ser `null` nos demais casos
- `startAt` deve ser anterior a `endAt`
- `rsvp` aceita apenas `'PENDENTE'`, `'CONFIRMADO'` ou `'RECUSADO'`

## 4. Permissão

Nova chave adicionada ao objeto literal `PERMISSION_KEYS` em `backend/src/lib/permissions.js`:

```js
manage_events: 'manage_events'
```

Adicionada à `rolePermissionMatrix` no `backend/prisma/seed.js` para:
- `Admin` — já recebe todas as permissões via `allPermissionKeys`
- `Gestor` — adicionada explicitamente no array do Gestor junto com as demais permissões existentes

> **Importante:** O seed itera sobre `PERMISSION_KEYS` para criar as linhas `role_permissions`. Se `manage_events` não estiver em `PERMISSION_KEYS`, a entrada não é criada para nenhum role. Ambos os lugares devem ser atualizados.

## 5. API Backend

Módulo em `backend/src/modules/events/` com `events.controller.js` e `events.routes.js`.

### Endpoints

| Método | Rota | Permissão | Descrição |
|--------|------|-----------|-----------|
| `POST` | `/api/events` | `manage_events` | Criar evento |
| `GET` | `/api/events` | autenticado | Listar eventos do usuário logado |
| `GET` | `/api/events/:id` | autenticado | Detalhe + participantes |
| `PATCH` | `/api/events/:id` | `manage_events` | Editar evento (criador ou admin) |
| `DELETE` | `/api/events/:id` | `manage_events` | Cancelar evento |
| `PATCH` | `/api/events/:id/rsvp` | autenticado | Atualizar RSVP próprio |

### POST /api/events

**Body:**
```json
{
  "title": "Reunião TI",
  "description": "Alinhamento mensal",
  "location": "Sala 3 / meet.google.com/xxx",
  "startAt": "2026-07-10T14:00:00.000Z",
  "endAt": "2026-07-10T15:00:00.000Z",
  "scope": "SETOR",
  "sectorId": 2,
  "userIds": []
}
```

- Quando `scope='EMPRESA'`: busca todos os usuários ativos e cria `EventAttendee` para cada um
- Quando `scope='SETOR'`: busca usuários cujo **`User.sectorId` principal** corresponde ao `sectorId` do evento (não inclui vínculos secundários via `UserSector`)
- Quando `scope='USUARIO'`: cria `EventAttendee` para cada `userId` em `userIds` — **`userIds` deve ter ao menos 1 elemento** (validação 422 se vazio)
- Após criar os attendees, envia `Notification` imediata de convocação para cada participante

**Response 201:**
```json
{ "id": 1, "title": "Reunião TI", "startAt": "...", "attendeeCount": 5 }
```

### GET /api/events

**Query params:** `?from=2026-07-01&to=2026-07-31`

Retorna apenas eventos onde o usuário logado tem um `EventAttendee`. Inclui campo `myRsvp` com o status RSVP do usuário logado.

**Response 200:**
```json
[
  {
    "id": 1,
    "title": "Reunião TI",
    "startAt": "2026-07-10T14:00:00.000Z",
    "endAt": "2026-07-10T15:00:00.000Z",
    "location": "Sala 3",
    "scope": "SETOR",
    "createdBy": { "id": 1, "name": "Admin" },
    "myRsvp": "PENDENTE",
    "attendeeCount": 5
  }
]
```

### GET /api/events/:id

Retorna o evento completo. Se o usuário tem `manage_events` e é criador (ou é admin), inclui a lista de participantes com status RSVP. Usuários comuns veem apenas as infos do evento e seu próprio RSVP.

### PATCH /api/events/:id

Admins podem editar qualquer evento. Gestores só podem editar eventos que criaram. Não é possível editar `scope`, `sectorId` ou `userIds` após criação (para não invalidar EventAttendees existentes).

Campos editáveis: `title`, `description`, `location`, `startAt`, `endAt`.

**Quando `startAt` ou `endAt` for alterado**, o controller deve resetar `notified3d = false` e `notified1d = false` em todos os `EventAttendee` do evento via `updateMany`, garantindo que os lembretes sejam reenviados para a nova data.

### DELETE /api/events/:id

Remove o evento e todos os `EventAttendee` (cascade). Envia notificação de cancelamento para cada participante.

### PATCH /api/events/:id/rsvp

**Body:** `{ "rsvp": "CONFIRMADO" | "RECUSADO" }`

Atualiza o `EventAttendee.rsvp` do usuário logado. Retorna 404 se o usuário não é participante do evento.

## 6. Cron de Notificações

Arquivo: `backend/src/lib/eventNotificationCron.js`

Executado diariamente à **00:05** via `node-cron` (`'5 0 * * *'`).

**Lógica:**

```js
// Lembrete de 3 dias
const in3days = startOfDay(addDays(now, 3));
const in3daysEnd = endOfDay(addDays(now, 3));

const attendees3d = await prisma.eventAttendee.findMany({
  where: {
    notified3d: false,
    event: { startAt: { gte: in3days, lte: in3daysEnd } }
  },
  include: { event: true }
});

for (const a of attendees3d) {
  try {
    // Marcar flag ANTES de notificar: se o evento foi deletado (cascade),
    // o update lança P2025 e a notificação não é enviada.
    await prisma.eventAttendee.update({ where: { id: a.id }, data: { notified3d: true } });
    await notifyEventReminder(a.userId, a.event, 3);
  } catch (err) {
    // P2025 = attendee deletado por cascade (evento cancelado) — ignorar silenciosamente
    if (err.code !== 'P2025') console.error('eventCron 3d error:', err);
  }
}

// Lembrete de 1 dia (mesmo padrão, usando in1day, notified1d)
```

**Funções a adicionar em `notificationService.js`** (seguindo o padrão existente):
```js
async function notifyEventReminder(userId, event, daysAhead) { ... }
async function notifyEventCancelled(userId, event) { ... }
```

**Registro do cron em `server.js`:** dentro do bloco `if (require.main === module)`, após `app.listen`, para não disparar durante testes que importam o módulo:
```js
if (require.main === module) {
  app.listen(PORT, () => { ... });
  require('./lib/eventNotificationCron').start();
}
```

## 7. Frontend

### Nova rota

`/agenda` — adicionada ao React Router e ao Sidebar (ícone `Calendar` do Lucide React).

### Arquivo principal

`frontend/src/pages/AgendaPage.jsx`

### Componentes

- `CalendarGrid.jsx` — grade mensal com pontos coloridos nos dias que têm eventos
- `EventListView.jsx` — lista cronológica de eventos futuros
- `EventCard.jsx` — card compacto com título, data/hora, scope badge, botões RSVP
- `EventModal.jsx` — modal de criação/edição (apenas manage_events)
- `EventDetailModal.jsx` — modal de detalhe + RSVP + lista de participantes (se criador/admin)

### API client

`frontend/src/api/events.js`:

```js
export const eventsApi = {
  list: (params) => api.get('/events', { params }).then(r => r.data),
  get: (id) => api.get(`/events/${id}`).then(r => r.data),
  create: (data) => api.post('/events', data).then(r => r.data),
  update: (id, data) => api.patch(`/events/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/events/${id}`).then(r => r.data),
  rsvp: (id, rsvp) => api.patch(`/events/${id}/rsvp`, { rsvp }).then(r => r.data),
}
```

### Visão Mensal

- Grade 7×6 com o mês atual
- Navegação `< Mês Ano >` para mês anterior/próximo
- Dias com eventos marcados com um ponto colorido (precedência aplicada nesta ordem):
  1. **Amarelo/laranja** — qualquer evento do dia com RSVP `PENDENTE`
  2. **Verde** — todos os eventos do dia com RSVP `CONFIRMADO` (nenhum PENDENTE)
  3. **Cinza** — todos os eventos do dia com RSVP `RECUSADO` (nenhum PENDENTE, nenhum CONFIRMADO)
- Clique no dia abre painel lateral (ou popover) com eventos do dia

### Visão Lista

- Eventos futuros do usuário logado, ordenados por `startAt`
- Agrupados por data ("Hoje", "Amanhã", "10/07/2026", etc.)
- Cada item mostra: hora, título, local, badge de scope, badge RSVP + botões de ação

### Modal de Criação (manage_events)

Campos:
- Título (obrigatório)
- Data, hora início, hora fim
- Local (opcional)
- Descrição (opcional)
- Público: radio "Toda a empresa" / "Setor" / "Usuários específicos"
  - Se Setor: dropdown de setores
  - Se Usuários: multi-select de usuários ativos

### Modal de Detalhe

- Informações completas do evento
- Badge do RSVP do usuário + botões "Confirmar" / "Recusar"
- Se o usuário é criador ou admin: tabela de participantes com nome, setor e RSVP

## 8. Casos de Borda

| Cenário | Comportamento |
|---------|---------------|
| Evento criado com `startAt` no passado | Aceito (para registro histórico), mas sem notificações |
| Usuário inativo no momento da criação | Não incluído nos attendees |
| Admin deleta evento com notificações já enviadas | OK — notificações existentes ficam no histórico |
| Usuário tenta RSVP em evento que não está convidado | 404 |
| Gestor tenta editar evento de outro gestor | 403 |
| Cron falha para um attendee | Log de erro, não bloqueia os demais |

## 9. Critério de Aceite

- Usuário com `manage_events` consegue criar eventos para empresa, setor ou usuários específicos
- Usuário comum vê apenas eventos dos quais é participante
- RSVP atualiza em tempo real no modal de detalhe (invalidate query após PATCH)
- Visão mensal mostra pontos nos dias corretos
- Visão lista agrupa eventos por data
- Cron envia notificações 3 dias e 1 dia antes (flags `notified3d` e `notified1d` impedem duplicatas)
- Cancelamento de evento dispara notificação para todos os participantes
