import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Navigate, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginPage, SuperAdminLoginPage } from '../../../pages/LoginPage'
import { SuperAdminRegisterPage } from '../../../pages/RegisterPage'
import type { AuthSession } from '../authApi'
import { authFetch } from '../authFetch'
import { useAuthStore } from '../authStore'
import { RequireAuth } from '../RequireAuth'

const session = (overrides: Partial<AuthSession> = {}): AuthSession => ({
  accessToken: 'token-123',
  tokenType: 'bearer',
  expiresAt: Date.now() + 60_000,
  user: { id: 1, role: 'user', email: 'a@b.co', phone: null, canCreateAdmins: false },
  ...overrides,
})

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <Navigate to="/login" replace /> },
      { path: '/superadmin-login', element: <SuperAdminLoginPage /> },
      { path: '/superadmin-register', element: <SuperAdminRegisterPage /> },
      {
        path: '/rsi-ha',
        element: (
          <RequireAuth>
            <p>screener</p>
          </RequireAuth>
        ),
      },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return router
}

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>): unknown {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit
  return JSON.parse(init.body as string)
}

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState({ session: null, loggedOutRole: null })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RequireAuth', () => {
  it('sends a logged-out visitor to /login', async () => {
    const router = renderAt('/rsi-ha')
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('lets a logged-in user through', () => {
    useAuthStore.getState().setSession(session())
    renderAt('/rsi-ha')
    expect(screen.getByText('screener')).toBeInTheDocument()
  })

  it('sends a super admin who logs out back to /superadmin-login', async () => {
    useAuthStore.getState().setSession(session({ user: { id: 9, role: 'super_admin', email: null, phone: '+919876543210', canCreateAdmins: true } }))
    const router = renderAt('/rsi-ha')
    useAuthStore.getState().logout()
    expect(await screen.findByRole('heading', { name: 'Super admin log in' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/superadmin-login')
  })

  it('treats an expired session as logged out', async () => {
    useAuthStore.setState({ session: session({ expiresAt: Date.now() - 1 }) })
    renderAt('/rsi-ha')
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
  })
})

describe('LoginPage', () => {
  it('logs in by email, stores the session and returns to the page the user was headed to', async () => {
    const fetchMock = mockFetch(200, session())
    const router = renderAt('/rsi-ha')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Email'), 'a@b.co')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByText('screener')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/rsi-ha')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/login')
    expect(sentBody(fetchMock)).toEqual({ email: 'a@b.co', password: 'secret123' })
    expect(JSON.parse(localStorage.getItem('rsi-ha:auth-session') ?? 'null')).toMatchObject({ data: { accessToken: 'token-123' } })
  })

  it('offers email only — no phone or super admin option', () => {
    renderAt('/login')
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.queryByLabelText('Phone number')).not.toBeInTheDocument()
    expect(screen.queryByText(/super admin/i)).not.toBeInTheDocument()
  })

  it('/superadmin-login logs the super admin in by phone number', async () => {
    const fetchMock = mockFetch(200, session())
    renderAt('/superadmin-login')
    const user = userEvent.setup()

    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Phone number'), '+919876543210')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    await screen.findByText('screener')
    expect(sentBody(fetchMock)).toEqual({ phone: '+919876543210', password: 'secret123' })
  })

  it("shows the server's error message on bad credentials", async () => {
    mockFetch(401, { detail: 'Incorrect credentials.' })
    renderAt('/login')
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Email'), 'a@b.co')
    await user.type(screen.getByLabelText('Password'), 'wrongpass')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect credentials.')
    expect(useAuthStore.getState().session).toBeNull()
  })

  it('asks for both fields before calling the server', async () => {
    const fetchMock = mockFetch(200, session())
    renderAt('/login')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Log in' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Enter your email and password.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('says so when the backend is not reachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    renderAt('/login')
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Email'), 'a@b.co')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server')
  })
})

describe('registration', () => {
  it('/register (no self-registration any more) sends people to the login page', async () => {
    const router = renderAt('/register')
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(screen.getByText('No account? Ask your admin for your login details.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Register' })).not.toBeInTheDocument()
  })

  it('/superadmin-register registers the super admin by phone number', async () => {
    const fetchMock = mockFetch(201, session())
    renderAt('/superadmin-register')
    const user = userEvent.setup()

    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Phone number'), '+919876543210')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.type(screen.getByLabelText('Confirm password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Register' }))

    await screen.findByText('screener')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/register')
    expect(sentBody(fetchMock)).toEqual({ phone: '+919876543210', password: 'secret123' })
  })

  it('catches mismatched and short passwords before calling the server', async () => {
    const fetchMock = mockFetch(201, session())
    renderAt('/superadmin-register')
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Phone number'), '+919876543210')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Register' }))
    expect(screen.getByRole('alert')).toHaveTextContent('at least 8 characters')

    await user.type(screen.getByLabelText('Password'), '-and-long')
    await user.type(screen.getByLabelText('Confirm password'), 'different1')
    await user.click(screen.getByRole('button', { name: 'Register' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("shows FastAPI's validation message, not the raw error list", async () => {
    mockFetch(422, { detail: [{ type: 'value_error', loc: ['body', 'phone'], msg: 'Value error, Enter a valid phone number.' }] })
    renderAt('/superadmin-register')
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Phone number'), '12')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.type(screen.getByLabelText('Confirm password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Register' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/^Enter a valid phone number\.$/)
  })
})

describe('authFetch (market-data requests)', () => {
  it("sends the logged-in user's token", async () => {
    const fetchMock = mockFetch(200, {})
    useAuthStore.getState().setSession(session())
    await authFetch('/api/candles?token=1')
    const headers = new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers)
    expect(headers.get('Authorization')).toBe('Bearer token-123')
  })

  it('sends no Authorization header when logged out', async () => {
    const fetchMock = mockFetch(200, {})
    await authFetch('/api/candles?token=1')
    const headers = new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers)
    expect(headers.has('Authorization')).toBe(false)
  })

  it('logs the user out when the server rejects the token', async () => {
    mockFetch(401, { detail: 'Session expired or invalid. Log in again.' })
    useAuthStore.getState().setSession(session())
    const response = await authFetch('/api/candles?token=1')
    expect(response.status).toBe(401)
    expect(useAuthStore.getState().session).toBeNull()
  })
})
