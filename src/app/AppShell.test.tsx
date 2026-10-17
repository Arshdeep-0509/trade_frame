import { render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AppShell } from './AppShell'
import { useAuthStore } from '../features/auth/authStore'
import { RsiHaPage } from '../pages'

function renderAppShell(initialPath: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { path: 'rsi-ha', element: <RsiHaPage /> },
          { path: 'intraday', element: <p>intraday</p> },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  )

  return render(<RouterProvider router={router} />)
}

describe('AppShell', () => {
  it('renders the top bar navigation tabs', () => {
    renderAppShell('/rsi-ha')

    expect(screen.getByRole('link', { name: 'RSI-HA' })).toBeInTheDocument()
  })

  it('renders the same panel destinations twice — the desktop icon rail and the <sm mobile chip strip', () => {
    renderAppShell('/rsi-ha')

    // jsdom doesn't evaluate the `hidden sm:flex` / `sm:hidden` CSS that
    // keeps only one of the two visible at any real viewport width, so both
    // are present in the DOM here — that's the point: Parameters and
    // Watchlists must stay reachable from either representation.
    expect(screen.getAllByRole('button', { name: 'Parameters' }).length).toBe(2)
    expect(screen.getAllByRole('button', { name: 'Watchlists' }).length).toBe(2)
    // The rail's "Screener" entry opens no panel; on phones the page tabs cover it, so the chip strip leaves it out.
    const [phoneChips, rail] = screen.getAllByRole('navigation', { name: 'Sections' })
    expect(phoneChips).toHaveClass('sm:hidden')
    expect(within(phoneChips).queryByRole('button', { name: 'Screener' })).toBeNull()
    expect(within(rail).getByRole('button', { name: 'Screener' })).toBeInTheDocument()
  })

  it('every page link is reachable at every width — the top bar (md and up) and the phone page tabs', () => {
    renderAppShell('/rsi-ha')

    const [topBar, phoneTabs] = screen.getAllByRole('navigation', { name: 'Pages' })
    for (const nav of [topBar, phoneTabs]) {
      expect(within(nav).getByRole('link', { name: 'Screener' })).toHaveAttribute('href', '/rsi-ha')
      expect(within(nav).getByRole('link', { name: 'Intraday' })).toHaveAttribute('href', '/intraday')
    }
    expect(phoneTabs).toHaveClass('md:hidden')
    expect(topBar).toHaveClass('md:flex')
  })

  it.each([
    ['user', ['Screener', 'Intraday']],
    ['admin', ['Screener', 'Intraday', 'Users']],
    ['super_admin', ['Screener', 'Intraday', 'Users', 'Master Trust']],
  ] as const)('a %s gets the page tabs their role allows on a phone', (role, expected) => {
    useAuthStore.setState({
      session: { accessToken: 't', tokenType: 'bearer', expiresAt: Date.now() + 60_000, user: { id: 1, role, email: 'a@b.co', phone: null, canCreateAdmins: false } },
    })
    renderAppShell('/rsi-ha')
    const phoneTabs = screen.getAllByRole('navigation', { name: 'Pages' })[1]
    expect(within(phoneTabs).getAllByRole('link').map((l) => l.textContent)).toEqual(expected)
    useAuthStore.setState({ session: null })
  })

  it("shows the screener's status bar and phone panel chips on the screener page only", () => {
    renderAppShell('/intraday')
    expect(screen.queryByText(/Universe:/)).not.toBeInTheDocument()
    // Only the desktop rail's "Sections" remains; the phone chip strip is the screener's.
    expect(screen.getAllByRole('navigation', { name: 'Sections' })).toHaveLength(1)
    expect(screen.getAllByRole('navigation', { name: 'Sections' })[0]).not.toHaveClass('sm:hidden')
    // Page tabs are on every page.
    expect(screen.getAllByRole('navigation', { name: 'Pages' })).toHaveLength(2)
  })

  it('renders the bottom status bar placeholders', () => {
    renderAppShell('/rsi-ha')

    expect(screen.getByText(/Universe:/)).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('renders page content for the active route', () => {
    renderAppShell('/rsi-ha')

    // The real SignalsTable is live here (backed by the real Master Trust
    // data source) — its filter bar renders immediately regardless of scan
    // state, so it's a stable thing to assert on without waiting on an
    // async scan to resolve.
    expect(screen.getByLabelText('Search symbol')).toBeInTheDocument()
  })

  it('labels the screener as real Master Trust data, never simulated', () => {
    renderAppShell('/rsi-ha')

    expect(screen.getByText('MASTER TRUST DATA')).toBeInTheDocument()
    expect(screen.getByText(/Market data from Master Trust/)).toBeInTheDocument()
    expect(screen.queryByText(/SIMULATED|Mock market data/i)).not.toBeInTheDocument()
  })
})
