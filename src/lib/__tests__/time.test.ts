import { describe, it, expect } from 'vitest'
import { getWeekStartTs } from '#/lib/time'

describe('getWeekStartTs', () => {
  it('returns a number', () => {
    expect(typeof getWeekStartTs()).toBe('number')
  })

  it('is not in the future', () => {
    expect(getWeekStartTs()).toBeLessThanOrEqual(Date.now())
  })

  it('is always a Monday at 00:00:00.000 UTC', () => {
    const ts = getWeekStartTs()
    const d = new Date(ts)
    expect(d.getUTCDay()).toBe(1)           // Monday
    expect(d.getUTCHours()).toBe(0)
    expect(d.getUTCMinutes()).toBe(0)
    expect(d.getUTCSeconds()).toBe(0)
    expect(d.getUTCMilliseconds()).toBe(0)
  })

  it('is within the last 7 days', () => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    expect(getWeekStartTs()).toBeGreaterThanOrEqual(sevenDaysAgo)
  })

  it('is idempotent within the same week', () => {
    // Two calls in the same process should return the same value
    expect(getWeekStartTs()).toBe(getWeekStartTs())
  })
})
