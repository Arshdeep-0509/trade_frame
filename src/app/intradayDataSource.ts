import { HttpMarketDataSource } from '../data/http/HttpMarketDataSource'

/**
 * /intraday's data source: real Master Trust data via mastertrust_intraday_api.py.
 * /rsi-ha deliberately keeps its own MockMarketDataSource (see dataSource.ts),
 * so the two pages never share a data source or a clock.
 *
 * Only the NFO/FUTSTK rows of the scrip master are requested — the F&O
 * futures universe (loadFnoFuturesUniverse) is all this page reads from it.
 */
export const intradayDataSource = new HttpMarketDataSource({
  baseUrl: import.meta.env.VITE_INTRADAY_API_BASE ?? '',
  scripMasterQuery: { exchange: 'NFO', instrumentName: 'FUTSTK' },
})
