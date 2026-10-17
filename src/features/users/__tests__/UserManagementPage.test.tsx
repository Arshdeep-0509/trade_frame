import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserManagementPage } from '../../../pages/UserManagementPage'
import type { AuthUser } from '../../auth/authApi'
import { useAuthStore } from '../../auth/authStore'
import type { ManagedUser, UserList } from '../usersApi'

const DEVELOPER: AuthUser = { id: 1, role: 'super_admin', email: null, phone: '+919876543210', canCreateAdmins: true }
const ADMIN: AuthUser = { id: 2, role: 'admin', email: 'admin1@x.co', phone: null, canCreateAdmins: false }

function logIn(user: AuthUser) {
  useAuthStore.getState().setSession({ accessToken: 'tok', tokenType: 'bearer', expiresAt: Date.now() + 60_000, user })
}

const account = (overrides: Partial<ManagedUser>): ManagedUser => ({
  id: 10,
  role: 'user',
  email: 'u1@x.co',
  canCreateAdmins: false,
  createdAt: '2026-10-16T05:00:00Z',
  createdBy: 'admin1@x.co',
  ...overrides,
})

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** A tiny in-memory /api/users backend. */
function fakeBackend(initial: UserList) {
  const state = { ...initial, users: [...initial.users] }
  const calls: { method: string; path: string; body: unknown }[] = []
  let nextId = 100
  let failNext: Response | null = null
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      const method = init?.method ?? 'GET'
      const body: unknown = init?.body ? JSON.parse(init.body as string) : undefined
      calls.push({ method, path, body })
      if (failNext) {
        const r = failNext
        failNext = null
        return Promise.resolve(r)
      }
      if (method === 'GET' && path === '/api/users') return Promise.resolve(json(200, state))
      if (method === 'POST' && path === '/api/users') {
        const b = body as { role: 'admin' | 'user'; email: string }
        const created = account({ id: nextId++, role: b.role, email: b.email })
        state.users = [created, ...state.users]
        return Promise.resolve(json(201, created))
      }
      const match = /^\/api\/users\/(\d+)(\/password)?$/.exec(path)
      if (match) {
        const id = Number(match[1])
        if (method === 'DELETE') {
          state.users = state.users.filter((u) => u.id !== id)
          return Promise.resolve(json(204))
        }
        if (method === 'POST' && match[2]) return Promise.resolve(json(204))
        if (method === 'PATCH') {
          const updated = { ...state.users.find((u) => u.id === id)!, ...(body as object) }
          state.users = state.users.map((u) => (u.id === id ? updated : u))
          return Promise.resolve(json(200, updated))
        }
      }
      return Promise.resolve(json(404, { detail: `no mock for ${method} ${path}` }))
    }),
  )
  return {
    calls,
    failNextWith(response: Response) {
      failNext = response
    },
  }
}

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/users', element: <UserManagementPage /> },
      { path: '/rsi-ha', element: <p>screener</p> },
    ],
    { initialEntries: ['/users'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState({ session: null, loggedOutRole: null })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('UserManagementPage', () => {
  it('has no user management for users — they are sent to the screener', async () => {
    logIn({ id: 3, role: 'user', email: 'u@x.co', phone: null, canCreateAdmins: false })
    const backend = fakeBackend({ canCreateAdmins: false, users: [] })
    const router = renderPage()
    expect(await screen.findByText('screener')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/rsi-ha')
    expect(backend.calls).toEqual([])
  })

  it('an admin without permission creates users only, and gets the login details to send', async () => {
    logIn(ADMIN)
    const backend = fakeBackend({ canCreateAdmins: false, users: [] })
    renderPage()
    expect(await screen.findByText('No accounts yet. Create one above.')).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Admin' })).not.toBeInTheDocument()
    expect(screen.getByText(/Creating admins needs the developer's permission/)).toBeInTheDocument()

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email'), 'new.user@x.co')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Create user' }))

    const card = await screen.findByRole('status')
    expect(card).toHaveTextContent('Account created — send these login details to new.user@x.co')
    expect(card).toHaveTextContent('Email: new.user@x.co')
    expect(card).toHaveTextContent('Password: secret123')
    expect(backend.calls.find((c) => c.method === 'POST')?.body).toEqual({ role: 'user', email: 'new.user@x.co', password: 'secret123' })
    expect(within(screen.getByRole('table', { name: 'Accounts' })).getByText('new.user@x.co')).toBeInTheDocument()
    // Admins don't see the developer's columns.
    expect(screen.queryByRole('columnheader', { name: 'Created by' })).not.toBeInTheDocument()
  })

  it('an admin with permission can create admins', async () => {
    logIn(ADMIN)
    const backend = fakeBackend({ canCreateAdmins: true, users: [] })
    renderPage()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('radio', { name: 'Admin' }))
    await user.type(screen.getByLabelText('Email'), 'admin3@x.co')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await user.click(screen.getByRole('button', { name: 'Create admin' }))

    await screen.findByRole('status')
    const sent = backend.calls.find((c) => c.method === 'POST')?.body as { role: string; password: string }
    expect(sent.role).toBe('admin')
    expect(sent.password).toMatch(/^[A-Za-z0-9]{12}$/)
  })

  it('the developer sees who created each account and grants "can create admins"', async () => {
    logIn(DEVELOPER)
    const backend = fakeBackend({
      canCreateAdmins: true,
      users: [account({ id: 20, role: 'admin', email: 'admin1@x.co', createdBy: '+919876543210' }), account({ id: 21 })],
    })
    renderPage()
    expect(await screen.findByRole('columnheader', { name: 'Created by' })).toBeInTheDocument()
    expect(screen.getByText('+919876543210')).toBeInTheDocument()
    // Only admins get the permission switch.
    expect(screen.getAllByRole('switch')).toHaveLength(1)

    await userEvent.setup().click(screen.getByRole('switch', { name: 'admin1@x.co can create admins' }))
    expect(await screen.findByRole('switch', { name: 'admin1@x.co can create admins' })).toHaveAttribute('aria-checked', 'true')
    expect(backend.calls.find((c) => c.method === 'PATCH')).toEqual({ method: 'PATCH', path: '/api/users/20', body: { canCreateAdmins: true } })
  })

  it('puts the permission switch back if the server refuses', async () => {
    logIn(DEVELOPER)
    const backend = fakeBackend({ canCreateAdmins: true, users: [account({ id: 22, role: 'admin', email: 'admin1@x.co' })] })
    renderPage()
    const toggle = await screen.findByRole('switch', { name: 'admin1@x.co can create admins' })
    backend.failNextWith(json(403, { detail: 'Only the developer can change permissions.' }))
    await userEvent.setup().click(toggle)
    expect(await screen.findByRole('alert')).toHaveTextContent('Only the developer can change permissions.')
    expect(screen.getByRole('switch', { name: 'admin1@x.co can create admins' })).toHaveAttribute('aria-checked', 'false')
  })

  it('resets a password and shows the new one to send', async () => {
    logIn(ADMIN)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const backend = fakeBackend({ canCreateAdmins: false, users: [account({ id: 30 })] })
    renderPage()
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Reset password for u1@x.co' }))

    const card = await screen.findByRole('status')
    expect(card).toHaveTextContent('Password reset — send these login details to u1@x.co')
    const sent = backend.calls.find((c) => c.path === '/api/users/30/password')?.body as { password: string }
    expect(card).toHaveTextContent(`Password: ${sent.password}`)
  })

  it('deletes an account after confirming', async () => {
    logIn(ADMIN)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const backend = fakeBackend({ canCreateAdmins: false, users: [account({ id: 40 })] })
    renderPage()
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Delete u1@x.co' }))

    expect(await screen.findByText('No accounts yet. Create one above.')).toBeInTheDocument()
    expect(confirm).toHaveBeenCalledOnce()
    expect(backend.calls.some((c) => c.method === 'DELETE' && c.path === '/api/users/40')).toBe(true)
  })

  it('does nothing when the delete is cancelled', async () => {
    logIn(ADMIN)
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const backend = fakeBackend({ canCreateAdmins: false, users: [account({ id: 41 })] })
    renderPage()
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Delete u1@x.co' }))
    expect(screen.getByText('u1@x.co')).toBeInTheDocument()
    expect(backend.calls.some((c) => c.method === 'DELETE')).toBe(false)
  })

  it("shows the server's error (e.g. the email is taken)", async () => {
    logIn(ADMIN)
    const backend = fakeBackend({ canCreateAdmins: false, users: [] })
    renderPage()
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Email'), 'u1@x.co')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    backend.failNextWith(json(409, { detail: 'An account with this email already exists.' }))
    await user.click(screen.getByRole('button', { name: 'Create user' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('An account with this email already exists.')
  })

  it('asks for an email and password before calling the server', async () => {
    logIn(ADMIN)
    const backend = fakeBackend({ canCreateAdmins: false, users: [] })
    renderPage()
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Create user' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an email and a password')
    expect(backend.calls.filter((c) => c.method === 'POST')).toEqual([])
  })
})
