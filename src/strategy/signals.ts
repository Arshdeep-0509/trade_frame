import type { AnalyzedCandle, Candle } from '../types/domain'
import type { StrategyParams } from './constants'
import { haStreakLength } from './indicators'

export type SignalDecision = 'BUY' | 'SELL' | null

/**
 * Every value checkSignal() actually compares, computed once. checkSignal()
 * and explainSignal() (explainSignal.ts) both read from this — the two
 * never re-derive their own copy of the comparisons, so they can't drift
 * apart. `null` means there weren't even enough candles to evaluate (the
 * length<3 guard) — the earliest of checkSignal()'s bail-outs, before `last`
 * is even read.
 */
export interface SignalPredicates {
  last: AnalyzedCandle
  rsiDefined: boolean
  minPriceOk: boolean
  streak: number
  color: 'green' | 'red'
  is2nd: boolean
  buyBandPass: boolean
  sellBandPass: boolean
}

export function evaluateSignalPredicates(candles: AnalyzedCandle[], params: StrategyParams): SignalPredicates | null {
  if (candles.length < 3) return null

  const last = candles[candles.length - 1]
  const rsiDefined = !Number.isNaN(last.rsi)
  const minPriceOk = last.close >= params.minPrice
  const { streak, color } = haStreakLength(candles, candles.length - 1)
  const is2nd = streak === 2

  return {
    last,
    rsiDefined,
    minPriceOk,
    streak,
    color,
    is2nd,
    buyBandPass: params.rsiBuyLow <= last.rsi && last.rsi <= params.rsiBuyHigh,
    sellBandPass: params.rsiSellLow <= last.rsi && last.rsi <= params.rsiSellHigh,
  }
}

/**
 * NOT the live strategy: that is check_signal() in the backend. This older rule
 * only tunes the test-only mock market (data/mock/generateUniverse.ts).
 *
 * Transliteration of an earlier check_signal(). Guard order matches exactly. Both RSI bands are INCLUSIVE —
 * this is the band the code actually implements, not the threshold the
 * module docstring describes. See STRATEGY-CONTRACT.md §2 (KNOWN
 * DISCREPANCIES — DO NOT RESOLVE): the code wins, not the docstring.
 */
export function checkSignal(candles: AnalyzedCandle[], params: StrategyParams): SignalDecision {
  const p = evaluateSignalPredicates(candles, params)
  if (!p) return null
  if (!p.rsiDefined) return null
  if (!p.minPriceOk) return null

  // PARITY: streak must be EXACTLY 2 (the second candle confirming a fresh
  // colour flip), not "2 or more". A 5th consecutive green candle with RSI
  // in-band does not signal.
  if (p.buyBandPass && p.is2nd && p.color === 'green') return 'BUY'
  if (p.sellBandPass && p.is2nd && p.color === 'red') return 'SELL'
  return null
}

export interface BreakoutResult {
  signal: 'BREAKOUT-UP' | 'BREAKOUT-DOWN' | null
  level: number | null
}

/**
 * Every value checkBreakout() actually compares, computed once — same
 * rationale as SignalPredicates above. `null` means there weren't enough
 * candles for a full lookback window.
 */
export interface BreakoutPredicates {
  last: Candle
  minPriceOk: boolean
  rangeHigh: number
  rangeLow: number
  aboveHigh: boolean
  belowLow: boolean
}

export function evaluateBreakoutPredicates(candles: Candle[], params: StrategyParams): BreakoutPredicates | null {
  const lookback = params.breakoutLookback
  if (candles.length < lookback + 1) return null

  const last = candles[candles.length - 1]
  // The `lookback` candles BEFORE the last one — the last candle itself is
  // excluded from the range it's being compared against.
  const prior = candles.slice(-(lookback + 1), -1)
  const rangeHigh = Math.max(...prior.map((c) => c.high))
  const rangeLow = Math.min(...prior.map((c) => c.low))

  return {
    last,
    minPriceOk: last.close >= params.minPrice,
    rangeHigh,
    rangeLow,
    aboveHigh: last.close > rangeHigh,
    belowLow: last.close < rangeLow,
  }
}

/**
 * Transliteration of check_breakout() (lines 306–329). Entirely independent
 * of checkSignal() — both are evaluated for every candle/symbol on every
 * scan, so a single candle can produce a BUY row AND a BREAKOUT-UP row at
 * the same time. Keep that; do not make them mutually exclusive.
 */
export function checkBreakout(candles: Candle[], params: StrategyParams): BreakoutResult {
  const p = evaluateBreakoutPredicates(candles, params)
  if (!p) return { signal: null, level: null }
  if (!p.minPriceOk) return { signal: null, level: null }

  if (p.aboveHigh) return { signal: 'BREAKOUT-UP', level: p.rangeHigh }
  if (p.belowLow) return { signal: 'BREAKOUT-DOWN', level: p.rangeLow }
  return { signal: null, level: null }
}

