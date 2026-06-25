function fmt(val) {
  return val === null || val === undefined ? 'N/A' : String(val);
}

function fmtRate(rate) {
  return rate === null || rate === undefined ? 'N/A' : Math.round(rate * 100) + '%';
}

function generateCsv(summary) {
  const { period, overall, byUser } = summary;
  const lines = [];

  lines.push('De,Até');
  lines.push(`${period.from},${period.to}`);
  lines.push('');

  lines.push('Total de chamados,Média 1ª resposta (min),Média resolução (min),SLA cumprido');
  lines.push(
    `${overall.totalTickets},${fmt(overall.avgFirstResponseMinutes)},${fmt(overall.avgResolutionMinutes)},${fmtRate(overall.slaComplianceRate)}`
  );
  lines.push('');

  lines.push('Técnico,Setor,Chamados,Média 1ª resposta (min),Média resolução (min),SLA cumprido');
  for (const u of byUser) {
    lines.push(
      `${u.userName},${u.sectorName},${u.totalTickets},${fmt(u.avgFirstResponseMinutes)},${fmt(u.avgResolutionMinutes)},${fmtRate(u.slaComplianceRate)}`
    );
  }

  return lines.join('\n');
}

module.exports = { generateCsv };
