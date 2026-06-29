import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ticketsApi } from '@/api/tickets'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/authStore'
import { formatDate, formatTicketId, STATUS_LABELS, STATUS_COLORS, URGENCY_LABELS, URGENCY_COLORS, SLA_BADGE_LABELS, SLA_BADGE_COLORS, cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

const STATUSES = ['ABERTO', 'EM_ANDAMENTO', 'AGUARDANDO', 'RESOLVIDO', 'FECHADO']

const STATUS_BORDER = {
  ABERTO:       'border-l-blue-500',
  EM_ANDAMENTO: 'border-l-purple-500',
  AGUARDANDO:   'border-l-orange-500',
  RESOLVIDO:    'border-l-green-500',
  FECHADO:      'border-l-slate-400',
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user, fieldVisible } = useAuth()
  const permissions = useAuthStore((s) => s.permissions)
  const showMyTickets = fieldVisible('assigned_to')
  const showSlaAlerts = fieldVisible('sla_badge')

  const statusQueries = STATUSES.map(status =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuery({
      queryKey: ['dashboard-count', status],
      queryFn: () => ticketsApi.list({ status, pageSize: 1 }),
    })
  )

  const { data: myTicketsData, isLoading: loadingMy } = useQuery({
    queryKey: ['dashboard-my-tickets', user?.id],
    queryFn: () => ticketsApi.list({
      assignedToId: user?.id,
      pageSize: 50,
      sortBy: 'slaFirstResponseDeadline',
      sortOrder: 'asc',
    }),
    enabled: showMyTickets && !!user,
  })

  const { data: slaData, isLoading: loadingSla } = useQuery({
    queryKey: ['dashboard-sla-alerts'],
    queryFn: () => ticketsApi.list({
      pageSize: 50,
      sortBy: 'slaResolutionDeadline',
      sortOrder: 'asc',
    }),
    enabled: showSlaAlerts,
  })

  const { data: requesterData, isLoading: loadingRequester } = useQuery({
    queryKey: ['dashboard-requester'],
    queryFn: () => ticketsApi.list({ pageSize: 10 }),
    enabled: !showMyTickets && !showSlaAlerts,
  })

  const myTickets = (myTicketsData?.items || [])
    .filter(t => t.status !== 'FECHADO')
    .slice(0, 10)

  const slaAlerts = (slaData?.items || [])
    .filter(t => t.slaBadge === 'vermelho' && t.status !== 'FECHADO')
    .slice(0, 5)

  const requesterTickets = (requesterData?.items || [])
    .filter(t => t.status !== 'FECHADO')

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>

      {/* Cards de status */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {STATUSES.map((status, i) => {
          const q = statusQueries[i]
          return (
            <button
              key={status}
              onClick={() => navigate(`/tickets?status=${status}`)}
              className={cn(
                'bg-card border border-border border-l-4 rounded-xl p-5 text-left hover:shadow-md transition-shadow',
                STATUS_BORDER[status]
              )}
            >
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                {STATUS_LABELS[status]}
              </p>
              {q.isLoading
                ? <Skeleton className="h-8 w-16" />
                : <p className="text-3xl font-bold text-foreground">{q.data?.total ?? '—'}</p>
              }
              <p className="text-xs text-muted-foreground mt-1">chamados</p>
            </button>
          )
        })}
      </div>

      {/* Painéis inferiores */}
      {(showMyTickets || showSlaAlerts) ? (
        <div className="grid md:grid-cols-2 gap-6">
          {showMyTickets && (
            <div className="bg-card border border-border rounded-xl">
              <div className="px-5 py-3 border-b bg-muted/40 font-medium text-sm flex items-center justify-between">
                <span>Meus chamados abertos</span>
                <button
                  onClick={() => navigate(`/tickets?assignedToId=${user?.id}`)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Ver todos
                </button>
              </div>
              {loadingMy
                ? <div className="p-4"><Skeleton className="h-40 w-full" /></div>
                : myTickets.length === 0
                  ? <p className="px-5 py-4 text-sm text-muted-foreground">Nenhum chamado aberto atribuído a você.</p>
                  : (
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-border">
                        {myTickets.map(t => (
                          <tr key={t.id} onClick={() => navigate(`/tickets/${t.id}`)} className="hover:bg-muted/40 cursor-pointer transition-colors">
                            <td className="px-4 py-2 font-mono text-muted-foreground text-xs">{formatTicketId(t.id)}</td>
                            <td className="px-4 py-2 max-w-[160px] truncate font-medium text-foreground">{t.title}</td>
                            <td className="px-4 py-2">
                              <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[t.status])}>
                                {STATUS_LABELS[t.status]}
                              </span>
                            </td>
                            {t.slaBadge && (
                              <td className="px-4 py-2">
                                <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium border', SLA_BADGE_COLORS[t.slaBadge])}>
                                  {SLA_BADGE_LABELS[t.slaBadge]}
                                </span>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
              }
            </div>
          )}

          {showSlaAlerts && (
            <div className="bg-card border border-border rounded-xl">
              <div className="px-5 py-3 border-b bg-muted/40 font-medium text-sm flex items-center justify-between">
                <span>Alertas de SLA crítico</span>
                <button onClick={() => navigate('/tickets')} className="text-xs text-blue-600 hover:underline">
                  Ver todos
                </button>
              </div>
              {loadingSla
                ? <div className="p-4"><Skeleton className="h-40 w-full" /></div>
                : slaAlerts.length === 0
                  ? <p className="px-5 py-4 text-sm text-muted-foreground">Nenhum chamado com SLA crítico.</p>
                  : (
                    <div className="divide-y divide-border">
                      {slaAlerts.map(t => (
                        <div key={t.id} onClick={() => navigate(`/tickets/${t.id}`)} className="px-5 py-3 hover:bg-muted/40 cursor-pointer flex items-center justify-between gap-2 transition-colors">
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate text-foreground">{t.title}</p>
                            <p className="text-xs text-muted-foreground">{formatTicketId(t.id)} · {formatDate(t.slaResolutionDeadline)}</p>
                          </div>
                          <span className={cn('shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium', URGENCY_COLORS[t.urgency])}>
                            {URGENCY_LABELS[t.urgency]}
                          </span>
                        </div>
                      ))}
                    </div>
                  )
              }
            </div>
          )}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl">
          <div className="px-5 py-3 border-b bg-muted/40 font-medium text-sm">Meus chamados abertos</div>
          {loadingRequester
            ? <div className="p-4"><Skeleton className="h-40 w-full" /></div>
            : requesterTickets.length === 0
              ? <p className="px-5 py-4 text-sm text-muted-foreground">Nenhum chamado aberto.</p>
              : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-border">
                    {requesterTickets.map(t => (
                      <tr key={t.id} onClick={() => navigate(`/tickets/${t.id}`)} className="hover:bg-muted/40 cursor-pointer transition-colors">
                        <td className="px-4 py-2 font-mono text-muted-foreground text-xs">{formatTicketId(t.id)}</td>
                        <td className="px-4 py-2 font-medium text-foreground">{t.title}</td>
                        <td className="px-4 py-2">
                          <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[t.status])}>
                            {STATUS_LABELS[t.status]}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium', URGENCY_COLORS[t.urgency])}>
                            {URGENCY_LABELS[t.urgency]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
          }
        </div>
      )}
    </div>
  )
}
