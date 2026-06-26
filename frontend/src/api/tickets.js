import api from '@/lib/axios'

export const ticketsApi = {
  list: (params) => api.get('/api/tickets', { params }).then(r => r.data),
  get: (id) => api.get(`/api/tickets/${id}`).then(r => r.data),
  create: (body) => api.post('/api/tickets', body).then(r => r.data),
  update: (id, body) => api.patch(`/api/tickets/${id}`, body).then(r => r.data),
  reopen: (id) => api.post(`/api/tickets/${id}/reopen`).then(r => r.data),
  addComment: (id, body) => api.post(`/api/tickets/${id}/comments`, body).then(r => r.data),
  addAttachment: (id, file) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/api/tickets/${id}/attachments`, form).then(r => r.data)
  },
  downloadAttachment: async (ticketId, attachmentId, fileName) => {
    const response = await api.get(`/api/tickets/${ticketId}/attachments/${attachmentId}`, {
      responseType: 'blob',
    })
    const url = URL.createObjectURL(response.data)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  },
}
