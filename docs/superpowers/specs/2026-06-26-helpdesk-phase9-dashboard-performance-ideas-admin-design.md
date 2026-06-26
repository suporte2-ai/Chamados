# Phase 9 — Dashboard, Performance, Ideias e Admin

**Data:** 2026-06-26  
**Status:** Aprovado

## Visão Geral

Fase 9 completa o frontend React com os quatro módulos excluídos da Fase 8:

1. **Dashboard principal** — visão geral para todos os usuários autenticados
2. **Painel de desempenho** — métricas por técnico/setor com gráficos
3. **Módulo de ideias** — criação, votação e workflow de status
4. **Admin** — gerenciamento de usuários, perfis, categorias, setores e SLA

A Fase 9 é predominantemente frontend. Dois micro-ajustes de backend são necessários (detalhados em "Alterações no backend").

---

## Arquitetura: Roteamento e Navegação

Cada módulo tem sua própria rota de nível superior, consistente com o padrão `/tickets` da Fase 8.

### Novas rotas

| Rota | Componente | Permissão requerida |
|------|-----------|---------------------|
| `/` | `DashboardPage` | autenticado |
| `/performance` | `PerformancePage` | `view_performance_panel` |
| `/ideas` | `IdeasListPage` | autenticado |
| `/ideas/new` | `IdeaNewPage` | autenticado |
| `/ideas/:id` | `IdeaDetailPage` | autenticado |
| `/admin` | `AdminLayout` (shell) | qualquer `manage_*` |
| `/admin/users` | `AdminUsersPage` | `manage_users` |
| `/admin/roles` | `AdminRolesPage` | `manage_users` |
| `/admin/roles/:id` | `AdminRoleEditPage` | `manage_users` |
| `/admin/categories` | `AdminCategoriesPage` | `manage_categories` |
| `/admin/sectors` | `AdminSectorsPage` | `manage_categories` |
| `/admin/sla` | `AdminSlaPage` | `manage_sla` |

### Redirect pós-login

O redirect padrão após login muda de `/tickets` para `/` (Dashboard). A rota `/tickets` continua acessível diretamente.

### Sidebar

Adiciona dois grupos ao componente `Sidebar` existente:

- **Ideias** — link `/ideas`, visível para todos os autenticados
- **Administração** — grupo colapsável, visível apenas para quem tem ao menos uma permissão `manage_*`, com sub-itens: Usuários, Perfis, Categorias, Setores, SLA

O componente `ProtectedRoute` existente já suporta prop `permission` — basta passar a permissão requerida para cada nova rota.

> **Nota sobre roles:** `roles.routes.js` protege todos os endpoints de roles com `requirePermission('manage_users')`, não `manage_roles`. As rotas frontend `/admin/roles` e `/admin/roles/:id` devem usar `manage_users` como guarda para manter consistência com o backend.

---

## Módulo 1 — Dashboard (`/`)

### Fonte de dados

Três queries paralelas via TanStack Query:

1. Contagens por status: `GET /api/tickets?pageSize=1&status=<S>` × 5 (apenas campo `total`)
2. Meus tickets: `GET /api/tickets?assignedToId=<userId>&pageSize=50&sortBy=slaFirstResponseDeadline&sortOrder=asc` (status ≠ FECHADO, filtrado no cliente)
3. Alertas SLA: `GET /api/tickets?pageSize=50&sortBy=slaResolutionDeadline&sortOrder=asc` — filtrado no cliente por `slaBadge === 'vermelho'` e `status !== 'FECHADO'`

> **Nota:** `slaResolutionDeadline` requer adição ao `SORT_WHITELIST` em `tickets.controller.js` (ver "Alterações no backend"). O sort por deadline garante que os chamados mais próximos do vencimento apareçam primeiro — sem ele, o sort padrão `createdAt desc` retornaria tickets recentes que ainda têm SLA folgado.

### Layout

```
[ABERTO] [EM ANDAMENTO] [AGUARDANDO] [RESOLVIDO] [FECHADO]   ← cards clicáveis

| Meus Tickets                | Alertas de SLA              |
| (tabela, 10 linhas max)     | (lista, 5 itens max)        |
```

Em mobile: cards em 2×3 grid, seções empilhadas verticalmente.

### Cards de resumo

Cinco cards com contagem por status. Cada card é clicável e navega para `/tickets?status=<valor>`.

### Meus tickets

Tabela compacta com colunas: #ID · Título · Status badge · Urgência badge · SLA badge.
- Ordenados por `slaFirstResponseDeadline asc` (requer que `slaFirstResponseDeadline` seja adicionado ao `SORT_WHITELIST` — ver "Alterações no backend")
- Link "Ver todos" → `/tickets?assignedToId=<userId>`
- Visível apenas para usuários com campo `assigned_to` em `fieldVisible`
- Query usa `pageSize=50` para garantir que o filtro client-side de `status ≠ FECHADO` tenha resultados suficientes mesmo para agentes com muitos tickets recentes fechados. O backend suporta apenas status exato (sem "excluir"), por isso a exclusão é feita no cliente.

### Alertas de SLA

Lista dos chamados com `slaBadge === 'vermelho'`, não fechados, ordenados por deadline mais próximo.
- Máximo 5 itens exibidos (pageSize=50 é best-effort — sistemas com 51+ tickets SLA vermelho simultâneos mostrarão apenas os 50 mais próximos do vencimento)
- Link "Ver todos críticos" → `/tickets?sla=vermelho`
- Visível apenas para usuários com campo `sla_badge` em `fieldVisible`

### Fallback para solicitantes

Solicitantes comuns (sem `assigned_to` e sem `sla_badge` em `fieldVisible`) veem apenas os 5 cards de contagem no topo. Abaixo dos cards, exibir uma seção "Meus chamados abertos" simplificada usando `GET /api/tickets` (sem filtros adicionais) — o middleware `ticketVisibilityWhere` já restringe automaticamente os resultados ao `requesterId` do usuário logado para perfis sem `view_all_tickets`. Exibe colunas: #ID · Título · Status · Urgência. Sem colunas de SLA ou atribuição.

---

## Módulo 2 — Painel de Desempenho (`/performance`)

### Endpoints utilizados

- `GET /api/performance/summary?from=YYYY-MM-DD&to=YYYY-MM-DD[&sectorId=][&categoryId=]`
  - Retorna `{ period, overall: { totalTickets, avgFirstResponseMinutes, avgResolutionMinutes, slaComplianceRate }, byUser: [...] }`
- `GET /api/performance/users/:id/drilldown?from=&to=` — drilldown individual
- `GET /api/performance/export?format=csv|pdf&from=&to=` — exportação

### Filtros

Seletor de período com presets: **Últimos 7 dias**, **Últimos 30 dias**, **Últimos 90 dias** + inputs manuais `from/to`. Filtro opcional de setor (select com dados de `GET /api/sectors`).

### Cards gerais

Três cards exibidos em linha: Total de tickets · Tempo médio de primeira resposta · Tempo médio de resolução. Valores > 60 min formatados como "Xh Ym".

### Gráfico de volume

Gráfico de barras com tickets criados e resolvidos por dia no período selecionado. Biblioteca: **recharts** (única nova dependência de produção da Fase 9).

Fonte de dados: `GET /api/performance/volume?from=&to=[&sectorId=]` — novo endpoint leve que retorna `[{ date: 'YYYY-MM-DD', created: N, resolved: N }]`. Ver "Alterações no backend".

> **Por que novo endpoint:** o endpoint `summary` agrega por usuário com escalares (totais e médias). Não contém timestamps nem buckets diários — impossível derivar um histograma sem dados adicionais.

### Tabela por técnico

Colunas: Nome · Setor · Tickets · Média resposta · Média resolução · Taxa SLA.
Linha clicável: abre modal de drilldown com métricas detalhadas e lista de tickets do técnico no período.

### Exportar

Botões CSV e PDF usam o padrão `downloadAttachment` (blob URL + anchor) já estabelecido na Fase 8:
```js
const response = await api.get('/api/performance/export', {
  params: { format, from, to },
  responseType: 'blob',
})
// ... mesmo padrão de download da Fase 8
```

---

## Módulo 3 — Ideias (`/ideas`, `/ideas/new`, `/ideas/:id`)

### Workflow de status (backend)

```
NOVA → EM_ANALISE → APROVADA → EM_IMPLEMENTACAO → IMPLEMENTADA
          ↓              ↓              ↓                 ↓
       ARQUIVADA      ARQUIVADA      ARQUIVADA         ARQUIVADA
```

Votos permitidos apenas em ideias `EM_ANALISE`.

Visibilidade: usuários sem `manage_ideas` veem apenas ideias `status ≠ NOVA` + as próprias.

### Labels de status

| Enum | Label |
|------|-------|
| NOVA | Nova |
| EM_ANALISE | Em análise |
| APROVADA | Aprovada |
| EM_IMPLEMENTACAO | Em implementação |
| IMPLEMENTADA | Implementada |
| ARQUIVADA | Arquivada |

### Lista (`/ideas`)

Cards em grid responsivo com: título, área impactada, status badge, contagem de votos, autor (oculto se `isAnonymous` e sem `manage_ideas`). Filtro de status no topo.

### Nova ideia (`/ideas/new`)

Formulário: Título · Descrição · Área impactada · Benefício esperado · checkbox "Enviar anonimamente". Após criação: `toast.success` + redirect para `/ideas`.

### Detalhe (`/ideas/:id`)

- Exibe todos os campos: título, descrição, área, benefício, nota do gestor (`managerNote`)
- Botão de voto (toggle): ativo apenas quando `status === 'EM_ANALISE'`, mostra contagem atual
- **Para usuários com `manage_ideas`:** select de transição de status (baseado em `VALID_TRANSITIONS`) + textarea para `managerNote` + botão Salvar → `PATCH /api/ideas/:id/status`

---

## Módulo 4 — Admin (`/admin/*`)

### Shell `/admin`

Layout com sidebar secundária listando os 5 sub-módulos. Rota `/admin` redireciona para o primeiro módulo da seguinte ordem de prioridade que o usuário tem permissão:

1. `manage_users` → `/admin/users`
2. `manage_categories` → `/admin/categories`
3. `manage_sla` → `/admin/sla`
4. nenhuma das anteriores → `/admin/sectors` (requer qualquer `manage_*`)

Se o usuário não tiver nenhuma permissão `manage_*`, a rota `/admin` está protegida por `ProtectedRoute` e redireciona para `/tickets`.

---

### `/admin/users` — Gestão de Usuários

**Endpoints:** `GET /api/users` · `POST /api/users` · `PATCH /api/users/:id`

Tabela: Nome · E-mail · Perfil · Setor · Ativo (badge) · Último login · ações (Editar).

**Criar:** botão "+ Novo Usuário" abre modal com campos: nome, e-mail, senha inicial, perfil (select), setor (select).

**Editar:** modal com os mesmos campos exceto senha + toggle Ativo/Inativo.

---

### `/admin/roles` — Perfis de Acesso

**Endpoints:** `GET /api/roles` · `POST /api/roles` · `PATCH /api/roles/:id` · `DELETE /api/roles/:id`

Lista com: nome, level, contagem de usuários vinculados. Botão Editar → `/admin/roles/:id`. Botão Excluir (desabilitado se `isSystemDefault` ou com usuários — backend retorna 409, exibido como toast).

**`/admin/roles/:id` — Editor de permissões**

Página dedicada em duas seções:

**Permissões (15 checkboxes):**

| Chave | Label |
|-------|-------|
| manage_users | Gerenciar usuários |
| manage_roles | Gerenciar perfis |
| manage_categories | Gerenciar categorias |
| manage_sla | Gerenciar SLA |
| view_performance_panel | Ver painel de desempenho |
| view_financial_reports | Ver relatórios financeiros |
| reassign_tickets | Atribuir chamados |
| close_tickets | Fechar chamados |
| view_internal_notes | Ver notas internas |
| view_own_metrics | Ver próprias métricas |
| reopen_tickets | Reabrir chamados |
| view_all_tickets | Ver todos os chamados |
| view_sector_tickets | Ver chamados do setor |
| update_cost | Atualizar custo estimado |
| manage_ideas | Gerenciar ideias |

**Visibilidade de campos (4 checkboxes):**

| Chave | Label |
|-------|-------|
| assigned_to | Atribuído a |
| estimated_cost | Custo estimado |
| internal_notes | Notas internas |
| sla_badge | Badge de SLA |

Salva em paralelo: `PATCH /api/roles/:id/permissions` + `PATCH /api/roles/:id/field-visibility` (singular). Se um dos dois falhar, exibe toast de erro e **re-faz fetch do estado atual do role** (`GET /api/roles`) antes de permitir reenvio — garantindo que o formulário reflita o estado real do servidor e não um estado misto.

> **Nota — manage_roles:** A permissão `manage_roles` aparece nos checkboxes (é uma chave válida em `PERMISSION_KEYS`) mas nenhuma rota backend a verifica — `roles.routes.js` usa `manage_users` para tudo. Exibir o checkbox é correto (o administrador pode querer reservar a permissão para uso futuro), mas a implementação deve incluir um tooltip: "Esta permissão não tem efeito no backend atual".

> **Aviso de segurança:** Qualquer usuário com `manage_users` pode editar permissões de qualquer role — incluindo o próprio. Isso representa escalada de privilégios irrestrita. Considerar um guard dedicado `manage_roles` no backend (como ajuste futuro pós-Fase 9).

---

### `/admin/categories` — Categorias e Subcategorias

**Endpoints:** `GET /api/categories` · `POST /api/categories` · `PATCH /api/categories/:id` · `DELETE /api/categories/:id` · `POST /api/categories/:id/subcategories` · `DELETE /api/subcategories/:id`

Lista de categorias expansíveis. Cada categoria mostra subcategorias como chips com botão de excluir. Botão "+ Categoria" (input inline de nome). Dentro de cada categoria: botão "+ Subcategoria". Deletar bloqueado pelo backend se tiver tickets vinculados — erro 409 exibido como toast.

---

### `/admin/sectors` — Setores

**Endpoints:** `GET /api/sectors` · `POST /api/sectors`

Tabela com coluna Nome. Botão "+ Setor" com input de nome. Sem editar/excluir (backend não expõe esses endpoints — setores são estáveis por design).

---

### `/admin/sla` — Configuração de SLA

**Endpoints:** `GET /api/sla-config` · `PATCH /api/sla-config/:urgency`

Tabela com 4 linhas (CRITICO, ALTO, MEDIO, BAIXO). Colunas: Urgência · Primeira resposta (h) · Resolução (h). Cada célula numérica editável via `<input type="number" onBlur>` — salva individualmente por urgência via `PATCH /api/sla-config/:urgency`.

---

## Novos arquivos frontend

### API clients (`frontend/src/api/`)

| Arquivo | Endpoints cobertos |
|---------|-------------------|
| `performance.js` | summary, drilldown, export |
| `ideas.js` | list, create, detail, updateStatus, toggleVote |
| `roles.js` | list, create, update, remove, updatePermissions, updateFieldVisibility |
| `categories.js` | list, create, update, remove, createSubcategory, removeSubcategory |
| `sectors.js` | list, create |
| `sla.js` | list, update |

### Páginas (`frontend/src/pages/`)

| Arquivo | Rota |
|---------|------|
| `DashboardPage.jsx` | `/` |
| `performance/PerformancePage.jsx` | `/performance` |
| `ideas/IdeasListPage.jsx` | `/ideas` |
| `ideas/IdeaNewPage.jsx` | `/ideas/new` |
| `ideas/IdeaDetailPage.jsx` | `/ideas/:id` |
| `admin/AdminLayout.jsx` | `/admin` (shell) |
| `admin/AdminUsersPage.jsx` | `/admin/users` |
| `admin/AdminRolesPage.jsx` | `/admin/roles` |
| `admin/AdminRoleEditPage.jsx` | `/admin/roles/:id` |
| `admin/AdminCategoriesPage.jsx` | `/admin/categories` |
| `admin/AdminSectorsPage.jsx` | `/admin/sectors` |
| `admin/AdminSlaPage.jsx` | `/admin/sla` |

---

## Arquivos existentes a modificar

| Arquivo | Mudança necessária |
|---------|-------------------|
| `frontend/src/App.jsx` | Substituir `TicketListPage` na rota `path: '/'` por `DashboardPage`; adicionar as 11 novas rotas |
| `frontend/src/pages/auth/LoginPage.jsx` | Linha 24: trocar `'/tickets'` por `'/'` no fallback de redirect pós-login |
| `frontend/src/components/layout/Sidebar.jsx` | Adicionar links "Ideias" e grupo colapsável "Administração" com lógica de permissão |

---

## Alterações no backend

Dois micro-ajustes necessários (nenhum quebra compatibilidade):

### 1. `SORT_WHITELIST` em `tickets.controller.js`

```js
const SORT_WHITELIST = ['createdAt', 'urgency', 'status', 'title', 'slaResolutionDeadline', 'slaFirstResponseDeadline'];
```

Habilita dois sorts usados pelo Dashboard:
- `sortBy=slaResolutionDeadline` — Alertas SLA (tickets mais próximos de violar o prazo de resolução)
- `sortBy=slaFirstResponseDeadline` — Meus Tickets (tickets mais urgentes em prazo de primeira resposta)

### 2. Novo endpoint `GET /api/performance/volume`

Registrar em `performance.routes.js`:
```js
router.get('/performance/volume', asyncHandler(authenticate), asyncHandler(volume));
```

Implementar em `performance.controller.js`:

```
GET /api/performance/volume?from=YYYY-MM-DD&to=YYYY-MM-DD[&sectorId=]
```

Resposta: `[{ date: 'YYYY-MM-DD', created: N, resolved: N }]`

Implementação via `prisma.$queryRaw` com agregação condicional em uma única query (mesmo padrão do `buildSummary`):

```sql
SELECT
  DATE_TRUNC('day', d.day) AS date,
  SUM(d.created)::int       AS created,
  SUM(d.resolved)::int      AS resolved
FROM (
  SELECT "createdAt"  AS day, 1 AS created, 0 AS resolved FROM "tickets"
    WHERE "createdAt" >= ${fromDate} AND "createdAt" <= ${toDate}
  UNION ALL
  SELECT "resolvedAt" AS day, 0 AS created, 1 AS resolved FROM "tickets"
    WHERE "resolvedAt" IS NOT NULL
      AND "resolvedAt" >= ${fromDate} AND "resolvedAt" <= ${toDate}
) d
GROUP BY DATE_TRUNC('day', d.day)
ORDER BY date ASC
```

Adicionar filtro `sectorId` via `AND "sectorId" = ${sectorId}` em ambas as sub-queries quando o param estiver presente. Requer os mesmos guards de autenticação/permissão dos outros endpoints de performance.

---

## Dependências novas

- **recharts** — única dependência de produção nova, para o gráfico de barras do painel de desempenho

---

## Testes

- Cobertura via testes de componente existentes (Vitest + Testing Library)
- Novos testes unitários para: `DashboardPage` (cards + visibilidade por permissão), `IdeaDetailPage` (transições de status), `AdminRoleEditPage` (checkboxes de permissão)
- Backend: dois micro-ajustes (SORT_WHITELIST + volume endpoint) requerem novos testes; suite existente de 168/169 deve ser mantida

---

## Excluído desta fase

- Notificações push / WebSocket em tempo real
- Histórico de auditoria de alterações admin
- Upload de avatar de usuário
- Relatórios financeiros (permissão `view_financial_reports` existe mas sem endpoint de dados)
