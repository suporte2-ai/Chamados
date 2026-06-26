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
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="font-medium text-sm">Notificações</span>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead()}
              className="text-xs text-blue-600 hover:underline"
            >
              Marcar todas como lidas
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {recent.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">Nenhuma notificação</p>
          ) : (
            recent.map((n) => (
              <div
                key={n.id}
                onClick={() => handleClick(n)}
                className={`flex gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 border-b last:border-0 ${!n.isRead ? 'bg-blue-50' : ''}`}
              >
                <span className="text-lg mt-0.5">{TYPE_ICONS[n.type] || '🔔'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 line-clamp-2">{n.message}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{timeAgo(n.createdAt)}</p>
                </div>
                {!n.isRead && <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
