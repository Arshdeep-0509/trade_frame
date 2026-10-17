/** Client for mastertrust_intraday_api.py's /api/mastertrust/* (backend mastertrust_login.py) — developer only. */
import { apiRequest } from '../auth/authFetch'

export interface MasterTrustStatus {
  connected: boolean
  /** ISO timestamp of the last connect from this page, or null (e.g. a token from the server's .env). */
  savedAt: string | null
  /** Whether Master Trust still accepts the token; null when there is none to check. */
  valid: boolean | null
  detail?: string | null
}

export function getMasterTrustStatus(): Promise<MasterTrustStatus> {
  return apiRequest<MasterTrustStatus>('/api/mastertrust/status')
}

export function getMasterTrustLoginUrl(): Promise<{ url: string; redirectUri: string }> {
  return apiRequest('/api/mastertrust/login-url')
}

/** `redirectUrl`: the address Master Trust redirected to after login (or just its `code`). */
export function connectMasterTrust(redirectUrl: string): Promise<MasterTrustStatus> {
  return apiRequest<MasterTrustStatus>('/api/mastertrust/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ redirectUrl }),
  })
}
