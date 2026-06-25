# Fase 5 — Módulo de Ideias e Sugestões (Backend)

Data: 2026-06-25

## 1. Visão geral

Fase 5 adiciona um canal interno de sugestões de melhoria de processos. Qualquer colaborador autenticado pode submeter ideias. Um gestor faz a triagem e abre para discussão e votação. A comunidade vota nas ideias abertas. O gestor decide implementar ou descartar.

Nenhum frontend é criado nesta fase — a interface virá em fase posterior.

## 2. Escopo

**Incluído:**
- Submissão de ideias com título e descrição
- Fluxo de status em 3 etapas: triagem → discussão/votação → decisão final
- Toggle de voto (1 por usuário por ideia, reversível)
- Visibilidade controlada por status (PENDENTE só para autor + gestores)
- Permissão `manage_ideas` para triagem e mudança de status
- Testes de integração contra Postgres real

**Excluído:**
- Comentários/threads de discussão (fase futura)
- Categorias/tags de ideias (fase futura)
- Notificações ao autor (fase futura)
- Frontend/UI

## 3. Modelo de dados

### Enum IdeaStatus

```prisma
enum IdeaStatus {
  PENDENTE
  EM_DISCUSSAO
  APROVADA
  IMPLEMENTADA
  DESCARTADA
}
```

### Model Idea

```prisma
model Idea {
  id          Int        @id @default(autoincrement())
  title       String
  description String
  authorId    Int
  status      IdeaStatus @default(PENDENTE)
  managerNote String?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  author User      @relation("AuthoredIdeas", fields: [authorId], references: [id])
  votes  IdeaVote[]

  @@map("ideas")
}
```

### Model IdeaVote

```prisma
model IdeaVote {
  id     Int @id @default(autoincrement())
  ideaId Int
  userId Int

  idea Idea @relation(fields: [ideaId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id])

  @@unique([ideaId, userId])
  @@map("idea_votes")
}
```

`User` recebe relações inversas:
```prisma
authoredIdeas Idea[]     @relation("AuthoredIdeas")
ideaVotes     IdeaVote[]
```

### Transições de status permitidas

| De | Para | Quem |
|----|------|------|
| PENDENTE | EM_DISCUSSAO | manage_ideas |
| PENDENTE | DESCARTADA | manage_ideas |
| EM_DISCUSSAO | APROVADA | manage_ideas |
| EM_DISCUSSAO | DESCARTADA | manage_ideas |
| APROVADA | IMPLEMENTADA | manage_ideas |
| APROVADA | DESCARTADA | manage_ideas |

Qualquer outra transição → 400 com mensagem de erro.

## 4. Permissões

### Nova chave

`manage_ideas` — adicionada a `PERMISSION_KEYS` em `backend/src/lib/permissions.js` e ao `rolePermissionMatrix` do seed para Gestor e Admin.

### Matriz de acesso

| Ação | Técnico | Gestor | Admin | Usuário Final |
|------|---------|--------|-------|---------------|
| Submeter ideia | ✅ | ✅ | ✅ | ✅ |
| Ver ideias EM_DISCUSSAO/APROVADA/IMPLEMENTADA/DESCARTADA | ✅ | ✅ | ✅ | ✅ |
| Ver ideia PENDENTE (própria) | ✅ | ✅ | ✅ | ✅ |
| Ver ideia PENDENTE (outros) | ❌ | ✅ | ✅ | ❌ |
| Votar (em EM_DISCUSSAO) | ✅ | ✅ | ✅ | ✅ |
| Mudar status / nota | ❌ | ✅ | ✅ | ❌ |

## 5. Endpoints

### 5.1 POST /api/ideas

**Auth:** qualquer autenticado

**Body:**
```json
{ "title": "string (obrigatório)", "description": "string (obrigatório)" }
```

**Validações:** `title` e `description` não podem ser vazios → 400.

**Resposta 201:** objeto ideia serializado (ver §6).

**Status inicial:** sempre `PENDENTE`. `authorId` = `req.user.id`.

---

### 5.2 GET /api/ideas

**Auth:** qualquer autenticado

**Query params:**
| Param | Tipo | Descrição |
|-------|------|-----------|
| `status` | IdeaStatus | Filtro opcional por status |

**Visibilidade (aplicada antes de qualquer filtro de query):**
- Usuário com `manage_ideas`: vê todas as ideias independente de status
- Outros usuários: veem ideias com status `EM_DISCUSSAO`, `APROVADA`, `IMPLEMENTADA`, `DESCARTADA` + suas próprias `PENDENTE`

Se um usuário sem `manage_ideas` filtrar `status=PENDENTE`, receberá apenas suas próprias ideias pendentes (resultado possivelmente vazio — nunca 403).

**Resposta 200:** array de ideias serializadas, ordenadas por `createdAt` desc.

---

### 5.3 GET /api/ideas/:id

**Auth:** qualquer autenticado

**Visibilidade:**
- Ideia inexistente → 404
- Ideia `PENDENTE` de outro usuário sem `manage_ideas` → 403
- Caso contrário → 200

**Resposta 200:** objeto ideia serializado.

---

### 5.4 PATCH /api/ideas/:id/status

**Auth:** `manage_ideas`

**Body:**
```json
{
  "status": "EM_DISCUSSAO | APROVADA | IMPLEMENTADA | DESCARTADA",
  "managerNote": "string opcional"
}
```

**Validações:**
- `status` ausente → 400
- Transição inválida → 400 com mensagem `"Transição de status não permitida: {de} → {para}."`
- Ideia inexistente → 404

**Resposta 200:** objeto ideia atualizado.

---

### 5.5 POST /api/ideas/:id/vote

**Auth:** qualquer autenticado

**Comportamento (toggle):**
- Se o usuário ainda não votou nessa ideia → cria voto → responde com `{ voted: true, voteCount: N }`
- Se o usuário já votou → remove voto → responde com `{ voted: false, voteCount: N }`

**Validações:**
- Ideia inexistente → 404
- Ideia com status diferente de `EM_DISCUSSAO` → 400 com mensagem `"Só é possível votar em ideias em discussão."`
- Visibilidade: se a ideia está em status que o usuário não pode ver (PENDENTE de outro) → 403

**Resposta 200:** `{ voted: boolean, voteCount: number }`

## 6. Serialização da ideia

Todos os endpoints que retornam uma ideia usam este shape:

```json
{
  "id": 1,
  "title": "Implementar daily standup",
  "description": "Reunião diária de 15 min para alinhar a equipe...",
  "status": "EM_DISCUSSAO",
  "managerNote": null,
  "authorId": 3,
  "authorName": "João Silva",
  "voteCount": 7,
  "userHasVoted": true,
  "createdAt": "2026-06-25T10:00:00.000Z",
  "updatedAt": "2026-06-25T11:30:00.000Z"
}
```

`voteCount`: total de votos (count de IdeaVote para essa ideia).
`userHasVoted`: boolean — se `req.user.id` tem um IdeaVote para essa ideia.

## 7. Arquitetura

```
backend/src/modules/ideas/
  ideas.controller.js    (list, detail, create, updateStatus, toggleVote)
  ideas.routes.js        (per-route auth — nunca router.use())
backend/prisma/
  schema.prisma          (+ Idea, IdeaVote, IdeaStatus, relações em User)
  migrations/            (gerada via prisma migrate dev --name add_ideas)
backend/tests/
  ideas-api.test.js      (~12 testes de integração)
```

`backend/src/server.js` recebe `app.use('/api', ideasRoutes)`.
`backend/src/lib/permissions.js` recebe `'manage_ideas'` em `PERMISSION_KEYS`.
`backend/prisma/seed.js` recebe `manage_ideas` no `rolePermissionMatrix` de Gestor e Admin.

### Padrão de auth por rota

```js
const auth = [asyncHandler(authenticate), requirePermission('manage_ideas')];
const authenticated = asyncHandler(authenticate);

router.post('/ideas', authenticated, asyncHandler(controller.create));
router.get('/ideas', authenticated, asyncHandler(controller.list));
router.get('/ideas/:id', authenticated, asyncHandler(controller.detail));
router.patch('/ideas/:id/status', ...auth, asyncHandler(controller.updateStatus));
router.post('/ideas/:id/vote', authenticated, asyncHandler(controller.toggleVote));
```

## 8. Testes de integração (~12)

**Setup (beforeAll):** cria setor, role com `manage_ideas` (gestor), role sem `manage_ideas` (técnico), role sem `manage_ideas` (usuário final), 3 usuários, 1 ideia PENDENTE por padrão.

**Casos:**
1. `POST /ideas` cria ideia com status PENDENTE e authorId correto
2. `POST /ideas` sem title → 400
3. `GET /ideas` — autor vê própria PENDENTE; outro usuário sem manage_ideas não vê
4. `GET /ideas` — todos veem após status EM_DISCUSSAO
5. `GET /ideas?status=PENDENTE` — gestor vê todas pendentes; técnico sem manage_ideas vê apenas as próprias (resultado vazio se não tiver criado nenhuma)
6. `GET /ideas/:id` — 404 para inexistente
7. `GET /ideas/:id` — 403 para PENDENTE de outro usuário sem manage_ideas
8. `PATCH /ideas/:id/status` — PENDENTE → EM_DISCUSSAO com managerNote (gestor)
9. `PATCH /ideas/:id/status` — transição inválida → 400
10. `PATCH /ideas/:id/status` — sem manage_ideas → 403
11. `POST /ideas/:id/vote` — vota em EM_DISCUSSAO; voteCount sobe, voted=true
12. `POST /ideas/:id/vote` — toggle desvota; voteCount cai, voted=false
13. `POST /ideas/:id/vote` — ideia PENDENTE → 400

## 9. Ordem de implementação

1. Adicionar `manage_ideas` a `permissions.js` e `seed.js`
2. Adicionar models `Idea`, `IdeaVote`, enum `IdeaStatus` ao schema + relações em `User` + rodar migration
3. Criar `ideas.controller.js` + `ideas.routes.js` + montar em `server.js`
4. Criar `ideas-api.test.js` e rodar suite completa
