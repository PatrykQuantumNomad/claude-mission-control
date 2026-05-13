// frontend/src/lib/time/__tests__/clipboard.test.ts — Phase 26 Plan 01 (TIME-03).
//
// Covers Cmd+Shift+C/V serializer + parser for time-range clipboard.
// Round-trip property: parseRangeFromText(serializeRange(f, t)) === {f, t}.

import { describe, it, expect } from 'vitest'
import { parseRangeFromText, serializeRange } from '../clipboard'

describe('serializeRange', () => {
  it('emits a URL-fragment-shaped string', () => {
    expect(serializeRange('now-7d', 'now')).toBe('?time_from=now-7d&time_to=now')
  })

  it('URL-encodes special characters in tokens (defensive)', () => {
    // ISO timestamps include ':' which URLSearchParams encodes as '%3A'.
    expect(serializeRange('2026-05-13T12:00:00Z', 'now')).toBe(
      '?time_from=2026-05-13T12%3A00%3A00Z&time_to=now',
    )
  })
})

describe('parseRangeFromText', () => {
  it('parses a raw fragment', () => {
    expect(parseRangeFromText('?time_from=now-7d&time_to=now')).toEqual({
      time_from: 'now-7d',
      time_to: 'now',
    })
  })

  it('parses a full URL containing the fragment', () => {
    expect(
      parseRangeFromText('https://x?time_from=now-7d&time_to=now'),
    ).toEqual({ time_from: 'now-7d', time_to: 'now' })
  })

  it('parses a full URL with path + fragment', () => {
    expect(
      parseRangeFromText(
        'https://cmc.local/activity?time_from=now-30d&time_to=now',
      ),
    ).toEqual({ time_from: 'now-30d', time_to: 'now' })
  })

  it('returns null for the literal "not a url" (no `?` char)', () => {
    expect(parseRangeFromText('not a url')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(parseRangeFromText('')).toBeNull()
  })

  it('returns null when `time_from` is missing', () => {
    expect(parseRangeFromText('?time_to=now')).toBeNull()
  })

  it('returns null when `time_to` is missing', () => {
    expect(parseRangeFromText('?time_from=now-7d')).toBeNull()
  })

  it('round-trips serializeRange + parseRangeFromText losslessly', () => {
    const f = 'now-7d'
    const t = 'now'
    expect(parseRangeFromText(serializeRange(f, t))).toEqual({
      time_from: f,
      time_to: t,
    })
  })
})
