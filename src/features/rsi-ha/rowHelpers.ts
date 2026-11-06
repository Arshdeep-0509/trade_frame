import type { Exchange, SignalKind } from '../../types/domain'
import type { ScreenerRow } from '../../store/types'
import { isDailyInterval, parseIntervalMinutes } from '../../strategy/constants'

export type InstrumentType = 'EQ' | 'FUT' | 'CE' | 'PE'

/**
 * Derived purely from exchange + signal kind — the engine never computes
 * this itself (options rows only ever arrive as "CE Buy"/"PE Buy", equity
 * signals only ever arrive on NSE, futures signals only ever arrive on
 * NFO as BUY/SELL/BREAKOUT-*), so it's a safe, lossless view-layer read.
 */
export function getInstrumentType(row: Pick<ScreenerRow, 'exchange' | 'signal'>): InstrumentType {
  if (row.signal === 'CE Buy') return 'CE'
  if (row.signal === 'PE Buy') return 'PE'
  return row.exchange === 'NFO' ? 'FUT' : 'EQ'
}

export function isDerivedRow(row: Pick<ScreenerRow, 'signal'>): boolean {
  return row.signal === 'CE Buy' || row.signal === 'PE Buy'
}

/**
 * When a signal happened: the moment its candle CLOSED, which is when the
 * strategy can first know. `row.time` is the candle's start (what Master Trust
 * labels it with), so the 09:50–09:55 candle is a 09:55 signal, not a 09:50 one.
 */
export function signalCloseTime(row: Pick<ScreenerRow, 'time' | 'barCloseAt'>, candleInterval: string): number {
  if (row.barCloseAt !== undefined) return row.barCloseAt
  return isDailyInterval(candleInterval) ? row.time : row.time + parseIntervalMinutes(candleInterval) * 60
}

/** Percent change of the live LTP vs. the price the signal fired at. Null when no live tick has arrived yet. */
export function changePercent(row: Pick<ScreenerRow, 'price'>, liveLtp: number | undefined): number | null {
  if (liveLtp === undefined || row.price === 0) return null
  return ((liveLtp - row.price) / row.price) * 100
}

export const EXCHANGES: readonly Exchange[] = ['NSE', 'NFO']

/** What the UI calls each signal kind. The kinds themselves ('CE Buy'/'PE Buy') stay as the engine emits them — this is display text only. */
export function signalLabel(kind: SignalKind): string {
  if (kind === 'CE Buy') return 'Call Buy'
  if (kind === 'PE Buy') return 'Put Buy'
  return kind
}

export const SIGNAL_KINDS: readonly SignalKind[] = ['BUY', 'SELL', 'BREAKOUT-UP', 'BREAKOUT-DOWN', 'CE Buy', 'PE Buy']

export const INSTRUMENT_TYPES: readonly InstrumentType[] = ['EQ', 'FUT', 'CE', 'PE']
