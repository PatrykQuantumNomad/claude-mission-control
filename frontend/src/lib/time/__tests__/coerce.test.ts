// frontend/src/lib/time/__tests__/coerce.test.ts — Phase 26 Plan 01 (TIME-01).
//
// Covers coerceToAbsolute: maps Grafana tokens or ISO-8601 absolutes to JS
// Date. Uses a fixed `ref` Date for determinism (tests can't rely on real
// `new Date()` because the helper math depends on the wall clock).

import { describe, it, expect } from 'vitest'
import { coerceToAbsolute } from '../coerce'

const REF = new Date('2026-05-13T12:00:00.000Z')

describe('coerceToAbsolute — Grafana tokens', () => {
  it('returns the ref Date for "now"', () => {
    const d = coerceToAbsolute('now', REF)
    expect(d).not.toBeNull()
    // `now` is identity — should equal the ref exactly.
    expect(d!.getTime()).toBe(REF.getTime())
  })

  it('returns 7 days before ref for "now-7d"', () => {
    const d = coerceToAbsolute('now-7d', REF)
    expect(d).not.toBeNull()
    const expected = new Date('2026-05-06T12:00:00.000Z').getTime()
    expect(d!.getTime()).toBe(expected)
  })

  it('returns 1 hour before ref for "now-1h"', () => {
    const d = coerceToAbsolute('now-1h', REF)
    expect(d).not.toBeNull()
    const expected = new Date('2026-05-13T11:00:00.000Z').getTime()
    expect(d!.getTime()).toBe(expected)
  })

  it('returns start-of-local-day for "now/d"', () => {
    const d = coerceToAbsolute('now/d', REF)
    expect(d).not.toBeNull()
    // startOfDay is LOCAL — assert hours/minutes/seconds are zeroed in
    // the local zone.
    expect(d!.getHours()).toBe(0)
    expect(d!.getMinutes()).toBe(0)
    expect(d!.getSeconds()).toBe(0)
    expect(d!.getMilliseconds()).toBe(0)
  })

  it('returns 1 month later for "now+1M"', () => {
    const d = coerceToAbsolute('now+1M', REF)
    expect(d).not.toBeNull()
    // date-fns addMonths preserves the day-of-month when possible.
    expect(d!.getUTCMonth()).toBe(5) // June (0-indexed)
  })

  it('rejects overflow amounts (defuses DoS pattern)', () => {
    expect(coerceToAbsolute('now+999999d', REF)).toBeNull()
  })

  it('rejects invalid tokens by returning null', () => {
    expect(coerceToAbsolute('bogus', REF)).toBeNull()
  })
})

describe('coerceToAbsolute — ISO-8601 absolute strings', () => {
  it('parses a valid ISO-8601 timestamp', () => {
    const d = coerceToAbsolute('2026-01-15T12:34:00Z', REF)
    expect(d).not.toBeNull()
    expect(d!.toISOString()).toBe('2026-01-15T12:34:00.000Z')
  })

  it('returns null for the literal "not iso" (no ISO prefix match)', () => {
    expect(coerceToAbsolute('not iso', REF)).toBeNull()
  })

  it('returns null for a malformed ISO date that matches the prefix but fails to parse', () => {
    // `2026-13-99T...` matches ISO_RE but Date constructor fails (NaN).
    expect(coerceToAbsolute('2026-13-99T99:99:99Z', REF)).toBeNull()
  })
})
