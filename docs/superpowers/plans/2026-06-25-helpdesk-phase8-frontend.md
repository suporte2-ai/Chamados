# Fase 8 — Frontend: Auth + Chamados — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o frontend React SPA do helpdesk (auth, layout, notificações, chamados completos) e as extensões de backend necessárias (timeLogs/attachments no detail, filtros from/to na listagem).

**Architecture:** SPA React 18 + Vite 5 consumindo a API REST existente via Axios com interceptor de refresh. Estado de auth em Zustand (módulo-scope token), server state em TanStack Query v5. Backend recebe duas extensões pontuais antes do frontend.

**Tech Stack:** React 18, Vite 5, Tailwind CSS 3, shadcn/ui, React Router v6, Zustand 4, TanStack Query v5, Axios 1 (frontend) · Node/Express/Prisma/Jest existentes (backend)

## Global Constraints

- Frontend em `frontend/` (pasta no root do repo, irmã de `backend/`)
- React 18 · Vite 5 · Tailwind CSS **3** · shadcn/ui latest · React Router **v6** · Zustand **4** · TanStack Query **v5** · Axios **1**
- Access token: variável módulo-scope em `lib/axios.js`, NUNCA localStorage/sessionStorage
- Refresh token: cookie httpOnly — gerenciado pelo backend (front apenas envia `withCredentials: true`)
- Store usa `fieldVisibilities` (plural com 's'), nunca `fieldVisibility`
- Paginação: `pageSize` (nunca `limit`)
- SLA badge: usar `ticket.slaBadge` do backend (`'vermelho'`/`'amarelo'`/`'verde'`) — não recalcular no frontend
- `POST /api/auth/logout` retorna 204 sem body
- Restauração de sessão: 2 passos — (1) `POST /api/auth/refresh` → extrai `accessToken`; (2) `GET /api/auth/me` com Bearer token
- Reopen: `POST /api/tickets/:id/reopen` (não via PATCH)
- Payload de comentário: `{ body: string, isInternal: boolean }`
- Reset password: token via `useParams()` → enviado no body `{ token, password }`
- Todos os testes de backend rodam com `cd backend && npx jest --runInBand`

---

### Task 1: Backend — Extensões de GET /api/tickets/:id e GET /api/tickets

Adiciona `timeLogs` e `attachments` ao response do detail; adiciona filtros `from`/`to` (período de criação) ao list.

**Files:**
- Modify: `backend/src/modules/tickets/tickets.controller.js`
- Create: `backend/tests/ticket-detail-extensions.test.js`

**Interfaces:**
- Produces: `GET /api/tickets/:id` retorna `{ ...ticket, slaBadge, comments, timeLogs, attachments }`
- Produces: `GET /api/tickets?from=YYYY-MM-DD&to=YYYY-MM-DD` filtra por `createdAt`

- [ ] **Step 1: Criar o arquivo de teste**

```js
// backend/tests/ticket-detail-extensions.test.js
const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');

const ids = { sectors: [], roles: [], users: [], categories: [], tickets: [] };
let token;
let ticket;

beforeAll(async () => {
  const sector = await prisma.sector.create({ data: { name: 'Sector Ext Test' } });
  ids.sectors.push(sector.id);
  const role = await prisma.role.create({ data: { name: 'Role Ext Test', level: 1 } });
  ids.roles.push(role.id);
  const user = await prisma.user.create({
    data: { name: 'User Ext', email: 'ext-test@example.com', passwordHash: 'h', roleId: role.id, sectorId: sector.id },
  });
  ids.users.push(user.id);
  token = signAccessToken(user.id);

  const cat = await prisma.category.create({
    data: { name: 'Cat Ext', subcategories: { create: [{ name: 'Sub Ext' }] } },
    include: { subcategories: true },
  });
  ids.categories.push(cat.id);

  await prisma.slaConfig.upsert({
    where: { urgency: 'MEDIO' },
    update: { firstResponseHours: 4, resolutionHours: 24 },
    create: { urgency: 'MEDIO', firstResponseHours: 4, resolutionHours: 24 },
  });

  ticket = await prisma.ticket.create({
    data: {
      title: 'Ticket Ext',
      description: 'Desc',
      categoryId: cat.id,
      subcategoryId: cat.subcategories[0].id,
      urgency: 'MEDIO',
      requesterId: user.id,
      sectorId: sector.id,
      slaFirstResponseDeadline: new Date(Date.now() + 4 * 3600000),
      slaResolutionDeadline: new Date(Date.now() + 24 * 3600000),
    },
  });
  ids.tickets.push(ticket.id);
  await prisma.ticketTimeLog.create({
    data: { ticketId: ticket.id, eventType: 'CREATED', toStatus: 'ABERTO', authorId: user.id },
  });
});

afterAll(async () => {
  await prisma.ticketTimeLog.deleteMany({ where: { ticketId: { in: ids.tickets } } });
  await prisma.ticketAttachment.deleteMany({ where: { ticketId: { in: ids.tickets } } });
  await prisma.ticket.deleteMany({ where: { id: { in: ids.tickets } } });
  await prisma.subcategory.deleteMany({ where: { categoryId: { in: ids.categories } } });
  await prisma.category.deleteMany({ where: { id: { in: ids.categories } } });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  await prisma.role.deleteMany({ where: { id: { in: ids.roles } } });
  await prisma.sector.deleteMany({ where: { id: { in: ids.sectors } } });
  await prisma.$disconnect();
});

test('GET /api/tickets/:id includes timeLogs array', async () => {
  const res = await request(app)
    .get(`/api/tickets/${ticket.id}`)
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body.timeLogs)).toBe(true);
  expect(res.body.timeLogs.length).toBeGreaterThan(0);
  expect(res.body.timeLogs[0]).toMatchObject({ eventType: 'CREATED', toStatus: 'ABERTO' });
});

test('GET /api/tickets/:id includes attachments array', async () => {
  const res = await request(app)
    .get(`/api/tickets/${ticket.id}`)
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body.attachments)).toBe(true);
});

test('GET /api/tickets?from filters out tickets before the date', async () => {
  const future = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const res = await request(app)
    .get(`/api/tickets?from=${future}`)
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.items.every(t => new Date(t.createdAt) >= new Date(future))).toBe(true);
});

test('GET /api/tickets?to filters out tickets after the date', async () => {
  const past = '2000-01-01';
  const res = await request(app)
    .get(`/api/tickets?to=${past}`)
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.items.every(t => new Date(t.createdAt) <= new Date(past + 'T23:59:59.999Z'))).toBe(true);
});
```

- [ ] **Step 2: Rodar e verificar falha**

```
cd backend && npx jest ticket-detail-extensions --runInBand
```
Esperado: 4 falhas (timeLogs/attachments undefined, filtros ignorados).

- [ ] **Step 3: Modificar `detail()` e `list()` no controller**

Em `backend/src/modules/tickets/tickets.controller.js`, substituir as funções `detail` e `list` pelas versões abaixo (manter todo o resto do arquivo idêntico):

```js
async function detail(req, res) {
  const id = Number(req.params.id);

  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) {
    return res.status(404).json({ error: 'Chamado não encontrado.' });
  }

  const visibilityWhere = ticketVisibilityWhere(req.user);
  const visible = await prisma.ticket.findFirst({ where: { id, ...visibilityWhere } });
  if (!visible) {
    return res.status(403).json({ error: 'Você não tem acesso a este chamado.' });
  }

  const [comments, timeLogs, attachments] = await Promise.all([
    prisma.ticketComment.findMany({
      where: {
        ticketId: id,
        ...(req.user.permissions.has('view_internal_notes') ? {} : { isInternal: false }),
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.ticketTimeLog.findMany({
      where: { ticketId: id },
      orderBy: { occurredAt: 'asc' },
    }),
    prisma.ticketAttachment.findMany({
      where: { ticketId: id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, fileName: true, createdAt: true, uploadedById: true, commentId: true },
    }),
  ]);

  res.json({ ...serializeTicket(ticket), comments, timeLogs, attachments });
}

async function list(req, res) {
  const { status, urgency, categoryId, subcategoryId, assignedToId, sectorId, search, sortBy, sortOrder, from, to } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.max(1, Number(req.query.pageSize) || DEFAULT_PAGE_SIZE);

  const where = { ...ticketVisibilityWhere(req.user) };
  if (status) where.status = status;
  if (urgency) where.urgency = urgency;
  if (categoryId) where.categoryId = Number(categoryId);
  if (subcategoryId) where.subcategoryId = Number(subcategoryId);
  if (assignedToId) where.assignedToId = Number(assignedToId);
  if (sectorId) where.sectorId = Number(sectorId);
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) {
      const toDate = new Date(to);
      toDate.setUTCHours(23, 59, 59, 999);
      where.createdAt.lte = toDate;
    }
  }
  if (search) {
    where.AND = [
      ...(where.AND || []),
      { OR: [{ title: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }] },
    ];
  }

  const orderBy = SORT_WHITELIST.includes(sortBy) ? { [sortBy]: sortOrder === 'asc' ? 'asc' : 'desc' } : { createdAt: 'desc' };

  const [items, total] = await Promise.all([
    prisma.ticket.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.ticket.count({ where }),
  ]);

  res.json({ items: items.map(serializeTicket), total, page, pageSize });
}
```

- [ ] **Step 4: Rodar e verificar passa**

```
cd backend && npx jest ticket-detail-extensions --runInBand
```
Esperado: 4 testes passando.

- [ ] **Step 5: Rodar a suite completa para garantir regressão zero**

```
cd backend && npx jest --runInBand 2>&1 | tail -10
```
Esperado: mesma contagem de passing de antes (pode haver 1 falha pré-existente em `ticket-core.test.js:54` — conhecida, ignorar).

- [ ] **Step 6: Commit**

```
git add backend/src/modules/tickets/tickets.controller.js backend/tests/ticket-detail-extensions.test.js
git commit -m "feat: extend ticket detail with timeLogs/attachments; add from/to date filters to list"
```

---

### Task 2: Frontend scaffold — Vite + React 18 + Tailwind 3 + shadcn/ui

Cria `frontend/` com toda a infra: Vite, Tailwind, shadcn/ui, Vitest, path alias `@/`.

**Files:**
- Create: `frontend/` (scaffold completo)
- Create: `frontend/package.json`
- Create: `frontend/vite.config.js`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/postcss.config.js`
- Create: `frontend/jsconfig.json`
- Create: `frontend/components.json`
- Create: `frontend/index.html`
- Create: `frontend/src/index.css`
- Create: `frontend/src/test-setup.js`
- Create: `frontend/.env.example`

**Interfaces:**
- Produces: `frontend/` com `npm run dev` funcional na porta 5173 e `npm test` rodando Vitest

- [ ] **Step 1: Scaffold Vite + instalar dependências**

```bash
cd "C:\Users\Marcelo\Desktop\CHAMADOS"
npm create vite@5 frontend -- --template react
cd frontend
npm install
```

- [ ] **Step 2: Instalar dependências de produção e desenvolvimento**

```bash
cd "C:\Users\Marcelo\Desktop\CHAMADOS\frontend"
npm install react-router-dom@6 zustand@4 @tanstack/react-query@5 axios@1
npm install @radix-ui/react-popover @radix-ui/react-dialog @radix-ui/react-select @radix-ui/react-avatar @radix-ui/react-dropdown-menu @radix-ui/react-separator @radix-ui/react-slot class-variance-authority clsx tailwind-merge lucide-react sonner
npm install -D tailwindcss@3 postcss autoprefixer vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

- [ ] **Step 3: Escrever `package.json` scripts (só a seção scripts)**

Abrir `frontend/package.json` e garantir que a seção `"scripts"` contenha:
```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 4: Criar `frontend/vite.config.js`**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test-setup.js',
  },
})
```

- [ ] **Step 5: Criar `frontend/tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
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

- [ ] **Step 6: Criar `frontend/postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 7: Criar `frontend/jsconfig.json`**

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

- [ ] **Step 8: Criar `frontend/components.json` (config shadcn)**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": false,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/index.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

- [ ] **Step 9: Criar `frontend/index.html`**

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Helpdesk</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 10: Criar `frontend/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

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

  * {
    border-color: hsl(var(--border));
  }

  body {
    background-color: hsl(var(--background));
    color: hsl(var(--foreground));
  }
}
```

- [ ] **Step 11: Criar `frontend/src/test-setup.js`**

```js
import '@testing-library/jest-dom'
```

- [ ] **Step 12: Criar `frontend/.env.example`**

```
VITE_API_BASE_URL=http://localhost:3000
```

- [ ] **Step 13: Instalar componentes shadcn/ui via CLI**

```bash
cd "C:\Users\Marcelo\Desktop\CHAMADOS\frontend"
npx shadcn@latest add button badge input select textarea popover avatar dropdown-menu separator skeleton sonner --overwrite --yes
```

Se o CLI pedir confirmações, responder `y`. Ele cria `src/components/ui/` e `src/lib/utils.js` (com função `cn`).

- [ ] **Step 14: Criar `frontend/src/main.jsx` temporário para testar o dev server**

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <div className="p-4 text-lg font-bold">Helpdesk — scaffold OK</div>
  </React.StrictMode>
)
```

- [ ] **Step 15: Verificar dev server sobe sem erros**

```bash
cd "C:\Users\Marcelo\Desktop\CHAMADOS\frontend"
npm run dev
```
Esperado: servidor em `http://localhost:5173`, página mostra "Helpdesk — scaffold OK", console sem erros vermelhos.

- [ ] **Step 16: Commit**

```bash
cd "C:\Users\Marcelo\Desktop\CHAMADOS"
git add frontend/
git commit -m "feat: scaffold frontend with Vite + React 18 + Tailwind 3 + shadcn/ui"
```

---

### Task 3: Core lib — axios, queryClient, utils, authStore, API clients

Toda a camada de infra que os outros tasks consomem.

**Files:**
- Modify: `frontend/src/lib/utils.js` (adicionar utilitários ao arquivo gerado pelo shadcn)
- Create: `frontend/src/lib/axios.js`
- Create: `frontend/src/lib/queryClient.js`
- Create: `frontend/src/stores/authStore.js`
- Create: `frontend/src/api/auth.js`
- Create: `frontend/src/api/tickets.js`
- Create: `frontend/src/api/notifications.js`
- Create: `frontend/src/stores/authStore.test.js`
- Create: `frontend/src/lib/utils.test.js`

**Interfaces:**
- Produces: `useAuthStore` — `{ user, permissions, fieldVisibilities, setAuth, clear }`
- Produces: `setAccessToken(token)`, `clearAccessToken()` de `lib/axios.js`
- Produces: `api` default export de `lib/axios.js` (instância Axios)
- Produces: `queryClient` default export de `lib/queryClient.js`
- Produces: `formatDate(iso)`, `formatTicketId(id)`, `SLA_BADGE_COLORS`, `timeAgo(iso)` de `lib/utils.js`
- Produces: `authApi`, `ticketsApi`, `notificationsApi` dos arquivos em `api/`

- [ ] **Step 1: Escrever testes**

```js
// frontend/src/stores/authStore.test.js
import { renderHook, act } from '@testing-library/react'
import { useAuthStore } from './authStore'

beforeEach(() => {
  useAuthStore.setState({ user: null, permissions: new Set(), fieldVisibilities: new Set() })
})

test('setAuth popula user, permissions e fieldVisibilities como Set', () => {
  const { result } = renderHook(() => useAuthStore())
  act(() => {
    result.current.setAuth({
      user: { id: 1, name: 'Ana', email: 'a@b.com', role: 'Administrador' },
      permissions: ['view_tickets', 'close_tickets'],
      fieldVisibilities: ['assigned_to', 'sla_badge'],
    })
  })
  expect(result.current.user).toEqual({ id: 1, name: 'Ana', email: 'a@b.com', role: 'Administrador' })
  expect(result.current.permissions.has('view_tickets')).toBe(true)
  expect(result.current.permissions.has('close_tickets')).toBe(true)
  expect(result.current.fieldVisibilities.has('assigned_to')).toBe(true)
  expect(result.current.fieldVisibilities.has('sla_badge')).toBe(true)
})

test('clear zera user, permissions e fieldVisibilities', () => {
  const { result } = renderHook(() => useAuthStore())
  act(() => {
    result.current.setAuth({
      user: { id: 1, name: 'Ana', email: 'a@b.com', role: 'Administrador' },
      permissions: ['view_tickets'],
      fieldVisibilities: ['assigned_to'],
    })
  })
  act(() => { result.current.clear() })
  expect(result.current.user).toBeNull()
  expect(result.current.permissions.size).toBe(0)
  expect(result.current.fieldVisibilities.size).toBe(0)
})
```

```js
// frontend/src/lib/utils.test.js
import { formatTicketId, timeAgo, SLA_BADGE_COLORS } from './utils'

test('formatTicketId formata com 5 dígitos e # prefixo', () => {
  expect(formatTicketId(1)).toBe('#00001')
  expect(formatTicketId(142)).toBe('#00142')
  expect(formatTicketId(10000)).toBe('#10000')
})

test('timeAgo retorna string legível', () => {
  const result = timeAgo(new Date(Date.now() - 5 * 60000).toISOString())
  expect(typeof result).toBe('string')
  expect(result.length).toBeGreaterThan(0)
})

test('SLA_BADGE_COLORS tem chaves vermelho, amarelo, verde', () => {
  expect(SLA_BADGE_COLORS.vermelho).toBeDefined()
  expect(SLA_BADGE_COLORS.amarelo).toBeDefined()
  expect(SLA_BADGE_COLORS.verde).toBeDefined()
})
```

- [ ] **Step 2: Rodar e verificar falha**

```bash
cd "C:\Users\Marcelo\Desktop\CHAMADOS\frontend"
npm test
```
Esperado: falhas nos dois arquivos de teste.

- [ ] **Step 3: Criar `frontend/src/stores/authStore.js`**

```js
import { create } from 'zustand'

export const useAuthStore = create((set) => ({
  user: null,
  permissions: new Set(),
  fieldVisibilities: new Set(),
  setAuth: (payload) =>
    set({
      user: payload.user,
      permissions: new Set(payload.permissions),
      fieldVisibilities: new Set(payload.fieldVisibilities),
    }),
  clear: () =>
    set({ user: null, permissions: new Set(), fieldVisibilities: new Set() }),
}))
```

- [ ] **Step 4: Modificar `frontend/src/lib/utils.js`**

O shadcn já criou este arquivo com a função `cn`. Adicionar as exportações abaixo ao final do arquivo existente (não substituir `cn`):

```js
// Adicionar ao final de frontend/src/lib/utils.js (manter o conteúdo existente do shadcn)

export function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTicketId(id) {
  return `#${String(id).padStart(5, '0')}`
}

export function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  return `há ${days}d`
}

export const SLA_BADGE_COLORS = {
  vermelho: 'bg-red-100 text-red-700 border-red-200',
  amarelo: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  verde: 'bg-green-100 text-green-700 border-green-200',
}

export const STATUS_COLORS = {
  ABERTO: 'bg-blue-100 text-blue-700',
  EM_ANDAMENTO: 'bg-purple-100 text-purple-700',
  AGUARDANDO: 'bg-orange-100 text-orange-700',
  RESOLVIDO: 'bg-green-100 text-green-700',
  FECHADO: 'bg-gray-100 text-gray-700',
}

export const STATUS_LABELS = {
  ABERTO: 'Aberto',
  EM_ANDAMENTO: 'Em Andamento',
  AGUARDANDO: 'Aguardando',
  RESOLVIDO: 'Resolvido',
  FECHADO: 'Fechado',
}

export const URGENCY_COLORS = {
  CRITICO: 'bg-red-100 text-red-700',
  ALTO: 'bg-orange-100 text-orange-700',
  MEDIO: 'bg-yellow-100 text-yellow-700',
  BAIXO: 'bg-green-100 text-green-700',
}

export const URGENCY_LABELS = {
  CRITICO: 'Crítico',
  ALTO: 'Alto',
  MEDIO: 'Médio',
  BAIXO: 'Baixo',
}
```

- [ ] **Step 5: Criar `frontend/src/lib/axios.js`**

```js
import axios from 'axios'

let accessToken = null

export function setAccessToken(token) { accessToken = token }
export function getAccessToken() { return accessToken }
export function clearAccessToken() { accessToken = null }

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000',
  withCredentials: true,
})

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

let isRefreshing = false

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      if (!isRefreshing) {
        isRefreshing = true
        try {
          const { data } = await api.post('/api/auth/refresh')
          setAccessToken(data.accessToken)
          isRefreshing = false
          original.headers.Authorization = `Bearer ${data.accessToken}`
          return api(original)
        } catch {
          isRefreshing = false
          clearAccessToken()
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  }
)

export default api
```

- [ ] **Step 6: Criar `frontend/src/lib/queryClient.js`**

```js
import { QueryClient } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      retry: 1,
    },
  },
})

export default queryClient
```

- [ ] **Step 7: Criar `frontend/src/api/auth.js`**

```js
import api, { setAccessToken, clearAccessToken } from '@/lib/axios'

export const authApi = {
  async login(email, password) {
    const { data } = await api.post('/api/auth/login', { email, password })
    setAccessToken(data.accessToken)
    return data
  },

  async logout() {
    try {
      await api.post('/api/auth/logout')
    } catch (_) {}
    clearAccessToken()
  },

  async forgotPassword(email) {
    await api.post('/api/auth/forgot-password', { email })
  },

  async resetPassword(token, password) {
    await api.post('/api/auth/reset-password', { token, password })
  },

  async refresh() {
    const { data } = await api.post('/api/auth/refresh')
    setAccessToken(data.accessToken)
    return data.accessToken
  },

  async me() {
    const { data } = await api.get('/api/auth/me')
    return data
  },
}
```

- [ ] **Step 8: Criar `frontend/src/api/tickets.js`**

```js
import api from '@/lib/axios'

export const ticketsApi = {
  list: (params) => api.get('/api/tickets', { params }).then(r => r.data),
  get: (id) => api.get(`/api/tickets/${id}`).then(r => r.data),
  create: (body) => api.post('/api/tickets', body).then(r => r.data),
  update: (id, body) => api.patch(`/api/tickets/${id}`, body).then(r => r.data),
  reopen: (id) => api.post(`/api/tickets/${id}/reopen`).then(r => r.data),
  addComment: (id, body) => api.post(`/api/tickets/${id}/comments`, body).then(r => r.data),
  addAttachment: (id, file) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/api/tickets/${id}/attachments`, form).then(r => r.data)
  },
  getAttachmentUrl: (ticketId, attachmentId) =>
    `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}/api/tickets/${ticketId}/attachments/${attachmentId}`,
}
```

- [ ] **Step 9: Criar `frontend/src/api/notifications.js`**

```js
import api from '@/lib/axios'

export const notificationsApi = {
  list: () => api.get('/api/notifications').then(r => r.data),
  markRead: (id) => api.patch(`/api/notifications/${id}/read`).then(r => r.data),
  markAllRead: () => api.patch('/api/notifications/read-all').then(r => r.data),
}
```

- [ ] **Step 10: Rodar testes**

```bash
cd "C:\Users\Marcelo\Desktop\CHAMADOS\frontend"
npm test
```
Esperado: todos os testes passando (authStore: 2 testes, utils: 3 testes).

- [ ] **Step 11: Commit**

```bash
cd "C:\Users\Marcelo\Desktop\CHAMADOS"
git add frontend/src/
git commit -m "feat: add core lib (axios, queryClient, utils), authStore, and API clients"
```

---

### Task 4: Auth pages + routing + ProtectedRoute

Cria o roteamento completo, as três páginas de auth, o hook useAuth e o ProtectedRoute.

**Files:**
- Create: `frontend/src/main.jsx`
- Create: `frontend/src/App.jsx`
- Create: `frontend/src/components/ProtectedRoute.jsx`
- Create: `frontend/src/hooks/useAuth.js`
- Create: `frontend/src/pages/auth/LoginPage.jsx`
- Create: `frontend/src/pages/auth/ForgotPasswordPage.jsx`
- Create: `frontend/src/pages/auth/ResetPasswordPage.jsx`

**Interfaces:**
- Consumes: `useAuthStore` de `@/stores/authStore`
- Consumes: `authApi` de `@/api/auth`
- Consumes: `queryClient` de `@/lib/queryClient`
- Produces: `useAuth()` — `{ user, permissions, fieldVisible, logout }`
- Produces: `<ProtectedRoute>` — redireciona `/login` se `user === null`
- Produces: rotas `/login`, `/forgot-password`, `/reset-password/:token` funcionais

- [ ] **Step 1: Criar `frontend/src/hooks/useAuth.js`**

```js
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { authApi } from '@/api/auth'
import { clearAccessToken } from '@/lib/axios'

export function useAuth() {
  const navigate = useNavigate()
  const { user, permissions, fieldVisibilities, setAuth, clear } = useAuthStore()

  const fieldVisible = (key) => fieldVisibilities.has(key)

  const logout = async () => {
    await authApi.logout()
    clearAccessToken()
    clear()
    navigate('/login', { replace: true })
  }

  return { user, permissions, fieldVisible, logout }
}
```

- [ ] **Step 2: Criar `frontend/src/components/ProtectedRoute.jsx`**

```jsx
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'

export default function ProtectedRoute({ children }) {
  const user = useAuthStore((s) => s.user)
  const location = useLocation()

  if (!user) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />
  }

  return children
}
```

- [ ] **Step 3: Criar `frontend/src/pages/auth/LoginPage.jsx`**

```jsx
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '@/api/auth'
import { authApi as authRefreshApi } from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const setAuth = useAuthStore((s) => s.setAuth)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await authApi.login(email, password)
      setAuth(data)
      const redirect = params.get('redirect') || '/tickets'
      navigate(redirect, { replace: true })
    } catch (err) {
      setError(err.response?.data?.error || 'Credenciais inválidas.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-lg shadow p-8">
        <h1 className="text-2xl font-bold mb-6 text-center">Helpdesk</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">E-mail</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="seu@email.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Senha</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
        <a
          href="/forgot-password"
          className="block text-center text-sm text-blue-600 hover:underline mt-4"
          onClick={(e) => { e.preventDefault(); navigate('/forgot-password') }}
        >
          Esqueci minha senha
        </a>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Criar `frontend/src/pages/auth/ForgotPasswordPage.jsx`**

```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '@/api/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await authApi.forgotPassword(email)
    } catch (_) {}
    // Backend sempre retorna 200 (anti-enumeração) — mostrar mensagem de sucesso sempre
    setSent(true)
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm bg-white rounded-lg shadow p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">E-mail enviado</h2>
          <p className="text-sm text-gray-600 mb-4">
            Se o e-mail informado estiver cadastrado, você receberá as instruções em breve.
          </p>
          <Button variant="outline" onClick={() => navigate('/login')}>Voltar ao login</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-lg shadow p-8">
        <h1 className="text-xl font-bold mb-2">Recuperar senha</h1>
        <p className="text-sm text-gray-600 mb-4">Informe seu e-mail para receber o link de recuperação.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            placeholder="seu@email.com"
          />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Enviando...' : 'Enviar link'}
          </Button>
        </form>
        <button
          onClick={() => navigate('/login')}
          className="block text-center text-sm text-blue-600 hover:underline mt-4 w-full"
        >
          Voltar ao login
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Criar `frontend/src/pages/auth/ResetPasswordPage.jsx`**

```jsx
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { authApi } from '@/api/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function ResetPasswordPage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('As senhas não coincidem.')
      return
    }
    if (password.length < 8) {
      setError('A senha deve ter ao menos 8 caracteres.')
      return
    }
    setLoading(true)
    try {
      await authApi.resetPassword(token, password)
      setDone(true)
    } catch (err) {
      setError(err.response?.data?.error || 'Link inválido ou expirado.')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm bg-white rounded-lg shadow p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Senha redefinida</h2>
          <p className="text-sm text-gray-600 mb-4">Sua senha foi alterada com sucesso.</p>
          <Button onClick={() => navigate('/login')}>Ir para o login</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-lg shadow p-8">
        <h1 className="text-xl font-bold mb-4">Redefinir senha</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nova senha</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
              placeholder="Mínimo 8 caracteres"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Confirmar senha</label>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              placeholder="Repetir senha"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Salvando...' : 'Redefinir senha'}
          </Button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Criar `frontend/src/App.jsx`**

```jsx
import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { authApi } from '@/api/auth'
import { setAccessToken } from '@/lib/axios'
import { useAuthStore } from '@/stores/authStore'
import ProtectedRoute from '@/components/ProtectedRoute'
import LoginPage from '@/pages/auth/LoginPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage'

// Layout raiz — restaura sessão antes de renderizar rotas protegidas
function RootLayout() {
  const [ready, setReady] = useState(false)
  const setAuth = useAuthStore((s) => s.setAuth)
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    if (user) { setReady(true); return }
    const restore = async () => {
      try {
        const token = await authApi.refresh()
        setAccessToken(token)
        const profile = await authApi.me()
        setAuth(profile)
      } catch (_) {
        // Sem sessão válida — /login será mostrado pelo ProtectedRoute
      } finally {
        setReady(true)
      }
    }
    restore()
  }, [])

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Carregando...
      </div>
    )
  }

  return <Outlet />
}

// Lazy imports para páginas protegidas (evita bundle monolítico)
import { lazy, Suspense } from 'react'
const AppShell = lazy(() => import('@/components/layout/AppShell'))
const TicketListPage = lazy(() => import('@/pages/tickets/TicketListPage'))
const TicketDetailPage = lazy(() => import('@/pages/tickets/TicketDetailPage'))
const TicketNewPage = lazy(() => import('@/pages/tickets/TicketNewPage'))

const FallbackLoader = () => (
  <div className="min-h-screen flex items-center justify-center text-gray-400">Carregando...</div>
)

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password/:token', element: <ResetPasswordPage /> },
      {
        element: (
          <ProtectedRoute>
            <Suspense fallback={<FallbackLoader />}>
              <AppShell />
            </Suspense>
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <Suspense fallback={<FallbackLoader />}><TicketListPage /></Suspense>, path: 'tickets' },
          { path: 'tickets/new', element: <Suspense fallback={<FallbackLoader />}><TicketNewPage /></Suspense> },
          { path: 'tickets/:id', element: <Suspense fallback={<FallbackLoader />}><TicketDetailPage /></Suspense> },
          { path: '/', element: <Suspense fallback={<FallbackLoader />}><TicketListPage /></Suspense> },
        ],
      },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
```

- [ ] **Step 7: Criar `frontend/src/main.jsx` definitivo**

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import queryClient from '@/lib/queryClient'
import App from './App'
import './index.css'
import { Toaster } from '@/components/ui/sonner'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster richColors />
    </QueryClientProvider>
  </React.StrictMode>
)
```

- [ ] **Step 8: Verificar no browser**

```bash
cd "C:\Users\Marcelo\Desktop\CHAMADOS\frontend"
npm run dev
```

Abrir `http://localhost:5173/login`. Deve mostrar o formulário de login. Tentar logar com `admin@helpdesk.com` / `Senha123!`. Deve redirecionar para `/tickets` (que mostra "Carregando..." ou erro 404 pois a página ainda não existe — isso é esperado). `/forgot-password` e `/reset-password/test-token` devem renderizar seus formulários.

- [ ] **Step 9: Commit**

```bash
cd "C:\Users\Marcelo\Desktop\CHAMADOS"
git add frontend/src/
git commit -m "feat: add auth pages, routing, ProtectedRoute, useAuth, and session restore"
```

---

### Task 5: AppShell + Sidebar + Header + NotificationBell + useNotifications

Layout global com sidebar responsiva, header e sino de notificações com polling de 15s.

**Files:**
- Create: `frontend/src/components/layout/AppShell.jsx`
- Create: `frontend/src/components/layout/Sidebar.jsx`
- Create: `frontend/src/components/layout/Header.jsx`
- Create: `frontend/src/components/layout/NotificationBell.jsx`
- Create: `frontend/src/hooks/useNotifications.js`

**Interfaces:**
- Consumes: `useAuth()` de `@/hooks/useAuth`
- Consumes: `notificationsApi` de `@/api/notifications`
- Consumes: `timeAgo` de `@/lib/utils`
- Produces: `<AppShell>` — layout com Sidebar + Header + `<Outlet>`

- [ ] **Step 1: Criar `frontend/src/hooks/useNotifications.js`**

```js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationsApi } from '@/api/notifications'

export function useNotifications() {
  const qc = useQueryClient()

  const { data = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: notificationsApi.list,
    refetchInterval: 15_000,
  })

  const markRead = useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markAllRead = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const unreadCount = data.filter((n) => !n.isRead).length

  return { notifications: data, unreadCount, markRead: markRead.mutate, markAllRead: markAllRead.mutate }
}
```

- [ ] **Step 2: Criar `frontend/src/components/layout/NotificationBell.jsx`**

```jsx
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { useNotifications } from '@/hooks/useNotifications'
import { timeAgo } from '@/lib/utils'

const TYPE_ICONS = {
  TICKET_ASSIGNED: '🎫',
  TICKET_STATUS_CHANGED: '🔄',
  TICKET_COMMENT: '💬',
  IDEA_STATUS_CHANGED: '💡',
}

export default function NotificationBell() {
  const navigate = useNavigate()
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications()
  const recent = notifications.slice(0, 10)

  useEffect(() => {
    document.title = unreadCount > 0 ? `(${unreadCount}) Helpdesk` : 'Helpdesk'
  }, [unreadCount])

  const handleClick = (n) => {
    if (!n.isRead) markRead(n.id)
    if (n.link) navigate(n.link)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="font-medium text-sm">Notificações</span>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead()}
              className="text-xs text-blue-600 hover:underline"
            >
              Marcar todas como lidas
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {recent.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">Nenhuma notificação</p>
          ) : (
            recent.map((n) => (
              <div
                key={n.id}
                onClick={() => handleClick(n)}
                className={`flex gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 border-b last:border-0 ${!n.isRead ? 'bg-blue-50' : ''}`}
              >
                <span className="text-lg mt-0.5">{TYPE_ICONS[n.type] || '🔔'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 line-clamp-2">{n.message}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{timeAgo(n.createdAt)}</p>
                </div>
                {!n.isRead && <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 3: Criar `frontend/src/components/layout/Sidebar.jsx`**

```jsx
import { NavLink } from 'react-router-dom'
import { Ticket, PlusCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const links = [
  { to: '/tickets', icon: Ticket, label: 'Chamados', exact: true },
  { to: '/tickets/new', icon: PlusCircle, label: 'Novo Chamado' },
]

export default function Sidebar({ open, onClose }) {
  const nav = (
    <nav className="p-4 space-y-1">
      {links.map(({ to, icon: Icon, label, exact }) => (
        <NavLink
          key={to}
          to={to}
          end={exact}
          onClick={onClose}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-gray-700 hover:bg-gray-100'
            )
          }
        >
          <Icon className="h-4 w-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  )

  return (
    <>
      {/* Desktop */}
      <aside className="hidden md:flex md:flex-col w-60 border-r bg-white shrink-0">
        <div className="h-16 flex items-center px-6 border-b font-bold text-lg">Helpdesk</div>
        {nav}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={onClose} />
          <aside className="relative z-50 flex flex-col w-60 h-full bg-white shadow-xl">
            <div className="h-16 flex items-center justify-between px-6 border-b">
              <span className="font-bold text-lg">Helpdesk</span>
              <button onClick={onClose}><X className="h-5 w-5" /></button>
            </div>
            {nav}
          </aside>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 4: Criar `frontend/src/components/layout/Header.jsx`**

```jsx
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
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
}

function getBreadcrumb(pathname) {
  if (BREADCRUMBS[pathname]) return BREADCRUMBS[pathname]
  if (pathname.match(/^\/tickets\/\d+$/)) return 'Detalhe do Chamado'
  return 'Helpdesk'
}

export default function Header({ onMenuClick }) {
  const location = useLocation()
  const { user, logout } = useAuth()
  const initials = user?.name
    ? user.name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()
    : '?'

  return (
    <header className="h-16 flex items-center justify-between px-4 border-b bg-white shrink-0">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenuClick}>
          <Menu className="h-5 w-5" />
        </Button>
        <span className="font-medium text-gray-700">{getBreadcrumb(location.pathname)}</span>
      </div>
      <div className="flex items-center gap-2">
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
            <div className="px-3 py-2 text-sm text-gray-500">{user?.email}</div>
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

- [ ] **Step 5: Criar `frontend/src/components/layout/AppShell.jsx`**

```jsx
import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Verificar no browser**

Logar com `admin@helpdesk.com` / `Senha123!`. Deve mostrar o layout com sidebar e header. No mobile (resize < 768px) a sidebar deve ser drawer. O sino de notificações deve abrir o popover. O menu do avatar deve mostrar "Sair".

- [ ] **Step 7: Commit**

```bash
cd "C:\Users\Marcelo\Desktop\CHAMADOS"
git add frontend/src/
git commit -m "feat: add AppShell, Sidebar, Header, NotificationBell with 15s polling"
```

---

### Task 6: TicketListPage — filtros, tabela, paginação

**Files:**
- Create: `frontend/src/pages/tickets/TicketListPage.jsx`

**Interfaces:**
- Consumes: `ticketsApi.list(params)` de `@/api/tickets`
- Consumes: `useAuth()` de `@/hooks/useAuth`
- Consumes: `formatDate`, `formatTicketId`, `STATUS_COLORS`, `STATUS_LABELS`, `URGENCY_COLORS`, `URGENCY_LABELS`, `SLA_BADGE_COLORS` de `@/lib/utils`
- Consumes: `queryKey: ['tickets', filters]` — invalidado por TicketNewPage ao criar

- [ ] **Step 1: Criar `frontend/src/pages/tickets/TicketListPage.jsx`**

```jsx
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { ticketsApi } from '@/api/tickets'
import { useAuth } from '@/hooks/useAuth'
import { formatDate, formatTicketId, STATUS_COLORS, STATUS_LABELS, URGENCY_COLORS, URGENCY_LABELS, SLA_BADGE_COLORS } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const STATUSES = ['ABERTO', 'EM_ANDAMENTO', 'AGUARDANDO', 'RESOLVIDO', 'FECHADO']
const URGENCIES = ['CRITICO', 'ALTO', 'MEDIO', 'BAIXO']

function useFilters() {
  const [params, setParams] = useSearchParams()
  const get = (k) => params.get(k) || ''
  const set = (k, v) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    next.set('page', '1')
    setParams(next)
  }
  const page = Number(params.get('page')) || 1
  const setPage = (p) => { const n = new URLSearchParams(params); n.set('page', String(p)); setParams(n) }
  return { get, set, page, setPage, params }
}

export default function TicketListPage() {
  const navigate = useNavigate()
  const { fieldVisible } = useAuth()
  const { get, set, page, setPage, params } = useFilters()
  const [search, setSearch] = useState(get('search'))

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => set('search', search), 400)
    return () => clearTimeout(t)
  }, [search])

  const filters = {
    status: get('status') || undefined,
    urgency: get('urgency') || undefined,
    sectorId: get('sectorId') || undefined,
    from: get('from') || undefined,
    to: get('to') || undefined,
    search: get('search') || undefined,
    page,
    pageSize: 20,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', Object.fromEntries(params)],
    queryFn: () => ticketsApi.list(filters),
  })

  const tickets = data?.items || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / 20)

  const showAssignedTo = fieldVisible('assigned_to')
  const showSla = fieldVisible('sla_badge')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Chamados</h1>
        <Button onClick={() => navigate('/tickets/new')}>+ Novo Chamado</Button>
      </div>

      {/* Filtros */}
      <div className="bg-white border rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Input
          placeholder="Buscar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          value={get('status')}
          onChange={(e) => set('status', e.target.value)}
          className="border rounded-md px-3 py-2 text-sm w-full"
        >
          <option value="">Todos os status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <select
          value={get('urgency')}
          onChange={(e) => set('urgency', e.target.value)}
          className="border rounded-md px-3 py-2 text-sm w-full"
        >
          <option value="">Todas as urgências</option>
          {URGENCIES.map((u) => <option key={u} value={u}>{URGENCY_LABELS[u]}</option>)}
        </select>
        <div className="flex gap-2 col-span-2 md:col-span-1">
          <input
            type="date"
            value={get('from')}
            onChange={(e) => set('from', e.target.value)}
            className="border rounded-md px-3 py-2 text-sm flex-1"
            title="De"
          />
          <input
            type="date"
            value={get('to')}
            onChange={(e) => set('to', e.target.value)}
            className="border rounded-md px-3 py-2 text-sm flex-1"
            title="Até"
          />
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
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
            <tbody className="divide-y">
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                : tickets.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => navigate(`/tickets/${t.id}`)}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-4 py-3 text-gray-500 font-mono">{formatTicketId(t.id)}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">{t.title}</td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[t.status])}>
                          {STATUS_LABELS[t.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', URGENCY_COLORS[t.urgency])}>
                          {URGENCY_LABELS[t.urgency]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">{t.sectorId}</td>
                      {showAssignedTo && <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">{t.assignedToId || '—'}</td>}
                      {showSla && (
                        <td className="px-4 py-3 hidden xl:table-cell">
                          {t.slaBadge ? (
                            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium border', SLA_BADGE_COLORS[t.slaBadge])}>
                              {t.slaBadge.charAt(0).toUpperCase() + t.slaBadge.slice(1)}
                            </span>
                          ) : '—'}
                        </td>
                      )}
                      <td className="px-4 py-3 text-gray-500 hidden xl:table-cell whitespace-nowrap">{formatDate(t.createdAt)}</td>
                    </tr>
                  ))
              }
              {!isLoading && tickets.length === 0 && (
                <tr><td colSpan="8" className="px-4 py-8 text-center text-gray-400">Nenhum chamado encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <span className="text-sm text-gray-600">{total} chamados</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Anterior
              </Button>
              <span className="text-sm px-2 py-1">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Próxima
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar no browser**

Logar e navegar para `/tickets`. A lista deve carregar com os tickets do seed (200 tickets). Os filtros devem funcionar: selecionar status, digitar busca. Clicar em um ticket deve navegar para `/tickets/:id` (mostrará erro pois a página ainda não existe — esperado).

- [ ] **Step 3: Commit**

```bash
cd "C:\Users\Marcelo\Desktop\CHAMADOS"
git add frontend/src/pages/tickets/TicketListPage.jsx
git commit -m "feat: add TicketListPage with filters, table, and pagination"
```

---

### Task 7: TicketNewPage — formulário de abertura

**Files:**
- Create: `frontend/src/pages/tickets/TicketNewPage.jsx`

**Interfaces:**
- Consumes: `ticketsApi.create(body)` de `@/api/tickets`
- Consumes: `GET /api/categories` via axios direto
- Produces: após submit bem-sucedido → navega para `/tickets/:id` + invalida `['tickets']`

- [ ] **Step 1: Criar `frontend/src/pages/tickets/TicketNewPage.jsx`**

```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { ticketsApi } from '@/api/tickets'
import { formatTicketId } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

const URGENCIES = [
  { value: 'CRITICO', label: 'Crítico' },
  { value: 'ALTO', label: 'Alto' },
  { value: 'MEDIO', label: 'Médio' },
  { value: 'BAIXO', label: 'Baixo' },
]

export default function TicketNewPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [subcategoryId, setSubcategoryId] = useState('')
  const [urgency, setUrgency] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/api/categories').then((r) => r.data),
  })

  const selectedCategory = categories.find((c) => String(c.id) === categoryId)
  const subcategories = selectedCategory?.subcategories || []

  const validate = () => {
    const e = {}
    if (!title.trim()) e.title = 'Título é obrigatório.'
    if (!description.trim()) e.description = 'Descrição é obrigatória.'
    if (!categoryId) e.categoryId = 'Categoria é obrigatória.'
    if (subcategories.length > 0 && !subcategoryId) e.subcategoryId = 'Subcategoria é obrigatória.'
    if (!urgency) e.urgency = 'Urgência é obrigatória.'
    return e
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setLoading(true)
    try {
      const ticket = await ticketsApi.create({
        title: title.trim(),
        description: description.trim(),
        categoryId: Number(categoryId),
        subcategoryId: Number(subcategoryId),
        urgency,
      })
      qc.invalidateQueries({ queryKey: ['tickets'] })
      toast.success(`Chamado ${formatTicketId(ticket.id)} aberto com sucesso.`)
      navigate(`/tickets/${ticket.id}`)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao abrir chamado.')
    } finally {
      setLoading(false)
    }
  }

  const field = (key) => ({
    error: errors[key],
    onChange: () => setErrors((prev) => ({ ...prev, [key]: undefined })),
  })

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold mb-6">Novo Chamado</h1>
      <form onSubmit={handleSubmit} className="bg-white border rounded-lg p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">Título *</label>
          <Input
            value={title}
            onChange={(e) => { setTitle(e.target.value); field('title').onChange() }}
            placeholder="Descreva brevemente o problema"
            autoFocus
          />
          {errors.title && <p className="text-sm text-red-600 mt-1">{errors.title}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Descrição *</label>
          <Textarea
            value={description}
            onChange={(e) => { setDescription(e.target.value); field('description').onChange() }}
            placeholder="Detalhe o problema, incluindo mensagens de erro e passos para reproduzir"
            rows={4}
          />
          {errors.description && <p className="text-sm text-red-600 mt-1">{errors.description}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Categoria *</label>
            <select
              value={categoryId}
              onChange={(e) => { setCategoryId(e.target.value); setSubcategoryId(''); field('categoryId').onChange() }}
              className="border rounded-md px-3 py-2 text-sm w-full"
            >
              <option value="">Selecione...</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {errors.categoryId && <p className="text-sm text-red-600 mt-1">{errors.categoryId}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Subcategoria {subcategories.length > 0 ? '*' : ''}
            </label>
            <select
              value={subcategoryId}
              onChange={(e) => { setSubcategoryId(e.target.value); field('subcategoryId').onChange() }}
              className="border rounded-md px-3 py-2 text-sm w-full"
              disabled={!categoryId || subcategories.length === 0}
            >
              <option value="">Selecione...</option>
              {subcategories.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {errors.subcategoryId && <p className="text-sm text-red-600 mt-1">{errors.subcategoryId}</p>}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Urgência *</label>
          <select
            value={urgency}
            onChange={(e) => { setUrgency(e.target.value); field('urgency').onChange() }}
            className="border rounded-md px-3 py-2 text-sm w-full max-w-xs"
          >
            <option value="">Selecione...</option>
            {URGENCIES.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
          {errors.urgency && <p className="text-sm text-red-600 mt-1">{errors.urgency}</p>}
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={loading}>
            {loading ? 'Abrindo...' : 'Abrir Chamado'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/tickets')}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Verificar no browser**

Navegar para `/tickets/new`. Preencher título, descrição, categoria, subcategoria e urgência. Submit deve criar o ticket e redirecionar para `/tickets/:id` com toast de sucesso. Enviar sem preencher campos deve mostrar erros inline.

- [ ] **Step 3: Commit**

```bash
cd "C:\Users\Marcelo\Desktop\CHAMADOS"
git add frontend/src/pages/tickets/TicketNewPage.jsx
git commit -m "feat: add TicketNewPage with validation and category/subcategory cascade"
```

---

### Task 8: TicketDetailPage — detalhe completo (campos, status, ações, comentários, anexos, timeline)

**Files:**
- Create: `frontend/src/pages/tickets/TicketDetailPage.jsx`

**Interfaces:**
- Consumes: `ticketsApi.get`, `ticketsApi.update`, `ticketsApi.reopen`, `ticketsApi.addComment`, `ticketsApi.addAttachment`, `ticketsApi.getAttachmentUrl`
- Consumes: `formatDate`, `formatTicketId`, `STATUS_COLORS`, `STATUS_LABELS`, `URGENCY_COLORS`, `URGENCY_LABELS`, `SLA_BADGE_COLORS`, `timeAgo`
- Consumes: `useAuth()` — `permissions.has(...)`, `fieldVisible(...)`
- Produces: página de detalhe completa; invalida `['tickets', id]` após cada mutação

- [ ] **Step 1: Criar `frontend/src/pages/tickets/TicketDetailPage.jsx`**

```jsx
import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp, Lock, Paperclip, Download } from 'lucide-react'
import { ticketsApi } from '@/api/tickets'
import api from '@/lib/axios'
import { useAuth } from '@/hooks/useAuth'
import {
  formatDate, formatTicketId, timeAgo,
  STATUS_COLORS, STATUS_LABELS,
  URGENCY_COLORS, URGENCY_LABELS,
  SLA_BADGE_COLORS,
} from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

// Status transitions allowed from each status
const TRANSITIONS = {
  ABERTO: ['EM_ANDAMENTO', 'AGUARDANDO'],
  EM_ANDAMENTO: ['AGUARDANDO', 'RESOLVIDO'],
  AGUARDANDO: ['EM_ANDAMENTO', 'RESOLVIDO'],
  RESOLVIDO: ['FECHADO'],
  FECHADO: [],
}

const EVENT_LABELS = {
  CREATED: 'Chamado aberto',
  STATUS_CHANGED: 'Status alterado',
  ASSIGNED: 'Atribuído',
  COMMENT_ADDED: 'Comentário adicionado',
  FIRST_RESPONSE: 'Primeira resposta registrada',
  RESOLVED: 'Chamado resolvido',
  CLOSED: 'Chamado fechado',
  REOPENED: 'Chamado reaberto',
}

export default function TicketDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user, permissions, fieldVisible } = useAuth()

  const [commentBody, setCommentBody] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [submittingComment, setSubmittingComment] = useState(false)
  const [timelineOpen, setTimelineOpen] = useState(false)
  const fileRef = useRef(null)

  const { data: ticket, isLoading, isError } = useQuery({
    queryKey: ['tickets', id],
    queryFn: () => ticketsApi.get(id),
  })

  const { data: users = [] } = useQuery({
    queryKey: ['users-all'],
    queryFn: () => api.get('/api/users').then(r => r.data).catch(() => []),
    enabled: permissions.has('reassign_tickets'),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['tickets', id] })

  const updateMutation = useMutation({
    mutationFn: (body) => ticketsApi.update(id, body),
    onSuccess: () => { invalidate(); toast.success('Chamado atualizado.') },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro ao atualizar.'),
  })

  const reopenMutation = useMutation({
    mutationFn: () => ticketsApi.reopen(id),
    onSuccess: () => { invalidate(); toast.success('Chamado reaberto.') },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro ao reabrir.'),
  })

  const handleStatusChange = (newStatus) => {
    updateMutation.mutate({ status: newStatus })
  }

  const handleAssigneeChange = (e) => {
    const val = e.target.value
    updateMutation.mutate({ assignedToId: val ? Number(val) : null })
  }

  const handleCostChange = (e) => {
    const val = parseFloat(e.target.value)
    if (!isNaN(val)) updateMutation.mutate({ estimatedCost: val })
  }

  const handleCommentSubmit = async (e) => {
    e.preventDefault()
    if (!commentBody.trim()) return
    setSubmittingComment(true)
    try {
      await ticketsApi.addComment(id, { body: commentBody.trim(), isInternal })
      setCommentBody('')
      setIsInternal(false)
      invalidate()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao enviar comentário.')
    } finally {
      setSubmittingComment(false)
    }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await ticketsApi.addAttachment(id, file)
      invalidate()
      toast.success('Arquivo anexado.')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao anexar arquivo.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (isError || !ticket) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500 text-lg">Chamado não encontrado.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/tickets')}>
          Voltar à lista
        </Button>
      </div>
    )
  }

  const transitions = TRANSITIONS[ticket.status] || []
  const canReopen = permissions.has('reopen_tickets') && ticket.status === 'RESOLVIDO'
  const canClose = permissions.has('close_tickets') && ticket.status !== 'FECHADO'

  const allowedTransitions = [
    ...transitions.filter(s => {
      if (s === 'FECHADO') return canClose
      return true
    }),
  ]

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="bg-white border rounded-lg p-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-400 font-mono">{formatTicketId(ticket.id)}</p>
            <h1 className="text-xl font-semibold mt-1 break-words">{ticket.title}</h1>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium', STATUS_COLORS[ticket.status])}>
              {STATUS_LABELS[ticket.status]}
            </span>
            <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium', URGENCY_COLORS[ticket.urgency])}>
              {URGENCY_LABELS[ticket.urgency]}
            </span>
            {ticket.slaBadge && (
              <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium border', SLA_BADGE_COLORS[ticket.slaBadge])}>
                SLA: {ticket.slaBadge.charAt(0).toUpperCase() + ticket.slaBadge.slice(1)}
              </span>
            )}
          </div>
        </div>
        <p className="text-sm text-gray-600 mt-4 whitespace-pre-wrap">{ticket.description}</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Coluna principal */}
        <div className="flex-1 space-y-6">

          {/* Comentários */}
          <div className="bg-white border rounded-lg">
            <div className="px-6 py-4 border-b font-medium text-sm">Comentários</div>
            <div className="divide-y">
              {(ticket.comments || []).map((c) => (
                <div
                  key={c.id}
                  className={cn('px-6 py-4', c.isInternal && 'bg-yellow-50')}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {c.isInternal && <Lock className="h-3 w-3 text-yellow-600" />}
                    <span className="text-xs text-gray-500">{formatDate(c.createdAt)}</span>
                    {c.isInternal && <span className="text-xs text-yellow-700 font-medium">Nota interna</span>}
                  </div>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}
              {(ticket.comments || []).length === 0 && (
                <p className="px-6 py-4 text-sm text-gray-400">Nenhum comentário.</p>
              )}
            </div>

            {/* Formulário de comentário */}
            <form onSubmit={handleCommentSubmit} className="px-6 py-4 border-t space-y-3">
              <Textarea
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="Escreva um comentário..."
                rows={3}
              />
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  {permissions.has('view_internal_notes') && (
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isInternal}
                        onChange={(e) => setIsInternal(e.target.checked)}
                      />
                      Nota interna
                    </label>
                  )}
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer text-gray-600 hover:text-gray-900">
                    <Paperclip className="h-4 w-4" />
                    Anexar arquivo
                    <input ref={fileRef} type="file" className="hidden" onChange={handleFileUpload} />
                  </label>
                </div>
                <Button type="submit" size="sm" disabled={submittingComment || !commentBody.trim()}>
                  {submittingComment ? 'Enviando...' : 'Enviar'}
                </Button>
              </div>
            </form>
          </div>

          {/* Anexos */}
          {(ticket.attachments || []).length > 0 && (
            <div className="bg-white border rounded-lg">
              <div className="px-6 py-4 border-b font-medium text-sm">Anexos</div>
              <div className="divide-y">
                {ticket.attachments.map((a) => (
                  <div key={a.id} className="px-6 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{a.fileName}</p>
                      <p className="text-xs text-gray-400">{formatDate(a.createdAt)}</p>
                    </div>
                    <a
                      href={ticketsApi.getAttachmentUrl(ticket.id, a.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline flex items-center gap-1 text-sm"
                    >
                      <Download className="h-4 w-4" />
                      Baixar
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="bg-white border rounded-lg">
            <button
              onClick={() => setTimelineOpen((v) => !v)}
              className="w-full px-6 py-4 flex items-center justify-between text-sm font-medium hover:bg-gray-50"
            >
              <span>Timeline de eventos</span>
              {timelineOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {timelineOpen && (
              <div className="border-t divide-y">
                {(ticket.timeLogs || []).map((log) => (
                  <div key={log.id} className="px-6 py-3 flex gap-3">
                    <div className="w-2 h-2 rounded-full bg-gray-300 mt-1.5 shrink-0" />
                    <div>
                      <p className="text-sm text-gray-800">
                        {EVENT_LABELS[log.eventType] || log.eventType}
                        {log.toStatus && ` → ${STATUS_LABELS[log.toStatus] || log.toStatus}`}
                      </p>
                      <p className="text-xs text-gray-400">{timeAgo(log.occurredAt)} · {formatDate(log.occurredAt)}</p>
                    </div>
                  </div>
                ))}
                {(ticket.timeLogs || []).length === 0 && (
                  <p className="px-6 py-4 text-sm text-gray-400">Sem eventos.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Painel lateral de campos */}
        <aside className="w-full md:w-72 shrink-0">
          <div className="bg-white border rounded-lg p-5 space-y-4 text-sm">

            {/* Status */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">STATUS</p>
              {allowedTransitions.length > 0 ? (
                <select
                  value={ticket.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="border rounded-md px-2 py-1.5 text-sm w-full"
                >
                  <option value={ticket.status} disabled>{STATUS_LABELS[ticket.status]}</option>
                  {allowedTransitions.map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              ) : (
                <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[ticket.status])}>
                  {STATUS_LABELS[ticket.status]}
                </span>
              )}
            </div>

            {canReopen && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => reopenMutation.mutate()}
                disabled={reopenMutation.isPending}
              >
                Reabrir Chamado
              </Button>
            )}

            {/* Atribuído a */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">ATRIBUÍDO A</p>
              {permissions.has('reassign_tickets') ? (
                <select
                  value={ticket.assignedToId || ''}
                  onChange={handleAssigneeChange}
                  className="border rounded-md px-2 py-1.5 text-sm w-full"
                >
                  <option value="">— Não atribuído —</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              ) : (
                <p className="text-gray-700">{ticket.assignedToId ? `Usuário #${ticket.assignedToId}` : '— Não atribuído —'}</p>
              )}
            </div>

            {/* Campos de leitura */}
            {[
              { label: 'SOLICITANTE', value: `Usuário #${ticket.requesterId}` },
              { label: 'SETOR', value: `Setor #${ticket.sectorId}` },
              { label: 'URGÊNCIA', value: URGENCY_LABELS[ticket.urgency] },
              { label: 'CRIADO EM', value: formatDate(ticket.createdAt) },
              { label: 'RESOLVIDO EM', value: ticket.resolvedAt ? formatDate(ticket.resolvedAt) : '—' },
              { label: 'FECHADO EM', value: ticket.closedAt ? formatDate(ticket.closedAt) : '—' },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs font-medium text-gray-500 mb-0.5">{label}</p>
                <p className="text-gray-700">{value}</p>
              </div>
            ))}

            {/* Custo estimado */}
            {fieldVisible('estimated_cost') && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">CUSTO ESTIMADO (R$)</p>
                {permissions.has('update_cost') ? (
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={ticket.estimatedCost || ''}
                    onBlur={handleCostChange}
                    placeholder="0,00"
                    className="h-8 text-sm"
                  />
                ) : (
                  <p className="text-gray-700">
                    {ticket.estimatedCost ? `R$ ${Number(ticket.estimatedCost).toFixed(2)}` : '—'}
                  </p>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar no browser**

Clicar num ticket na lista. Deve carregar o detalhe com:
- Header com número, título, badges de status/urgência/SLA
- Painel lateral com status editável, atribuição (para admin), campos de data
- Lista de comentários e formulário de novo comentário
- Seção de anexos (se houver)
- Timeline colapsável com eventos

Testar: mudar status, adicionar comentário, toggle "Nota interna" (visível para admin). Verificar que o botão "Reabrir" aparece para tickets RESOLVIDO.

- [ ] **Step 3: Commit**

```bash
cd "C:\Users\Marcelo\Desktop\CHAMADOS"
git add frontend/src/pages/tickets/TicketDetailPage.jsx
git commit -m "feat: add TicketDetailPage with fields, status, reopen, comments, attachments, timeline"
```

---

## Self-Review

**Spec coverage:**

| Seção spec | Task |
|-----------|------|
| Backend: GET /tickets/:id com timeLogs + attachments | Task 1 |
| Backend: filtros from/to | Task 1 |
| Scaffold + stack | Task 2 |
| lib/axios (interceptor, restauração 2-passos) | Task 3 |
| authStore (fieldVisibilities plural) | Task 3 |
| API clients (auth, tickets, notifications) | Task 3 |
| Auth pages + ProtectedRoute + routing | Task 4 |
| token em body para reset-password | Task 4 (useParams → body) |
| anti-enumeração forgot-password | Task 4 (catch ignorado, sempre mostra "enviado") |
| AppShell + Sidebar responsiva | Task 5 |
| NotificationBell (15s, slice 10, document.title) | Task 5 |
| TicketListPage (filtros, pageSize=20, fieldVisibilities) | Task 6 |
| SLA badge via ticket.slaBadge (não calculado) | Tasks 6, 8 |
| TicketNewPage (validação, subcategoria condicional) | Task 7 |
| TicketDetailPage (campos, status, reopen, comentários body, timeline, anexos) | Task 8 |
| POST /reopen (não PATCH) | Task 8 |
| Logout POST 204 | Task 3 (authApi.logout trata sem body) |
| Restauração de sessão 2 passos | Task 4 (RootLayout) |
| Erros de API (toast) | Tasks 4, 7, 8 |
| Loading states (Skeleton) | Tasks 6, 8 |
| Responsividade | Tasks 5, 6, 8 |

**Sem placeholders:** confirmado — todo código está completo em cada step.

**Consistência de tipos:**
- `fieldVisibilities` — usado em authStore (Task 3), TicketListPage (Task 6), TicketDetailPage (Task 8) ✓
- `ticketsApi.get(id)` retorna `{ ...ticket, slaBadge, comments, timeLogs, attachments }` após Task 1 ✓
- `formatTicketId`, `SLA_BADGE_COLORS`, `STATUS_COLORS`, `STATUS_LABELS` exportados em utils.js (Task 3) e consumidos em Tasks 6 e 8 ✓
- `useAuth()` retorna `{ user, permissions, fieldVisible, logout }` — Task 4 produz, Tasks 5/6/8 consomem ✓
