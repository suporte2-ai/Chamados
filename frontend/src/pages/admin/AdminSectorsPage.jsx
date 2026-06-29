import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { sectorsApi } from '@/api/sectors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

export default function AdminSectorsPage() {
  const qc = useQueryClient()
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const { data: sectors = [], isLoading } = useQuery({
    queryKey: ['sectors'],
    queryFn: sectorsApi.list,
  })

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      await sectorsApi.create({ name: newName.trim() })
      toast.success('Setor criado.')
      setNewName('')
      qc.invalidateQueries({ queryKey: ['sectors'] })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao criar setor.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-foreground">Setores</h1>
      <p className="text-sm text-muted-foreground">Setores são estáveis — apenas criação é suportada.</p>
      <div className="flex gap-2">
        <Input
          placeholder="Nome do novo setor..."
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          className="max-w-xs"
        />
        <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
          <Plus className="h-4 w-4 mr-1" /> Criar
        </Button>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs">Nome</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}><td className="px-4 py-3"><Skeleton className="h-4 w-48" /></td></tr>
              ))
              : sectors.map(s => (
                <tr key={s.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{s.name}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}
