import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ThumbsUp } from 'lucide-react'
import { ideasApi } from '@/api/ideas'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export const IDEA_STATUS_LABELS = {
  NOVA: 'Nova',
  EM_ANALISE: 'Em análise',
  APROVADA: 'Aprovada',
  EM_IMPLEMENTACAO: 'Em implementação',
  IMPLEMENTADA: 'Implementada',
  ARQUIVADA: 'Arquivada',
}

export const IDEA_STATUS_COLORS = {
  NOVA:             'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  EM_ANALISE:       'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  APROVADA:         'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  EM_IMPLEMENTACAO: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  IMPLEMENTADA:     'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  ARQUIVADA:        'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

export default function IdeasListPage() {
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState('')

  const { data: ideas = [], isLoading } = useQuery({
    queryKey: ['ideas', statusFilter],
    queryFn: () => ideasApi.list(statusFilter ? { status: statusFilter } : {}),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Ideias</h1>
        <Button onClick={() => navigate('/ideas/new')}>+ Nova Ideia</Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setStatusFilter('')}
          className={cn('px-3 py-1 rounded-full text-sm font-medium border transition-colors',
            !statusFilter ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:bg-muted/40')}
        >
          Todas
        </button>
        {Object.entries(IDEA_STATUS_LABELS).map(([v, l]) => (
          <button
            key={v}
            onClick={() => setStatusFilter(v)}
            className={cn('px-3 py-1 rounded-full text-sm font-medium border transition-colors',
              statusFilter === v ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:bg-muted/40')}
          >
            {l}
          </button>
        ))}
      </div>

      {isLoading
        ? <div className="grid md:grid-cols-2 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-36 rounded-xl" />)}</div>
        : ideas.length === 0
          ? <p className="text-center text-muted-foreground py-12">Nenhuma ideia encontrada.</p>
          : (
            <div className="grid md:grid-cols-2 gap-4">
              {ideas.map(idea => (
                <div
                  key={idea.id}
                  onClick={() => navigate(`/ideas/${idea.id}`)}
                  className="bg-card border border-border rounded-xl p-5 hover:shadow-md cursor-pointer transition-shadow space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold text-foreground leading-snug">{idea.title}</h2>
                    <span className={cn('shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium', IDEA_STATUS_COLORS[idea.status])}>
                      {IDEA_STATUS_LABELS[idea.status]}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{idea.description}</p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{idea.areaImpacted}</span>
                    <span className="flex items-center gap-1">
                      <ThumbsUp className="h-3 w-3" />
                      {idea.voteCount}
                      {idea.authorName && ` · ${idea.authorName}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
      }
    </div>
  )
}
