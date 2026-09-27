import { useMemo, useState } from 'react'
import { indexMeter, type IndexMeterEntry } from '../../analytics/aggregate'
import { INDEX_PANELS } from '../../data/reference/indices'
import type { IndexKey } from '../../types/domain'
import type { IntradayStore } from '../../store/intradayStore'
import { formatNumber } from '../../lib/formatters'
import { useRenderCount } from '../../lib/renderCounter'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { BarRow, TipBar, ZeroLine } from './BarRows'

const THRESHOLD = 0.5

export interface IndexMeterProps {
  store: IntradayStore
}

interface HoverState {
  entry: IndexMeterEntry
}

function GroupTooltip({ entry }: { entry: IndexMeterEntry }) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 w-48 -translate-x-1/2 rounded border border-border bg-panel p-2 text-left text-[10px] shadow-lg"
    >
      <p className="font-medium text-text-primary">{entry.label}</p>
      <p className="mt-0.5 text-text-secondary">
        <span className="text-bullish">▲ {formatNumber(entry.upPct, 1)}%</span> · <span className="text-bearish">▼ {formatNumber(entry.downPct, 1)}%</span> ·{' '}
        {entry.count} names
      </p>
      {entry.topConstituents.length > 0 && (
        <ul className="mt-1 space-y-0.5 border-t border-border-hairline pt-1 text-text-secondary">
          {entry.topConstituents.map((c) => (
            <li key={c.token} className="flex justify-between gap-2">
              <span className="truncate text-text-primary">{c.symbol}</span>
              <span className="font-mono">{Number.isNaN(c.strength) ? '—' : formatNumber(c.strength, 1)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * A butterfly chart, one flat-labelled row per index: red down% growing left
 * from a shared centre line, green up% growing right. Both sides share one
 * scale, so a 60%-up index and a 60%-down index draw bars of equal length.
 * Recomputes indexMeter() from the 1s `meterRows` snapshot, same rationale
 * as MarketMeter.
 */
export function IndexMeter({ store }: IndexMeterProps) {
  // The 1s meter snapshot (meterRows), not live rows: this chart recomputes once a second, never per tick.
  useRenderCount('IndexMeter')
  const rows = store((s) => s.meterRows)
  const activeIndex = store((s) => s.filters.index)
  // Cross-panel reactivity with MarketMeter: a direction filter set there
  // (clicking its Up/Down bar) de-emphasises the opposite-direction bar
  // here across every index, without changing the computed values — the
  // numbers stay honest, only the visual emphasis follows the filter.
  const direction = store((s) => s.filters.direction)
  const dimUpBars = direction === 'down'
  const dimDownBars = direction === 'up'
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [hover, setHover] = useState<HoverState | null>(null)

  const entries = useMemo(() => {
    const computed = indexMeter(rows, INDEX_PANELS, THRESHOLD)
    return [...computed].sort((a, b) => b.upPct - a.upPct)
  }, [rows])

  const axisMax = Math.max(1, ...entries.map((e) => Math.max(e.upPct, e.downPct)))
  const transition = prefersReducedMotion ? 'none' : 'width 200ms ease'

  function toggleIndex(key: IndexKey): void {
    store.getState().setFilters({ index: store.getState().filters.index === key ? null : key })
  }


  const ariaLabel = `Index meter, ${entries.length} indices, sorted by advance percentage descending. Strongest: ${entries[0]?.label ?? 'none'} at ${formatNumber(entries[0]?.upPct ?? 0, 1)} percent up.`

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1 text-[10px] text-text-muted" aria-hidden="true">
        <span className="w-[76px] shrink-0" />
        <span className="flex flex-1 items-center">
          <span className="flex flex-1 items-center justify-end gap-1 pr-2">
            <span className="h-2 w-2 rounded-sm bg-bearish" />
            Down %
          </span>
          <span className="w-px shrink-0" />
          <span className="flex flex-1 items-center gap-1 pl-2">
            <span className="h-2 w-2 rounded-sm bg-bullish" />
            Up %
          </span>
        </span>
      </div>
      <div className="flex flex-col gap-0.5" role="group" aria-label={ariaLabel}>
        {entries.map((entry) => {
          const active = activeIndex === entry.key
          const dimmed = activeIndex !== null && !active
          return (
            <BarRow
              key={entry.key}
              label={entry.label}
              labelClassName="w-[76px]"
              ariaLabel={`Filter to ${entry.label}, ${formatNumber(entry.upPct, 1)}% up, ${formatNumber(entry.downPct, 1)}% down, ${entry.count} names`}
              active={active}
              hovered={hover?.entry.key === entry.key}
              tooltip={<GroupTooltip entry={entry} />}
              onToggle={() => toggleIndex(entry.key)}
              onHoverChange={(on) => setHover(on ? { entry } : null)}
            >
              <TipBar
                grow="left"
                fraction={entry.downPct / axisMax}
                fillClassName="bg-bearish"
                dimmed={dimmed || dimDownBars}
                transition={transition}
                value={`${formatNumber(entry.downPct, 0)}%`}
              />
              <ZeroLine />
              <TipBar
                fraction={entry.upPct / axisMax}
                fillClassName="bg-bullish"
                dimmed={dimmed || dimUpBars}
                transition={transition}
                value={`${formatNumber(entry.upPct, 0)}%`}
              />
            </BarRow>
          )
        })}
      </div>

      {/* sr-only goes on a wrapper, never on the <table> itself: a table can't shrink below its content, so an sr-only TABLE still widened the page at 360px. */}
      <div className="sr-only">
        <table>
          <caption>Index meter</caption>
          <thead>
            <tr>
              <th scope="col">Index</th>
              <th scope="col">Up %</th>
              <th scope="col">Down %</th>
              <th scope="col">Constituents</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.key}>
                <th scope="row">{entry.label}</th>
                <td>{formatNumber(entry.upPct, 1)}%</td>
                <td>{formatNumber(entry.downPct, 1)}%</td>
                <td>{entry.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
