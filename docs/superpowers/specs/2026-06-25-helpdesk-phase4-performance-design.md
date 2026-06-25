# Fase 4 — Painel de Desempenho da Equipe (Backend)

Data: 2026-06-25

## 1. Visão geral

Fase 4 adiciona a API de desempenho da equipe ao backend do sistema de chamados. Expõe três endpoints sob `/api/performance` que agregam métricas de atendimento (tempo médio de primeira resposta, tempo médio de resolução, taxa de SLA cumprido, volume por status/urgência) com filtros por período, setor e categoria. Inclui exportação em CSV e PDF.

Nenhum frontend é criado nesta fase — o painel visual virá em fase posterior.

## 2. Escopo

**Incluído:**
- `GET /api/performance/summary` — métricas gerais + tabela por técnico
- `GET /api/performance/users/:id/drilldown` — detalhamento por técnico com lista de chamados
- `GET /api/performance/export` — download CSV ou PDF do summary
- Permissão `view_performance_panel` verificada e confirmada (Gestor e Admin)
- Helpers `csvExport.js` e `pdfExport.js`
- Testes de integração contra Postgres real

**Excluído:**
- Frontend / UI
- Métricas em tempo real (sem WebSocket)
- Cache de queries (desnecessário nesta fase)

## 3. Permissões

A chave `view_performance_panel` **já existe** em `backend/src/lib/permissions.js` (`PERMISSION_KEYS`) e em `backend/prisma/seed.js` (concedida para Admin via `allPermissionKeys` e para Gestor explicitamente; negada para Técnico e Usuário Final). A Task 1 da implementação deve **verificar** que a chave está presente — não duplicar. Inserir uma chave duplicada no array quebraria o seed por violação de `@@unique([roleId, permissionKey])`.

Autenticação: per-route auth (`authenticated` + `requirePermission('view_performance_panel')`), seguindo o padrão estabelecido nas Fases 2 e 3.

## 4. Estrutura de arquivos

```
backend/src/modules/performance/
  performance.controller.js   (summary, drilldown, exportData)
  performance.routes.js       (rotas internas: /performance/summary, /performance/users/:id/drilldown, /performance/export)
backend/src/lib/
  csvExport.js                (recebe objeto summary → retorna string CSV)
  pdfExport.js                (recebe objeto summary → retorna Promise<Buffer> via pdfkit)
backend/tests/
  performance-api.test.js
```

`backend/src/server.js` recebe `app.use('/api', performanceRoutes)`. As rotas internas do router declaram o path completo a partir de `/performance/...` (ex.: `router.get('/performance/summary', ...)`), resultando em `/api/performance/summary` — mesmo padrão de todos os outros módulos.

## 5. Endpoints

### 5.1 GET /api/performance/summary

**Query params:**
| Param | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `from` | `YYYY-MM-DD` | sim | Início do período — normalizado para `T00:00:00.000Z`, filtra por `createdAt` |
| `to` | `YYYY-MM-DD` | sim | Fim do período — normalizado para `T23:59:59.999Z` |
| `sectorId` | integer | não | Filtra chamados do setor. Numérico inexistente → 200 com resultados vazios (filtro não casa nada) |
| `categoryId` | integer | não | Filtra chamados da categoria. Mesma regra de `sectorId` |

**Validações:** `from` ou `to` ausentes → 400. `from > to` → 400. `sectorId`/`categoryId` não numérico → 400.

**Nota sobre SLA:** `slaComplianceRate` é calculado sobre os chamados **criados no período** (`createdAt` entre `from` e `to`) que estão resolvidos (`resolvedAt IS NOT NULL`). O filtro de período não usa `resolvedAt` — um chamado criado no período mas ainda aberto simplesmente não entra no denominador.

**Resposta 200:**
```json
{
  "period": { "from": "2026-06-01", "to": "2026-06-25" },
  "overall": {
    "totalTickets": 142,
    "avgFirstResponseMinutes": 87,
    "avgResolutionMinutes": 1240,
    "slaComplianceRate": 0.78
  },
  "byUser": [
    {
      "userId": 3,
      "userName": "João Silva",
      "sectorName": "TI",
      "totalTickets": 23,
      "avgFirstResponseMinutes": 62,
      "avgResolutionMinutes": 980,
      "slaComplianceRate": 0.87
    }
  ]
}
```

- `avgFirstResponseMinutes` e `avgResolutionMinutes`: arredondados com `Math.round`; `null` se não há chamados com esses campos preenchidos no período.
- `slaComplianceRate`: proporção (0.0–1.0), duas casas decimais; `null` se não há chamados resolvidos no período.
- `byUser`: inclui apenas técnicos com ao menos 1 chamado atribuído no período. Ordenado por `totalTickets` desc.

### 5.2 GET /api/performance/users/:id/drilldown

**Query params:** `from`, `to` (`YYYY-MM-DD`, mesmas regras de normalização e validação do summary).

**Resposta 200:**
```json
{
  "user": { "id": 3, "name": "João Silva", "sectorName": "TI" },
  "metrics": {
    "totalTickets": 23,
    "avgFirstResponseMinutes": 62,
    "avgResolutionMinutes": 980,
    "slaComplianceRate": 0.87,
    "byStatus": {
      "ABERTO": 2, "EM_ANDAMENTO": 5, "AGUARDANDO": 0,
      "RESOLVIDO": 14, "FECHADO": 2
    },
    "byUrgency": { "CRITICO": 3, "ALTO": 8, "MEDIO": 10, "BAIXO": 2 }
  },
  "tickets": [
    {
      "id": 42,
      "title": "Impressora sem papel",
      "urgency": "ALTO",
      "status": "RESOLVIDO",
      "createdAt": "2026-06-10T09:00:00.000Z",
      "resolvedAt": "2026-06-10T11:30:00.000Z",
      "slaBadge": "verde"
    }
  ]
}
```

- Retorna 404 se o usuário não existe.
- `tickets` listados por `createdAt` desc, sem paginação (período delimitado pelo filtro).
- `slaBadge` calculado via `calculateSlaBadge()` (helper já existente em `backend/src/lib/slaBadge.js`).
- `byStatus`: o controller inicializa todos os 5 status do enum com valor `0` e sobrepõe com as contagens do `groupBy`. Isso garante que todas as chaves apareçam mesmo quando uma delas tem zero chamados — o `groupBy` do Prisma omite grupos sem dados.
- `byUrgency`: mesma lógica — controller inicializa `{ CRITICO: 0, ALTO: 0, MEDIO: 0, BAIXO: 0 }` antes de sobrepor.
- `avgFirstResponseMinutes` e `avgResolutionMinutes`: arredondados com `Math.round`; `null` se não há chamados com esses campos preenchidos.

### 5.3 GET /api/performance/export

**Query params:** `from`, `to`, `sectorId`, `categoryId` (mesmas regras), `format` (`csv` ou `pdf`, obrigatório).

**Formato inválido ou ausente** → 400.

**Resposta 200:**
- CSV: `Content-Type: text/csv`, `Content-Disposition: attachment; filename="performance-YYYY-MM-DD.csv"`
- PDF: `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="performance-YYYY-MM-DD.pdf"`

O controller chama `summary()` internamente para montar os dados e passa o resultado para `generateCsv()` ou `generatePdf()`.

**Conteúdo CSV** (três seções separadas por linha em branco):
```
De,Até
2026-06-01,2026-06-25

Total de chamados,Média 1ª resposta (min),Média resolução (min),SLA cumprido
142,87,1240,78%

Técnico,Setor,Chamados,Média 1ª resposta (min),Média resolução (min),SLA cumprido
João Silva,TI,23,62,980,87%
```

- `slaComplianceRate` no CSV é formatado como percentual inteiro (`Math.round(rate * 100) + '%'`).
- Quando `slaComplianceRate` é `null` (sem chamados resolvidos), a célula exibe `N/A`.
- Quando `avgFirstResponseMinutes` ou `avgResolutionMinutes` são `null`, a célula exibe `N/A`.

**Conteúdo PDF:** relatório tabular simples gerado com `pdfkit` — cabeçalho com período e filtros aplicados, bloco de métricas gerais, tabela de métricas por técnico.

## 6. Implementação das queries

### Convenção de nomes no banco (importante para $queryRaw)

O schema Prisma usa `@@map("tickets")` → tabela se chama `"tickets"` (minúsculo). Os campos **não** têm `@map`, portanto o Postgres armazena os nomes em camelCase com aspas duplas: `"createdAt"`, `"resolvedAt"`, `"slaResolutionDeadline"`, `"sectorId"`, `"categoryId"`, `"assignedToId"` etc. Todo SQL raw deve usar aspas duplas nesses identificadores.

### Métricas gerais — Prisma ORM
```js
const agg = await prisma.ticket.aggregate({
  where,
  _count: { id: true },
  _avg: { timeToFirstResponseMinutes: true, timeToResolutionMinutes: true },
});
// avgFirstResponseMinutes = agg._avg.timeToFirstResponseMinutes != null
//   ? Math.round(agg._avg.timeToFirstResponseMinutes) : null
```

### Taxa de SLA — $queryRaw
Comparação entre duas colunas da mesma linha (`"resolvedAt" <= "slaResolutionDeadline"`) não é expressável no ORM — único uso de `$queryRaw`:
```js
const [slaRow] = await prisma.$queryRaw`
  SELECT
    COUNT(*) FILTER (WHERE "resolvedAt" IS NOT NULL)::int AS total_resolved,
    COUNT(*) FILTER (WHERE "resolvedAt" IS NOT NULL AND "resolvedAt" <= "slaResolutionDeadline")::int AS compliant
  FROM "tickets"
  WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
`;
// slaComplianceRate = slaRow.total_resolved > 0
//   ? Math.round((slaRow.compliant / slaRow.total_resolved) * 100) / 100 : null
```
Para filtros opcionais (`sectorId`, `categoryId`), usar `Prisma.sql` para composição segura do WHERE.

### Métricas por técnico — Prisma groupBy
```js
const byUser = await prisma.ticket.groupBy({
  by: ['assignedToId'],
  where: { assignedToId: { not: null }, ...where },
  _count: { id: true },
  _avg: { timeToFirstResponseMinutes: true, timeToResolutionMinutes: true },
  orderBy: { _count: { id: 'desc' } },
});
```
SLA por técnico via `$queryRaw` com `GROUP BY "assignedToId"` (mesma convenção de nomes).

Os resultados são combinados em memória no controller (join por `assignedToId`) e enriquecidos com `userName`/`sectorName` via `prisma.user.findMany({ where: { id: { in: userIds } }, include: { sector: true } })`.

## 7. Helpers de exportação

### csvExport.js
```js
function generateCsv(summary) { /* retorna string CSV */ }
module.exports = { generateCsv };
```
Função pura — sem acesso ao banco, sem imports do Prisma. Recebe o objeto `summary` já montado pelo controller e serializa. Trata `null` como `N/A` em todas as células de métrica.

### pdfExport.js
```js
async function generatePdf(summary) { /* retorna Promise<Buffer> */ }
module.exports = { generatePdf };
```
Usa `pdfkit`. Função assíncrona porque o PDF é gerado via stream — resolve com Buffer completo. Sem acesso ao banco.

**Dependência nova:** `npm install pdfkit` (CJS, compatível com Jest sem configuração extra).

## 8. Testes

`backend/tests/performance-api.test.js` — integração real contra Postgres, padrão dos testes existentes.

**Setup (`beforeAll`):** cria setor, role com `view_performance_panel`, dois técnicos com `view_performance_panel`, **uma role sem a permissão** e um usuário com essa role (para testar 403), categoria + subcategoria, e um conjunto de chamados com `timeToFirstResponseMinutes`, `timeToResolutionMinutes`, `resolvedAt` e `slaResolutionDeadline` definidos explicitamente.

Como os tickets são inseridos diretamente via `prisma.ticket.create` (sem passar pelo fluxo de status), todos os campos NOT NULL do schema devem ser fornecidos: `title`, `description`, `categoryId`, `subcategoryId`, `urgency`, `requesterId`, `sectorId`, `slaFirstResponseDeadline`, `slaResolutionDeadline`.

**Casos de teste:**
1. `GET /summary` retorna métricas corretas para o período (totalTickets, avg, slaComplianceRate)
2. `GET /summary` respeita filtro de `sectorId`
3. `GET /summary` retorna 400 sem `from`/`to`
4. `GET /summary` retorna 400 com `from > to`
5. `GET /summary` retorna 403 sem `view_performance_panel`
6. `GET /users/:id/drilldown` retorna métricas (incl. `byStatus` com zeros) e lista de chamados
7. `GET /users/:id/drilldown` retorna 404 para usuário inexistente
8. `GET /export?format=csv` retorna 200 com `Content-Type: text/csv`
9. `GET /export?format=pdf` retorna 200 com `Content-Type: application/pdf`
10. `GET /export` sem permissão retorna 403

**Não testado nesta fase:** conteúdo interno do PDF (apenas header e status), exportação com filtros combinados (coberto implicitamente pelo summary).

## 9. Ordem de implementação (tasks)

1. Verificar que `view_performance_panel` já existe em `PERMISSION_KEYS` e `seed.js` — não duplicar
2. Criar `csvExport.js` + testes unitários (função pura, sem DB)
3. Criar `pdfExport.js` + teste básico — instalar `pdfkit`
4. Criar `performance.controller.js` + `performance.routes.js` + montar em `server.js`
5. Criar `performance-api.test.js` e validar suite completa
