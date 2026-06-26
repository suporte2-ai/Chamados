import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ideasApi } from '@/api/ideas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export default function IdeaNewPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    title: '', description: '', areaImpacted: '', expectedBenefit: '', isAnonymous: false,
  })
  const [loading, setLoading] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title || !form.description || !form.areaImpacted || !form.expectedBenefit) {
      toast.error('Preencha todos os campos obrigatórios.')
      return
    }
    setLoading(true)
    try {
      await ideasApi.create(form)
      toast.success('Ideia enviada com sucesso!')
      navigate('/ideas')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao enviar ideia.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Nova Ideia</h1>
      <form onSubmit={handleSubmit} className="bg-white border rounded-lg p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Título *</label>
          <Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Resumo da ideia" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Descrição *</label>
          <Textarea value={form.description} onChange={e => set('description', e.target.value)} rows={4} placeholder="Descreva a ideia em detalhes..." />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Área impactada *</label>
          <Input value={form.areaImpacted} onChange={e => set('areaImpacted', e.target.value)} placeholder="Ex: Suporte, TI, RH..." />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Benefício esperado *</label>
          <Textarea value={form.expectedBenefit} onChange={e => set('expectedBenefit', e.target.value)} rows={3} placeholder="Que problema isso resolve?" />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={form.isAnonymous} onChange={e => set('isAnonymous', e.target.checked)} />
          Enviar anonimamente
        </label>
        <div className="flex gap-3 justify-end">
          <Button type="button" variant="outline" onClick={() => navigate('/ideas')}>Cancelar</Button>
          <Button type="submit" disabled={loading}>{loading ? 'Enviando...' : 'Enviar Ideia'}</Button>
        </div>
      </form>
    </div>
  )
}
