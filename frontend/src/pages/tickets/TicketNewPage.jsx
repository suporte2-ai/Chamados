import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { ticketsApi } from '@/api/tickets'
import { formatTicketId, URGENCY_LABELS } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'


export default function TicketNewPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [subcategoryId, setSubcategoryId] = useState('')
  const [urgency, setUrgency] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/api/categories').then((r) => r.data),
  })

  const selectedCategory = categories.find((c) => String(c.id) === categoryId)
  const subcategories = selectedCategory?.subcategories || []

  const validate = () => {
    const e = {}
    if (!title.trim()) e.title = 'Título é obrigatório.'
    if (!description.trim()) e.description = 'Descrição é obrigatória.'
    if (!categoryId) e.categoryId = 'Categoria é obrigatória.'
    if (subcategories.length > 0 && !subcategoryId) e.subcategoryId = 'Subcategoria é obrigatória.'
    if (!urgency) e.urgency = 'Urgência é obrigatória.'
    return e
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setLoading(true)
    try {
      const ticket = await ticketsApi.create({
        title: title.trim(),
        description: description.trim(),
        categoryId: Number(categoryId),
        subcategoryId: Number(subcategoryId),
        urgency,
      })
      qc.invalidateQueries({ queryKey: ['tickets'] })
      toast.success(`Chamado ${formatTicketId(ticket.id)} aberto com sucesso.`)
      navigate(`/tickets/${ticket.id}`)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao abrir chamado.')
    } finally {
      setLoading(false)
    }
  }

  const clearError = (key) => setErrors((prev) => ({ ...prev, [key]: undefined }))

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold mb-6">Novo Chamado</h1>
      <form onSubmit={handleSubmit} className="bg-white border rounded-lg p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">Título *</label>
          <Input
            value={title}
            onChange={(e) => { setTitle(e.target.value); clearError('title') }}
            placeholder="Descreva brevemente o problema"
            autoFocus
          />
          {errors.title && <p className="text-sm text-red-600 mt-1">{errors.title}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Descrição *</label>
          <Textarea
            value={description}
            onChange={(e) => { setDescription(e.target.value); clearError('description') }}
            placeholder="Detalhe o problema, incluindo mensagens de erro e passos para reproduzir"
            rows={4}
          />
          {errors.description && <p className="text-sm text-red-600 mt-1">{errors.description}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Categoria *</label>
            <select
              value={categoryId}
              onChange={(e) => { setCategoryId(e.target.value); setSubcategoryId(''); clearError('categoryId') }}
              className="border rounded-md px-3 py-2 text-sm w-full"
            >
              <option value="">Selecione...</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {errors.categoryId && <p className="text-sm text-red-600 mt-1">{errors.categoryId}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Subcategoria {subcategories.length > 0 ? '*' : ''}
            </label>
            <select
              value={subcategoryId}
              onChange={(e) => { setSubcategoryId(e.target.value); clearError('subcategoryId') }}
              className="border rounded-md px-3 py-2 text-sm w-full"
              disabled={!categoryId || subcategories.length === 0}
            >
              <option value="">Selecione...</option>
              {subcategories.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {errors.subcategoryId && <p className="text-sm text-red-600 mt-1">{errors.subcategoryId}</p>}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Urgência *</label>
          <select
            value={urgency}
            onChange={(e) => { setUrgency(e.target.value); clearError('urgency') }}
            className="border rounded-md px-3 py-2 text-sm w-full max-w-xs"
          >
            <option value="">Selecione...</option>
            {Object.entries(URGENCY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {errors.urgency && <p className="text-sm text-red-600 mt-1">{errors.urgency}</p>}
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={loading}>
            {loading ? 'Abrindo...' : 'Abrir Chamado'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/tickets')}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  )
}
