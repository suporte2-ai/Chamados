# Fase 5 — Módulo de Ideias e Sugestões (Backend)

Data: 2026-06-25

## 1. Visão geral

Fase 5 implementa a API do canal interno de sugestões de melhoria de processos. Qualquer colaborador autenticado pode submeter ideias. Um gestor faz a triagem e abre para discussão e votação. A comunidade vota nas ideias abertas. O gestor decide implementar ou arquivar.

O schema Prisma já contém os modelos `Idea`, `IdeaVote`, `IdeaComment`, `IdeaStatus` e `Notification` (migration `20260622181545_add_ideas`). Esta fase **não altera** esses modelos — apenas adiciona o campo `managerNote` via migration aditiva e implementa a API.

Nenhum frontend é criado nesta fase.

## 2. Escopo

**Incluído:**
- Submissão de ideias com título, descrição, área impactada, benefício esperado e flag de anonimato
- Fluxo de status em 3 etapas: triagem → discussão/votação → decisão final
- Toggle de voto (1 por usuário por ideia, reversível, só em `EM_ANALISE`)
- Visibilidade controlada por status (`NOVA` só para autor + gestores)
- Permissão `manage_ideas` para triagem e mudança de status
- Campo `managerNote` adicionado via migration aditiva
- Testes de integração contra Postgres real

**Excluído:**
- API de comentários (`IdeaComment` existe no schema mas sem endpoints nesta fase)
- API de notificações (`Notification` existe no schema — fase futura)
- Frontend/UI

## 3. Modelo de dados existente

O schema já define (não alterar):

```prisma
enum IdeaStatus {
  NOVA           // recém submetida, só autor + gestores veem
  EM_ANALISE     // gestor aprovou para discussão, votação aberta
  APROVADA       // gestor decidiu implementar
  EM_IMPLEMENTACAO // em andamento
  IMPLEMENTADA   // concluída
  ARQUIVADA      // descartada/cancelada em qualquer etapa
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
```

### Migration aditiva (nova)

Adicionar coluna `managerNote` ao modelo `Idea`:

```prisma
managerNote String?   // nota do gestor ao mover o status
```

Migration: `prisma migrate dev --name add_idea_manager_note`

### Transições de status permitidas

| De | Para | Quem |
|----|------|------|
| NOVA | EM_ANALISE | manage_ideas |
| NOVA | ARQUIVADA | manage_ideas |
| EM_ANALISE | APROVADA | manage_ideas |
| EM_ANALISE | ARQUIVADA | manage_ideas |
| APROVADA | EM_IMPLEMENTACAO | manage_ideas |
| APROVADA | ARQUIVADA | manage_ideas |
| EM_IMPLEMENTACAO | IMPLEMENTADA | manage_ideas |
| EM_IMPLEMENTACAO | ARQUIVADA | manage_ideas |

Qualquer outra transição → 400 com `"Transição de status não permitida: {de} → {para}."`.

## 4. Permissões

### Nova chave

`manage_ideas` — adicionada a `PERMISSION_KEYS` em `backend/src/lib/permissions.js` e ao `rolePermissionMatrix` do seed para Gestor e Admin.

**Nota:** o banco de desenvolvimento já existente não terá as linhas de `RolePermission` para `manage_ideas` até que `npm run seed` seja re-executado. A task de implementação deve incluir esse passo.

### Matriz de acesso

| Ação | Técnico | Gestor | Admin | Usuário Final |
|------|---------|--------|-------|---------------|
| Submeter ideia | ✅ | ✅ | ✅ | ✅ |
| Ver ideias não-NOVA | ✅ | ✅ | ✅ | ✅ |
| Ver ideia NOVA (própria) | ✅ | ✅ | ✅ | ✅ |
| Ver ideia NOVA (outros) | ❌ | ✅ | ✅ | ❌ |
| Votar (em EM_ANALISE) | ✅ | ✅ | ✅ | ✅ |
| Mudar status / nota | ❌ | ✅ | ✅ | ❌ |

## 5. Endpoints

### 5.1 POST /api/ideas

**Auth:** qualquer autenticado

**Body:**
```json
{
  "title": "string (obrigatório)",
  "description": "string (obrigatório)",
  "areaImpacted": "string (obrigatório)",
  "expectedBenefit": "string (obrigatório)",
  "isAnonymous": false
}
```

**Validações:** `title`, `description`, `areaImpacted`, `expectedBenefit` não podem ser vazios → 400. `isAnonymous` padrão `false` se omitido.

**Resposta 201:** objeto ideia serializado (ver §6).

**Status inicial:** sempre `NOVA`. `authorId` = `req.user.id`.

---

### 5.2 GET /api/ideas

**Auth:** qualquer autenticado

**Query params:**
| Param | Tipo | Descrição |
|-------|------|-----------|
| `status` | IdeaStatus | Filtro opcional. Deve ser um dos valores do enum — caso contrário → 400. |

**Visibilidade (aplicada antes do filtro):**
- Usuário com `manage_ideas`: vê todas as ideias
- Outros: veem ideias com status diferente de `NOVA` + suas próprias `NOVA`

Se um usuário sem `manage_ideas` filtrar `status=NOVA`, receberá apenas suas próprias ideias NOVA — nunca 403.

**Resposta 200:** array de ideias serializadas, ordenadas por `createdAt` desc.

`voteCount` e `userHasVoted` calculados em batch para evitar N+1: usar `include: { votes: { where: { userId: req.user.id } }, _count: { select: { votes: true } } }`.

---

### 5.3 GET /api/ideas/:id

**Auth:** qualquer autenticado

**Visibilidade:**
- Ideia inexistente → 404
- Ideia `NOVA` de outro usuário sem `manage_ideas` → 403
- Caso contrário → 200

**Resposta 200:** objeto ideia serializado.

---

### 5.4 PATCH /api/ideas/:id/status

**Auth:** `manage_ideas`

**Body:**
```json
{
  "status": "EM_ANALISE | APROVADA | EM_IMPLEMENTACAO | IMPLEMENTADA | ARQUIVADA",
  "managerNote": "string opcional"
}
```

**Validações:**
- `status` ausente → 400
- `status` não pertence ao enum → 400
- `managerNote` sem `status` não é válido (nota só atualiza junto com o status)
- Transição inválida → 400
- Ideia inexistente → 404

**Resposta 200:** objeto ideia atualizado.

---

### 5.5 POST /api/ideas/:id/vote

**Auth:** qualquer autenticado

**Comportamento (toggle):**
- Se não votou → cria voto → `{ voted: true, voteCount: N }`
- Se já votou → remove voto → `{ voted: false, voteCount: N }`

**Validações (nessa ordem):**
1. Ideia inexistente → 404
2. Ideia `NOVA` de outro usuário sem `manage_ideas` → 403
3. Status diferente de `EM_ANALISE` → 400 com `"Só é possível votar em ideias em análise."`

**Resposta 200:** `{ voted: boolean, voteCount: number }`

## 6. Serialização da ideia

```json
{
  "id": 1,
  "title": "Implementar daily standup",
  "description": "Reunião diária de 15 min...",
  "areaImpacted": "Operações",
  "expectedBenefit": "Reduzir retrabalho em 20%",
  "isAnonymous": false,
  "status": "EM_ANALISE",
  "managerNote": null,
  "authorId": 3,
  "authorName": "João Silva",
  "voteCount": 7,
  "userHasVoted": true,
  "createdAt": "2026-06-25T10:00:00.000Z"
}
```

**Anonimato:** quando `isAnonymous === true` e o solicitante não tem `manage_ideas`, `authorId` retorna `null` e `authorName` retorna `null`.

## 7. Arquitetura

```
backend/src/modules/ideas/
  ideas.controller.js    (list, detail, create, updateStatus, toggleVote)
  ideas.routes.js        (per-route auth — nunca router.use())
backend/prisma/
  schema.prisma          (+ managerNote String? em Idea)
  migrations/            (nova migration add_idea_manager_note)
backend/src/lib/
  permissions.js         (+ 'manage_ideas')
backend/prisma/
  seed.js                (manage_ideas para Gestor e Admin)
backend/tests/
  ideas-api.test.js      (~13 testes de integração)
```

`backend/src/server.js` recebe `app.use('/api', ideasRoutes)`.

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

## 8. Testes de integração (13)

**Setup (beforeAll):** cria setor, role com `manage_ideas` (gestor), role sem `manage_ideas` (técnico), 3 usuários (gestor, técnico1, técnico2), 1 ideia NOVA criada pelo técnico1.

**Casos:**
1. `POST /ideas` cria ideia com status NOVA e campos corretos
2. `POST /ideas` sem campo obrigatório (`areaImpacted`) → 400
3. `GET /ideas` — técnico1 vê própria NOVA; técnico2 não vê NOVA de técnico1
4. `GET /ideas` — gestor vê todas incluindo NOVA de outros
5. `GET /ideas?status=NOVA` — técnico só vê própria NOVA (resultado filtrado, não 403)
6. `GET /ideas/:id` — 404 para inexistente
7. `GET /ideas/:id` — 403 para NOVA de outro usuário sem manage_ideas
8. `PATCH /ideas/:id/status` — NOVA → EM_ANALISE com managerNote (gestor)
9. `PATCH /ideas/:id/status` — transição inválida (EM_ANALISE → NOVA) → 400
10. `PATCH /ideas/:id/status` — sem manage_ideas → 403
11. `POST /ideas/:id/vote` — vota em ideia EM_ANALISE; voteCount=1, voted=true
12. `POST /ideas/:id/vote` — toggle desvota; voteCount=0, voted=false
13. `POST /ideas/:id/vote` — ideia NOVA (status errado) → 400

## 9. Ordem de implementação

1. Adicionar `manage_ideas` a `permissions.js` e `seed.js`; re-executar seed
2. Adicionar `managerNote String?` ao model `Idea` no schema + rodar migration
3. Criar `ideas.controller.js` + `ideas.routes.js` + montar em `server.js`
4. Criar `ideas-api.test.js` e rodar suite completa
