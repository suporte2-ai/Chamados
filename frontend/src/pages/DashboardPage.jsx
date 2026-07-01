import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Clock, Calendar, MapPin, ChevronRight } from 'lucide-react'
import { ticketsApi } from '@/api/tickets'
import { eventsApi } from '@/api/events'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/authStore'
import {
  formatDate, formatTicketId, timeAgo,
  STATUS_LABELS, STATUS_COLORS,
  URGENCY_LABELS, URGENCY_COLORS,
  SLA_BADGE_LABELS, SLA_BADGE_COLORS,
  cn,
} from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import TrendChart from '@/components/dashboard/TrendChart'
import SlaGoalWidget from '@/components/dashboard/SlaGoalWidget'
import CategoryHeatmap from '@/components/dashboard/CategoryHeatmap'

const RSVP_DOT = {
  CONFIRMADO: 'bg-emerald-500',
  RECUSADO:   'bg-slate-400',
  PENDENTE:   'bg-amber-400',
}

function AgendaWidget({ events, navigate }) {
  if (events.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl px-5 py-8 text-center text-sm text-muted-foreground">
        Nenhum evento próximo na agenda.
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
      {events.map(e => {
        const start = new Date(e.startAt)
        const day   = start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
        const time  = start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        const rsvp  = e.myRsvp ?? 'PENDENTE'
        return (
          <div
            key={e.id}
            onClick={() => navigate('/agenda')}
            className="px-5 py-3 hover:bg-muted/40 cursor-pointer flex items-center gap-4 transition-colors"
          >
            <div className="text-center shrink-0 w-12">
              <p className="text-xs font-semibold text-foreground leading-tight">{day.split(' ')[0]}</p>
              <p className="text-[10px] text-muted-foreground uppercase">{day.split(' ').slice(1).join(' ')}</p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm truncate text-foreground">{e.title}</p>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3 shrink-0" />
                <span>{time}</span>
                {e.location && (
                  <>
                    <MapPin className="h-3 w-3 shrink-0 ml-1" />
                    <span className="truncate">{e.location}</span>
                  </>
                )}
              </div>
            </div>
            <span className={cn('w-2 h-2 rounded-full shrink-0', RSVP_DOT[rsvp])} title={rsvp} />
          </div>
        )
      })}
    </div>
  )
}

const STATUSES = ['ABERTO', 'EM_ANDAMENTO', 'AGUARDANDO', 'RESOLVIDO', 'FECHADO']

const STATUS_BORDER = {
  ABERTO:       'border-l-blue-500',
  EM_ANDAMENTO: 'border-l-purple-500',
  AGUARDANDO:   'border-l-orange-500',
  RESOLVIDO:    'border-l-green-500',
  FECHADO:      'border-l-slate-400',
}

const URGENCY_BORDER = {
  CRITICO: 'border-l-red-500',
  ALTO:    'border-l-orange-500',
  MEDIO:   'border-l-yellow-400',
  BAIXO:   'border-l-blue-400',
}

function TicketCard({ ticket, navigate, showSla }) {
  return (
    <div
      onClick={() => navigate(`/tickets/${ticket.id}`)}
      className={cn(
        'group bg-card border border-border border-l-4 rounded-xl p-4 cursor-pointer',
        'hover:shadow-lg hover:-translate-y-0.5 transition-all duration-150 space-y-2.5',
        URGENCY_BORDER[ticket.urgency]
      )}
    >
      {/* Topo: ID + status */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-muted-foreground tracking-wide">
          {formatTicketId(ticket.id)}
        </span>
        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[ticket.status])}>
          {STATUS_LABELS[ticket.status]}
        </span>
      </div>

      {/* Título */}
      <p className="font-semibold text-sm text-foreground leading-snug line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
        {ticket.title}
      </p>

      {/* Rodapé: urgência + SLA + tempo */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60">
        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', URGENCY_COLORS[ticket.urgency])}>
          {URGENCY_LABELS[ticket.urgency]}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {showSla && ticket.slaBadge && (
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium border', SLA_BADGE_COLORS[ticket.slaBadge])}>
              SLA {SLA_BADGE_LABELS[ticket.slaBadge]}
            </span>
          )}
          <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {timeAgo(ticket.createdAt)}
          </span>
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ title, action, onAction }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="font-semibold text-sm text-foreground">{title}</h2>
      {action && (
        <button onClick={onAction} className="text-xs text-blue-600 hover:underline">
          {action}
        </button>
      )}
    </div>
  )
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

  const now = new Date()
  const agendaFrom = now.toISOString().slice(0, 10)
  const agendaTo   = new Date(now.getFullYear(), now.getMonth() + 1, 31).toISOString().slice(0, 10)

  const { data: agendaEvents = [], isLoading: loadingAgenda } = useQuery({
    queryKey: ['dashboard-agenda', agendaFrom],
    queryFn: () => eventsApi.list({ from: agendaFrom, to: agendaTo }),
    staleTime: 1000 * 60 * 5,
  })

  const upcomingEvents = agendaEvents
    .filter(e => new Date(e.startAt) >= now)
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt))
    .slice(0, 5)

  const myTickets = (myTicketsData?.items || [])
    .filter(t => t.status !== 'FECHADO')
    .slice(0, 12)

  const slaAlerts = (slaData?.items || [])
    .filter(t => t.slaBadge === 'vermelho' && t.status !== 'FECHADO')
    .slice(0, 6)

  const requesterTickets = (requesterData?.items || [])
    .filter(t => t.status !== 'FECHADO')
    .slice(0, 12)

  return (
    <div className="space-y-8">
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

      {/* Widget de agenda */}
      <section>
        <SectionHeader
          title={
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-primary" />
              Próximos eventos da agenda
            </span>
          }
          action="Ver agenda"
          onAction={() => navigate('/agenda')}
        />
        {loadingAgenda ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : (
          <AgendaWidget events={upcomingEvents} navigate={navigate} />
        )}
      </section>

      {/* Analytics */}
      <section>
        <SectionHeader title="Análise de chamados" action="Ver relatório completo" onAction={() => navigate('/performance')} />
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
          <TrendChart />
          <SlaGoalWidget />
        </div>
      </section>

      <section>
        <CategoryHeatmap />
      </section>

      {/* Meus chamados — cards */}
      {showMyTickets && (
        <section>
          <SectionHeader
            title="Meus chamados abertos"
            action="Ver todos"
            onAction={() => navigate(`/tickets?assignedToId=${user?.id}`)}
          />
          {loadingMy ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
            </div>
          ) : myTickets.length === 0 ? (
            <div className="bg-card border border-border rounded-xl px-5 py-10 text-center text-sm text-muted-foreground">
              Nenhum chamado aberto atribuído a você.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {myTickets.map(t => (
                <TicketCard key={t.id} ticket={t} navigate={navigate} showSla={showSlaAlerts} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Alertas de SLA crítico — lista compacta */}
      {showSlaAlerts && (
        <section>
          <SectionHeader
            title={
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Alertas de SLA crítico
              </span>
            }
            action="Ver todos"
            onAction={() => navigate('/tickets')}
          />
          {loadingSla ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}
            </div>
          ) : slaAlerts.length === 0 ? (
            <div className="bg-card border border-border rounded-xl px-5 py-6 text-center text-sm text-muted-foreground">
              Nenhum chamado com SLA crítico.
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
              {slaAlerts.map(t => (
                <div
                  key={t.id}
                  onClick={() => navigate(`/tickets/${t.id}`)}
                  className="px-5 py-3 hover:bg-muted/40 cursor-pointer flex items-center gap-4 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate text-foreground">{t.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatTicketId(t.id)} · prazo {formatDate(t.slaResolutionDeadline)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium', URGENCY_COLORS[t.urgency])}>
                      {URGENCY_LABELS[t.urgency]}
                    </span>
                    <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium border', SLA_BADGE_COLORS[t.slaBadge])}>
                      {SLA_BADGE_LABELS[t.slaBadge]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Visão solicitante — cards */}
      {!showMyTickets && !showSlaAlerts && (
        <section>
          <SectionHeader
            title="Meus chamados abertos"
            action="Ver todos"
            onAction={() => navigate('/tickets')}
          />
          {loadingRequester ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
            </div>
          ) : requesterTickets.length === 0 ? (
            <div className="bg-card border border-border rounded-xl px-5 py-10 text-center text-sm text-muted-foreground">
              Nenhum chamado aberto.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {requesterTickets.map(t => (
                <TicketCard key={t.id} ticket={t} navigate={navigate} showSla={false} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
