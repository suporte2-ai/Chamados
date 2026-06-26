import api from '@/lib/axios'

export const ideasApi = {
  list: (params) => api.get('/api/ideas', { params }).then(r => r.data),
  get: (id) => api.get(`/api/ideas/${id}`).then(r => r.data),
  create: (body) => api.post('/api/ideas', body).then(r => r.data),
  updateStatus: (id, body) => api.patch(`/api/ideas/${id}/status`, body).then(r => r.data),
  toggleVote: (id) => api.post(`/api/ideas/${id}/vote`).then(r => r.data),
}
