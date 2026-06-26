# Helpdesk Phase 11 — Multi-Setor para Usuários — Design

Data: 2026-06-26

## 1. Visão geral

Permitir que técnicos e atendentes pertençam a mais de um setor, com dois níveis de associação:

- **Membro** — técnico enxerga toda a fila de chamados do setor (igual ao setor principal)
- **Extra** — técnico aparece disponível para atribuição naquele setor, mas só vê chamados que forem atribuídos diretamente a ele

O setor principal (`user.sectorId`) permanece inalterado e continua sendo usado para perfil e relatórios.

## 2. Stack e convenções

Inalteradas das fases anteriores:
- **Backend:** Node.js + Express + Prisma + PostgreSQL, porta 4000
- **Frontend:** React 18, Vite 5, Tailwind CSS 3, shadcn/ui, React Router v6, Zustand 4, TanStack Query v5, Axios 1
- **Auth:** JWT access token em variável de módulo, refresh via cookie httpOnly
- **Permissão relevante:** `manage_users` — protege endpoints de gestão de setores (via `router.use` já existente em `users.routes.js`)

## 3. Modelo de dados

### Nova tabela `UserSector`

```prisma
model UserSector {
  id        Int      @id @default(autoincrement())
  userId    Int
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  sectorId  Int
  sector    Sector   @relation(fields: [sectorId], references: [id], onDelete: Cascade)
  type      String   // 'member' | 'extra'
  createdAt DateTime @default(now())

  @@unique([userId, sectorId])
  @@index([sectorId])
  @@map("user_sectors")
}
```

> **`@@index([sectorId])`** adicionado porque `GET /api/sectors/:id/users` (seção 4.4) filtra por `sectorId` sem prefixar por `userId` — sem o índice, a query faria full scan da tabela.

### Atualização ao model `User`

```prisma
userSectors UserSector[]
```

### Atualização ao model `Sector`

```prisma
userSectors UserSector[]
```

### Regras de integridade

- `type` aceita apenas `'member'` ou `'extra'` (validado no controller)
- Não é possível adicionar o setor que já é o `sectorId` principal do usuário
- Combinação `(userId, sectorId)` é única

## 4. Backend

### 4.1 Middleware de autenticação (`authenticate.js`)

Estender o `include` do Prisma para carregar `userSectors`:

```js
include: {
  role: { include: { permissions: true, fieldVisibilities: true } },
  userSectors: { select: { sectorId: true, type: true } },
}
```

Adicionar ao objeto `req.user` — com null-guard para compatibilidade com mocks de teste:

```js
req.user.memberSectorIds = (user.userSectors ?? [])
  .filter(us => us.type === 'member')
  .map(us => us.sectorId)
```

> `extraSectorIds` **não** é calculado — a visibilidade de setores 'extra' já é coberta pelo arm `assignedToId: user.id` existente em `ticketVisibilityWhere`, portanto nenhum campo adicional é necessário.

### 4.2 Visibilidade de chamados (`ticketVisibility.js`)

```js
function ticketVisibilityWhere(user) {
  if (user.permissions.has('view_all_tickets')) {
    return {};
  }
  if (user.permissions.has('view_sector_tickets')) {
    const visibleSectorIds = [user.sectorId, ...(user.memberSectorIds ?? [])].filter(Boolean);
    return {
      OR: [
        { sectorId: { in: visibleSectorIds } },
        { assignedToId: user.id },
      ],
    };
  }
  return { requesterId: user.id };
}
```

> O spread usa `?? []` para não quebrar testes existentes que constroem `req.user` sem passar pelo middleware atualizado.

**Atualização obrigatória nos testes existentes (`ticket-visibility-lib.test.js`):** todos os objetos de usuário mock que usam `view_sector_tickets` precisam incluir `memberSectorIds: []`. O assert `{ sectorId: 10 }` vira `{ sectorId: { in: [10] } }`.

### 4.3 Endpoint `GET /api/users` — filtro `?sectorId`

> **Atenção:** `users.routes.js` aplica `requirePermission('manage_users')` globalmente via `router.use()`. Este filtro é para uso administrativo, **não** para o picker do ticket. O picker usa um endpoint separado (seção 4.4).

Estender `users.controller.js::list` para aceitar `?sectorId=X` — quando presente, filtrar por setor principal ou UserSector:

```js
if (sectorId) {
  const sid = Number(sectorId)
  if (isNaN(sid)) return res.status(400).json({ error: 'sectorId inválido.' })
  where.OR = [
    { sectorId: sid },
    { userSectors: { some: { sectorId: sid } } },
  ]
}
```

### 4.4 Novo endpoint público de assignees — `GET /api/sectors/:id/users`

Adicionado a `sectors.controller.js` e `sectors.routes.js`. Requer apenas `authenticate` (sem `manage_users`) — usado pelo picker de atribuição de chamados, acessível a técnicos com `reassign_tickets`.

Retorna usuários cujo setor principal, membro ou extra coincide com `:id`:

```js
async function listSectorUsers(req, res) {
  const id = Number(req.params.id)
  if (isNaN(id)) return res.status(400).json({ error: 'id inválido.' })
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { sectorId: id },
        { userSectors: { some: { sectorId: id } } },
      ],
    },
    select: { id: true, name: true, email: true, sectorId: true },
    orderBy: { name: 'asc' },
  })
  res.json(users)
}
```

Rota (em `sectors.routes.js`, após o `router.use(asyncHandler(authenticate))`):
```js
router.get('/:id/users', asyncHandler(controller.listSectorUsers))
```

### 4.5 Novos endpoints de admin — gestão de setores do usuário

Adicionados a `users.controller.js` e `users.routes.js`. O guard `requirePermission('manage_users')` já está aplicado em `router.use()` nesse arquivo — **não** criar novo módulo `admin/`.

**`GET /api/users/:id/sectors`**
- Verifica que o usuário `:id` existe — 404 se não encontrado
- Retorna `{ primary: { id, name }, sectors: [{ id, name, type }] }`

**`POST /api/users/:id/sectors`**
- Verifica que o usuário `:id` existe — 404 se não encontrado
- Body: `{ sectorId: number, type: 'member' | 'extra' }`
- Validações (em ordem):
  1. `type` não é `'member'` nem `'extra'` → 400 "type inválido."
  2. Setor `sectorId` não existe → 422 "Setor não encontrado."
  3. `sectorId` é o setor principal do usuário → 409 "Este já é o setor principal do usuário."
  4. Combinação `(userId, sectorId)` já existe → 409 "Usuário já pertence a este setor."
- Retorna o registro criado com `include: { sector: { select: { id: true, name: true } } }` → 201

**`PATCH /api/users/:id/sectors/:sid`**
- `:sid` é o `sectorId` (não o ID interno do `UserSector`)
- Verifica que o usuário `:id` existe — 404 se não encontrado
- Verifica que o vínculo `(userId, sid)` existe — 404 "Setor não encontrado para este usuário."
- Body: `{ type: 'member' | 'extra' }`
- Valida `type` — 400 se inválido
- Retorna o registro atualizado → 200

**`DELETE /api/users/:id/sectors/:sid`**
- `:sid` é o `sectorId`
- Verifica que o usuário `:id` existe — 404 se não encontrado
- Verifica que o vínculo `(userId, sid)` existe — 404 "Setor não encontrado para este usuário."
- Remove o vínculo → 204

**Rotas em `users.routes.js`** (o `router.use(authenticate, requirePermission('manage_users'))` já protege tudo):
```js
router.get('/:id/sectors',       asyncHandler(controller.listUserSectors))
router.post('/:id/sectors',      asyncHandler(controller.addUserSector))
router.patch('/:id/sectors/:sid', asyncHandler(controller.updateUserSector))
router.delete('/:id/sectors/:sid', asyncHandler(controller.removeUserSector))
```

### 4.6 Testes (`user-sectors.test.js`)

1. `GET /users/:id/sectors` retorna setor principal + setores vinculados
2. `GET /users/:id/sectors` com userId inexistente → 404
3. `POST` adiciona setor tipo 'member' → 201
4. `POST` adiciona setor tipo 'extra' → 201
5. `POST` com setor principal → 409
6. `POST` duplicado → 409
7. `POST` com sectorId inexistente → 422
8. `PATCH` muda type de 'member' para 'extra' → 200
9. `PATCH` com vínculo inexistente → 404
10. `DELETE` remove vínculo → 204
11. `DELETE` com vínculo inexistente → 404
12. Visibilidade: técnico com setor 'member' enxerga chamados daquele setor na listagem
13. Visibilidade: técnico com setor 'extra' NÃO enxerga chamados daquele setor (só se atribuído)
14. `GET /sectors/:id/users` retorna usuários do setor (principal + member + extra)

## 5. Frontend

### 5.1 AdminUsersPage

Expandir cada linha de usuário para exibir e gerenciar setores adicionais.

**Layout por usuário:**
```
┌────────────────────────────────────────────────────┐
│ Carla Mendes  │  Técnico  │  TI (principal)        │
│               │  [RH — membro ▾] [×]               │
│               │  [Operações — extra ▾] [×]          │
│               │  [+ Adicionar setor]                │
└────────────────────────────────────────────────────┘
```

- **Dropdown de tipo** (`membro` / `extra`) → chama `PATCH /api/users/:id/sectors/:sid` ao mudar
- **Botão `×`** → chama `DELETE` após confirmação inline (sem modal)
- **`+ Adicionar setor`** → exibe um select com setores disponíveis (excluindo principal e já vinculados) + radio `membro / extra` + botão "Adicionar"
- Todos os estados de loading com `disabled` nos botões

### 5.2 Picker de atribuição no TicketDetailPage

Alterar o select de responsável para filtrar por setor do chamado, usando o novo endpoint:

```js
// Em frontend/src/api/sectors.js (ou novo arquivo):
listSectorUsers: (sectorId) =>
  api.get(`/api/sectors/${sectorId}/users`).then(r => r.data)
```

No componente, trocar a query para usar `listSectorUsers(ticket.sector?.id ?? ticket.sectorId)`.

### 5.3 Arquivos modificados/criados

| Arquivo | Ação |
|---|---|
| `backend/prisma/schema.prisma` | Adicionar model `UserSector` + relação em `User` e `Sector` |
| `backend/prisma/migrations/...` | Migration gerada via `npx prisma migrate dev` |
| `backend/src/middleware/authenticate.js` | Incluir `userSectors` no load; calcular `memberSectorIds` com null-guard |
| `backend/src/lib/ticketVisibility.js` | Usar `memberSectorIds ?? []` na query OR |
| `backend/tests/ticket-visibility-lib.test.js` | Atualizar mocks de usuário: adicionar `memberSectorIds: []`; atualizar asserts |
| `backend/src/modules/users/users.controller.js` | Adicionar filtro `?sectorId` ao `list`; adicionar 4 handlers de UserSector |
| `backend/src/modules/users/users.routes.js` | Registrar 4 novas rotas de setores do usuário |
| `backend/src/modules/sectors/sectors.controller.js` | Adicionar `listSectorUsers` |
| `backend/src/modules/sectors/sectors.routes.js` | Registrar `GET /:id/users` |
| `backend/tests/user-sectors.test.js` | Criar — 14 testes |
| `frontend/src/pages/admin/AdminUsersPage.jsx` | Expandir com gestão de setores por usuário |
| `frontend/src/api/sectors.js` (ou existente) | Adicionar `listSectorUsers(sectorId)` |
| `frontend/src/pages/tickets/TicketDetailPage.jsx` | Usar `listSectorUsers` no picker de responsável |

## 6. Ordem de implementação

1. Migration + `prisma generate`
2. Middleware de autenticação — carregar `userSectors`, expor `memberSectorIds`
3. `ticketVisibilityWhere` — usar `memberSectorIds ?? []`; atualizar testes existentes
4. `GET /api/users?sectorId` — filtro admin
5. `GET /api/sectors/:id/users` — endpoint de picker (sectors.controller.js)
6. Handlers de admin em `users.controller.js` + rotas em `users.routes.js` + testes
7. Frontend — AdminUsersPage com gestão de setores
8. Frontend — picker de responsável usando `listSectorUsers`
