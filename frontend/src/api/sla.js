import api from '@/lib/axios'

export const slaApi = {
  list: () => api.get('/api/sla-config').then(r => r.data),
  update: (urgency, body) => api.patch(`/api/sla-config/${urgency}`, body).then(r => r.data),
}
