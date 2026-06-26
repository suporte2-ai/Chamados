# Phase 9 — Dashboard, Performance, Ideias e Admin

**Data:** 2026-06-26  
**Status:** Aprovado

## Visão Geral

Fase 9 completa o frontend React com os quatro módulos excluídos da Fase 8:

1. **Dashboard principal** — visão geral para todos os usuários autenticados
2. **Painel de desempenho** — métricas por técnico/setor com gráficos
3. **Módulo de ideias** — criação, votação e workflow de status
4. **Admin** — gerenciamento de usuários, perfis, categorias, setores e SLA

Todos os endpoints de backend já existem. A Fase 9 é exclusivamente frontend.

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
| `/admin/roles` | `AdminRolesPage` | `manage_roles` |
| `/admin/roles/:id` | `AdminRoleEditPage` | `manage_roles` |
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

---

## Módulo 1 — Dashboard (`/`)

### Fonte de dados

Três queries paralelas via TanStack Query:

1. Contagens por status: `GET /api/tickets?pageSize=1&status=<S>` × 5 (apenas campo `total`)
2. Meus tickets: `GET /api/tickets?assignedToId=<userId>&pageSize=10` (status ≠ FECHADO)
3. Alertas SLA: `GET /api/tickets?pageSize=20` — filtrado no cliente por `slaBadge === 'vermelho'`

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
- Ordenados por `slaFirstResponseDeadline asc`
- Link "Ver todos" → `/tickets?assignedToId=<userId>`
- Visível apenas para usuários com campo `assigned_to` em `fieldVisible`

### Alertas de SLA

Lista dos chamados com `slaBadge === 'vermelho'`, não fechados, ordenados por deadline mais próximo.
- Máximo 5 itens
- Link "Ver todos críticos" → `/tickets?sla=vermelho`
- Visível apenas para usuários com campo `sla_badge` em `fieldVisible`

---

## Módulo 2 — Painel de Desempenho (`/performance`)

### Endpoints utilizados

- `GET /api/performance/summary?from=YYYY-MM-DD&to=YYYY-MM-DD[&sectorId=][&categoryId=]`
  - Retorna `{ period, overall: { totalTickets, avgFirstResponseMinutes, avgResolutionMinutes, slaComplianceRate }, byUser: [...] }`
- `GET /api/performance/users/:id?from=&to=` — drilldown individual
- `GET /api/performance/export?format=csv|pdf&from=&to=` — exportação

### Filtros

Seletor de período com presets: **Últimos 7 dias**, **Últimos 30 dias**, **Últimos 90 dias** + inputs manuais `from/to`. Filtro opcional de setor (select com dados de `GET /api/sectors`).

### Cards gerais

Três cards exibidos em linha: Total de tickets · Tempo médio de primeira resposta · Tempo médio de resolução. Valores > 60 min formatados como "Xh Ym".

### Gráfico de volume

Gráfico de barras com tickets criados por dia no período selecionado. Dados derivados dos tickets individuais do `byUser` — sem novo endpoint. Biblioteca: **recharts** (única nova dependência de produção da Fase 9).

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

Layout com sidebar secundária listando os 5 sub-módulos. Rota `/admin` redireciona para o primeiro módulo que o usuário tem permissão.

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

Salva em paralelo: `PUT /api/roles/:id/permissions` + `PUT /api/roles/:id/field-visibilities`.

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

**Endpoints:** `GET /api/sla` · `PUT /api/sla/:urgency`

Tabela com 4 linhas (CRITICO, ALTO, MEDIO, BAIXO). Colunas: Urgência · Primeira resposta (h) · Resolução (h). Cada célula numérica editável via `<input type="number" onBlur>` — salva individualmente por urgência via `PUT /api/sla/:urgency`.

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

## Dependências novas

- **recharts** — única dependência de produção nova, para o gráfico de barras do painel de desempenho

---

## Testes

- Cobertura via testes de componente existentes (Vitest + Testing Library)
- Novos testes unitários para: `DashboardPage` (cards + visibilidade por permissão), `IdeaDetailPage` (transições de status), `AdminRoleEditPage` (checkboxes de permissão)
- Backend sem alterações → suite de 168/169 tests mantida

---

## Excluído desta fase

- Notificações push / WebSocket em tempo real
- Histórico de auditoria de alterações admin
- Upload de avatar de usuário
- Relatórios financeiros (permissão `view_financial_reports` existe mas sem endpoint de dados)
