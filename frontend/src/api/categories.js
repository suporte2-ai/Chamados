import api from '@/lib/axios'

export const categoriesApi = {
  list: () => api.get('/api/categories').then(r => r.data),
  create: (body) => api.post('/api/categories', body).then(r => r.data),
  update: (id, body) => api.patch(`/api/categories/${id}`, body).then(r => r.data),
  remove: (id) => api.delete(`/api/categories/${id}`),
  createSubcategory: (categoryId, body) => api.post(`/api/categories/${categoryId}/subcategories`, body).then(r => r.data),
  removeSubcategory: (id) => api.delete(`/api/subcategories/${id}`),
}
