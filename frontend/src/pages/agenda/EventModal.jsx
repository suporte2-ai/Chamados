import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { eventsApi } from '@/api/events'

export default function EventModal({ onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    title: '', description: '', location: '',
    date: '', startTime: '', endTime: '',
    scope: 'EMPRESA', sectorId: '', userIds: [],
  })

  const { data: sectors = [] } = useQuery({
    queryKey: ['events-lookup-sectors'],
    queryFn: eventsApi.lookupSectors,
  })
  const { data: users = [] } = useQuery({
    queryKey: ['events-lookup-users'],
    queryFn: eventsApi.lookupUsers,
    enabled: form.scope === 'USUARIO',
  })

  const mutation = useMutation({
    mutationFn: eventsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] })
      toast.success('Evento criado com sucesso!')
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.error ?? 'Erro ao criar evento'),
  })

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function toggleUser(id) {
    setForm(f => ({
      ...f,
      userIds: f.userIds.includes(id) ? f.userIds.filter(u => u !== id) : [...f.userIds, id],
    }))
  }

  function submit(e) {
    e.preventDefault()
    if (!form.date || !form.startTime || !form.endTime) {
      toast.error('Preencha data, hora início e hora fim.')
      return
    }
    const startAt = new Date(`${form.date}T${form.startTime}:00`).toISOString()
    const endAt   = new Date(`${form.date}T${form.endTime}:00`).toISOString()
    const payload = {
      title: form.title,
      description: form.description || undefined,
      location: form.location || undefined,
      startAt,
      endAt,
      scope: form.scope,
      sectorId: form.scope === 'SETOR' ? Number(form.sectorId) : undefined,
      userIds: form.scope === 'USUARIO' ? form.userIds : undefined,
    }
    mutation.mutate(payload)
  }

  const inputCls = 'border border-border rounded-md px-3 py-2 text-sm w-full bg-background text-foreground'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Novo Evento</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Título *</label>
            <Input value={form.title} onChange={e => set('title', e.target.value)} required placeholder="Título do evento" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Data *</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} required className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Início *</label>
              <input type="time" value={form.startTime} onChange={e => set('startTime', e.target.value)} required className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Fim *</label>
              <input type="time" value={form.endTime} onChange={e => set('endTime', e.target.value)} required className={inputCls} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Local</label>
            <Input value={form.location} onChange={e => set('location', e.target.value)} placeholder="Sala / link de reunião" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Descrição</label>
            <Textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} placeholder="Detalhes do evento" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Público *</label>
            <div className="flex gap-3">
              {[['EMPRESA','Toda a empresa'], ['SETOR','Setor'], ['USUARIO','Usuários específicos']].map(([v, l]) => (
                <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" name="scope" value={v} checked={form.scope === v} onChange={() => set('scope', v)} />
                  {l}
                </label>
              ))}
            </div>
          </div>

          {form.scope === 'SETOR' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Setor *</label>
              <select value={form.sectorId} onChange={e => set('sectorId', e.target.value)} required className={inputCls}>
                <option value="">Selecione um setor</option>
                {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {form.scope === 'USUARIO' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Usuários *</label>
              <div className="border border-border rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
                {users.map(u => (
                  <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/30 px-1 rounded">
                    <input type="checkbox" checked={form.userIds.includes(u.id)} onChange={() => toggleUser(u.id)} />
                    <span>{u.name}</span>
                    {u.sector && <span className="text-xs text-muted-foreground">({u.sector.name})</span>}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Criando...' : 'Criar Evento'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
