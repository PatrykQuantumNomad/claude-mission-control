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
import {
  SCHEMA_VERSION,
  asComparePanels,
  asHiddenPanels,
  asPanelOrder,
  asSplitSizes,
  asTimeToken,
  coerceSchemaVersion,
} from '../searchSchemas'
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
    // Phase 26 / TIME-01 extends `/` validator append-only with optional
    // time_from + time_to (both default to `undefined` — Pitfall 13).
    // Phase 26 / TIME-04 (Plan 07) further extends with `compare_panels?` —
    // CSV of panel ids, defaults to undefined.
    expect(validateIndex({})).toEqual({
      schemaVersion: 1,
      time_from: undefined,
      time_to: undefined,
      compare_panels: undefined,
    })
  })

  it('/ (index) drops unknown fields silently', () => {
    expect(validateIndex({ foo: 'bar', stale: 42 })).toEqual({
      schemaVersion: 1,
      time_from: undefined,
      time_to: undefined,
      compare_panels: undefined,
    })
  })

  it('/activity returns schemaVersion 1 for empty input', () => {
    // Phase 26 / TIME-01 — bare /activity must still produce undefined
    // time_from + time_to so DefaultViewLoader's bare-URL gate continues to
    // fire (RESEARCH Pitfall 13). Phase 26 / TIME-04 (Plan 07) adds
    // `compare_panels` (undefined-by-default — same gate invariant).
    expect(validateActivity({})).toEqual({
      schemaVersion: 1,
      time_from: undefined,
      time_to: undefined,
      compare_panels: undefined,
    })
  })

  it('/activity drops unknown fields silently', () => {
    expect(validateActivity({ foo: 'bar' })).toEqual({
      schemaVersion: 1,
      time_from: undefined,
      time_to: undefined,
      compare_panels: undefined,
    })
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
    // Phase 26 / TIME-01 — append-only extension adds time_from + time_to to
    // /sessions/compare's return shape; existing UUID coercion of a/b is
    // unchanged. Phase 26 / TIME-04 (Plan 07) further adds compare_panels.
    expect(validateCompare({ a: VALID_UUID, b: VALID_UUID_2 })).toEqual({
      schemaVersion: 1,
      a: VALID_UUID,
      b: VALID_UUID_2,
      time_from: undefined,
      time_to: undefined,
      compare_panels: undefined,
    })
  })

  it('preserves a alone when only a is present (single-side pick state)', () => {
    expect(validateCompare({ a: VALID_UUID })).toEqual({
      schemaVersion: 1,
      a: VALID_UUID,
      b: undefined,
      time_from: undefined,
      time_to: undefined,
      compare_panels: undefined,
    })
  })

  it('drops non-UUID a/b to undefined (defense-in-depth invariant)', () => {
    expect(validateCompare({ a: 'not-uuid', b: 123 })).toEqual({
      schemaVersion: 1,
      a: undefined,
      b: undefined,
      time_from: undefined,
      time_to: undefined,
      compare_panels: undefined,
    })
  })

  it('drops unknown fields silently while preserving a/b', () => {
    expect(validateCompare({ a: VALID_UUID, foo: 'bar' })).toEqual({
      schemaVersion: 1,
      a: VALID_UUID,
      b: undefined,
      time_from: undefined,
      time_to: undefined,
      compare_panels: undefined,
    })
  })

  it('returns schemaVersion 1 even when no UUIDs are provided', () => {
    expect(validateCompare({})).toEqual({
      schemaVersion: 1,
      a: undefined,
      b: undefined,
      time_from: undefined,
      time_to: undefined,
      compare_panels: undefined,
    })
  })
})

describe('asTimeToken (Phase 26 / TIME-01)', () => {
  // Shared helper used by /, /activity, /sessions/compare validators.
  // Locked invariant: returns the input verbatim for shape-valid Grafana
  // relative tokens or ISO-8601 absolute timestamps; returns `undefined`
  // for anything else (defense-in-depth — clipboard paste + brush-zoom
  // commits re-validate through this seam).

  it('accepts the bare `now` keyword', () => {
    expect(asTimeToken('now')).toBe('now')
  })

  it('accepts Grafana relative tokens with subtraction (now-7d)', () => {
    expect(asTimeToken('now-7d')).toBe('now-7d')
  })

  it('accepts Grafana relative tokens with addition (now+1h)', () => {
    expect(asTimeToken('now+1h')).toBe('now+1h')
  })

  it('accepts Grafana relative tokens with day-snap (now/d)', () => {
    expect(asTimeToken('now/d')).toBe('now/d')
  })

  it('accepts Grafana relative tokens with subtraction + snap (now-30d/d)', () => {
    expect(asTimeToken('now-30d/d')).toBe('now-30d/d')
  })

  it('accepts ISO-8601 absolute timestamps with Z suffix', () => {
    expect(asTimeToken('2026-05-12T10:00:00Z')).toBe('2026-05-12T10:00:00Z')
  })

  it('accepts ISO-8601 absolute timestamps with offset', () => {
    expect(asTimeToken('2026-05-12T10:00:00+02:00')).toBe(
      '2026-05-12T10:00:00+02:00',
    )
  })

  it('rejects arbitrary strings (bogus → undefined)', () => {
    expect(asTimeToken('bogus')).toBeUndefined()
  })

  it('rejects empty strings', () => {
    expect(asTimeToken('')).toBeUndefined()
  })

  it('rejects numbers (only strings pass the type guard)', () => {
    expect(asTimeToken(123)).toBeUndefined()
  })

  it('rejects undefined', () => {
    expect(asTimeToken(undefined)).toBeUndefined()
  })

  it('rejects null', () => {
    expect(asTimeToken(null)).toBeUndefined()
  })

  it('rejects malformed Grafana tokens (now-7 missing unit)', () => {
    expect(asTimeToken('now-7')).toBeUndefined()
  })

  it('rejects bare date without T-time component', () => {
    expect(asTimeToken('2026-05-12')).toBeUndefined()
  })
})

describe('Phase 26 route validators accept time_from + time_to (TIME-01)', () => {
  // Append-only extension. Each in-scope route accepts ?time_from=... &
  // time_to=... Grafana-style tokens. Shape-invalid tokens coerce to
  // `undefined` — Pitfall 13 invariant (no defaulting in the validator).

  it('/ (index) round-trips time_from + time_to verbatim', () => {
    expect(validateIndex({ time_from: 'now-24h', time_to: 'now' })).toEqual({
      schemaVersion: 1,
      time_from: 'now-24h',
      time_to: 'now',
      compare_panels: undefined,
    })
  })

  it('/ (index) strips bogus time tokens to undefined', () => {
    expect(validateIndex({ time_from: 'bogus', time_to: 42 })).toEqual({
      schemaVersion: 1,
      time_from: undefined,
      time_to: undefined,
      compare_panels: undefined,
    })
  })

  it('/activity round-trips time_from + time_to verbatim', () => {
    expect(
      validateActivity({ time_from: 'now-1h', time_to: 'now' }),
    ).toEqual({
      schemaVersion: 1,
      time_from: 'now-1h',
      time_to: 'now',
      compare_panels: undefined,
    })
  })

  it('/activity strips bogus time_from to undefined (defense-in-depth)', () => {
    expect(validateActivity({ time_from: 'bogus' })).toEqual({
      schemaVersion: 1,
      time_from: undefined,
      time_to: undefined,
      compare_panels: undefined,
    })
  })

  it('/activity accepts ISO absolute timestamps', () => {
    expect(
      validateActivity({
        time_from: '2026-05-12T00:00:00Z',
        time_to: '2026-05-12T23:59:59Z',
      }),
    ).toEqual({
      schemaVersion: 1,
      time_from: '2026-05-12T00:00:00Z',
      time_to: '2026-05-12T23:59:59Z',
      compare_panels: undefined,
    })
  })

  it('/sessions/compare round-trips time_from + time_to alongside UUID a/b', () => {
    const VALID_UUID = '12345678-1234-1234-1234-123456789012'
    const VALID_UUID_2 = 'abcdef01-2345-6789-abcd-ef0123456789'
    expect(
      validateCompare({
        a: VALID_UUID,
        b: VALID_UUID_2,
        time_from: 'now-7d',
        time_to: 'now',
      }),
    ).toEqual({
      schemaVersion: 1,
      a: VALID_UUID,
      b: VALID_UUID_2,
      time_from: 'now-7d',
      time_to: 'now',
      compare_panels: undefined,
    })
  })
})

describe('asComparePanels (Phase 26 / TIME-04, Plan 07)', () => {
  // Shape: lowercase alphanumeric + `_` and `-`, separated by commas. No
  // spaces. No trailing/leading commas. Empty string treated as absent.
  // Returns verbatim on match; undefined on rejection. Defense-in-depth:
  // saved-view state_json hydration + clipboard paste + manual URL edits
  // all funnel through this seam.

  it('accepts a single panel id', () => {
    expect(asComparePanels('token-usage')).toBe('token-usage')
  })

  it('accepts a comma-list of panel ids', () => {
    expect(asComparePanels('token-usage,session-outcomes')).toBe(
      'token-usage,session-outcomes',
    )
  })

  it('accepts panel ids containing underscores', () => {
    expect(asComparePanels('cache_efficiency')).toBe('cache_efficiency')
  })

  it('rejects a trailing comma (malformed CSV)', () => {
    expect(asComparePanels('token-usage,')).toBeUndefined()
  })

  it('rejects a leading comma (malformed CSV)', () => {
    expect(asComparePanels(',token-usage')).toBeUndefined()
  })

  it('rejects strings with spaces', () => {
    expect(asComparePanels(' token-usage')).toBeUndefined()
    expect(asComparePanels('token-usage, session-outcomes')).toBeUndefined()
  })

  it('rejects empty strings', () => {
    expect(asComparePanels('')).toBeUndefined()
  })

  it('rejects uppercase letters (lowercase-only invariant)', () => {
    expect(asComparePanels('BadCase')).toBeUndefined()
    expect(asComparePanels('token-usage,Session-Outcomes')).toBeUndefined()
  })

  it('rejects non-strings', () => {
    expect(asComparePanels(undefined)).toBeUndefined()
    expect(asComparePanels(null)).toBeUndefined()
    expect(asComparePanels(123)).toBeUndefined()
    expect(asComparePanels(['token-usage'])).toBeUndefined()
  })
})

describe('Phase 26 route validators accept compare_panels (TIME-04, Plan 07)', () => {
  it('/ (index) round-trips compare_panels verbatim', () => {
    expect(
      validateIndex({ compare_panels: 'token-usage,session-outcomes' }),
    ).toEqual({
      schemaVersion: 1,
      time_from: undefined,
      time_to: undefined,
      compare_panels: 'token-usage,session-outcomes',
    })
  })

  it('/activity strips malformed compare_panels to undefined', () => {
    expect(validateActivity({ compare_panels: 'BadCase,' })).toEqual({
      schemaVersion: 1,
      time_from: undefined,
      time_to: undefined,
      compare_panels: undefined,
    })
  })

  it('/sessions/compare round-trips compare_panels alongside a/b/time', () => {
    const VALID_UUID = '12345678-1234-1234-1234-123456789012'
    const VALID_UUID_2 = 'abcdef01-2345-6789-abcd-ef0123456789'
    expect(
      validateCompare({
        a: VALID_UUID,
        b: VALID_UUID_2,
        time_from: 'now-7d',
        time_to: 'now',
        compare_panels: 'token-usage',
      }),
    ).toEqual({
      schemaVersion: 1,
      a: VALID_UUID,
      b: VALID_UUID_2,
      time_from: 'now-7d',
      time_to: 'now',
      compare_panels: 'token-usage',
    })
  })
})

// ───────────────────────────────────────────────────────────────────
// Phase 28 layout validators — SKELETON (Plan 28-01, Wave 0).
//
// Wave 1 (Plan 28-02) ships the three new validators in
// `frontend/src/lib/searchSchemas.ts`:
//   - asHiddenPanels  → CSV regex `^[a-z0-9_-]+(?:,[a-z0-9_-]+)*$`
//   - asPanelOrder    → CSV groups `groupId:panelId,panelId;groupId2:...`
//   - asSplitSizes    → CSV groups of 0-100 percentages
//
// All three return `undefined` for empty-string OR malformed input
// (RESEARCH §5 + Pitfall 2 — DefaultViewLoader bare-URL gate). The
// validators MUST never emit a default value; per-panel/per-route
// fallbacks live at the read site (mirrors the Phase 26/27 time_from
// / time_to / compare_panels pattern locked above).
//
// These `it.todo` placeholders keep the file green at Wave 0 commit
// time. Wave 1 flips them into real assertions importing the new
// validators from `../searchSchemas`.
// ───────────────────────────────────────────────────────────────────

describe('Phase 28 layout validators (Plan 28-02 — LAYO-01/02/03)', () => {
  describe('asHiddenPanels', () => {
    it('accepts valid CSV input (e.g. "system-pressure,token-usage")', () => {
      expect(asHiddenPanels('token-usage,attention-bar')).toBe(
        'token-usage,attention-bar',
      )
      expect(asHiddenPanels('system-pressure')).toBe('system-pressure')
    })

    it('returns undefined for empty-string input (Pitfall 2 — bare-URL gate)', () => {
      expect(asHiddenPanels('')).toBeUndefined()
    })

    it('returns undefined for malformed input (uppercase, bad chars, trailing comma)', () => {
      expect(asHiddenPanels('TOKEN_USAGE')).toBeUndefined()
      expect(asHiddenPanels('token-usage,')).toBeUndefined()
      expect(asHiddenPanels(',token-usage')).toBeUndefined()
      expect(asHiddenPanels('token usage')).toBeUndefined()
      expect(asHiddenPanels('token.usage')).toBeUndefined()
    })

    it('returns undefined for non-string input', () => {
      expect(asHiddenPanels(undefined)).toBeUndefined()
      expect(asHiddenPanels(null)).toBeUndefined()
      expect(asHiddenPanels(123)).toBeUndefined()
      expect(asHiddenPanels(['token-usage'])).toBeUndefined()
    })
  })

  describe('asPanelOrder', () => {
    it('accepts valid CSV groups (e.g. "col-a:p1,p2;col-b:p3,p4")', () => {
      expect(asPanelOrder('main:p1,p2;top:p3')).toBe('main:p1,p2;top:p3')
      expect(asPanelOrder('main:token-usage,cache-efficiency')).toBe(
        'main:token-usage,cache-efficiency',
      )
      // Single panel per group also valid (CSV regex allows 1+ panels — single-
      // panel groups are degenerate but legal so callers can write an order
      // even when only one panel exists for a column).
      expect(asPanelOrder('main:p1')).toBe('main:p1')
    })

    it('returns undefined for empty-string input (Pitfall 2 — bare-URL gate)', () => {
      expect(asPanelOrder('')).toBeUndefined()
    })

    it('returns undefined for malformed input (missing group key, bad chars)', () => {
      expect(asPanelOrder('main')).toBeUndefined() // missing colon
      expect(asPanelOrder(';;')).toBeUndefined()
      expect(asPanelOrder(':p1,p2')).toBeUndefined() // missing column id
      expect(asPanelOrder('Main:P1,P2')).toBeUndefined() // uppercase
      expect(asPanelOrder('main:p1;')).toBeUndefined() // trailing semicolon
    })

    it('returns undefined for non-string input', () => {
      expect(asPanelOrder(undefined)).toBeUndefined()
      expect(asPanelOrder(null)).toBeUndefined()
      expect(asPanelOrder(123)).toBeUndefined()
    })
  })

  describe('asSplitSizes', () => {
    it('accepts valid CSV groups of percentages (e.g. "compare:60,40")', () => {
      expect(asSplitSizes('compare:55,45')).toBe('compare:55,45')
      expect(asSplitSizes('compare:60,40')).toBe('compare:60,40')
      expect(asSplitSizes('compare:55,45;main:30,70')).toBe(
        'compare:55,45;main:30,70',
      )
    })

    it('returns the string when percentages would sum outside 100 (sum-clamp lives client-side)', () => {
      // Validator only matches shape; sum-clamping is the client's job.
      expect(asSplitSizes('compare:200,0')).toBe('compare:200,0')
    })

    it('returns undefined for empty-string input (Pitfall 2 — bare-URL gate)', () => {
      expect(asSplitSizes('')).toBeUndefined()
    })

    it('returns undefined for malformed input (single-value group, non-digits, bad shape)', () => {
      expect(asSplitSizes('compare:55')).toBeUndefined() // single value (must ≥2)
      expect(asSplitSizes('compare:abc,def')).toBeUndefined()
      expect(asSplitSizes('compare:1234,5')).toBeUndefined() // 4-digit value rejected by \d{1,3}
      expect(asSplitSizes('compare')).toBeUndefined() // missing colon
      expect(asSplitSizes(':55,45')).toBeUndefined() // missing group id
    })

    it('returns undefined for non-string input', () => {
      expect(asSplitSizes(undefined)).toBeUndefined()
      expect(asSplitSizes(null)).toBeUndefined()
      expect(asSplitSizes(123)).toBeUndefined()
    })
  })
})
