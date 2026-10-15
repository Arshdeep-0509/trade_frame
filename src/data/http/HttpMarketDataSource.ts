import { aggregateToSessions } from '../../analytics/daily'
import { buildIndexQuote } from '../../analytics/indexComposite'
import { mapWithConcurrency } from '../../lib/concurrent'
import { getMarketSession } from '../../lib/marketSession'
import { parseIntervalMinutes } from '../../strategy/constants'
import type { HistoricalCandlesResponse, ScripRow, SearchResponse } from '../../types/api'
import type { Candle, Exchange, Instrument, MarketTick } from '../../types/domain'
import type { ConnectionState, IndexQuote, IndexQuoteKey, MarketDataSource } from '../MarketDataSource'
import { parseHistoricalCandlesResponse } from '../parseCandles'

/** One row of GET /api/index-instruments (mastertrust_intraday_api.py). */
export interface IndexInstrument {
  key: IndexQuoteKey
  label: string
  exchange: string | null
  token: string | null
  error?: string
}

export interface ScripMasterQuery {
  exchange?: string
  instrumentName?: string
}

export interface HttpMarketDataSourceOptions {
  /** '' = same origin (the Vite dev/preview proxy forwards /api to the Python service). */
  baseUrl?: string
  /**
   * Exact-match filters passed to /api/scrip-master, so only the rows a page
   * needs cross the wire. One request per entry, results concatenated in
   * order. Omitted or empty = the whole master in one request.
   */
  scripMasterQueries?: ScripMasterQuery[]
  /** How often one batch of tokens is polled for a fresh price while the market is open. */
  tickPollMs?: number
  /** Tokens polled per batch. Priority (visible) tokens go first; the rest rotate through the leftover slots. */
  tickBatchSize?: number
  fetchImpl?: typeof fetch
  /** Epoch milliseconds. Injectable for tests. */
  nowMs?: () => number
}

/** Coalesces the store's parallel candle + daily-bar requests for one instrument into one upstream call. */
const RAW_CACHE_TTL_MS = 4_000
/** The store asks for index quotes on every 1s meter refresh; Master Trust doesn't need to be asked that often. */
const INDEX_QUOTE_TTL_MS = 10_000
const INDEX_DAYS_BACK = 5
const TICK_DAYS_BACK = 1
const TICK_CONCURRENCY = 5
const CLOSED_RECHECK_MS = 30_000

/**
 * The real MarketDataSource: talks to mastertrust_intraday_api.py, which
 * holds the Master Trust token and forwards to Master Trust's REST API.
 *
 * Master Trust documents no live-tick feed, so subscribeTicks() polls the
 * candle endpoint instead: the newest row of a /api/v1/charts/tdv response
 * is the still-forming 5-minute candle, and its close is the latest traded
 * price. Daily bars are aggregated from the same 5-minute candles
 * (aggregateToSessions) because no day-level request has been confirmed.
 */
export class HttpMarketDataSource implements MarketDataSource {
  private readonly baseUrl: string
  private readonly scripMasterQueries: ScripMasterQuery[]
  private readonly tickPollMs: number
  private readonly tickBatchSize: number
  private readonly fetchImpl: typeof fetch
  private readonly nowMs: () => number

  private connection: ConnectionState = 'connecting'
  private readonly connectionListeners = new Set<() => void>()
  private readonly exchangeByToken = new Map<string, string>()
  private readonly rawCache = new Map<string, { expiresAt: number; promise: Promise<HistoricalCandlesResponse> }>()
  private indexInstrumentsPromise: Promise<IndexInstrument[]> | null = null
  private indexQuotesCache: { keys: string; expiresAt: number; promise: Promise<IndexQuote[]> } | null = null

  constructor(options: HttpMarketDataSourceOptions = {}) {
    this.baseUrl = (options.baseUrl ?? '').replace(/\/$/, '')
    this.scripMasterQueries = options.scripMasterQueries ?? []
    this.tickPollMs = options.tickPollMs ?? 5_000
    this.tickBatchSize = Math.max(1, options.tickBatchSize ?? 25)
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
    this.nowMs = options.nowMs ?? (() => Date.now())
  }

  // ---------------------------------------------------------------------
  // MarketDataSource
  // ---------------------------------------------------------------------

  searchSymbol(keyword: string): Promise<SearchResponse> {
    return this.getJson<SearchResponse>('/api/search', { key: keyword })
  }

  async fetchHistoricalCandles(token: string, exchange: Exchange, interval: string, daysBack: number): Promise<Candle[]> {
    this.exchangeByToken.set(token, exchange)
    const raw = await this.fetchRaw(token, exchange, interval, daysBack)
    // Master Trust returns candles at the requested interval, so the forming-candle cutoff uses that same interval.
    return parseHistoricalCandlesResponse(raw, parseIntervalMinutes(interval), this.getNow())
  }

  async loadScripMaster(): Promise<ScripRow[]> {
    const queries = this.scripMasterQueries.length > 0 ? this.scripMasterQueries : [{}]
    const batches = await Promise.all(
      queries.map((q) => {
        const query: Record<string, string> = {}
        if (q.exchange) query.exchange = q.exchange
        if (q.instrumentName) query.instrument_name = q.instrumentName
        return this.getJson<ScripRow[]>('/api/scrip-master', query)
      }),
    )
    const rows = batches.flat()
    for (const row of rows) this.exchangeByToken.set(String(row.exchange_token), row.exchange)
    return rows
  }

  subscribeTicks(tokens: string[], onTick: (tick: MarketTick) => void, opts?: { priority?: string[] }): () => void {
    const all = Array.from(new Set(tokens))
    const allSet = new Set(all)
    const priority = Array.from(new Set(opts?.priority ?? [])).filter((t) => allSet.has(t))
    const prioritySet = new Set(priority)
    const rest = all.filter((t) => !prioritySet.has(t))
    const lastEmitted = new Map<string, string>()
    let priorityCursor = 0
    let restCursor = 0
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const take = (list: string[], count: number, cursor: number): { picked: string[]; cursor: number } => {
      if (list.length === 0 || count <= 0) return { picked: [], cursor }
      const n = Math.min(count, list.length)
      const picked = Array.from({ length: n }, (_, i) => list[(cursor + i) % list.length])
      return { picked, cursor: (cursor + n) % list.length }
    }

    const nextBatch = (): string[] => {
      const fromPriority = take(priority, this.tickBatchSize, priorityCursor)
      priorityCursor = fromPriority.cursor
      const fromRest = take(rest, this.tickBatchSize - fromPriority.picked.length, restCursor)
      restCursor = fromRest.cursor
      return [...fromPriority.picked, ...fromRest.picked]
    }

    const cycle = async (): Promise<void> => {
      if (stopped) return
      const open = getMarketSession(new Date(this.nowMs())) === 'OPEN'
      if (open) {
        await mapWithConcurrency(nextBatch(), TICK_CONCURRENCY, async (token) => {
          const exchange = this.exchangeByToken.get(token) ?? 'NFO'
          let raw: HistoricalCandlesResponse
          try {
            raw = await this.fetchRaw(token, exchange, '5minute', TICK_DAYS_BACK)
          } catch {
            return // one missed poll: the next rotation tries this token again
          }
          const latest = latestCandle(raw)
          if (stopped || !latest) return
          const signature = `${latest.time}:${latest.close}`
          if (lastEmitted.get(token) === signature) return
          lastEmitted.set(token, signature)
          onTick({
            token,
            exchange: exchange === 'NSE' ? 'NSE' : 'NFO',
            ltp: latest.close,
            // The forming candle's start, not a trade time (the candle endpoint carries none) — enough for the store's bar-close detection.
            time: latest.time,
            volume: latest.volume,
            open: latest.open,
            high: latest.high,
            low: latest.low,
            close: latest.close,
          })
        })
      }
      if (!stopped) timer = setTimeout(() => void cycle(), open ? this.tickPollMs : CLOSED_RECHECK_MS)
    }

    timer = setTimeout(() => void cycle(), this.tickPollMs)
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }

  getConnectionState(): ConnectionState {
    return this.connection
  }

  fetchIndexQuotes(keys: IndexQuoteKey[]): Promise<IndexQuote[]> {
    const cacheKey = keys.join(',')
    const cached = this.indexQuotesCache
    if (cached && cached.keys === cacheKey && cached.expiresAt > this.nowMs()) return cached.promise

    const promise = this.loadIndexQuotes(keys)
    const entry = { keys: cacheKey, expiresAt: this.nowMs() + INDEX_QUOTE_TTL_MS, promise }
    this.indexQuotesCache = entry
    promise.catch(() => {
      if (this.indexQuotesCache === entry) this.indexQuotesCache = null
    })
    return promise
  }

  async fetchDailyBars(instrument: Pick<Instrument, 'token' | 'exchange'>, days: number): Promise<Candle[]> {
    // Same request as the store's own fetchHistoricalCandles(token, exchange, '5minute', days), so the raw cache serves both.
    const closed = await this.fetchHistoricalCandles(instrument.token, instrument.exchange, '5minute', days)
    return aggregateToSessions(closed).slice(-days)
  }

  // ---------------------------------------------------------------------
  // Beyond the interface: the real wall clock and connection-state changes.
  // ---------------------------------------------------------------------

  /** Epoch seconds. */
  getNow(): number {
    return Math.floor(this.nowMs() / 1000)
  }

  onConnectionStateChange(listener: () => void): () => void {
    this.connectionListeners.add(listener)
    return () => this.connectionListeners.delete(listener)
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  private async loadIndexQuotes(keys: IndexQuoteKey[]): Promise<IndexQuote[]> {
    const instruments = await this.indexInstruments()
    const quotes = await Promise.all(
      keys.map(async (key): Promise<IndexQuote | null> => {
        const instrument = instruments.find((i) => i.key === key)
        if (!instrument?.token || !instrument.exchange) return null
        const raw = await this.fetchRaw(instrument.token, instrument.exchange, '5minute', INDEX_DAYS_BACK)
        const series = allCandles(raw)
        if (series.length === 0) return null
        return buildIndexQuote(key, instrument.label, series, series[series.length - 1].time)
      }),
    )
    const found = quotes.filter((q): q is IndexQuote => q !== null)
    if (found.length === 0 && keys.length > 0) {
      const reasons = instruments.map((i) => (i.error ? `${i.key}: ${i.error}` : `${i.key}: no candles returned`)).join('; ')
      throw new Error(`Master Trust returned no index data (${reasons})`)
    }
    return found
  }

  private indexInstruments(): Promise<IndexInstrument[]> {
    if (!this.indexInstrumentsPromise) {
      const promise = this.getJson<IndexInstrument[]>('/api/index-instruments', {})
      this.indexInstrumentsPromise = promise
      // Keep only a fully resolved answer; retry next time otherwise.
      promise.then(
        (rows) => {
          if (rows.some((r) => !r.token) && this.indexInstrumentsPromise === promise) this.indexInstrumentsPromise = null
        },
        () => {
          if (this.indexInstrumentsPromise === promise) this.indexInstrumentsPromise = null
        },
      )
    }
    return this.indexInstrumentsPromise
  }

  private fetchRaw(token: string, exchange: string, interval: string, daysBack: number): Promise<HistoricalCandlesResponse> {
    const key = `${token}|${exchange}|${interval}|${daysBack}`
    const now = this.nowMs()
    const cached = this.rawCache.get(key)
    if (cached && cached.expiresAt > now) return cached.promise

    for (const [k, v] of this.rawCache) if (v.expiresAt <= now) this.rawCache.delete(k)

    const promise = this.getJson<HistoricalCandlesResponse>('/api/candles', { token, exchange, interval, days_back: daysBack })
    const entry = { expiresAt: now + RAW_CACHE_TTL_MS, promise }
    this.rawCache.set(key, entry)
    promise.catch(() => {
      if (this.rawCache.get(key) === entry) this.rawCache.delete(key)
    })
    return promise
  }

  private async getJson<T>(path: string, params: Record<string, string | number>): Promise<T> {
    const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
    const url = `${this.baseUrl}${path}${query ? `?${query}` : ''}`

    let res: Response
    try {
      res = await this.fetchImpl(url)
    } catch (err) {
      this.setConnection('disconnected')
      const reason = err instanceof Error ? err.message : String(err)
      throw new Error(`Intraday API unreachable (${path}) — is mastertrust_intraday_api.py running? ${reason}`)
    }

    if (!res.ok) {
      if (res.status >= 500) this.setConnection('disconnected')
      throw new Error(`${path} failed (HTTP ${res.status}): ${await errorDetail(res)}`)
    }
    this.setConnection('connected')
    return (await res.json()) as T
  }

  private setConnection(next: ConnectionState): void {
    if (this.connection === next) return
    this.connection = next
    this.connectionListeners.forEach((listener) => listener())
  }
}

/** Every candle in the response, the still-forming one included. */
function allCandles(raw: HistoricalCandlesResponse): Candle[] {
  return parseHistoricalCandlesResponse(raw, 0, Number.POSITIVE_INFINITY)
}

function latestCandle(raw: HistoricalCandlesResponse): Candle | null {
  const candles = allCandles(raw)
  return candles.length > 0 ? candles[candles.length - 1] : null
}

async function errorDetail(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  try {
    const body: unknown = JSON.parse(text)
    if (body && typeof body === 'object' && 'detail' in body) {
      const detail = (body as { detail: unknown }).detail
      return typeof detail === 'string' ? detail : JSON.stringify(detail)
    }
  } catch {
    // not JSON — fall through to the raw text
  }
  return text.slice(0, 300) || res.statusText
}
