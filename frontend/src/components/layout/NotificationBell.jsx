import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { useNotifications } from '@/hooks/useNotifications'
import { timeAgo } from '@/lib/utils'

const TYPE_ICONS = {
  TICKET_ASSIGNED: '🎫',
  TICKET_STATUS_CHANGED: '🔄',
  TICKET_COMMENT: '💬',
  IDEA_STATUS_CHANGED: '💡',
}

export default function NotificationBell() {
  const navigate = useNavigate()
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications()
  const recent = notifications.slice(0, 10)

  useEffect(() => {
    document.title = unreadCount > 0 ? `(${unreadCount}) Helpdesk` : 'Helpdesk'
  }, [unreadCount])

  const handleClick = (n) => {
    if (!n.isRead) markRead(n.id)
    if (n.link) navigate(n.link)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-medium">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 shadow-xl" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40 rounded-t-lg">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm text-foreground">Notificações</span>
            {unreadCount > 0 && (
              <span className="bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5 font-medium leading-none">
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead()}
              className="text-xs text-blue-600 hover:text-blue-500 hover:underline transition-colors"
            >
              Marcar todas
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto divide-y divide-border">
          {recent.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Bell className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhuma notificação</p>
            </div>
          ) : (
            recent.map((n) => (
              <div
                key={n.id}
                onClick={() => handleClick(n)}
                className={`flex gap-3 px-4 py-3 cursor-pointer transition-colors ${
                  !n.isRead
                    ? 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                    : 'hover:bg-muted/50'
                }`}
              >
                <span className="text-base mt-0.5 shrink-0">{TYPE_ICONS[n.type] || '🔔'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground line-clamp-2 leading-snug">{n.message}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(n.createdAt)}</p>
                </div>
                {!n.isRead && (
                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                )}
              </div>
            ))
          )}
        </div>
        {recent.length > 0 && (
          <div className="px-4 py-2 border-t border-border bg-muted/20 rounded-b-lg">
            <p className="text-xs text-muted-foreground text-center">
              {recent.length} de {notifications.length} notificações
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
