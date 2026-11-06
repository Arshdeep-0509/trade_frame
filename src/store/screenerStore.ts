import { create, type StoreApi, type UseBoundStore } from 'zustand'
import type { ConnectionState } from '../data/MarketDataSource'
import type { ScanError, ScannerFeed, ScannerFeedEvent, SignalRow } from '../features/rsi-ha/scannerFeed'
import { loadVersioned, saveVersioned } from '../lib/persistence'
import { CANDLE_INTERVAL_OPTIONS, DEFAULT_PARAMS } from '../strategy/constants'

const TIMEFRAME_STORAGE_KEY = 'rsi-ha:timeframe'
const TIMEFRAME_STORAGE_VERSION = 1

function loadTimeframe(): string {
  const stored = loadVersioned<string>(TIMEFRAME_STORAGE_KEY, TIMEFRAME_STORAGE_VERSION, () => null)
  return CANDLE_INTERVAL_OPTIONS.some((option) => option.value === stored) ? (stored as string) : DEFAULT_PARAMS.candleInterval
}

/** Newest first: the table's only order. */
function sorted(rows: SignalRow[]): SignalRow[] {
  return [...rows].sort((a, b) => b.barCloseAt - a.barCloseAt || a.symbol.localeCompare(b.symbol))
}

export interface ScreenerState {
  candleInterval: string
  /** Today's signals on this timeframe, as the server reports them. */
  rows: SignalRow[]
  /** Latest price per instrument token. */
  liveLtp: Record<string, number>
  connectionState: ConnectionState
  scanning: boolean
  scanProgress: { done: number; total: number }
  universeSize: number
  lastScanAt: number | null
  nextScanAt: number | null
  errors: ScanError[]
  /** Why the scanner isn't scanning, e.g. Master Trust isn't connected. */
  problem: string | null

  start: () => void
  stop: () => void
  /** Reconnects, so the server sends its current state. */
  reconnect: () => void
  setCandleInterval: (candleInterval: string) => void
}

export type ScreenerStore = UseBoundStore<StoreApi<ScreenerState>>

/** The /rsi-ha page's state: a view of the server's live scanner, which does all the work. */
export function createScreenerStore(feed: ScannerFeed): ScreenerStore {
  let disconnect: (() => void) | null = null

  return create<ScreenerState>()((set, get) => {
    function apply(event: ScannerFeedEvent): void {
      switch (event.type) {
        case 'status': {
          const problem = event.state === 'error' || event.state === 'waiting-for-token'
          set({
            problem: problem ? (event.message ?? event.state) : null,
            scanning: event.state === 'scanning' || event.state === 'loading',
            scanProgress: event.progress,
            ...(event.nextScanAt !== null && { nextScanAt: Math.round(event.nextScanAt) }),
          })
          break
        }
        case 'progress':
          set({ scanProgress: { done: event.done, total: event.total } })
          break
        case 'prices':
          set((s) => ({ liveLtp: { ...s.liveLtp, ...event.prices } }))
          break
        case 'signal':
          set((s) => {
            const ids = new Set(event.rows.map((row) => row.id))
            return { rows: sorted([...s.rows.filter((row) => !ids.has(row.id)), ...event.rows]) }
          })
          break
        case 'scan':
          set({
            rows: sorted(event.rows),
            errors: event.errors,
            universeSize: event.universeSize,
            lastScanAt: Math.floor(event.scannedAt),
            nextScanAt: event.nextScanAt === null ? null : Math.round(event.nextScanAt),
            scanning: false,
            scanProgress: { done: event.universeSize, total: event.universeSize },
          })
          break
      }
    }

    function connect(): void {
      disconnect?.()
      disconnect = feed.connect({ onEvent: apply, onConnection: (connectionState) => set({ connectionState }) }, get().candleInterval)
    }

    return {
      candleInterval: loadTimeframe(),
      rows: [],
      liveLtp: {},
      connectionState: 'connecting',
      scanning: false,
      scanProgress: { done: 0, total: 0 },
      universeSize: 0,
      lastScanAt: null,
      nextScanAt: null,
      errors: [],
      problem: null,

      start() {
        if (!disconnect) connect()
      },

      stop() {
        disconnect?.()
        disconnect = null
      },

      reconnect: connect,

      setCandleInterval(candleInterval) {
        saveVersioned(TIMEFRAME_STORAGE_KEY, TIMEFRAME_STORAGE_VERSION, candleInterval)
        // Cleared now, not when the new rows arrive: one timeframe's rows must never pass for another's.
        set({ candleInterval, rows: [], errors: [], lastScanAt: null, nextScanAt: null })
        connect()
      },
    }
  })
}
