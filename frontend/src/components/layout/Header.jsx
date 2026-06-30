import { useLocation, useNavigate } from 'react-router-dom'
import { Menu, Sun, Moon, Search } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import NotificationBell from './NotificationBell'
import { useAuth } from '@/hooks/useAuth'
import { UserAvatar } from '@/components/ui/user-avatar'

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

export default function Header({ onMenuClick, onSearchClick }) {
  const location = useLocation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()

  return (
    <header className="h-16 flex items-center justify-between px-4 border-b bg-background shrink-0">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenuClick}>
          <Menu className="h-5 w-5" />
        </Button>
        <span className="font-semibold text-sm text-foreground">{getBreadcrumb(location.pathname)}</span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onSearchClick}
          className="hidden sm:flex items-center gap-2 text-muted-foreground hover:text-foreground text-xs px-3"
        >
          <Search className="h-4 w-4" />
          <span>Buscar</span>
          <kbd className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px] ml-1">Ctrl+K</kbd>
        </Button>
        <Button variant="ghost" size="icon" className="sm:hidden" onClick={onSearchClick}>
          <Search className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title="Alternar tema"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2">
              <UserAvatar user={user} size="sm" />
              <span className="hidden sm:block text-sm">{user?.name}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <div className="px-3 py-2 text-sm text-muted-foreground">{user?.email}</div>
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
