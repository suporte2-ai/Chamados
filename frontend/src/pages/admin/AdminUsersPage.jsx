import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { usersApi } from '@/api/users'
import { rolesApi } from '@/api/roles'
import { sectorsApi } from '@/api/sectors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/utils'

const selectCls = 'border border-border rounded px-1 py-0.5 text-xs bg-background text-foreground disabled:opacity-50'

function UserSectors({ userId, sectors, primarySectorId }) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [newSectorId, setNewSectorId] = useState('')
  const [newType, setNewType] = useState('member')
  const [saving, setSaving] = useState(false)
  const [removingId, setRemovingId] = useState(null)
  const [changingId, setChangingId] = useState(null)

  const { data: sectorData } = useQuery({
    queryKey: ['user-sectors', userId],
    queryFn: () => usersApi.listSectors(userId),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['user-sectors', userId] })

  const available = (sectors || []).filter(
    s => s.id !== primarySectorId && !(sectorData?.sectors || []).find(us => us.id === s.id)
  )

  const handleAdd = async () => {
    if (!newSectorId) return
    setSaving(true)
    try {
      await usersApi.addSector(userId, { sectorId: Number(newSectorId), type: newType })
      setAdding(false)
      setNewSectorId('')
      setNewType('member')
      invalidate()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao adicionar setor.')
    } finally {
      setSaving(false)
    }
  }

  const handleTypeChange = async (sectorId, type) => {
    setChangingId(sectorId)
    try {
      await usersApi.updateSector(userId, sectorId, { type })
      invalidate()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao alterar tipo.')
    } finally {
      setChangingId(null)
    }
  }

  const handleRemove = async (sectorId) => {
    setRemovingId(sectorId)
    try {
      await usersApi.removeSector(userId, sectorId)
      invalidate()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao remover setor.')
    } finally {
      setRemovingId(null)
    }
  }

  const linked = sectorData?.sectors || []

  return (
    <div className="pt-1 space-y-1">
      {linked.map(us => (
        <div key={us.id} className="flex items-center gap-2 text-xs">
          <span className="text-foreground">{us.name}</span>
          <select
            value={us.type}
            onChange={e => handleTypeChange(us.id, e.target.value)}
            disabled={changingId === us.id}
            className={selectCls}
          >
            <option value="member">membro</option>
            <option value="extra">extra</option>
          </select>
          <button
            onClick={() => handleRemove(us.id)}
            disabled={removingId === us.id}
            className="text-red-400 hover:text-red-500 text-xs disabled:opacity-50"
          >
            ×
          </button>
        </div>
      ))}

      {adding ? (
        <div className="flex items-center gap-2 text-xs">
          <select
            value={newSectorId}
            onChange={e => setNewSectorId(e.target.value)}
            className={selectCls}
          >
            <option value="">Setor...</option>
            {available.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select
            value={newType}
            onChange={e => setNewType(e.target.value)}
            className={selectCls}
          >
            <option value="member">membro</option>
            <option value="extra">extra</option>
          </select>
          <button
            onClick={handleAdd}
            disabled={saving || !newSectorId}
            className="text-blue-600 hover:underline disabled:opacity-50"
          >
            Adicionar
          </button>
          <button onClick={() => setAdding(false)} className="text-muted-foreground hover:text-foreground">cancelar</button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          disabled={!sectorData}
          className="text-blue-500 hover:underline text-xs disabled:opacity-50"
        >
          + Adicionar setor
        </button>
      )}
    </div>
  )
}

function UserModal({ user, roles, sectors, onClose, onSave }) {
  const isEdit = !!user
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    password: '',
    roleId: user?.roleId || '',
    sectorId: user?.sectorId || '',
    active: user?.active ?? true,
  })
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.name || !form.email || !form.roleId || !form.sectorId || (!isEdit && !form.password)) {
      toast.error('Preencha todos os campos obrigatórios.')
      return
    }
    setLoading(true)
    try {
      const body = {
        name: form.name,
        email: form.email,
        roleId: Number(form.roleId),
        sectorId: Number(form.sectorId),
      }
      if (!isEdit) body.password = form.password
      if (isEdit) body.active = form.active
      await onSave(body)
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar.')
    } finally {
      setLoading(false)
    }
  }

  const modalSelectCls = 'border border-border rounded-md px-3 py-2 text-sm w-full bg-background text-foreground'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="font-semibold text-foreground">{isEdit ? 'Editar Usuário' : 'Novo Usuário'}</h2>
        <div>
          <label className="block text-sm font-medium mb-1 text-foreground">Nome *</label>
          <Input value={form.name} onChange={e => set('name', e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-foreground">E-mail *</label>
          <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} />
        </div>
        {!isEdit && (
          <div>
            <label className="block text-sm font-medium mb-1 text-foreground">Senha *</label>
            <Input type="password" value={form.password} onChange={e => set('password', e.target.value)} />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium mb-1 text-foreground">Perfil *</label>
          <select value={form.roleId} onChange={e => set('roleId', e.target.value)} className={modalSelectCls}>
            <option value="">Selecione...</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-foreground">Setor *</label>
          <select value={form.sectorId} onChange={e => set('sectorId', e.target.value)} className={modalSelectCls}>
            <option value="">Selecione...</option>
            {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {isEdit && (
          <label className="flex items-center gap-2 text-sm cursor-pointer text-foreground">
            <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} />
            Ativo
          </label>
        )}
        <div className="flex gap-3 justify-end pt-2 border-t border-border">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</Button>
        </div>
      </div>
    </div>
  )
}

export default function AdminUsersPage() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(null)

  const { data: users = [], isLoading } = useQuery({ queryKey: ['admin-users'], queryFn: usersApi.list })
  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: rolesApi.list })
  const { data: sectors = [] } = useQuery({ queryKey: ['sectors'], queryFn: sectorsApi.list })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-users'] })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Usuários</h1>
        <Button onClick={() => setModal({ user: null })}>+ Novo Usuário</Button>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              {['Nome', 'E-mail', 'Perfil', 'Setor', 'Status', 'Último acesso', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left font-medium text-muted-foreground text-xs">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (
                  <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                ))}</tr>
              ))
              : users.map(u => (
                <tr key={u.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{u.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.role?.name || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <div className="text-foreground">
                      {u.sector?.name || '—'}
                      <span className="text-xs text-muted-foreground ml-1">(principal)</span>
                    </div>
                    <UserSectors userId={u.id} sectors={sectors} primarySectorId={u.sectorId} />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      u.active
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                    }`}>
                      {u.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.lastLoginAt ? formatDate(u.lastLoginAt) : '—'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => setModal({ user: u })} className="text-blue-600 hover:underline text-xs">Editar</button>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      {modal && (
        <UserModal
          user={modal.user}
          roles={roles}
          sectors={sectors}
          onClose={() => setModal(null)}
          onSave={async (body) => {
            if (modal.user) {
              await usersApi.update(modal.user.id, body)
              toast.success('Usuário atualizado.')
            } else {
              await usersApi.create(body)
              toast.success('Usuário criado.')
            }
            invalidate()
          }}
        />
      )}
    </div>
  )
}
