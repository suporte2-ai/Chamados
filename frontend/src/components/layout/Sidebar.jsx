import { NavLink } from 'react-router-dom'
import { useState } from 'react'
import { Ticket, PlusCircle, X, LayoutDashboard, BarChart2, Lightbulb, Settings, ChevronDown, ChevronUp } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'

const ADMIN_PERMISSIONS = ['manage_users', 'manage_categories', 'manage_sla']

const ADMIN_LINKS = [
  { to: '/admin/users', label: 'Usuários', perm: 'manage_users' },
  { to: '/admin/roles', label: 'Perfis', perm: 'manage_users' },
  { to: '/admin/categories', label: 'Categorias', perm: 'manage_categories' },
  { to: '/admin/sectors', label: 'Setores', perm: 'manage_categories' },
  { to: '/admin/sla', label: 'SLA', perm: 'manage_sla' },
]

function NavItem({ to, icon: Icon, label, exact, onClick }) {
  return (
    <NavLink
      to={to}
      end={exact}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
          isActive ? 'bg-primary text-primary-foreground' : 'text-gray-700 hover:bg-gray-100'
        )
      }
    >
      {Icon && <Icon className="h-4 w-4" />}
      {label}
    </NavLink>
  )
}

export default function Sidebar({ open, onClose }) {
  const permissions = useAuthStore((s) => s.permissions)
  const [adminOpen, setAdminOpen] = useState(false)
  const hasAnyAdmin = ADMIN_PERMISSIONS.some(p => permissions.has(p))

  const nav = (
    <nav className="p-4 space-y-1">
      <NavItem to="/" icon={LayoutDashboard} label="Dashboard" exact onClick={onClose} />
      <NavItem to="/tickets" icon={Ticket} label="Chamados" exact onClick={onClose} />
      <NavItem to="/tickets/new" icon={PlusCircle} label="Novo Chamado" onClick={onClose} />
      <NavItem to="/ideas" icon={Lightbulb} label="Ideias" onClick={onClose} />
      {permissions.has('view_performance_panel') && (
        <NavItem to="/performance" icon={BarChart2} label="Desempenho" onClick={onClose} />
      )}
      {hasAnyAdmin && (
        <div>
          <button
            onClick={() => setAdminOpen(v => !v)}
            className="flex items-center justify-between w-full px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            <span className="flex items-center gap-3">
              <Settings className="h-4 w-4" />
              Administração
            </span>
            {adminOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {adminOpen && (
            <div className="ml-7 mt-1 space-y-1">
              {ADMIN_LINKS.filter(l => permissions.has(l.perm)).map(l => (
                <NavItem key={l.to} to={l.to} label={l.label} onClick={onClose} />
              ))}
            </div>
          )}
        </div>
      )}
    </nav>
  )

  return (
    <>
      <aside className="hidden md:flex md:flex-col w-60 border-r bg-white shrink-0">
        <div className="h-16 flex items-center px-6 border-b font-bold text-lg">Helpdesk</div>
        {nav}
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={onClose} />
          <aside className="relative z-50 flex flex-col w-60 h-full bg-white shadow-xl">
            <div className="h-16 flex items-center justify-between px-6 border-b">
              <span className="font-bold text-lg">Helpdesk</span>
              <button onClick={onClose}><X className="h-5 w-5" /></button>
            </div>
            {nav}
          </aside>
        </div>
      )}
    </>
  )
}
