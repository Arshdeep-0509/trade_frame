import { useEffect, useMemo, useState } from 'react'
import { smartMoney, smartMoneyTooltip, SMART_MONEY_SUBTITLE, type SmartMoneyEntry } from '../../analytics/aggregate'
import { EmptyState } from '../../components/ui'
import type { IntradayStore } from '../../store/intradayStore'
import { formatNumber } from '../../lib/formatters'
import { useRenderCount } from '../../lib/renderCounter'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { BarRow, TipBar } from './BarRows'

export interface SmartMoneyProps {
  store: IntradayStore
}

interface HoverState {
  entry: SmartMoneyEntry
}

function SmartMoneyTooltip({ entry, minRvol, minZMove }: { entry: SmartMoneyEntry; minRvol: number; minZMove: number }) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 w-56 -translate-x-1/2 rounded border border-border bg-panel p-2 text-left text-[10px] shadow-lg"
    >
      <p className="font-medium text-text-primary">{entry.sector}</p>
      <p className="mt-0.5 text-text-secondary">{smartMoneyTooltip(minRvol, minZMove)}</p>
      <ul className="mt-1 space-y-0.5 border-t border-border-hairline pt-1 text-text-secondary">
        {entry.matches.map((m) => (
          <li key={m.token} className="flex justify-between gap-2">
            <span className="truncate text-text-primary">{m.symbol}</span>
            <span className="font-mono">
              rvol {formatNumber(m.rvol, 1)} · z {m.zMove > 0 ? '+' : ''}
              {formatNumber(m.zMove, 1)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * One horizontal bar per sector, COUNT of names currently meeting BOTH the
 * rvol and |zMove| thresholds — top 5, descending, in the app's warning
 * (amber) token. "Smart money" is an easy label to over-read as seeing
 * real order flow, so the subtitle and tooltip both say plainly what this
 * actually is: a crowding count from price and volume only.
 */
export function SmartMoney({ store }: SmartMoneyProps) {
  // The 1s meter snapshot (meterRows), not live rows: this chart recomputes once a second, never per tick.
  useRenderCount('SmartMoney')
  const rows = store((s) => s.meterRows)
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [minRvol, setMinRvol] = useState(2)
  const [minZMove, setMinZMove] = useState(1)
  const [hover, setHover] = useState<HoverState | null>(null)
  const [activeSector, setActiveSector] = useState<string | null>(null)

  const entries = useMemo(() => smartMoney(rows, { minRvol, minZMove }), [rows, minRvol, minZMove])

  // Clicking a bar filters to those SPECIFIC names, not the whole sector —
  // and stays live: if the qualifying set for the active sector changes
  // (a tick, a threshold edit), the filter tracks it rather than freezing
  // a stale token list.
  useEffect(() => {
    if (activeSector === null) return
    const entry = entries.find((e) => e.sector === activeSector)
    if (!entry || entry.matches.length === 0) {
      setActiveSector(null)
      store.getState().setFilters({ tokens: null })
      return
    }
    store.getState().setFilters({ tokens: entry.matches.map((m) => m.token) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSector, entries])

  function toggleSector(sector: string): void {
    if (activeSector === sector) {
      setActiveSector(null)
      store.getState().setFilters({ tokens: null })
    } else {
      setActiveSector(sector)
    }
  }

  const transition = prefersReducedMotion ? 'none' : 'width 200ms ease'
  const maxCount = Math.max(1, ...entries.map((e) => e.count))

  const controls = (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-1 text-[10px] text-text-secondary">
        rvol ≥
        <input
          type="number"
          min={0}
          step={0.5}
          value={minRvol}
          onChange={(e) => setMinRvol(Math.max(0, Number(e.target.value) || 0))}
          className="w-12 rounded border border-border-hairline bg-surface px-1 py-0.5 text-right font-mono text-text-primary"
          aria-label="Minimum rvol"
        />
      </label>
      <label className="flex items-center gap-1 text-[10px] text-text-secondary">
        |z-move| ≥
        <input
          type="number"
          min={0}
          step={0.5}
          value={minZMove}
          onChange={(e) => setMinZMove(Math.max(0, Number(e.target.value) || 0))}
          className="w-12 rounded border border-border-hairline bg-surface px-1 py-0.5 text-right font-mono text-text-primary"
          aria-label="Minimum absolute z-move"
        />
      </label>
    </div>
  )

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[10px] text-text-secondary">{SMART_MONEY_SUBTITLE}</p>
        {controls}
        <EmptyState title="No F&O names loaded yet." description="Smart money counts will appear once the universe finishes loading." />
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[10px] text-text-secondary">{SMART_MONEY_SUBTITLE}</p>
        {controls}
        <EmptyState
          title={`No sector currently has a name above rvol ${minRvol} with a z-move above ${minZMove}.`}
          description="Loosen the thresholds to widen the net."
        />
      </div>
    )
  }

  const ariaLabel = `Smart money, ${entries.length} sectors qualifying rvol at least ${minRvol} and absolute z-move at least ${minZMove}. Highest count: ${entries[0]?.sector ?? 'none'} with ${entries[0]?.count ?? 0} names.`

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] text-text-secondary">{SMART_MONEY_SUBTITLE}</p>
      {controls}

      <div className="flex flex-col gap-0.5" role="group" aria-label={ariaLabel}>
        {entries.map((entry) => {
          const active = activeSector === entry.sector
          return (
            <BarRow
              key={entry.sector}
              label={entry.sector}
              labelClassName="w-28"
              ariaLabel={`Filter to the ${entry.count} qualifying names in ${entry.sector}`}
              active={active}
              hovered={hover?.entry.sector === entry.sector}
              tooltip={<SmartMoneyTooltip entry={entry} minRvol={minRvol} minZMove={minZMove} />}
              onToggle={() => toggleSector(entry.sector)}
              onHoverChange={(on) => setHover(on ? { entry } : null)}
            >
              <TipBar
                fraction={entry.count / maxCount}
                fillClassName="bg-warning"
                dimmed={activeSector !== null && !active}
                transition={transition}
                value={entry.count}
              />
            </BarRow>
          )
        })}
      </div>

      {/* sr-only goes on a wrapper, never on the <table> itself: a table can't shrink below its content, so an sr-only TABLE still widened the page at 360px. */}
      <div className="sr-only">
        <table>
          <caption>Smart money</caption>
          <thead>
            <tr>
              <th scope="col">Sector</th>
              <th scope="col">Count</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.sector}>
                <th scope="row">{entry.sector}</th>
                <td>{entry.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
