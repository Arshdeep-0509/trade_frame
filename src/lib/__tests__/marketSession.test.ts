import { describe, expect, it } from 'vitest'
import { getMarketSession } from '../marketSession'

describe('getMarketSession holidays', () => {
  it('is CLOSED on a weekday NSE holiday during market hours', () => {
    expect(getMarketSession(new Date('2026-10-02T07:46:00Z'))).toBe('CLOSED') // 13:16 IST, Gandhi Jayanti
  })
  it('is OPEN on a normal weekday during market hours', () => {
    expect(getMarketSession(new Date('2026-10-01T07:46:00Z'))).toBe('OPEN')
  })
})
