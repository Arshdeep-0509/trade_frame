import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MarketTick } from '../../../types/domain'
import { HttpMarketDataSource } from '../HttpMarketDataSource'

// Friday 2026-09-25, 15:27 IST — market open, inside the 15:25 bar.
const NOW_MS = Date.parse('2026-09-25T15:27:00+05:30')
// Sunday 2026-09-27, 11:00 IST — market closed.
const SUNDAY_MS = Date.parse('2026-09-27T11:00:00+05:30')

type Route = (url: URL) => { status?: number; body: unknown }

function fakeFetch(route: Route) {
  const calls: URL[] = []
  const impl = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost')
    calls.push(url)
    const { status = 200, body } = route(url)
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  })
  return { impl: impl as unknown as typeof fetch, calls }
}

/** Real shape observed from Master Trust /api/v1/charts/tdv: ISO-8601 with a "+0530" offset, numeric OHLCV. */
function tdv(rows: [string, number][]) {
  return { status: 'success', data: { candles: rows.map(([t, c]) => [t, c, c + 1, c - 1, c, 1000]) } }
}

const TWO_SESSIONS = tdv([
  ['2026-09-24T15:20:00+0530', 100],
  ['2026-09-24T15:25:00+0530', 101],
  ['2026-09-25T15:15:00+0530', 104],
  ['2026-09-25T15:20:00+0530', 105],
  ['2026-09-25T15:25:00+0530', 106], // still forming at 15:27
])

afterEach(() => {
  vi.useRealTimers()
})

describe('HttpMarketDataSource', () => {
  it('fetchHistoricalCandles sends the tdv params and drops the still-forming candle', async () => {
    const { impl, calls } = fakeFetch(() => ({ body: TWO_SESSIONS }))
    const source = new HttpMarketDataSource({ fetchImpl: impl, nowMs: () => NOW_MS })

    const candles = await source.fetchHistoricalCandles('68777', 'NFO', '5minute', 10)

    expect(calls[0].pathname).toBe('/api/candles')
    expect(Object.fromEntries(calls[0].searchParams)).toEqual({ token: '68777', exchange: 'NFO', interval: '5minute', days_back: '10' })
    expect(candles.map((c) => c.close)).toEqual([100, 101, 104, 105])
    expect(candles[0].time).toBe(Date.parse('2026-09-24T15:20:00+05:30') / 1000)
    expect(source.getConnectionState()).toBe('connected')
  })

  it('fetchDailyBars reuses the in-flight candle request and aggregates it into sessions', async () => {
    const { impl, calls } = fakeFetch(() => ({ body: TWO_SESSIONS }))
    const source = new HttpMarketDataSource({ fetchImpl: impl, nowMs: () => NOW_MS })

    const [candles, sessions] = await Promise.all([
      source.fetchHistoricalCandles('68777', 'NFO', '5minute', 10),
      source.fetchDailyBars({ token: '68777', exchange: 'NFO' }, 10),
    ])

    expect(calls).toHaveLength(1)
    expect(candles).toHaveLength(4)
    expect(sessions.map((s) => s.close)).toEqual([101, 105])
  })

  it("surfaces the backend's error detail instead of returning data", async () => {
    const { impl } = fakeFetch(() => ({ status: 502, body: { detail: 'Master Trust returned HTTP 401: token expired' } }))
    const source = new HttpMarketDataSource({ fetchImpl: impl, nowMs: () => NOW_MS })

    await expect(source.fetchHistoricalCandles('1', 'NFO', '5minute', 10)).rejects.toThrow(/token expired/)
    expect(source.getConnectionState()).toBe('disconnected')
  })

  it('reports an unreachable backend as disconnected', async () => {
    const impl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    const source = new HttpMarketDataSource({ fetchImpl: impl, nowMs: () => NOW_MS })
    const listener = vi.fn()
    source.onConnectionStateChange(listener)

    await expect(source.searchSymbol('RELIANCE')).rejects.toThrow(/mastertrust_intraday_api\.py/)
    expect(source.getConnectionState()).toBe('disconnected')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('loadScripMaster passes the configured filters', async () => {
    const rows = [{ exchange: 'NFO', instrument_name: 'FUTSTK', trading_symbol: 'X26SEPFUT', exchange_token: 5, close_price: 2500, expiry: '29-Sep-2026', company_name: 'X', strike: '', option_type: '' }]
    const { impl, calls } = fakeFetch(() => ({ body: rows }))
    const source = new HttpMarketDataSource({ fetchImpl: impl, scripMasterQueries: [{ exchange: 'NFO', instrumentName: 'FUTSTK' }] })

    expect(await source.loadScripMaster()).toEqual(rows)
    expect(calls[0].search).toBe('?exchange=NFO&instrument_name=FUTSTK')
  })

  it('loadScripMaster requests every configured slice and concatenates them in order', async () => {
    const eq = { exchange: 'NSE', instrument_name: 'EQ', trading_symbol: 'X-EQ', exchange_token: 1, close_price: 2500, expiry: '', company_name: 'X', strike: '', option_type: '' }
    const opt = { exchange: 'NFO', instrument_name: 'OPTSTK', trading_symbol: 'X26SEP2500CE', exchange_token: 2, close_price: 50, expiry: '29-Sep-2026', company_name: 'X', strike: 2500, option_type: 'CE' }
    const { impl, calls } = fakeFetch((url) => ({ body: url.searchParams.get('exchange') === 'NSE' ? [eq] : [opt] }))
    const source = new HttpMarketDataSource({
      fetchImpl: impl,
      scripMasterQueries: [
        { exchange: 'NSE', instrumentName: 'EQ' },
        { exchange: 'NFO', instrumentName: 'OPTSTK' },
      ],
    })

    expect(await source.loadScripMaster()).toEqual([eq, opt])
    expect(calls.map((c) => c.search)).toEqual(['?exchange=NSE&instrument_name=EQ', '?exchange=NFO&instrument_name=OPTSTK'])
  })

  it('fetchIndexQuotes uses the resolved index tokens, includes the forming candle, and caches', async () => {
    const { impl, calls } = fakeFetch((url) => {
      if (url.pathname === '/api/index-instruments') {
        return {
          body: [
            { key: 'NIFTY', label: 'NIFTY 50', exchange: 'NSE', token: '26000' },
            { key: 'BANKNIFTY', label: 'BANK NIFTY', exchange: 'NSE', token: '26009' },
            { key: 'INDIAVIX', label: 'India VIX', exchange: 'NSE', token: '26017' },
          ],
        }
      }
      return { body: url.searchParams.get('token') === '26000' ? TWO_SESSIONS : tdv([]) }
    })
    const source = new HttpMarketDataSource({ fetchImpl: impl, nowMs: () => NOW_MS })

    const quotes = await source.fetchIndexQuotes(['NIFTY', 'BANKNIFTY', 'INDIAVIX'])
    expect(quotes).toEqual([{ key: 'NIFTY', label: 'NIFTY 50', last: 106, prevClose: 101, changePct: 4.95, time: Date.parse('2026-09-25T15:25:00+05:30') / 1000 }])

    const callsBefore = calls.length
    await source.fetchIndexQuotes(['NIFTY', 'BANKNIFTY', 'INDIAVIX'])
    expect(calls.length).toBe(callsBefore)
  })

  it('fetchIndexQuotes rejects when Master Trust returns nothing for any index', async () => {
    const { impl } = fakeFetch((url) =>
      url.pathname === '/api/index-instruments' ? { body: [{ key: 'NIFTY', label: 'NIFTY 50', exchange: 'NSE', token: '26000' }] } : { body: tdv([]) },
    )
    const source = new HttpMarketDataSource({ fetchImpl: impl, nowMs: () => NOW_MS })
    await expect(source.fetchIndexQuotes(['NIFTY'])).rejects.toThrow(/no index data/)
  })

  it('subscribeTicks polls the newest (forming) candle while the market is open, emitting only on change', async () => {
    vi.useFakeTimers()
    const t0 = Date.now()
    let close = 106
    const { impl, calls } = fakeFetch(() => ({ body: tdv([['2026-09-25T15:20:00+0530', 105], ['2026-09-25T15:25:00+0530', close]]) }))
    const source = new HttpMarketDataSource({ fetchImpl: impl, nowMs: () => NOW_MS + (Date.now() - t0), tickPollMs: 1000, tickBatchSize: 5 })
    const ticks: MarketTick[] = []

    const unsubscribe = source.subscribeTicks(['A', 'B'], (t) => ticks.push(t), { priority: ['B'] })
    await vi.advanceTimersByTimeAsync(1000)
    expect(ticks.map((t) => [t.token, t.ltp])).toEqual([
      ['B', 106],
      ['A', 106],
    ])
    expect(ticks[0].time).toBe(Date.parse('2026-09-25T15:25:00+05:30') / 1000)
    expect(calls[0].searchParams.get('days_back')).toBe('1')

    await vi.advanceTimersByTimeAsync(5000) // past the raw-cache TTL, price unchanged
    expect(ticks).toHaveLength(2)

    close = 107
    await vi.advanceTimersByTimeAsync(5000)
    expect(ticks.slice(2).map((t) => t.ltp)).toEqual([107, 107])

    unsubscribe()
    const callsAtStop = calls.length
    await vi.advanceTimersByTimeAsync(10_000)
    expect(calls.length).toBe(callsAtStop)
  })

  it('subscribeTicks does not poll while the market is closed', async () => {
    vi.useFakeTimers()
    const { impl, calls } = fakeFetch(() => ({ body: TWO_SESSIONS }))
    const source = new HttpMarketDataSource({ fetchImpl: impl, nowMs: () => SUNDAY_MS, tickPollMs: 1000 })

    const unsubscribe = source.subscribeTicks(['A'], () => {})
    await vi.advanceTimersByTimeAsync(120_000)
    expect(calls).toHaveLength(0)
    unsubscribe()
  })
})
