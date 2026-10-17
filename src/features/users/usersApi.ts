/** Client for mastertrust_intraday_api.py's /api/users/* (backend users.py) — the developer and admins. */
import { apiRequest } from '../auth/authFetch'

export type ManagedRole = 'admin' | 'user'

export interface ManagedUser {
  id: number
  role: ManagedRole
  email: string
  /** Admins only: may this admin create admins (granted by the developer). */
  canCreateAdmins: boolean
  /** ISO timestamp. */
  createdAt: string
  /** The creator's email (or the developer's phone); null once the creator is deleted. */
  createdBy: string | null
}

export interface UserList {
  /** Whether the person asking may create admins. */
  canCreateAdmins: boolean
  /** The accounts they manage: everyone for the developer, their own for an admin. */
  users: ManagedUser[]
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export function listUsers(): Promise<UserList> {
  return apiRequest<UserList>('/api/users')
}

export function createUser(body: { role: ManagedRole; email: string; password: string }): Promise<ManagedUser> {
  return apiRequest<ManagedUser>('/api/users', json('POST', body))
}

export function setCanCreateAdmins(id: number, canCreateAdmins: boolean): Promise<ManagedUser> {
  return apiRequest<ManagedUser>(`/api/users/${id}`, json('PATCH', { canCreateAdmins }))
}

export function resetPassword(id: number, password: string): Promise<void> {
  return apiRequest<void>(`/api/users/${id}/password`, json('POST', { password }))
}

export function deleteUser(id: number): Promise<void> {
  return apiRequest<void>(`/api/users/${id}`, { method: 'DELETE' })
}

/** A random 12-character password (no look-alike characters), for new accounts and resets. */
export function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}
