// frontend/src/components/CommandPalette.jsx
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Ticket, Calendar, User, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { searchApi } from '@/api/search'
import { cn, formatTicketId, STATUS_LABELS, URGENCY_LABELS } from '@/lib/utils'

const URGENCY_COLOR = {
  CRITICO: 'text-red-500', ALTO: 'text-orange-500',
  MEDIO: 'text-yellow-500', BAIXO: 'text-blue-500',
}

export default function CommandPalette({ open, onClose }) {
  const [q, setQ] = useState('')
  const inputRef = useRef(null)
  const navigate = useNavigate()

  const debouncedQ = useDebounce(q, 250)

  const { data, isFetching } = useQuery({
    queryKey: ['search', debouncedQ],
    queryFn: () => searchApi.search(debouncedQ),
    enabled: debouncedQ.trim().length >= 2,
    staleTime: 0,
  })

  useEffect(() => {
    if (open) {
      setQ('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const tickets = data?.tickets ?? []
  const events  = data?.events  ?? []
  const users   = data?.users   ?? []
  const hasResults = tickets.length > 0 || events.length > 0 || users.length > 0

  function go(path) { navigate(path); onClose() }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar chamados, eventos, usuários..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          {isFetching && (
            <div className="h-3 w-3 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
          )}
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[420px] overflow-y-auto">
          {debouncedQ.length < 2 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Digite pelo menos 2 caracteres para buscar.
            </div>
          ) : !hasResults && !isFetching ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhum resultado para &ldquo;<span className="font-medium">{q}</span>&rdquo;.
            </div>
          ) : (
            <>
              {tickets.length > 0 && (
                <Section title="Chamados" icon={Ticket}>
                  {tickets.map(t => (
                    <ResultRow
                      key={t.id}
                      onClick={() => go(`/tickets/${t.id}`)}
                      left={
                        <>
                          <span className="font-mono text-xs text-muted-foreground mr-2">{formatTicketId(t.id)}</span>
                          <span className="text-sm text-foreground truncate">{t.title}</span>
                        </>
                      }
                      right={
                        <span className={cn('text-xs font-medium', URGENCY_COLOR[t.urgency])}>
                          {URGENCY_LABELS[t.urgency]}
                        </span>
                      }
                    />
                  ))}
                </Section>
              )}
              {events.length > 0 && (
                <Section title="Agenda" icon={Calendar}>
                  {events.map(e => (
                    <ResultRow
                      key={e.id}
                      onClick={() => go('/agenda')}
                      left={<span className="text-sm text-foreground truncate">{e.title}</span>}
                      right={
                        <span className="text-xs text-muted-foreground">
                          {new Date(e.startAt).toLocaleDateString('pt-BR', { day:'2-digit', month:'short' })}
                        </span>
                      }
                    />
                  ))}
                </Section>
              )}
              {users.length > 0 && (
                <Section title="Usuários" icon={User}>
                  {users.map(u => (
                    <ResultRow
                      key={u.id}
                      onClick={() => go(`/admin/users`)}
                      left={<span className="text-sm text-foreground truncate">{u.name}</span>}
                      right={<span className="text-xs text-muted-foreground">{u.email}</span>}
                    />
                  ))}
                </Section>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
          <span><kbd className="font-mono bg-muted px-1 rounded">↵</kbd> selecionar</span>
          <span><kbd className="font-mono bg-muted px-1 rounded">Esc</kbd> fechar</span>
        </div>
      </div>
    </div>
  )
}

function Section({ title, icon: Icon, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/30 sticky top-0">
        <Icon className="h-3 w-3" />
        {title}
      </div>
      {children}
    </div>
  )
}

function ResultRow({ onClick, left, right }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors text-left"
    >
      <div className="flex items-center gap-1 min-w-0 flex-1">{left}</div>
      <div className="shrink-0">{right}</div>
    </button>
  )
}

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}
