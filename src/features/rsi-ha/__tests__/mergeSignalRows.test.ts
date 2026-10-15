import { describe, expect, it } from 'vitest'
import type { ScreenerRow } from '../../../store/types'
import type { SignalKind } from '../../../types/domain'
import { groupKindOf, mergeSignalRows, pinToggleIds } from '../mergeSignalRows'

function row(id: string, signal: SignalKind, overrides: Partial<ScreenerRow> = {}): ScreenerRow {
  return {
    id,
    symbol: 'AXISBANK26OCTFUT',
    exchange: 'NFO',
    signal,
    price: 1000,
    rsi: 62,
    time: 1_700_000_000,
    token: '111',
    status: 'active',
    firstSeenAt: 0,
    lastSeenAt: 0,
    pinned: false,
    ...overrides,
  }
}

describe('mergeSignalRows', () => {
  it('folds a signal and a breakout on the same instrument candle into one row', () => {
    const merged = mergeSignalRows([row('b', 'BREAKOUT-UP'), row('a', 'BUY')])
    expect(merged).toHaveLength(1)
    expect(merged[0].signal).toBe('BUY')
    expect(merged[0].breakout).toBe('BREAKOUT-UP')
    expect(merged[0].row.id).toBe('a')
  })

  it('leaves the missing kind null when an instrument has only one', () => {
    const [breakoutOnly, signalOnly] = mergeSignalRows([row('b', 'BREAKOUT-DOWN'), row('s', 'SELL', { token: '222' })])
    expect(breakoutOnly).toMatchObject({ signal: null, breakout: 'BREAKOUT-DOWN' })
    expect(signalOnly).toMatchObject({ signal: 'SELL', breakout: null })
    expect(groupKindOf(breakoutOnly)).toBe('BREAKOUT-DOWN')
  })

  it('keeps different instruments and different candles apart', () => {
    const merged = mergeSignalRows([
      row('a', 'BUY'),
      row('b', 'BREAKOUT-UP', { token: '222' }),
      row('c', 'BREAKOUT-UP', { time: 1_700_000_300 }),
    ])
    expect(merged).toHaveLength(3)
  })

  it('pins and unpins every member together', () => {
    const [partlyPinned] = mergeSignalRows([row('a', 'BUY', { pinned: true }), row('b', 'BREAKOUT-UP')])
    expect(partlyPinned.pinned).toBe(true)
    expect(pinToggleIds(partlyPinned)).toEqual(['a'])

    const [unpinned] = mergeSignalRows([row('a', 'BUY'), row('b', 'BREAKOUT-UP')])
    expect(pinToggleIds(unpinned)).toEqual(['a', 'b'])
  })
})
