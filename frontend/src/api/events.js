import api from '@/lib/axios'

export const eventsApi = {
  list:          (params) => api.get('/events', { params }).then(r => r.data),
  get:           (id)     => api.get(`/events/${id}`).then(r => r.data),
  create:        (data)   => api.post('/events', data).then(r => r.data),
  update:        (id, data) => api.patch(`/events/${id}`, data).then(r => r.data),
  delete:        (id)     => api.delete(`/events/${id}`).then(r => r.data),
  rsvp:          (id, rsvp) => api.patch(`/events/${id}/rsvp`, { rsvp }).then(r => r.data),
  lookupSectors: ()       => api.get('/events/lookup/sectors').then(r => r.data),
  lookupUsers:   ()       => api.get('/events/lookup/users').then(r => r.data),
}
