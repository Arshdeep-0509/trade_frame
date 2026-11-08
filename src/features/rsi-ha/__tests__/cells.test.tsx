import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SignalKind } from '../../../types/domain'
import { LtpCell, SignalBadge } from '../cells'
import { signalLabel } from '../rowHelpers'

const SIGNAL_KINDS: readonly SignalKind[] = ['BUY', 'SELL', 'BREAKOUT-UP', 'BREAKOUT-DOWN', 'CE Buy', 'PE Buy']


const FLASH_MS = 400

describe('LtpCell — flash on change', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
  afterEach(() => vi.useRealTimers())

  const flashSpan = (): HTMLElement => {
    const el = screen.getByText(/₹/)
    return el.closest('span.inline-block') ?? el
  }

  it('flashes UP (green) on an increase and clears after the flash duration', () => {
    const { rerender } = render(<LtpCell ltp={100} />)
    expect(flashSpan().className).not.toMatch(/bg-(bullish|bearish)/)
    rerender(<LtpCell ltp={101} />)
    expect(flashSpan().className).toMatch(/bg-bullish/)
    act(() => {
      vi.advanceTimersByTime(FLASH_MS - 1)
    })
    expect(flashSpan().className).toMatch(/bg-bullish/)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(flashSpan().className).not.toMatch(/bg-(bullish|bearish)/)
  })

  it('flashes DOWN (red) on a decrease', () => {
    const { rerender } = render(<LtpCell ltp={101} />)
    rerender(<LtpCell ltp={100} />)
    expect(flashSpan().className).toMatch(/bg-bearish/)
  })

  it('does not flash on the first value, on an unchanged value, or when the value is missing', () => {
    const { rerender } = render(<LtpCell ltp={undefined} />)
    rerender(<LtpCell ltp={100} />) // first real value: nothing to compare against
    expect(flashSpan().className).not.toMatch(/bg-(bullish|bearish)/)
    rerender(<LtpCell ltp={100} />)
    expect(flashSpan().className).not.toMatch(/bg-(bullish|bearish)/)
  })

  it('renders the value with tabular digits (the column width, not the digits, keeps the row from reflowing)', () => {
    render(<LtpCell ltp={1888.88} />)
    expect(flashSpan().className).toMatch(/tabular-nums/)
    expect(flashSpan().textContent).toBe('₹1,888.88')
  })
})

describe('SignalBadge — never colour alone', () => {
  it.each(SIGNAL_KINDS.map((k) => [k]))('%s renders a glyph AND its text label', (signal: SignalKind) => {
    const { container } = render(<SignalBadge signal={signal} />)
    expect(container.textContent).toContain(signalLabel(signal))
    const glyph = container.querySelector('svg, [data-glyph]')
    expect(glyph).not.toBeNull()
  })

  it('every kind is distinguishable without colour: distinct text labels', () => {
    const labels = SIGNAL_KINDS.map((signal) => {
      const { container, unmount } = render(<SignalBadge signal={signal} />)
      const text = container.textContent ?? ''
      unmount()
      return text
    })
    expect(new Set(labels).size).toBe(SIGNAL_KINDS.length)
  })
})
