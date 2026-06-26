import { NavLink } from 'react-router-dom'
import { Ticket, PlusCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const links = [
  { to: '/tickets', icon: Ticket, label: 'Chamados', exact: true },
  { to: '/tickets/new', icon: PlusCircle, label: 'Novo Chamado' },
]

export default function Sidebar({ open, onClose }) {
  const nav = (
    <nav className="p-4 space-y-1">
      {links.map(({ to, icon: Icon, label, exact }) => (
        <NavLink
          key={to}
          to={to}
          end={exact}
          onClick={onClose}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-gray-700 hover:bg-gray-100'
            )
          }
        >
          <Icon className="h-4 w-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  )

  return (
    <>
      {/* Desktop */}
      <aside className="hidden md:flex md:flex-col w-60 border-r bg-white shrink-0">
        <div className="h-16 flex items-center px-6 border-b font-bold text-lg">Helpdesk</div>
        {nav}
      </aside>

      {/* Mobile drawer */}
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
