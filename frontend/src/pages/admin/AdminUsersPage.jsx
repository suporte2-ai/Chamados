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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="font-semibold">{isEdit ? 'Editar Usuário' : 'Novo Usuário'}</h2>
        <div>
          <label className="block text-sm font-medium mb-1">Nome *</label>
          <Input value={form.name} onChange={e => set('name', e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">E-mail *</label>
          <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} />
        </div>
        {!isEdit && (
          <div>
            <label className="block text-sm font-medium mb-1">Senha *</label>
            <Input type="password" value={form.password} onChange={e => set('password', e.target.value)} />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium mb-1">Perfil *</label>
          <select value={form.roleId} onChange={e => set('roleId', e.target.value)} className="border rounded-md px-3 py-2 text-sm w-full">
            <option value="">Selecione...</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Setor *</label>
          <select value={form.sectorId} onChange={e => set('sectorId', e.target.value)} className="border rounded-md px-3 py-2 text-sm w-full">
            <option value="">Selecione...</option>
            {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {isEdit && (
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} />
            Ativo
          </label>
        )}
        <div className="flex gap-3 justify-end pt-2">
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
        <h1 className="text-xl font-semibold">Usuários</h1>
        <Button onClick={() => setModal({ user: null })}>+ Novo Usuário</Button>
      </div>
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['Nome', 'E-mail', 'Perfil', 'Setor', 'Status', 'Último acesso', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left font-medium text-gray-600 text-xs">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (
                  <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                ))}</tr>
              ))
              : users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{u.name}</td>
                  <td className="px-4 py-3 text-gray-500">{u.email}</td>
                  <td className="px-4 py-3 text-gray-500">{u.role?.name || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{u.sector?.name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {u.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{u.lastLoginAt ? formatDate(u.lastLoginAt) : '—'}</td>
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
