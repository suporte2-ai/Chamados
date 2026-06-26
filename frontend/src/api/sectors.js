import api from '@/lib/axios'

export const sectorsApi = {
  list: () => api.get('/api/sectors').then(r => r.data),
  create: (body) => api.post('/api/sectors', body).then(r => r.data),
}
