# Redesign Visual + Dark Mode — Design Spec

**Data:** 2026-06-29
**Status:** Aprovado

## 1. Visão Geral

Redesign completo do frontend com duas metas:

1. **Dark mode real** — alternador claro/escuro sem flash de conteúdo (FOUC), baseado em CSS variables e a estratégia `class` do Tailwind
2. **Visual moderno** — sidebar escura, dashboard com cards profissionais, badges refinados, layout de detalhe de chamado mais estruturado

Nenhuma dependência nova é adicionada. O projeto já usa shadcn/ui com CSS variables, Tailwind 3, Lucide React e **`next-themes`** (já instalado em `package.json`) — tudo necessário já está disponível.

---

## 2. Stack e Convenções

Inalteradas das fases anteriores:
- **Frontend:** React 18, Vite 5, Tailwind CSS 3, shadcn/ui, React Router v6, Zustand 4, TanStack Query v5, Axios 1
- **Sem novas dependências** — `next-themes` já está em `package.json`

---

## 3. Infraestrutura de Tema

### 3.1 Tailwind — ativar dark mode + corrigir `<alpha-value>`

Duas mudanças obrigatórias em `frontend/tailwind.config.js`:

1. Adicionar `darkMode: 'class'`
2. Adicionar o placeholder `<alpha-value>` em **todas** as definições de cor — sem isso, modificadores de opacidade como `bg-muted/40` são silenciosamente ignorados e produzem fundos totalmente opacos

```js
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        border:      'hsl(var(--border))',
        input:       'hsl(var(--input))',
        ring:        'hsl(var(--ring))',
        background:  'hsl(var(--background))',
        foreground:  'hsl(var(--foreground))',
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT:    'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
    },
  },
  plugins: [],
}
```

> `muted` recebe `<alpha-value>` porque é o único token usado com modificador de opacidade (`/40`, `/50`). Os demais podem ser migrados futuramente se necessário.

### 3.2 CSS Variables — tema escuro

Adicionar bloco `.dark` **dentro de `@layer base`** em `frontend/src/index.css` — o `:root` já está nessa layer e o `.dark` deve seguir a mesma convenção do shadcn/ui:

```css
@layer base {
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
}
```

### 3.3 Provedor de tema com `next-themes`

`next-themes` já está instalado (`package.json`). Usar o `ThemeProvider` dele em vez de hook manual resolve três problemas que um `useState`/`useEffect` não consegue evitar: FOUC, estado isolado por componente e ignorância da preferência do SO.

**`frontend/src/App.jsx`** — envolver a aplicação:

```jsx
import { ThemeProvider } from 'next-themes'

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {/* rotas existentes inalteradas */}
    </ThemeProvider>
  )
}
```

- `attribute="class"` → aplica `dark` no `<html>`, compatível com Tailwind
- `defaultTheme="system"` → respeita a preferência do SO quando não há escolha salva
- `enableSystem` → habilita detecção via `prefers-color-scheme`
- next-themes injeta um script bloqueante antes da hidratação do React — sem flash garantido

**`frontend/src/components/layout/Header.jsx`** — usar o hook do next-themes:

```jsx
import { useTheme } from 'next-themes'

const { theme, setTheme } = useTheme()
const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')
```

> Não criar `useTheme.js` manual — usar diretamente `import { useTheme } from 'next-themes'`.

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

> **Atenção ao NavItem ativo:** o código atual usa `bg-primary text-primary-foreground`. Em light mode, `--primary` é `222.2 47.4% 11.2%` (navy escuro) — praticamente invisível sobre `bg-slate-900`. **Substituir** a classe ativa de `bg-primary text-primary-foreground` para `bg-blue-600 text-white`. Aplicar o mesmo ao botão de Administração (`<button>` da accordion) que atualmente usa `text-gray-700 hover:bg-gray-100` — trocar para `text-slate-300 hover:bg-slate-800`.

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

> **Remover `STATUS_BG`:** DashboardPage tem uma constante local `STATUS_BG` (linhas ~11-17) com classes hardcoded de light mode (`bg-blue-50 border-blue-200` etc.) aplicadas nos cards. Essa constante deve ser **deletada** e removida do `cn()` dos cards — as novas classes abaixo a substituem completamente.

- Layout: `grid grid-cols-2 md:grid-cols-5 gap-4`
- Cada card: `bg-card rounded-xl border border-border p-5 text-left hover:shadow-md transition-shadow`
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

Atualizar `STATUS_COLORS`, `URGENCY_COLORS` e `SLA_BADGE_COLORS` (todas já existem em utils.js — são **atualizações**, não criações) com variantes dark-aware.

> **Sobre o shape dos badges:** as classes `rounded-full px-2.5 py-0.5 text-xs font-medium` **não** devem ser embutidas nas strings das constantes — são classes de layout aplicadas nos arquivos consumidores. Cada página que usa os badges deve ter suas classes de forma atualizadas individualmente (ver seção 8). Misturar layout dentro de constantes de cor dificulta overrides futuros.

### STATUS_COLORS (novo)
```js
ABERTO:       'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
EM_ANDAMENTO: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
AGUARDANDO:   'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
RESOLVIDO:    'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
FECHADO:      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
```

### URGENCY_COLORS (atualizar)
```js
CRITICO: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
ALTO:    'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
MEDIO:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300'
BAIXO:   'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
```

> `BAIXO` mantém verde — preserva a convenção semântica de semáforo (verde = baixa urgência = sem preocupação) que já existe no código atual. Apenas adiciona a variante dark.

### SLA_BADGE_COLORS (atualizar)
```js
verde:   'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800'
amarelo: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-800'
vermelho:'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800'
```

Nos arquivos consumidores, substituir as classes de forma dos badges de `rounded px-1.5 py-0.5` para `rounded-full px-2.5 py-0.5 text-xs font-medium`. Isso deve ser feito em cada arquivo listado na seção 10 que renderiza badges — **não** embutir no valor das constantes.

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
| `frontend/tailwind.config.js` | `darkMode: 'class'` + `<alpha-value>` em `muted` |
| `frontend/src/index.css` | Adicionar `.dark { ... }` dentro de `@layer base` |
| `frontend/src/App.jsx` | Envolver com `ThemeProvider` do next-themes |
| `frontend/src/components/layout/AppShell.jsx` | `bg-background` em vez de `bg-gray-50` |
| `frontend/src/components/layout/Sidebar.jsx` | Sidebar escura, logo, nav + corrigir NavItem ativo e botão admin |
| `frontend/src/components/layout/Header.jsx` | Toggle de tema via `useTheme` do next-themes |
| `frontend/src/pages/DashboardPage.jsx` | Remover `STATUS_BG`, cards com borda colorida, painéis refinados, badges pill |
| `frontend/src/lib/utils.js` | STATUS_COLORS, URGENCY_COLORS e SLA_BADGE_COLORS dark-aware |
| `frontend/src/pages/tickets/TicketListPage.jsx` | Tabela dark-aware, badges pill |
| `frontend/src/pages/tickets/TicketDetailPage.jsx` | Header, metadados grid, bolhas de comentário |
| `frontend/src/pages/ideas/IdeasListPage.jsx` | `bg-white`/`hover:bg-gray-50` → tokens de tema; `IDEA_STATUS_COLORS` dark-aware |
| `frontend/src/pages/ideas/IdeaDetailPage.jsx` | Cards e painel de nota dark-aware; badges pill |
| `frontend/src/pages/auth/LoginPage.jsx` | `bg-gray-50`/`bg-white` → `bg-background`/`bg-card` |
| `frontend/src/pages/ProfilePage.jsx` | Cards `bg-white` → `bg-card`; input desabilitado dark-aware |
| `frontend/src/pages/performance/PerformancePage.jsx` | Cards, tabela e modal `bg-white` → tokens de tema |

---

## 11. Ordem de Implementação

1. Tailwind config (`darkMode: 'class'` + `<alpha-value>` em muted)
2. CSS variables dark (`@layer base { .dark { ... } }`)
3. `App.jsx` — ThemeProvider do next-themes
4. AppShell + Sidebar + Header (layout base + toggle)
5. `utils.js` — STATUS_COLORS, URGENCY_COLORS, SLA_BADGE_COLORS dark-aware
6. DashboardPage (remover STATUS_BG, cards novos, badges pill)
7. TicketListPage + TicketDetailPage
8. IdeasListPage + IdeaDetailPage
9. LoginPage + ProfilePage + PerformancePage
