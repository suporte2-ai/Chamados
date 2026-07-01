// frontend/src/components/dashboard/SlaGoalWidget.jsx
import { useQuery } from '@tanstack/react-query'
import { performanceApi } from '@/api/performance'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const SLA_GOAL = 90 // % meta padrão

function getCurrentMonth() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const to   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  return { from, to }
}

export default function SlaGoalWidget() {
  const { from, to } = getCurrentMonth()

  const { data, isLoading } = useQuery({
    queryKey: ['perf-summary-sla', from, to],
    queryFn: () => performanceApi.summary(from, to),
    staleTime: 1000 * 60 * 5,
  })

  if (isLoading) return <Skeleton className="h-28 w-full rounded-xl" />

  const rate = data?.overall?.slaComplianceRate
  const pct  = rate != null ? Math.round(rate * 100) : null
  const met  = pct != null && pct >= SLA_GOAL

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Meta de SLA — mês atual</h3>
        <span className={cn(
          'text-xs font-bold px-2 py-0.5 rounded-full',
          pct == null ? 'text-muted-foreground bg-muted' :
          met ? 'text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/40' :
                'text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/40'
        )}>
          {pct != null ? `${pct}%` : 'Sem dados'}
        </span>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Conformidade SLA</span>
          <span>Meta: {SLA_GOAL}%</span>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              pct == null ? 'w-0' :
              met ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-400' : 'bg-red-500'
            )}
            style={{ width: pct != null ? `${Math.min(100, pct)}%` : '0%' }}
          />
        </div>
        {pct != null && (
          <p className="text-xs text-muted-foreground">
            {met
              ? `✓ Meta atingida (+${pct - SLA_GOAL}pp acima)`
              : `⚠ ${SLA_GOAL - pct}pp abaixo da meta`}
          </p>
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
        <span><span className="font-medium text-foreground">{data?.overall?.totalTickets ?? 0}</span> chamados no período</span>
      </div>
    </div>
  )
}
