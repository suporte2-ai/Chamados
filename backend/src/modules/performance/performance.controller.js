const { Prisma } = require('@prisma/client');
const prisma = require('../../lib/prisma');
const { calculateSlaBadge } = require('../../lib/slaBadge');
const { generateCsv } = require('../../lib/csvExport');
const { generatePdf } = require('../../lib/pdfExport');

const STATUS_KEYS = ['ABERTO', 'EM_ANDAMENTO', 'AGUARDANDO', 'RESOLVIDO', 'FECHADO'];
const URGENCY_KEYS = ['CRITICO', 'ALTO', 'MEDIO', 'BAIXO'];

function parseDates(req, res) {
  const { from, to } = req.query;
  if (!from || !to) {
    res.status(400).json({ error: 'Os parâmetros from e to são obrigatórios (YYYY-MM-DD).' });
    return null;
  }
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    res.status(400).json({ error: 'Formato de data inválido. Use YYYY-MM-DD.' });
    return null;
  }
  if (fromDate > toDate) {
    res.status(400).json({ error: 'from não pode ser posterior a to.' });
    return null;
  }
  return { fromDate, toDate, from, to };
}

function parseFilters(req, res) {
  const { sectorId, categoryId } = req.query;
  const filters = {};
  if (sectorId !== undefined) {
    const parsed = Number(sectorId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      res.status(400).json({ error: 'sectorId deve ser um número inteiro positivo.' });
      return null;
    }
    filters.sectorId = parsed;
  }
  if (categoryId !== undefined) {
    const parsed = Number(categoryId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      res.status(400).json({ error: 'categoryId deve ser um número inteiro positivo.' });
      return null;
    }
    filters.categoryId = parsed;
  }
  return filters;
}

function roundOrNull(val) {
  return val != null ? Math.round(val) : null;
}

async function buildSummary(fromDate, toDate, from, to, filters) {
  const where = {
    createdAt: { gte: fromDate, lte: toDate },
    ...(filters.sectorId ? { sectorId: filters.sectorId } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
  };

  // Métricas gerais via Prisma ORM
  const agg = await prisma.ticket.aggregate({
    where,
    _count: { id: true },
    _avg: { timeToFirstResponseMinutes: true, timeToResolutionMinutes: true },
  });

  // SLA overall via $queryRaw (comparação coluna-a-coluna)
  const sectorClause = filters.sectorId ? Prisma.sql`AND "sectorId" = ${filters.sectorId}` : Prisma.empty;
  const categoryClause = filters.categoryId ? Prisma.sql`AND "categoryId" = ${filters.categoryId}` : Prisma.empty;

  const [slaRow] = await prisma.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE "resolvedAt" IS NOT NULL)::int AS total_resolved,
      COUNT(*) FILTER (WHERE "resolvedAt" IS NOT NULL AND "resolvedAt" <= "slaResolutionDeadline")::int AS compliant
    FROM "tickets"
    WHERE "createdAt" >= ${fromDate} AND "createdAt" <= ${toDate}
    ${sectorClause} ${categoryClause}
  `;

  const overallSlaRate =
    slaRow.total_resolved > 0
      ? Math.round((slaRow.compliant / slaRow.total_resolved) * 100) / 100
      : null;

  // Métricas por técnico via groupBy
  const byUserAgg = await prisma.ticket.groupBy({
    by: ['assignedToId'],
    where: { assignedToId: { not: null }, ...where },
    _count: { id: true },
    _avg: { timeToFirstResponseMinutes: true, timeToResolutionMinutes: true },
    orderBy: { _count: { id: 'desc' } },
  });

  // SLA por técnico via $queryRaw
  const userIds = byUserAgg.map((u) => u.assignedToId);
  let userSlaMap = {};
  if (userIds.length > 0) {
    const userSlaRows = await prisma.$queryRaw`
      SELECT
        "assignedToId" AS user_id,
        COUNT(*) FILTER (WHERE "resolvedAt" IS NOT NULL)::int AS total_resolved,
        COUNT(*) FILTER (WHERE "resolvedAt" IS NOT NULL AND "resolvedAt" <= "slaResolutionDeadline")::int AS compliant
      FROM "tickets"
      WHERE "assignedToId" IN (${Prisma.join(userIds)})
        AND "createdAt" >= ${fromDate} AND "createdAt" <= ${toDate}
        ${sectorClause} ${categoryClause}
      GROUP BY "assignedToId"
    `;
    for (const r of userSlaRows) {
      userSlaMap[r.user_id] =
        r.total_resolved > 0 ? Math.round((r.compliant / r.total_resolved) * 100) / 100 : null;
    }
  }

  // Enriquecer com userName/sectorName
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, include: { sector: true } })
      : [];
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  const byUser = byUserAgg.map((row) => {
    const u = userMap[row.assignedToId];
    return {
      userId: row.assignedToId,
      userName: u?.name ?? 'Desconhecido',
      sectorName: u?.sector?.name ?? null,
      totalTickets: row._count.id,
      avgFirstResponseMinutes: roundOrNull(row._avg.timeToFirstResponseMinutes),
      avgResolutionMinutes: roundOrNull(row._avg.timeToResolutionMinutes),
      slaComplianceRate: userSlaMap[row.assignedToId] ?? null,
    };
  });

  const statusGroups = await prisma.ticket.groupBy({ by: ['status'], where, _count: { id: true } });
  const byStatus = Object.fromEntries(STATUS_KEYS.map(s => [s, 0]));
  for (const g of statusGroups) byStatus[g.status] = g._count.id;

  const urgencyGroups = await prisma.ticket.groupBy({ by: ['urgency'], where, _count: { id: true } });
  const byUrgency = Object.fromEntries(URGENCY_KEYS.map(u => [u, 0]));
  for (const g of urgencyGroups) byUrgency[g.urgency] = g._count.id;

  return {
    period: { from, to },
    overall: {
      totalTickets: agg._count.id,
      totalResolved: slaRow.total_resolved,
      avgFirstResponseMinutes: roundOrNull(agg._avg.timeToFirstResponseMinutes),
      avgResolutionMinutes: roundOrNull(agg._avg.timeToResolutionMinutes),
      slaComplianceRate: overallSlaRate,
      byStatus,
      byUrgency,
    },
    byUser,
  };
}

async function summary(req, res) {
  const dates = parseDates(req, res);
  if (!dates) return;
  const filters = parseFilters(req, res);
  if (filters === null) return;

  const result = await buildSummary(dates.fromDate, dates.toDate, dates.from, dates.to, filters);
  res.json(result);
}

async function drilldown(req, res) {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'id deve ser um número inteiro positivo.' });
  }
  const dates = parseDates(req, res);
  if (!dates) return;
  const { fromDate, toDate } = dates;

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { sector: true } });
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

  const where = { assignedToId: userId, createdAt: { gte: fromDate, lte: toDate } };

  const agg = await prisma.ticket.aggregate({
    where,
    _count: { id: true },
    _avg: { timeToFirstResponseMinutes: true, timeToResolutionMinutes: true },
  });

  const [slaRow] = await prisma.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE "resolvedAt" IS NOT NULL)::int AS total_resolved,
      COUNT(*) FILTER (WHERE "resolvedAt" IS NOT NULL AND "resolvedAt" <= "slaResolutionDeadline")::int AS compliant
    FROM "tickets"
    WHERE "assignedToId" = ${userId}
      AND "createdAt" >= ${fromDate} AND "createdAt" <= ${toDate}
  `;
  const slaComplianceRate =
    slaRow.total_resolved > 0
      ? Math.round((slaRow.compliant / slaRow.total_resolved) * 100) / 100
      : null;

  const statusGroups = await prisma.ticket.groupBy({ by: ['status'], where, _count: { id: true } });
  const byStatus = Object.fromEntries(STATUS_KEYS.map((s) => [s, 0]));
  for (const g of statusGroups) byStatus[g.status] = g._count.id;

  const urgencyGroups = await prisma.ticket.groupBy({ by: ['urgency'], where, _count: { id: true } });
  const byUrgency = Object.fromEntries(URGENCY_KEYS.map((u) => [u, 0]));
  for (const g of urgencyGroups) byUrgency[g.urgency] = g._count.id;

  const tickets = await prisma.ticket.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, title: true, urgency: true, status: true,
      createdAt: true, resolvedAt: true,
      slaResolutionDeadline: true, slaFirstResponseDeadline: true,
    },
  });

  res.json({
    user: { id: user.id, name: user.name, sectorName: user.sector?.name ?? null },
    metrics: {
      totalTickets: agg._count.id,
      avgFirstResponseMinutes: roundOrNull(agg._avg.timeToFirstResponseMinutes),
      avgResolutionMinutes: roundOrNull(agg._avg.timeToResolutionMinutes),
      slaComplianceRate,
      byStatus,
      byUrgency,
    },
    tickets: tickets.map((t) => ({
      id: t.id,
      title: t.title,
      urgency: t.urgency,
      status: t.status,
      createdAt: t.createdAt,
      resolvedAt: t.resolvedAt,
      slaBadge: calculateSlaBadge(t),
    })),
  });
}

async function exportData(req, res) {
  const { format } = req.query;
  if (!format || !['csv', 'pdf'].includes(format)) {
    return res.status(400).json({ error: 'O parâmetro format é obrigatório e deve ser "csv" ou "pdf".' });
  }

  const dates = parseDates(req, res);
  if (!dates) return;
  const filters = parseFilters(req, res);
  if (filters === null) return;

  const summaryData = await buildSummary(dates.fromDate, dates.toDate, dates.from, dates.to, filters);
  const dateStr = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    const csv = generateCsv(summaryData);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="performance-${dateStr}.csv"`);
    return res.send(csv);
  }

  const pdfBuffer = await generatePdf(summaryData);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="performance-${dateStr}.pdf"`);
  res.end(pdfBuffer);
}

async function volume(req, res) {
  const dates = parseDates(req, res);
  if (!dates) return;
  const filters = parseFilters(req, res);
  if (filters === null) return;

  const { fromDate, toDate } = dates;
  const sectorClause = filters.sectorId
    ? Prisma.sql`AND "sectorId" = ${filters.sectorId}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw`
    SELECT
      DATE_TRUNC('day', d.day)::date AS date,
      SUM(d.created)::int            AS created,
      SUM(d.resolved)::int           AS resolved
    FROM (
      SELECT "createdAt" AS day, 1 AS created, 0 AS resolved
      FROM "tickets"
      WHERE "createdAt" >= ${fromDate} AND "createdAt" <= ${toDate}
      ${sectorClause}
      UNION ALL
      SELECT "resolvedAt" AS day, 0 AS created, 1 AS resolved
      FROM "tickets"
      WHERE "resolvedAt" IS NOT NULL
        AND "resolvedAt" >= ${fromDate} AND "resolvedAt" <= ${toDate}
      ${sectorClause}
    ) d
    GROUP BY DATE_TRUNC('day', d.day)
    ORDER BY DATE_TRUNC('day', d.day) ASC
  `;

  res.json(rows.map(r => ({
    date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date),
    created: Number(r.created),
    resolved: Number(r.resolved),
  })));
}

async function byCategory(req, res) {
  const dates = parseDates(req, res);
  if (!dates) return;
  const { fromDate, toDate } = dates;

  const rows = await prisma.ticket.groupBy({
    by: ['categoryId', 'urgency'],
    where: { createdAt: { gte: fromDate, lte: toDate } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  const categoryIds = [...new Set(rows.map(r => r.categoryId))];
  const categories = await prisma.category.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true, name: true },
  });
  const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));

  const grouped = {};
  for (const row of rows) {
    const cid = row.categoryId;
    if (!grouped[cid]) {
      grouped[cid] = {
        categoryId: cid,
        categoryName: catMap[cid] ?? 'Desconhecida',
        total: 0,
        byUrgency: { CRITICO: 0, ALTO: 0, MEDIO: 0, BAIXO: 0 },
      };
    }
    grouped[cid].total += row._count.id;
    grouped[cid].byUrgency[row.urgency] = (grouped[cid].byUrgency[row.urgency] ?? 0) + row._count.id;
  }

  const result = Object.values(grouped).sort((a, b) => b.total - a.total).slice(0, 10);
  res.json(result);
}

module.exports = { summary, drilldown, exportData, volume, byCategory };
