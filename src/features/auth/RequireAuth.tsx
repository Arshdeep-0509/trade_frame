import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './authStore'

/** Sends logged-out visitors to /login (a super admin who just logged out: /superadmin-login), remembering where they were headed. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation()
  const loggedIn = useAuthStore((s) => s.session !== null && s.isLoggedIn())
  const loginPath = useAuthStore((s) => (s.loggedOutRole === 'super_admin' ? '/superadmin-login' : '/login'))

  if (!loggedIn) return <Navigate to={loginPath} replace state={{ from: location.pathname }} />
  return <>{children}</>
}
