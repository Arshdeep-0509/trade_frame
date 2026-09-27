/**
 * On/off switches for /rsi-ha features that are built but not shown yet.
 * Flip a flag back to true to bring its feature back — nothing else changes.
 */

/**
 * The signal detail drawer (price chart + "why this fired", SignalDetail.tsx),
 * opened by a row click, a card tap, Enter, the right-click "Open chart" item,
 * or an alert/history/toast link. Off: all of those only select/highlight the
 * row, the "Open chart" menu item is hidden, and the drawer is not mounted.
 */
export const SIGNAL_DETAIL_ENABLED = false
