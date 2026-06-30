const { generatePdf } = require('../src/lib/pdfExport');

const summary = {
  period: { from: '2026-06-01', to: '2026-06-25' },
  overall: {
    totalTickets: 10,
    avgFirstResponseMinutes: 30,
    avgResolutionMinutes: 120,
    slaComplianceRate: 0.8,
  },
  byUser: [
    {
      userId: 1,
      userName: 'Ana Lima',
      sectorName: 'TI',
      totalTickets: 10,
      avgFirstResponseMinutes: 30,
      avgResolutionMinutes: 120,
      slaComplianceRate: 0.8,
    },
  ],
};

test('generates a non-empty PDF buffer with correct magic bytes', async () => {
  const buffer = await generatePdf(summary);
  expect(Buffer.isBuffer(buffer)).toBe(true);
  expect(buffer.length).toBeGreaterThan(100);
  expect(buffer.slice(0, 4).toString()).toBe('%PDF');
});

test('handles null values without throwing', async () => {
  const nullSummary = {
    ...summary,
    overall: { totalTickets: 0, avgFirstResponseMinutes: null, avgResolutionMinutes: null, slaComplianceRate: null },
    byUser: [],
  };
  await expect(generatePdf(nullSummary)).resolves.toBeInstanceOf(Buffer);
});

test('renders bar charts when byStatus and byUrgency are provided', async () => {
  const richSummary = {
    period: { from: '2026-06-01', to: '2026-06-25' },
    overall: {
      totalTickets: 10,
      avgFirstResponseMinutes: 30,
      avgResolutionMinutes: 120,
      slaComplianceRate: 0.8,
      byStatus:  { ABERTO: 3, EM_ANDAMENTO: 2, RESOLVIDO: 5 },
      byUrgency: { CRITICO: 1, ALTO: 2, MEDIO: 3, BAIXO: 4 },
    },
    byUser: [],
  };
  const buffer = await generatePdf(richSummary);
  expect(Buffer.isBuffer(buffer)).toBe(true);
  expect(buffer.slice(0, 4).toString()).toBe('%PDF');
});
