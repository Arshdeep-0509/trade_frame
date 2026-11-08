import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createScreenerStore, type ScreenerStore } from '../../../store/screenerStore'
import { SignalsTable } from '../SignalsTable'
import type { ScannerFeedEvent, ScannerFeedListener, SignalRow } from '../scannerFeed'

const CLOSE_0955 = Date.parse('2026-11-06T09:55:00+05:30') / 1000

function row(overrides: Partial<SignalRow> = {}): SignalRow {
  return { id: 'a', symbol: 'ACME26NOVFUT', exchange: 'NFO', signal: 'BUY', price: 2500, rsi: 62, time: CLOSE_0955 - 300, barCloseAt: CLOSE_0955, detectedAt: CLOSE_0955 + 3.2, token: 'T1', ...overrides }
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
  it('offers the four timeframes, the two markets and full screen, and nothing else', () => {
    setup()
    const select = screen.getByRole('combobox', { name: 'Timeframe' })
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['3 min', '5 min', '15 min', '1 day'])
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['NSE', 'NFO', 'Full screen'])
  })

  it('has no LTP or Chg % column, and shows RSI as a number', () => {
    setup()
    emit(scan([row()]))
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Time', 'Symbol', 'Type', 'Signal', 'Price', 'RSI'])
    expect(screen.getByText('62.0')).toBeTruthy()
  })

  it('shows a stock with the candle close time, 09:55 not 09:50', () => {
    setup()
    emit(scan([row()]))
    expect(screen.getByText('ACME26NOVFUT')).toBeTruthy()
    expect(screen.getByText('09:55:00')).toBeTruthy()
    expect(screen.queryByText('09:50:00')).toBeNull()
  })

  it('says how long after the close a signal was found', () => {
    setup()
    emit(scan([row()]))
    expect(screen.getByText('09:55:00').getAttribute('title')).toBe('Candle closed 09:55:00 · signal found 3.2s later')
  })

  describe('market buttons', () => {
    const rows = [
      row({ id: 'eq', symbol: 'ACME-EQ', exchange: 'NSE', token: 'T1' }),
      row({ id: 'fut', symbol: 'ACME26NOVFUT', exchange: 'NFO', token: 'T2' }),
      row({ id: 'ce', symbol: 'ACME26NOV2500CE', exchange: 'NFO', signal: 'CE Buy', derivedFrom: 'ACME-EQ', token: 'T3' }),
    ]

    it('start on NFO: futures and options, no stocks', () => {
      setup()
      emit(scan(rows))
      expect(screen.getByRole('button', { name: 'NFO' }).getAttribute('aria-pressed')).toBe('true')
      expect(screen.getByRole('button', { name: 'NSE' }).getAttribute('aria-pressed')).toBe('false')
      expect(screen.getByText('ACME26NOVFUT')).toBeTruthy()
      expect(screen.getByText('ACME26NOV2500CE')).toBeTruthy()
      expect(screen.queryByText('ACME-EQ')).toBeNull()
    })

    it('NSE shows only the stocks', () => {
      setup()
      emit(scan(rows))
      fireEvent.click(screen.getByRole('button', { name: 'NSE' }))
      expect(screen.getByText('ACME-EQ')).toBeTruthy()
      expect(screen.queryByText('ACME26NOVFUT')).toBeNull()
      expect(screen.queryByText('ACME26NOV2500CE')).toBeNull()
    })

    it('say so when one market has signals and the other has none', () => {
      setup()
      emit(scan([rows[1]]))
      fireEvent.click(screen.getByRole('button', { name: 'NSE' }))
      expect(screen.getByText(/No NSE signal today/)).toBeTruthy()
    })
  })

  describe('full screen', () => {
    afterEach(() => {
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
    })

    it('fills the screen with the page, and the button then offers the way back', () => {
      setup()
      const request = vi.fn(() => Promise.resolve())
      const page = screen.getByRole('button', { name: 'Full screen' }).closest('.bg-surface') as HTMLElement
      page.requestFullscreen = request
      fireEvent.click(screen.getByRole('button', { name: 'Full screen' }))
      expect(request).toHaveBeenCalledTimes(1)

      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: page })
      act(() => void document.dispatchEvent(new Event('fullscreenchange')))
      const exit = vi.fn(() => Promise.resolve())
      document.exitFullscreen = exit
      fireEvent.click(screen.getByRole('button', { name: 'Exit full screen' }))
      expect(exit).toHaveBeenCalledTimes(1)
    })

    it('notices when Escape leaves full screen', () => {
      setup()
      const page = screen.getByRole('button', { name: 'Full screen' }).closest('.bg-surface') as HTMLElement
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: page })
      act(() => void document.dispatchEvent(new Event('fullscreenchange')))
      expect(screen.getByRole('button', { name: 'Exit full screen' })).toBeTruthy()

      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
      act(() => void document.dispatchEvent(new Event('fullscreenchange')))
      expect(screen.getByRole('button', { name: 'Full screen' })).toBeTruthy()
    })
  })

  it('shows the date on the 1 day timeframe', () => {
    setup()
    fireEvent.change(screen.getByRole('combobox', { name: 'Timeframe' }), { target: { value: '1day' } })
    emit(scan([row()]))
    expect(screen.getByText('06 Nov 2026')).toBeTruthy()
  })

  it('says what is happening before the first scan, and when nothing has matched', () => {
    setup()
    expect(screen.getByRole('status').textContent).toContain('Loading')
    emit(scan([]))
    expect(screen.getByText(/No NFO signal today/)).toBeTruthy()
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
