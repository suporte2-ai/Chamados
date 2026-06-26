# Helpdesk Phase 10 — Polish, Comentários em Ideias e Perfil de Usuário — Design

Data: 2026-06-26

## 1. Visão geral

Três entregas complementares que completam a experiência do produto:

1. **Enriquecimento da API de tickets** — substituir IDs crus (`requesterId`, `sectorId`, `assignedToId`, autores de comentários) por objetos com `name`, tanto no detalhe quanto na listagem.
2. **Comentários em ideias** — adicionar o sub-recurso `IdeaComment` ao backend e a seção de comentários ao `IdeaDetailPage`.
3. **Página de perfil do usuário** — permitir que qualquer usuário edite seu nome, senha e e-mail (este último com verificação por link).

## 2. Stack e convenções

Inalteradas das fases anteriores:
- **Backend:** Node.js + Express + Prisma + PostgreSQL, porta 4000
- **Frontend:** React 18, Vite 5, Tailwind CSS 3, shadcn/ui, React Router v6, Zustand 4, TanStack Query v5, Axios 1
- **Auth:** JWT access token em variável de módulo, refresh via cookie httpOnly
- **API client pattern:** `export const xApi = { method: (params) => api.verb('/path').then(r => r.data) }`
- **Erro:** `toast.error(err.response?.data?.error || 'mensagem padrão')`
- **Testes:** Vitest + Testing Library (frontend 5/5), Jest + Supertest (backend 172/172)

## 3. Seção 1 — Enriquecimento da API de Tickets

### 3.1 Backend

**`backend/src/modules/tickets/tickets.controller.js`**

Adicionar `include` às queries Prisma de `list` e `detail`:

```js
// Em list — findMany:
include: {
  sector: { select: { name: true } },
}

// Em detail — findUnique e findFirst:
include: {
  requester: { select: { id: true, name: true } },
  sector:    { select: { name: true } },
  assignedTo: { select: { id: true, name: true } },
}
```

`ticketComments.controller.js` — ao buscar comentários em `detail`, adicionar:
```js
include: { author: { select: { id: true, name: true } } }
```

A função `serializeTicket` continua sem alterações — apenas passa adiante os campos incluídos pelo Prisma junto ao spread. Os campos antigos (`requesterId`, `sectorId`, `assignedToId`) permanecem na resposta (Prisma os retorna por padrão).

### 3.2 Frontend

**`TicketDetailPage.jsx`** — substituir:
- `Usuário #${ticket.requesterId}` → `ticket.requester?.name ?? '—'`
- `Setor #${ticket.sectorId}` → `ticket.sector?.name ?? '—'`
- `Usuário #${ticket.assignedToId}` (opção somente-leitura) → `ticket.assignedTo?.name ?? '— Não atribuído —'`
- Comentários: exibir `c.author?.name ?? 'Usuário'` + data em vez de apenas o corpo

**`TicketListPage.jsx`** — substituir `t.sectorId` → `t.sector?.name ?? '—'` na coluna Setor.

### 3.3 Testes

Verificar que `GET /api/tickets/:id` retorna `requester.name`, `sector.name`, `assignedTo` (quando presente) e que cada comentário contém `author.name`. Nenhum novo arquivo de teste necessário — ampliar o teste existente `tickets-api.test.js`.

## 4. Seção 2 — Comentários em Ideias

### 4.1 Backend

**Novos endpoints em `ideas.routes.js`:**
```
POST   /api/ideas/:id/comments        — authenticated
DELETE /api/ideas/:id/comments/:cid  — authenticated (só autor)
```

**`ideas.controller.js`** — dois novos métodos:

`addComment(req, res)`:
- Valida `body` obrigatório (non-empty string)
- `prisma.ideaComment.create({ data: { ideaId, authorId: req.user.id, body } })`
- Retorna o comentário criado com `include: { author: { select: { id, name } } }`
- HTTP 201

`deleteComment(req, res)`:
- Busca o comentário pelo `id` (`req.params.cid`)
- Se não existir → 404
- Se `comment.authorId !== req.user.id` → 403 ("Você não pode excluir este comentário.")
- `prisma.ideaComment.delete({ where: { id } })`
- HTTP 204

**`ideas.controller.js` — método `detail`:** adicionar `include` para comentários:
```js
const comments = await prisma.ideaComment.findMany({
  where: { ideaId: id },
  orderBy: { createdAt: 'asc' },
  include: { author: { select: { id: true, name: true } } },
})
// Retornar junto ao objeto idea: { ...idea, voteCount, userHasVoted, comments }
```

### 4.2 Frontend

**`frontend/src/api/ideas.js`** — dois novos métodos:
```js
addComment: (id, body) => api.post(`/api/ideas/${id}/comments`, { body }).then(r => r.data),
deleteComment: (ideaId, cid) => api.delete(`/api/ideas/${ideaId}/comments/${cid}`),
```

**`IdeaDetailPage.jsx`** — nova seção abaixo do painel principal:

```
┌─────────────────────────────┐
│ Comentários (N)             │
│ ─────────────────────────── │
│ [Avatar] Nome · há 2h       │
│ Texto do comentário         │
│                    [Excluir]│ ← visível só para o autor
│ ─────────────────────────── │
│ [Textarea placeholder]      │
│              [Comentar]     │
└─────────────────────────────┘
```

- `useQuery(['ideas', id])` já busca o detalhe incluindo comentários — refetch após mutação
- `useMutation` para adicionar comentário: `onSuccess` → invalidar `['ideas', id]`, limpar textarea
- `useMutation` para excluir: `onSuccess` → invalidar `['ideas', id]`
- Botão excluir visível somente quando `comment.author.id === user?.id`
- Estado vazio: "Seja o primeiro a comentar."

### 4.3 Testes

Criar `backend/tests/idea-comments.test.js`:
- POST cria comentário e retorna `author.name`
- POST com body vazio → 400
- DELETE pelo próprio autor → 204
- DELETE por outro usuário → 403
- DELETE de comentário inexistente → 404
- GET `/ideas/:id` inclui array `comments` na resposta

## 5. Seção 3 — Página de Perfil do Usuário

### 5.1 Backend — modelo de dados

**Nova tabela `EmailChangeToken`** (migration necessária):
```prisma
model EmailChangeToken {
  id        Int       @id @default(autoincrement())
  userId    Int
  user      User      @relation(fields: [userId], references: [id])
  newEmail  String
  token     String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())
}
```

### 5.2 Backend — novos endpoints

Todos em `auth.routes.js`, protegidos por `authenticate`:

**`PATCH /api/auth/me`**

Dois casos de uso independentes (o cliente pode enviar um ou os dois):

- Atualizar nome: `{ name: string }` — valida non-empty, atualiza `user.name`
- Trocar senha: `{ currentPassword, newPassword }` — valida que `currentPassword` bate com o hash atual (bcrypt.compare), faz hash do `newPassword`, atualiza `user.passwordHash`
- Retorna o usuário atualizado: `{ id, name, email, roleId, sectorId }`

**`POST /api/auth/request-email-change`**

- Body: `{ newEmail: string }`
- Valida formato de e-mail
- Verifica que `newEmail` não está em uso por outro usuário (`user.email` case-insensitive)
- Invalida tokens anteriores do mesmo usuário (soft: apenas `usedAt = now()`)
- Gera token UUID, cria `EmailChangeToken` com `expiresAt = now() + 1h`
- Envia e-mail com link: `${FRONTEND_URL}/confirmar-email/${token}`
- Se SMTP não configurado: loga link no console (mesmo comportamento do reset de senha)
- Retorna `{ message: 'Link de confirmação enviado para <newEmail>.' }`

**`GET /api/auth/confirm-email-change/:token`**

- Busca `EmailChangeToken` pelo token
- Se não existe / `usedAt` preenchido / `expiresAt < now()` → 400 com mensagem adequada
- Verifica que `newEmail` ainda não está em uso (outro usuário pode ter criado o e-mail entre a solicitação e a confirmação)
- `user.email = token.newEmail`, `token.usedAt = now()`
- Retorna `{ message: 'E-mail atualizado com sucesso.' }`

### 5.3 Frontend — novas páginas e rotas

**`frontend/src/pages/ProfilePage.jsx`** (`/perfil`):

Três seções independentes com cards separados:

1. **Dados pessoais**
   - Campo: Nome (pré-preenchido com `user.name` do store)
   - Campo: E-mail atual (read-only, cinza)
   - Botão "Salvar nome" → `PATCH /api/auth/me` com `{ name }`
   - `onSuccess` → atualiza o store Zustand via `setAuth` (re-fetch do `/api/auth/me`)

2. **Alterar senha**
   - Campos: Senha atual, Nova senha, Confirmar nova senha
   - Validação no frontend: nova senha ≥ 8 caracteres, confirmação bate
   - Botão "Alterar senha" → `PATCH /api/auth/me` com `{ currentPassword, newPassword }`
   - `onSuccess` → toast "Senha alterada com sucesso."

3. **Alterar e-mail**
   - Campo: Novo e-mail
   - Botão "Enviar link de confirmação" → `POST /api/auth/request-email-change`
   - `onSuccess` → exibe mensagem inline: "Link enviado para <newEmail>. Verifique sua caixa de entrada."

**`frontend/src/pages/auth/ConfirmEmailChangePage.jsx`** (`/confirmar-email/:token`):
- Ao montar, chama `GET /api/auth/confirm-email-change/:token`
- Loading: spinner / "Verificando..."
- Sucesso: "E-mail atualizado com sucesso!" + botão "Ir para meu perfil"
- Erro: mensagem de erro + botão "Ir para meu perfil"
- Após sucesso: invalidar query do usuário (ou fazer logout + redirecionar para login, pois o e-mail mudou)

**`frontend/src/api/auth.js`** — três novos métodos:
```js
updateMe: (body) => api.patch('/api/auth/me', body).then(r => r.data),
requestEmailChange: (newEmail) => api.post('/api/auth/request-email-change', { newEmail }).then(r => r.data),
confirmEmailChange: (token) => api.get(`/api/auth/confirm-email-change/${token}`).then(r => r.data),
```

**Navegação:** o `Header` já tem um `DropdownMenu` com avatar e "Sair". Basta adicionar um `DropdownMenuItem` "Meu perfil" (→ `/perfil`) antes do `DropdownMenuSeparator` existente. Também atualizar o objeto `BREADCRUMBS` para incluir `/perfil → 'Meu Perfil'`.

**Rotas novas em `App.jsx`:**
```jsx
{ path: 'perfil', element: <Suspense ...><ProfilePage /></Suspense> }
// Rota pública (fora do ProtectedRoute, igual às de auth):
{ path: '/confirmar-email/:token', element: <ConfirmEmailChangePage /> }
```

### 5.4 Testes

Criar `backend/tests/profile-api.test.js`:
- `PATCH /api/auth/me` com `{ name }` → 200, name atualizado
- `PATCH /api/auth/me` com `{ currentPassword, newPassword }` correto → 200
- `PATCH /api/auth/me` com senha atual errada → 400
- `POST /api/auth/request-email-change` com e-mail já em uso → 409
- `POST /api/auth/request-email-change` com e-mail novo → 200, token criado no banco
- `GET /api/auth/confirm-email-change/:token` válido → 200, e-mail atualizado
- `GET /api/auth/confirm-email-change/:token` expirado → 400
- `GET /api/auth/confirm-email-change/:token` já usado → 400

## 6. Arquivos criados e modificados

### Backend

| Arquivo | Ação |
|---|---|
| `backend/prisma/schema.prisma` | Adicionar model `EmailChangeToken` |
| `backend/prisma/migrations/...` | Migration gerada via `npx prisma migrate dev` |
| `backend/src/modules/tickets/tickets.controller.js` | Adicionar `include` em `list` e `detail` |
| `backend/src/modules/tickets/ticketComments.controller.js` | Adicionar `include: { author }` na busca de comentários em `detail` |
| `backend/src/modules/ideas/ideas.controller.js` | Adicionar `addComment`, `deleteComment`, enriquecer `detail` com `comments` |
| `backend/src/modules/ideas/ideas.routes.js` | Registrar POST e DELETE de comentários |
| `backend/src/modules/auth/auth.controller.js` | Adicionar `updateMe`, `requestEmailChange`, `confirmEmailChange` |
| `backend/src/modules/auth/auth.routes.js` | Registrar PATCH `/me`, POST `/request-email-change`, GET `/confirm-email-change/:token` |
| `backend/tests/idea-comments.test.js` | Criar (6 testes) |
| `backend/tests/profile-api.test.js` | Criar (8 testes) |

### Frontend

| Arquivo | Ação |
|---|---|
| `frontend/src/api/auth.js` | Adicionar `updateMe`, `requestEmailChange`, `confirmEmailChange` |
| `frontend/src/api/ideas.js` | Adicionar `addComment`, `deleteComment` |
| `frontend/src/pages/tickets/TicketDetailPage.jsx` | Usar nomes dos objetos enriquecidos |
| `frontend/src/pages/tickets/TicketListPage.jsx` | Usar `sector.name` |
| `frontend/src/pages/ideas/IdeaDetailPage.jsx` | Adicionar seção de comentários |
| `frontend/src/pages/ProfilePage.jsx` | Criar |
| `frontend/src/pages/auth/ConfirmEmailChangePage.jsx` | Criar |
| `frontend/src/components/layout/Header.jsx` | Trocar botão logout por dropdown com "Meu perfil" + "Sair" |
| `frontend/src/App.jsx` | Adicionar rotas `/perfil` e `/confirmar-email/:token` |

## 7. Ordem de implementação recomendada

1. Migration `EmailChangeToken` + `prisma generate`
2. Backend: enriquecer tickets (`include` em `list` e `detail`) + testes
3. Backend: idea comments (controller + routes) + testes
4. Backend: profile endpoints (`PATCH /me`, email change) + testes
5. Frontend: atualizar `TicketDetailPage` e `TicketListPage` com nomes
6. Frontend: seção de comentários em `IdeaDetailPage`
7. Frontend: `ProfilePage` + `ConfirmEmailChangePage`
8. Frontend: dropdown no `Header` + rotas em `App.jsx`
