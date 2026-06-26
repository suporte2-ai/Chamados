import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { authApi } from '@/api/auth'
import { clearAccessToken } from '@/lib/axios'

export function useAuth() {
  const navigate = useNavigate()
  const { user, permissions, fieldVisibilities, setAuth, clear } = useAuthStore()

  const fieldVisible = (key) => fieldVisibilities.has(key)

  const logout = async () => {
    await authApi.logout()
    clearAccessToken()
    clear()
    navigate('/login', { replace: true })
  }

  return { user, permissions, fieldVisible, logout }
}
