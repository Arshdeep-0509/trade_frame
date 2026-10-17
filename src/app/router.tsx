import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from './AppShell'
import { RequireAuth } from '../features/auth/RequireAuth'
import { LoginPage, DeveloperLoginPage } from '../pages/LoginPage'
import { MasterTrustPage } from '../pages/MasterTrustPage'
import { DeveloperRegisterPage } from '../pages/RegisterPage'
import { UserManagementPage } from '../pages/UserManagementPage'
// Direct, not via the pages barrel: the barrel also re-exports IntradayPage, which would pull it back into the startup chunk.
import { RsiHaPage } from '../pages/RsiHaPage'

/** /intraday loads on first visit: its analytics and panels stay out of the startup bundle (Layer 9 bundle budget). */
const IntradayPage = lazy(() => import('../pages/IntradayPage').then((m) => ({ default: m.IntradayPage })))

function RouteLoading() {
  return <div className="p-4 text-xs text-text-secondary" role="status">Loading…</div>
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  // No self-registration: accounts are created on /users. Old links land on the login page.
  { path: '/register', element: <Navigate to="/login" replace /> },
  { path: '/developer-login', element: <DeveloperLoginPage /> },
  { path: '/developer-register', element: <DeveloperRegisterPage /> },
  // Earlier addresses of the two pages above.
  { path: '/superadmin-login', element: <Navigate to="/developer-login" replace /> },
  { path: '/superadmin-register', element: <Navigate to="/developer-register" replace /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/rsi-ha" replace /> },
      { path: 'rsi-ha', element: <RsiHaPage /> },
      { path: 'master-trust', element: <MasterTrustPage /> },
      { path: 'users', element: <UserManagementPage /> },
      {
        path: 'intraday',
        element: (
          <Suspense fallback={<RouteLoading />}>
            <IntradayPage />
          </Suspense>
        ),
      },
      // Anything else falls back to the default page rather than a "coming soon" stub.
      { path: '*', element: <Navigate to="/rsi-ha" replace /> },
    ],
  },
])
