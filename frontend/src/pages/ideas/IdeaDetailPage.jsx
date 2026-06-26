import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ThumbsUp } from 'lucide-react'
import { ideasApi } from '@/api/ideas'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, timeAgo } from '@/lib/utils'
import { IDEA_STATUS_LABELS, IDEA_STATUS_COLORS } from './IdeasListPage'

const VALID_TRANSITIONS = {
  NOVA: ['EM_ANALISE', 'ARQUIVADA'],
  EM_ANALISE: ['APROVADA', 'ARQUIVADA'],
  APROVADA: ['EM_IMPLEMENTACAO', 'ARQUIVADA'],
  EM_IMPLEMENTACAO: ['IMPLEMENTADA', 'ARQUIVADA'],
  IMPLEMENTADA: [],
  ARQUIVADA: [],
}

export default function IdeaDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const permissions = useAuthStore((s) => s.permissions)
  const user = useAuthStore((s) => s.user)
  const canManage = permissions.has('manage_ideas')

  const [newStatus, setNewStatus] = useState('')
  const [managerNote, setManagerNote] = useState('')
  const [savingStatus, setSavingStatus] = useState(false)
  const [commentBody, setCommentBody] = useState('')

  const { data: idea, isLoading, isError } = useQuery({
    queryKey: ['ideas', id],
    queryFn: () => ideasApi.get(id),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['ideas', id] })

  const addCommentMutation = useMutation({
    mutationFn: (body) => ideasApi.addComment(id, body),
    onSuccess: () => {
      invalidate()
      setCommentBody('')
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro ao comentar.'),
  })

  const deleteCommentMutation = useMutation({
    mutationFn: (cid) => ideasApi.deleteComment(id, cid),
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(err.response?.data?.error || 'Erro ao excluir comentário.'),
  })

  const voteMutation = useMutation({
    mutationFn: () => ideasApi.toggleVote(id),
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(err.response?.data?.error || 'Erro ao votar.'),
  })

  const handleSaveStatus = async () => {
    if (!newStatus) return
    setSavingStatus(true)
    try {
      await ideasApi.updateStatus(id, { status: newStatus, managerNote: managerNote || undefined })
      toast.success('Status atualizado.')
      setNewStatus('')
      setManagerNote('')
      invalidate()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao atualizar status.')
    } finally {
      setSavingStatus(false)
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

  if (isError || !idea) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Ideia não encontrada.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/ideas')}>Voltar</Button>
      </div>
    )
  }

  const transitions = VALID_TRANSITIONS[idea.status] || []

  return (
    <div className="max-w-3xl space-y-6">
      <div className="bg-white border rounded-lg p-6 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1">
            <h1 className="text-xl font-semibold">{idea.title}</h1>
            {idea.authorName && <p className="text-sm text-gray-400 mt-0.5">por {idea.authorName}</p>}
          </div>
          <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium', IDEA_STATUS_COLORS[idea.status])}>
            {IDEA_STATUS_LABELS[idea.status]}
          </span>
        </div>

        <div className="space-y-3 text-sm text-gray-700">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase mb-0.5">Descrição</p>
            <p className="whitespace-pre-wrap">{idea.description}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase mb-0.5">Área impactada</p>
            <p>{idea.areaImpacted}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase mb-0.5">Benefício esperado</p>
            <p className="whitespace-pre-wrap">{idea.expectedBenefit}</p>
          </div>
          {idea.managerNote && (
            <div className="bg-blue-50 border border-blue-100 rounded p-3">
              <p className="text-xs font-medium text-blue-600 mb-0.5">Nota do gestor</p>
              <p className="text-blue-800">{idea.managerNote}</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 pt-2 border-t">
          <button
            onClick={() => voteMutation.mutate()}
            disabled={idea.status !== 'EM_ANALISE' || voteMutation.isPending}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors',
              idea.userHasVoted ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50',
              idea.status !== 'EM_ANALISE' && 'opacity-40 cursor-not-allowed'
            )}
          >
            <ThumbsUp className="h-4 w-4" />
            {idea.voteCount}
            {idea.status !== 'EM_ANALISE'
              ? ' (votação encerrada)'
              : idea.userHasVoted ? ' Votado' : ' Votar'
            }
          </button>
        </div>
      </div>

      {canManage && transitions.length > 0 && (
        <div className="bg-white border rounded-lg p-6 space-y-3">
          <p className="font-medium text-sm">Atualizar status</p>
          <select
            value={newStatus}
            onChange={e => setNewStatus(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm w-full"
          >
            <option value="">Selecione o novo status...</option>
            {transitions.map(s => <option key={s} value={s}>{IDEA_STATUS_LABELS[s]}</option>)}
          </select>
          <div>
            <label className="block text-sm font-medium mb-1">Nota do gestor (opcional)</label>
            <Textarea
              value={managerNote}
              onChange={e => setManagerNote(e.target.value)}
              rows={3}
              placeholder="Comentário sobre a decisão..."
            />
          </div>
          <Button onClick={handleSaveStatus} disabled={!newStatus || savingStatus} size="sm">
            {savingStatus ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      )}

      {/* Comentários */}
      <div className="bg-white border rounded-lg p-6 space-y-4">
        <p className="font-medium text-sm">Comentários ({(idea.comments || []).length})</p>

        {(idea.comments || []).length === 0 ? (
          <p className="text-sm text-gray-400">Seja o primeiro a comentar.</p>
        ) : (
          <div className="divide-y border rounded-lg">
            {(idea.comments || []).map((c) => (
              <div key={c.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-medium text-gray-700">{c.author?.name ?? 'Usuário'}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{timeAgo(c.createdAt)}</span>
                    {c.author?.id === user?.id && (
                      <button
                        onClick={() => deleteCommentMutation.mutate(c.id)}
                        disabled={deleteCommentMutation.isPending}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Excluir
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{c.body}</p>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <Textarea
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder="Escreva um comentário..."
            rows={3}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!commentBody.trim() || addCommentMutation.isPending}
              onClick={() => addCommentMutation.mutate(commentBody.trim())}
            >
              {addCommentMutation.isPending ? 'Enviando...' : 'Comentar'}
            </Button>
          </div>
        </div>
      </div>

      <Button variant="outline" size="sm" onClick={() => navigate('/ideas')}>← Voltar às ideias</Button>
    </div>
  )
}
