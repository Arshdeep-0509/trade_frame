import { createIntradayStore } from '../store/intradayStore'
import { intradayDataSource } from './intradayDataSource'

/** The single intraday store instance, on the real Master Trust data source and the real wall clock. */
export const useIntradayStore = createIntradayStore({
  dataSource: intradayDataSource,
  now: () => intradayDataSource.getNow(),
  // A real Master Trust load takes seconds: meters drawn from a partial set would visibly jump before settling.
  progressiveFirstLoad: false,
})
