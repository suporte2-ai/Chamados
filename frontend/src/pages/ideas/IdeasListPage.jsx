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
  NOVA: 'bg-gray-100 text-gray-700',
  EM_ANALISE: 'bg-blue-100 text-blue-700',
  APROVADA: 'bg-green-100 text-green-700',
  EM_IMPLEMENTACAO: 'bg-purple-100 text-purple-700',
  IMPLEMENTADA: 'bg-emerald-100 text-emerald-700',
  ARQUIVADA: 'bg-red-100 text-red-700',
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
        <h1 className="text-xl font-semibold">Ideias</h1>
        <Button onClick={() => navigate('/ideas/new')}>+ Nova Ideia</Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setStatusFilter('')}
          className={cn('px-3 py-1 rounded-full text-sm font-medium border',
            !statusFilter ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:bg-gray-50')}
        >
          Todas
        </button>
        {Object.entries(IDEA_STATUS_LABELS).map(([v, l]) => (
          <button
            key={v}
            onClick={() => setStatusFilter(v)}
            className={cn('px-3 py-1 rounded-full text-sm font-medium border',
              statusFilter === v ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:bg-gray-50')}
          >
            {l}
          </button>
        ))}
      </div>

      {isLoading
        ? <div className="grid md:grid-cols-2 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-36 rounded-lg" />)}</div>
        : ideas.length === 0
          ? <p className="text-center text-gray-400 py-12">Nenhuma ideia encontrada.</p>
          : (
            <div className="grid md:grid-cols-2 gap-4">
              {ideas.map(idea => (
                <div
                  key={idea.id}
                  onClick={() => navigate(`/ideas/${idea.id}`)}
                  className="bg-white border rounded-lg p-5 hover:shadow-sm cursor-pointer transition-shadow space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold text-gray-900 leading-snug">{idea.title}</h2>
                    <span className={cn('shrink-0 px-2 py-0.5 rounded-full text-xs font-medium', IDEA_STATUS_COLORS[idea.status])}>
                      {IDEA_STATUS_LABELS[idea.status]}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 line-clamp-2">{idea.description}</p>
                  <div className="flex items-center justify-between text-xs text-gray-400">
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
