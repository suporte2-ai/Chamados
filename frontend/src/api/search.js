// frontend/src/api/search.js
import api from '@/lib/axios'

export const searchApi = {
  search: (q) => api.get('/api/search', { params: { q } }).then(r => r.data),
}
