# Dark Mode + Visual Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar dark mode completo via next-themes + redesign visual da sidebar, dashboard, tickets e demais páginas.

**Architecture:** `ThemeProvider` do next-themes envolve a app em App.jsx — injeta um script bloqueante que aplica a classe `dark` no `<html>` antes da hidratação do React, eliminando FOUC. Todas as cores usam CSS variables do shadcn/ui com bloco `.dark` em `@layer base`. Sidebar sempre escura (bg-slate-900). Páginas adaptam via tokens `bg-card`, `bg-muted`, `text-foreground`.

**Tech Stack:** React 18, Vite 5, Tailwind CSS 3, shadcn/ui, next-themes (já instalado), Lucide React

## Global Constraints

- `next-themes` já está em `package.json` — não instalar nada
- Nenhuma mudança de backend
- Rodar `npm test` em `frontend/` após cada task — manter os 5 testes passando
- Verificação visual: `npm run dev` na raiz, abrir `http://localhost:5173`
- Commits frequentes por task

---

## Task 1: Tailwind config + CSS variables dark

**Files:**
- Modify: `frontend/tailwind.config.js`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Produces: classe `dark` no `<html>` ativa variáveis de tema escuro em todo o app; `bg-muted/40` e `bg-muted/50` funcionam com transparência real

- [ ] **Step 1: Atualizar tailwind.config.js**

Substituir o conteúdo completo do arquivo:

```js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        border:     'hsl(var(--border))',
        input:      'hsl(var(--input))',
        ring:       'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
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
        popover: {
          DEFAULT:    'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 2: Adicionar bloco `.dark` em index.css dentro de `@layer base`**

Localizar o fechamento do bloco `@layer base { ... }` (atualmente termina após `body { ... }`). Adicionar o bloco `.dark` **antes** do fechamento do `@layer base`:

```css
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }

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

  * {
    border-color: hsl(var(--border));
  }

  body {
    background-color: hsl(var(--background));
    color: hsl(var(--foreground));
  }
}
```

- [ ] **Step 3: Verificar build**

```bash
cd frontend && npm run build 2>&1 | tail -5
```

Saída esperada: `✓ built in` sem erros.

- [ ] **Step 4: Commit**

```bash
git add frontend/tailwind.config.js frontend/src/index.css
git commit -m "feat: add darkMode class + CSS variables + alpha-value for muted"
```

---

## Task 2: ThemeProvider + Header toggle

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/layout/Header.jsx`

**Interfaces:**
- Consumes: `ThemeProvider` e `useTheme` de `next-themes`; CSS variables dark (Task 1)
- Produces: toggle Sol/Lua no header; preferência persistida em localStorage; sem FOUC

- [ ] **Step 1: Envolver app com ThemeProvider em App.jsx**

Em `frontend/src/App.jsx`, adicionar o import na linha 1:

```js
import { ThemeProvider } from 'next-themes'
```

Localizar a função `App` no final do arquivo (linha 150):

```js
export default function App() {
  return <RouterProvider router={router} />
}
```

Substituir por:

```js
export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <RouterProvider router={router} />
    </ThemeProvider>
  )
}
```

- [ ] **Step 2: Adicionar toggle de tema no Header.jsx**

Substituir o conteúdo completo de `frontend/src/components/layout/Header.jsx`:

```jsx
import { useLocation, useNavigate } from 'react-router-dom'
import { Menu, Sun, Moon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import NotificationBell from './NotificationBell'
import { useAuth } from '@/hooks/useAuth'

const BREADCRUMBS = {
  '/tickets': 'Chamados',
  '/tickets/new': 'Novo Chamado',
  '/perfil': 'Meu Perfil',
}

function getBreadcrumb(pathname) {
  if (BREADCRUMBS[pathname]) return BREADCRUMBS[pathname]
  if (pathname.match(/^\/tickets\/\d+$/)) return 'Detalhe do Chamado'
  return 'Helpdesk'
}

export default function Header({ onMenuClick }) {
  const location = useLocation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  const initials = user?.name
    ? user.name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()
    : '?'

  return (
    <header className="h-16 flex items-center justify-between px-4 border-b bg-background shrink-0">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenuClick}>
          <Menu className="h-5 w-5" />
        </Button>
        <span className="font-semibold text-sm text-foreground">{getBreadcrumb(location.pathname)}</span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title="Alternar tema"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <span className="hidden sm:block text-sm">{user?.name}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <div className="px-3 py-2 text-sm text-muted-foreground">{user?.email}</div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/perfil')} className="cursor-pointer">
              Meu perfil
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-red-600 cursor-pointer">
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
```

- [ ] **Step 3: Verificar build e testes**

```bash
cd frontend && npm run build 2>&1 | tail -5
npm test 2>&1 | tail -5
```

Saída esperada: build OK, `5 passed`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/layout/Header.jsx
git commit -m "feat: add ThemeProvider and theme toggle button in header"
```

---

## Task 3: AppShell + Sidebar redesign

**Files:**
- Modify: `frontend/src/components/layout/AppShell.jsx`
- Modify: `frontend/src/components/layout/Sidebar.jsx`

**Interfaces:**
- Produces: sidebar sempre escura (bg-slate-900); nav items com cores corretas; fundo principal adapta ao tema

- [ ] **Step 1: Atualizar AppShell.jsx**

Substituir o conteúdo completo:

```jsx
import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-6 bg-background">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Substituir Sidebar.jsx completo**

```jsx
import { NavLink } from 'react-router-dom'
import { useState } from 'react'
import { Ticket, PlusCircle, X, LayoutDashboard, BarChart2, Lightbulb, Settings, ChevronDown, ChevronUp } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'

const ADMIN_PERMISSIONS = ['manage_users', 'manage_categories', 'manage_sla']

const ADMIN_LINKS = [
  { to: '/admin/users',      label: 'Usuários',   perm: 'manage_users' },
  { to: '/admin/roles',      label: 'Perfis',     perm: 'manage_users' },
  { to: '/admin/categories', label: 'Categorias', perm: 'manage_categories' },
  { to: '/admin/sectors',    label: 'Setores',    perm: 'manage_categories' },
  { to: '/admin/sla',        label: 'SLA',        perm: 'manage_sla' },
]

function NavItem({ to, icon: Icon, label, exact, onClick }) {
  return (
    <NavLink
      to={to}
      end={exact}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
          isActive
            ? 'bg-blue-600 text-white'
            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        )
      }
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      {label}
    </NavLink>
  )
}

function SidebarContent({ onClose }) {
  const permissions = useAuthStore((s) => s.permissions)
  const [adminOpen, setAdminOpen] = useState(false)
  const hasAnyAdmin = ADMIN_PERMISSIONS.some(p => permissions.has(p))

  return (
    <nav className="p-4 space-y-1">
      <NavItem to="/" icon={LayoutDashboard} label="Dashboard" exact onClick={onClose} />
      <NavItem to="/tickets" icon={Ticket} label="Chamados" exact onClick={onClose} />
      <NavItem to="/tickets/new" icon={PlusCircle} label="Novo Chamado" onClick={onClose} />
      <NavItem to="/ideas" icon={Lightbulb} label="Ideias" onClick={onClose} />
      {permissions.has('view_performance_panel') && (
        <NavItem to="/performance" icon={BarChart2} label="Desempenho" onClick={onClose} />
      )}
      {hasAnyAdmin && (
        <div>
          <button
            onClick={() => setAdminOpen(v => !v)}
            className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <span className="flex items-center gap-3">
              <Settings className="h-4 w-4 shrink-0" />
              Administração
            </span>
            {adminOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {adminOpen && (
            <div className="ml-6 mt-1 space-y-1">
              {ADMIN_LINKS.filter(l => permissions.has(l.perm)).map(l => (
                <NavItem key={l.to} to={l.to} label={l.label} onClick={onClose} />
              ))}
            </div>
          )}
        </div>
      )}
    </nav>
  )
}

export default function Sidebar({ open, onClose }) {
  return (
    <>
      <aside className="hidden md:flex md:flex-col w-60 bg-slate-900 shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-slate-800">
          <span className="text-blue-500 mr-2 text-lg">●</span>
          <span className="text-white font-bold text-lg">Helpdesk</span>
        </div>
        <SidebarContent onClose={() => {}} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={onClose} />
          <aside className="relative z-50 flex flex-col w-60 h-full bg-slate-900 shadow-xl">
            <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800">
              <div className="flex items-center">
                <span className="text-blue-500 mr-2 text-lg">●</span>
                <span className="text-white font-bold text-lg">Helpdesk</span>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarContent onClose={onClose} />
          </aside>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 3: Verificar build e testes**

```bash
cd frontend && npm run build 2>&1 | tail -5
npm test 2>&1 | tail -5
```

Saída esperada: build OK, `5 passed`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/AppShell.jsx frontend/src/components/layout/Sidebar.jsx
git commit -m "feat: redesign sidebar (always dark) and update AppShell bg tokens"
```

---

## Task 4: utils.js — badges dark-aware

**Files:**
- Modify: `frontend/src/lib/utils.js`

**Interfaces:**
- Produces: `STATUS_COLORS`, `URGENCY_COLORS`, `SLA_BADGE_COLORS` com variantes `dark:` — consumidos por todas as páginas que renderizam badges

- [ ] **Step 1: Atualizar as três constantes de cor**

Em `frontend/src/lib/utils.js`, substituir os três blocos de constantes de cor:

```js
export const SLA_BADGE_COLORS = {
  vermelho: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800',
  amarelo:  'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-800',
  verde:    'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800',
}
```

```js
export const STATUS_COLORS = {
  ABERTO:       'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  EM_ANDAMENTO: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  AGUARDANDO:   'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  RESOLVIDO:    'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  FECHADO:      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}
```

```js
export const URGENCY_COLORS = {
  CRITICO: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  ALTO:    'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  MEDIO:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  BAIXO:   'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
}
```

- [ ] **Step 2: Rodar testes**

```bash
cd frontend && npm test 2>&1 | tail -5
```

Saída esperada: `5 passed`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/utils.js
git commit -m "feat: add dark-mode variants to STATUS_COLORS, URGENCY_COLORS, SLA_BADGE_COLORS"
```

---

## Task 5: DashboardPage redesign

**Files:**
- Modify: `frontend/src/pages/DashboardPage.jsx`

**Interfaces:**
- Consumes: CSS variables dark (Task 1); STATUS_COLORS dark-aware (Task 4)
- Produces: cards com borda colorida e bg-card; painéis inferiores dark-aware; badges pill

- [ ] **Step 1: Remover STATUS_BG e atualizar cards de status**

Localizar e **deletar** as linhas 11-17 (constante `STATUS_BG`):

```js
const STATUS_BG = {
  ABERTO: 'bg-blue-50 border-blue-200',
  EM_ANDAMENTO: 'bg-purple-50 border-purple-200',
  AGUARDANDO: 'bg-orange-50 border-orange-200',
  RESOLVIDO: 'bg-green-50 border-green-200',
  FECHADO: 'bg-gray-50 border-gray-200',
}
```

Adicionar no lugar a constante de borda colorida:

```js
const STATUS_BORDER = {
  ABERTO:       'border-l-blue-500',
  EM_ANDAMENTO: 'border-l-purple-500',
  AGUARDANDO:   'border-l-orange-500',
  RESOLVIDO:    'border-l-green-500',
  FECHADO:      'border-l-slate-400',
}
```

- [ ] **Step 2: Atualizar o JSX dos cards de status**

Localizar o bloco dos cards (dentro do `grid grid-cols-2 md:grid-cols-5`):

```jsx
<button
  key={status}
  onClick={() => navigate(`/tickets?status=${status}`)}
  className={cn('border rounded-lg p-4 text-left hover:shadow-sm transition-shadow', STATUS_BG[status])}
>
  <p className="text-xs font-medium text-gray-500 mb-1">{STATUS_LABELS[status]}</p>
  {q.isLoading
    ? <Skeleton className="h-6 w-12" />
    : <p className="text-2xl font-bold text-gray-800">{q.data?.total ?? '—'}</p>
  }
</button>
```

Substituir por:

```jsx
<button
  key={status}
  onClick={() => navigate(`/tickets?status=${status}`)}
  className={cn(
    'bg-card border border-border border-l-4 rounded-xl p-5 text-left hover:shadow-md transition-shadow',
    STATUS_BORDER[status]
  )}
>
  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
    {STATUS_LABELS[status]}
  </p>
  {q.isLoading
    ? <Skeleton className="h-8 w-16" />
    : <p className="text-3xl font-bold text-foreground">{q.data?.total ?? '—'}</p>
  }
  <p className="text-xs text-muted-foreground mt-1">chamados</p>
</button>
```

- [ ] **Step 3: Atualizar painéis inferiores e badges**

Localizar e substituir as divs dos painéis:

Padrão a substituir nos dois painéis (`bg-white border rounded-lg`):
```jsx
<div className="bg-white border rounded-lg">
```
Substituir por:
```jsx
<div className="bg-card border border-border rounded-xl">
```

Cabeçalho dos painéis (`px-5 py-3 border-b font-medium text-sm`):
```jsx
<div className="px-5 py-3 border-b font-medium text-sm flex items-center justify-between">
```
Substituir por:
```jsx
<div className="px-5 py-3 border-b bg-muted/40 font-medium text-sm flex items-center justify-between">
```

Linhas de hover nos `<tr>` (`hover:bg-gray-50`):
```jsx
className="hover:bg-gray-50 cursor-pointer"
```
Substituir por:
```jsx
className="hover:bg-muted/40 cursor-pointer transition-colors"
```

Linhas de hover nos `<div>` do painel de SLA (`hover:bg-gray-50`):
```jsx
className="px-5 py-3 hover:bg-gray-50 cursor-pointer flex items-center justify-between gap-2"
```
Substituir por:
```jsx
className="px-5 py-3 hover:bg-muted/40 cursor-pointer flex items-center justify-between gap-2 transition-colors"
```

Badges dos tickets nos painéis — substituir `px-1.5 py-0.5 rounded` por `px-2.5 py-0.5 rounded-full`:
```jsx
<span className={cn('px-1.5 py-0.5 rounded text-xs font-medium', STATUS_COLORS[t.status])}>
```
Substituir por:
```jsx
<span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[t.status])}>
```

(Fazer o mesmo para URGENCY_COLORS e SLA_BADGE_COLORS onde aparecerem com `px-1.5`)

- [ ] **Step 4: Verificar build e testes**

```bash
cd frontend && npm run build 2>&1 | tail -5
npm test 2>&1 | tail -5
```

Saída esperada: build OK, `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/DashboardPage.jsx
git commit -m "feat: redesign dashboard cards and panels with dark-mode support"
```

---

## Task 6: TicketListPage + TicketDetailPage

**Files:**
- Modify: `frontend/src/pages/tickets/TicketListPage.jsx`
- Modify: `frontend/src/pages/tickets/TicketDetailPage.jsx`

**Interfaces:**
- Consumes: CSS variables dark (Task 1); constantes dark-aware (Task 4)
- Produces: tabela e filtros dark-aware; badges pill; detalhe com grid de metadados e bolhas de comentário

- [ ] **Step 1: Atualizar TicketListPage — filtros e tabela**

Painel de filtros (linha ~71):
```jsx
<div className="bg-white border rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
```
Substituir por:
```jsx
<div className="bg-card border border-border rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
```

Selects dentro dos filtros — adicionar classes dark nos `<select>`:
```jsx
className="border rounded-md px-3 py-2 text-sm w-full"
```
Substituir por:
```jsx
className="border border-border rounded-md px-3 py-2 text-sm w-full bg-background text-foreground"
```

Inputs de data — mesma correção:
```jsx
className="border rounded-md px-3 py-2 text-sm flex-1"
```
Substituir por:
```jsx
className="border border-border rounded-md px-3 py-2 text-sm flex-1 bg-background text-foreground"
```

Tabela wrapper (linha ~112):
```jsx
<div className="bg-white border rounded-lg overflow-hidden">
```
Substituir por:
```jsx
<div className="bg-card border border-border rounded-xl overflow-hidden">
```

Thead:
```jsx
<thead className="border-b bg-gray-50">
  <tr>
    <th className="px-4 py-3 text-left font-medium text-gray-600 w-24">#</th>
    <th className="px-4 py-3 text-left font-medium text-gray-600">Título</th>
    <th className="px-4 py-3 text-left font-medium text-gray-600 hidden sm:table-cell">Status</th>
    <th className="px-4 py-3 text-left font-medium text-gray-600 hidden md:table-cell">Urgência</th>
    <th className="px-4 py-3 text-left font-medium text-gray-600 hidden lg:table-cell">Setor</th>
    {showAssignedTo && <th className="px-4 py-3 text-left font-medium text-gray-600 hidden lg:table-cell">Atribuído a</th>}
    {showSla && <th className="px-4 py-3 text-left font-medium text-gray-600 hidden xl:table-cell">SLA</th>}
    <th className="px-4 py-3 text-left font-medium text-gray-600 hidden xl:table-cell">Criado em</th>
  </tr>
</thead>
```
Substituir por:
```jsx
<thead className="border-b bg-muted/50">
  <tr>
    <th className="px-4 py-3 text-left font-medium text-muted-foreground w-24">#</th>
    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Título</th>
    <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">Status</th>
    <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Urgência</th>
    <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">Setor</th>
    {showAssignedTo && <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">Atribuído a</th>}
    {showSla && <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden xl:table-cell">SLA</th>}
    <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden xl:table-cell">Criado em</th>
  </tr>
</thead>
```

Linhas da tabela:
```jsx
className="hover:bg-gray-50 cursor-pointer"
```
Substituir por:
```jsx
className="hover:bg-muted/40 cursor-pointer transition-colors"
```

Células de texto:
```jsx
<td className="px-4 py-3 text-gray-500 font-mono">{formatTicketId(t.id)}</td>
<td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">{t.title}</td>
```
Substituir por:
```jsx
<td className="px-4 py-3 text-muted-foreground font-mono">{formatTicketId(t.id)}</td>
<td className="px-4 py-3 font-medium text-foreground max-w-xs truncate">{t.title}</td>
```

Badges — substituir `px-2 py-0.5` por `px-2.5 py-0.5 rounded-full` em todos os `<span>` de status, urgência e SLA:
```jsx
<span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[t.status])}>
```
Manter `rounded-full`, apenas garantir `px-2.5`:
```jsx
<span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[t.status])}>
```
Aplicar o mesmo para URGENCY_COLORS e SLA_BADGE_COLORS.

Células de texto auxiliar:
```jsx
<td className="px-4 py-3 text-gray-600 hidden lg:table-cell">{t.sector?.name ?? '—'}</td>
```
Substituir por:
```jsx
<td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{t.sector?.name ?? '—'}</td>
```

- [ ] **Step 2: Atualizar TicketDetailPage — header, metadados, comentários**

Leia o arquivo `frontend/src/pages/tickets/TicketDetailPage.jsx` antes de editar. Padrões a aplicar:

**Header do chamado:** localizar a div principal do header do ticket. Adicionar `text-foreground` ao título e usar `flex-wrap gap-2` nos badges.

**Grid de metadados:** localizar seção com campos como Setor, Responsável, Urgência. Se estiver em divs sequenciais, envolver em:
```jsx
<div className="grid grid-cols-2 gap-4 text-sm">
```
Cada item de metadado:
```jsx
<div>
  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Setor</p>
  <p className="text-foreground">{ticket.sector?.name ?? '—'}</p>
</div>
```

**Área de comentários / notas internas:** localizar os blocos de comentário. Para bolhas de técnico (notas internas ou respostas de técnico):
```jsx
className="... bg-blue-50 dark:bg-blue-900/20 rounded-2xl px-4 py-3"
```
Para bolhas de solicitante:
```jsx
className="... bg-muted rounded-2xl px-4 py-3"
```

**Substituições gerais em TicketDetailPage:**
- `bg-white` → `bg-card`
- `bg-gray-50` → `bg-muted/50`
- `hover:bg-gray-50` → `hover:bg-muted/40`
- `text-gray-500` → `text-muted-foreground`
- `text-gray-700` → `text-foreground`
- `text-gray-900` → `text-foreground`
- `border` sem `border-border` → adicionar `border-border`
- badges `px-1.5` → `px-2.5 rounded-full`

- [ ] **Step 3: Verificar build e testes**

```bash
cd frontend && npm run build 2>&1 | tail -5
npm test 2>&1 | tail -5
```

Saída esperada: build OK, `5 passed`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/tickets/TicketListPage.jsx frontend/src/pages/tickets/TicketDetailPage.jsx
git commit -m "feat: update ticket list and detail pages for dark mode"
```

---

## Task 7: IdeasListPage + IdeaDetailPage

**Files:**
- Modify: `frontend/src/pages/ideas/IdeasListPage.jsx`
- Modify: `frontend/src/pages/ideas/IdeaDetailPage.jsx`

**Interfaces:**
- Produces: páginas de ideias dark-aware; IDEA_STATUS_COLORS com variantes dark

- [ ] **Step 1: Atualizar IDEA_STATUS_COLORS em IdeasListPage.jsx**

Localizar (linha 19-26):
```js
export const IDEA_STATUS_COLORS = {
  NOVA: 'bg-gray-100 text-gray-700',
  EM_ANALISE: 'bg-blue-100 text-blue-700',
  APROVADA: 'bg-green-100 text-green-700',
  EM_IMPLEMENTACAO: 'bg-purple-100 text-purple-700',
  IMPLEMENTADA: 'bg-emerald-100 text-emerald-700',
  ARQUIVADA: 'bg-red-100 text-red-700',
}
```
Substituir por:
```js
export const IDEA_STATUS_COLORS = {
  NOVA:             'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  EM_ANALISE:       'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  APROVADA:         'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  EM_IMPLEMENTACAO: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  IMPLEMENTADA:     'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  ARQUIVADA:        'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}
```

- [ ] **Step 2: Atualizar cards de ideia em IdeasListPage.jsx**

Cards (linha ~74):
```jsx
className="bg-white border rounded-lg p-5 hover:shadow-sm cursor-pointer transition-shadow space-y-3"
```
Substituir por:
```jsx
className="bg-card border border-border rounded-xl p-5 hover:shadow-md cursor-pointer transition-shadow space-y-3"
```

Título da ideia:
```jsx
<h2 className="font-semibold text-gray-900 leading-snug">{idea.title}</h2>
```
Substituir por:
```jsx
<h2 className="font-semibold text-foreground leading-snug">{idea.title}</h2>
```

Filtros de status (botões pill):
```jsx
className={cn('px-3 py-1 rounded-full text-sm font-medium border',
  !statusFilter ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:bg-gray-50')}
```
Substituir por:
```jsx
className={cn('px-3 py-1 rounded-full text-sm font-medium border transition-colors',
  !statusFilter ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:bg-muted/40')}
```

- [ ] **Step 3: Atualizar IdeaDetailPage.jsx**

Leia `frontend/src/pages/ideas/IdeaDetailPage.jsx` antes de editar. Substituições padrão:
- `bg-white` → `bg-card`
- `bg-blue-50 border-blue-100` (painel de nota do gestor) → `bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800`
- `bg-gray-50` → `bg-muted/50`
- `hover:bg-gray-50` → `hover:bg-muted/40`
- `text-gray-500`, `text-gray-600`, `text-gray-400` → `text-muted-foreground`
- `text-gray-900`, `text-gray-800` → `text-foreground`
- `border` simples em cards → `border border-border`
- badges `px-1.5 rounded` → `px-2.5 rounded-full`

- [ ] **Step 4: Verificar build e testes**

```bash
cd frontend && npm run build 2>&1 | tail -5
npm test 2>&1 | tail -5
```

Saída esperada: build OK, `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ideas/IdeasListPage.jsx frontend/src/pages/ideas/IdeaDetailPage.jsx
git commit -m "feat: update ideas pages for dark mode"
```

---

## Task 8: LoginPage + ProfilePage + PerformancePage

**Files:**
- Modify: `frontend/src/pages/auth/LoginPage.jsx`
- Modify: `frontend/src/pages/ProfilePage.jsx`
- Modify: `frontend/src/pages/performance/PerformancePage.jsx`

**Interfaces:**
- Produces: login, perfil e desempenho dark-aware

- [ ] **Step 1: Atualizar LoginPage.jsx**

Substituir:
```jsx
<div className="min-h-screen flex items-center justify-center bg-gray-50">
  <div className="w-full max-w-sm bg-white rounded-lg shadow p-8">
```
Por:
```jsx
<div className="min-h-screen flex items-center justify-center bg-background">
  <div className="w-full max-w-sm bg-card border border-border rounded-xl shadow p-8">
```

- [ ] **Step 2: Atualizar ProfilePage.jsx**

Leia `frontend/src/pages/ProfilePage.jsx` antes de editar. Substituições:
- `bg-white border rounded-lg` → `bg-card border border-border rounded-xl`
- `bg-gray-50` em inputs desabilitados → `bg-muted`
- `text-gray-500` → `text-muted-foreground`
- `text-gray-900` → `text-foreground`
- labels e cabeçalhos `text-gray-700` → `text-foreground`

- [ ] **Step 3: Atualizar PerformancePage.jsx**

Leia `frontend/src/pages/performance/PerformancePage.jsx` antes de editar. Substituições:
- `bg-white` → `bg-card`
- `bg-gray-50` → `bg-muted/50`
- `hover:bg-gray-50` → `hover:bg-muted/40`
- `text-gray-500`, `text-gray-600` → `text-muted-foreground`
- `text-gray-900` → `text-foreground`
- `border` simples em cards → `border border-border`
- modal/overlay `bg-white rounded-lg shadow-xl` → `bg-card border border-border rounded-xl shadow-xl`
- `bg-black/50` em overlay → manter (já funciona em dark)

- [ ] **Step 4: Verificar build e testes**

```bash
cd frontend && npm run build 2>&1 | tail -5
npm test 2>&1 | tail -5
```

Saída esperada: build OK, `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/auth/LoginPage.jsx frontend/src/pages/ProfilePage.jsx frontend/src/pages/performance/PerformancePage.jsx
git commit -m "feat: update login, profile and performance pages for dark mode"
```

---

## Self-Review

**Cobertura do spec:**
- ✅ Tailwind darkMode: 'class' + alpha-value → Task 1
- ✅ .dark dentro de @layer base → Task 1
- ✅ ThemeProvider (next-themes) → Task 2
- ✅ Toggle Sol/Lua no header → Task 2
- ✅ Sidebar sempre escura → Task 3
- ✅ NavItem ativo bg-blue-600 → Task 3
- ✅ Botão admin text-slate-300 → Task 3
- ✅ STATUS_COLORS/URGENCY_COLORS/SLA_BADGE_COLORS dark-aware → Task 4
- ✅ Remover STATUS_BG → Task 5
- ✅ Cards dashboard com borda colorida → Task 5
- ✅ TicketListPage dark-aware → Task 6
- ✅ TicketDetailPage dark-aware → Task 6
- ✅ IdeasListPage dark-aware → Task 7
- ✅ IdeaDetailPage dark-aware → Task 7
- ✅ LoginPage dark-aware → Task 8
- ✅ ProfilePage dark-aware → Task 8
- ✅ PerformancePage dark-aware → Task 8

**Gaps identificados:** nenhum.
