import { Outlet, NavLink } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'

const ADMIN_NAV = [
  { to: '/admin/users',      label: 'Usuários',   perm: 'manage_users' },
  { to: '/admin/roles',      label: 'Perfis',     perm: 'manage_users' },
  { to: '/admin/categories', label: 'Categorias', perm: 'manage_categories' },
  { to: '/admin/sectors',    label: 'Setores',    perm: 'manage_categories' },
  { to: '/admin/sla',        label: 'SLA',        perm: 'manage_sla' },
]

export default function AdminLayout() {
  const permissions = useAuthStore((s) => s.permissions)

  return (
    <div className="flex gap-6">
      <nav className="w-44 shrink-0 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase px-3 mb-2">Administração</p>
        {ADMIN_NAV.filter(n => permissions.has(n.perm)).map(n => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) =>
              cn('block px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive ? 'bg-blue-600 text-white' : 'text-foreground hover:bg-muted/50')
            }
          >
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  )
}
