import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionState, MarketDataSource } from '../../data/MarketDataSource'
import type { ScannedRow } from '../../features/rsi-ha/scanner'
import type { ScannerFeed, ScannerFeedEvent, ScannerFeedListener } from '../../features/rsi-ha/scannerFeed'
import { DEFAULT_PARAMS } from '../../strategy/constants'
import type { ScripRow } from '../../types/api'
import { useAlertStore } from '../alertStore'
import { usePauseStore } from '../pauseStore'
import { createScreenerStore, type ScreenerStore } from '../screenerStore'

const SCRIP_ROWS: ScripRow[] = [
  { exchange: 'NFO', instrument_name: 'FUTSTK', trading_symbol: 'ACME-FUT', exchange_token: 'F1', close_price: '2500', expiry: '30-Dec-2099', company_name: 'ACME', strike: '', option_type: '' },
]

function row(overrides: Partial<ScannedRow> = {}): ScannedRow {
  return { id: 'F1-BUY-100', symbol: 'ACME-FUT', exchange: 'NFO', signal: 'BUY', price: 2500, rsi: 62, time: 100, barCloseAt: 400, detectedAt: 402, token: 'F1', ...overrides }
}

function scan(rows: ScannedRow[], extra: Partial<Extract<ScannerFeedEvent, { type: 'scan' }>> = {}): ScannerFeedEvent {
  return { type: 'scan', rows, errors: [], barCloseAt: 400, scannedAt: 410.5, durationMs: 8000, universeSize: 300, nextScanAt: 702.2, ...extra }
}

class FakeFeed implements ScannerFeed {
  listener: ScannerFeedListener | null = null
  connections = 0

  connect(listener: ScannerFeedListener): () => void {
    this.connections += 1
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

function fakeDataSource() {
  return {
    fetchHistoricalCandles: vi.fn(async () => []),
    loadScripMaster: vi.fn(async () => SCRIP_ROWS),
    subscribeTicks: vi.fn(() => () => {}),
    getConnectionState: (): ConnectionState => 'disconnected',
    searchSymbol: vi.fn(),
    fetchIndexQuotes: vi.fn(),
    fetchDailyBars: vi.fn(),
  } as unknown as MarketDataSource
}

let store: ScreenerStore | null = null

afterEach(() => {
  store?.getState().stop()
  store = null
  usePauseStore.setState({ isPaused: false })
  localStorage.clear()
})

async function started(options: { now?: () => number } = {}) {
  const feed = new FakeFeed()
  const dataSource = fakeDataSource()
  const runScan = vi.fn(async () => ({ rows: [], errors: [], visibleRows: [] }))
  store = createScreenerStore({ dataSource, now: options.now ?? (() => 1000), runScan, pollIntervalMs: 5, liveFeed: feed })
  store.getState().start()
  await vi.waitFor(() => expect(store?.getState().universe).toHaveLength(1))
  return { feed, dataSource, runScan, store }
}

describe('screenerStore on the live feed', () => {
  it('neither scans nor polls prices in the browser', async () => {
    const { runScan, dataSource, feed } = await started()
    expect(feed.connections).toBe(1)
    expect(runScan).not.toHaveBeenCalled()
    expect(dataSource.subscribeTicks).not.toHaveBeenCalled()
  })

  it('does not start a browser scan when the next-scan time passes', async () => {
    let now = 1000
    const { feed, runScan, store: s } = await started({ now: () => now })
    feed.emit(scan([], { nextScanAt: 1100 }))
    now = 1200
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(runScan).not.toHaveBeenCalled()
    expect(s.getState().connectionState).toBe('connected')
  })

  it('shows a signal the moment it arrives, before the scan has finished', async () => {
    const { feed, store: s } = await started()
    feed.emit(scan([], { snapshot: true }))
    feed.emit({ type: 'signal', rows: [row()] })
    expect(s.getState().visibleRows.map((r) => r.symbol)).toEqual(['ACME-FUT'])
    expect(s.getState().freshIds).toEqual(['F1-BUY-100'])
  })

  it('fires an alert for a signal that arrives live, but not for the connection snapshot', async () => {
    const evaluateRow = vi.spyOn(useAlertStore.getState(), 'evaluateRow')
    const { feed } = await started()
    feed.emit(scan([row({ id: 'old', symbol: 'OLD-FUT', token: 'F2' })], { snapshot: true }))
    expect(evaluateRow).not.toHaveBeenCalled()
    feed.emit({ type: 'signal', rows: [row()] })
    expect(evaluateRow).toHaveBeenCalledTimes(1)
    evaluateRow.mockRestore()
  })

  it('the finished scan confirms a live row instead of duplicating it, and does not alert twice', async () => {
    const { feed, store: s } = await started()
    feed.emit(scan([], { snapshot: true }))
    feed.emit({ type: 'signal', rows: [row()] })
    feed.emit(scan([row()]))
    expect(s.getState().rows).toHaveLength(1)
    expect(s.getState().rows[0].status).toBe('active')
    expect(s.getState().freshIds).toEqual([])
  })

  it('a live row for one signal does not fade another row of the same symbol until the scan ends', async () => {
    const { feed, store: s } = await started()
    feed.emit(scan([row({ id: 'b', signal: 'BREAKOUT-UP' })], { snapshot: true }))
    feed.emit({ type: 'signal', rows: [row()] })
    expect(s.getState().rows.map((r) => r.status)).toEqual(['active', 'active'])
    feed.emit(scan([row()]))
    expect(s.getState().rows.find((r) => r.signal === 'BREAKOUT-UP')?.status).toBe('fading')
  })

  it('records the scan: time, duration, next scan and a live-price update', async () => {
    const { feed, store: s } = await started()
    feed.emit(scan([row()]))
    feed.emit({ type: 'prices', prices: { F1: 2512.5 } })
    const state = s.getState()
    expect(state.lastScanAt).toBe(410)
    expect(state.nextScanAt).toBe(702)
    expect(state.lastScanDurationMs).toBe(8000)
    expect(state.scanState).toBe('done')
    expect(state.liveLtp.get('F1')).toBe(2512.5)
  })

  it('tells the user when Master Trust is not connected, and clears it when it is', async () => {
    const { feed, store: s } = await started()
    const status = { type: 'status', nextScanAt: null, progress: { done: 0, total: 0 } } as const
    feed.emit({ ...status, state: 'waiting-for-token', message: 'Master Trust is not connected.' })
    expect(s.getState().errors).toEqual([{ symbol: '*', message: 'Master Trust is not connected.' }])
    feed.emit({ ...status, state: 'waiting', message: null })
    expect(s.getState().errors).toEqual([])
  })

  it('holds rows while paused, then catches up from a fresh snapshot', async () => {
    const { feed, store: s } = await started()
    feed.emit(scan([], { snapshot: true }))
    s.getState().togglePause()
    feed.emit({ type: 'signal', rows: [row()] })
    feed.emit(scan([row()]))
    expect(s.getState().rows).toHaveLength(0)
    s.getState().togglePause()
    await vi.waitFor(() => expect(feed.connections).toBe(2))
  })

  it('filters server rows to the universe mode', async () => {
    const { feed, store: s } = await started()
    const equity = row({ id: 'e', symbol: 'ACME-EQ', exchange: 'NSE', token: 'E1' })
    const option = row({ id: 'o', symbol: 'ACME-CE', signal: 'CE Buy', derivedFrom: 'ACME-EQ', token: 'O1' })
    s.getState().setUniverseMode('futures')
    await vi.waitFor(() => expect(feed.connections).toBe(2))
    feed.emit(scan([row(), equity, option], { snapshot: true }))
    expect(s.getState().rows.map((r) => r.symbol)).toEqual(['ACME-FUT'])

    s.getState().setUniverseMode('equity')
    await vi.waitFor(() => expect(feed.connections).toBe(3))
    feed.emit(scan([row(), equity, option], { snapshot: true }))
    expect(s.getState().rows.map((r) => r.symbol).sort()).toEqual(['ACME-CE', 'ACME-EQ'])
  })

  it('custom params leave the feed and scan in the browser, and a reset returns to it', async () => {
    const { feed, runScan, dataSource, store: s } = await started()
    await s.getState().setParams({ ...DEFAULT_PARAMS, rsiBuyLow: 55 })
    expect(feed.listener).toBeNull()
    expect(runScan).toHaveBeenCalledTimes(1)
    expect(dataSource.subscribeTicks).toHaveBeenCalled()

    const reset = s.getState().resetParams()
    await vi.waitFor(() => expect(feed.listener).not.toBeNull())
    feed.emit(scan([row()], { snapshot: true }))
    await reset
    expect(runScan).toHaveBeenCalledTimes(1)
    expect(s.getState().rows).toHaveLength(1)
  })

  it('changing only the scan interval stays on the feed', async () => {
    const { feed, runScan, store: s } = await started()
    const applied = s.getState().setParams({ ...DEFAULT_PARAMS, scanEverySeconds: 60 })
    await vi.waitFor(() => expect(feed.connections).toBe(2))
    feed.emit(scan([], { snapshot: true }))
    await applied
    expect(runScan).not.toHaveBeenCalled()
  })

  it('a watchlist scans in the browser', async () => {
    const { feed, runScan, store: s } = await started()
    s.getState().setUniverseMode('watchlist')
    await vi.waitFor(() => expect(runScan).toHaveBeenCalledTimes(1))
    expect(feed.listener).toBeNull()
  })

  it('falls back to scanning in the browser when the backend has no live scanner', async () => {
    const { feed, runScan, dataSource } = await started()
    feed.listener?.onUnavailable()
    await vi.waitFor(() => expect(runScan).toHaveBeenCalledTimes(1))
    expect(dataSource.subscribeTicks).toHaveBeenCalled()
  })

  it('stop() closes the stream', async () => {
    const { feed, store: s } = await started()
    s.getState().stop()
    expect(feed.listener).toBeNull()
  })
})
