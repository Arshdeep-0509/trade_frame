import type { ScreenerRow } from '../../store/types'
import type { SignalKind } from '../../types/domain'

export type BreakoutKind = Extract<SignalKind, 'BREAKOUT-UP' | 'BREAKOUT-DOWN'>

export function isBreakoutKind(kind: SignalKind): kind is BreakoutKind {
  return kind === 'BREAKOUT-UP' || kind === 'BREAKOUT-DOWN'
}

/**
 * One table row per instrument per candle. The store keeps one ScreenerRow
 * per signal (a BUY and a BREAKOUT-UP on the same FUT candle are two rows,
 * each with its own alerts/history/pin), so this is a display-only merge:
 * the BUY/SELL/CE/PE row goes in the Signal column, the breakout row in the
 * Breakout column, and whichever kind is absent shows as "—".
 */
export interface MergedSignalRow {
  /** The row the merged row shows and acts on: the BUY/SELL/CE Buy/PE Buy row when there is one, else the breakout row. Both share price, RSI and time — they come from the same closed candle. */
  row: ScreenerRow
  signal: SignalKind | null
  breakout: BreakoutKind | null
  /** Every store row folded into this one (one or two). */
  members: ScreenerRow[]
  pinned: boolean
}

export type DisplayItem = { type: 'group'; signal: SignalKind; count: number } | { type: 'row'; row: ScreenerRow; merged: MergedSignalRow }

export function instrumentCandleKey(row: Pick<ScreenerRow, 'exchange' | 'token' | 'symbol' | 'time'>): string {
  return `${row.exchange}:${row.token ?? row.symbol}:${row.time}`
}

/** Merges per-signal rows into per-instrument-candle rows, keeping the order in which each instrument first appears. */
export function mergeSignalRows(rows: readonly ScreenerRow[]): MergedSignalRow[] {
  const byKey = new Map<string, ScreenerRow[]>()
  for (const row of rows) {
    const key = instrumentCandleKey(row)
    const list = byKey.get(key)
    if (list) list.push(row)
    else byKey.set(key, [row])
  }

  return Array.from(byKey.values(), (members): MergedSignalRow => {
    const signalRow = members.find((r) => !isBreakoutKind(r.signal))
    const breakoutRow = members.find((r) => isBreakoutKind(r.signal))
    return {
      row: signalRow ?? breakoutRow ?? members[0],
      signal: signalRow?.signal ?? null,
      breakout: breakoutRow && isBreakoutKind(breakoutRow.signal) ? breakoutRow.signal : null,
      members,
      pinned: members.some((r) => r.pinned),
    }
  })
}

/** The Grouped view's heading for a merged row: its signal, or its breakout when it has no signal. */
export function groupKindOf(merged: MergedSignalRow): SignalKind {
  return merged.signal ?? merged.breakout ?? merged.row.signal
}

/** Ids to pass to the store's togglePin so every member ends up pinned (or unpinned) together. */
export function pinToggleIds(merged: MergedSignalRow): string[] {
  return merged.members.filter((r) => r.pinned === merged.pinned).map((r) => r.id)
}

export function containsRowId(merged: MergedSignalRow, id: string | null): boolean {
  return id !== null && merged.members.some((r) => r.id === id)
}
