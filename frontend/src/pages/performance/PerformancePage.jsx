import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, CartesianGrid,
} from 'recharts'
import { performanceApi } from '@/api/performance'
import { sectorsApi } from '@/api/sectors'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, STATUS_LABELS, URGENCY_LABELS } from '@/lib/utils'

function formatMinutes(min) {
  if (min == null) return '—'
  if (min < 60) return `${min}min`
  return `${Math.floor(min / 60)}h ${min % 60}min`
}

function getPreset(label) {
  const to = new Date()
  const from = new Date()
  if (label === '7d') from.setDate(to.getDate() - 7)
  if (label === '30d') from.setDate(to.getDate() - 30)
  if (label === '90d') from.setDate(to.getDate() - 90)
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

const STATUS_COLORS_CHART = {
  ABERTO: '#3b82f6', EM_ANDAMENTO: '#a855f7', AGUARDANDO: '#f97316',
  RESOLVIDO: '#22c55e', FECHADO: '#64748b',
}
const URGENCY_COLORS_CHART = {
  CRITICO: '#ef4444', ALTO: '#f97316', MEDIO: '#eab308', BAIXO: '#22c55e',
}

function useTooltipStyle() {
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === 'dark'
  return {
    contentStyle: {
      backgroundColor: dark ? 'hsl(222,47%,12%)' : '#fff',
      border: `1px solid ${dark ? 'hsl(222,47%,18%)' : '#e2e8f0'}`,
      borderRadius: '8px', fontSize: '12px',
      color: dark ? 'rgb(248,250,252)' : 'rgb(15,23,42)',
    },
    labelStyle: { color: dark ? 'rgb(148,163,184)' : 'rgb(100,116,139)', fontWeight: 500 },
  }
}

function MetricDonut({ data, tooltipStyle }) {
  const hasData = data.some(d => d.value > 0)
  if (!hasData) return null
  return (
    <PieChart width={96} height={96}>
      <Pie
        data={data} cx={47} cy={47}
        innerRadius={30} outerRadius={44}
        dataKey="value" startAngle={90} endAngle={-270}
        strokeWidth={2} stroke="transparent"
      >
        {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
      </Pie>
      <Tooltip
        contentStyle={{ ...tooltipStyle.contentStyle, fontSize: '11px', padding: '6px 10px' }}
        labelStyle={tooltipStyle.labelStyle}
        formatter={(value, name) => [value, name]}
      />
    </PieChart>
  )
}

function MetricCard({ title, value, subtitle, chartData, accentColor, loading, tooltipStyle }) {
  if (loading) return <Skeleton className="h-32 rounded-xl" />
  return (
    <div
      className="bg-card border border-border border-l-4 rounded-xl p-5 flex items-center justify-between gap-4 min-h-[8rem]"
      style={{ borderLeftColor: accentColor }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
        <p className="text-3xl font-bold text-foreground mt-1 leading-none">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-1.5">{subtitle}</p>}
      </div>
      {chartData && <MetricDonut data={chartData} tooltipStyle={tooltipStyle} />}
    </div>
  )
}

export default function PerformancePage() {
  const [period, setPeriod] = useState(() => getPreset('30d'))
  const [sectorId, setSectorId] = useState('')
  const [drillUser, setDrillUser] = useState(null)
  const tooltipStyle = useTooltipStyle()

  const { data: sectors = [] } = useQuery({ queryKey: ['sectors'], queryFn: sectorsApi.list })

  const params = { from: period.from, to: period.to, ...(sectorId ? { sectorId } : {}) }

  const { data: summary, isLoading } = useQuery({
    queryKey: ['performance-summary', params],
    queryFn: () => performanceApi.summary(params.from, params.to),
  })

  const { data: volumeData = [] } = useQuery({
    queryKey: ['performance-volume', params],
    queryFn: () => performanceApi.volume(params.from, params.to),
  })

  const { data: drillData, isLoading: loadingDrill } = useQuery({
    queryKey: ['performance-drill', drillUser, period],
    queryFn: () => performanceApi.drilldown(drillUser, { from: period.from, to: period.to }),
    enabled: !!drillUser,
  })

  const handleDownload = async (format) => {
    try { await performanceApi.download(format, params) }
    catch { toast.error('Erro ao exportar.') }
  }

  // Donut: status distribution
  const statusDonut = summary?.overall?.byStatus
    ? Object.entries(summary.overall.byStatus)
        .map(([k, v]) => ({ name: STATUS_LABELS[k] ?? k, value: v, color: STATUS_COLORS_CHART[k] }))
        .filter(d => d.value > 0)
    : []

  // Donut: SLA compliance
  const slaRate = summary?.overall?.slaComplianceRate
  const slaPct = slaRate != null ? Math.round(slaRate * 100) : null
  const slaDonut = slaPct != null
    ? [{ name: 'No prazo', value: slaPct, color: '#22c55e' }, { name: 'Atrasado', value: 100 - slaPct, color: '#ef4444' }]
    : []

  // Urgency donut
  const urgencyDonut = summary?.overall?.byUrgency
    ? Object.entries(summary.overall.byUrgency)
        .map(([k, v]) => ({ name: URGENCY_LABELS[k] ?? k, value: v, color: URGENCY_COLORS_CHART[k] }))
        .filter(d => d.value > 0)
    : []

  // Top agents horizontal bar data (reversed so highest is at top)
  const topAgents = [...(summary?.byUser || [])]
    .slice(0, 10)
    .map(u => ({ name: u.userName.split(' ')[0], chamados: u.totalTickets }))
    .reverse()

  // Volume data formatted for AreaChart
  const volumeFormatted = volumeData.map(d => ({
    ...d,
    date: d.date.slice(5), // MM-DD
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-foreground">Painel de Desempenho</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleDownload('csv')}>CSV</Button>
          <Button variant="outline" size="sm" onClick={() => handleDownload('pdf')}>PDF</Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div className="flex gap-2">
          {['7d', '30d', '90d'].map(p => (
            <Button key={p} size="sm"
              variant={period.from === getPreset(p).from ? 'default' : 'outline'}
              onClick={() => setPeriod(getPreset(p))}>
              {p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : '90 dias'}
            </Button>
          ))}
        </div>
        <input type="date" value={period.from}
          onChange={e => setPeriod(v => ({ ...v, from: e.target.value }))}
          className="border border-border rounded-md px-3 py-1.5 text-sm bg-background text-foreground" />
        <input type="date" value={period.to}
          onChange={e => setPeriod(v => ({ ...v, to: e.target.value }))}
          className="border border-border rounded-md px-3 py-1.5 text-sm bg-background text-foreground" />
        <select value={sectorId} onChange={e => setSectorId(e.target.value)}
          className="border border-border rounded-md px-3 py-1.5 text-sm bg-background text-foreground">
          <option value="">Todos os setores</option>
          {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard loading={isLoading} title="Total de chamados"
          value={summary?.overall?.totalTickets ?? '—'}
          subtitle="no período"
          accentColor="#6366f1"
          chartData={statusDonut}
          tooltipStyle={tooltipStyle} />
        <MetricCard loading={isLoading} title="SLA dentro do prazo"
          value={slaPct != null ? `${slaPct}%` : '—'}
          subtitle={slaPct != null ? `${Math.round((slaRate * (summary?.overall?.totalTickets ?? 0)))} resolvidos no prazo` : undefined}
          accentColor="#22c55e"
          chartData={slaDonut}
          tooltipStyle={tooltipStyle} />
        <MetricCard loading={isLoading} title="Média 1ª resposta"
          value={formatMinutes(summary?.overall?.avgFirstResponseMinutes)}
          accentColor="#f97316" />
        <MetricCard loading={isLoading} title="Média de resolução"
          value={formatMinutes(summary?.overall?.avgResolutionMinutes)}
          accentColor="#a855f7" />
      </div>

      {/* Volume por dia */}
      {(isLoading || volumeFormatted.length > 0) && (
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="font-semibold text-sm text-foreground mb-4">Volume por dia</p>
          {isLoading
            ? <Skeleton className="h-48 w-full" />
            : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={volumeFormatted} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                  <defs>
                    <linearGradient id="gradCreated" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradResolved" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(222,47%,18%)" strokeOpacity={0.5} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip {...tooltipStyle} />
                  <Area type="monotone" dataKey="created" name="Criados" stroke="#6366f1" strokeWidth={2} fill="url(#gradCreated)" dot={false} />
                  <Area type="monotone" dataKey="resolved" name="Resolvidos" stroke="#22c55e" strokeWidth={2} fill="url(#gradResolved)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )
          }
        </div>
      )}

      {/* Rankings row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Ranking por técnico */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <p className="font-semibold text-sm text-foreground mb-4">Ranking por técnico (TOP 10)</p>
          {isLoading
            ? <Skeleton className="h-64 w-full" />
            : topAgents.length === 0
              ? <p className="text-sm text-muted-foreground py-8 text-center">Sem dados no período.</p>
              : (
                <ResponsiveContainer width="100%" height={Math.max(topAgents.length * 32, 120)}>
                  <BarChart layout="vertical" data={topAgents} margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="chamados" name="Chamados" fill="#818cf8" radius={[0, 4, 4, 0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              )
          }
        </div>

        {/* Distribuição por urgência */}
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="font-semibold text-sm text-foreground mb-4">Distribuição por urgência</p>
          {isLoading
            ? <Skeleton className="h-64 w-full" />
            : urgencyDonut.length === 0
              ? <p className="text-sm text-muted-foreground py-8 text-center">Sem dados no período.</p>
              : (
                <div className="flex flex-col items-center gap-4">
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={urgencyDonut} cx="50%" cy="50%" innerRadius={48} outerRadius={72}
                        dataKey="value" startAngle={90} endAngle={-270} strokeWidth={0}>
                        {urgencyDonut.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip {...tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 w-full">
                    {urgencyDonut.slice().reverse().map(d => (
                      <div key={d.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                          <span className="text-muted-foreground">{d.name}</span>
                        </div>
                        <span className="font-semibold text-foreground">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
          }
        </div>
      </div>

      {/* Tabela por técnico */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b bg-muted/40 font-semibold text-sm text-foreground">
          Detalhes por técnico
        </div>
        {isLoading
          ? <div className="p-4"><Skeleton className="h-40 w-full" /></div>
          : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {['Técnico', 'Setor', 'Chamados', 'Média 1ª resp.', 'Média resolução', 'SLA'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(summary?.byUser || []).map(u => (
                  <tr key={u.userId} onClick={() => setDrillUser(u.userId)}
                    className="hover:bg-muted/40 cursor-pointer transition-colors">
                    <td className="px-4 py-2.5 font-medium text-foreground">{u.userName}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{u.sectorName || '—'}</td>
                    <td className="px-4 py-2.5 text-foreground">{u.totalTickets}</td>
                    <td className="px-4 py-2.5 text-foreground">{formatMinutes(u.avgFirstResponseMinutes)}</td>
                    <td className="px-4 py-2.5 text-foreground">{formatMinutes(u.avgResolutionMinutes)}</td>
                    <td className="px-4 py-2.5">
                      {u.slaComplianceRate != null ? (
                        <span className={cn('font-semibold', u.slaComplianceRate >= 0.8 ? 'text-green-500' : u.slaComplianceRate >= 0.5 ? 'text-yellow-500' : 'text-red-500')}>
                          {(u.slaComplianceRate * 100).toFixed(0)}%
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
                {(summary?.byUser || []).length === 0 && (
                  <tr><td colSpan="6" className="px-4 py-8 text-center text-muted-foreground">Sem dados no período.</td></tr>
                )}
              </tbody>
            </table>
          )
        }
      </div>

      {/* Drilldown modal */}
      {drillUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <span className="font-semibold text-foreground">{drillData?.user?.name ?? 'Carregando...'}</span>
              <button onClick={() => setDrillUser(null)} className="text-muted-foreground hover:text-foreground text-xl leading-none">&times;</button>
            </div>
            {loadingDrill
              ? <div className="p-6"><Skeleton className="h-40 w-full" /></div>
              : drillData && (
                <div className="p-6 space-y-5">
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'Chamados', value: drillData.metrics.totalTickets },
                      { label: 'Média 1ª resp.', value: formatMinutes(drillData.metrics.avgFirstResponseMinutes) },
                      { label: 'Média resolução', value: formatMinutes(drillData.metrics.avgResolutionMinutes) },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-muted/40 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="font-bold text-lg text-foreground">{value}</p>
                      </div>
                    ))}
                  </div>
                  <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Título</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">SLA</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {drillData.tickets.map(t => (
                        <tr key={t.id}>
                          <td className="px-3 py-2 font-medium text-foreground">{t.title}</td>
                          <td className="px-3 py-2 text-muted-foreground">{STATUS_LABELS[t.status] ?? t.status}</td>
                          <td className="px-3 py-2 text-foreground">{t.slaBadge || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </div>
        </div>
      )}
    </div>
  )
}
