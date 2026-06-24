# Sistema de Chamados (Helpdesk)

Sistema completo de helpdesk/ticketing com painel web. Veja o design completo
em `docs/superpowers/specs/2026-06-22-helpdesk-design.md`.

## Status atual

Fases 1 e 2 concluídas: schema do banco de dados, migrations, dados de
exemplo (seed), autenticação JWT (login, refresh com rotação, logout,
recuperação de senha) e gestão de usuários/roles/permissões (RBAC). As
fases seguintes (módulo de chamados, painel de desempenho, ideias,
dashboard e admin) ainda serão adicionadas — esta seção do README será
expandida a cada fase.

## Stack

- Backend: Node.js + Express + Prisma ORM + PostgreSQL
- Frontend: React (Vite) + Tailwind CSS (ainda não iniciado)

## Pré-requisitos

- Node.js 20+
- Docker e Docker Compose (para o PostgreSQL local)

## Como rodar localmente

1. Suba o banco de dados PostgreSQL:

   ```bash
   docker compose up -d postgres
   ```

2. Instale as dependências do backend:

   ```bash
   cd backend
   npm install
   ```

3. Copie o arquivo de variáveis de ambiente:

   ```bash
   cp .env.example .env
   ```

4. Rode as migrations:

   ```bash
   npx prisma migrate dev
   ```

5. Popule o banco com dados de exemplo:

   ```bash
   npm run db:seed
   ```

   Isso cria 4 perfis (Administrador, Gestor, Técnico/Atendente, Usuário
   Final), 3 setores, categorias/subcategorias, configuração de SLA por
   urgência, 10 usuários de exemplo e ~50 chamados com timestamps variados.

6. Para criar o primeiro administrador (já incluído no seed):

   - **E-mail:** `admin@helpdesk.com`
   - **Senha:** `Senha123!`

   Use este usuário para fazer login via `POST /api/auth/login` — veja a
   seção [Autenticação (Fase 2)](#autenticação-fase-2) abaixo.

## Variáveis de ambiente (backend/.env)

| Variável       | Descrição                                  | Exemplo                                                              |
|----------------|---------------------------------------------|-----------------------------------------------------------------------|
| `DATABASE_URL` | String de conexão do PostgreSQL             | `postgresql://helpdesk:helpdesk@localhost:5432/helpdesk?schema=public` |
| `PORT`         | Porta em que o backend Express escuta       | `4000`                                                                 |
| `JWT_ACCESS_SECRET`         | Segredo de assinatura do access token       | string aleatória forte                                                 |
| `JWT_REFRESH_SECRET`        | Segredo de assinatura do refresh token      | string aleatória forte (diferente do access)                          |
| `JWT_ACCESS_EXPIRES`        | Validade do access token                    | `15m`                                                                  |
| `JWT_REFRESH_EXPIRES`       | Validade do refresh token                   | `7d`                                                                   |
| `RESET_TOKEN_EXPIRES_HOURS` | Validade do link de redefinição de senha    | `1`                                                                    |

## Testes

```bash
cd backend
npx jest --runInBand
```

**Importante:** os testes e o seed (`npm run db:seed`) operam sobre as
mesmas tabelas e cada um limpa os dados que usa. Não rode `npx jest` depois
de `npm run db:seed` esperando que os dados de exemplo permaneçam — execute
um ou outro dependendo do que você precisa no momento (verificar o schema
vs. ter uma base de demonstração populada).

## Autenticação (Fase 2)

- `POST /api/auth/login` — `{ email, password }`, retorna `accessToken` no
  corpo e seta o refresh token em cookie httpOnly (`path=/api/auth`).
- `POST /api/auth/refresh` — lê o cookie de refresh, rotaciona e retorna um
  novo `accessToken`.
- `POST /api/auth/logout` — requer `Authorization: Bearer <accessToken>`;
  invalida o refresh token atual.
- `GET /api/auth/me` — retorna o perfil do usuário logado.
- `POST /api/auth/forgot-password` / `POST /api/auth/reset-password` — sem
  SMTP configurado, o link de redefinição é apenas logado no console do
  backend (modo dev).
- Rotas administrativas (`/api/users`, `/api/roles`,
  `/api/permissions/catalog`) exigem `Authorization: Bearer <accessToken>`
  de um usuário com a permissão `manage_users` (exceto o catálogo, que só
  exige estar autenticado).
- Use o usuário semeado `admin@helpdesk.com` / `Senha123!` para obter um
  token via `POST /api/auth/login` e testar as rotas administrativas.

## Verificar dados de exemplo

```bash
cd backend
npm run db:verify-seed
```
