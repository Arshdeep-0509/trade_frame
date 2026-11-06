/** Test harness: a REAL MockMarketDataSource pinned to a fixed seed and a frozen clock. */
import { DEFAULT_SEED, MockMarketDataSource } from '../data/mock'

/** 2026-01-05 (a Monday) 13:00 IST — mid-session, so the last bar is a real intraday bar, not the close. */
export const SESSION_NOW = 1767598200
/** 2026-01-05 16:10 IST — after the close. The instant the older store/acceptance tests use. */
export const AFTER_CLOSE_NOW = 1767609600
export const BAR_SECONDS = 300

export interface MockOptions {
  seed?: number
  now?: number
  /** Share of requests that fail (0..1). Defaults to 0 so a scan's output never depends on which requests the RNG failed. */
  failureRate?: number
}

export function makeMock(options: MockOptions = {}): MockMarketDataSource {
  const source = new MockMarketDataSource(options.seed ?? DEFAULT_SEED, { mode: 'fixed', startTimestamp: options.now ?? SESSION_NOW })
  source.setFastForward(true)
  source.setFailureRate(options.failureRate ?? 0)
  return source
}
