import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ticketsApi } from '@/api/tickets'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/authStore'
import { formatDate, formatTicketId, STATUS_LABELS, STATUS_COLORS, URGENCY_LABELS, URGENCY_COLORS, SLA_BADGE_LABELS, SLA_BADGE_COLORS, cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

const STATUSES = ['ABERTO', 'EM_ANDAMENTO', 'AGUARDANDO', 'RESOLVIDO', 'FECHADO']

const STATUS_BG = {
  ABERTO: 'bg-blue-50 border-blue-200',
  EM_ANDAMENTO: 'bg-purple-50 border-purple-200',
  AGUARDANDO: 'bg-orange-50 border-orange-200',
  RESOLVIDO: 'bg-green-50 border-green-200',
  FECHADO: 'bg-gray-50 border-gray-200',
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
      <h1 className="text-xl font-semibold">Dashboard</h1>

      {/* Cards de status */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {STATUSES.map((status, i) => {
          const q = statusQueries[i]
          return (
            <button
              key={status}
              onClick={() => navigate(`/tickets?status=${status}`)}
              className={cn('border rounded-lg p-4 text-left hover:shadow-sm transition-shadow', STATUS_BG[status])}
            >
              <p className="text-xs font-medium text-gray-500 mb-1">{STATUS_LABELS[status]}</p>
              {q.isLoading
                ? <Skeleton className="h-6 w-12" />
                : <p className="text-2xl font-bold text-gray-800">{q.data?.total ?? '—'}</p>
              }
            </button>
          )
        })}
      </div>

      {/* Painéis inferiores */}
      {(showMyTickets || showSlaAlerts) ? (
        <div className="grid md:grid-cols-2 gap-6">
          {showMyTickets && (
            <div className="bg-white border rounded-lg">
              <div className="px-5 py-3 border-b font-medium text-sm flex items-center justify-between">
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
                  ? <p className="px-5 py-4 text-sm text-gray-400">Nenhum chamado aberto atribuído a você.</p>
                  : (
                    <table className="w-full text-sm">
                      <tbody className="divide-y">
                        {myTickets.map(t => (
                          <tr key={t.id} onClick={() => navigate(`/tickets/${t.id}`)} className="hover:bg-gray-50 cursor-pointer">
                            <td className="px-4 py-2 font-mono text-gray-400 text-xs">{formatTicketId(t.id)}</td>
                            <td className="px-4 py-2 max-w-[160px] truncate font-medium">{t.title}</td>
                            <td className="px-4 py-2">
                              <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium', STATUS_COLORS[t.status])}>
                                {STATUS_LABELS[t.status]}
                              </span>
                            </td>
                            {t.slaBadge && (
                              <td className="px-4 py-2">
                                <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium border', SLA_BADGE_COLORS[t.slaBadge])}>
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
            <div className="bg-white border rounded-lg">
              <div className="px-5 py-3 border-b font-medium text-sm flex items-center justify-between">
                <span>Alertas de SLA crítico</span>
                <button onClick={() => navigate('/tickets')} className="text-xs text-blue-600 hover:underline">
                  Ver todos
                </button>
              </div>
              {loadingSla
                ? <div className="p-4"><Skeleton className="h-40 w-full" /></div>
                : slaAlerts.length === 0
                  ? <p className="px-5 py-4 text-sm text-gray-400">Nenhum chamado com SLA crítico.</p>
                  : (
                    <div className="divide-y">
                      {slaAlerts.map(t => (
                        <div key={t.id} onClick={() => navigate(`/tickets/${t.id}`)} className="px-5 py-3 hover:bg-gray-50 cursor-pointer flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{t.title}</p>
                            <p className="text-xs text-gray-400">{formatTicketId(t.id)} · {formatDate(t.slaResolutionDeadline)}</p>
                          </div>
                          <span className={cn('shrink-0 px-1.5 py-0.5 rounded text-xs font-medium', URGENCY_COLORS[t.urgency])}>
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
        <div className="bg-white border rounded-lg">
          <div className="px-5 py-3 border-b font-medium text-sm">Meus chamados abertos</div>
          {loadingRequester
            ? <div className="p-4"><Skeleton className="h-40 w-full" /></div>
            : requesterTickets.length === 0
              ? <p className="px-5 py-4 text-sm text-gray-400">Nenhum chamado aberto.</p>
              : (
                <table className="w-full text-sm">
                  <tbody className="divide-y">
                    {requesterTickets.map(t => (
                      <tr key={t.id} onClick={() => navigate(`/tickets/${t.id}`)} className="hover:bg-gray-50 cursor-pointer">
                        <td className="px-4 py-2 font-mono text-gray-400 text-xs">{formatTicketId(t.id)}</td>
                        <td className="px-4 py-2 font-medium">{t.title}</td>
                        <td className="px-4 py-2">
                          <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium', STATUS_COLORS[t.status])}>
                            {STATUS_LABELS[t.status]}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium', URGENCY_COLORS[t.urgency])}>
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
