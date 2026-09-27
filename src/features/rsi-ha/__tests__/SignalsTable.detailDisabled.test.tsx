import { act, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FIXTURE_NOW, makeRow, mockViewportDimensions, renderWithRouter, seededStore } from '../../../test-utils/fixtures'
import { SignalsTable } from '../SignalsTable'

vi.mock('../SignalChart', () => ({ SignalChart: () => <div data-testid="signal-chart" /> }))
vi.mock('../featureFlags', () => ({ SIGNAL_DETAIL_ENABLED: false }))

let restoreViewport: () => void
beforeEach(() => {
  restoreViewport = mockViewportDimensions()
})
afterEach(() => {
  restoreViewport()
})

function firstDataRow(): HTMLElement {
  return screen.getAllByRole('row').filter((r) => within(r).queryAllByRole('gridcell').length > 0)[0]
}

describe('SignalsTable with the detail drawer switched off', () => {
  it('a row click, Enter, and an external open request all leave the drawer closed', async () => {
    const user = userEvent.setup()
    const store = seededStore([makeRow({ symbol: 'ONEFUT', time: FIXTURE_NOW - 300 })])
    renderWithRouter(<SignalsTable store={store} />)

    await user.click(firstDataRow())
    await user.keyboard('{Enter}')
    act(() => store.getState().openRowDetail(store.getState().rows[0].id))

    expect(screen.queryByRole('heading', { name: 'ONEFUT' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('signal-chart')).not.toBeInTheDocument()
  })

  it('the right-click menu has no "Open chart" item', () => {
    const store = seededStore([makeRow({ symbol: 'ONEFUT', time: FIXTURE_NOW - 300 })])
    renderWithRouter(<SignalsTable store={store} />)

    fireEvent.contextMenu(firstDataRow())
    expect(screen.getByRole('menuitem', { name: /pin to top/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /open chart/i })).not.toBeInTheDocument()
  })
})
