import { HttpMarketDataSource } from '../data/http/HttpMarketDataSource'

/**
 * /intraday's data source: real Master Trust data via mastertrust_intraday_api.py.
 * /rsi-ha has its own HttpMarketDataSource (see dataSource.ts) with a wider
 * scrip-master query; the two pages never share a data source instance.
 *
 * Only the NFO/FUTSTK rows of the scrip master are requested — the F&O
 * futures universe (loadFnoFuturesUniverse) is all this page reads from it.
 */
export const intradayDataSource = new HttpMarketDataSource({
  baseUrl: import.meta.env.VITE_INTRADAY_API_BASE ?? '',
  scripMasterQueries: [{ exchange: 'NFO', instrumentName: 'FUTSTK' }],
})
