import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

/**
 * Shared pieces for /intraday's horizontal bar charts. Every category label
 * sits flat on its own row (never rotated), truncated with the full name in
 * the row's title + tooltip, and each value rides the tip of its own bar.
 */

/** Width reserved at the end of a track for the tip value, so the longest bar's label never overflows the panel. */
const TIP_LABEL_ROOM = '3rem'

export interface BarRowProps {
  label: string
  /** Tailwind width class for the label column — one fixed width per chart keeps every bar starting on the same x. */
  labelClassName?: string
  ariaLabel: string
  active: boolean
  hovered: boolean
  tooltip: ReactNode
  onToggle: () => void
  onHoverChange: (hovering: boolean) => void
  children: ReactNode
}

/** One clickable, focusable chart row: flat label on the left, the chart's bar(s) filling the rest, tooltip on hover/focus. */
export function BarRow({ label, labelClassName = 'w-24', ariaLabel, active, hovered, tooltip, onToggle, onHoverChange, children }: BarRowProps) {
  return (
    <div className="relative">
      <div
        role="button"
        tabIndex={0}
        aria-pressed={active}
        aria-label={ariaLabel}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
        onMouseEnter={() => onHoverChange(true)}
        onMouseLeave={() => onHoverChange(false)}
        onFocus={() => onHoverChange(true)}
        onBlur={() => onHoverChange(false)}
        className={cn(
          'flex min-h-[20px] cursor-pointer items-center gap-2 rounded px-1 transition-colors hover:bg-text-primary/5 focus-visible:outline focus-visible:outline-1 focus-visible:outline-neutral',
          active && 'bg-neutral/10 hover:bg-neutral/15',
        )}
      >
        <span className={cn('shrink-0 truncate text-[11px] text-text-secondary', active && 'font-medium text-text-primary', labelClassName)} title={label}>
          {label}
        </span>
        <div className="flex min-w-0 flex-1 items-center">{children}</div>
      </div>
      {hovered && <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center">{tooltip}</div>}
    </div>
  )
}

export interface TipBarProps {
  /** 0..1 share of the track this bar fills. */
  fraction: number
  /** Which way the bar grows from its baseline. */
  grow?: 'right' | 'left'
  /** Tailwind background class for the bar. */
  fillClassName: string
  dimmed?: boolean
  transition: string
  /** Text at the bar's tip; empty string for none. */
  value: ReactNode
  valueClassName?: string
}

/**
 * A bar whose value label sits right at its tip. The track reserves room for
 * that label, so even a full-length bar keeps its value inside the panel.
 * Square at the baseline, 4px rounded at the data end.
 */
export function TipBar({ fraction, grow = 'right', fillClassName, dimmed = false, transition, value, valueClassName }: TipBarProps) {
  const clamped = Math.max(0, Math.min(1, fraction))
  return (
    <div className={cn('flex min-w-0 flex-1 items-center gap-1', grow === 'left' && 'flex-row-reverse')}>
      <span
        data-bar
        className={cn('h-2.5 shrink-0', grow === 'right' ? 'rounded-r' : 'rounded-l', fillClassName, dimmed && 'opacity-40')}
        style={{ width: `calc((100% - ${TIP_LABEL_ROOM}) * ${clamped})`, minWidth: clamped > 0 ? 2 : 0, transition }}
      />
      <span className={cn('shrink-0 whitespace-nowrap font-mono text-[10px] tabular-nums text-text-secondary', valueClassName)}>{value}</span>
    </div>
  )
}

/** The 1px zero line between the two halves of a diverging row. */
export function ZeroLine() {
  return <span className="h-5 w-px shrink-0 self-stretch bg-border" aria-hidden="true" />
}
