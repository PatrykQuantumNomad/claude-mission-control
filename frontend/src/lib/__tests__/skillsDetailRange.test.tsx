// Phase 25 / VIEW-01 — vitest regression net for /skills/$name's validateSearch.
//
// What we're guarding:
//   1. Default-as-pre-plan-behavior invariant: `?range=` absent → '14d'.
//      Pitfall 3 (PHASE 25 RESEARCH) — any other default silently breaks
//      every existing deep-link / Telegram bookmark that lands on this route
//      without a ?range= qs.
//   2. Three-value enum acceptance: '7d', '14d', '30d' round-trip.
//   3. Coercion of garbage (non-enum strings, non-strings, unknown fields)
//      back to default — saved views / deep-links should never crash; they
//      should hydrate to the safest baseline.
//   4. schemaVersion is always present (= 1 today) — required for forward
//      append-only schema evolution.

import { describe, expect, it } from 'vitest'
import { validateSearch } from '../../routes/skills_.$name'

describe('/skills/$name validateSearch (Phase 25 / VIEW-01)', () => {
  it('defaults to 14d when range is absent', () => {
    expect(validateSearch({})).toEqual({ schemaVersion: 1, range: '14d' })
  })

  it.each(['7d', '14d', '30d'] as const)(
    'preserves valid range %s',
    (r) => {
      expect(validateSearch({ range: r })).toEqual({
        schemaVersion: 1,
        range: r,
      })
    },
  )

  it('coerces invalid range to default 14d', () => {
    expect(validateSearch({ range: 'bogus' })).toEqual({
      schemaVersion: 1,
      range: '14d',
    })
  })

  it('coerces non-string range to default 14d', () => {
    expect(validateSearch({ range: 30 })).toEqual({
      schemaVersion: 1,
      range: '14d',
    })
  })

  it('drops unknown fields', () => {
    expect(validateSearch({ foo: 'bar' })).toEqual({
      schemaVersion: 1,
      range: '14d',
    })
  })

  it('always emits schemaVersion 1', () => {
    // Future plans MAY bump SCHEMA_VERSION; this test forces a deliberate
    // update if/when that happens, rather than silent drift.
    expect(validateSearch({}).schemaVersion).toBe(1)
    expect(validateSearch({ range: '7d' }).schemaVersion).toBe(1)
  })
})
