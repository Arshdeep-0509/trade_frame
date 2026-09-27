import { Info } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  CAP_WEIGHT_CAVEAT,
  intradayIndex,
  intradayIndexTooltip,
  type IntradayIndexEntry,
  type IntradayIndexPriceBasis,
  type IntradayIndexWeighting,
} from '../../analytics/aggregate'
import { EmptyState, Tooltip } from '../../components/ui'
import type { IntradayStore } from '../../store/intradayStore'
import { cn } from '../../lib/cn'
import { formatNumber } from '../../lib/formatters'
import { useRenderCount } from '../../lib/renderCounter'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { BarRow, TipBar, ZeroLine } from './BarRows'

export interface IntradayIndexChartProps {
  store: IntradayStore
}

interface HoverState {
  entry: IntradayIndexEntry
}

/** Diverging axis gridlines land on every 0.5% — the spec's own choice, not a generic "nice number" step. */
const GRID_STEP = 0.5

const WEIGHTING_OPTIONS: { value: IntradayIndexWeighting; label: string }[] = [
  { value: 'equal', label: 'Equal-weight' },
  { value: 'cap', label: 'Cap-weight (approx.)' },
]
const PRICE_BASIS_OPTIONS: { value: IntradayIndexPriceBasis; label: string }[] = [
  { value: 'prevClose', label: 'vs previous close' },
  { value: 'dayOpen', label: 'vs day open' },
]

function formatSigned(value: number): string {
  if (Number.isNaN(value)) return '—'
  return `${value > 0 ? '+' : ''}${formatNumber(value, 1)}%`
}

function changeClass(value: number): string {
  if (Number.isNaN(value) || value === 0) return 'text-text-secondary'
  return value > 0 ? 'text-bullish' : 'text-bearish'
}

function IndexTooltip({
  entry,
  weighting,
  priceBasis,
}: {
  entry: IntradayIndexEntry
  weighting: IntradayIndexWeighting
  priceBasis: IntradayIndexPriceBasis
}) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 w-56 -translate-x-1/2 rounded border border-border bg-panel p-2 text-left text-[10px] shadow-lg"
    >
      <p className="font-medium text-text-primary">{entry.sector}</p>
      <p className="mt-0.5 text-text-secondary">
        Mean change <span className={cn('font-mono', changeClass(entry.meanChangePct))}>{formatSigned(entry.meanChangePct)}</span> ·{' '}
        {entry.count} names
      </p>
      {(entry.best || entry.worst) && (
        <div className="mt-1 space-y-0.5 border-t border-border-hairline pt-1 text-text-secondary">
          {entry.best && (
            <p className="flex justify-between gap-2">
              <span className="truncate text-text-primary">Best: {entry.best.row.symbol}</span>
              <span className={cn('shrink-0 font-mono', changeClass(entry.best.changePct))}>{formatSigned(entry.best.changePct)}</span>
            </p>
          )}
          {entry.worst && (
            <p className="flex justify-between gap-2">
              <span className="truncate text-text-primary">Worst: {entry.worst.row.symbol}</span>
              <span className={cn('shrink-0 font-mono', changeClass(entry.worst.changePct))}>{formatSigned(entry.worst.changePct)}</span>
            </p>
          )}
        </div>
      )}
      <p className="mt-1 border-t border-border-hairline pt-1 text-text-secondary">
        Breakout <span className="font-mono text-bullish">▲{entry.breakoutUpCount}</span> · BreakDown{' '}
        <span className="font-mono text-bearish">▼{entry.breakoutDownCount}</span>
      </p>
      <p className="mt-1 border-t border-border-hairline pt-1 text-text-muted">{intradayIndexTooltip(weighting, priceBasis)}</p>
    </div>
  )
}

/**
 * The wide diverging bar chart under the meter row — mean change per sector
 * (green above zero, red below), computed from the 1s `meterRows` snapshot via
 * analytics/aggregate.ts's intradayIndex(). Two controls change WHICH
 * number that mean is: weighting (equal vs. cap-weighted by cachedClose)
 * and price basis (vs. previous close vs. vs. today's open) — both are
 * local UI state, not global dashboard filters, since they change how this
 * one chart computes rather than which rows the rest of the page shows.
 * Switching either visibly reorders the bars, which is deliberate: it's the
 * clearest possible proof that this number is computed, not decorative.
 */
export function IntradayIndexChart({ store }: IntradayIndexChartProps) {
  // The 1s meter snapshot (meterRows), not live rows: this chart recomputes once a second, never per tick.
  useRenderCount('IntradayIndexChart')
  const rows = store((s) => s.meterRows)
  const activeSector = store((s) => s.filters.sector)
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  // Wide enough for one upright column per sector with its label flat underneath; narrower, one row per sector.
  const columns = useMediaQuery('(min-width: 1280px)')
  const [weighting, setWeighting] = useState<IntradayIndexWeighting>('equal')
  const [priceBasis, setPriceBasis] = useState<IntradayIndexPriceBasis>('prevClose')
  const [hover, setHover] = useState<HoverState | null>(null)

  const entries = useMemo(() => intradayIndex(rows, { weighting, priceBasis }), [rows, weighting, priceBasis])
  const finiteEntries = entries.filter((e) => !Number.isNaN(e.meanChangePct))
  const rawMax = Math.max(0, ...finiteEntries.map((e) => Math.abs(e.meanChangePct)))
  // Symmetric, always a multiple of the grid step, never auto-scaled per side — a +1% sector and a -1% sector get equal visual weight.
  const axisMax = Math.max(GRID_STEP, Math.ceil(rawMax / GRID_STEP) * GRID_STEP)
  const transition = prefersReducedMotion ? 'none' : 'width 200ms ease, height 200ms ease'

  function toggleSector(sector: string): void {
    store.getState().setFilters({ sector: store.getState().filters.sector === sector ? null : sector })
  }


  const weightLabel = weighting === 'cap' ? 'cap-weighted (approx.)' : 'equal-weighted'
  const basisLabel = priceBasis === 'dayOpen' ? "vs today's open" : 'vs previous close'
  const strongest = finiteEntries[0]
  const weakest = finiteEntries.length > 0 ? finiteEntries[finiteEntries.length - 1] : undefined
  const ariaLabel =
    `Intraday index by sector, ${entries.length} sectors, ${weightLabel}, ${basisLabel}.` +
    (strongest ? ` Strongest: ${strongest.sector} at ${formatSigned(strongest.meanChangePct)}.` : '') +
    (weakest && weakest !== strongest ? ` Weakest: ${weakest.sector} at ${formatSigned(weakest.meanChangePct)}.` : '')

  const controls = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <div role="radiogroup" aria-label="Weight by" className="inline-flex overflow-hidden rounded border border-border-hairline">
        {WEIGHTING_OPTIONS.map((opt, i) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={weighting === opt.value}
            onClick={() => setWeighting(opt.value)}
            className={cn(
              'px-1.5 py-0.5 text-[10px] font-medium transition-colors',
              i > 0 && 'border-l border-border-hairline',
              weighting === opt.value ? 'bg-neutral/20 text-neutral' : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {opt.label}
          </button>
        ))}
        <Tooltip label={CAP_WEIGHT_CAVEAT} side="bottom">
          <span className="flex items-center border-l border-border-hairline px-1 text-text-muted">
            <Info className="h-3 w-3" aria-label="What cap-weight (approx.) means here" />
          </span>
        </Tooltip>
      </div>

      <div role="radiogroup" aria-label="Price basis" className="inline-flex overflow-hidden rounded border border-border-hairline">
        {PRICE_BASIS_OPTIONS.map((opt, i) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={priceBasis === opt.value}
            onClick={() => setPriceBasis(opt.value)}
            className={cn(
              'px-1.5 py-0.5 text-[10px] font-medium transition-colors',
              i > 0 && 'border-l border-border-hairline',
              priceBasis === opt.value ? 'bg-neutral/20 text-neutral' : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {controls}
        <EmptyState title="No F&O names loaded yet." description="The intraday index will appear once the universe finishes loading." />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {controls}

      {columns ? (
        <DivergingColumns
          entries={entries}
          axisMax={axisMax}
          activeSector={activeSector}
          transition={transition}
          hover={hover}
          onHover={setHover}
          onToggle={toggleSector}
          ariaLabel={ariaLabel}
          weighting={weighting}
          priceBasis={priceBasis}
        />
      ) : (
        <DivergingRows
          entries={entries}
          axisMax={axisMax}
          activeSector={activeSector}
          transition={transition}
          hover={hover}
          onHover={setHover}
          onToggle={toggleSector}
          ariaLabel={ariaLabel}
          weighting={weighting}
          priceBasis={priceBasis}
        />
      )}

      {/* sr-only goes on a wrapper, never on the <table> itself: a table can't shrink below its content, so an sr-only TABLE still widened the page at 360px. */}
      <div className="sr-only">
        <table>
          <caption>Intraday index</caption>
          <thead>
            <tr>
              <th scope="col">Sector</th>
              <th scope="col">Mean change</th>
              <th scope="col">Names</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.sector}>
                <th scope="row">{entry.sector}</th>
                <td>{Number.isNaN(entry.meanChangePct) ? '—' : formatSigned(entry.meanChangePct)}</td>
                <td>{entry.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface DivergingRowsProps {
  entries: IntradayIndexEntry[]
  axisMax: number
  activeSector: string | null
  transition: string
  hover: HoverState | null
  onHover: (h: HoverState | null) => void
  onToggle: (sector: string) => void
  ariaLabel: string
  weighting: IntradayIndexWeighting
  priceBasis: IntradayIndexPriceBasis
}

/** Room (px) kept past a bar's tip for its value label, so the longest bar's label stays inside the plot. */
const COLUMN_VALUE_ROOM_PX = 16
/** Height (px) of each half of the upright chart — gains above the zero line, losses below. */
const COLUMN_HALF_PX = 80

/**
 * xl and up: one upright column per sector, green above the zero line and
 * red below, on one symmetric scale. Labels sit flat under the plot, wrapped
 * to at most two lines (full name in the tooltip) — never rotated.
 */
function DivergingColumns({ entries, axisMax, activeSector, transition, hover, onHover, onToggle, ariaLabel, weighting, priceBasis }: DivergingRowsProps) {
  const barHeight = (fraction: number): string => `calc((100% - ${COLUMN_VALUE_ROOM_PX}px) * ${fraction})`
  return (
    <div role="group" aria-label={ariaLabel} className="relative flex">
      <span className="pointer-events-none absolute inset-x-0 h-px bg-border" style={{ top: COLUMN_HALF_PX }} aria-hidden="true" />
      {entries.map((entry) => {
        const finite = !Number.isNaN(entry.meanChangePct)
        const fraction = finite ? Math.min(Math.abs(entry.meanChangePct) / axisMax, 1) : 0
        const positive = finite && entry.meanChangePct > 0
        const negative = finite && entry.meanChangePct < 0
        const active = activeSector === entry.sector
        const dimmed = activeSector !== null && !active
        const value = formatSigned(entry.meanChangePct)
        const valueText = <span className="whitespace-nowrap font-mono text-[10px] tabular-nums text-text-secondary">{value}</span>
        return (
          <div key={entry.sector} className="relative min-w-0 flex-1">
            <div
              role="button"
              tabIndex={0}
              aria-pressed={active}
              aria-label={`Filter to ${entry.sector}, mean change ${finite ? value : 'not available'}, ${entry.count} names`}
              onClick={() => onToggle(entry.sector)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onToggle(entry.sector)
                }
              }}
              onMouseEnter={() => onHover({ entry })}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover({ entry })}
              onBlur={() => onHover(null)}
              className={cn(
                'flex cursor-pointer flex-col items-center rounded px-0.5 pb-1 transition-colors hover:bg-text-primary/5 focus-visible:outline focus-visible:outline-1 focus-visible:outline-neutral',
                active && 'bg-neutral/10 hover:bg-neutral/15',
              )}
            >
              <div className="flex w-full flex-col items-center justify-end gap-0.5" style={{ height: COLUMN_HALF_PX }}>
                {(positive || !negative) && valueText}
                {positive && (
                  <span
                    data-bar
                    className={cn('w-3/5 max-w-[24px] rounded-t bg-bullish', dimmed && 'opacity-40')}
                    style={{ height: barHeight(fraction), minHeight: 2, transition }}
                  />
                )}
              </div>
              <div className="flex w-full flex-col items-center justify-start gap-0.5" style={{ height: COLUMN_HALF_PX }}>
                {negative && (
                  <>
                    <span
                      data-bar
                      className={cn('w-3/5 max-w-[24px] rounded-b bg-bearish', dimmed && 'opacity-40')}
                      style={{ height: barHeight(fraction), minHeight: 2, transition }}
                    />
                    {valueText}
                  </>
                )}
              </div>
              <span
                className={cn('mt-1.5 line-clamp-2 w-full break-words text-center text-[10px] leading-tight text-text-secondary', active && 'font-medium text-text-primary')}
                title={entry.sector}
              >
                {entry.sector}
              </span>
            </div>
            {hover?.entry.sector === entry.sector && (
              <div className="pointer-events-none absolute left-1/2 top-0 z-10 flex -translate-x-1/2 justify-center">
                <IndexTooltip entry={entry} weighting={weighting} priceBasis={priceBasis} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Below xl: one flat-labelled row per sector — red bars grow left of the
 * zero line, green bars right, on one symmetric scale. From lg the (already
 * sorted) rows flow down two columns: strongest sectors on the left,
 * weakest on the right, instead of one very tall list.
 */
function DivergingRows({ entries, axisMax, activeSector, transition, hover, onHover, onToggle, ariaLabel, weighting, priceBasis }: DivergingRowsProps) {
  const rowsPerColumn = Math.ceil(entries.length / 2)
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="grid grid-cols-1 gap-x-6 gap-y-0.5 lg:grid-flow-col lg:grid-cols-2 lg:[grid-template-rows:repeat(var(--rows),auto)]"
      style={{ '--rows': rowsPerColumn } as React.CSSProperties}
    >
      {entries.map((entry) => {
        const finite = !Number.isNaN(entry.meanChangePct)
        const fraction = finite ? Math.min(Math.abs(entry.meanChangePct) / axisMax, 1) : 0
        const positive = finite && entry.meanChangePct > 0
        const negative = finite && entry.meanChangePct < 0
        const active = activeSector === entry.sector
        const dimmed = activeSector !== null && !active
        const value = formatSigned(entry.meanChangePct)
        return (
          <BarRow
            key={entry.sector}
            label={entry.sector}
            labelClassName="w-28"
            ariaLabel={`Filter to ${entry.sector}, mean change ${finite ? value : 'not available'}, ${entry.count} names`}
            active={active}
            hovered={hover?.entry.sector === entry.sector}
            tooltip={<IndexTooltip entry={entry} weighting={weighting} priceBasis={priceBasis} />}
            onToggle={() => onToggle(entry.sector)}
            onHoverChange={(on) => onHover(on ? { entry } : null)}
          >
            <TipBar
              grow="left"
              fraction={negative ? fraction : 0}
              fillClassName="bg-bearish"
              dimmed={dimmed}
              transition={transition}
              value={negative ? value : ''}
            />
            <ZeroLine />
            <TipBar
              fraction={positive ? fraction : 0}
              fillClassName="bg-bullish"
              dimmed={dimmed}
              transition={transition}
              value={positive || !negative ? value : ''}
            />
          </BarRow>
        )
      })}
    </div>
  )
}
