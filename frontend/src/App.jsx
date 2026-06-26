import { createBrowserRouter, RouterProvider, Outlet, Navigate } from 'react-router-dom'
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

const AppShell          = lazy(() => import('@/components/layout/AppShell'))
const TicketListPage    = lazy(() => import('@/pages/tickets/TicketListPage'))
const TicketDetailPage  = lazy(() => import('@/pages/tickets/TicketDetailPage'))
const TicketNewPage     = lazy(() => import('@/pages/tickets/TicketNewPage'))
const DashboardPage     = lazy(() => import('@/pages/DashboardPage'))
const PerformancePage   = lazy(() => import('@/pages/performance/PerformancePage'))
const IdeasListPage     = lazy(() => import('@/pages/ideas/IdeasListPage'))
const IdeaNewPage       = lazy(() => import('@/pages/ideas/IdeaNewPage'))
const IdeaDetailPage    = lazy(() => import('@/pages/ideas/IdeaDetailPage'))
const AdminLayout       = lazy(() => import('@/pages/admin/AdminLayout'))
const AdminUsersPage    = lazy(() => import('@/pages/admin/AdminUsersPage'))
const AdminRolesPage    = lazy(() => import('@/pages/admin/AdminRolesPage'))
const AdminRoleEditPage = lazy(() => import('@/pages/admin/AdminRoleEditPage'))
const AdminCategoriesPage = lazy(() => import('@/pages/admin/AdminCategoriesPage'))
const AdminSectorsPage  = lazy(() => import('@/pages/admin/AdminSectorsPage'))
const AdminSlaPage      = lazy(() => import('@/pages/admin/AdminSlaPage'))
const ProfilePage          = lazy(() => import('@/pages/ProfilePage'))
const ConfirmEmailChangePage = lazy(() => import('@/pages/auth/ConfirmEmailChangePage'))

const F = () => (
  <div className="min-h-screen flex items-center justify-center text-gray-400">Carregando...</div>
)

function AdminRedirect() {
  const permissions = useAuthStore((s) => s.permissions)
  if (permissions.has('manage_users')) return <Navigate to="/admin/users" replace />
  if (permissions.has('manage_categories')) return <Navigate to="/admin/categories" replace />
  if (permissions.has('manage_sla')) return <Navigate to="/admin/sla" replace />
  return <Navigate to="/admin/sectors" replace />
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password/:token', element: <ResetPasswordPage /> },
      { path: '/confirmar-email/:token', element: <ConfirmEmailChangePage /> },
      {
        element: (
          <ProtectedRoute>
            <Suspense fallback={<F />}><AppShell /></Suspense>
          </ProtectedRoute>
        ),
        children: [
          { path: '/',           element: <Suspense fallback={<F />}><DashboardPage /></Suspense> },
          { path: 'tickets',     element: <Suspense fallback={<F />}><TicketListPage /></Suspense> },
          { path: 'tickets/new', element: <Suspense fallback={<F />}><TicketNewPage /></Suspense> },
          { path: 'tickets/:id', element: <Suspense fallback={<F />}><TicketDetailPage /></Suspense> },
          {
            path: 'performance',
            element: (
              <ProtectedRoute permission="view_performance_panel">
                <Suspense fallback={<F />}><PerformancePage /></Suspense>
              </ProtectedRoute>
            ),
          },
          { path: 'ideas',     element: <Suspense fallback={<F />}><IdeasListPage /></Suspense> },
          { path: 'ideas/new', element: <Suspense fallback={<F />}><IdeaNewPage /></Suspense> },
          { path: 'ideas/:id', element: <Suspense fallback={<F />}><IdeaDetailPage /></Suspense> },
          { path: 'perfil', element: <Suspense fallback={<F />}><ProfilePage /></Suspense> },
          {
            path: 'admin',
            element: (
              <ProtectedRoute permission="manage_users">
                <Suspense fallback={<F />}><AdminLayout /></Suspense>
              </ProtectedRoute>
            ),
            children: [
              { index: true,        element: <AdminRedirect /> },
              { path: 'users',      element: <Suspense fallback={<F />}><AdminUsersPage /></Suspense> },
              { path: 'roles',      element: <Suspense fallback={<F />}><AdminRolesPage /></Suspense> },
              { path: 'roles/:id',  element: <Suspense fallback={<F />}><AdminRoleEditPage /></Suspense> },
              {
                path: 'categories',
                element: (
                  <ProtectedRoute permission="manage_categories">
                    <Suspense fallback={<F />}><AdminCategoriesPage /></Suspense>
                  </ProtectedRoute>
                ),
              },
              {
                path: 'sectors',
                element: (
                  <ProtectedRoute permission="manage_categories">
                    <Suspense fallback={<F />}><AdminSectorsPage /></Suspense>
                  </ProtectedRoute>
                ),
              },
              {
                path: 'sla',
                element: (
                  <ProtectedRoute permission="manage_sla">
                    <Suspense fallback={<F />}><AdminSlaPage /></Suspense>
                  </ProtectedRoute>
                ),
              },
            ],
          },
        ],
      },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
