import { describe, expect, it, vi } from 'vitest'
import { isDailyInterval, parseIntervalMinutes } from '../../../strategy/constants'
import type { Candle } from '../../../types/domain'
import { DAILY_DAYS_BACK, fetchIntervalCandles, INTRADAY_DAYS_BACK, intervalLabel } from '../intervalCandles'

/** Epoch seconds for an IST wall-clock time. */
function ist(date: string, time: string): number {
  return Date.parse(`${date}T${time}:00+05:30`) / 1000
}

function bar(time: number, close: number): Candle {
  return { time, open: close - 1, high: close + 2, low: close - 2, close, volume: 100 }
}

function sourceReturning(candles: Candle[]) {
  const fetchHistoricalCandles = vi.fn(async () => candles)
  return { fetchHistoricalCandles }
}

describe('candle interval parsing', () => {
  it('reads intraday intervals as minutes and 1day as a full day', () => {
    expect(parseIntervalMinutes('3minute')).toBe(3)
    expect(parseIntervalMinutes('15minute')).toBe(15)
    expect(parseIntervalMinutes('1day')).toBe(1440)
    expect(isDailyInterval('1day')).toBe(true)
    expect(isDailyInterval('15minute')).toBe(false)
    expect(intervalLabel('3minute')).toBe('3-minute')
    expect(intervalLabel('1day')).toBe('Daily')
  })
})

describe('fetchIntervalCandles', () => {
  it.each(['3minute', '5minute', '15minute'])('requests %s candles from the source directly, over the screener\'s 5-day window', async (interval) => {
    const candles = [bar(ist('2026-10-01', '09:15'), 100)]
    const source = sourceReturning(candles)

    expect(await fetchIntervalCandles(source, '49000', 'NFO', interval)).toEqual(candles)
    expect(source.fetchHistoricalCandles).toHaveBeenCalledWith('49000', 'NFO', interval, INTRADAY_DAYS_BACK)
  })

  it('builds daily bars from 5-minute candles and keeps a session whose closing bar has closed', async () => {
    const source = sourceReturning([
      bar(ist('2026-09-30', '09:15'), 100),
      bar(ist('2026-09-30', '15:25'), 110),
      bar(ist('2026-10-01', '09:15'), 111),
      bar(ist('2026-10-01', '15:25'), 120),
    ])

    const daily = await fetchIntervalCandles(source, '49000', 'NFO', '1day')

    expect(source.fetchHistoricalCandles).toHaveBeenCalledWith('49000', 'NFO', '5minute', DAILY_DAYS_BACK)
    expect(daily.map((d) => [d.open, d.close])).toEqual([
      [99, 110],
      [110, 120],
    ])
  })

  it('drops today\'s session while it is still in progress — the daily forming-candle drop', async () => {
    const source = sourceReturning([
      bar(ist('2026-10-01', '09:15'), 100),
      bar(ist('2026-10-01', '15:25'), 110),
      bar(ist('2026-10-05', '09:15'), 111),
      bar(ist('2026-10-05', '11:00'), 115),
    ])

    const daily = await fetchIntervalCandles(source, '49000', 'NFO', '1day')

    expect(daily).toHaveLength(1)
    expect(daily[0].close).toBe(110)
  })
})
