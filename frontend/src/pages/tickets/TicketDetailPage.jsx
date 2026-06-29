import { useState, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp, Lock, Paperclip, Download } from 'lucide-react'
import { ticketsApi } from '@/api/tickets'
import { sectorsApi } from '@/api/sectors'
import { useAuth } from '@/hooks/useAuth'
import {
  formatDate, formatTicketId, timeAgo,
  STATUS_COLORS, STATUS_LABELS,
  URGENCY_COLORS, URGENCY_LABELS,
  SLA_BADGE_COLORS, SLA_BADGE_LABELS,
  cn,
} from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

const TRANSITIONS = {
  ABERTO: ['EM_ANDAMENTO', 'AGUARDANDO', 'RESOLVIDO'],
  EM_ANDAMENTO: ['AGUARDANDO', 'RESOLVIDO'],
  AGUARDANDO: ['EM_ANDAMENTO', 'RESOLVIDO'],
  RESOLVIDO: ['FECHADO', 'EM_ANDAMENTO'],
  FECHADO: [],
}

const EVENT_LABELS = {
  CREATED: 'Chamado aberto',
  STATUS_CHANGED: 'Status alterado',
  ASSIGNED: 'Atribuído',
  COMMENT_ADDED: 'Comentário adicionado',
  FIRST_RESPONSE: 'Primeira resposta registrada',
  RESOLVED: 'Chamado resolvido',
  CLOSED: 'Chamado fechado',
  REOPENED: 'Chamado reaberto',
}

export default function TicketDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user, permissions, fieldVisible } = useAuth()

  const [commentBody, setCommentBody] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [submittingComment, setSubmittingComment] = useState(false)
  const [timelineOpen, setTimelineOpen] = useState(false)
  const fileRef = useRef(null)

  const { data: ticket, isLoading, isError } = useQuery({
    queryKey: ['tickets', id],
    queryFn: () => ticketsApi.get(id),
  })

  const ticketSectorId = ticket?.sectorId
  const { data: users = [] } = useQuery({
    queryKey: ['sector-users', ticketSectorId],
    queryFn: () => sectorsApi.listUsers(ticketSectorId).catch(() => []),
    enabled: permissions.has('reassign_tickets') && !!ticketSectorId,
  })

  const pickerUsers = useMemo(() => {
    if (!ticket?.assignedToId) return users
    if (users.some(u => u.id === ticket.assignedToId)) return users
    const current = ticket.assignedTo ? { id: ticket.assignedToId, name: ticket.assignedTo.name } : null
    return current ? [current, ...users] : users
  }, [users, ticket?.assignedToId, ticket?.assignedTo])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['tickets', id] })

  const updateMutation = useMutation({
    mutationFn: (body) => ticketsApi.update(id, body),
    onSuccess: () => { invalidate(); toast.success('Chamado atualizado.') },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro ao atualizar.'),
  })

  const reopenMutation = useMutation({
    mutationFn: () => ticketsApi.reopen(id),
    onSuccess: () => { invalidate(); toast.success('Chamado reaberto.') },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro ao reabrir.'),
  })

  const handleStatusChange = (newStatus) => {
    updateMutation.mutate({ status: newStatus })
  }

  const handleAssigneeChange = (e) => {
    const val = e.target.value
    updateMutation.mutate({ assignedToId: val ? Number(val) : null })
  }

  const handleCostChange = (e) => {
    const val = parseFloat(e.target.value)
    if (!isNaN(val)) updateMutation.mutate({ estimatedCost: val })
  }

  const handleCommentSubmit = async (e) => {
    e.preventDefault()
    if (!commentBody.trim()) return
    setSubmittingComment(true)
    try {
      await ticketsApi.addComment(id, { body: commentBody.trim(), isInternal })
      setCommentBody('')
      setIsInternal(false)
      invalidate()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao enviar comentário.')
    } finally {
      setSubmittingComment(false)
    }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await ticketsApi.addAttachment(id, file)
      invalidate()
      toast.success('Arquivo anexado.')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao anexar arquivo.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (isError || !ticket) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground text-lg">Chamado não encontrado.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/tickets')}>
          Voltar à lista
        </Button>
      </div>
    )
  }

  const transitions = TRANSITIONS[ticket.status] || []
  const canManage = user?.id === ticket.assignedToId || permissions.has('reassign_tickets')
  const canReopen = permissions.has('reopen_tickets') && ticket.status === 'RESOLVIDO'
  const canClose = permissions.has('close_tickets') && ticket.status !== 'FECHADO'

  const allowedTransitions = transitions.filter(s => {
    if (s === 'FECHADO') return canClose
    if (s === 'EM_ANDAMENTO' && ticket.status === 'RESOLVIDO') return canReopen
    return canManage
  })

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground font-mono">{formatTicketId(ticket.id)}</p>
            <h1 className="text-xl font-bold mt-1 break-words text-foreground">{ticket.title}</h1>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium', STATUS_COLORS[ticket.status])}>
              {STATUS_LABELS[ticket.status]}
            </span>
            <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium', URGENCY_COLORS[ticket.urgency])}>
              {URGENCY_LABELS[ticket.urgency]}
            </span>
            {ticket.slaBadge && (
              <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium border', SLA_BADGE_COLORS[ticket.slaBadge])}>
                SLA: {SLA_BADGE_LABELS[ticket.slaBadge] ?? ticket.slaBadge}
              </span>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-4 whitespace-pre-wrap">{ticket.description}</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Coluna principal */}
        <div className="flex-1 space-y-6">

          {/* Comentários */}
          <div className="bg-card border border-border rounded-xl">
            <div className="px-6 py-4 border-b bg-muted/40 font-medium text-sm text-foreground">Comentários</div>
            <div className="divide-y divide-border">
              {(ticket.comments || []).map((c) => (
                <div key={c.id} className="px-6 py-4">
                  <div className="flex items-center gap-2 mb-2">
                    {c.isInternal && <Lock className="h-3 w-3 text-yellow-600" />}
                    <span className="text-xs font-medium text-foreground">{c.author?.name ?? 'Usuário'}</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{formatDate(c.createdAt)}</span>
                    {c.isInternal && <span className="text-xs text-yellow-600 font-medium">Nota interna</span>}
                  </div>
                  <div className={cn(
                    'rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap',
                    c.isInternal
                      ? 'bg-yellow-50 dark:bg-yellow-900/20 text-foreground'
                      : c.author?.id === ticket.assignedToId
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-foreground'
                        : 'bg-muted text-foreground'
                  )}>
                    {c.body}
                  </div>
                </div>
              ))}
              {(ticket.comments || []).length === 0 && (
                <p className="px-6 py-4 text-sm text-muted-foreground">Nenhum comentário.</p>
              )}
            </div>

            {/* Formulário de comentário */}
            <form onSubmit={handleCommentSubmit} className="px-6 py-4 border-t border-border space-y-3">
              <Textarea
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="Escreva um comentário..."
                rows={3}
              />
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  {permissions.has('view_internal_notes') && (
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer text-foreground">
                      <input
                        type="checkbox"
                        checked={isInternal}
                        onChange={(e) => setIsInternal(e.target.checked)}
                      />
                      Nota interna
                    </label>
                  )}
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer text-muted-foreground hover:text-foreground">
                    <Paperclip className="h-4 w-4" />
                    Anexar arquivo
                    <input ref={fileRef} type="file" className="hidden" onChange={handleFileUpload} />
                  </label>
                </div>
                <Button type="submit" size="sm" disabled={submittingComment || !commentBody.trim()}>
                  {submittingComment ? 'Enviando...' : 'Enviar'}
                </Button>
              </div>
            </form>
          </div>

          {/* Anexos */}
          {(ticket.attachments || []).length > 0 && (
            <div className="bg-card border border-border rounded-xl">
              <div className="px-6 py-4 border-b bg-muted/40 font-medium text-sm text-foreground">Anexos</div>
              <div className="divide-y divide-border">
                {ticket.attachments.map((a) => (
                  <div key={a.id} className="px-6 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{a.fileName}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(a.createdAt)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await ticketsApi.downloadAttachment(ticket.id, a.id, a.fileName)
                        } catch {
                          toast.error('Erro ao baixar arquivo.')
                        }
                      }}
                      className="text-blue-600 hover:underline flex items-center gap-1 text-sm"
                    >
                      <Download className="h-4 w-4" />
                      Baixar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="bg-card border border-border rounded-xl">
            <button
              onClick={() => setTimelineOpen((v) => !v)}
              className="w-full px-6 py-4 flex items-center justify-between text-sm font-medium hover:bg-muted/40 transition-colors text-foreground"
            >
              <span>Timeline de eventos</span>
              {timelineOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {timelineOpen && (
              <div className="border-t border-border divide-y divide-border">
                {(ticket.timeLogs || []).map((log) => (
                  <div key={log.id} className="px-6 py-3 flex gap-3">
                    <div className="w-2 h-2 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
                    <div>
                      <p className="text-sm text-foreground">
                        {EVENT_LABELS[log.eventType] || log.eventType}
                        {log.toStatus && ` → ${STATUS_LABELS[log.toStatus] || log.toStatus}`}
                      </p>
                      <p className="text-xs text-muted-foreground">{timeAgo(log.occurredAt)} · {formatDate(log.occurredAt)}</p>
                    </div>
                  </div>
                ))}
                {(ticket.timeLogs || []).length === 0 && (
                  <p className="px-6 py-4 text-sm text-muted-foreground">Sem eventos.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Painel lateral de campos */}
        <aside className="w-full md:w-72 shrink-0">
          <div className="bg-card border border-border rounded-xl p-5 space-y-4 text-sm">

            {/* Status */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Status</p>
              {allowedTransitions.length > 0 ? (
                <select
                  value={ticket.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="border border-border rounded-md px-2 py-1.5 text-sm w-full bg-background text-foreground"
                >
                  <option value={ticket.status} disabled>{STATUS_LABELS[ticket.status]}</option>
                  {allowedTransitions.map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              ) : (
                <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[ticket.status])}>
                  {STATUS_LABELS[ticket.status]}
                </span>
              )}
            </div>

            {canReopen && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => reopenMutation.mutate()}
                disabled={reopenMutation.isPending}
              >
                Reabrir Chamado
              </Button>
            )}

            {/* Atribuído a */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Atribuído a</p>
              {permissions.has('reassign_tickets') ? (
                <select
                  value={ticket.assignedToId || ''}
                  onChange={handleAssigneeChange}
                  className="border border-border rounded-md px-2 py-1.5 text-sm w-full bg-background text-foreground"
                >
                  <option value="">— Não atribuído —</option>
                  {pickerUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              ) : (
                <p className="text-foreground">{ticket.assignedTo?.name ?? '— Não atribuído —'}</p>
              )}
            </div>

            {/* Campos de leitura — grid 2 colunas */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Solicitante', value: ticket.requester?.name ?? '—' },
                { label: 'Setor', value: ticket.sector?.name ?? '—' },
                { label: 'Urgência', value: URGENCY_LABELS[ticket.urgency] },
                { label: 'Criado em', value: formatDate(ticket.createdAt) },
                { label: 'Resolvido em', value: ticket.resolvedAt ? formatDate(ticket.resolvedAt) : '—' },
                { label: 'Fechado em', value: ticket.closedAt ? formatDate(ticket.closedAt) : '—' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
                  <p className="text-foreground text-xs">{value}</p>
                </div>
              ))}
            </div>

            {/* Custo estimado */}
            {fieldVisible('estimated_cost') && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Custo estimado (R$)</p>
                {permissions.has('update_cost') ? (
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={ticket.estimatedCost || ''}
                    onBlur={handleCostChange}
                    placeholder="0,00"
                    className="h-8 text-sm"
                  />
                ) : (
                  <p className="text-foreground">
                    {ticket.estimatedCost ? `R$ ${Number(ticket.estimatedCost).toFixed(2)}` : '—'}
                  </p>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
