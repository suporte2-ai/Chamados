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
- Nova permissão `view_performance_panel` (Gestor e Admin)
- Helpers `csvExport.js` e `pdfExport.js`
- Testes de integração contra Postgres real

**Excluído:**
- Frontend / UI
- Métricas em tempo real (sem WebSocket)
- Cache de queries (desnecessário nesta fase)

## 3. Permissões

Nova chave `view_performance_panel` adicionada a:
- `backend/src/lib/permissions.js` → `PERMISSION_KEYS`
- `backend/prisma/seed.js` → `rolePermissionMatrix`: concedida para Gestor e Admin; negada para Técnico e Usuário Final

Autenticação: per-route auth (`authenticated` + `requirePermission('view_performance_panel')`), seguindo o padrão estabelecido nas Fases 2 e 3.

## 4. Estrutura de arquivos

```
backend/src/modules/performance/
  performance.controller.js   (summary, drilldown, exportData)
  performance.routes.js
backend/src/lib/
  csvExport.js                (recebe objeto summary → retorna Buffer CSV)
  pdfExport.js                (recebe objeto summary → retorna Buffer PDF via pdfkit)
backend/tests/
  performance-api.test.js
```

`backend/src/server.js` recebe `app.use('/api', performanceRoutes)`.

## 5. Endpoints

### 5.1 GET /api/performance/summary

**Query params:**
| Param | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `from` | `YYYY-MM-DD` | sim | Início do período — o backend normaliza para `T00:00:00.000Z`, filtra por `createdAt` |
| `to` | `YYYY-MM-DD` | sim | Fim do período — o backend normaliza para `T23:59:59.999Z` |
| `sectorId` | integer | não | Filtra chamados do setor |
| `categoryId` | integer | não | Filtra chamados da categoria |

**Validações:** `from` e `to` ausentes → 400. `from > to` → 400. `sectorId`/`categoryId` inválidos (não numérico) → 400.

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

- `avgFirstResponseMinutes` e `avgResolutionMinutes`: `null` se não há chamados com esses campos preenchidos no período.
- `slaComplianceRate`: proporção (0.0–1.0) de chamados resolvidos com `resolvedAt <= slaResolutionDeadline`. `null` se não há chamados resolvidos no período.
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
- `slaBadge` calculado via `calculateSlaBadge()` (helper já existente).

### 5.3 GET /api/performance/export

**Query params:** `from`, `to`, `sectorId`, `categoryId` (mesmas regras), `format` (`csv` ou `pdf`, obrigatório).

**Formato inválido** → 400.

**Resposta 200:**
- CSV: `Content-Type: text/csv`, `Content-Disposition: attachment; filename="performance-YYYY-MM-DD.csv"`
- PDF: `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="performance-YYYY-MM-DD.pdf"`

**Conteúdo CSV** (duas seções separadas por linha em branco):
```
Período,De,Até
2026-06-01,2026-06-25

Total de chamados,Média 1ª resposta (min),Média resolução (min),SLA cumprido
142,87,1240,78%

Técnico,Setor,Chamados,Média 1ª resposta (min),Média resolução (min),SLA cumprido
João Silva,TI,23,62,980,87%
```

**Conteúdo PDF:** relatório tabular simples gerado com `pdfkit` — cabeçalho com período e filtros aplicados, bloco de métricas gerais, tabela de métricas por técnico.

## 6. Implementação das queries

### Métricas gerais — Prisma ORM
```js
const agg = await prisma.ticket.aggregate({
  where,
  _count: { id: true },
  _avg: { timeToFirstResponseMinutes: true, timeToResolutionMinutes: true },
});
```

### Taxa de SLA — $queryRaw
Comparação entre duas colunas da mesma linha (`resolved_at <= sla_resolution_deadline`) não é expressável no ORM — único uso de `$queryRaw`:
```sql
SELECT
  COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) AS total_resolved,
  COUNT(*) FILTER (WHERE resolved_at IS NOT NULL AND resolved_at <= sla_resolution_deadline) AS compliant
FROM "Ticket"
WHERE created_at >= $1 AND created_at <= $2
  [AND sector_id = $3] [AND category_id = $4]
```
`slaComplianceRate = compliant / total_resolved` (null se `total_resolved = 0`).

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
SLA por técnico via `$queryRaw` com `GROUP BY assigned_to_id`.

Os resultados são combinados em memória no controller (join por `assignedToId`) e enriquecidos com `userName`/`sectorName` via `prisma.user.findMany({ where: { id: { in: userIds } }, include: { sector: true } })`.

## 7. Helpers de exportação

### csvExport.js
```js
function generateCsv(summary) { /* retorna string CSV */ }
module.exports = { generateCsv };
```
Função pura — sem acesso ao banco, sem imports do Prisma. Recebe o objeto `summary` já montado pelo controller e serializa.

### pdfExport.js
```js
function generatePdf(summary) { /* retorna Promise<Buffer> */ }
module.exports = { generatePdf };
```
Usa `pdfkit`. Função assíncrona porque o PDF é gerado via stream — resolve com Buffer completo. Sem acesso ao banco.

**Dependência nova:** `npm install pdfkit` (CJS, compatível com Jest sem configuração extra).

## 8. Testes

`backend/tests/performance-api.test.js` — integração real contra Postgres, padrão dos testes existentes.

**Setup (`beforeAll`):** cria setor, role com `view_performance_panel`, dois técnicos, e um conjunto de chamados com `timeToFirstResponseMinutes`, `timeToResolutionMinutes`, `resolvedAt` e `slaResolutionDeadline` definidos explicitamente (sem passar pelo fluxo de status — insere direto via `prisma.ticket.create`).

**Casos de teste:**
1. `GET /summary` retorna métricas corretas para o período
2. `GET /summary` respeita filtro de `sectorId`
3. `GET /summary` retorna 400 sem `from`/`to`
4. `GET /summary` retorna 400 com `from > to`
5. `GET /users/:id/drilldown` retorna métricas e lista de chamados
6. `GET /users/:id/drilldown` retorna 404 para usuário inexistente
7. `GET /export?format=csv` retorna 200 com `Content-Type: text/csv`
8. `GET /export?format=pdf` retorna 200 com `Content-Type: application/pdf`
9. `GET /export` sem permissão retorna 403

**Não testado nesta fase:** conteúdo interno do PDF (apenas header e status), exportação com filtros combinados (coberto implicitamente pelo summary).

## 9. Ordem de implementação (tasks)

1. Adicionar `view_performance_panel` a `PERMISSION_KEYS` e `seed.js`
2. Criar `csvExport.js` + testes unitários
3. Criar `pdfExport.js` + teste básico (instala pdfkit)
4. Criar `performance.controller.js` + `performance.routes.js` + montar em `server.js`
5. Criar `performance-api.test.js` e validar suite completa
