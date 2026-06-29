import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { performanceApi } from '@/api/performance'
import { sectorsApi } from '@/api/sectors'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

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
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

export default function PerformancePage() {
  const [period, setPeriod] = useState(() => getPreset('30d'))
  const [sectorId, setSectorId] = useState('')
  const [drillUser, setDrillUser] = useState(null)

  const { data: sectors = [] } = useQuery({
    queryKey: ['sectors'],
    queryFn: sectorsApi.list,
  })

  const params = { from: period.from, to: period.to, ...(sectorId ? { sectorId } : {}) }

  const { data: summary, isLoading } = useQuery({
    queryKey: ['performance-summary', params],
    queryFn: () => performanceApi.summary(params),
  })

  const { data: volumeData = [] } = useQuery({
    queryKey: ['performance-volume', params],
    queryFn: () => performanceApi.volume(params),
  })

  const { data: drillData, isLoading: loadingDrill } = useQuery({
    queryKey: ['performance-drill', drillUser, period],
    queryFn: () => performanceApi.drilldown(drillUser, { from: period.from, to: period.to }),
    enabled: !!drillUser,
  })

  const handleDownload = async (format) => {
    try {
      await performanceApi.download(format, params)
    } catch {
      toast.error('Erro ao exportar.')
    }
  }

  return (
    <div className="space-y-6">
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
            <Button
              key={p}
              size="sm"
              variant={period.from === getPreset(p).from ? 'default' : 'outline'}
              onClick={() => setPeriod(getPreset(p))}
            >
              {p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : '90 dias'}
            </Button>
          ))}
        </div>
        <input type="date" value={period.from} onChange={e => setPeriod(v => ({ ...v, from: e.target.value }))}
          className="border border-border rounded-md px-3 py-1.5 text-sm bg-background text-foreground" />
        <input type="date" value={period.to} onChange={e => setPeriod(v => ({ ...v, to: e.target.value }))}
          className="border border-border rounded-md px-3 py-1.5 text-sm bg-background text-foreground" />
        <select value={sectorId} onChange={e => setSectorId(e.target.value)}
          className="border border-border rounded-md px-3 py-1.5 text-sm bg-background text-foreground">
          <option value="">Todos os setores</option>
          {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* Cards gerais */}
      {isLoading
        ? <div className="grid grid-cols-3 gap-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: 'Total de chamados', value: summary?.overall?.totalTickets ?? '—' },
              { label: 'Média 1ª resposta', value: formatMinutes(summary?.overall?.avgFirstResponseMinutes) },
              { label: 'Média resolução', value: formatMinutes(summary?.overall?.avgResolutionMinutes) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-card border border-border rounded-xl p-5">
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                <p className="text-2xl font-bold text-foreground">{value}</p>
              </div>
            ))}
          </div>
        )
      }

      {/* Gráfico de volume */}
      {volumeData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="font-medium text-sm mb-4 text-foreground">Volume por dia</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={volumeData}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="created" name="Criados" fill="#6366f1" radius={[2,2,0,0]} />
              <Bar dataKey="resolved" name="Resolvidos" fill="#22c55e" radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabela por técnico */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b bg-muted/40 font-medium text-sm text-foreground">Por técnico</div>
        {isLoading
          ? <div className="p-4"><Skeleton className="h-40 w-full" /></div>
          : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  {['Nome', 'Setor', 'Chamados', 'Média 1ª resp.', 'Média resolução', 'Taxa SLA'].map(h => (
                    <th key={h} className="px-4 py-2 text-left font-medium text-muted-foreground text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(summary?.byUser || []).map(u => (
                  <tr key={u.userId} onClick={() => setDrillUser(u.userId)} className="hover:bg-muted/40 cursor-pointer transition-colors">
                    <td className="px-4 py-2 font-medium text-foreground">{u.userName}</td>
                    <td className="px-4 py-2 text-muted-foreground">{u.sectorName || '—'}</td>
                    <td className="px-4 py-2 text-foreground">{u.totalTickets}</td>
                    <td className="px-4 py-2 text-foreground">{formatMinutes(u.avgFirstResponseMinutes)}</td>
                    <td className="px-4 py-2 text-foreground">{formatMinutes(u.avgResolutionMinutes)}</td>
                    <td className="px-4 py-2 text-foreground">{u.slaComplianceRate != null ? `${(u.slaComplianceRate * 100).toFixed(0)}%` : '—'}</td>
                  </tr>
                ))}
                {(summary?.byUser || []).length === 0 && (
                  <tr><td colSpan="6" className="px-4 py-6 text-center text-muted-foreground">Sem dados no período.</td></tr>
                )}
              </tbody>
            </table>
          )
        }
      </div>

      {/* Drilldown modal */}
      {drillUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto m-4">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <span className="font-semibold text-foreground">{drillData?.user?.name ?? 'Carregando...'}</span>
              <button onClick={() => setDrillUser(null)} className="text-muted-foreground hover:text-foreground text-xl leading-none">&times;</button>
            </div>
            {loadingDrill
              ? <div className="p-6"><Skeleton className="h-40 w-full" /></div>
              : drillData && (
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div><p className="text-xs text-muted-foreground">Chamados</p><p className="font-bold text-lg text-foreground">{drillData.metrics.totalTickets}</p></div>
                    <div><p className="text-xs text-muted-foreground">Média 1ª resp.</p><p className="font-bold text-lg text-foreground">{formatMinutes(drillData.metrics.avgFirstResponseMinutes)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Média resolução</p><p className="font-bold text-lg text-foreground">{formatMinutes(drillData.metrics.avgResolutionMinutes)}</p></div>
                  </div>
                  <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
                    <thead className="bg-muted/50"><tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Título</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">SLA</th>
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {drillData.tickets.map(t => (
                        <tr key={t.id}>
                          <td className="px-3 py-2 font-medium text-foreground">{t.title}</td>
                          <td className="px-3 py-2 text-muted-foreground">{t.status}</td>
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
