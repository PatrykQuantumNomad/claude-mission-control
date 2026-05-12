// Phase 25 / VIEW-01 — vitest regression net for SCHEMA_VERSION + every in-scope
// route's `validateSearch`.
//
// What we're guarding:
//   1. SCHEMA_VERSION is `1` at Phase 25 (forces deliberate update on bump).
//   2. `coerceSchemaVersion` always returns the current constant — both for
//      empty input AND for stale/future blobs (`{ schemaVersion: 99 }`).
//   3. Every in-scope route's `validateSearch`:
//      - Returns `{ schemaVersion: 1, ... }` for an empty record.
//      - Drops unknown fields silently (RESEARCH Pitfall 6 — stale state_json
//        blobs from saved views must not crash the page on load).
//   4. `/sessions/compare`-specific regression: existing UUID coercion of
//      `a`/`b` is preserved verbatim (append-only invariant — Phase 16 Plan 02
//      contract). Invalid UUIDs coerce to `undefined`, just like before
//      Phase 25.
//
// Coverage shape mirrors `skillsDetailRange.test.tsx` (Plan 04) so the two
// regression nets together cover all 7 in-scope routes for VIEW-01.

import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION, coerceSchemaVersion } from '../searchSchemas'
import { validateSearch as validateIndex } from '../../routes/index'
import { validateSearch as validateActivity } from '../../routes/activity'
import { validateSearch as validateSkills } from '../../routes/skills'
import { validateSearch as validateCost } from '../../routes/cost'
import { validateSearch as validateAlerts } from '../../routes/alerts'
import { validateSearch as validateCompare } from '../../routes/sessions_.compare'

describe('SCHEMA_VERSION (Phase 25 / VIEW-01)', () => {
  it('is 1 at Phase 25', () => {
    expect(SCHEMA_VERSION).toBe(1)
  })
})

describe('coerceSchemaVersion (Phase 25 / VIEW-01)', () => {
  it('returns 1 for an empty record', () => {
    expect(coerceSchemaVersion({})).toBe(1)
  })

  it('returns 1 even when raw.schemaVersion is a forward (unknown) version', () => {
    // A saved view persisted under a future SCHEMA_VERSION must still hydrate
    // — coerceSchemaVersion is the migration seam. Today there is only one
    // version, so any stale value clamps to 1.
    expect(coerceSchemaVersion({ schemaVersion: 99 })).toBe(1)
  })

  it('returns 1 when raw.schemaVersion is missing entirely (pre-Phase-25 blob)', () => {
    expect(coerceSchemaVersion({ a: 'x', b: 'y' })).toBe(1)
  })
})

describe('per-route validateSearch — schemaVersion + unknown-field drop', () => {
  it('/ (index) returns schemaVersion 1 for empty input', () => {
    expect(validateIndex({})).toEqual({ schemaVersion: 1 })
  })

  it('/ (index) drops unknown fields silently', () => {
    expect(validateIndex({ foo: 'bar', stale: 42 })).toEqual({
      schemaVersion: 1,
    })
  })

  it('/activity returns schemaVersion 1 for empty input', () => {
    expect(validateActivity({})).toEqual({ schemaVersion: 1 })
  })

  it('/activity drops unknown fields silently', () => {
    expect(validateActivity({ foo: 'bar' })).toEqual({ schemaVersion: 1 })
  })

  it('/skills returns schemaVersion 1 for empty input', () => {
    expect(validateSkills({})).toEqual({ schemaVersion: 1 })
  })

  it('/skills drops unknown fields silently', () => {
    expect(validateSkills({ name: 'should-not-leak' })).toEqual({
      schemaVersion: 1,
    })
  })

  it('/cost returns schemaVersion 1 for empty input', () => {
    expect(validateCost({})).toEqual({ schemaVersion: 1 })
  })

  it('/cost drops unknown fields silently', () => {
    expect(validateCost({ range: '30d' })).toEqual({ schemaVersion: 1 })
  })

  it('/alerts returns schemaVersion 1 for empty input', () => {
    expect(validateAlerts({})).toEqual({ schemaVersion: 1 })
  })

  it('/alerts drops unknown fields silently', () => {
    expect(validateAlerts({ kind: 'threshold' })).toEqual({ schemaVersion: 1 })
  })
})

describe('/sessions/compare validateSearch (append-only invariant)', () => {
  const VALID_UUID = '12345678-1234-1234-1234-123456789012'
  const VALID_UUID_2 = 'abcdef01-2345-6789-abcd-ef0123456789'

  it('preserves a + b when both are valid UUIDs', () => {
    expect(validateCompare({ a: VALID_UUID, b: VALID_UUID_2 })).toEqual({
      schemaVersion: 1,
      a: VALID_UUID,
      b: VALID_UUID_2,
    })
  })

  it('preserves a alone when only a is present (single-side pick state)', () => {
    expect(validateCompare({ a: VALID_UUID })).toEqual({
      schemaVersion: 1,
      a: VALID_UUID,
      b: undefined,
    })
  })

  it('drops non-UUID a/b to undefined (defense-in-depth invariant)', () => {
    expect(validateCompare({ a: 'not-uuid', b: 123 })).toEqual({
      schemaVersion: 1,
      a: undefined,
      b: undefined,
    })
  })

  it('drops unknown fields silently while preserving a/b', () => {
    expect(validateCompare({ a: VALID_UUID, foo: 'bar' })).toEqual({
      schemaVersion: 1,
      a: VALID_UUID,
      b: undefined,
    })
  })

  it('returns schemaVersion 1 even when no UUIDs are provided', () => {
    expect(validateCompare({})).toEqual({
      schemaVersion: 1,
      a: undefined,
      b: undefined,
    })
  })
})
