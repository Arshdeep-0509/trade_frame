import { useMemo, useState } from 'react'
import { sectorStrength, type SectorStrengthEntry } from '../../analytics/aggregate'
import { EmptyState } from '../../components/ui'
import type { IntradayStore } from '../../store/intradayStore'
import { formatNumber } from '../../lib/formatters'
import { useRenderCount } from '../../lib/renderCounter'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { BarRow, TipBar } from './BarRows'

const TOP_N = 10

export interface SectorStrengthProps {
  store: IntradayStore
}

interface HoverState {
  entry: SectorStrengthEntry
}

/** The same one-line Strength definition StrengthInfo's popover leads with — repeated here so the tooltip is self-contained, not just a reference to go find elsewhere. */
const STRENGTH_REMINDER = 'Strength = zMove × √rvol × persistence-factor — our own conviction metric, not a claim about direction.'

function SectorTooltip({ entry }: { entry: SectorStrengthEntry }) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 w-52 -translate-x-1/2 rounded border border-border bg-panel p-2 text-left text-[10px] shadow-lg"
    >
      <p className="font-medium text-text-primary">{entry.sector}</p>
      <p className="mt-0.5 text-text-secondary">
        Mean strength{' '}
        <span className="font-mono text-text-primary">{Number.isNaN(entry.meanStrength) ? '—' : formatNumber(entry.meanStrength, 1)}</span> ·{' '}
        {entry.count} names
      </p>
      {entry.topConstituents.length > 0 && (
        <ul className="mt-1 space-y-0.5 border-t border-border-hairline pt-1 text-text-secondary">
          {entry.topConstituents.map((c) => (
            <li key={c.token} className="flex justify-between gap-2">
              <span className="truncate text-text-primary">{c.symbol}</span>
              <span className="font-mono">{formatNumber(c.strength, 1)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 border-t border-border-hairline pt-1 text-text-muted">{STRENGTH_REMINDER}</p>
    </div>
  )
}

/**
 * One horizontal bar per sector, mean Strength, descending — top 10 sectors
 * with the rest folded into a final 'Others' bar (sectorStrength()'s own
 * topN option, so the fold is computed honestly from the real rows, never
 * a mean-of-means). A single accent colour throughout: this chart ranks
 * sectors against EACH OTHER on one measure, not two opposing directions
 * the way MarketMeter/IndexMeter do, so there's nothing for a second hue
 * to encode.
 */
export function SectorStrength({ store }: SectorStrengthProps) {
  // The 1s meter snapshot (meterRows), not live rows: this chart recomputes once a second, never per tick.
  useRenderCount('SectorStrength')
  const rows = store((s) => s.meterRows)
  const activeSector = store((s) => s.filters.sector)
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [hover, setHover] = useState<HoverState | null>(null)

  const entries = useMemo(() => sectorStrength(rows, { topN: TOP_N }), [rows])
  const finiteMeans = entries.map((e) => e.meanStrength).filter((v) => !Number.isNaN(v))
  const axisMax = Math.max(0.1, ...finiteMeans)
  const transition = prefersReducedMotion ? 'none' : 'width 200ms ease'

  function toggleSector(sector: string): void {
    store.getState().setFilters({ sector: store.getState().filters.sector === sector ? null : sector })
  }

  if (rows.length === 0) {
    return <EmptyState title="No F&O names loaded yet." description="Sector strength will appear once the universe finishes loading." />
  }
  if (finiteMeans.length === 0) {
    return (
      <EmptyState
        title="No sector has enough session history for a Strength value yet."
        description="Strength needs at least 5 sessions of history per name — see the Strength column's own tooltip."
      />
    )
  }

  const ariaLabel = `Sector strength, ${entries.length} sectors, sorted descending. Strongest: ${entries[0]?.sector ?? 'none'} at ${Number.isNaN(entries[0]?.meanStrength) ? 'no value' : formatNumber(entries[0].meanStrength, 1)}.`

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5" role="group" aria-label={ariaLabel}>
        {entries.map((entry) => {
          const finite = !Number.isNaN(entry.meanStrength)
          const active = activeSector === entry.sector
          return (
            <BarRow
              key={entry.sector}
              label={entry.sector}
              labelClassName="w-28"
              ariaLabel={`Filter to ${entry.sector}, mean strength ${finite ? formatNumber(entry.meanStrength, 1) : 'not available'}, ${entry.count} names`}
              active={active}
              hovered={hover?.entry.sector === entry.sector}
              tooltip={<SectorTooltip entry={entry} />}
              onToggle={() => toggleSector(entry.sector)}
              onHoverChange={(on) => setHover(on ? { entry } : null)}
            >
              <TipBar
                fraction={finite ? Math.max(0, entry.meanStrength) / axisMax : 0}
                fillClassName="bg-neutral"
                dimmed={activeSector !== null && !active}
                transition={transition}
                value={finite ? formatNumber(entry.meanStrength, 1) : '—'}
              />
            </BarRow>
          )
        })}
      </div>

      {/* sr-only goes on a wrapper, never on the <table> itself: a table can't shrink below its content, so an sr-only TABLE still widened the page at 360px. */}
      <div className="sr-only">
        <table>
          <caption>Sector strength</caption>
          <thead>
            <tr>
              <th scope="col">Sector</th>
              <th scope="col">Mean strength</th>
              <th scope="col">Names</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.sector}>
                <th scope="row">{entry.sector}</th>
                <td>{Number.isNaN(entry.meanStrength) ? '—' : formatNumber(entry.meanStrength, 1)}</td>
                <td>{entry.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
