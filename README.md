# Sistema de Chamados (Helpdesk)

Sistema completo de helpdesk/ticketing com painel web. Veja o design completo
em `docs/superpowers/specs/2026-06-22-helpdesk-design.md`.

## Status atual

Esta é a Fase 1 do projeto: schema do banco de dados, migrations e dados de
exemplo (seed). As fases seguintes (autenticação, módulo de chamados, painel
de desempenho, ideias, dashboard e admin) ainda serão adicionadas — esta
seção do README será expandida a cada fase.

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

   (A autenticação real ainda será implementada na próxima fase; por
   enquanto este usuário existe apenas no banco de dados.)

## Variáveis de ambiente (backend/.env)

| Variável       | Descrição                                  | Exemplo                                                              |
|----------------|---------------------------------------------|-----------------------------------------------------------------------|
| `DATABASE_URL` | String de conexão do PostgreSQL             | `postgresql://helpdesk:helpdesk@localhost:5432/helpdesk?schema=public` |
| `PORT`         | Porta em que o backend Express escuta       | `4000`                                                                 |

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

## Verificar dados de exemplo

```bash
cd backend
npm run db:verify-seed
```
