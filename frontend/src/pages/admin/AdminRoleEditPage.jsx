import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { rolesApi } from '@/api/roles'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const PERMISSION_LABELS = {
  manage_users: 'Gerenciar usuários',
  manage_roles: 'Gerenciar perfis (sem efeito no backend atual)',
  manage_categories: 'Gerenciar categorias',
  manage_sla: 'Gerenciar SLA',
  view_performance_panel: 'Ver painel de desempenho',
  view_financial_reports: 'Ver relatórios financeiros',
  reassign_tickets: 'Atribuir chamados',
  close_tickets: 'Fechar chamados',
  view_internal_notes: 'Ver notas internas',
  view_own_metrics: 'Ver próprias métricas',
  reopen_tickets: 'Reabrir chamados',
  view_all_tickets: 'Ver todos os chamados',
  view_sector_tickets: 'Ver chamados do setor',
  update_cost: 'Atualizar custo estimado',
  manage_ideas: 'Gerenciar ideias',
}

const FIELD_LABELS = {
  assigned_to: 'Atribuído a',
  estimated_cost: 'Custo estimado',
  internal_notes: 'Notas internas',
  sla_badge: 'Badge de SLA',
}

export default function AdminRoleEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: roles = [], isLoading } = useQuery({ queryKey: ['roles'], queryFn: rolesApi.list })
  const role = roles.find(r => String(r.id) === String(id))

  const [permissions, setPermissions] = useState({})
  const [fieldVis, setFieldVis] = useState({})
  const [saving, setSaving] = useState(false)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (role && !initialized) {
      const perms = {}
      for (const key of Object.keys(PERMISSION_LABELS)) {
        const existing = role.permissions?.find(p => p.permissionKey === key)
        perms[key] = existing?.enabled ?? false
      }
      const fields = {}
      for (const key of Object.keys(FIELD_LABELS)) {
        const existing = role.fieldVisibilities?.find(f => f.fieldKey === key)
        fields[key] = existing?.visible ?? false
      }
      setPermissions(perms)
      setFieldVis(fields)
      setInitialized(true)
    }
  }, [role, initialized])

  const handleSave = async () => {
    setSaving(true)
    try {
      const permUpdates = Object.entries(permissions).map(([permissionKey, enabled]) => ({ permissionKey, enabled }))
      const fieldUpdates = Object.entries(fieldVis).map(([fieldKey, visible]) => ({ fieldKey, visible }))

      const results = await Promise.allSettled([
        rolesApi.updatePermissions(Number(id), permUpdates),
        rolesApi.updateFieldVisibility(Number(id), fieldUpdates),
      ])

      const failed = results.filter(r => r.status === 'rejected')
      if (failed.length > 0) {
        toast.error('Falha ao salvar parte das configurações. Recarregando estado atual...')
        setInitialized(false)
        await qc.invalidateQueries({ queryKey: ['roles'] })
      } else {
        toast.success('Permissões salvas.')
        qc.invalidateQueries({ queryKey: ['roles'] })
      }
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!role) return <p className="text-muted-foreground">Perfil não encontrado.</p>

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/admin/roles')}
          className="text-muted-foreground hover:text-foreground transition-colors text-lg"
        >
          ←
        </button>
        <h1 className="text-xl font-semibold text-foreground">{role.name}</h1>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-medium text-sm text-foreground">Permissões</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {Object.entries(PERMISSION_LABELS).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm cursor-pointer py-1 text-foreground">
              <input
                type="checkbox"
                checked={permissions[key] ?? false}
                onChange={e => setPermissions(p => ({ ...p, [key]: e.target.checked }))}
                className="accent-blue-600"
              />
              <span className={key === 'manage_roles' ? 'text-muted-foreground' : ''}>{label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-medium text-sm text-foreground">Visibilidade de campos</h2>
        <div className="space-y-2">
          {Object.entries(FIELD_LABELS).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm cursor-pointer py-1 text-foreground">
              <input
                type="checkbox"
                checked={fieldVis[key] ?? false}
                onChange={e => setFieldVis(f => ({ ...f, [key]: e.target.checked }))}
                className="accent-blue-600"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar permissões'}</Button>
        <Button variant="outline" onClick={() => navigate('/admin/roles')}>Cancelar</Button>
      </div>
    </div>
  )
}
