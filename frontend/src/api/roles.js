import api from '@/lib/axios'

export const rolesApi = {
  list: () => api.get('/api/roles').then(r => r.data),
  create: (body) => api.post('/api/roles', body).then(r => r.data),
  update: (id, body) => api.patch(`/api/roles/${id}`, body).then(r => r.data),
  remove: (id) => api.delete(`/api/roles/${id}`),
  updatePermissions: (id, updates) => api.patch(`/api/roles/${id}/permissions`, updates).then(r => r.data),
  updateFieldVisibility: (id, updates) => api.patch(`/api/roles/${id}/field-visibility`, updates).then(r => r.data),
}
