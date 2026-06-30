import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function getDotColor(events) {
  if (!events || events.length === 0) return null
  const hasPendente   = events.some(e => (e.myRsvp ?? 'PENDENTE') === 'PENDENTE')
  const allConfirmado = events.every(e => e.myRsvp === 'CONFIRMADO')
  if (hasPendente)   return 'bg-yellow-400'
  if (allConfirmado) return 'bg-green-500'
  return 'bg-slate-400'
}

export default function CalendarGrid({ events, onDayClick }) {
  const today = new Date()
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() })

  const { cells, monthLabel } = useMemo(() => {
    const { year, month } = cursor
    const label = new Date(year, month, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const grid = []
    for (let i = 0; i < firstDay; i++) grid.push(null)
    for (let d = 1; d <= daysInMonth; d++) grid.push(new Date(year, month, d))
    return { cells: grid, monthLabel: label.charAt(0).toUpperCase() + label.slice(1) }
  }, [cursor])

  function prev() {
    setCursor(c => {
      const m = c.month === 0 ? 11 : c.month - 1
      const y = c.month === 0 ? c.year - 1 : c.year
      return { year: y, month: m }
    })
  }
  function next() {
    setCursor(c => {
      const m = c.month === 11 ? 0 : c.month + 1
      const y = c.month === 11 ? c.year + 1 : c.year
      return { year: y, month: m }
    })
  }

  const dayEvents = useMemo(() => {
    const map = {}
    for (const e of events) {
      const key = new Date(e.startAt).toDateString()
      if (!map[key]) map[key] = []
      map[key].push(e)
    }
    return map
  }, [events])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={prev} className="p-1 rounded hover:bg-muted/40">
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <span className="font-semibold text-foreground text-sm">{monthLabel}</span>
        <button onClick={next} className="p-1 rounded hover:bg-muted/40">
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center">
        {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => (
          <div key={d} className="text-xs font-medium text-muted-foreground py-1">{d}</div>
        ))}
        {cells.map((date, idx) => {
          if (!date) return <div key={`empty-${idx}`} />
          const evs  = dayEvents[date.toDateString()] ?? []
          const dot  = getDotColor(evs)
          const isToday = isSameDay(date, new Date())
          return (
            <div
              key={date.toDateString()}
              onClick={() => evs.length > 0 && onDayClick(date, evs)}
              className={cn(
                'flex flex-col items-center py-1 rounded-lg transition-colors',
                evs.length > 0 ? 'cursor-pointer hover:bg-muted/40' : 'cursor-default',
              )}
            >
              <span className={cn(
                'text-xs w-7 h-7 flex items-center justify-center rounded-full',
                isToday ? 'bg-blue-600 text-white font-bold' : 'text-foreground',
              )}>
                {date.getDate()}
              </span>
              {dot && <div className={cn('w-1.5 h-1.5 rounded-full mt-0.5', dot)} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
