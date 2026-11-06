import { afterEach, describe, expect, it, vi } from 'vitest'
import { createScannerFeed, createSseParser, type ScannerFeedEvent, type ScannerFeedListener } from '../scannerFeed'
import { signalCloseTime } from '../rowHelpers'

const encoder = new TextEncoder()

/** A streaming response whose chunks the test pushes by hand. */
function streamResponse() {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
  })
  return {
    response: new Response(body, { status: 200 }),
    push: (text: string) => controller.enqueue(encoder.encode(text)),
    close: () => controller.close(),
  }
}

function recorder() {
  const events: ScannerFeedEvent[] = []
  const connection: string[] = []
  const onUnavailable = vi.fn()
  const listener: ScannerFeedListener = { onEvent: (e) => events.push(e), onConnection: (s) => connection.push(s), onUnavailable }
  return { events, connection, onUnavailable, listener }
}

const disconnects: (() => void)[] = []
afterEach(() => {
  disconnects.splice(0).forEach((stop) => stop())
})

describe('createSseParser', () => {
  it('handles a message split across chunks, several in one chunk, comments and CRLF', () => {
    const seen: [string, string][] = []
    const push = createSseParser((event, data) => seen.push([event, data]))
    push('event: signal\ndata: {"a"')
    expect(seen).toEqual([])
    push(':1}\n\n: keepalive\n\nevent: prices\r\ndata: {"b":2}\r\n\r\nevent: scan\ndata: {}\n\n')
    expect(seen).toEqual([
      ['signal', '{"a":1}'],
      ['prices', '{"b":2}'],
      ['scan', '{}'],
    ])
  })
})

describe('createScannerFeed', () => {
  it('delivers events as they arrive and turns a null RSI back into NaN', async () => {
    const stream = streamResponse()
    const { events, connection, listener } = recorder()
    const fetchImpl = vi.fn(async () => stream.response)
    disconnects.push(createScannerFeed({ baseUrl: 'http://api/', fetchImpl: fetchImpl as unknown as typeof fetch }).connect(listener, '5minute'))

    await vi.waitFor(() => expect(connection).toContain('connected'))
    expect(fetchImpl.mock.calls[0]).toEqual(expect.arrayContaining(['http://api/api/scanner/stream?interval=5minute']))
    stream.push('event: signal\ndata: {"rows":[{"symbol":"A","rsi":null}]}\n\n')
    await vi.waitFor(() => expect(events).toHaveLength(1))
    const event = events[0] as Extract<ScannerFeedEvent, { type: 'signal' }>
    expect(event.type).toBe('signal')
    expect(event.rows[0].rsi).toBeNaN()
  })

  it('reconnects after the stream drops', async () => {
    const first = streamResponse()
    const second = streamResponse()
    const fetchImpl = vi.fn().mockResolvedValueOnce(first.response).mockResolvedValueOnce(second.response)
    const { connection, events, listener } = recorder()
    disconnects.push(createScannerFeed({ fetchImpl, minRetryMs: 1 }).connect(listener, '5minute'))

    await vi.waitFor(() => expect(connection).toContain('connected'))
    first.close()
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2))
    expect(connection).toContain('disconnected')
    await vi.waitFor(() => expect(connection.at(-1)).toBe('connected'))
    second.push('event: progress\ndata: {"done":1,"total":2}\n\n')
    await vi.waitFor(() => expect(events).toHaveLength(1))
  })

  it('keeps retrying while the server is unreachable', async () => {
    const stream = streamResponse()
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(new Response('', { status: 502 })).mockResolvedValueOnce(stream.response)
    const { connection, listener } = recorder()
    disconnects.push(createScannerFeed({ fetchImpl, minRetryMs: 1 }).connect(listener, '5minute'))
    await vi.waitFor(() => expect(connection.at(-1)).toBe('connected'))
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('reconnects when a connection goes silent', async () => {
    const silent = streamResponse()
    const next = streamResponse()
    // A real fetch errors its body when the request is aborted.
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      if (fetchImpl.mock.calls.length > 1) return next.response
      init.signal?.addEventListener('abort', () => silent.close())
      return silent.response
    })
    const { connection, listener } = recorder()
    disconnects.push(createScannerFeed({ fetchImpl: fetchImpl as unknown as typeof fetch, minRetryMs: 1, silenceLimitMs: 10 }).connect(listener, '5minute'))
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2))
    expect(connection).toContain('disconnected')
  })

  it.each([
    ['an old backend without the route', () => new Response('', { status: 404 })],
    ['the scanner switched off', () => new Response('{"detail":"switched off (SCANNER_ENABLED)."}', { status: 503 })],
  ])('reports %s as unavailable and stops', async (_name, makeResponse) => {
    const fetchImpl = vi.fn(async () => makeResponse())
    const { onUnavailable, listener } = recorder()
    disconnects.push(createScannerFeed({ fetchImpl: fetchImpl as unknown as typeof fetch, minRetryMs: 1 }).connect(listener, '5minute'))
    await vi.waitFor(() => expect(onUnavailable).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('treats any other 503 (a server still starting) as temporary', async () => {
    const stream = streamResponse()
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('booting', { status: 503 })).mockResolvedValueOnce(stream.response)
    const { connection, onUnavailable, listener } = recorder()
    disconnects.push(createScannerFeed({ fetchImpl, minRetryMs: 1 }).connect(listener, '5minute'))
    await vi.waitFor(() => expect(connection.at(-1)).toBe('connected'))
    expect(onUnavailable).not.toHaveBeenCalled()
  })

  it('stops for good after a 401: authFetch has logged the user out', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 401 }))
    const { listener } = recorder()
    disconnects.push(createScannerFeed({ fetchImpl: fetchImpl as unknown as typeof fetch, minRetryMs: 1 }).connect(listener, '5minute'))
    await new Promise((resolve) => setTimeout(resolve, 15))
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('disconnecting aborts the request and ends the retries', async () => {
    let signal: AbortSignal | undefined
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined
      return streamResponse().response
    })
    const { connection, listener } = recorder()
    const stop = createScannerFeed({ fetchImpl: fetchImpl as unknown as typeof fetch, minRetryMs: 1 }).connect(listener, '5minute')
    await vi.waitFor(() => expect(connection).toContain('connected'))
    stop()
    expect(signal?.aborted).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('signalCloseTime', () => {
  it('is the close of the candle, not its start: the 09:50 candle is a 09:55 signal', () => {
    const start = Date.parse('2026-11-06T09:50:00+05:30') / 1000
    const close = Date.parse('2026-11-06T09:55:00+05:30') / 1000
    expect(signalCloseTime({ time: start }, '5minute')).toBe(close)
    expect(signalCloseTime({ time: start, barCloseAt: close }, '5minute')).toBe(close)
    expect(signalCloseTime({ time: start }, '15minute')).toBe(start + 900)
  })

  it('leaves a daily bar on its own date', () => {
    expect(signalCloseTime({ time: 1000 }, '1day')).toBe(1000)
  })
})
