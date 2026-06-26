import api from '@/lib/axios'

export const usersApi = {
  list: () => api.get('/api/users').then(r => r.data),
  create: (body) => api.post('/api/users', body).then(r => r.data),
  update: (id, body) => api.patch(`/api/users/${id}`, body).then(r => r.data),
}
