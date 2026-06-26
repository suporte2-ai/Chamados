import api, { setAccessToken, clearAccessToken } from '@/lib/axios'

export const authApi = {
  async login(email, password) {
    const { data } = await api.post('/api/auth/login', { email, password })
    setAccessToken(data.accessToken)
    return data
  },

  async logout() {
    try {
      await api.post('/api/auth/logout')
    } catch (_) {}
    clearAccessToken()
  },

  async forgotPassword(email) {
    await api.post('/api/auth/forgot-password', { email })
  },

  async resetPassword(token, password) {
    await api.post('/api/auth/reset-password', { token, password })
  },

  async refresh() {
    const { data } = await api.post('/api/auth/refresh')
    setAccessToken(data.accessToken)
    return data.accessToken
  },

  async me() {
    const { data } = await api.get('/api/auth/me')
    return data
  },
}
