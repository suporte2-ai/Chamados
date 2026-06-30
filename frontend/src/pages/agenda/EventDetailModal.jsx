import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { X, MapPin, Clock, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { eventsApi } from '@/api/events'
import { useAuthStore } from '@/stores/authStore'

const RSVP_COLORS = {
  PENDENTE:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  CONFIRMADO: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  RECUSADO:   'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}
const RSVP_LABELS = { PENDENTE: 'Pendente', CONFIRMADO: 'Confirmado', RECUSADO: 'Recusado' }
const SCOPE_LABELS = { EMPRESA: 'Toda a empresa', SETOR: 'Setor', USUARIO: 'Usuários específicos' }

function formatDateTime(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
    + ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function EventDetailModal({ event, onClose }) {
  const qc = useQueryClient()
  const permissions = useAuthStore(s => s.permissions)

  const rsvpMutation = useMutation({
    mutationFn: (rsvp) => eventsApi.rsvp(event.id, rsvp),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] })
      toast.success('Presença atualizada!')
      onClose()
    },
    onError: () => toast.error('Erro ao atualizar presença'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => eventsApi.delete(event.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] })
      toast.success('Evento cancelado.')
      onClose()
    },
    onError: () => toast.error('Erro ao cancelar evento'),
  })

  const canManage = permissions.has('manage_events')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-semibold text-foreground text-base leading-tight">{event.title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0" />
            <span>{formatDateTime(event.startAt)} – {new Date(event.endAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          {event.location && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0" />
              <span>{event.location}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4 shrink-0" />
            <span>{SCOPE_LABELS[event.scope]} · {event.attendeeCount} participante{event.attendeeCount !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {event.description && (
          <p className="text-sm text-foreground whitespace-pre-line">{event.description}</p>
        )}

        <div className="border-t border-border pt-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Sua presença</p>
          <div className="flex items-center gap-2">
            <span className={cn('text-xs px-2 py-1 rounded-full font-medium', RSVP_COLORS[event.myRsvp ?? 'PENDENTE'])}>
              {RSVP_LABELS[event.myRsvp ?? 'PENDENTE']}
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={event.myRsvp === 'CONFIRMADO' ? 'default' : 'outline'}
              onClick={() => rsvpMutation.mutate('CONFIRMADO')}
              disabled={rsvpMutation.isPending}
            >
              Confirmar
            </Button>
            <Button
              size="sm"
              variant={event.myRsvp === 'RECUSADO' ? 'destructive' : 'outline'}
              onClick={() => rsvpMutation.mutate('RECUSADO')}
              disabled={rsvpMutation.isPending}
            >
              Recusar
            </Button>
          </div>
        </div>

        {event.attendees && (
          <div className="border-t border-border pt-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Participantes</p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {event.attendees.map(a => (
                <div key={a.userId} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="text-foreground">{a.name}</span>
                    {a.sector && <span className="text-xs text-muted-foreground ml-1">({a.sector})</span>}
                  </div>
                  <span className={cn('text-xs px-1.5 py-0.5 rounded-full', RSVP_COLORS[a.rsvp])}>
                    {RSVP_LABELS[a.rsvp]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {canManage && (
          <div className="border-t border-border pt-3 flex justify-end">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => { if (confirm('Cancelar este evento?')) deleteMutation.mutate() }}
              disabled={deleteMutation.isPending}
            >
              Cancelar Evento
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
