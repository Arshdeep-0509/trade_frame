import { authFetch } from '../features/auth/authFetch'
import { limitConcurrency } from '../lib/concurrent'

/**
 * Market-data requests in flight at once from this tab, shared by /rsi-ha and
 * /intraday. Browsers open only ~6 connections per site over HTTP/1.1; the
 * screener's scans would otherwise take all of them, and a login, user
 * management or Master Trust request would sit queued behind hundreds of
 * candle requests (seconds). The backend sends at most 8 requests to Master
 * Trust at once for everyone anyway (MASTERTRUST_MAX_CONCURRENCY).
 */
const MARKET_REQUESTS_IN_FLIGHT = 4

/** fetch() for the market-data endpoints: the logged-in user's token, a bounded number at a time. */
export const marketFetch: typeof fetch = limitConcurrency(authFetch, MARKET_REQUESTS_IN_FLIGHT)
