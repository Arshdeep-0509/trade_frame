import { afterEach, describe, expect, it } from 'vitest'
import type { ScannerFeed, ScannerFeedEvent, ScannerFeedListener, SignalRow } from '../../features/rsi-ha/scannerFeed'
import { createScreenerStore, type ScreenerStore } from '../screenerStore'

function row(overrides: Partial<SignalRow> = {}): SignalRow {
  return { id: 'T1-BUY-100', symbol: 'ACME-EQ', exchange: 'NSE', signal: 'BUY', price: 2500, rsi: 62, time: 100, barCloseAt: 400, detectedAt: 402, token: 'T1', ...overrides }
}

function scan(rows: SignalRow[], extra: Partial<Extract<ScannerFeedEvent, { type: 'scan' }>> = {}): ScannerFeedEvent {
  return { type: 'scan', rows, errors: [], scannedAt: 410.5, durationMs: 3000, universeSize: 255, nextScanAt: 702.2, ...extra }
}

class FakeFeed implements ScannerFeed {
  listener: ScannerFeedListener | null = null
  intervals: string[] = []

  connect(listener: ScannerFeedListener, candleInterval: string): () => void {
    this.intervals.push(candleInterval)
    this.listener = listener
    listener.onConnection('connected')
    return () => {
      if (this.listener === listener) this.listener = null
    }
  }

  emit(event: ScannerFeedEvent): void {
    this.listener?.onEvent(event)
  }
}

let store: ScreenerStore | null = null

afterEach(() => {
  store?.getState().stop()
  store = null
  localStorage.clear()
})

function started() {
  const feed = new FakeFeed()
  store = createScreenerStore(feed)
  store.getState().start()
  return { feed, store }
}

describe('screenerStore', () => {
  it('connects to the 5-minute scanner by default', () => {
    const { feed, store: s } = started()
    expect(feed.intervals).toEqual(['5minute'])
    expect(s.getState().connectionState).toBe('connected')
  })

  it('shows a signal the moment it arrives, before the scan has finished', () => {
    const { feed, store: s } = started()
    feed.emit({ type: 'signal', rows: [row()] })
    expect(s.getState().rows.map((r) => r.symbol)).toEqual(['ACME-EQ'])
  })

  it('the finished scan replaces the list, without duplicates', () => {
    const { feed, store: s } = started()
    feed.emit({ type: 'signal', rows: [row()] })
    feed.emit(scan([row()]))
    expect(s.getState().rows).toHaveLength(1)
  })

  it('a repeated signal replaces its row', () => {
    const { feed, store: s } = started()
    feed.emit({ type: 'signal', rows: [row({ price: 2500 })] })
    feed.emit({ type: 'signal', rows: [row({ price: 2510 })] })
    expect(s.getState().rows.map((r) => r.price)).toEqual([2510])
  })

  it('lists the newest signals first', () => {
    const { feed, store: s } = started()
    feed.emit(scan([row({ id: 'old', barCloseAt: 100 }), row({ id: 'new', barCloseAt: 400 })]))
    expect(s.getState().rows.map((r) => r.id)).toEqual(['new', 'old'])
  })

  it('records the scan', () => {
    const { feed, store: s } = started()
    feed.emit(scan([row()]))
    const state = s.getState()
    expect(state.lastScanAt).toBe(410)
    expect(state.nextScanAt).toBe(702)
    expect(state.universeSize).toBe(255)
  })

  it('shows progress while scanning', () => {
    const { feed, store: s } = started()
    feed.emit({ type: 'status', state: 'scanning', message: null, nextScanAt: null, progress: { done: 0, total: 255 } })
    expect(s.getState().scanning).toBe(true)
    feed.emit({ type: 'progress', done: 100, total: 255 })
    expect(s.getState().scanProgress).toEqual({ done: 100, total: 255 })
    feed.emit(scan([]))
    expect(s.getState().scanning).toBe(false)
  })

  it('reports when Master Trust is not connected, and clears it when it is', () => {
    const { feed, store: s } = started()
    const status = { type: 'status', nextScanAt: null, progress: { done: 0, total: 0 } } as const
    feed.emit({ ...status, state: 'waiting-for-token', message: 'Master Trust is not connected.' })
    expect(s.getState().problem).toBe('Master Trust is not connected.')
    feed.emit({ ...status, state: 'waiting', message: null })
    expect(s.getState().problem).toBeNull()
  })

  it.each(['3minute', '15minute', '1day'])('switching to %s connects to that scanner', (interval) => {
    const { feed, store: s } = started()
    s.getState().setCandleInterval(interval)
    expect(feed.intervals).toEqual(['5minute', interval])
  })

  it('clears the old timeframe straight away, not when the new rows arrive', () => {
    const { feed, store: s } = started()
    feed.emit(scan([row()]))
    s.getState().setCandleInterval('3minute')
    expect(s.getState().rows).toEqual([])
    expect(s.getState().lastScanAt).toBeNull()
  })

  it('remembers the timeframe', () => {
    const { store: s } = started()
    s.getState().setCandleInterval('15minute')
    s.getState().stop()

    const feed = new FakeFeed()
    store = createScreenerStore(feed)
    store.getState().start()
    expect(feed.intervals).toEqual(['15minute'])
  })

  it('ignores a saved timeframe that no longer exists', () => {
    localStorage.setItem('rsi-ha:timeframe', JSON.stringify({ version: 1, data: '60minute' }))
    expect(started().feed.intervals).toEqual(['5minute'])
  })

  it('start() twice opens one stream, and stop() closes it', () => {
    const { feed, store: s } = started()
    s.getState().start()
    expect(feed.intervals).toHaveLength(1)
    s.getState().stop()
    expect(feed.listener).toBeNull()
  })
})
