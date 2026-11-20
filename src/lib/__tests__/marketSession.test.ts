import { describe, expect, it } from 'vitest'
import { getMarketSession, secondsToCandleClose, tradingHours } from '../marketSession'

describe('getMarketSession holidays', () => {
  it('is CLOSED on a weekday NSE holiday during market hours', () => {
    expect(getMarketSession(new Date('2026-10-02T07:46:00Z'))).toBe('CLOSED') // 13:16 IST, Gandhi Jayanti
  })
  it('is OPEN on a normal weekday during market hours', () => {
    expect(getMarketSession(new Date('2026-10-01T07:46:00Z'))).toBe('OPEN')
  })
})

describe('MCX hours', () => {
  it('is open from 09:00 to the evening close, through NSE holidays', () => {
    expect(getMarketSession(new Date('2026-11-20T03:25:00Z'), 'MCX')).toBe('PRE-OPEN') // 08:55 IST
    expect(getMarketSession(new Date('2026-11-20T03:35:00Z'), 'MCX')).toBe('OPEN') // 09:05 IST
    expect(getMarketSession(new Date('2026-11-20T13:00:00Z'), 'MCX')).toBe('OPEN') // 18:30 IST
    expect(getMarketSession(new Date('2026-11-20T13:00:00Z'))).toBe('CLOSED') // NSE closed at 18:30
    expect(getMarketSession(new Date('2026-10-02T07:46:00Z'), 'MCX')).toBe('OPEN') // Gandhi Jayanti
    expect(getMarketSession(new Date('2026-11-21T07:46:00Z'), 'MCX')).toBe('CLOSED') // Saturday
  })

  it('closes at 23:55 in winter and 23:30 during US daylight saving', () => {
    expect(tradingHours(new Date('2026-11-20T06:00:00Z'), 'MCX')).toEqual({ open: 540, close: 23 * 60 + 55 })
    expect(tradingHours(new Date('2026-07-01T06:00:00Z'), 'MCX')).toEqual({ open: 540, close: 23 * 60 + 30 })
    expect(tradingHours(new Date('2026-03-06T06:00:00Z'), 'MCX')?.close).toBe(23 * 60 + 55)
    expect(tradingHours(new Date('2026-03-09T06:00:00Z'), 'MCX')?.close).toBe(23 * 60 + 30)
    expect(tradingHours(new Date('2026-11-02T06:00:00Z'), 'MCX')?.close).toBe(23 * 60 + 55)
  })

  it('counts down to MCX candle closes in the evening', () => {
    // 21:02:00 IST -> the 5-minute candle closes at 21:05.
    expect(secondsToCandleClose(new Date('2026-11-20T15:32:00Z'), 5, 'MCX')).toBe(180)
    expect(secondsToCandleClose(new Date('2026-11-20T15:32:00Z'), 5)).toBeNull()
  })
})
