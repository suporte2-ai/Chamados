# Helpdesk Fase 3: Módulo de Chamados — Design

Data: 2026-06-24

## 1. Visão geral

Fase 3 do projeto (ver `2026-06-22-helpdesk-design.md`, seção 11, item 3):
backend completo do módulo de chamados — criação, listagem com filtros,
detalhe, máquina de status com SLA e rastreamento de tempo (incluindo
pausas), comentários (públicos/internos), anexos, e os CRUDs admin de
apoio (categorias/subcategorias, configuração de SLA, setores).

O schema (Fase 1) já existe e está testado no nível de Prisma:
`Category`, `Subcategory`, `SLAConfig`, `Ticket`, `TicketTimeLog`,
`TicketComment`, `TicketAttachment`. Esta fase constrói a API e a lógica
de negócio sobre esse schema.

Fora de escopo nesta fase: frontend (ainda não iniciado no repo),
upload para S3 (fica em disco local), WebSocket (notificações ficam para
fase própria).

## 2. Arquitetura

```
backend/src/modules/
  categories/   CRUD de categorias/subcategorias (manage_categories)
  sla/          GET/PATCH de SLAConfig por urgência (manage_sla)
  sectors/      CRUD simples de setores (manage_categories)
  tickets/      controller/rotas: criação, listagem, detalhe, status,
                reabertura, comentários, anexos
backend/src/lib/
  ticketStatus.js   motor de transição de status (validação + efeitos)
  slaBadge.js       cálculo do badge de SLA na leitura (não persistido)
backend/uploads/    (runtime) armazenamento local dos anexos
```

Os novos módulos reaproveitam `authenticate`, `requirePermission` e
`asyncHandler` (Fase 2). Duas chaves novas entram no catálogo de
permissões (`src/lib/permissions.js`):

- `view_all_tickets` — vê todos os chamados, todos os setores. Seedada
  como `true` para Administrador e Gestor.
- `view_sector_tickets` — vê chamados do(s) próprio(s) setor + os
  atribuídos a ele, mesmo de outro setor. Seedada como `true` para
  Técnico/Atendente.

**Assunção registrada:** não há permissão dedicada para gerenciar
setores no catálogo atual; `POST/PATCH/DELETE /api/sectors` usa
`manage_categories` como gate (agrupado como "gestão de taxonomia").

## 3. Visibilidade e permissões

### Visibilidade de chamados (`GET /api/tickets`, `GET /api/tickets/:id`)

Resolvida como filtro `WHERE` na query (nunca em memória), nesta ordem:

1. `view_all_tickets` → vê todos os chamados.
2. Senão, `view_sector_tickets` → vê onde `sectorId = user.sectorId` OU
   `assignedToId = user.id`.
3. Senão → vê apenas onde `requesterId = user.id`.

`GET /api/tickets/:id` para um chamado fora da visibilidade do usuário
retorna 403 (404 se o id simplesmente não existe).

### Regras de ação

| Ação | Permissão/condição |
|---|---|
| Criar chamado | Qualquer usuário autenticado |
| Mudar status entre `ABERTO`/`EM_ANDAMENTO`/`AGUARDANDO`/`RESOLVIDO` | `assignedToId === user.id` OU `reassign_tickets` |
| Fechar (`FECHADO`) | `close_tickets` |
| Reabrir (`RESOLVIDO` → `EM_ANDAMENTO`) | `reopen_tickets` |
| Atribuir/reatribuir `assignedToId` | `reassign_tickets` (sempre, mesmo a primeira atribuição) |
| Definir/editar `estimatedCost` | `view_financial_reports` |
| Ver `TicketComment` com `isInternal=true` | `view_internal_notes` (omitido pelo backend — nunca trafega sem a permissão) |
| Criar comentário interno (`isInternal=true`) | `view_internal_notes` |

`PATCH /api/tickets/:id` aceita um corpo parcial com `status`,
`assignedToId` e/ou `estimatedCost` no mesmo request. Cada campo
presente é checado contra sua permissão; se faltar permissão para
**qualquer** campo enviado, a request inteira é rejeitada com 403 (sem
updates parciais silenciosos).

**Precedência da regra de status:** a linha "fechar" (`close_tickets`) e
a linha "reabrir" (`reopen_tickets`) são regras específicas para o
*destino* `FECHADO` e para a transição `RESOLVIDO`→`EM_ANDAMENTO`,
respectivamente, e substituem a regra geral só para essas transições.
Para qualquer outro destino (`ABERTO`, `EM_ANDAMENTO`, `AGUARDANDO`, ou
`RESOLVIDO` vindo de um estado diferente de `RESOLVIDO`), vale a regra
geral (`assignedToId === user.id` OU `reassign_tickets`) — as duas
permissões não se somam.

## 4. Máquina de status, SLA e rastreamento de tempo

### Transições válidas

| De | Para | Efeito |
|---|---|---|
| `ABERTO` | `EM_ANDAMENTO` | grava `STATUS_CHANGE` |
| `ABERTO`/`EM_ANDAMENTO` | `AGUARDANDO` | grava `STATUS_CHANGE` + `PAUSE_START` |
| `AGUARDANDO` | `EM_ANDAMENTO` | grava `PAUSE_END` + `STATUS_CHANGE` |
| `ABERTO`/`EM_ANDAMENTO` | `RESOLVIDO` | grava `STATUS_CHANGE`, `resolvedAt`, recalcula `timeToResolutionMinutes` |
| `AGUARDANDO` | `RESOLVIDO` | grava `PAUSE_END` primeiro (fecha a pausa), depois o mesmo efeito acima |
| `RESOLVIDO` | `FECHADO` | requer `close_tickets`; grava `STATUS_CHANGE`, `closedAt` |
| `RESOLVIDO` | `EM_ANDAMENTO` (reabertura) | requer `reopen_tickets`; grava `REOPENED`, limpa `resolvedAt`/`timeToResolutionMinutes` |

`FECHADO` é terminal — nenhuma transição parte dele. Qualquer combinação
fora desta tabela (ex.: `ABERTO`→`FECHADO` direto, `RESOLVIDO`→
`AGUARDANDO`) é rejeitada com 400.

### Primeira resposta

Ao criar um `TicketComment` público (`isInternal=false`) ou ao mudar o
status, se o autor da ação for o `assignedToId` **atual** do chamado e
`firstResponseAt` ainda for `null`: grava `firstResponseAt`,
`timeToFirstResponseMinutes` e o evento `FIRST_RESPONSE`. Reatribuição
de `assignedToId` nunca conta como primeira resposta — só uma ação
subsequente do novo responsável conta.

### Cálculo de tempo de resolução

`timeToResolutionMinutes` = `(resolvedAt − createdAt)` − soma de todos
os intervalos `PAUSE_START → PAUSE_END` já registrados no
`TicketTimeLog` do ticket, de qualquer ciclo (sem reset por reabertura).

### Badge de SLA

Função pura `calculateSlaBadge(ticket)` em `slaBadge.js`, chamada na
serialização da resposta (nunca persistida):

- Chamado aberto: compara `now()` contra `slaResolutionDeadline` → verde
  (<80% do prazo consumido), amarelo (≥80%), vermelho (vencido).
- Chamado `RESOLVIDO`/`FECHADO`: congelado no resultado final (`resolvedAt`
  ≤ deadline → verde; senão vermelho).
- Reabertura: volta a calcular dinamicamente contra `now()` (deixa de
  estar congelado, já que `resolvedAt` foi limpo).

### Implementação

`src/lib/ticketStatus.js` exporta `applyStatusTransition(ticket, newStatus, actor)`:
1. Valida a transição contra a tabela acima (lança erro 400 se inválida).
2. Executa dentro de `prisma.$transaction`: update do `Ticket` + insert no
   `TicketTimeLog` (mesmo padrão atômico já usado em
   `resetPassword`/`forgotPassword` na Fase 2).
3. Retorna o ticket atualizado.

## 5. Endpoints

### Chamados

- `POST /api/tickets` — `{ title, description, categoryId, subcategoryId, urgency }`.
  `sectorId` herdado do `sectorId` do usuário logado (`requesterId`).
  `slaFirstResponseDeadline`/`slaResolutionDeadline` calculados a partir
  do `SLAConfig` da urgência. Grava evento `CREATED`.
- `GET /api/tickets` — query params: `status`, `urgency`, `categoryId`,
  `subcategoryId`, `assignedToId`, `sectorId`, `search` (busca em
  `title`/`description`/id formatado `#00142`), `sortBy` (whitelist:
  `createdAt`, `urgency`, `status`, `title`), `sortOrder` (`asc`/`desc`),
  `page`/`pageSize` (default `1`/`50`). O filtro de visibilidade (seção 3)
  é sempre aplicado antes dos filtros da query.
- `GET /api/tickets/:id` — detalhe completo; comentários internos
  omitidos sem `view_internal_notes`; 403 fora de visibilidade, 404 se
  não existe.
- `PATCH /api/tickets/:id` — `status`/`assignedToId`/`estimatedCost`
  parciais, gates conforme seção 3.
- `POST /api/tickets/:id/reopen` — atalho dedicado para a mesma
  transição `RESOLVIDO`→`EM_ANDAMENTO` da tabela da seção 4 (chama
  `applyStatusTransition` internamente, igual a um `PATCH` com
  `status: 'EM_ANDAMENTO'`); existe só por clareza de API, não é uma
  regra separada. Requer `reopen_tickets`.

### Comentários

- `POST /api/tickets/:id/comments` — `{ body, isInternal }`.
  `isInternal=true` requer `view_internal_notes`. Dispara a checagem de
  primeira resposta.

### Anexos

- `POST /api/tickets/:id/attachments` — multipart/form-data, campo
  `file` (multer, limite 10MB por arquivo, sem restrição de tipo),
  `commentId` opcional no body. Nome de arquivo gerado (uuid) para
  evitar colisão/path traversal; nome original preservado em `fileName`.
  Salvo em `backend/uploads/`.
- `GET /api/tickets/:ticketId/attachments/:attachmentId` — serve o
  arquivo, autenticado, valida visibilidade do ticket antes de servir.

### Admin (categorias/SLA/setores)

- `GET/POST /api/categories`, `PATCH/DELETE /api/categories/:id` (DELETE
  bloqueado com 409 se houver subcategoria ou ticket vinculado) —
  `manage_categories`
- `POST /api/categories/:id/subcategories`, `DELETE /api/subcategories/:id`
  (mesma regra de bloqueio 409) — `manage_categories`
- `GET/PATCH /api/sla-config/:urgency` — `manage_sla`. As 4 urgências já
  existem via seed; não há criação livre, só edição dos 4 registros fixos.
- `GET/POST /api/sectors` — `manage_categories`

## 6. Testes e seed

Mesmo padrão das fases anteriores: Jest + Supertest + Prisma real
(banco de teste real, sem mocks exceto para simular falhas/corridas
específicas).

- `categories-api.test.js` / `sla-config-api.test.js` / `sectors-api.test.js`
  — CRUD + bloqueio 409 em delete com vínculo
- `ticket-creation.test.js` — criação, herança de `sectorId`, cálculo de
  deadlines, evento `CREATED`
- `ticket-visibility.test.js` — as 3 regras de visibilidade da seção 3
- `ticket-status-transitions.test.js` — cada transição válida da tabela
  da seção 4 + rejeição de transições inválidas (400) + `FECHADO` terminal
- `ticket-first-response.test.js` — primeira resposta só conta quando é
  o `assignedToId` atual; reatribuição não conta como resposta
- `ticket-pause-resolution.test.js` — soma de pausas no cálculo de
  `timeToResolutionMinutes`, incluindo reabertura com múltiplos ciclos
  de pausa (soma todo o histórico, sem reset)
- `ticket-reopen.test.js` — reabertura, `slaResolutionDeadline` não
  recalculado, `resolvedAt` limpo, log `REOPENED` preservado
- `ticket-comments.test.js` — comentário público vs interno, omissão de
  internos sem `view_internal_notes`, gatilho de primeira resposta
- `ticket-attachments.test.js` — upload, limite de 10MB, vínculo a
  comentário ou direto ao ticket, bloqueio de acesso por visibilidade
- `ticket-permissions.test.js` — tabela de ações da seção 3

**Seed:** o seed da Fase 1 cria categorias/subcategorias/SLA/setores de
exemplo, mas ainda não cria chamados com a riqueza pedida pelo design
geral (~40-60 chamados variados, com pausas). Esta fase estende o seed
para gerar esse conjunto reutilizando `applyStatusTransition` e a lógica
de criação, em vez de inserir os campos calculados manualmente — garante
que os dados de exemplo fiquem consistentes com a lógica real.

## 7. Decisões registradas (assunções a confirmar se divergirem do esperado)

- Setores usam `manage_categories` como permissão de gestão (sem chave
  própria no catálogo).
- `view_all_tickets` e `view_sector_tickets` são chaves novas, distintas
  de `view_performance_panel` (que continua controlando só o acesso ao
  painel de desempenho da Fase 4).
- Atribuição inicial de um chamado (`assignedToId` ainda `null`) segue a
  mesma regra de reatribuição: sempre requer `reassign_tickets`. Técnico
  não se autoatribui.
- Anexos: limite de 10MB por arquivo, sem restrição de tipo/mime.
