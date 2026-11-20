import { create } from 'zustand'
import { authFetch } from '../features/auth/authFetch'
import type { SignalsMarket } from '../features/rsi-ha/SignalsTable'
import { createScannerFeed } from '../features/rsi-ha/scannerFeed'
import { createScreenerStore } from '../store/screenerStore'

/** The single store behind /rsi-ha. */
export const useScreenerStore = createScreenerStore(createScannerFeed({ baseUrl: import.meta.env.VITE_INTRADAY_API_BASE ?? '', fetchImpl: authFetch }))

/** The /rsi-ha tab on show, so the status bar reports the scanner behind it. */
export const useRsiHaMarket = create<{ market: SignalsMarket; setMarket: (market: SignalsMarket) => void }>()((set) => ({
  market: 'NFO',
  setMarket: (market) => set({ market }),
}))

/** /rsi-ha's MCX tab: the server's separate MCX commodity scanner, on MCX hours. */
export const useMcxScreenerStore = createScreenerStore(
  createScannerFeed({ baseUrl: import.meta.env.VITE_INTRADAY_API_BASE ?? '', fetchImpl: authFetch, market: 'MCX' }),
)
