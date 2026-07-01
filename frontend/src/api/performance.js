import api from '@/lib/axios'

export const performanceApi = {
  summary: (params) => api.get('/api/performance/summary', { params }).then(r => r.data),
  drilldown: (id, params) => api.get(`/api/performance/users/${id}/drilldown`, { params }).then(r => r.data),
  volume: (params) => api.get('/api/performance/volume', { params }).then(r => r.data),
  byCategory: (from, to) => api.get('/api/performance/by-category', { params: { from, to } }).then(r => r.data),
  download: async (format, params) => {
    const response = await api.get('/api/performance/export', {
      params: { format, ...params },
      responseType: 'blob',
    })
    const url = URL.createObjectURL(response.data)
    const a = document.createElement('a')
    a.href = url
    a.download = `performance-${new Date().toISOString().slice(0, 10)}.${format}`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 100)
  },
}
