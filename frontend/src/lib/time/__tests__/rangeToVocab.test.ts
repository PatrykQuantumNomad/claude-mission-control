// frontend/src/lib/time/__tests__/rangeToVocab.test.ts — Phase 26 Plan 01 (TIME-01).
//
// Covers the LOAD-BEARING bridge helper: maps URL-form (time_from, time_to)
// to the backend's closed-set Range vocab ('today' | '7d' | '30d'). The
// bridge is the Phase 26 ADR — see 26-01-PLAN.md objective for rationale.

import { describe, it, expect } from 'vitest'
import { rangeToVocab } from '../rangeToVocab'

const NOW = new Date('2026-05-13T12:00:00.000Z')

describe('rangeToVocab — snap rules', () => {
  it('maps a 1-hour window to "today"', () => {
    expect(rangeToVocab({ from: 'now-1h', to: 'now', now: NOW })).toBe('today')
  })

  it('maps a 24-hour window to "today" (boundary inclusive)', () => {
    expect(rangeToVocab({ from: 'now-24h', to: 'now', now: NOW })).toBe('today')
  })

  it('maps a 7-day window to "7d"', () => {
    expect(rangeToVocab({ from: 'now-7d', to: 'now', now: NOW })).toBe('7d')
  })

  it('maps a 30-day window to "30d"', () => {
    expect(rangeToVocab({ from: 'now-30d', to: 'now', now: NOW })).toBe('30d')
  })

  it('maps a 90-day window to "30d" (conservative wide cover)', () => {
    expect(rangeToVocab({ from: 'now-90d', to: 'now', now: NOW })).toBe('30d')
  })

  it('maps a 2-day window to "7d" (above 24h, within 8d)', () => {
    expect(rangeToVocab({ from: 'now-2d', to: 'now', now: NOW })).toBe('7d')
  })

  it('maps an 8-day window to "7d" (boundary inclusive)', () => {
    expect(rangeToVocab({ from: 'now-8d', to: 'now', now: NOW })).toBe('7d')
  })

  it('maps a 9-day window to "30d" (above 8d threshold)', () => {
    expect(rangeToVocab({ from: 'now-9d', to: 'now', now: NOW })).toBe('30d')
  })
})

describe('rangeToVocab — defaults and degraded inputs', () => {
  it('returns "7d" when both params are missing', () => {
    expect(rangeToVocab({ from: undefined, to: undefined, now: NOW })).toBe('7d')
  })

  it('returns "7d" when only `from` is missing', () => {
    expect(rangeToVocab({ from: undefined, to: 'now', now: NOW })).toBe('7d')
  })

  it('returns "7d" when only `to` is missing', () => {
    expect(rangeToVocab({ from: 'now-7d', to: undefined, now: NOW })).toBe('7d')
  })

  it('returns "7d" when either token is invalid', () => {
    expect(rangeToVocab({ from: 'bogus', to: 'now', now: NOW })).toBe('7d')
    expect(rangeToVocab({ from: 'now-7d', to: 'bogus', now: NOW })).toBe('7d')
  })
})

describe('rangeToVocab — absolute ISO timestamps', () => {
  it('maps an ISO range spanning ~7 days to "7d"', () => {
    const from = '2026-05-06T12:00:00Z'
    const to = '2026-05-13T12:00:00Z'
    expect(rangeToVocab({ from, to, now: NOW })).toBe('7d')
  })

  it('maps an ISO range spanning 12 hours to "today"', () => {
    const from = '2026-05-13T00:00:00Z'
    const to = '2026-05-13T12:00:00Z'
    expect(rangeToVocab({ from, to, now: NOW })).toBe('today')
  })
})
