import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react'
import { categoriesApi } from '@/api/categories'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

function CategoryRow({ category, onRefresh }) {
  const [open, setOpen] = useState(false)
  const [newSubName, setNewSubName] = useState('')
  const [addingSub, setAddingSub] = useState(false)
  const [editName, setEditName] = useState('')
  const [editing, setEditing] = useState(false)

  const handleDelete = async () => {
    if (!window.confirm(`Excluir categoria "${category.name}"?`)) return
    try {
      await categoriesApi.remove(category.id)
      toast.success('Categoria excluída.')
      onRefresh()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao excluir.')
    }
  }

  const handleSaveName = async () => {
    if (!editName.trim()) return
    try {
      await categoriesApi.update(category.id, { name: editName.trim() })
      toast.success('Nome atualizado.')
      setEditing(false)
      onRefresh()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro.')
    }
  }

  const handleAddSub = async () => {
    if (!newSubName.trim()) return
    setAddingSub(true)
    try {
      await categoriesApi.createSubcategory(category.id, { name: newSubName.trim() })
      toast.success('Subcategoria adicionada.')
      setNewSubName('')
      onRefresh()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro.')
    } finally {
      setAddingSub(false)
    }
  }

  const handleDeleteSub = async (sub) => {
    if (!window.confirm(`Excluir subcategoria "${sub.name}"?`)) return
    try {
      await categoriesApi.removeSubcategory(sub.id)
      toast.success('Subcategoria excluída.')
      onRefresh()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao excluir.')
    }
  }

  return (
    <div className="border rounded-lg">
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => setOpen(v => !v)} className="text-gray-400">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {editing ? (
          <div className="flex gap-2 flex-1">
            <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-7 text-sm" />
            <Button size="sm" onClick={handleSaveName}>Salvar</Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
          </div>
        ) : (
          <>
            <span className="font-medium text-sm flex-1">{category.name}</span>
            <span className="text-xs text-gray-400">{category.subcategories?.length || 0} subcategorias</span>
            <button
              onClick={() => { setEditName(category.name); setEditing(true) }}
              className="text-blue-600 hover:underline text-xs"
            >
              Renomear
            </button>
            <button onClick={handleDelete} className="text-red-500 hover:underline text-xs">Excluir</button>
          </>
        )}
      </div>
      {open && (
        <div className="px-10 pb-4 space-y-2">
          <div className="flex flex-wrap gap-2">
            {(category.subcategories || []).map(sub => (
              <span key={sub.id} className="flex items-center gap-1 bg-gray-100 text-gray-700 px-2.5 py-0.5 rounded-full text-xs font-medium">
                {sub.name}
                <button onClick={() => handleDeleteSub(sub)} className="text-gray-400 hover:text-red-500">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <Input
              placeholder="Nova subcategoria..."
              value={newSubName}
              onChange={e => setNewSubName(e.target.value)}
              className="h-7 text-sm max-w-xs"
              onKeyDown={e => e.key === 'Enter' && handleAddSub()}
            />
            <Button size="sm" onClick={handleAddSub} disabled={addingSub || !newSubName.trim()}>
              <Plus className="h-3 w-3 mr-1" /> Adicionar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminCategoriesPage() {
  const qc = useQueryClient()
  const [newCatName, setNewCatName] = useState('')
  const [creating, setCreating] = useState(false)

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: categoriesApi.list,
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['categories'] })

  const handleCreate = async () => {
    if (!newCatName.trim()) return
    setCreating(true)
    try {
      await categoriesApi.create({ name: newCatName.trim() })
      toast.success('Categoria criada.')
      setNewCatName('')
      refresh()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Categorias e Subcategorias</h1>
      <div className="flex gap-2">
        <Input
          placeholder="Nome da nova categoria..."
          value={newCatName}
          onChange={e => setNewCatName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          className="max-w-xs"
        />
        <Button onClick={handleCreate} disabled={creating || !newCatName.trim()}>
          <Plus className="h-4 w-4 mr-1" /> Criar
        </Button>
      </div>
      {isLoading
        ? <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
        : <div className="space-y-3">{categories.map(cat => (
            <CategoryRow key={cat.id} category={cat} onRefresh={refresh} />
          ))}</div>
      }
    </div>
  )
}
