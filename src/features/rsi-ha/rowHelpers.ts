import type { Exchange, SignalKind } from '../../types/domain'

export type InstrumentType = 'EQ' | 'FUT' | 'CE' | 'PE'

/** Derived purely from exchange + signal kind: options only arrive as "CE Buy"/"PE Buy". */
export function getInstrumentType(row: { exchange: Exchange; signal: SignalKind }): InstrumentType {
  if (row.signal === 'CE Buy') return 'CE'
  if (row.signal === 'PE Buy') return 'PE'
  return row.exchange === 'NFO' ? 'FUT' : 'EQ'
}

export function isDerivedRow(row: { signal: SignalKind }): boolean {
  return row.signal === 'CE Buy' || row.signal === 'PE Buy'
}

/** What the UI calls each signal kind. */
export function signalLabel(kind: SignalKind): string {
  if (kind === 'CE Buy') return 'Call Buy'
  if (kind === 'PE Buy') return 'Put Buy'
  return kind
}
