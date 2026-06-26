import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { ticketsApi } from '@/api/tickets'
import { useAuth } from '@/hooks/useAuth'
import { formatDate, formatTicketId, STATUS_COLORS, STATUS_LABELS, URGENCY_COLORS, URGENCY_LABELS, SLA_BADGE_COLORS, SLA_BADGE_LABELS, cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'


function useFilters() {
  const [params, setParams] = useSearchParams()
  const get = (k) => params.get(k) || ''
  const set = (k, v) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    next.set('page', '1')
    setParams(next)
  }
  const page = Number(params.get('page')) || 1
  const setPage = (p) => { const n = new URLSearchParams(params); n.set('page', String(p)); setParams(n) }
  return { get, set, page, setPage, params }
}

export default function TicketListPage() {
  const navigate = useNavigate()
  const { fieldVisible } = useAuth()
  const { get, set, page, setPage, params } = useFilters()
  const [search, setSearch] = useState(get('search'))
  const setRef = useRef(set)
  setRef.current = set

  useEffect(() => {
    const t = setTimeout(() => setRef.current('search', search), 400)
    return () => clearTimeout(t)
  }, [search])

  const filters = {
    status: get('status') || undefined,
    urgency: get('urgency') || undefined,
    sectorId: get('sectorId') || undefined,
    from: get('from') || undefined,
    to: get('to') || undefined,
    search: get('search') || undefined,
    page,
    pageSize: 20,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', Object.fromEntries(params)],
    queryFn: () => ticketsApi.list(filters),
  })

  const tickets = data?.items || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / 20)

  const showAssignedTo = fieldVisible('assigned_to')
  const showSla = fieldVisible('sla_badge')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Chamados</h1>
        <Button onClick={() => navigate('/tickets/new')}>+ Novo Chamado</Button>
      </div>

      {/* Filtros */}
      <div className="bg-white border rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Input
          placeholder="Buscar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          value={get('status')}
          onChange={(e) => set('status', e.target.value)}
          className="border rounded-md px-3 py-2 text-sm w-full"
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABELS).map(([s, label]) => <option key={s} value={s}>{label}</option>)}
        </select>
        <select
          value={get('urgency')}
          onChange={(e) => set('urgency', e.target.value)}
          className="border rounded-md px-3 py-2 text-sm w-full"
        >
          <option value="">Todas as urgências</option>
          {Object.entries(URGENCY_LABELS).map(([u, label]) => <option key={u} value={u}>{label}</option>)}
        </select>
        <div className="flex gap-2 col-span-2 md:col-span-1">
          <input
            type="date"
            value={get('from')}
            onChange={(e) => set('from', e.target.value)}
            className="border rounded-md px-3 py-2 text-sm flex-1"
            title="De"
          />
          <input
            type="date"
            value={get('to')}
            onChange={(e) => set('to', e.target.value)}
            className="border rounded-md px-3 py-2 text-sm flex-1"
            title="Até"
          />
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600 w-24">#</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Título</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 hidden sm:table-cell">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 hidden md:table-cell">Urgência</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 hidden lg:table-cell">Setor</th>
                {showAssignedTo && <th className="px-4 py-3 text-left font-medium text-gray-600 hidden lg:table-cell">Atribuído a</th>}
                {showSla && <th className="px-4 py-3 text-left font-medium text-gray-600 hidden xl:table-cell">SLA</th>}
                <th className="px-4 py-3 text-left font-medium text-gray-600 hidden xl:table-cell">Criado em</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                : tickets.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => navigate(`/tickets/${t.id}`)}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-4 py-3 text-gray-500 font-mono">{formatTicketId(t.id)}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">{t.title}</td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[t.status])}>
                          {STATUS_LABELS[t.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', URGENCY_COLORS[t.urgency])}>
                          {URGENCY_LABELS[t.urgency]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">{t.sector?.name ?? '—'}</td>
                      {showAssignedTo && <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">{t.assignedToId || '—'}</td>}
                      {showSla && (
                        <td className="px-4 py-3 hidden xl:table-cell">
                          {t.slaBadge ? (
                            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium border', SLA_BADGE_COLORS[t.slaBadge])}>
                              {SLA_BADGE_LABELS[t.slaBadge] ?? t.slaBadge}
                            </span>
                          ) : '—'}
                        </td>
                      )}
                      <td className="px-4 py-3 text-gray-500 hidden xl:table-cell whitespace-nowrap">{formatDate(t.createdAt)}</td>
                    </tr>
                  ))
              }
              {!isLoading && tickets.length === 0 && (
                <tr><td colSpan="8" className="px-4 py-8 text-center text-gray-400">Nenhum chamado encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <span className="text-sm text-gray-600">{total} chamados</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Anterior
              </Button>
              <span className="text-sm px-2 py-1">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Próxima
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
