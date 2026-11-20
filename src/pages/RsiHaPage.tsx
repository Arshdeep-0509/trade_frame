import { useEffect } from 'react'
import { useMcxScreenerStore, useRsiHaMarket, useScreenerStore } from '../app/screenerStore'
import { SignalsTable } from '../features/rsi-ha/SignalsTable'

export function RsiHaPage() {
  // The table opens on NFO each time, so the status bar starts there too.
  useEffect(() => {
    useRsiHaMarket.getState().setMarket('NFO')
    return () => useRsiHaMarket.getState().setMarket('NFO')
  }, [])

  return (
    <div className="h-full">
      <SignalsTable store={useScreenerStore} mcxStore={useMcxScreenerStore} onMarketChange={useRsiHaMarket.getState().setMarket} />
    </div>
  )
}
