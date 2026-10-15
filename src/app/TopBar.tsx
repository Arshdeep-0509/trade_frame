import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Keyboard, Moon, Radio, Settings, Sun, TrendingUp } from 'lucide-react'
import { cn } from '../lib/cn'
import { formatISTTime } from '../lib/formatters'
import { getMarketSession, type MarketSession } from '../lib/marketSession'
import { StatusDot } from '../components/ui/StatusDot'
import { Badge } from '../components/ui/Badge'
import { IconButton } from '../components/ui/IconButton'
import { useScreenerStore } from './screenerStore'
import { useUiStore } from '../store/uiStore'

const sessionVariant: Record<MarketSession, 'bullish' | 'warning' | 'default'> = {
  OPEN: 'bullish',
  'PRE-OPEN': 'warning',
  CLOSED: 'default',
}

export function TopBar() {
  const [now, setNow] = useState(() => new Date())
  const connectionState = useScreenerStore((s) => s.connectionState)
  const theme = useUiStore((s) => s.theme)
  // /intraday shows its own Master Trust connection badge, so the screener's connection dot is hidden there.
  const onIntradayPage = useLocation().pathname.startsWith('/intraday')

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const session = getMarketSession(now)

  return (
    // overflow-hidden + every child shrink-0: this bar never wraps to a
    // second row at any width — items are hidden/shrunk by breakpoint
    // instead (see each child below), never left to reflow.
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-border bg-panel px-4">
      <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3 lg:gap-6">
        <Link to="/rsi-ha" className="flex shrink-0 items-center gap-2 text-text-primary">
          <TrendingUp className="h-5 w-5 shrink-0 text-neutral" aria-hidden="true" />
          {/* Wordmark drops to just the logo mark below lg. */}
          <span className="hidden text-sm font-semibold tracking-tight lg:inline">RSI-HA</span>
        </Link>
        <nav aria-label="Pages" className="hidden shrink-0 items-center gap-1 sm:flex">
          {[
            { to: '/rsi-ha', label: 'Screener' },
            { to: '/intraday', label: 'Intraday' },
          ].map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'rounded px-2 py-1 text-xs font-medium transition-colors',
                  isActive ? 'bg-surface text-neutral' : 'text-text-secondary hover:text-text-primary',
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <Badge variant="bullish" outline className="shrink-0" title="Every page reads real market data from Master Trust.">
          <Radio className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">MASTER TRUST DATA</span>
          <span className="sm:hidden">REAL</span>
        </Badge>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        {/*
          lg, not md: at exactly 768px (md) every OTHER right-side control
          here is already visible (sm:/md: conditions further down are all
          satisfied too), and the clock text + session pill together are
          wide enough to overflow that width if they joined in at the same
          breakpoint — confirmed by scripts/responsive-check.mjs at 768px.
        */}
        <span
          className="hidden shrink-0 font-mono text-xs tabular-nums text-text-secondary lg:inline"
          title={`${formatISTTime(now)} IST`}
        >
          {formatISTTime(now)} IST
        </span>
        <Badge variant={sessionVariant[session]} className="hidden shrink-0 lg:inline-flex">
          {session}
        </Badge>
        {/* The screener's Master Trust connection; /intraday shows its own connection badge instead. */}
        {!onIntradayPage && (
          <span className="hidden shrink-0 sm:inline-flex">
            <StatusDot status={connectionState} />
          </span>
        )}
        <IconButton
          aria-label="Show keyboard shortcuts"
          onClick={() => useUiStore.getState().setShortcutsOverlayOpen(true)}
          className="hidden sm:inline-flex"
        >
          <Keyboard className="h-4 w-4" />
        </IconButton>
        <IconButton
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={() => useUiStore.getState().toggleTheme()}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </IconButton>
        <IconButton aria-label="Settings" onClick={() => useUiStore.getState().togglePanel('settings')}>
          <Settings className="h-4 w-4" />
        </IconButton>
      </div>
    </header>
  )
}
