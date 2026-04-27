import { describe, it, expect } from 'vitest'
import { partsToCron, prettyCron } from '../cron-utils'

describe('partsToCron', () => {
  it('renders weekday-only schedule with comma-separated dow', () => {
    expect(partsToCron({ minute: 30, hour: 9, days: [1, 2, 3, 4, 5] })).toBe(
      '30 9 * * 1,2,3,4,5',
    )
  })

  it('uses `*` for empty days (all days)', () => {
    expect(partsToCron({ minute: 0, hour: 0, days: [] })).toBe('0 0 * * *')
  })

  it('uses `*` when all 7 days selected (canonical form)', () => {
    expect(partsToCron({ minute: 0, hour: 0, days: [0, 1, 2, 3, 4, 5, 6] })).toBe(
      '0 0 * * *',
    )
  })

  it('sorts days numerically before joining', () => {
    expect(partsToCron({ minute: 0, hour: 12, days: [5, 1, 3] })).toBe('0 12 * * 1,3,5')
  })
})

describe('prettyCron', () => {
  it('returns ok+text for a valid expression', () => {
    const r = prettyCron('*/5 * * * *')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.text).toBe('Every 5 minutes')
    }
  })

  it('returns ok=false with error string for an invalid expression', () => {
    const r = prettyCron('garbage')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(typeof r.error).toBe('string')
      expect(r.error.length).toBeGreaterThan(0)
    }
  })
})
