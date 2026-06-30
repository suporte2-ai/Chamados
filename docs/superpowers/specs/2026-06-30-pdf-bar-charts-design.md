# Relatório PDF — Substituição dos Donuts por Barras Horizontais

**Data:** 2026-06-30
**Status:** Aprovado

## 1. Problema

O relatório de desempenho gerado em PDF (`backend/src/lib/pdfExport.js`) exibe dois gráficos de rosca (donut) empilhados verticalmente na página 1 — um para Status e outro para Urgência. Isso causa:

- Grande espaço em branco no final da página 1 (~200px inutilizados)
- Layout confuso com dois blocos altos e repetitivos
- Legendas com mini barras de progresso minúsculas e difíceis de ler
- Fatias pequenas (6%, 8%) sem rótulo, criando inconsistência visual

## 2. Solução

Substituir as duas roscas por **gráficos de barras horizontais lado a lado**, cada um ocupando metade da largura da página.

## 3. Stack e Convenções

Inalteradas das fases anteriores:
- **Backend:** Node.js + PDFKit, arquivo `backend/src/lib/pdfExport.js`
- Sem novas dependências
- Primitivos existentes (`filled`, `stroked`, `hline`) são reutilizados

## 4. Layout da Página 1

```
┌─────────────────────────────────────────────────────────────────┐
│  Header navy (Helpdesk · Relatório de Desempenho · período)     │
├─────────────────────────────────────────────────────────────────┤
│  KPI Card (total) │ KPI Card (SLA) │ KPI Card (1ª resp) │ KPI  │
├──────────────────────────────┬──────────────────────────────────┤
│  Chamados por Status         │  Chamados por Urgência           │
│  (barra por categoria)       │  (barra por categoria)           │
├──────────────────────────────┴──────────────────────────────────┤
│  Visão Geral da Equipe (4 mini cards)                           │
├─────────────────────────────────────────────────────────────────┤
│  Footer                                                         │
└─────────────────────────────────────────────────────────────────┘
```

Páginas 2 e 3 (cards individuais dos técnicos e tabela comparativa) permanecem intactas.

## 5. Anatomia do Gráfico de Barras

Cada seção ocupa metade da largura disponível (~251px com gap de 13px entre elas).

### Cabeçalho da seção
- Fundo navy, mesma altura e estilo dos cabeçalhos atuais (26px)
- Título à esquerda, "Total: N" à direita em azul claro

### Linha por categoria
```
[■ Label       ] [████████░░░░░░░░░] [N ] [XX%]
  75px            100px               25px  26px
```

- **Quadrado colorido** (8×8px) + label na cor da categoria
- **Barra proporcional**: fundo `C.bg`, preenchimento com a cor da categoria, altura 10px
- **Contagem** em negrito (fonte Helvetica-Bold, 9pt)
- **Percentual** em cinza (fonte Helvetica, 8pt, muted)
- Altura da linha: 22px

### Dimensões
- Largura de cada gráfico: `(W - 13) / 2` ≈ 251px
- Altura da seção: `cabeçalho (26px) + padding top (10px) + N_linhas × 22px + padding bottom (10px)`
- Status: 5 linhas → altura total = 156px
- Urgência: 4 linhas → altura total = 134px
- Ambas as seções renderizam com a altura do mais alto (156px) para alinhamento visual

## 6. Mudanças no Código

### Função removida
- `donutChart(doc, title, entries, total, y)` — removida completamente

### Funções adicionadas
- `barChart(doc, title, entries, total, x, y, w)` — renderiza um gráfico de barras horizontais na posição `(x, y)` com largura `w`
- `sideBySideCharts(doc, statusEntries, urgencyEntries, statusTotal, urgencyTotal, y)` — chama `barChart` duas vezes lado a lado e retorna o novo `y`

### Chamada no gerador principal
Substituir as duas chamadas a `donutChart` por uma chamada a `sideBySideCharts`.

```js
// Antes:
y = donutChart(doc, 'Chamados por Status',   statusEntries,  totalStatus,  y);
y = donutChart(doc, 'Chamados por Urgência', urgencyEntries, totalUrgency, y);

// Depois:
y = sideBySideCharts(doc, statusEntries, urgencyEntries, totalStatus, totalUrgency, y);
```

## 7. Cores

Reutilizar as constantes já definidas no topo do arquivo:
- `STATUS_COLORS`: mesmas cores por status
- `URGENCY_COLORS`: mesmas cores por urgência
- `C.bg`, `C.text`, `C.muted`, `C.navy`, `C.white`, `C.border`: mesmas constantes

## 8. Casos de Borda

| Cenário | Comportamento |
|---|---|
| Sem chamados (total = 0) | Seção exibe apenas cabeçalho + mensagem "Sem dados no período" |
| Categoria com valor 0 | Linha omitida (filter já aplicado antes de chamar a função) |
| Label longo (> 75px) | Truncado com ellipsis pelo PDFKit (`{ width, ellipsis: true }`) |

## 9. Critério de Aceite

- PDF gerado com dois gráficos de barras lado a lado na página 1
- Todas as categorias com valor > 0 aparecem com barra, contagem e percentual
- Nenhum elemento sobrepõe outro
- Páginas 2 e 3 inalteradas
- Arquivo `pdfExport.js` sem referências à função `donutChart`
