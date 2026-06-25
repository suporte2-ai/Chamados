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
