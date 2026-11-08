import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { getMarketSession, secondsToCandleClose } from '../../lib/marketSession'
import { CANDLE_INTERVAL_OPTIONS, isDailyInterval, parseIntervalMinutes } from '../../strategy/constants'

function two(value: number): string {
  return String(value).padStart(2, '0')
}

function countdown(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours > 0 ? `${two(hours)}:` : ''}${two(minutes)}:${two(seconds % 60)}`
}

/** Counts down to the selected timeframe's next candle close, while the market is open. */
export function CandleTimer({ candleInterval }: { candleInterval: string }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const seconds = secondsToCandleClose(now, parseIntervalMinutes(candleInterval))

  if (seconds === null) {
    return (
      <span title="The timer runs during market hours, 09:15 to 15:30 IST." className="whitespace-nowrap text-xs text-text-muted">
        {getMarketSession(now) === 'PRE-OPEN' ? 'Market opens at 09:15' : 'Market closed'}
      </span>
    )
  }

  const label = CANDLE_INTERVAL_OPTIONS.find((option) => option.value === candleInterval)?.label ?? candleInterval
  return (
    <span role="timer" className="flex items-center gap-1.5 whitespace-nowrap text-xs text-text-secondary">
      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {isDailyInterval(candleInterval) ? 'Day closes in' : `Next ${label} candle in`}
      <span className="font-mono tabular-nums text-text-primary">{countdown(seconds)}</span>
    </span>
  )
}
