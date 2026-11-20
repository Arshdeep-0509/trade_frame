export type MarketSession = 'PRE-OPEN' | 'OPEN' | 'CLOSED'
/** NSE covers NSE stocks and NFO derivatives; MCX is commodity futures, on its own hours. */
export type TradingVenue = 'NSE' | 'MCX'

/**
 * NSE equity/F&O trading holidays that fall on weekdays, as IST 'YYYY-MM-DD'.
 * Hand-maintained from NSE's published calendar — verify against nseindia.com
 * and extend each year; a date missing here shows as an open market.
 */
const NSE_HOLIDAYS = new Set([
  // 2026
  '2026-01-26', // Republic Day
  '2026-03-03', // Holi
  '2026-03-26', // Ram Navami
  '2026-03-31', // Mahavir Jayanti
  '2026-04-03', // Good Friday
  '2026-04-14', // Dr. Ambedkar Jayanti
  '2026-05-01', // Maharashtra Day
  '2026-05-28', // Bakri Id
  '2026-06-26', // Muharram
  '2026-09-14', // Ganesh Chaturthi
  '2026-10-02', // Gandhi Jayanti
  '2026-10-20', // Dussehra
  '2026-11-10', // Diwali-Balipratipada
  '2026-11-24', // Guru Nanak Jayanti
  '2026-12-25', // Christmas
])

const istPartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  weekday: 'short',
})

const MARKET_OPEN_MINUTES = 9 * 60 + 15
const MARKET_CLOSE_MINUTES = 15 * 60 + 30
const WEEKEND_DAYS = new Set(['Sat', 'Sun'])
const MCX_OPEN_MINUTES = 9 * 60

/** Whether US daylight saving is on for a calendar date: second Sunday of March to first Sunday of November. */
function usDaylightSaving(year: number, month: number, day: number): boolean {
  const firstSunday = (m: number) => 1 + ((7 - new Date(Date.UTC(year, m - 1, 1)).getUTCDay()) % 7)
  const key = month * 100 + day
  return key >= 300 + firstSunday(3) + 7 && key < 1100 + firstSunday(11)
}

/** MCX follows the US market: 23:30 while US daylight saving is on, 23:55 otherwise (as live_scanner.py's MCX). */
function mcxCloseMinutes(year: number, month: number, day: number): number {
  return usDaylightSaving(year, month, day) ? 23 * 60 + 30 : 23 * 60 + 55
}

function istParts(now: Date): { year: number; month: number; day: number; minutes: number; weekday: string } {
  const parts = istPartsFormatter.formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return {
    year: Number(part('year')),
    month: Number(part('month')),
    day: Number(part('day')),
    minutes: Number(part('hour') || '0') * 60 + Number(part('minute') || '0'),
    weekday: part('weekday'),
  }
}

/** Opening and closing minute of the IST day, or null when the venue is closed all day. */
export function tradingHours(now: Date, venue: TradingVenue = 'NSE'): { open: number; close: number } | null {
  const { year, month, day, weekday } = istParts(now)
  if (WEEKEND_DAYS.has(weekday)) return null
  // No MCX holiday list, as in the backend: a closed weekday shows as open.
  if (venue === 'MCX') return { open: MCX_OPEN_MINUTES, close: mcxCloseMinutes(year, month, day) }
  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return NSE_HOLIDAYS.has(date) ? null : { open: MARKET_OPEN_MINUTES, close: MARKET_CLOSE_MINUTES }
}

const IST_OFFSET_SECONDS = 330 * 60

/**
 * The "today" the universe loaders' expiry filter must be given — the TS
 * equivalent of the Python's `pd.Timestamp.now().normalize()` (midnight of
 * today's IST date), expressed the way src/strategy/universe.ts's
 * parseExpiry() expresses an expiry date: epoch seconds at UTC midnight of
 * that calendar date.
 *
 * PARITY: pass THIS to loadFnoFuturesUniverse(), never
 * the raw clock time. The raw time compares greater than the expiry date's
 * midnight from 05:30 IST on expiry day, which would drop the expiring
 * contract a full day before the Python does.
 */
export function expiryFilterToday(nowEpochSeconds: number): number {
  const ist = new Date((nowEpochSeconds + IST_OFFSET_SECONDS) * 1000)
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) / 1000
}

/**
 * Seconds until the candle in progress closes, or null when no candle is forming.
 * Candles start at 09:15 and the day's last one closes at 15:30, as the backend's
 * next_close() has it; a daily candle (any barMinutes past the session's length)
 * simply counts down to 15:30.
 */
export function secondsToCandleClose(now: Date, barMinutes: number, venue: TradingVenue = 'NSE'): number | null {
  const hours = tradingHours(now, venue)
  if (!hours || getMarketSession(now, venue) !== 'OPEN') return null
  const secondsToday = (Math.floor(now.getTime() / 1000) + IST_OFFSET_SECONDS) % 86_400
  const toLastClose = hours.close * 60 - secondsToday
  // getMarketSession() still says OPEN during the closing minute, but no candle is left.
  if (toLastClose <= 0) return null
  const barSeconds = barMinutes * 60
  const intoBar = (secondsToday - hours.open * 60) % barSeconds
  return Math.min(barSeconds - intoBar, toLastClose)
}

export function getMarketSession(now: Date = new Date(), venue: TradingVenue = 'NSE'): MarketSession {
  const hours = tradingHours(now, venue)
  if (!hours) return 'CLOSED'

  const minutesSinceMidnight = istParts(now).minutes

  if (minutesSinceMidnight < hours.open) return 'PRE-OPEN'
  if (minutesSinceMidnight <= hours.close) return 'OPEN'
  return 'CLOSED'
}
