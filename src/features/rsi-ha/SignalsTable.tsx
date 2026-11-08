import { useEffect, useRef, useState, type RefObject } from 'react'
import { AlertTriangle, Maximize2, Minimize2 } from 'lucide-react'
import { IconButton } from '../../components/ui/IconButton'
import { Select } from '../../components/ui/Select'
import { cn } from '../../lib/cn'
import { formatISTDate, formatISTTime } from '../../lib/formatters'
import type { ScreenerStore } from '../../store/screenerStore'
import { CANDLE_INTERVAL_OPTIONS, isDailyInterval } from '../../strategy/constants'
import { CandleTimer } from './CandleTimer'
import { ExchangeChip, InstrumentTypeChip, PriceCell, SignalBadge } from './cells'
import { getInstrumentType, isDerivedRow } from './rowHelpers'
import type { SignalRow } from './scannerFeed'

const HEADERS = ['Time', 'Symbol', 'Type', 'Signal', 'Price', 'RSI']
const NUMERIC_HEADERS = new Set(['Price', 'RSI'])
/** NSE rows are the stocks themselves; NFO rows are futures and options. */
const MARKETS = ['NSE', 'NFO'] as const
type Market = (typeof MARKETS)[number]

function SignalTime({ row, daily }: { row: SignalRow; daily: boolean }) {
  const closed = new Date(row.barCloseAt * 1000)
  const delay = row.detectedAt === undefined ? null : Math.max(0, row.detectedAt - row.barCloseAt)
  const title = delay === null ? undefined : `Candle closed ${formatISTTime(closed)} · signal found ${delay.toFixed(1)}s later`
  return (
    <span title={title} className="whitespace-nowrap font-mono tabular-nums text-text-secondary">
      {daily ? formatISTDate(closed) : formatISTTime(closed)}
    </span>
  )
}

function Row({ row, daily }: { row: SignalRow; daily: boolean }) {
  return (
    <tr className="border-b border-border-hairline text-sm">
      <td className="px-3 py-2">
        <SignalTime row={row} daily={daily} />
      </td>
      <td className="px-3 py-2">
        <span className="flex items-center gap-1.5 whitespace-nowrap font-medium text-text-primary">
          {row.symbol}
          <ExchangeChip exchange={row.exchange} />
        </span>
      </td>
      <td className="px-3 py-2">
        <InstrumentTypeChip type={getInstrumentType(row)} />
      </td>
      <td className="px-3 py-2">
        <SignalBadge signal={row.signal} />
      </td>
      <td className="px-3 py-2 text-right">
        <PriceCell price={row.price} />
      </td>
      <td
        title={isDerivedRow(row) ? `RSI of ${row.derivedFrom}` : undefined}
        className={cn('px-3 py-2 text-right font-mono tabular-nums', isDerivedRow(row) ? 'text-text-secondary' : 'text-text-primary')}
      >
        {Number.isNaN(row.rsi) ? '—' : row.rsi.toFixed(1)}
      </td>
    </tr>
  )
}

function Failures({ store }: { store: ScreenerStore }) {
  const errors = store((s) => s.errors)
  const problem = store((s) => s.problem)
  const [expanded, setExpanded] = useState(false)

  if (problem) {
    return (
      <p role="alert" className="flex items-center gap-2 border-b border-border bg-warning/10 px-3 py-1.5 text-xs text-warning">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        {problem}
      </p>
    )
  }
  if (errors.length === 0) return null

  return (
    <div className="border-b border-border bg-warning/10 px-3 py-1.5 text-xs text-warning">
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)} className="flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        {errors.length} instrument{errors.length === 1 ? '' : 's'} could not be scanned
      </button>
      {expanded && (
        <ul className="mt-1 max-h-32 overflow-y-auto text-text-secondary">
          {errors.map((error) => (
            <li key={error.symbol}>
              <span className="font-medium text-text-primary">{error.symbol}</span> {error.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function EmptyState({ store, market }: { store: ScreenerStore; market: Market }) {
  const lastScanAt = store((s) => s.lastScanAt)
  const universeSize = store((s) => s.universeSize)
  const { done, total } = store((s) => s.scanProgress)

  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-8 text-center text-sm">
      {lastScanAt === null ? (
        <p role="status" className="text-text-secondary">
          Loading{total > 0 ? ` ${done} of ${total} instruments` : '…'}
        </p>
      ) : (
        <p className="text-text-secondary">
          No {market} signal today. {universeSize} instruments checked at {formatISTTime(new Date(lastScanAt * 1000))}.
        </p>
      )}
    </div>
  )
}

function useFullScreen(target: RefObject<HTMLElement | null>): { active: boolean; toggle: () => void } {
  const [active, setActive] = useState(false)

  useEffect(() => {
    // Also fires when the browser leaves full screen by itself, on Escape.
    const sync = () => setActive(document.fullscreenElement === target.current)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [target])

  function toggle(): void {
    const request = active ? document.exitFullscreen() : target.current?.requestFullscreen()
    request?.catch(() => {}) // refused by the browser: the page simply stays as it is
  }

  return { active, toggle }
}

export function SignalsTable({ store }: { store: ScreenerStore }) {
  const allRows = store((s) => s.rows)
  const candleInterval = store((s) => s.candleInterval)
  const daily = isDailyInterval(candleInterval)
  const [market, setMarket] = useState<Market>('NFO')
  const rows = allRows.filter((row) => row.exchange === market)
  const page = useRef<HTMLDivElement>(null)
  const fullScreen = useFullScreen(page)

  useEffect(() => {
    store.getState().start()
    return () => store.getState().stop()
  }, [store])

  return (
    <div ref={page} className="flex h-full flex-col bg-surface">
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-panel px-3 py-1.5">
        <Select aria-label="Timeframe" value={candleInterval} onChange={(e) => store.getState().setCandleInterval(e.target.value)}>
          {CANDLE_INTERVAL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <div role="group" aria-label="Market" className="flex gap-1">
          {MARKETS.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={market === name}
              onClick={() => setMarket(name)}
              className={cn(
                'rounded border px-3 py-1 text-xs font-medium transition-colors',
                market === name ? 'border-neutral bg-neutral/15 text-neutral' : 'border-border text-text-secondary hover:text-text-primary',
              )}
            >
              {name}
            </button>
          ))}
        </div>
        <CandleTimer candleInterval={candleInterval} />
        <IconButton aria-label={fullScreen.active ? 'Exit full screen' : 'Full screen'} title={fullScreen.active ? 'Exit full screen' : 'Full screen'} onClick={fullScreen.toggle} className="ml-auto">
          {fullScreen.active ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </IconButton>
      </div>

      <Failures store={store} />

      <div className="min-h-0 flex-1 overflow-auto">
        {rows.length === 0 ? (
          <EmptyState store={store} market={market} />
        ) : (
          <table className="w-full min-w-[560px] border-collapse">
            <thead className="sticky top-0 bg-panel">
              <tr className="border-b border-border text-left text-xs font-medium text-text-secondary">
                {HEADERS.map((header) => (
                  <th key={header} scope="col" className={`px-3 py-2 font-medium ${NUMERIC_HEADERS.has(header) ? 'text-right' : ''}`}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Row key={row.id} row={row} daily={daily} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
