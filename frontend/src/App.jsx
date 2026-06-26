import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom'
import { useEffect, useState, lazy, Suspense } from 'react'
import { authApi } from '@/api/auth'
import { setAccessToken } from '@/lib/axios'
import { useAuthStore } from '@/stores/authStore'
import ProtectedRoute from '@/components/ProtectedRoute'
import LoginPage from '@/pages/auth/LoginPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage'

function RootLayout() {
  const [ready, setReady] = useState(false)
  const setAuth = useAuthStore((s) => s.setAuth)
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    if (user) { setReady(true); return }
    const restore = async () => {
      try {
        const token = await authApi.refresh()
        setAccessToken(token)
        const profile = await authApi.me()
        setAuth(profile)
      } catch (_) {
        // Sem sessão válida — /login será mostrado pelo ProtectedRoute
      } finally {
        setReady(true)
      }
    }
    restore()
  }, [])

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Carregando...
      </div>
    )
  }

  return <Outlet />
}

const AppShell = lazy(() => import('@/components/layout/AppShell'))
const TicketListPage = lazy(() => import('@/pages/tickets/TicketListPage'))
const TicketDetailPage = lazy(() => import('@/pages/tickets/TicketDetailPage'))
const TicketNewPage = lazy(() => import('@/pages/tickets/TicketNewPage'))

const FallbackLoader = () => (
  <div className="min-h-screen flex items-center justify-center text-gray-400">Carregando...</div>
)

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password/:token', element: <ResetPasswordPage /> },
      {
        element: (
          <ProtectedRoute>
            <Suspense fallback={<FallbackLoader />}>
              <AppShell />
            </Suspense>
          </ProtectedRoute>
        ),
        children: [
          { path: 'tickets', element: <Suspense fallback={<FallbackLoader />}><TicketListPage /></Suspense> },
          { path: 'tickets/new', element: <Suspense fallback={<FallbackLoader />}><TicketNewPage /></Suspense> },
          { path: 'tickets/:id', element: <Suspense fallback={<FallbackLoader />}><TicketDetailPage /></Suspense> },
          { path: '/', element: <Suspense fallback={<FallbackLoader />}><TicketListPage /></Suspense> },
        ],
      },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
