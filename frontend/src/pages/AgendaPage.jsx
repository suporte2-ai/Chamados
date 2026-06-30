import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Calendar, List, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { eventsApi } from '@/api/events'
import CalendarGrid from './agenda/CalendarGrid'
import EventListView from './agenda/EventListView'
import EventCard from './agenda/EventCard'
import EventModal from './agenda/EventModal'
import EventDetailModal from './agenda/EventDetailModal'

export default function AgendaPage() {
  const permissions = useAuthStore(s => s.permissions)
  const [view, setView] = useState('calendar')
  const [showCreate, setShowCreate] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [dayPanel, setDayPanel] = useState(null) // { date, events }

  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10)
  const to   = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString().slice(0, 10)

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['events', from, to],
    queryFn: () => eventsApi.list({ from, to }),
  })

  const futureEvents = useMemo(
    () => events.filter(e => new Date(e.startAt) >= new Date()).sort((a, b) => new Date(a.startAt) - new Date(b.startAt)),
    [events]
  )

  async function openEvent(e) {
    try {
      const detail = await eventsApi.get(e.id)
      setSelectedEvent(detail)
    } catch {
      setSelectedEvent(e)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Agenda</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setView('calendar')}
              className={cn('px-3 py-1.5 text-sm transition-colors', view === 'calendar' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/40')}
            >
              <Calendar className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView('list')}
              className={cn('px-3 py-1.5 text-sm transition-colors border-l border-border', view === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/40')}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          {permissions.has('manage_events') && (
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Novo Evento
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : view === 'calendar' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1">
            <div className="bg-card border border-border rounded-xl p-4">
              <CalendarGrid
                events={events}
                onDayClick={(date, evs) => setDayPanel({ date, events: evs })}
              />
            </div>
          </div>
          <div className="md:col-span-2 space-y-2">
            {dayPanel ? (
              <>
                <h3 className="text-sm font-medium text-muted-foreground">
                  {dayPanel.date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                </h3>
                {dayPanel.events.map(e => (
                  <EventCard key={e.id} event={e} onClick={() => openEvent(e)} />
                ))}
              </>
            ) : (
              <div className="text-center py-12 text-sm text-muted-foreground">
                Clique em um dia com eventos para ver detalhes.
              </div>
            )}
          </div>
        </div>
      ) : (
        <EventListView events={futureEvents} onEventClick={openEvent} />
      )}

      {showCreate && <EventModal onClose={() => setShowCreate(false)} />}
      {selectedEvent && <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
    </div>
  )
}
