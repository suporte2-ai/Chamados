# Fase 8 — Frontend: Auth + Chamados (Design Spec)

Data: 2026-06-25

## 1. Visão geral

Fase 8 cria o frontend do helpdesk do zero: aplicação React SPA consumindo a API REST já existente (Fases 1–7). O escopo desta fase cobre autenticação, layout global, notificações e o módulo de chamados completo. A Fase 9 completará dashboard, desempenho, ideias e admin.

## 2. Escopo

**Incluído:**
- Scaffold do projeto React + Vite + Tailwind + shadcn/ui
- Autenticação: login, recuperação de senha, reset de senha
- Layout global: AppShell com sidebar responsiva, header com notificações
- Notificações: polling 15s, dropdown, marcar lida/todas
- Chamados: lista com filtros, abertura, detalhe completo (campos, comentários, timeline, anexos)

**Excluído (Fase 9):**
- Dashboard principal
- Painel de desempenho
- Módulo de ideias
- Admin (usuários, roles, categorias, setores, SLA)

## 3. Stack

| Tecnologia | Versão | Papel |
|-----------|--------|-------|
| React | 18 | UI |
| Vite | 5 | Build / dev server |
| Tailwind CSS | 3 | Estilização |
| shadcn/ui | latest | Componentes (copiados em `src/components/ui/`) |
| React Router | v6 | Roteamento |
| Zustand | 4 | Estado global de auth |
| TanStack Query | v5 | Server state + polling |
| Axios | 1 | Cliente HTTP com interceptor de refresh |

## 4. Estrutura de pastas

```
frontend/
  index.html
  vite.config.js
  tailwind.config.js
  postcss.config.js
  package.json
  src/
    main.jsx              — ReactDOM.createRoot + QueryClientProvider + RouterProvider
    App.jsx               — definição de rotas (createBrowserRouter)
    lib/
      axios.js            — instância axios com interceptor de refresh token
      queryClient.js      — instância QueryClient (staleTime, retry config)
      utils.js            — formatDate, formatTicketId (#00142), SLA_BADGE_COLORS (mapa vermelho/amarelo/verde → classes CSS)
    stores/
      authStore.js        — Zustand: { user, permissions, fieldVisibilities, setAuth, logout }
    api/
      auth.js             — login, logout, forgotPassword, resetPassword, refreshToken
      tickets.js          — list, get, create, update, addComment, addAttachment, reopen
      notifications.js    — list, markRead, markAllRead
    components/
      ui/                 — shadcn components (Button, Badge, Dialog, Input, Select, etc.)
      layout/
        AppShell.jsx      — wrapper: Sidebar + Header + <Outlet>
        Sidebar.jsx       — nav links filtrados por permissão, drawer no mobile
        Header.jsx        — breadcrumb + NotificationBell + avatar menu
        NotificationBell.jsx  — sino + dropdown + polling
      ProtectedRoute.jsx  — verifica authStore; redireciona /login se não autenticado
    pages/
      auth/
        LoginPage.jsx
        ForgotPasswordPage.jsx
        ResetPasswordPage.jsx
      tickets/
        TicketListPage.jsx
        TicketDetailPage.jsx
        TicketNewPage.jsx
    hooks/
      useAuth.js          — retorna { user, permissions, fieldVisible, logout }
      useNotifications.js — TanStack Query com refetchInterval: 15000
```

## 5. Roteamento

```
/login                        — pública
/forgot-password              — pública (resposta sempre 200 independente do e-mail existir — anti-enumeração do backend)
/reset-password/:token        — pública (token lido via `useParams()` e enviado no body: `{ token, password }`)

/tickets                      — protegida (qualquer autenticado)
/tickets/new                  — protegida
/tickets/:id                  — protegida
```

`<ProtectedRoute>` lê `authStore`. Se `user === null`: redireciona para `/login` preservando `?redirect=/rota-original`. Após login bem-sucedido, redireciona para a rota original.

Todas as rotas protegidas são filhas de `AppShell` via `<Outlet>` (layout aninhado do React Router v6).

## 6. Autenticação e estado global

### authStore (Zustand)

```js
// stores/authStore.js
{
  user: null,             // { id, name, email, role }
  permissions: Set(),     // Set<string> de permissionKey habilitadas
  fieldVisibilities: Set(), // Set<string> de fieldKey visíveis — chave plural (igual ao backend)
  setAuth(payload),       // chamado após login/me; recebe { user, permissions[], fieldVisibilities[] }
  logout(),               // limpa store + chama POST /api/auth/logout (204); cookie httpOnly é limpo pelo backend
}
```

O payload de login retorna `{ user, permissions: string[], fieldVisibilities: string[] }` (chave plural — igual ao que o backend retorna em `profilePayloadFromUserWithRole`). O store converte arrays para `Set` para lookup O(1).

### Axios interceptor (`lib/axios.js`)

- **Request:** adiciona `Authorization: Bearer <accessToken>` (token guardado em memória, não em localStorage)
- **Response error 401:** tenta `POST /api/auth/refresh` uma vez; se sucesso, refaz a request original; se falhar, chama `authStore.logout()` e redireciona para `/login`
- Access token guardado em módulo-scope (variável do módulo `axios.js`), nunca em `localStorage`/`sessionStorage`
- **Restauração de sessão (2 passos):** ao inicializar o app, se `user === null` no store: (1) `POST /api/auth/refresh` — se retornar 200, extrai `accessToken` e armazena em módulo-scope; (2) `GET /api/auth/me` com `Authorization: Bearer <accessToken>` — popula o store com `{ user, permissions, fieldVisibilities }`. Se qualquer passo retornar 401/erro, mostra `/login`. `GET /api/auth/me` exige Bearer token e NÃO usa o cookie diretamente — sem o passo 1, o store não é populado.

### `useAuth` hook

```js
// Lê do authStore; provê helpers
const { user, permissions, fieldVisible, logout } = useAuth();
fieldVisible('assigned_to') // → boolean
permissions.has('reassign_tickets') // → boolean
```

## 7. Notificações

### `useNotifications` hook

```js
// TanStack Query com polling
useQuery({
  queryKey: ['notifications'],
  queryFn: () => api.notifications.list(),
  refetchInterval: 15_000,
})
```

### `NotificationBell`

- Ícone sino no header
- Badge vermelho com contagem de `isRead === false`; some quando zerado
- `document.title`: `(N) Helpdesk` quando N > 0, `Helpdesk` quando zero
- Clique: abre `Popover` (shadcn) listando as 10 notificações mais recentes (`.slice(0, 10)` no frontend — a API retorna todas não lidas + recentes)
- Cada notificação: ícone de tipo + mensagem + tempo relativo ("há 5 min")
- Clique na notificação: `PATCH /api/notifications/:id/read` → navega para `notification.link`
- Botão "Marcar todas como lidas": `PATCH /api/notifications/read-all` → invalida query

## 8. Layout global (AppShell)

### Sidebar

Desktop (≥ 768px): fixa à esquerda, largura 240px.  
Mobile (< 768px): oculta por padrão; abre como drawer deslizante via ícone de hambúrguer no header.

Links presentes nesta fase (Fase 9 adicionará mais):
- Chamados (`/tickets`) — sempre visível
- Novo Chamado (`/tickets/new`) — sempre visível

Links condicionais por permissão (apenas referência; renderizados na Fase 9):
- Desempenho — `view_performance_panel`
- Ideias — sempre visível
- Admin — `manage_users` ou `manage_ideas`

### Header

- Lado esquerdo: botão hambúrguer (mobile) + breadcrumb dinâmico da rota atual
- Lado direito: `NotificationBell` + avatar com menu dropdown (nome do usuário, botão Sair)

## 9. Módulo de Chamados

### Lista (`/tickets`)

**Filtros (query params):**
| Param | Componente | Valores |
|-------|-----------|---------|
| `status` | Multi-select (shadcn) | ABERTO, EM_ANDAMENTO, AGUARDANDO, RESOLVIDO, FECHADO |
| `urgency` | Select | CRITICO, ALTO, MEDIO, BAIXO |
| `sectorId` | Select | setores carregados de `GET /api/sectors` |
| `from` / `to` | Date inputs | período de criação (**pré-requisito backend:** filtros `from`/`to` não existem ainda na rota `GET /api/tickets` — extensão necessária na Fase 8) |
| `search` | Input texto | busca no título |

Filtros persistidos em query params da URL (compartilháveis/navegáveis com back/forward).

**Tabela:**
| Coluna | Sempre visível | Condicional |
|--------|---------------|-------------|
| # | ✓ | |
| Título | ✓ | |
| Status | ✓ | |
| Urgência | ✓ | |
| Setor | ✓ | |
| Atribuído a | | `fieldVisible('assigned_to')` |
| SLA | | `fieldVisible('sla_badge')` |
| Criado em | ✓ | |

Paginação: `?page=1&pageSize=20`, controles de página no rodapé da tabela.  
Linha clicável → `navigate('/tickets/:id')`.  
Botão "Novo chamado" no topo direito.

**TanStack Query:** `queryKey: ['tickets', filtros]`; invalidado após criar ou atualizar chamado.

### Abertura (`/tickets/new`)

Campos:
- **Título** — `Input` obrigatório
- **Descrição** — `Textarea` obrigatório
- **Categoria** — `Select` carregado de `GET /api/categories`; ao mudar, limpa subcategoria
- **Subcategoria** — `Select` dependente da categoria selecionada; opções filtradas client-side a partir dos dados da categoria (incluída na resposta de `/api/categories` com `subcategories`)
- **Urgência** — `Select` com opções fixas: CRITICO, ALTO, MEDIO, BAIXO

Validação: todos os campos obrigatórios; Subcategoria obrigatória se a categoria tiver subcategorias.

Submit: `POST /api/tickets` → redireciona para `/tickets/:id` com toast "Chamado #X aberto com sucesso".

### Detalhe (`/tickets/:id`)

**Header do chamado:**
- `#00142` (zero-padded com `String(id).padStart(5, '0')`) + título
- Badges: Status (colorido por estado), Urgência (colorido por criticidade), SLA (badge colorida conforme `ticket.slaBadge`)

**SLA badge (valor do backend):**
O backend já retorna `ticket.slaBadge` com os valores `'vermelho'`, `'amarelo'` ou `'verde'` (ou `null` se sem SLA). O frontend mapeia esse valor para a cor CSS correspondente — não recalcula no cliente.
```js
const SLA_BADGE_COLORS = {
  vermelho: 'bg-red-100 text-red-700',
  amarelo:  'bg-yellow-100 text-yellow-700',
  verde:    'bg-green-100 text-green-700',
};
```

**Painel de campos (lado direito no desktop, abaixo do header no mobile):**
- Solicitante (nome)
- Atribuído a — select editável se `permissions.has('reassign_tickets')`; chama `PATCH /api/tickets/:id` com `{ assignedToId }`
- Setor (leitura)
- Categoria / Subcategoria (leitura)
- Urgência (leitura)
- Status — select editável conforme transições permitidas e permissões (`close_tickets`, `reopen_tickets`)
- Criado em / Resolvido em / Fechado em
- Custo estimado — input numérico editável se `permissions.has('update_cost')`; visível apenas se `fieldVisible('estimated_cost')`

**Ações:**
- Mudar status: dropdown com estados válidos a partir do estado atual → chama `PATCH /api/tickets/:id` com `{ status }` (transições normais — ex: ABERTO → EM_ANDAMENTO)
- Fechar: visível se `permissions.has('close_tickets')` e status ≠ FECHADO → incluso no dropdown de status (transição RESOLVIDO → FECHADO via `PATCH`)
- Reabrir: botão dedicado, visível se `permissions.has('reopen_tickets')` e status === RESOLVIDO → chama `POST /api/tickets/:id/reopen` (endpoint próprio, não via PATCH status)

**Comentários:**
- Lista de comentários em ordem cronológica
- Notas internas (`isInternal: true`) marcadas visualmente com fundo amarelo + ícone de cadeado; visíveis apenas se `permissions.has('view_internal_notes')`
- Formulário de novo comentário:
  - `Textarea` para o corpo — campo `body` no payload (`{ body: string, isInternal: boolean }`)
  - Toggle "Nota interna" — visível apenas se `permissions.has('view_internal_notes')`
  - Upload de arquivo (opcional) — `input type=file`, envia em `POST /api/tickets/:id/attachments` separado
  - Submit: `POST /api/tickets/:id/comments` com `{ body, isInternal }`

**Timeline:**
- Lista de eventos do `TicketTimeLog` em ordem cronológica
- Cada evento: ícone contextual + descrição legível (ex: "Status alterado para EM_ANDAMENTO por Carla Mendes") + data/hora relativa
- Colapsável (expandir/recolher) para não poluir a tela
- **Pré-requisito backend (Fase 8):** `GET /api/tickets/:id` precisa incluir `timeLogs` no response (atualmente não inclui). A extensão do endpoint é o primeiro passo antes de implementar a timeline.

**Anexos:**
- Lista de arquivos com nome, data de upload e link de download
- Download via `GET /api/tickets/:ticketId/attachments/:attachmentId` (rota autenticada)
- **Pré-requisito backend (Fase 8):** `GET /api/tickets/:id` precisa incluir `attachments` no response (atualmente não inclui). A extensão do endpoint é o primeiro passo antes de implementar a lista de anexos.

## 10. Tratamento de erros e UX

- **Erros de API**: toast de erro (shadcn `Sonner` ou similar) com mensagem genérica para 500, mensagem da API para 400/422/409
- **Loading states**: skeleton loaders na lista de tickets e no detalhe; spinner em botões durante submit
- **404**: página de ticket inexistente/sem acesso exibe mensagem "Chamado não encontrado"
- **Formulários**: validação client-side com mensagens inline antes de submeter; botão de submit desabilitado enquanto aguarda resposta

## 11. Responsividade

- **Desktop (≥ 768px)**: sidebar fixa, detalhe do ticket em layout de duas colunas (campos à direita, comentários/timeline à esquerda)
- **Mobile (< 768px)**: sidebar como drawer, detalhe em coluna única, tabela de tickets com colunas reduzidas (apenas #, Título, Status)

## 12. Configuração e variáveis de ambiente

```
frontend/.env.example:
VITE_API_BASE_URL=http://localhost:3000
```

Axios usa `VITE_API_BASE_URL` como `baseURL`. Em produção, apontar para o domínio do backend.

## 13. Ordem de implementação

**Extensões de backend (pré-requisito antes do frontend):**
- 0a. Extender `GET /api/tickets/:id` para incluir `timeLogs` e `attachments` no response
- 0b. Extender `GET /api/tickets` para suportar filtros `from` e `to` (query params, período de criação)

**Frontend:**
1. Scaffold: Vite + React + Tailwind + shadcn/ui inicializado
2. `lib/axios.js` + `lib/queryClient.js` + `stores/authStore.js`
3. Páginas de auth (Login, ForgotPassword, ResetPassword) + ProtectedRoute
4. AppShell (Sidebar + Header) + NotificationBell com polling
5. TicketListPage com filtros e tabela
6. TicketNewPage
7. TicketDetailPage (campos + status + ações)
8. Comentários + upload de anexos + timeline
