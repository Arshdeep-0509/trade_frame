import type { ConnectionState } from '../../data/MarketDataSource'
import type { ScanError, ScannedRow } from './scanner'

/** Everything GET /api/scanner/stream sends (see live_scanner.py). */
export type ScannerFeedEvent =
  | { type: 'status'; state: string; message: string | null; nextScanAt: number | null; progress: { done: number; total: number } }
  | {
      type: 'scan'
      /** True for the state sent on connecting: it replaces the table instead of counting as a new scan. */
      snapshot?: boolean
      rows: ScannedRow[]
      errors: ScanError[]
      barCloseAt: number | null
      scannedAt: number
      durationMs: number
      universeSize: number
      nextScanAt: number | null
    }
  | { type: 'signal'; rows: ScannedRow[] }
  | { type: 'progress'; done: number; total: number }
  | { type: 'prices'; prices: Record<string, number> }

export interface ScannerFeedListener {
  onEvent: (event: ScannerFeedEvent) => void
  onConnection: (state: ConnectionState) => void
  /** This backend has no live scanner, so the browser has to scan for itself. */
  onUnavailable: () => void
}

export interface ScannerFeed {
  /** Connects to one timeframe's scanner, and keeps reconnecting until the returned function is called. */
  connect: (listener: ScannerFeedListener, candleInterval: string) => () => void
}

export interface ScannerFeedOptions {
  baseUrl?: string
  /** Must not be marketFetch: this request stays open, and would hold one of its slots for good. */
  fetchImpl: typeof fetch
  minRetryMs?: number
  maxRetryMs?: number
  /** The server sends a keepalive every 15s; this long without anything means the connection is dead. */
  silenceLimitMs?: number
}

const MIN_RETRY_MS = 1_000
const MAX_RETRY_MS = 15_000
const SILENCE_LIMIT_MS = 40_000

/** RSI is NaN in the app but null on the wire: JSON has no NaN. */
function normaliseRows(rows: ScannedRow[]): ScannedRow[] {
  return rows.map((row) => (row.rsi === null ? { ...row, rsi: Number.NaN } : row))
}

function toEvent(name: string, data: string): ScannerFeedEvent | null {
  const body = JSON.parse(data) as Record<string, unknown>
  switch (name) {
    case 'scan':
    case 'signal':
      return { ...body, type: name, rows: normaliseRows(body.rows as ScannedRow[]) } as ScannerFeedEvent
    case 'status':
    case 'progress':
    case 'prices':
      return { ...body, type: name } as ScannerFeedEvent
    default:
      return null
  }
}

/** Splits a server-sent-events byte stream into events; `push` takes whatever text has arrived so far. */
export function createSseParser(onMessage: (event: string, data: string) => void): (text: string) => void {
  let buffer = ''
  return (text) => {
    buffer += text.replace(/\r\n/g, '\n')
    for (;;) {
      const end = buffer.indexOf('\n\n')
      if (end === -1) return
      const block = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)

      let event = 'message'
      const data: string[] = []
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
      }
      if (data.length > 0) onMessage(event, data.join('\n'))
    }
  }
}

/**
 * The live signal stream. fetch() rather than EventSource because EventSource
 * can't send the Authorization header every other request here uses.
 */
export function createScannerFeed(options: ScannerFeedOptions): ScannerFeed {
  const streamUrl = `${(options.baseUrl ?? '').replace(/\/$/, '')}/api/scanner/stream`
  const minRetryMs = options.minRetryMs ?? MIN_RETRY_MS
  const maxRetryMs = options.maxRetryMs ?? MAX_RETRY_MS
  const silenceLimitMs = options.silenceLimitMs ?? SILENCE_LIMIT_MS

  return {
    connect(listener, candleInterval) {
      const url = `${streamUrl}?interval=${encodeURIComponent(candleInterval)}`
      let stopped = false
      let controller: AbortController | null = null
      let retryTimer: ReturnType<typeof setTimeout> | null = null
      let wakeRetry: (() => void) | null = null

      async function readStream(response: Response, connection: AbortController): Promise<void> {
        const reader = (response.body as ReadableStream<Uint8Array>).getReader()
        const decoder = new TextDecoder()
        const push = createSseParser((name, data) => {
          const event = toEvent(name, data)
          if (event && !stopped) listener.onEvent(event)
        })

        let silence = setTimeout(() => connection.abort(), silenceLimitMs)
        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) return
            clearTimeout(silence)
            silence = setTimeout(() => connection.abort(), silenceLimitMs)
            push(decoder.decode(value, { stream: true }))
          }
        } finally {
          clearTimeout(silence)
        }
      }

      /** True when this connection can't ever work, so retrying is pointless. */
      async function connectOnce(onConnected: () => void): Promise<boolean> {
        const connection = new AbortController()
        controller = connection
        const response = await options.fetchImpl(url, { signal: connection.signal, headers: { Accept: 'text/event-stream' } })
        if (response.status === 401) return true // authFetch has logged them out
        const switchedOff = response.status === 503 && (await response.text().catch(() => '')).includes('SCANNER_ENABLED')
        if (response.status === 404 || switchedOff) {
          listener.onUnavailable()
          return true
        }
        if (!response.ok || !response.body) throw new Error(`Scanner stream failed (HTTP ${response.status})`)
        listener.onConnection('connected')
        onConnected()
        await readStream(response, connection)
        return false
      }

      async function run(): Promise<void> {
        let retryMs = minRetryMs
        while (!stopped) {
          listener.onConnection('connecting')
          try {
            if (await connectOnce(() => (retryMs = minRetryMs))) return
          } catch {
            // Lost or refused: handled by the retry below.
          }
          if (stopped) return
          listener.onConnection('disconnected')
          await new Promise<void>((resolve) => {
            wakeRetry = resolve
            retryTimer = setTimeout(resolve, retryMs)
          })
          retryMs = Math.min(retryMs * 2, maxRetryMs)
        }
      }

      void run()

      return () => {
        stopped = true
        controller?.abort()
        if (retryTimer) clearTimeout(retryTimer)
        wakeRetry?.()
      }
    },
  }
}
