import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AppShell } from './AppShell'
import { RsiHaPage } from '../pages'

function renderAppShell(initialPath: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppShell />,
        children: [{ path: 'rsi-ha', element: <RsiHaPage /> }],
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

  it('renders the same navigation destinations twice — the desktop icon rail and the <sm mobile chip strip', () => {
    renderAppShell('/rsi-ha')

    // jsdom doesn't evaluate the `hidden sm:flex` / `sm:hidden` CSS that
    // keeps only one of the two visible at any real viewport width, so both
    // are present in the DOM here — that's the point: Parameters and
    // Watchlists must stay reachable from either representation.
    expect(screen.getAllByRole('button', { name: 'Screener' }).length).toBe(2)
    expect(screen.getAllByRole('button', { name: 'Watchlists' }).length).toBe(2)
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
