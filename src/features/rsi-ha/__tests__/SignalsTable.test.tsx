import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createScreenerStore, type ScreenerStore } from '../../../store/screenerStore'
import { SignalsTable } from '../SignalsTable'
import type { ScannerFeedEvent, ScannerFeedListener, SignalRow } from '../scannerFeed'

const CLOSE_0955 = Date.parse('2026-11-06T09:55:00+05:30') / 1000

function row(overrides: Partial<SignalRow> = {}): SignalRow {
  return { id: 'a', symbol: 'ACME-EQ', exchange: 'NSE', signal: 'BUY', price: 2500, rsi: 62, time: CLOSE_0955 - 300, barCloseAt: CLOSE_0955, detectedAt: CLOSE_0955 + 3.2, token: 'T1', ...overrides }
}

function scan(rows: SignalRow[], extra: Partial<Extract<ScannerFeedEvent, { type: 'scan' }>> = {}): ScannerFeedEvent {
  return { type: 'scan', rows, errors: [], scannedAt: CLOSE_0955 + 5, durationMs: 3000, universeSize: 255, nextScanAt: CLOSE_0955 + 302, ...extra }
}

let listener: ScannerFeedListener | null = null
let store: ScreenerStore

function setup() {
  store = createScreenerStore({
    connect(l) {
      listener = l
      return () => {}
    },
  })
  render(<SignalsTable store={store} />)
}

function emit(event: ScannerFeedEvent) {
  act(() => listener?.onEvent(event))
}

afterEach(() => localStorage.clear())

describe('SignalsTable', () => {
  it('offers exactly the four timeframes and no other control', () => {
    setup()
    const select = screen.getByRole('combobox', { name: 'Timeframe' })
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['3 min', '5 min', '15 min', '1 day'])
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows a stock with the candle close time, 09:55 not 09:50', () => {
    setup()
    emit(scan([row()]))
    expect(screen.getByText('ACME-EQ')).toBeTruthy()
    expect(screen.getByText('09:55:00')).toBeTruthy()
    expect(screen.queryByText('09:50:00')).toBeNull()
  })

  it('says how long after the close a signal was found', () => {
    setup()
    emit(scan([row()]))
    expect(screen.getByText('09:55:00').getAttribute('title')).toBe('Candle closed 09:55:00 · signal found 3.2s later')
  })

  it('shows stocks, futures and CE/PE rows together', () => {
    setup()
    emit(
      scan([
        row(),
        row({ id: 'b', symbol: 'ACME26NOVFUT', exchange: 'NFO', token: 'T2' }),
        row({ id: 'c', symbol: 'ACME26NOV2500CE', exchange: 'NFO', signal: 'CE Buy', derivedFrom: 'ACME-EQ', token: 'T3' }),
      ]),
    )
    expect(screen.getAllByRole('row')).toHaveLength(4)
    expect(screen.getByText('Call Buy')).toBeTruthy()
  })

  it('shows the date on the 1 day timeframe', () => {
    setup()
    fireEvent.change(screen.getByRole('combobox', { name: 'Timeframe' }), { target: { value: '1day' } })
    emit(scan([row()]))
    expect(screen.getByText('06 Nov 2026')).toBeTruthy()
  })

  it('updates the live price and change', () => {
    setup()
    emit(scan([row()]))
    emit({ type: 'prices', prices: { T1: 2525 } })
    expect(screen.getByText('+1.00%')).toBeTruthy()
  })

  it('says what is happening before the first scan, and when nothing has matched', () => {
    setup()
    expect(screen.getByRole('status').textContent).toContain('Loading')
    emit(scan([]))
    expect(screen.getByText(/No stock has met the conditions today/)).toBeTruthy()
    expect(screen.getByText(/255 instruments checked/)).toBeTruthy()
  })

  it('shows failed instruments and their reasons', () => {
    setup()
    emit(scan([], { errors: [{ symbol: 'BAD-EQ', message: 'Read timed out' }] }))
    fireEvent.click(screen.getByRole('button', { name: /1 instrument could not be scanned/ }))
    expect(screen.getByText('BAD-EQ')).toBeTruthy()
    expect(screen.getByText(/Read timed out/)).toBeTruthy()
  })

  it('says when Master Trust is not connected', () => {
    setup()
    emit({ type: 'status', state: 'waiting-for-token', message: 'Master Trust is not connected.', nextScanAt: null, progress: { done: 0, total: 0 } })
    expect(screen.getByRole('alert').textContent).toContain('Master Trust is not connected.')
  })
})
