// frontend/src/components/dashboard/CategoryHeatmap.jsx
import { useQuery } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { performanceApi } from '@/api/performance'
import { Skeleton } from '@/components/ui/skeleton'

function getLast30Days() {
  const to = new Date()
  const from = new Date()
  from.setDate(to.getDate() - 29)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
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
  }
}

const URGENCY_COLORS = {
  CRITICO: '#ef4444',
  ALTO:    '#f97316',
  MEDIO:   '#eab308',
  BAIXO:   '#22c55e',
}
const URGENCY_LABELS = { CRITICO: 'Crítico', ALTO: 'Alto', MEDIO: 'Médio', BAIXO: 'Baixo' }

export default function CategoryHeatmap() {
  const { from, to } = getLast30Days()
  const tooltipStyle = useTooltipStyle()

  const { data = [], isLoading } = useQuery({
    queryKey: ['perf-by-category', from, to],
    queryFn: () => performanceApi.byCategory(from, to),
    staleTime: 1000 * 60 * 5,
  })

  if (isLoading) return <Skeleton className="h-48 w-full rounded-xl" />
  if (data.length === 0) return null

  const chartData = data.slice(0, 8).map(d => ({
    name: d.categoryName.length > 14 ? d.categoryName.slice(0, 12) + '…' : d.categoryName,
    fullName: d.categoryName,
    ...d.byUrgency,
  }))

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Chamados por categoria — últimos 30 dias</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
          <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={90} />
          <Tooltip
            {...tooltipStyle}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const item = chartData.find(d => d.name === label)
              return (
                <div style={tooltipStyle.contentStyle} className="rounded-lg p-2 shadow text-xs space-y-1">
                  <p className="font-semibold mb-1">{item?.fullName ?? label}</p>
                  {payload.map(p => (
                    <div key={p.dataKey} className="flex items-center gap-2">
                      <span style={{ color: p.fill }} className="font-bold">{URGENCY_LABELS[p.dataKey]}:</span>
                      <span>{p.value}</span>
                    </div>
                  ))}
                </div>
              )
            }}
          />
          {Object.entries(URGENCY_COLORS).map(([key, color]) => (
            <Bar key={key} dataKey={key} stackId="a" fill={color} radius={key === 'BAIXO' ? [0, 2, 2, 0] : [0, 0, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap items-center gap-3 mt-2">
        {Object.entries(URGENCY_LABELS).map(([key, label]) => (
          <span key={key} className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: URGENCY_COLORS[key] }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
