import EventCard from './EventCard'

function groupByDate(events) {
  const groups = []
  const seen = new Map()
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  for (const e of events) {
    const d = new Date(e.startAt)
    const key = d.toDateString()
    let label
    if (d.toDateString() === today.toDateString()) label = 'Hoje'
    else if (d.toDateString() === tomorrow.toDateString()) label = 'Amanhã'
    else label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

    if (!seen.has(key)) {
      seen.set(key, { label, events: [] })
      groups.push(seen.get(key))
    }
    seen.get(key).events.push(e)
  }
  return groups
}

export default function EventListView({ events, onEventClick }) {
  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        Nenhum evento próximo encontrado.
      </div>
    )
  }

  const groups = groupByDate(events)

  return (
    <div className="space-y-6">
      {groups.map(g => (
        <div key={g.label} className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{g.label}</h3>
          {g.events.map(e => (
            <EventCard key={e.id} event={e} onClick={() => onEventClick(e)} />
          ))}
        </div>
      ))}
    </div>
  )
}
