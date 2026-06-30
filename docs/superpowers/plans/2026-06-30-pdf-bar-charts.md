# PDF Bar Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir os dois gráficos de rosca (donut) empilhados na página 1 do relatório PDF por dois gráficos de barras horizontais lado a lado.

**Architecture:** Uma função `barChart()` renderiza barras horizontais numa posição X/Y/largura arbitrária. Uma função `sideBySideCharts()` chama `barChart` duas vezes — Status à esquerda, Urgência à direita — dividindo a largura disponível ao meio. As funções `drawSector`, `drawDonut` e `donutChart` são removidas por completo.

**Tech Stack:** Node.js, PDFKit (`pdfkit`), Jest (testes existentes em `backend/tests/`)

## Global Constraints

- Sem novas dependências — apenas PDFKit já instalado
- Cores definidas em `C` e `STATUS_COLORS` / `URGENCY_COLORS` no topo de `pdfExport.js` — não duplicar
- Primitivos `filled`, `stroked`, `hline` já existentes — reutilizar
- Constantes `PAGE_W = 595`, `MARGIN = 40`, `W = 515` já definidas — não redefinir
- Páginas 2 e 3 do PDF (`userCard`, `kpiCards`, tabela comparativa) não devem ser alteradas
- Comando de teste: `cd backend && npm test -- tests/pdf-export-lib.test.js`

---

### Task 1: Substituir donut charts por bar charts no PDF

**Files:**
- Modify: `backend/src/lib/pdfExport.js`
- Modify: `backend/tests/pdf-export-lib.test.js`

**Interfaces:**
- Produz: `barChart(doc, title, entries, total, x, y, w) → newY` e `sideBySideCharts(doc, statusEntries, urgencyEntries, statusTotal, urgencyTotal, y) → newY`
- Remove: `drawSector`, `drawDonut`, `donutChart`

---

- [ ] **Step 1: Adicionar caso de teste com byStatus e byUrgency**

Em `backend/tests/pdf-export-lib.test.js`, adicionar ao final do arquivo:

```js
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
```

- [ ] **Step 2: Rodar os testes — devem passar (baseline com código atual)**

```
cd backend && npm test -- tests/pdf-export-lib.test.js
```

Esperado: 3 testes passando (os 2 existentes + o novo).

- [ ] **Step 3: Remover as funções de donut e adicionar barChart + sideBySideCharts**

Em `backend/src/lib/pdfExport.js`:

**3a. Remover o bloco de rosca (linhas 63–208)** — apagar tudo desde o comentário `// ─── Gráfico de rosca / pizza` até o final da função `donutChart` (fechamento `}`). Isso remove `drawSector`, `drawDonut` e `donutChart`.

**3b. No lugar dessas funções (após a linha `}` que fecha `hline`, linha 61), inserir:**

```js
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
```

**3c. Na função `generatePdf` (por volta da linha 400), substituir as duas chamadas a `donutChart`:**

```js
// Remover:
y = donutChart(doc, 'Chamados por Status',   statusEntries,  totalStatus,  y);
y = donutChart(doc, 'Chamados por Urgência', urgencyEntries, totalUrgency, y);

// Substituir por:
y = sideBySideCharts(doc, statusEntries, urgencyEntries, totalStatus, totalUrgency, y);
```

- [ ] **Step 4: Rodar os testes novamente**

```
cd backend && npm test -- tests/pdf-export-lib.test.js
```

Esperado: 3 testes passando. Se algum falhar, verificar se `barChart` ou `sideBySideCharts` têm erro de sintaxe, e se `donutChart` foi completamente removida.

- [ ] **Step 5: Verificação visual**

Iniciar o backend e gerar um PDF pelo painel de desempenho:

```
cd backend && npm run dev
```

Acessar o frontend → Painel de Desempenho → botão PDF → abrir o arquivo baixado.

Checar na página 1:
- Dois gráficos de barras lado a lado (Status à esquerda, Urgência à direita)
- Cada linha mostra: quadrado colorido, label, barra proporcional, contagem, percentual
- Nenhum elemento sobrepõe outro
- Sem espaço branco excessivo entre os gráficos e a seção "Visão Geral da Equipe"

Checar páginas 2 e 3: inalteradas (cards de técnicos e tabela comparativa).

- [ ] **Step 6: Commit**

```
git add backend/src/lib/pdfExport.js backend/tests/pdf-export-lib.test.js
git commit -m "feat: replace donut charts with side-by-side bar charts in PDF report"
```
