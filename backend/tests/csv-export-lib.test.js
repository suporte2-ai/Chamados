const { generateCsv } = require('../src/lib/csvExport');

const baseSummary = {
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

test('generates CSV with correct structure and headers', () => {
  const csv = generateCsv(baseSummary);
  const lines = csv.split('\n');

  expect(lines[0]).toBe('De,Até');
  expect(lines[1]).toBe('2026-06-01,2026-06-25');
  expect(lines[2]).toBe('');
  expect(lines[3]).toBe('Total de chamados,Média 1ª resposta (min),Média resolução (min),SLA cumprido');
  expect(lines[4]).toBe('10,30,120,80%');
  expect(lines[5]).toBe('');
  expect(lines[6]).toBe('Técnico,Setor,Chamados,Média 1ª resposta (min),Média resolução (min),SLA cumprido');
  expect(lines[7]).toBe('Ana Lima,TI,10,30,120,80%');
});

test('formats null values as N/A', () => {
  const summary = {
    ...baseSummary,
    overall: {
      totalTickets: 5,
      avgFirstResponseMinutes: null,
      avgResolutionMinutes: null,
      slaComplianceRate: null,
    },
    byUser: [
      { ...baseSummary.byUser[0], avgFirstResponseMinutes: null, avgResolutionMinutes: null, slaComplianceRate: null },
    ],
  };

  const csv = generateCsv(summary);
  const lines = csv.split('\n');

  expect(lines[4]).toBe('5,N/A,N/A,N/A');
  expect(lines[7]).toContain('N/A,N/A,N/A');
});

test('handles empty byUser list', () => {
  const summary = { ...baseSummary, byUser: [] };
  const csv = generateCsv(summary);
  const lines = csv.split('\n');

  expect(lines[6]).toBe('Técnico,Setor,Chamados,Média 1ª resposta (min),Média resolução (min),SLA cumprido');
  expect(lines[7]).toBeUndefined();
});
