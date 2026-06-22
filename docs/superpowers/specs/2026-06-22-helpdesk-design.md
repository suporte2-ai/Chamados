# Sistema de Chamados (Helpdesk/Ticketing) — Design

Data: 2026-06-22

## 1. Visão geral

Sistema completo de helpdesk com painel web: autenticação, RBAC configurável por
perfil (campo a campo), módulo de chamados com rastreamento de tempo e SLA,
painel de desempenho da equipe, módulo de ideias/sugestões, dashboard
principal e painel de configurações administrativas.

## 2. Stack técnica (decidida)

- **Backend:** Node.js + Express + Prisma ORM + PostgreSQL
- **Frontend:** React (Vite) + Tailwind CSS — SPA pura consumindo API REST
- **Auth:** JWT — access token de vida curta + refresh token em cookie
  httpOnly; tempos de expiração configuráveis via `.env`
- **E-mail (recuperação de senha):** Nodemailer + SMTP configurável via
  `.env` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`).
  Se SMTP não configurado, o link de reset é logado no console (modo dev).
- **Anexos:** disco local em `backend/uploads/`, servidos via rota
  autenticada (sem acesso público direto ao diretório). Caminho de upgrade
  para S3 documentado no README, não implementado nesta versão.
- **Notificações:** polling — frontend consulta `GET /api/notifications`
  a cada ~15s. Sem WebSocket nesta versão.
- **Orquestração:** monorepo com `docker-compose.yml` (postgres + backend +
  frontend) e instruções alternativas via npm/yarn no README.

## 3. Estrutura do repositório

```
/backend
  /prisma         (schema.prisma, migrations, seed.ts)
  /src
    /modules      (auth, users, roles, tickets, performance, ideas, notifications, admin)
    /middleware   (auth, rbac)
    /lib          (sla calculation, email, upload)
  uploads/
/frontend
  /src
    /pages
    /components
    /hooks
    /api
docker-compose.yml
README.md
```

## 4. Modelo de dados (Prisma — visão lógica)

### Identidade e RBAC
- `Role` — id, name, level, isSystemDefault. 4 perfis padrão semeados:
  Administrador, Gestor, Técnico/Atendente, Usuário Final. Admin pode criar
  outros perfis via painel.
- `RolePermission` — roleId, permissionKey (string livre, ex:
  `view_performance_panel`, `view_financial_reports`, `reassign_tickets`,
  `close_tickets`, `view_internal_notes`, `manage_users`, `view_own_metrics`,
  `reopen_tickets`), enabled (bool)
- `RoleFieldVisibility` — roleId, fieldKey (ex: `assigned_to`,
  `estimated_cost`, `internal_notes`, `sla_badge`), visible (bool)
- `Sector` — id, name
- `User` — id, name, email (unique), passwordHash, roleId, sectorId, active,
  lastLoginAt, createdAt
- `PasswordResetToken` — id, userId, token, expiresAt, usedAt

### Chamados
- `Category` — id, name
- `Subcategory` — id, categoryId, name
- `SLAConfig` — id, urgency (CRITICO/ALTO/MEDIO/BAIXO), firstResponseHours,
  resolutionHours
- `Ticket` — id (exibido como `#00142`, zero-padded a partir do id
  autoincremento — sem tabela de contador separada), title, description,
  categoryId, subcategoryId, urgency, status
  (ABERTO/EM_ANDAMENTO/AGUARDANDO/RESOLVIDO/FECHADO), requesterId,
  assignedToId, sectorId, estimatedCost (nullable), createdAt,
  firstResponseAt, resolvedAt, closedAt, timeToFirstResponseMinutes,
  timeToResolutionMinutes (líquido, descontando pausas),
  slaFirstResponseDeadline, slaResolutionDeadline
- `TicketTimeLog` — id, ticketId, eventType
  (CREATED/STATUS_CHANGE/FIRST_RESPONSE/PAUSE_START/PAUSE_END/RESOLVED/CLOSED/REOPENED),
  fromStatus, toStatus, authorId, occurredAt, note. Fonte de verdade da
  timeline visual e do cálculo de pausas.
- `TicketComment` — id, ticketId, authorId, body, isInternal (bool),
  createdAt
- `TicketAttachment` — id, ticketId, commentId (nullable), fileName,
  filePath, uploadedById, createdAt

### Ideias
- `Idea` — id, title, description, areaImpacted, expectedBenefit, authorId,
  isAnonymous, status
  (NOVA/EM_ANALISE/APROVADA/EM_IMPLEMENTACAO/IMPLEMENTADA/ARQUIVADA),
  createdAt
- `IdeaVote` — ideaId, userId (unique composto — 1 voto por usuário)
- `IdeaComment` — id, ideaId, authorId, body, createdAt

### Notificações
- `Notification` — id, userId, type, message, link, isRead, createdAt

### Índices
`tickets(status)`, `tickets(urgency)`, `tickets(assignedToId)`,
`tickets(createdAt)`, `ticket_time_logs(ticketId, occurredAt)`.

## 5. Fluxo de status, SLA e cálculo de tempos

- Criação: `status=ABERTO`; grava evento `CREATED`; calcula
  `slaFirstResponseDeadline`/`slaResolutionDeadline` a partir do
  `SLAConfig` da urgência escolhida. `Ticket.sectorId` é herdado do
  `sectorId` do solicitante (`requesterId`) no momento da criação — não é
  escolhido manualmente nem reatribuído automaticamente se o solicitante
  mudar de setor depois.
- **Primeira resposta (`firstResponseAt`)** conta apenas uma ação visível
  ao solicitante feita especificamente pelo `assignedToId` do chamado:
  comentário público (`isInternal=false`) ou mudança de status. Notas
  internas e ações de outros técnicos/gestores que não o responsável
  atribuído **não** contam — a métrica mede a experiência percebida pelo
  solicitante, não a agilidade interna da equipe. Ao ocorrer, grava
  `firstResponseAt` (se ainda nulo) e `timeToFirstResponseMinutes`.
- Entrada em `AGUARDANDO` → grava `PAUSE_START`. Saída de `AGUARDANDO` por
  **qualquer** transição (incluindo direto para `RESOLVIDO` ou `FECHADO`)
  → sempre grava `PAUSE_END` primeiro, fechando o intervalo de pausa antes
  de processar a transição. Isso garante que nunca exista um
  `PAUSE_START` sem `PAUSE_END` correspondente no cálculo.
- Mudança para `RESOLVIDO` → grava `resolvedAt`; recalcula
  `timeToResolutionMinutes` = (resolvedAt − createdAt) − soma dos
  intervalos `PAUSE_START→PAUSE_END` (já todos fechados, ver acima).
- Mudança para `FECHADO` → grava `closedAt`. Status `FECHADO` é
  **definitivo** e não pode ser reaberto.
- **Reabertura:** um chamado em `RESOLVIDO` pode ser reaberto (voltar para
  `EM_ANDAMENTO`) por quem tiver a permissão `reopen_tickets`
  (tipicamente técnico/gestor). `slaResolutionDeadline` **não** é
  recalculado na reabertura — permanece o prazo original calculado na
  criação; se já estiver vencido, o badge volta a ficar vermelho contra
  `now()` imediatamente. Ao reabrir: grava evento `REOPENED`,
  limpa `resolvedAt` e `timeToResolutionMinutes` (voltam a `null`). O
  histórico completo da resolução anterior permanece no `TicketTimeLog`
  para auditoria/timeline (modelo é **append-only**, nenhum evento é
  apagado ou "resetado" na reabertura). Um chamado reaberto pode entrar em
  `AGUARDANDO` normalmente, gerando um novo par `PAUSE_START`/`PAUSE_END`
  independente dos pares de ciclos anteriores.
  Quando o chamado for resolvido novamente, `timeToResolutionMinutes` é
  recalculado pela mesma fórmula da seção, sem distinção de ciclo:
  `(resolvedAt − createdAt original) − soma de TODOS os intervalos
  PAUSE_START→PAUSE_END já registrados para o ticket, de qualquer ciclo`.
  Não há reset de acumulador por reabertura — a soma de pausas é sempre
  sobre o histórico completo do `TicketTimeLog`.
- Toda transição grava também `STATUS_CHANGE` (fromStatus/toStatus/autor) —
  alimenta a timeline visual do chamado.
- Os campos calculados (`timeToFirstResponseMinutes`,
  `timeToResolutionMinutes`) são **persistidos no backend a cada mudança de
  status** (não calculados ad-hoc no frontend), para que as queries de
  métricas do painel de desempenho sejam agregações SQL simples
  (AVG/MIN/MAX) sobre colunas da tabela `tickets`.
- Badge de SLA é calculado na leitura (não persistido): compara `now()`
  (ou `resolvedAt`) contra `slaResolutionDeadline` → verde (<80% do prazo
  consumido), amarelo (≥80%), vermelho (vencido). Para chamados já
  `RESOLVIDO`/`FECHADO`, o badge fica congelado no resultado final (verde
  se `resolvedAt` ≤ deadline, vermelho caso contrário) — não recalcula
  contra `now()` depois de resolvido. Reabrir um chamado volta o badge a
  ser calculado dinamicamente contra `now()` novamente (deixa de estar
  congelado), já que `resolvedAt` é limpo na reabertura.
- **Reatribuição antes da primeira resposta:** se `assignedToId` muda antes
  de `firstResponseAt` ser preenchido, a própria reatribuição não conta
  como primeira resposta — apenas uma ação subsequente (comentário público
  ou mudança de status) do **novo** `assignedToId` é que conta, seguindo a
  mesma regra da seção acima.

## 6. RBAC na prática

- Middleware de autorização no backend lê `RolePermission` da role do
  usuário logado em rotas sensíveis (`reassign_tickets`, `close_tickets`,
  `manage_users`, `view_performance_panel`, etc.).
- Listagem/detalhe de chamado: o backend **omite de fato** os comentários
  com `isInternal=true` para quem não tem `view_internal_notes` — dado
  sensível nunca trafega pela rede.
- Visibilidade de colunas/campos não sensíveis (ex: `assigned_to`,
  `estimated_cost`) é resolvida no frontend a partir da lista de
  `RoleFieldVisibility` retornada no payload de login/perfil — evita
  N chamadas de permissão por campo. **Importante:** essa lista controla
  apenas personalização de exibição (clutter), não autorização — qualquer
  campo cujo vazamento seja sensível (ex: notas internas) deve ser omitido
  pelo backend, nunca depender só de `RoleFieldVisibility`. Ao adicionar
  um novo campo no futuro, decidir explicitamente em qual das duas
  categorias ele entra antes de implementar.
- Tela "Gerenciar Perfis" no admin é um CRUD de UI sobre
  `RolePermission`/`RoleFieldVisibility` com toggles por campo/ação.

## 7. Estrutura de páginas (frontend)

Menu lateral adaptado por permissão da role:

- `/login`, `/forgot-password`, `/reset-password/:token`
- `/dashboard` — cards + gráficos (Recharts), personalizado por perfil
- `/tickets` — listagem com filtros, busca global, ordenação por qualquer
  coluna; colunas conforme `RoleFieldVisibility`
- `/tickets/:id` — detalhe: campos, comentários públicos, notas internas
  (se permitido), anexos, timeline visual, badge de SLA
- `/tickets/new` — abertura de chamado
- `/performance` — painel de desempenho da equipe (Gestor/Admin): cards de
  destaque, tabela de métricas por usuário, filtros globais (período,
  setor, categoria), gráficos comparativos, drill-down em drawer/modal por
  usuário, exportação CSV/PDF
- `/ideas` — listagem/ranking de ideias + submissão
- `/ideas/:id` — detalhe, votação, comentários de feedback
- `/admin/users`, `/admin/roles`, `/admin/categories`, `/admin/sectors`,
  `/admin/sla` — telas de configuração administrativa

## 8. Principais endpoints da API

- `POST /api/auth/login`, `POST /api/auth/refresh`,
  `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`
- `GET/POST /api/users`, `PATCH /api/users/:id` (admin)
- `GET/POST/PATCH /api/roles`, `/api/roles/:id/permissions`,
  `/api/roles/:id/field-visibility`
- `GET/POST /api/tickets`, `GET/PATCH /api/tickets/:id`,
  `POST /api/tickets/:id/comments`, `POST /api/tickets/:id/attachments`,
  `PATCH /api/tickets/:id/status`
- `GET /api/performance/summary?period=&sector=&category=` — agregações SQL
  (AVG/MIN/MAX) sobre `tickets` + joins em `ticket_time_logs`
- `GET /api/performance/users/:id/drilldown`
- `GET /api/performance/export?format=csv|pdf`
- `GET/POST /api/ideas`, `POST /api/ideas/:id/vote`,
  `POST /api/ideas/:id/comments`, `PATCH /api/ideas/:id/status`
- `GET /api/notifications`, `PATCH /api/notifications/:id/read`
- `GET/POST /api/categories`, `/api/sectors`, `/api/sla-config`
- `DELETE /api/users/:id` (na prática, desativa — soft delete via `active=false`,
  preserva histórico de chamados)
- `DELETE /api/roles/:id` — **bloqueado (HTTP 409)** se houver algum `User`
  com esse `roleId`; admin precisa reatribuir os usuários a outra role
  antes de excluir. Roles `isSystemDefault=true` (os 4 perfis padrão) não
  podem ser excluídas.
- `DELETE /api/categories/:id` — **bloqueado (HTTP 409)** se houver
  `Subcategory` ou `Ticket` referenciando essa categoria (via
  `categoryId`). Mesma regra para `DELETE /api/subcategories/:id` em
  relação a `Ticket.subcategoryId`. Não há cascade nem soft-delete para
  categorias/subcategorias — é sempre "restrict", forçando o admin a
  reorganizar/excluir os chamados ou recategorizá-los primeiro.
- `DELETE /api/ideas/:id/comments/:commentId`
- `PATCH /api/sla-config/:urgency` — atualização do SLA de uma urgência
  específica
- `POST /api/tickets/:id/reopen` — reabre chamado `RESOLVIDO` (grava
  `REOPENED`, ver seção 5)
- `DELETE /api/ideas/:id/vote` — remove o voto do usuário logado na ideia
  (toggle de apoio)

## 9. Seed de dados de exemplo

Conjunto moderado:
- ~10 usuários: 1 Administrador, 2 Gestores, 4 Técnicos, 3 Usuários Finais,
  distribuídos em pelo menos 2-3 setores.
- ~40–60 chamados distribuídos nos últimos 30 dias, com status, urgências e
  timestamps variados (incluindo pausas em `AGUARDANDO`) para que médias,
  rankings e gráficos do painel de desempenho façam sentido visualmente.
- 8–10 ideias de exemplo em diferentes status, com alguns votos e
  comentários de feedback.
- SLAConfig padrão para as 4 urgências, categorias/subcategorias e setores
  de exemplo.

## 10. Entregáveis

1. Código-fonte completo e funcional (backend + frontend)
2. Migrations Prisma + script de seed (dados de exemplo acima)
3. README com: instruções de instalação (docker-compose e alternativa
   npm/yarn), variáveis de ambiente necessárias, como criar o primeiro
   admin (via seed)
4. Estrutura de pastas clara, comentários nos pontos não-óbvios do código
   (especialmente cálculo de SLA/pausas e RBAC)

## 11. Ordem de implementação

1. Schema do banco (incluindo `ticket_time_logs`) e migrations + seed
2. Autenticação e gestão de usuários/roles (RBAC)
3. Módulo de chamados com rastreamento de tempo e SLA
4. Painel de desempenho da equipe e métricas
5. Módulo de ideias e sugestões
6. Dashboard principal
7. Painel de configurações admin
