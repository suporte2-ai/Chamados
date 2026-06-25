const PDFDocument = require('pdfkit');

function fmt(val) {
  return val === null || val === undefined ? 'N/A' : String(val);
}

function fmtRate(rate) {
  return rate === null || rate === undefined ? 'N/A' : Math.round(rate * 100) + '%';
}

async function generatePdf(summary) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const { period, overall, byUser } = summary;

    doc.fontSize(16).text('Relatório de Desempenho da Equipe', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Período: ${period.from} a ${period.to}`);
    doc.moveDown();

    doc.fontSize(13).text('Métricas Gerais');
    doc.fontSize(10);
    doc.text(`Total de chamados: ${overall.totalTickets}`);
    doc.text(`Média 1ª resposta: ${fmt(overall.avgFirstResponseMinutes)} min`);
    doc.text(`Média resolução: ${fmt(overall.avgResolutionMinutes)} min`);
    doc.text(`SLA cumprido: ${fmtRate(overall.slaComplianceRate)}`);
    doc.moveDown();

    if (byUser.length > 0) {
      doc.fontSize(13).text('Por Técnico');
      doc.fontSize(10);
      for (const u of byUser) {
        doc.text(
          `${u.userName} (${u.sectorName}) — ${u.totalTickets} chamados | ` +
          `1ª resp: ${fmt(u.avgFirstResponseMinutes)} min | ` +
          `Resolução: ${fmt(u.avgResolutionMinutes)} min | ` +
          `SLA: ${fmtRate(u.slaComplianceRate)}`
        );
      }
    }

    doc.end();
  });
}

module.exports = { generatePdf };
