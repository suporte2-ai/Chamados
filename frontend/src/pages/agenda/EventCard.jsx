import { cn } from '@/lib/utils'

const SCOPE_LABELS = { EMPRESA: 'Empresa', SETOR: 'Setor', USUARIO: 'Individual' }
const SCOPE_COLORS = {
  EMPRESA:  'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  SETOR:    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  USUARIO:  'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
}
const RSVP_COLORS = {
  PENDENTE:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  CONFIRMADO: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  RECUSADO:   'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}
const RSVP_LABELS = { PENDENTE: 'Pendente', CONFIRMADO: 'Confirmado', RECUSADO: 'Recusado' }

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function EventCard({ event, onClick }) {
  return (
    <div
      onClick={onClick}
      className="border border-border rounded-lg p-4 bg-card hover:bg-muted/30 cursor-pointer transition-colors space-y-2"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-foreground text-sm">{event.title}</span>
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium shrink-0', SCOPE_COLORS[event.scope])}>
          {SCOPE_LABELS[event.scope]}
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{formatTime(event.startAt)} – {formatTime(event.endAt)}</span>
        {event.location && <span>· {event.location}</span>}
      </div>
      <div className="flex items-center gap-2">
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', RSVP_COLORS[event.myRsvp ?? 'PENDENTE'])}>
          {RSVP_LABELS[event.myRsvp ?? 'PENDENTE']}
        </span>
        <span className="text-xs text-muted-foreground">{event.attendeeCount} participante{event.attendeeCount !== 1 ? 's' : ''}</span>
      </div>
    </div>
  )
}
