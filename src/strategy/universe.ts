import type { ScripRow } from '../types/api'
import type { Exchange } from '../types/domain'
import type { StrategyParams } from './constants'

/**
 * `close_price` throughout this file is a CACHED snapshot from the
 * instrument master download, used only to size the scan universe (and, for
 * ATM strike selection, as a stand-in "spot" price). It is never a live
 * quote — the real, live price/RSI/HA check still happens per-symbol on
 * every scan. See load_nse_equity_universe() / load_fno_futures_universe() /
 * load_fno_atm_options() in mastertrust_rsi_ha_screener.py and
 * STRATEGY-CONTRACT.md §4.
 */

export interface UniverseEntry {
  symbol: string
  token: string
  exchange: Exchange
}

const MONTH_ABBREVIATIONS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
}

/** Mirrors pandas' pd.to_numeric(..., errors="coerce"): unparseable -> NaN. */
function toNumericOrNaN(value: string | number): number {
  if (typeof value === 'number') return value
  const trimmed = value.trim()
  if (trimmed === '') return NaN
  const parsed = Number(trimmed)
  return Number.isNaN(parsed) ? NaN : parsed
}

/**
 * Mirrors pd.to_datetime(expiry, format="%d-%b-%Y", errors="coerce"):
 * unparseable -> null (pandas' NaT). Returns epoch seconds at UTC midnight
 * of the parsed calendar date.
 */
function parseExpiry(raw: string): number | null {
  const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(raw.trim())
  if (!match) return null

  const [, dayStr, monthStr, yearStr] = match
  const month = MONTH_ABBREVIATIONS[monthStr.toLowerCase()]
  if (month === undefined) return null

  const day = Number(dayStr)
  const year = Number(yearStr)
  const ms = Date.UTC(year, month, day)
  if (Number.isNaN(ms)) return null

  return Math.floor(ms / 1000)
}

/** Transliteration of load_nse_equity_universe() (lines 344–357). */
export function loadNseEquityUniverse(rows: ScripRow[], params: StrategyParams): UniverseEntry[] {
  return rows
    .filter((row) => row.exchange === 'NSE' && row.instrument_name === 'EQ')
    .map((row) => ({ row, closePrice: toNumericOrNaN(row.close_price) }))
    .filter((entry) => entry.closePrice >= params.minPrice)
    .map((entry) => ({
      symbol: entry.row.trading_symbol,
      token: String(entry.row.exchange_token),
      exchange: 'NSE' as const,
    }))
}

/**
 * Transliteration of load_fno_futures_universe() (lines 360–375). Order
 * matters: drop unparseable rows, filter to not-yet-expired, sort by
 * expiry ascending, dedupe to one (nearest-expiry) contract per company,
 * THEN filter by price — filtering by price happens after the dedupe, same
 * as the Python.
 */
export function loadFnoFuturesUniverse(
  rows: ScripRow[],
  params: StrategyParams,
  todayEpochSeconds: number,
): UniverseEntry[] {
  const parsed = rows
    .filter((row) => row.exchange === 'NFO' && row.instrument_name === 'FUTSTK')
    .map((row) => ({
      row,
      closePrice: toNumericOrNaN(row.close_price),
      expiryEpoch: parseExpiry(row.expiry),
    }))
    .filter((entry) => !Number.isNaN(entry.closePrice) && entry.expiryEpoch !== null)
    .filter((entry) => (entry.expiryEpoch as number) >= todayEpochSeconds)

  parsed.sort((a, b) => (a.expiryEpoch as number) - (b.expiryEpoch as number))

  const seenCompanies = new Set<string>()
  const deduped: typeof parsed = []
  for (const entry of parsed) {
    if (seenCompanies.has(entry.row.company_name)) continue
    seenCompanies.add(entry.row.company_name)
    deduped.push(entry)
  }

  return deduped
    .filter((entry) => entry.closePrice >= params.minPrice)
    .map((entry) => ({
      symbol: entry.row.trading_symbol,
      token: String(entry.row.exchange_token),
      exchange: 'NFO' as const,
    }))
}

