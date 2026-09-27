/**
 * On/off switches for /intraday features that are built but not shown yet.
 * Flip a flag back to true to bring its feature back — nothing else changes.
 */

/**
 * Clicking a stock's symbol opens the drill-down drawer (price chart +
 * details, InstrumentDrawer.tsx). Off: symbols render as plain text, a click
 * does nothing, and the drawer is not mounted at all.
 */
export const INSTRUMENT_DRAWER_ENABLED = false
