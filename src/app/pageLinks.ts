import { DEVELOPER_ROLE } from '../features/auth/authApi'
import { useAuthStore } from '../features/auth/authStore'

export interface PageLink {
  to: string
  label: string
}

/**
 * The pages the logged-in person can open, in menu order. Shared by the top
 * bar's links (md and up) and MobilePageTabs (below md), so the two never
 * offer different pages.
 */
export function usePageLinks(): PageLink[] {
  const role = useAuthStore((s) => s.session?.user.role ?? null)
  return [
    { to: '/rsi-ha', label: 'Screener' },
    { to: '/intraday', label: 'Intraday' },
    // User management: the developer and admins. The Master Trust login: the developer only.
    ...(role === DEVELOPER_ROLE || role === 'admin' ? [{ to: '/users', label: 'Users' }] : []),
    ...(role === DEVELOPER_ROLE ? [{ to: '/master-trust', label: 'Master Trust' }] : []),
  ]
}
