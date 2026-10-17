import { describe, expect, it } from 'vitest'
import { limitConcurrency, mapWithConcurrency } from '../concurrent'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('mapWithConcurrency', () => {
  it('returns results in input order regardless of completion order', async () => {
    const items = [30, 10, 20, 5]
    const results = await mapWithConcurrency(items, 4, async (ms) => {
      await delay(ms)
      return ms
    })
    expect(results).toEqual([30, 10, 20, 5])
  })

  it('never runs more than `limit` calls concurrently', async () => {
    let active = 0
    let maxActive = 0
    const items = Array.from({ length: 20 }, (_, i) => i)

    await mapWithConcurrency(items, 3, async (i) => {
      active++
      maxActive = Math.max(maxActive, active)
      await delay(5)
      active--
      return i
    })

    expect(maxActive).toBeLessThanOrEqual(3)
  })

  it('handles an empty item list without hanging', async () => {
    const results = await mapWithConcurrency([], 5, async (i: number) => i)
    expect(results).toEqual([])
  })

  it('handles a limit larger than the item count', async () => {
    const results = await mapWithConcurrency([1, 2, 3], 100, async (i) => i * 2)
    expect(results).toEqual([2, 4, 6])
  })

  it('propagates a rejection from any worker', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (i) => {
        if (i === 2) throw new Error('boom')
        return i
      }),
    ).rejects.toThrow('boom')
  })
})

describe('limitConcurrency', () => {
  it('never runs more than `limit` calls at once, and runs them all in call order', async () => {
    let inFlight = 0
    let peak = 0
    const started: number[] = []
    const limited = limitConcurrency(async (i: number) => {
      started.push(i)
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await delay(i % 3)
      inFlight -= 1
      return i * 2
    }, 3)

    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => limited(i)))
    expect(results).toEqual(Array.from({ length: 20 }, (_, i) => i * 2))
    expect(peak).toBe(3)
    expect(started).toEqual(Array.from({ length: 20 }, (_, i) => i))
  })

  it('keeps the limit when calls arrive while others are finishing', async () => {
    let inFlight = 0
    let peak = 0
    const limited = limitConcurrency(async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await delay(1)
      inFlight -= 1
    }, 2)
    const first = Array.from({ length: 4 }, () => limited())
    await delay(1)
    await Promise.all([...first, ...Array.from({ length: 4 }, () => limited())])
    expect(peak).toBe(2)
  })

  it('frees the slot when a call fails', async () => {
    const limited = limitConcurrency(async (fail: boolean) => {
      await delay(1)
      if (fail) throw new Error('boom')
      return 'ok'
    }, 1)
    await expect(limited(true)).rejects.toThrow('boom')
    await expect(limited(false)).resolves.toBe('ok')
  })
})
