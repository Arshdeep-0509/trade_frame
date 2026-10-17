import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MasterTrustPage } from '../../../pages/MasterTrustPage'
import type { AuthUser } from '../../auth/authApi'
import { useAuthStore } from '../../auth/authStore'

const DEVELOPER: AuthUser = { id: 1, role: 'super_admin', email: null, phone: '+919876543210', canCreateAdmins: true }

function logIn(user: AuthUser) {
  useAuthStore.getState().setSession({ accessToken: 'tok', tokenType: 'bearer', expiresAt: Date.now() + 60_000, user })
}

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/master-trust', element: <MasterTrustPage /> },
      { path: '/rsi-ha', element: <p>screener</p> },
    ],
    { initialEntries: ['/master-trust'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Answers by path; records every call. */
function mockApi(routes: Record<string, () => Response>) {
  const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
    const path = String(input)
    const handler = routes[path]
    return Promise.resolve(handler ? handler() : json(404, { detail: `no mock for ${path}` }))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState({ session: null, loggedOutRole: null })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MasterTrustPage', () => {
  it('is for the developer only — anyone else is sent to the screener', async () => {
    logIn({ id: 2, role: 'admin', email: 'a@b.co', phone: null, canCreateAdmins: false })
    const fetchMock = mockApi({})
    const router = renderPage()
    expect(await screen.findByText('screener')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/rsi-ha')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows when the Master Trust login has expired', async () => {
    logIn(DEVELOPER)
    mockApi({
      '/api/mastertrust/status': () =>
        json(200, { connected: true, savedAt: '2026-10-16T03:30:00Z', valid: false, detail: 'Master Trust returned HTTP 401 - log in again.' }),
    })
    renderPage()
    expect(await screen.findByText('Login expired')).toBeInTheDocument()
    expect(screen.getByText('Master Trust returned HTTP 401 - log in again.')).toBeInTheDocument()
  })

  it('connects with the pasted address, sending the developer token', async () => {
    logIn(DEVELOPER)
    const fetchMock = mockApi({
      '/api/mastertrust/status': () => json(200, { connected: false, savedAt: null, valid: null, detail: 'Not connected yet.' }),
      '/api/mastertrust/connect': () => json(200, { connected: true, savedAt: '2026-10-16T03:30:00Z', valid: true }),
    })
    renderPage()
    expect(await screen.findByText('Not connected')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Redirected address'), 'http://127.0.0.1/?code=ABC&state=xyz')
    await user.click(screen.getByRole('button', { name: 'Connect' }))

    expect(await screen.findByText('Connected')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Master Trust is connected')
    const [, init] = fetchMock.mock.calls.find(([url]) => String(url) === '/api/mastertrust/connect') ?? []
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ redirectUrl: 'http://127.0.0.1/?code=ABC&state=xyz' })
    expect(new Headers((init as RequestInit).headers).get('Authorization')).toBe('Bearer tok')
  })

  it("shows Master Trust's refusal", async () => {
    logIn(DEVELOPER)
    mockApi({
      '/api/mastertrust/status': () => json(200, { connected: false, savedAt: null, valid: null }),
      '/api/mastertrust/connect': () => json(502, { detail: 'Master Trust refused the code (codes work once and expire quickly - log in again): invalid_grant' }),
    })
    renderPage()
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Redirected address'), 'http://127.0.0.1/?code=OLD')
    await user.click(screen.getByRole('button', { name: 'Connect' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Master Trust refused the code')
  })

  it('asks for the address before calling the server', async () => {
    logIn(DEVELOPER)
    const fetchMock = mockApi({ '/api/mastertrust/status': () => json(200, { connected: false, savedAt: null, valid: null }) })
    renderPage()
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Connect' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Paste the address')
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(['/api/mastertrust/status'])
  })
})
