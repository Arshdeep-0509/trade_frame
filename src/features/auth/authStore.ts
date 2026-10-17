import { create } from 'zustand'
import { loadVersioned, removeVersioned, saveVersioned } from '../../lib/persistence'
import type { AuthSession, Role } from './authApi'

const SESSION_KEY = 'rsi-ha:auth-session'
const SESSION_VERSION = 1

function isLive(session: AuthSession | null): session is AuthSession {
  return session !== null && typeof session.accessToken === 'string' && session.expiresAt > Date.now()
}

function loadSession(): AuthSession | null {
  const session = loadVersioned<AuthSession>(SESSION_KEY, SESSION_VERSION, () => null)
  return isLive(session) ? session : null
}

interface AuthState {
  session: AuthSession | null
  /** Set on logout, so RequireAuth can send a logged-out super admin back to /superadmin-login. */
  loggedOutRole: Role | null
  setSession: (session: AuthSession) => void
  logout: () => void
  /** False once the token's expiry has passed, even if the session is still in state. */
  isLoggedIn: () => boolean
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  session: loadSession(),
  loggedOutRole: null,
  setSession(session) {
    saveVersioned(SESSION_KEY, SESSION_VERSION, session)
    set({ session, loggedOutRole: null })
  },
  logout() {
    removeVersioned(SESSION_KEY)
    set({ session: null, loggedOutRole: get().session?.user.role ?? null })
  },
  isLoggedIn() {
    return isLive(get().session)
  },
}))
