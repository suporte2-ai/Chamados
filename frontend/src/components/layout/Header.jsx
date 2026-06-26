import { useLocation, useNavigate } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import NotificationBell from './NotificationBell'
import { useAuth } from '@/hooks/useAuth'

const BREADCRUMBS = {
  '/tickets': 'Chamados',
  '/tickets/new': 'Novo Chamado',
  '/perfil': 'Meu Perfil',
}

function getBreadcrumb(pathname) {
  if (BREADCRUMBS[pathname]) return BREADCRUMBS[pathname]
  if (pathname.match(/^\/tickets\/\d+$/)) return 'Detalhe do Chamado'
  return 'Helpdesk'
}

export default function Header({ onMenuClick }) {
  const location = useLocation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const initials = user?.name
    ? user.name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()
    : '?'

  return (
    <header className="h-16 flex items-center justify-between px-4 border-b bg-white shrink-0">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenuClick}>
          <Menu className="h-5 w-5" />
        </Button>
        <span className="font-medium text-gray-700">{getBreadcrumb(location.pathname)}</span>
      </div>
      <div className="flex items-center gap-2">
        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <span className="hidden sm:block text-sm">{user?.name}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <div className="px-3 py-2 text-sm text-gray-500">{user?.email}</div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/perfil')} className="cursor-pointer">
              Meu perfil
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-red-600 cursor-pointer">
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
