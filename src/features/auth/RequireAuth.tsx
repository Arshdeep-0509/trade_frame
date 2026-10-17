import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { DEVELOPER_ROLE } from './authApi'
import { useAuthStore } from './authStore'

/** Sends logged-out visitors to /login (a developer who just logged out: /developer-login), remembering where they were headed. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation()
  const loggedIn = useAuthStore((s) => s.session !== null && s.isLoggedIn())
  const loginPath = useAuthStore((s) => (s.loggedOutRole === DEVELOPER_ROLE ? '/developer-login' : '/login'))

  if (!loggedIn) return <Navigate to={loginPath} replace state={{ from: location.pathname }} />
  return <>{children}</>
}
