const PDFDocument = require('pdfkit');

// ─── Cores ────────────────────────────────────────────────────────────────────
const C = {
  navy:        '#1e3a5f',
  blue:        '#2563eb',
  green:       '#16a34a',
  greenLight:  '#dcfce7',
  orange:      '#d97706',
  orangeLight: '#fef3c7',
  red:         '#dc2626',
  redLight:    '#fee2e2',
  purple:      '#7c3aed',
  yellow:      '#f59e0b',
  silver:      '#94a3b8',
  bronze:      '#b45309',
  text:        '#1f2937',
  muted:       '#6b7280',
  border:      '#e5e7eb',
  bg:          '#f3f4f6',
  white:       '#ffffff',
};

const STATUS_COLORS  = { ABERTO:'#3b82f6', EM_ANDAMENTO:'#a855f7', AGUARDANDO:'#f97316', RESOLVIDO:'#22c55e', FECHADO:'#64748b' };
const STATUS_LABELS  = { ABERTO:'Aberto', EM_ANDAMENTO:'Em Andamento', AGUARDANDO:'Aguardando', RESOLVIDO:'Resolvido', FECHADO:'Fechado' };
const URGENCY_COLORS = { CRITICO:'#ef4444', ALTO:'#f97316', MEDIO:'#eab308', BAIXO:'#22c55e' };
const URGENCY_LABELS = { CRITICO:'Crítico', ALTO:'Alto', MEDIO:'Médio', BAIXO:'Baixo' };

// ─── Formatadores ─────────────────────────────────────────────────────────────
function fmtMin(min) {
  if (min == null) return '—';
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}
function fmtRate(rate) { return rate == null ? '—' : `${Math.round(rate * 100)}%`; }
function fmtDate(str) {
  if (!str) return '';
  const [y, m, d] = String(str).split('-');
  return `${d}/${m}/${y}`;
}
function slaAccent(rate) {
  if (rate == null) return { fg: C.muted, bg: C.bg };
  if (rate >= 0.8)  return { fg: C.green,  bg: C.greenLight };
  if (rate >= 0.5)  return { fg: C.orange, bg: C.orangeLight };
  return              { fg: C.red,    bg: C.redLight };
}

// ─── Primitivos ───────────────────────────────────────────────────────────────
const PAGE_W = 595, MARGIN = 40, W = PAGE_W - MARGIN * 2;  // 515

function filled(doc, x, y, w, h, color) {
  doc.save().rect(x, y, w, h).fillColor(color).fill().restore();
}
function stroked(doc, x, y, w, h, color, lw = 0.6) {
  doc.save().rect(x, y, w, h).strokeColor(color).lineWidth(lw).stroke().restore();
}
function hline(doc, x1, x2, y, color = C.border, lw = 0.5) {
  doc.save().moveTo(x1, y).lineTo(x2, y).strokeColor(color).lineWidth(lw).stroke().restore();
}

// ─── Gráficos de barras horizontais ──────────────────────────────────────────
function barChart(doc, title, entries, total, x, y, w) {
  const padH   = 10;
  const rowH   = 22;
  const labelW = 75;
  const countW = 24;
  const pctW   = 20;
  const gap    = 4;
  const barW   = w - 2 * padH - labelW - gap * 3 - countW - pctW;
  const barH   = 10;

  // Cabeçalho da seção
  filled(doc, x, y, w, 26, C.navy);
  doc.fillColor(C.white).font('Helvetica-Bold').fontSize(10)
    .text(title, x + 10, y + 8, { width: w - 80 });
  doc.fillColor('#bfdbfe').font('Helvetica').fontSize(8)
    .text(`Total: ${total}`, x, y + 8, { align: 'right', width: w - 10 });
  y += 34;

  if (entries.length === 0 || total === 0) {
    doc.fillColor(C.muted).font('Helvetica').fontSize(8)
      .text('Sem dados no período', x + padH, y + 4, { width: w - 2 * padH });
    return y + rowH;
  }

  entries.forEach((e, i) => {
    const pct  = Math.round((e.value / total) * 100);
    const midY = y + Math.round((rowH - 9) / 2);

    // Quadrado colorido + label
    doc.save()
      .rect(x + padH, y + Math.round((rowH - 8) / 2), 8, 8)
      .fillColor(e.color).fill().restore();
    doc.fillColor(C.text).font('Helvetica').fontSize(8.5)
      .text(e.label, x + padH + 12, midY, { width: labelW - 12, ellipsis: true });

    // Barra de progresso
    const bx = x + padH + labelW + gap;
    const by = y + Math.round((rowH - barH) / 2);
    filled(doc, bx, by, barW, barH, C.bg);
    doc.save().rect(bx, by, barW, barH).strokeColor(C.border).lineWidth(0.3).stroke().restore();
    if (pct > 0) {
      const fw = Math.max(Math.round((pct / 100) * barW), 2);
      doc.save().rect(bx, by, fw, barH).fillColor(e.color).fill().restore();
    }

    // Contagem
    const cx = bx + barW + gap;
    doc.fillColor(C.text).font('Helvetica-Bold').fontSize(9)
      .text(String(e.value), cx, midY, { width: countW, align: 'right' });

    // Percentual
    doc.fillColor(C.muted).font('Helvetica').fontSize(8)
      .text(`${pct}%`, cx + countW + gap, midY, { width: pctW });

    // Divisor entre linhas (exceto a última)
    if (i < entries.length - 1) {
      hline(doc, x + padH, x + w - padH, y + rowH, C.border, 0.3);
    }

    y += rowH;
  });

  return y + 4;
}

function sideBySideCharts(doc, statusEntries, urgencyEntries, statusTotal, urgencyTotal, y) {
  const chartGap = 13;
  const w        = Math.floor((W - chartGap) / 2);
  const yLeft    = barChart(doc, 'Chamados por Status',   statusEntries,  statusTotal,  MARGIN,                y, w);
  const yRight   = barChart(doc, 'Chamados por Urgência', urgencyEntries, urgencyTotal, MARGIN + w + chartGap, y, w);
  return Math.max(yLeft, yRight) + 4;
}

// Barra de progresso simples
function progressBar(doc, x, y, bw, bh, rate, color) {
  filled(doc, x, y, bw, bh, C.bg);
  if (rate > 0) {
    const fill = Math.max(bw * rate, 3);
    doc.save().rect(x, y, fill, bh).fillColor(color).fill().restore();
  }
  // 80% target dashed line
  const tx = x + bw * 0.8;
  doc.save().moveTo(tx, y - 2).lineTo(tx, y + bh + 2)
    .strokeColor(C.silver).lineWidth(0.8).dash(2, { space: 2 }).stroke()
    .undash().restore();
}

// ─── Header/Footer ────────────────────────────────────────────────────────────
function pageHeader(doc, period, full = true) {
  const bannerH = full ? 68 : 46;
  filled(doc, 0, 0, PAGE_W, bannerH, C.navy);
  filled(doc, 0, bannerH - 4, PAGE_W, 4, C.blue);

  if (full) {
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(20)
      .text('Helpdesk', MARGIN, 14, { width: 180 });
    doc.fillColor('#93c5fd').font('Helvetica').fontSize(9)
      .text('Sistema de Gestão de Chamados', MARGIN, 37, { width: 240 });

    const gen = new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(11)
      .text('RELATÓRIO DE DESEMPENHO', MARGIN, 14, { align:'right', width: W });
    doc.fillColor('#bfdbfe').font('Helvetica').fontSize(8)
      .text(`Período: ${fmtDate(period.from)} a ${fmtDate(period.to)}`, MARGIN, 30, { align:'right', width: W })
      .text(`Gerado em: ${gen}`, MARGIN, 41, { align:'right', width: W });
  } else {
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(12)
      .text('Helpdesk — Relatório de Desempenho', MARGIN, 10, { width: W - 160 });
    doc.fillColor('#bfdbfe').font('Helvetica').fontSize(8)
      .text(`Período: ${fmtDate(period.from)} a ${fmtDate(period.to)}`, MARGIN, 26, { width: W - 160 });
    doc.fillColor('#bfdbfe').font('Helvetica').fontSize(8)
      .text('Desempenho dos Técnicos', MARGIN, 26, { align:'right', width: W });
  }
  return bannerH + 12;
}

function pageFooter(doc, period, pageNum) {
  const fy = 820;
  hline(doc, MARGIN, PAGE_W - MARGIN, fy, C.border);
  doc.fillColor(C.muted).font('Helvetica').fontSize(7)
    .text(`Helpdesk · Período: ${fmtDate(period.from)} a ${fmtDate(period.to)}`, MARGIN, fy + 7, { width: W })
    .text(`Página ${pageNum}`, MARGIN, fy + 7, { align:'right', width: W });
}

function sectionHead(doc, title, y) {
  filled(doc, MARGIN, y, W, 26, C.navy);
  doc.fillColor(C.white).font('Helvetica-Bold').fontSize(10)
    .text(title, MARGIN + 10, y + 8, { width: W - 20 });
  return y + 38;
}

// ─── KPI Cards ────────────────────────────────────────────────────────────────
function kpiCards(doc, overall, y) {
  const slaPct = overall.slaComplianceRate;
  const accent = slaAccent(slaPct);
  const cards = [
    { label:'TOTAL DE CHAMADOS',  value: String(overall.totalTickets ?? '—'), sub:'no período',         color: C.blue   },
    { label:'SLA CUMPRIDO',       value: fmtRate(slaPct),
      sub: slaPct == null ? '—' : slaPct >= 0.8 ? 'Meta atingida ✓' : slaPct >= 0.5 ? 'Abaixo da meta' : 'Crítico',
      color: accent.fg },
    { label:'MÉDIA 1ª RESPOSTA',  value: fmtMin(overall.avgFirstResponseMinutes),  sub:'tempo médio',  color: C.purple },
    { label:'MÉDIA DE RESOLUÇÃO', value: fmtMin(overall.avgResolutionMinutes),      sub:'tempo médio',  color: C.orange },
  ];
  const cw = (W - 9) / 4;
  cards.forEach((c, i) => {
    const cx = MARGIN + i * (cw + 3);
    filled(doc, cx, y, cw, 74, '#f8fafc');
    filled(doc, cx, y, 4, 74, c.color);
    stroked(doc, cx, y, cw, 74, C.border);
    doc.fillColor(C.muted).font('Helvetica-Bold').fontSize(6.5)
      .text(c.label, cx + 10, y + 10, { width: cw - 16 });
    doc.fillColor(c.color).font('Helvetica-Bold').fontSize(20)
      .text(c.value, cx + 10, y + 24, { width: cw - 16 });
    doc.fillColor(C.muted).font('Helvetica').fontSize(7)
      .text(c.sub, cx + 10, y + 57, { width: cw - 16 });
  });
  return y + 86;
}


// ─── Card por usuário ─────────────────────────────────────────────────────────
function userCard(doc, x, y, cw, user, rank) {
  const ch = 112;
  const { fg: accentFg, bg: accentBg } = slaAccent(user.slaComplianceRate);
  const podium = [C.yellow, C.silver, C.bronze];

  // Borda e fundo
  filled(doc, x, y, cw, ch, C.white);
  stroked(doc, x, y, cw, ch, C.border);
  // Faixa topo colorida por SLA
  filled(doc, x, y, cw, 5, accentFg);

  // Medalha de ranking (círculo)
  const mx = x + 18, my = y + 24;
  doc.save().circle(mx, my, 12)
    .fillColor(rank <= 3 ? podium[rank - 1] : C.bg).fill().restore();
  doc.fillColor(rank <= 3 ? C.white : C.muted)
    .font('Helvetica-Bold').fontSize(rank <= 3 ? 9 : 8)
    .text(String(rank), mx - 8, my - 7, { width: 16, align: 'center' });

  // Nome
  const name = user.userName.length > 23 ? user.userName.slice(0, 22) + '…' : user.userName;
  doc.fillColor(C.text).font('Helvetica-Bold').fontSize(10)
    .text(name, x + 36, y + 12, { width: cw - 36 - 48 });

  // Setor
  doc.fillColor(C.muted).font('Helvetica').fontSize(7.5)
    .text(user.sectorName || '—', x + 36, y + 25, { width: cw - 36 - 48 });

  // Chamados (destaque, canto direito)
  doc.fillColor(accentFg).font('Helvetica-Bold').fontSize(22)
    .text(String(user.totalTickets), x + cw - 50, y + 10, { width: 44, align: 'center' });
  doc.fillColor(C.muted).font('Helvetica').fontSize(6.5)
    .text('chamados', x + cw - 50, y + 35, { width: 44, align: 'center' });

  // Linha divisória
  hline(doc, x + 8, x + cw - 8, y + 47, C.border);

  // 1ª Resposta
  doc.fillColor(C.muted).font('Helvetica').fontSize(6.5)
    .text('1ª RESPOSTA', x + 8, y + 54, { width: 80 });
  doc.fillColor(C.text).font('Helvetica-Bold').fontSize(9)
    .text(fmtMin(user.avgFirstResponseMinutes), x + 8, y + 63, { width: 80 });

  // Resolução
  doc.fillColor(C.muted).font('Helvetica').fontSize(6.5)
    .text('RESOLUÇÃO', x + cw / 2 - 16, y + 54, { width: 80 });
  doc.fillColor(C.text).font('Helvetica-Bold').fontSize(9)
    .text(fmtMin(user.avgResolutionMinutes), x + cw / 2 - 16, y + 63, { width: 80 });

  // SLA — barra + badge
  const barX = x + 8, barY = y + 85, barW = cw - 16, barH = 7;
  const slaRate = user.slaComplianceRate ?? 0;
  const slaPct  = Math.round(slaRate * 100);

  doc.fillColor(C.muted).font('Helvetica').fontSize(6.5)
    .text('SLA:', barX, y + 76, { width: 20 });
  // Badge colorido
  filled(doc, barX + 24, y + 73, 36, 13, accentBg);
  stroked(doc, barX + 24, y + 73, 36, 13, accentFg, 0.7);
  doc.fillColor(accentFg).font('Helvetica-Bold').fontSize(8.5)
    .text(user.slaComplianceRate != null ? `${slaPct}%` : '—', barX + 24, y + 76, { width: 36, align: 'center' });

  progressBar(doc, barX, barY, barW, barH, slaRate, accentFg);

  // Aviso se SLA nulo
  if (user.slaComplianceRate == null) {
    doc.fillColor(C.muted).font('Helvetica').fontSize(6.5)
      .text('Sem chamados resolvidos', barX, barY + barH + 2, { width: barW });
  }

  return ch;
}

// ─── Gerador principal ────────────────────────────────────────────────────────
async function generatePdf(summary) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0,
      info: { Title: 'Relatório de Desempenho', Author: 'Helpdesk' } });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const { period, overall, byUser } = summary;

    // ══════════════════════════════
    // PÁGINA 1 — Resumo Executivo
    // ══════════════════════════════
    let y = pageHeader(doc, period, true);

    // KPI cards
    y = kpiCards(doc, overall, y);

    // Gráficos de rosca: Status e Urgência lado a lado
    const statusEntries = Object.entries(overall.byStatus || {})
      .map(([k, v]) => ({ label: STATUS_LABELS[k] || k, value: v, color: STATUS_COLORS[k] || '#999' }))
      .filter(e => e.value > 0);
    const urgencyEntries = Object.entries(overall.byUrgency || {})
      .map(([k, v]) => ({ label: URGENCY_LABELS[k] || k, value: v, color: URGENCY_COLORS[k] || '#999' }))
      .filter(e => e.value > 0);
    const totalStatus  = statusEntries.reduce((s, e) => s + e.value, 0);
    const totalUrgency = urgencyEntries.reduce((s, e) => s + e.value, 0);
    y = sideBySideCharts(doc, statusEntries, urgencyEntries, totalStatus, totalUrgency, y);
    y += 4;

    // Visão geral da equipe
    if (byUser.length > 0) {
      y = sectionHead(doc, 'Visão Geral da Equipe', y);
      const totalResolved = (overall.byStatus?.RESOLVIDO ?? 0) + (overall.byStatus?.FECHADO ?? 0);
      const avgSla = byUser.filter(u => u.slaComplianceRate != null);
      const teamSla = avgSla.length > 0
        ? avgSla.reduce((s, u) => s + u.slaComplianceRate, 0) / avgSla.length : null;

      const boxes = [
        { label: 'Técnicos ativos',           value: String(byUser.length),                  color: C.blue   },
        { label: 'Chamados resolvidos',        value: String(totalResolved),                   color: C.green  },
        { label: 'SLA médio da equipe',        value: fmtRate(teamSla),                        color: slaAccent(teamSla).fg },
        { label: 'Técnico com mais chamados',  value: byUser[0]?.userName?.split(' ')[0] || '—', color: C.purple },
      ];
      const bw = (W - 9) / 4;
      boxes.forEach((b, i) => {
        const bx = MARGIN + i * (bw + 3);
        filled(doc, bx, y, bw, 52, '#f8fafc');
        filled(doc, bx, y, bw, 3, b.color);
        stroked(doc, bx, y, bw, 52, C.border);
        doc.fillColor(C.muted).font('Helvetica').fontSize(6.5)
          .text(b.label, bx + 8, y + 10, { width: bw - 14 });
        doc.fillColor(b.color).font('Helvetica-Bold').fontSize(15)
          .text(b.value, bx + 8, y + 23, { width: bw - 14 });
      });
      y += 64;
    }

    pageFooter(doc, period, 1);

    // ══════════════════════════════
    // PÁGINA 2+ — Técnicos
    // ══════════════════════════════
    if (byUser.length > 0) {
      doc.addPage({ size: 'A4', margin: 0 });
      y = pageHeader(doc, period, false);
      let pageNum = 2;

      y = sectionHead(doc, `Desempenho Individual dos Técnicos (${byUser.length} técnico${byUser.length !== 1 ? 's' : ''})`, y);

      // Cards em 2 colunas
      const cols = 2;
      const gap  = 8;
      const cw   = (W - gap) / cols;

      byUser.forEach((u, i) => {
        const col = i % cols;
        const cx  = MARGIN + col * (cw + gap);

        // Verificar se precisa de nova página
        if (y + 112 > 808) {
          pageFooter(doc, period, pageNum);
          pageNum++;
          doc.addPage({ size: 'A4', margin: 0 });
          y = pageHeader(doc, period, false);
          y = sectionHead(doc, `Desempenho Individual dos Técnicos (continuação)`, y);
        }

        userCard(doc, cx, y, cw, u, i + 1);

        // Avança Y a cada 2 cards (nova linha)
        if (col === cols - 1 || i === byUser.length - 1) {
          y += 112 + gap;
        }
      });

      // Tabela resumo ao final
      if (y + 140 > 808) {
        pageFooter(doc, period, pageNum);
        pageNum++;
        doc.addPage({ size: 'A4', margin: 0 });
        y = pageHeader(doc, period, false);
      }
      y += 4;
      y = sectionHead(doc, 'Tabela Comparativa', y);

      // Cabeçalho da tabela
      const tcols = [
        { h: '#',            x: MARGIN,      w: 22  },
        { h: 'Técnico',      x: MARGIN + 24, w: 130 },
        { h: 'Setor',        x: MARGIN + 156,w: 82  },
        { h: 'Chamados',     x: MARGIN + 240,w: 60  },
        { h: '1ª Resposta',  x: MARGIN + 302,w: 65  },
        { h: 'Resolução',    x: MARGIN + 369,w: 65  },
        { h: 'SLA',          x: MARGIN + 436,w: 55  },
        { h: 'Perf.',        x: MARGIN + 493,w: 22  },
      ];

      filled(doc, MARGIN, y, W, 18, '#e8edf2');
      tcols.forEach(c => {
        doc.fillColor(C.muted).font('Helvetica-Bold').fontSize(7)
          .text(c.h, c.x + 3, y + 5, { width: c.w - 4 });
      });
      hline(doc, MARGIN, MARGIN + W, y + 18, C.navy, 1);
      y += 18;

      const rowH = 19;
      byUser.forEach((u, i) => {
        if (y + rowH > 808) {
          pageFooter(doc, period, pageNum);
          pageNum++;
          doc.addPage({ size: 'A4', margin: 0 });
          y = pageHeader(doc, period, false);
          filled(doc, MARGIN, y, W, 18, '#e8edf2');
          tcols.forEach(c => {
            doc.fillColor(C.muted).font('Helvetica-Bold').fontSize(7)
              .text(c.h, c.x + 3, y + 5, { width: c.w - 4 });
          });
          hline(doc, MARGIN, MARGIN + W, y + 18, C.navy, 1);
          y += 18;
        }

        filled(doc, MARGIN, y, W, rowH, i % 2 === 0 ? C.white : '#f9fafb');
        const { fg: sfg } = slaAccent(u.slaComplianceRate);
        const podium = [C.yellow, C.silver, C.bronze];

        // Rank
        doc.fillColor(i < 3 ? podium[i] : C.muted).font('Helvetica-Bold').fontSize(7.5)
          .text(String(i + 1), tcols[0].x + 3, y + 6, { width: tcols[0].w - 4, align: 'center' });
        // Nome
        doc.fillColor(C.text).font('Helvetica').fontSize(8)
          .text(u.userName, tcols[1].x + 3, y + 5, { width: tcols[1].w - 6, ellipsis: true });
        // Setor
        doc.fillColor(C.muted).font('Helvetica').fontSize(7.5)
          .text(u.sectorName || '—', tcols[2].x + 3, y + 5, { width: tcols[2].w - 6, ellipsis: true });
        // Chamados
        doc.fillColor(C.text).font('Helvetica-Bold').fontSize(8.5)
          .text(String(u.totalTickets), tcols[3].x + 3, y + 5, { width: tcols[3].w - 4, align: 'center' });
        // 1ª Resposta
        doc.fillColor(C.text).font('Helvetica').fontSize(8)
          .text(fmtMin(u.avgFirstResponseMinutes), tcols[4].x + 3, y + 5, { width: tcols[4].w - 4, align: 'center' });
        // Resolução
        doc.text(fmtMin(u.avgResolutionMinutes), tcols[5].x + 3, y + 5, { width: tcols[5].w - 4, align: 'center' });
        // SLA badge
        filled(doc, tcols[6].x + 3, y + 3, tcols[6].w - 6, 13, slaAccent(u.slaComplianceRate).bg);
        doc.fillColor(sfg).font('Helvetica-Bold').fontSize(8)
          .text(fmtRate(u.slaComplianceRate), tcols[6].x + 3, y + 5, { width: tcols[6].w - 6, align: 'center' });
        // Mini barra SLA
        const mbX = tcols[7].x + 2, mbY = y + 5, mbW = tcols[7].w - 4, mbH = 9;
        filled(doc, mbX, mbY, mbW, mbH, C.bg);
        if (u.slaComplianceRate != null) {
          filled(doc, mbX, mbY, Math.max(mbW * u.slaComplianceRate, 1), mbH, sfg);
        }

        hline(doc, MARGIN, MARGIN + W, y + rowH, C.border, 0.3);
        y += rowH;
      });

      pageFooter(doc, period, pageNum);
    }

    doc.end();
  });
}

module.exports = { generatePdf };
