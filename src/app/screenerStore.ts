import { authFetch } from '../features/auth/authFetch'
import { createScannerFeed } from '../features/rsi-ha/scannerFeed'
import { createScreenerStore } from '../store/screenerStore'

/** The single store behind /rsi-ha. */
export const useScreenerStore = createScreenerStore(createScannerFeed({ baseUrl: import.meta.env.VITE_INTRADAY_API_BASE ?? '', fetchImpl: authFetch }))
