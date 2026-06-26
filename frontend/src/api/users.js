import api from '@/lib/axios'

export const usersApi = {
  list: () => api.get('/api/users').then(r => r.data),
  create: (body) => api.post('/api/users', body).then(r => r.data),
  update: (id, body) => api.patch(`/api/users/${id}`, body).then(r => r.data),
  listSectors:  (id) => api.get(`/api/users/${id}/sectors`).then(r => r.data),
  addSector:    (id, body) => api.post(`/api/users/${id}/sectors`, body).then(r => r.data),
  updateSector: (id, sid, body) => api.patch(`/api/users/${id}/sectors/${sid}`, body).then(r => r.data),
  removeSector: (id, sid) => api.delete(`/api/users/${id}/sectors/${sid}`),
}
