/** Client for mastertrust_intraday_api.py's /api/auth/* endpoints (backend auth.py). */

export type Role = 'super_admin' | 'admin' | 'user'

export interface AuthUser {
  id: number
  role: Role
  email: string | null
  phone: string | null
  /** Always true for the super admin; for an admin, granted by the super admin. */
  canCreateAdmins: boolean
}

export interface AuthSession {
  accessToken: string
  tokenType: string
  /** Epoch milliseconds. */
  expiresAt: number
  user: AuthUser
}

/** Super admin setup only — admins and users are created on the User management page. */
export type RegisterBody = { phone: string; password: string }

export type LoginBody = { phone: string; password: string } | { email: string; password: string }

/** The backend's address: '' locally (Vite proxies /api), the Render URL when deployed. */
export const API_BASE = (import.meta.env.VITE_INTRADAY_API_BASE ?? '').replace(/\/$/, '')

/** FastAPI errors: `detail` is a string (HTTPException) or a list of `{ msg }` (validation). */
export function messageFrom(body: unknown, status: number): string {
  const detail = typeof body === 'object' && body !== null ? (body as { detail?: unknown }).detail : undefined
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const first: unknown = detail[0]
    if (typeof first === 'object' && first !== null && typeof (first as { msg?: unknown }).msg === 'string') {
      return (first as { msg: string }).msg.replace(/^Value error, /, '')
    }
  }
  return status >= 500 ? 'The server is unavailable. Is the backend running?' : `Request failed (HTTP ${status}).`
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('Could not reach the server. Is the backend running?')
  }
  const json: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new Error(messageFrom(json, response.status))
  return json as T
}

export function login(body: LoginBody): Promise<AuthSession> {
  return post<AuthSession>('/api/auth/login', body)
}

export function register(body: RegisterBody): Promise<AuthSession> {
  return post<AuthSession>('/api/auth/register', body)
}
