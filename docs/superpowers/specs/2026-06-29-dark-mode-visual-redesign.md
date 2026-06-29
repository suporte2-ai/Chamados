# Redesign Visual + Dark Mode — Design Spec

**Data:** 2026-06-29
**Status:** Aprovado

## 1. Visão Geral

Redesign completo do frontend com duas metas:

1. **Dark mode real** — alternador claro/escuro persistido no `localStorage`, baseado em CSS variables e a estratégia `class` do Tailwind
2. **Visual moderno** — sidebar escura, dashboard com cards profissionais, badges refinados, layout de detalhe de chamado mais estruturado

Nenhuma dependência nova é adicionada. O projeto já usa shadcn/ui com CSS variables, Tailwind 3 e Lucide React — tudo necessário já está disponível.

---

## 2. Stack e Convenções

Inalteradas das fases anteriores:
- **Frontend:** React 18, Vite 5, Tailwind CSS 3, shadcn/ui, React Router v6, Zustand 4, TanStack Query v5, Axios 1
- **Sem novas dependências**

---

## 3. Infraestrutura de Tema

### 3.1 Tailwind — ativar dark mode

Adicionar `darkMode: 'class'` em `frontend/tailwind.config.js`:

```js
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // ...resto inalterado
}
```

### 3.2 CSS Variables — tema escuro

Adicionar bloco `.dark` em `frontend/src/index.css` com variáveis calibradas para fundo slate escuro (estilo Linear/Vercel):

```css
.dark {
  --background: 222 47% 9%;
  --foreground: 210 40% 98%;
  --card: 222 47% 12%;
  --card-foreground: 210 40% 98%;
  --popover: 222 47% 12%;
  --popover-foreground: 210 40% 98%;
  --primary: 217 91% 60%;
  --primary-foreground: 222 47% 9%;
  --secondary: 222 47% 16%;
  --secondary-foreground: 210 40% 98%;
  --muted: 222 47% 16%;
  --muted-foreground: 215 20% 65%;
  --accent: 222 47% 16%;
  --accent-foreground: 210 40% 98%;
  --destructive: 0 72% 51%;
  --destructive-foreground: 210 40% 98%;
  --border: 222 47% 18%;
  --input: 222 47% 18%;
  --ring: 217 91% 60%;
}
```

### 3.3 Hook `useTheme`

Criar `frontend/src/hooks/useTheme.js`:

- Lê preferência de `localStorage` (chave `theme`)
- Aplica/remove classe `dark` no elemento `<html>`
- Exporta `{ theme, toggleTheme }` — `theme` é `'light'` ou `'dark'`
- Inicializa com `'light'` se não houver preferência salva

---

## 4. Sidebar Redesign

**Arquivo:** `frontend/src/components/layout/Sidebar.jsx`

### Aparência
- Fundo: `bg-slate-900` (claro e escuro — a sidebar é sempre escura, como Linear, Vercel, Notion)
- Texto: `text-slate-300`, hover: `text-white bg-slate-800`
- Item ativo: `bg-blue-600 text-white`
- Logo: texto "Helpdesk" com ponto azul (`●`) à esquerda, fonte bold, cor branca

### Logo
```
● Helpdesk
```
Ponto em `text-blue-500`, texto em `text-white font-bold text-lg`

### Nav items
- Ícone + label alinhados, gap de 3
- Padding `px-3 py-2`, border-radius `rounded-lg`
- Sublinks de admin recuados com `ml-6`

---

## 5. Header Redesign

**Arquivo:** `frontend/src/components/layout/Header.jsx`

### Mudanças
- Adicionar botão toggle de tema (ícone `Sun` no modo escuro, `Moon` no modo claro)
- Posição: à esquerda do `NotificationBell`
- `bg-background border-b` — adapta ao tema automaticamente via CSS variable
- Breadcrumb mantido, tipografia levemente refinada (`font-semibold text-sm`)

---

## 6. Dashboard Redesign

**Arquivo:** `frontend/src/pages/DashboardPage.jsx`

### Cards de status
- Layout: `grid grid-cols-2 md:grid-cols-5 gap-4`
- Cada card: `bg-card rounded-xl border border-border p-5 text-left hover:shadow-md transition-all`
- Borda esquerda colorida por status: `border-l-4 border-l-{cor}`
- Número: `text-3xl font-bold text-foreground`
- Label: `text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2`
- Sublabel "chamados": `text-xs text-muted-foreground mt-1`

| Status | Cor da borda |
|--------|-------------|
| ABERTO | `border-l-blue-500` |
| EM_ANDAMENTO | `border-l-purple-500` |
| AGUARDANDO | `border-l-orange-500` |
| RESOLVIDO | `border-l-green-500` |
| FECHADO | `border-l-slate-400` |

### Painéis inferiores
- Cabeçalho: `bg-muted/40 border-b px-5 py-3`
- Linhas de ticket: hover com `hover:bg-muted/40`
- Badges com `rounded-full` (pill) e cores mais saturadas

---

## 7. Badges Globais (utils)

**Arquivo:** `frontend/src/lib/utils.js`

Atualizar `STATUS_COLORS` e `URGENCY_COLORS` para usar pill arredondado e cores mais vivas. As constantes exportadas são usadas em múltiplas páginas — a mudança propaga automaticamente.

### STATUS_COLORS (novo)
```js
ABERTO:       'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
EM_ANDAMENTO: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
AGUARDANDO:   'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
RESOLVIDO:    'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
FECHADO:      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
```

### URGENCY_COLORS (novo)
```js
CRITICO: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
ALTO:    'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
MEDIO:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300'
BAIXO:   'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
```

### SLA_BADGE_COLORS (novo)
```js
verde:   'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800'
amarelo: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-800'
vermelho:'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800'
```

Todos os badges passam a usar `rounded-full px-2.5 py-0.5 text-xs font-medium`.

---

## 8. Ticket List e Detail

### TicketListPage (`frontend/src/pages/tickets/TicketListPage.jsx`)
- Tabela: `bg-card rounded-xl border border-border overflow-hidden`
- Header da tabela: `bg-muted/50`
- Linhas: `hover:bg-muted/40 transition-colors`
- Badges com pill (via utils atualizado)

### TicketDetailPage (`frontend/src/pages/tickets/TicketDetailPage.jsx`)
- Header do chamado: título `text-xl font-bold`, badges lado a lado em flex-wrap
- Grid de metadados 2 colunas: `grid grid-cols-2 gap-4`
- Área de comentários: bolhas com `rounded-2xl`, fundo diferente por tipo (técnico vs solicitante)
  - Técnico: `bg-blue-50 dark:bg-blue-900/20`
  - Solicitante: `bg-muted`

---

## 9. AppShell

**Arquivo:** `frontend/src/components/layout/AppShell.jsx`

- `bg-background` (em vez de `bg-gray-50`) — garante que o fundo principal adapta ao tema
- `main`: `p-6` com `bg-background`

---

## 10. Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `frontend/tailwind.config.js` | Adicionar `darkMode: 'class'` |
| `frontend/src/index.css` | Adicionar bloco `.dark { ... }` com variáveis |
| `frontend/src/hooks/useTheme.js` | Criar hook de tema |
| `frontend/src/components/layout/AppShell.jsx` | `bg-background` |
| `frontend/src/components/layout/Sidebar.jsx` | Sidebar escura, logo, nav redesenhado |
| `frontend/src/components/layout/Header.jsx` | Toggle de tema, refinamento |
| `frontend/src/pages/DashboardPage.jsx` | Cards com borda colorida, painéis refinados |
| `frontend/src/lib/utils.js` | STATUS_COLORS e URGENCY_COLORS dark-aware |
| `frontend/src/pages/tickets/TicketListPage.jsx` | Tabela dark-aware, badges pill |
| `frontend/src/pages/tickets/TicketDetailPage.jsx` | Header, metadados grid, bolhas de comentário |

---

## 11. Ordem de Implementação

1. Tailwind config + CSS variables dark
2. Hook `useTheme`
3. AppShell + Sidebar + Header (layout base)
4. utils.js — badges
5. DashboardPage
6. TicketListPage
7. TicketDetailPage
