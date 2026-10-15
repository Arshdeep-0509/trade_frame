import { HttpMarketDataSource } from '../data/http/HttpMarketDataSource'

/**
 * The /rsi-ha screener's data source: real Master Trust data via the backend
 * repo's mastertrust_intraday_api.py — the same REST calls
 * mastertrust_rsi_ha_screener.py makes (/api/v1/charts/tdv candles, the
 * CompactScrip.csv scrip master, /api/v1/search). No mock data reaches this page.
 *
 * The scrip master is requested in exactly the three slices the screener's
 * loaders read: load_nse_equity_universe() (NSE/EQ),
 * load_fno_futures_universe() (NFO/FUTSTK), and load_fno_atm_options()
 * (NSE/EQ + NFO/OPTSTK).
 */
export const dataSource = new HttpMarketDataSource({
  baseUrl: import.meta.env.VITE_INTRADAY_API_BASE ?? '',
  scripMasterQueries: [
    { exchange: 'NSE', instrumentName: 'EQ' },
    { exchange: 'NFO', instrumentName: 'FUTSTK' },
    { exchange: 'NFO', instrumentName: 'OPTSTK' },
  ],
})
