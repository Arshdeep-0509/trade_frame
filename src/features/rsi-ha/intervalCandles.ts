import { aggregateToSessions } from '../../analytics/daily'
import type { MarketDataSource } from '../../data/MarketDataSource'
import { isDailyInterval } from '../../strategy/constants'
import type { Candle, Exchange } from '../../types/domain'

/** fetch_historical_candles()'s days_back default — the history every intraday interval is evaluated on. */
export const INTRADAY_DAYS_BACK = 5
/**
 * Calendar days of 5-minute history aggregated into daily bars: ~40 sessions,
 * enough for RSI(14) to warm up and for a 20-bar breakout lookback. Must stay
 * within mastertrust_intraday_api.py's MAX_DAYS_BACK.
 */
export const DAILY_DAYS_BACK = 60
/** The last 5-minute bar of an NSE session starts at 15:25 IST; a day without it is still in progress. */
const LAST_BAR_START_IST_MINUTES = 15 * 60 + 25
const IST_OFFSET_SECONDS = 330 * 60

function istMinutesOfDay(epochSeconds: number): number {
  return Math.floor(((epochSeconds + IST_OFFSET_SECONDS) % 86_400) / 60)
}

/**
 * Closed candles at the strategy's candleInterval — the one place the scanner,
 * the signal detail chart and replay all get their series from.
 *
 * Intraday intervals ("3minute", "5minute", "15minute") are requested from
 * Master Trust at that interval directly, exactly as
 * fetch_historical_candles(token, exchange, interval) does.
 *
 * PARITY: "1day" is NOT what the Python would do with it — its
 * `int(digits(interval))` would turn "1day" into a 1-minute request. No
 * day-level /api/v1/charts/tdv parameter is confirmed (see
 * DAILY_DATA_DURATION_MINUTES_GUESS), so daily bars are aggregated from the
 * confirmed 5-minute request instead, and today's session is dropped until
 * its closing bar has closed — the daily equivalent of the forming-candle drop.
 */
export async function fetchIntervalCandles(
  dataSource: Pick<MarketDataSource, 'fetchHistoricalCandles'>,
  token: string,
  exchange: Exchange,
  candleInterval: string,
): Promise<Candle[]> {
  if (!isDailyInterval(candleInterval)) {
    return dataSource.fetchHistoricalCandles(token, exchange, candleInterval, INTRADAY_DAYS_BACK)
  }
  const base = await dataSource.fetchHistoricalCandles(token, exchange, '5minute', DAILY_DAYS_BACK)
  const sessions = aggregateToSessions(base)
  const lastBar = base[base.length - 1]
  const lastSessionComplete = lastBar !== undefined && istMinutesOfDay(lastBar.time) >= LAST_BAR_START_IST_MINUTES
  return lastSessionComplete ? sessions : sessions.slice(0, -1)
}

/** Human label for a candleInterval string, e.g. "15minute" -> "15-minute", "1day" -> "Daily". */
export function intervalLabel(candleInterval: string): string {
  if (isDailyInterval(candleInterval)) return 'Daily'
  return `${candleInterval.replace(/\D/g, '')}-minute`
}

/** How much history a candleInterval is evaluated on, for display. */
export function historyLabel(candleInterval: string): string {
  return `last ${isDailyInterval(candleInterval) ? DAILY_DAYS_BACK : INTRADAY_DAYS_BACK} days`
}
