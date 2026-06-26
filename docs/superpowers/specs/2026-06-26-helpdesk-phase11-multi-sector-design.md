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
- **Permissão relevante:** `manage_users` — protege todos os endpoints de admin de setores

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
  @@map("user_sectors")
}
```

### Atualização ao model `User`

```prisma
userSectors UserSector[]
```

### Atualização ao model `Sector`

```prisma
userSectors UserSector[]
```

### Regras de integridade

- `type` aceita apenas `'member'` ou `'extra'` (validado no controller, não via enum Prisma para manter compatibilidade com PostgreSQL sem migration de enum)
- Não é possível adicionar o setor que já é o `sectorId` principal do usuário
- Combinação `(userId, sectorId)` é única

## 4. Backend

### 4.1 Middleware de autenticação

O middleware `authenticate.js` já carrega o usuário e suas permissões. Estender o `include` do Prisma para carregar `userSectors`:

```js
include: {
  role: { include: { permissions: true, fieldVisibilities: true } },
  userSectors: { select: { sectorId: true, type: true } },
}
```

Adicionar ao objeto `req.user`:

```js
req.user.memberSectorIds = user.userSectors
  .filter(us => us.type === 'member')
  .map(us => us.sectorId)

req.user.extraSectorIds = user.userSectors
  .filter(us => us.type === 'extra')
  .map(us => us.sectorId)
```

### 4.2 Visibilidade de chamados (`ticketVisibility.js`)

```js
function ticketVisibilityWhere(user) {
  if (user.permissions.has('view_all_tickets')) {
    return {};
  }
  if (user.permissions.has('view_sector_tickets')) {
    const visibleSectorIds = [user.sectorId, ...user.memberSectorIds].filter(Boolean);
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

### 4.3 Endpoint `GET /api/users` — novo query param `sectorId`

Estender o endpoint existente de listagem de usuários para aceitar `?sectorId=X`. Quando presente, retorna usuários que têm aquele setor como principal (`sectorId`), membro ou extra (`userSectors`):

```js
// Filtro adicional quando sectorId presente:
where: {
  OR: [
    { sectorId: Number(sectorId) },
    { userSectors: { some: { sectorId: Number(sectorId) } } },
  ],
}
```

### 4.4 Novos endpoints de admin

Todos protegidos por `authenticate` + verificação de `manage_users`.

**`GET /api/admin/users/:id/sectors`**
- Retorna `{ primary: { id, name }, sectors: [{ id, name, type }] }`

**`POST /api/admin/users/:id/sectors`**
- Body: `{ sectorId: number, type: 'member' | 'extra' }`
- Validações:
  - `type` deve ser `'member'` ou `'extra'`
  - `sectorId` não pode ser o setor principal do usuário → 409 "Este já é o setor principal do usuário."
  - Combinação `(userId, sectorId)` já existe → 409 "Usuário já pertence a este setor."
- Retorna o registro criado com `include: { sector: { select: { id, name } } }` → 201

**`PATCH /api/admin/users/:id/sectors/:sid`**
- `:sid` é o `sectorId` (não o ID interno do registro `UserSector`)
- Body: `{ type: 'member' | 'extra' }`
- Altera o tipo sem remover o vínculo
- Retorna o registro atualizado → 200

**`DELETE /api/admin/users/:id/sectors/:sid`**
- `:sid` é o `sectorId`
- Remove o vínculo
- Retorna 204

### 4.5 Rotas

```js
// Em admin.routes.js ou users.routes.js (seguir padrão existente):
router.get('/admin/users/:id/sectors',          authenticated, asyncHandler(controller.listUserSectors))
router.post('/admin/users/:id/sectors',          authenticated, asyncHandler(controller.addUserSector))
router.patch('/admin/users/:id/sectors/:sid',    authenticated, asyncHandler(controller.updateUserSector))
router.delete('/admin/users/:id/sectors/:sid',   authenticated, asyncHandler(controller.removeUserSector))
```

### 4.6 Testes (`user-sectors.test.js`)

1. `GET /admin/users/:id/sectors` retorna setor principal + setores extras
2. `POST` adiciona setor tipo 'member' → 201
3. `POST` adiciona setor tipo 'extra' → 201
4. `POST` com setor principal → 409
5. `POST` duplicado → 409
6. `PATCH` muda type de 'member' para 'extra' → 200
7. `DELETE` remove vínculo → 204
8. Visibilidade: técnico com setor 'member' enxerga chamados daquele setor na listagem
9. Visibilidade: técnico com setor 'extra' NÃO enxerga chamados daquele setor (só se atribuído)

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

- **Dropdown de tipo** (`membro` / `extra`) → chama `PATCH /api/admin/users/:id/sectors/:sid` ao mudar
- **Botão `×`** → chama `DELETE` após confirmação inline (sem modal)
- **`+ Adicionar setor`** → exibe um select com setores disponíveis (excluindo principal e já vinculados) + radio `membro / extra` + botão "Adicionar"
- Todos os estados de loading com `disabled` nos botões

### 5.2 Picker de atribuição no TicketDetailPage

Atualmente o select de responsável carrega todos os usuários. Alterar para passar `sectorId` do chamado:

```js
// Em tickets.js API client:
listAssignees: (sectorId) =>
  api.get('/api/users', { params: { sectorId } }).then(r => r.data)
```

No componente, trocar a query para usar `listAssignees(ticket.sector?.id ?? ticket.sectorId)`.

### 5.3 Arquivos modificados/criados

| Arquivo | Ação |
|---|---|
| `backend/prisma/schema.prisma` | Adicionar model `UserSector` + relação em `User` e `Sector` |
| `backend/prisma/migrations/...` | Migration gerada via `npx prisma migrate dev` |
| `backend/src/middleware/authenticate.js` | Incluir `userSectors` no load; calcular `memberSectorIds` e `extraSectorIds` |
| `backend/src/lib/ticketVisibility.js` | Usar `memberSectorIds` na query OR |
| `backend/src/modules/users/users.controller.js` | Adicionar filtro `?sectorId` ao `list` |
| `backend/src/modules/admin/userSectors.controller.js` | Criar — 4 handlers |
| `backend/src/modules/admin/admin.routes.js` (ou similar) | Registrar 4 rotas |
| `backend/tests/user-sectors.test.js` | Criar — 9 testes |
| `frontend/src/pages/admin/AdminUsersPage.jsx` | Expandir com gestão de setores por usuário |
| `frontend/src/api/tickets.js` | Adicionar `listAssignees(sectorId)` |
| `frontend/src/pages/tickets/TicketDetailPage.jsx` | Usar `listAssignees` no picker de responsável |

## 6. Ordem de implementação

1. Migration + `prisma generate`
2. Middleware de autenticação — carregar `userSectors`, expor `memberSectorIds`
3. `ticketVisibilityWhere` — usar `memberSectorIds`
4. `GET /api/users?sectorId` — filtro novo
5. Controller + rotas de admin de setores + testes
6. Frontend — AdminUsersPage com gestão de setores
7. Frontend — picker de responsável filtrado por setor
