import { Fragment, useEffect, useState } from 'react'
import { formatISTTime } from '../lib/formatters'
import { useScreenerStore } from './screenerStore'

function Field({ label, value }: { label: string; value: string }) {
  return (
    <span>
      {label}: <span className="font-mono tabular-nums text-text-primary">{value}</span>
    </span>
  )
}

function duration(seconds: number): string {
  if (seconds < 120) return `${seconds}s`
  if (seconds < 7200) return `${Math.round(seconds / 60)}m`
  return `${Math.round(seconds / 3600)}h`
}

export function StatusBar() {
  const universeSize = useScreenerStore((s) => s.universeSize)
  const scanning = useScreenerStore((s) => s.scanning)
  const scanProgress = useScreenerStore((s) => s.scanProgress)
  const signalCount = useScreenerStore((s) => s.rows.length)
  const lastScanAt = useScreenerStore((s) => s.lastScanAt)
  const nextScanAt = useScreenerStore((s) => s.nextScanAt)
  const connectionState = useScreenerStore((s) => s.connectionState)

  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const id = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => window.clearInterval(id)
  }, [])

  const fields = [
    { label: 'Scanned', value: scanning ? `${scanProgress.done}/${scanProgress.total}` : universeSize > 0 ? `${universeSize}/${universeSize}` : '—' },
    { label: 'Signals', value: String(signalCount) },
    { label: 'Last scan', value: lastScanAt !== null ? formatISTTime(new Date(lastScanAt * 1000)) : '—' },
    { label: 'Next scan', value: nextScanAt !== null ? duration(Math.max(0, nextScanAt - now)) : '—' },
    { label: 'Server', value: connectionState },
  ]

  return (
    <footer className="flex h-statusbar shrink-0 items-center gap-2 overflow-x-auto whitespace-nowrap border-t border-border bg-panel px-4 text-xs text-text-secondary">
      {fields.map((field, index) => (
        <Fragment key={field.label}>
          {index > 0 && (
            <span className="text-border" aria-hidden="true">
              ·
            </span>
          )}
          <Field label={field.label} value={field.value} />
        </Fragment>
      ))}
    </footer>
  )
}
