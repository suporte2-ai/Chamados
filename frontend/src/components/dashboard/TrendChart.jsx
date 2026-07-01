import { useQuery } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { performanceApi } from '@/api/performance'
import { Skeleton } from '@/components/ui/skeleton'

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
  }
}

function getLast30Days() {
  const to = new Date()
  const from = new Date()
  from.setDate(to.getDate() - 29)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export default function TrendChart() {
  const { from, to } = getLast30Days()
  const tooltipStyle = useTooltipStyle()

  const { data = [], isLoading } = useQuery({
    queryKey: ['perf-volume', from, to],
    queryFn: () => performanceApi.volume(from, to),
    staleTime: 1000 * 60 * 5,
  })

  if (isLoading) return <Skeleton className="h-48 w-full rounded-xl" />

  const chartData = data.map(d => ({
    date: formatDate(d.date),
    'Abertos': d.created,
    'Resolvidos': d.resolved,
  }))

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Volume de chamados — últimos 30 dias</h3>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorAbertos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorResolvidos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
            interval={Math.floor(chartData.length / 6)} className="text-muted-foreground" />
          <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} className="text-muted-foreground" />
          <Tooltip {...tooltipStyle} />
          <Area type="monotone" dataKey="Abertos" stroke="#3b82f6" strokeWidth={2} fill="url(#colorAbertos)" dot={false} />
          <Area type="monotone" dataKey="Resolvidos" stroke="#22c55e" strokeWidth={2} fill="url(#colorResolvidos)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-4 mt-3">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="w-3 h-0.5 bg-blue-500 inline-block rounded" /> Abertos
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="w-3 h-0.5 bg-green-500 inline-block rounded" /> Resolvidos
        </span>
      </div>
    </div>
  )
}
