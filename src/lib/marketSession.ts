export type MarketSession = 'PRE-OPEN' | 'OPEN' | 'CLOSED'

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
export function secondsToCandleClose(now: Date, barMinutes: number): number | null {
  if (getMarketSession(now) !== 'OPEN') return null
  const secondsToday = (Math.floor(now.getTime() / 1000) + IST_OFFSET_SECONDS) % 86_400
  const toLastClose = MARKET_CLOSE_MINUTES * 60 - secondsToday
  // getMarketSession() still says OPEN during the 15:30 minute, but no candle is left.
  if (toLastClose <= 0) return null
  const barSeconds = barMinutes * 60
  const intoBar = (secondsToday - MARKET_OPEN_MINUTES * 60) % barSeconds
  return Math.min(barSeconds - intoBar, toLastClose)
}

export function getMarketSession(now: Date = new Date()): MarketSession {
  const parts = istPartsFormatter.formatToParts(now)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? ''

  const date = `${parts.find((p) => p.type === 'year')?.value}-${parts.find((p) => p.type === 'month')?.value}-${parts.find((p) => p.type === 'day')?.value}`

  if (WEEKEND_DAYS.has(weekday) || NSE_HOLIDAYS.has(date)) return 'CLOSED'

  const minutesSinceMidnight = hour * 60 + minute

  if (minutesSinceMidnight < MARKET_OPEN_MINUTES) return 'PRE-OPEN'
  if (minutesSinceMidnight <= MARKET_CLOSE_MINUTES) return 'OPEN'
  return 'CLOSED'
}
