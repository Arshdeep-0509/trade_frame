import { API_BASE, messageFrom } from './authApi'
import { useAuthStore } from './authStore'

/**
 * fetch() for the market-data API: sends the logged-in user's token, and logs
 * them out if the server rejects it (expired, or signed with an old JWT_SECRET) —
 * RequireAuth then sends them to the login page.
 */
export const authFetch: typeof fetch = async (input, init) => {
  const token = useAuthStore.getState().session?.accessToken
  const headers = new Headers(init?.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(input, { ...init, headers })
  if (response.status === 401 && token && useAuthStore.getState().session?.accessToken === token) {
    useAuthStore.getState().logout()
  }
  return response
}

/** A JSON request to a logged-in endpoint; throws the server's own error message. */
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await authFetch(`${API_BASE}${path}`, init)
  } catch {
    throw new Error('Could not reach the server. Is the backend running?')
  }
  if (response.status === 204) return undefined as T
  const json: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new Error(messageFrom(json, response.status))
  return json as T
}
