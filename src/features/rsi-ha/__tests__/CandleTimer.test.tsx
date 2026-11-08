import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { secondsToCandleClose } from '../../../lib/marketSession'
import { CandleTimer } from '../CandleTimer'

// 2026-11-09 is a Monday and a trading day; 2026-11-10 is a holiday.
const at = (time: string, day = '2026-11-09') => new Date(`${day}T${time}+05:30`)

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('secondsToCandleClose', () => {
  it('counts to the close of the candle in progress', () => {
    expect(secondsToCandleClose(at('09:53:47'), 5)).toBe(73)
    expect(secondsToCandleClose(at('09:53:47'), 3)).toBe(13)
    expect(secondsToCandleClose(at('09:53:47'), 15)).toBe(373)
  })

  it('lands on the scanner\'s closes: candles start at 09:15', () => {
    expect(secondsToCandleClose(at('09:15:00'), 3)).toBe(180)
    expect(secondsToCandleClose(at('09:15:00'), 5)).toBe(300)
    expect(secondsToCandleClose(at('09:15:00'), 15)).toBe(900)
  })

  it('a new candle starts the moment one closes', () => {
    expect(secondsToCandleClose(at('09:54:59'), 5)).toBe(1)
    expect(secondsToCandleClose(at('09:55:00'), 5)).toBe(300)
  })

  it('counts a daily candle down to 15:30', () => {
    expect(secondsToCandleClose(at('15:29:00'), 24 * 60)).toBe(60)
    expect(secondsToCandleClose(at('09:15:00'), 24 * 60)).toBe(22500)
  })

  it('never counts past the last close of the day', () => {
    expect(secondsToCandleClose(at('15:29:50'), 15)).toBe(10)
    expect(secondsToCandleClose(at('15:30:00'), 3)).toBeNull()
    expect(secondsToCandleClose(at('15:30:30'), 3)).toBeNull()
  })

  it('is null whenever the market is shut', () => {
    expect(secondsToCandleClose(at('09:14:59'), 5)).toBeNull()
    expect(secondsToCandleClose(at('18:00:00'), 5)).toBeNull()
    expect(secondsToCandleClose(at('11:00:00', '2026-11-07'), 5)).toBeNull() // Saturday
    expect(secondsToCandleClose(at('11:00:00', '2026-11-10'), 5)).toBeNull() // holiday
  })
})

describe('CandleTimer', () => {
  it('shows the countdown for the selected timeframe, and ticks', () => {
    vi.setSystemTime(at('09:53:47'))
    render(<CandleTimer candleInterval="5minute" />)
    expect(screen.getByRole('timer').textContent).toBe('Next 5 min candle in01:13')
    act(() => void vi.advanceTimersByTime(3000))
    expect(screen.getByRole('timer').textContent).toBe('Next 5 min candle in01:10')
  })

  it('counts the day down with hours on 1 day', () => {
    vi.setSystemTime(at('10:00:00'))
    render(<CandleTimer candleInterval="1day" />)
    expect(screen.getByRole('timer').textContent).toBe('Day closes in05:30:00')
  })

  it('follows a change of timeframe', () => {
    vi.setSystemTime(at('09:53:47'))
    const { rerender } = render(<CandleTimer candleInterval="5minute" />)
    rerender(<CandleTimer candleInterval="3minute" />)
    expect(screen.getByRole('timer').textContent).toBe('Next 3 min candle in00:13')
  })

  it('says the market is closed instead of showing a timer', () => {
    vi.setSystemTime(at('18:00:00'))
    render(<CandleTimer candleInterval="5minute" />)
    expect(screen.queryByRole('timer')).toBeNull()
    expect(screen.getByText('Market closed')).toBeTruthy()
  })

  it('says when the market opens before 09:15', () => {
    vi.setSystemTime(at('08:30:00'))
    render(<CandleTimer candleInterval="5minute" />)
    expect(screen.getByText('Market opens at 09:15')).toBeTruthy()
  })

  it('switches off by itself at the close', () => {
    vi.setSystemTime(at('15:29:58'))
    render(<CandleTimer candleInterval="3minute" />)
    expect(screen.getByRole('timer')).toBeTruthy()
    act(() => void vi.advanceTimersByTime(3000))
    expect(screen.queryByRole('timer')).toBeNull()
    expect(screen.getByText('Market closed')).toBeTruthy()
  })
})
