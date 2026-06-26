import axios from 'axios'

let accessToken = null

export function setAccessToken(token) { accessToken = token }
export function getAccessToken() { return accessToken }
export function clearAccessToken() { accessToken = null }

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000',
  withCredentials: true,
})

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

let isRefreshing = false

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      if (!isRefreshing) {
        isRefreshing = true
        try {
          const { data } = await api.post('/api/auth/refresh')
          setAccessToken(data.accessToken)
          isRefreshing = false
          original.headers.Authorization = `Bearer ${data.accessToken}`
          return api(original)
        } catch {
          isRefreshing = false
          clearAccessToken()
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  }
)

export default api
