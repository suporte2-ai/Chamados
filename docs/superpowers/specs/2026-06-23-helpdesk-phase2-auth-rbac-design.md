# Helpdesk Fase 2: Autenticação + RBAC — Design

Data: 2026-06-23

## 1. Visão geral

Implementa a Fase 2 da ordem definida em `2026-06-22-helpdesk-design.md` (seção 11):
autenticação JWT (login/refresh/logout/forgot-password/reset-password) e
gestão de usuários/roles/permissões (RBAC), combinadas em um único plano de
implementação. Constrói sobre o schema e seed já existentes (Fase 1).

## 2. Schema (migration incremental)

- `User.refreshTokenVersion Int @default(0)` — incrementado em login, em
  cada rotação de refresh token e em logout/reset de senha. O refresh token
  (JWT) carrega esse número; se não bater com o valor atual no banco, é
  recusado (`401`). Permite revogar refresh tokens antigos sem precisar de
  uma tabela de sessões dedicada.
- `PasswordResetToken.token` passa a armazenar o **hash SHA-256** do valor
  enviado ao usuário (não o valor em claro), mitigando uso direto em caso de
  exposição do banco. Nenhuma outra coluna muda.

## 3. Dependências novas

- `jsonwebtoken` — assinatura/verificação de access e refresh tokens.
- `cookie-parser` — leitura do refresh token do cookie httpOnly.

Sem biblioteca de validação de request body — segue o estilo manual já
usado no projeto (checks simples no início de cada handler, lançando erro
com status apropriado).

## 4. Variáveis de ambiente novas (`.env.example`)

```
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
RESET_TOKEN_EXPIRES_HOURS=1
```

## 5. Middleware de autenticação e autorização

- `authenticate` (`src/middleware/authenticate.js`) — lê
  `Authorization: Bearer <token>`, valida assinatura/expiração do access
  token via `JWT_ACCESS_SECRET`. Carrega `Role` + `RolePermission` +
  `RoleFieldVisibility` do usuário e popula
  `req.user = { id, roleId, sectorId, permissions: Set<string>, fieldVisibilities: Set<string> }`.
  Sem token ou token inválido/expirado → `401`.
- `requirePermission(key)` (`src/middleware/requirePermission.js`) —
  factory de middleware; usado **declarativamente** em cada rota sensível
  (ex: `router.patch('/:id/status', authenticate, requirePermission('close_tickets'), handler)`).
  Se `req.user.permissions` não contém `key` → `403`.
- `src/lib/permissions.js` — catálogo fixo no código:
  `PERMISSION_KEYS` (ex: `view_performance_panel`, `view_financial_reports`,
  `reassign_tickets`, `close_tickets`, `view_internal_notes`, `manage_users`,
  `view_own_metrics`, `reopen_tickets`) e `FIELD_KEYS` (ex: `assigned_to`,
  `estimated_cost`, `internal_notes`, `sla_badge`). Endpoints de roles
  validam toggles contra essas listas (rejeitam chave desconhecida com
  `400`). `GET /api/permissions/catalog` expõe as duas listas para o
  frontend montar as telas de toggle sem hardcode duplicado.

## 6. Endpoints de autenticação

- `POST /api/auth/login` — `{ email, password }`. Busca `User` por email,
  `bcrypt.compare` contra `passwordHash`. Se `active=false` → `403`
  (mensagem genérica, não distingue de outros motivos de bloqueio). Se
  credenciais inválidas → `401`. Sucesso: gera access token (claims `{ sub:
  userId }`, `JWT_ACCESS_EXPIRES`) e refresh token (claims `{ sub: userId,
  ver: refreshTokenVersion }`, `JWT_REFRESH_EXPIRES`), seta refresh em
  cookie httpOnly (`Secure` em produção, `SameSite=Lax`). Atualiza
  `lastLoginAt`. Retorna no body `{ accessToken, user: { id, name, email,
  role: { id, name }, sectorId }, permissions: string[], fieldVisibilities:
  { fieldKey, visible }[] }`.
- `POST /api/auth/refresh` — lê cookie de refresh, valida assinatura e
  compara `ver` da claim com `User.refreshTokenVersion` atual; se diferente
  ou token inválido/expirado → `401` (frontend redireciona para login).
  Sucesso: **incrementa `refreshTokenVersion`** (invalida o token usado),
  emite novo par access+refresh, seta novo cookie. Retorna novo
  `accessToken` no body.
- `POST /api/auth/logout` — requer `authenticate`. Incrementa
  `refreshTokenVersion` do usuário logado e limpa o cookie de refresh.
- `GET /api/auth/me` — requer `authenticate`. Retorna o mesmo payload de
  perfil do login (sem tokens), para hidratar o frontend em reload de
  página.
- `POST /api/auth/forgot-password` — `{ email }`. Sempre responde `200`
  genérico (evita enumeração de e-mails), independentemente de o e-mail
  existir. Se existir usuário ativo com esse e-mail: gera token aleatório,
  salva `sha256(token)` em `PasswordResetToken` com
  `expiresAt = now + RESET_TOKEN_EXPIRES_HOURS`, envia o link (Nodemailer
  se SMTP configurado; senão loga no console, conforme já definido na Fase
  1/design geral).
- `POST /api/auth/reset-password` — `{ token, newPassword }`. Busca
  `PasswordResetToken` por `sha256(token)`; valida `expiresAt > now` e
  `usedAt IS NULL`, senão `400`. Sucesso: atualiza `passwordHash`, marca
  `usedAt = now`, incrementa `refreshTokenVersion` do usuário (derruba
  sessões ativas).

## 7. Endpoints de usuários e roles

Todas as rotas abaixo exigem `authenticate` + `requirePermission('manage_users')`.

- `GET /api/users` — lista usuários (com role e setor).
- `POST /api/users` — `{ name, email, password, roleId, sectorId }`. Admin
  define a senha diretamente no formulário (sem geração automática nem
  e-mail de boas-vindas nesta fase). Valida email único (`409` se
  duplicado), `roleId`/`sectorId` existentes (`400` se não).
- `PATCH /api/users/:id` — atualização parcial, incluindo `active: false`
  para "excluir" (soft delete) — não existe `DELETE /api/users/:id`
  dedicado nesta implementação (decisão desta fase: reaproveitar o PATCH
  genérico em vez de um endpoint separado, mantendo a mesma semântica de
  soft-delete do spec geral).
- `GET /api/roles` — lista roles com `permissions` e `fieldVisibilities`
  incluídas.
- `POST /api/roles` — `{ name, level }`. Cria role nova (`isSystemDefault`
  sempre `false` para roles criadas via API).
- `PATCH /api/roles/:id` — atualiza `name`/`level`.
- `PATCH /api/roles/:id/permissions` — body `{ permissionKey, enabled }[]`;
  cada `permissionKey` deve existir em `PERMISSION_KEYS` (`400` se não);
  faz upsert em `RolePermission`.
- `PATCH /api/roles/:id/field-visibility` — mesmo padrão para `FIELD_KEYS`
  e `RoleFieldVisibility`.
- `DELETE /api/roles/:id` — `409` se `isSystemDefault=true` ou se existir
  algum `User` com `roleId` igual a esse id; caso contrário, apaga a role
  (cascade já cobre `RolePermission`/`RoleFieldVisibility`).
- `GET /api/permissions/catalog` — retorna `{ permissionKeys, fieldKeys }`
  fixos do `src/lib/permissions.js` (acessível a qualquer usuário
  autenticado, não exige `manage_users`, pois é só metadado estático usado
  pela tela de toggles).

## 8. Estrutura de arquivos

```
backend/src/
  lib/
    permissions.js
    jwt.js
  middleware/
    authenticate.js
    requirePermission.js
  modules/
    auth/
      auth.routes.js
      auth.controller.js
    users/
      users.routes.js
      users.controller.js
    roles/
      roles.routes.js
      roles.controller.js
backend/tests/
  auth.test.js
  rbac-middleware.test.js
  users-roles-api.test.js
```

## 9. Testes

Seguindo o padrão já estabelecido na Fase 1 (Jest + Supertest, Postgres
real via `docker-compose`, cada teste cria/limpa apenas os IDs que cria —
mesmo padrão do fix recente em `identity-rbac.test.js`):

- `auth.test.js` — login (sucesso, senha errada, usuário inativo →`403`),
  refresh (sucesso com rotação, reuso do token antigo →`401`), logout
  (refresh subsequente falha), forgot-password (sempre `200`, token gerado
  só se e-mail existir), reset-password (sucesso, token expirado, token já
  usado).
- `rbac-middleware.test.js` — `authenticate` sem token (`401`), token
  inválido/expirado (`401`); `requirePermission` com permissão presente
  (passa) e ausente (`403`).
- `users-roles-api.test.js` — CRUD de usuários (criação, email duplicado
  `409`, soft delete via PATCH), CRUD de roles (toggles de permissão/campo
  com chave inválida `400`, delete bloqueado por `isSystemDefault` ou por
  usuários vinculados `409`), `GET /api/permissions/catalog`.

## 10. Fora de escopo desta fase

- Geração automática de senha/e-mail de boas-vindas ao criar usuário.
- Tabela de sessões/multi-dispositivo (revogação granular por dispositivo).
- Telas de frontend (Fase 2 é só backend; frontend vem em fases
  posteriores conforme a ordem geral do design).
