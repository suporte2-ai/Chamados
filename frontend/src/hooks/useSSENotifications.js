// frontend/src/hooks/useSSENotifications.js
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

const BACKEND_URL = import.meta.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:4000'

export function useSSENotifications() {
  const qc = useQueryClient()

  useEffect(() => {
    const es = new EventSource(`${BACKEND_URL}/api/notifications/stream`, {
      withCredentials: true,
    })

    es.addEventListener('notification', () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
    })

    es.onerror = () => {
      // Reconexão automática pelo browser após falha
    }

    return () => es.close()
  }, [qc])
}
