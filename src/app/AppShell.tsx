import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { PanelErrorBoundary } from '../components/ui/PanelErrorBoundary'
import { ScanPerfReadout } from '../features/rsi-ha/ScanPerfReadout'
import { ToastStack } from '../features/rsi-ha/ToastStack'
import { useUiStore } from '../store/uiStore'
import { FirstRunTour } from './FirstRunTour'
import { MobileNavChips } from './MobileNavChips'
import { MobilePageTabs } from './MobilePageTabs'
import { ShortcutsOverlay } from './ShortcutsOverlay'
import { useGlobalShortcuts } from './useGlobalShortcuts'
import { useScreenerStore } from './screenerStore'
import { TopBar } from './TopBar'
import { LeftRail } from './LeftRail'
import { StatusBar } from './StatusBar'

export function AppShell() {
  const theme = useUiStore((s) => s.theme)
  // The screener's status bar and scan readout describe /rsi-ha only — not /intraday, /users or /master-trust.
  const onScreenerPage = useLocation().pathname.startsWith('/rsi-ha')

  useEffect(() => {
    useScreenerStore.getState().start()
    return () => useScreenerStore.getState().stop()
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useGlobalShortcuts(useScreenerStore)

  return (
    // dvh, not vh: on mobile, browser chrome (the address bar) shows and
    // hides as the user scrolls, and vh doesn't account for that — it would
    // clip the status bar under the chrome instead of resizing around it the
    // way dvh does.
    <div className="flex h-dvh min-w-0 flex-col overflow-hidden bg-surface">
      <TopBar />
      <MobilePageTabs />
      {/* The panel chips (Watchlists, Parameters, Alerts, History) belong to the screener: on a phone they'd only crowd the other pages. */}
      {onScreenerPage && <MobileNavChips />}
      <div className="flex min-h-0 flex-1">
        <LeftRail />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <PanelErrorBoundary panelName="Screener">
            <Outlet />
          </PanelErrorBoundary>
        </main>
      </div>
      {onScreenerPage && <StatusBar />}
      <footer role="contentinfo" className="border-t border-border bg-surface px-4 py-1 text-center text-[10px] text-text-muted">
        Market data from Master Trust via mastertrust_intraday_api.py. Not investment advice.
      </footer>
      {onScreenerPage && <ScanPerfReadout store={useScreenerStore} />}
      <ToastStack />
      <ShortcutsOverlay />
      <FirstRunTour />
    </div>
  )
}
