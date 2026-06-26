import api from '@/lib/axios'

export const notificationsApi = {
  list: () => api.get('/api/notifications').then(r => r.data),
  markRead: (id) => api.patch(`/api/notifications/${id}/read`).then(r => r.data),
  markAllRead: () => api.patch('/api/notifications/read-all').then(r => r.data),
}
