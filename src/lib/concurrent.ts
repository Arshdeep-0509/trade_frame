/**
 * Shared by src/features/rsi-ha/scanner.ts and src/store/intradayStore.ts —
 * both pages fetch candles for their own (different) instrument universes
 * against the same bounded-concurrency MarketDataSource, and must do it the
 * same way. Do not fork a second copy of this.
 */
export async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    for (;;) {
      const current = nextIndex
      nextIndex += 1
      if (current >= items.length) return
      const item = items[current]
      results[current] = await fn(item, current)
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

/**
 * Wraps an async function so at most `limit` calls run at once; the rest wait
 * their turn in call order. Used to keep the screener's bursts of candle
 * requests from taking every one of the browser's connections to the API.
 */
export function limitConcurrency<A extends unknown[], R>(fn: (...args: A) => Promise<R>, limit: number): (...args: A) => Promise<R> {
  let running = 0
  const waiting: (() => void)[] = []

  return async (...args: A): Promise<R> => {
    // A finishing call hands its slot straight to the next waiter (no window for a newcomer to jump in).
    if (running >= limit) await new Promise<void>((resolve) => waiting.push(resolve))
    else running += 1
    try {
      return await fn(...args)
    } finally {
      const next = waiting.shift()
      if (next) next()
      else running -= 1
    }
  }
}
