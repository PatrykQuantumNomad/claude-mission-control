// frontend/src/lib/time/__tests__/useRouteRangeVocab.test.ts — Phase 27 Plan 01.
//
// Covers:
//   1. The four pure snap helpers (snapToRange / snapToSkillRange /
//      snapToCostRange / snapToAlertRange) at each band boundary AND the
//      first value of the next band (h, h+1).
//   2. The useRouteRangeVocab generic hook via a mocked @tanstack/react-router
//      `useRouterState` returning a mutable `location.search` shape.
//
// The hook contract under test (RESEARCH Pitfall 1 + ZERO-REFACTOR INVARIANT):
//   - returns routeDefault when URL has no time_from/time_to
//   - returns snap(windowHours) when both are present + parseable
//   - returns routeDefault when EITHER is unparseable (asymmetric coverage)
//   - returns routeDefault when windowHours <= 0 (inverted/zero window)

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// Mutable search state shared with the mocked useRouterState below. Tests
// mutate this object via `setSearch(...)` before calling `renderHook`.
let mockSearch: Record<string, unknown> = {}

function setSearch(next: Record<string, unknown>): void {
  mockSearch = next
}

// Module-level mock — the factory closes over `mockSearch` so each test gets
// the search state it sets up in `beforeEach` or inline.
vi.mock('@tanstack/react-router', () => ({
  useRouterState: ({
    select,
  }: {
    select: (s: { location: { pathname: string; search: Record<string, unknown> } }) => unknown
  }) => select({ location: { pathname: '/test', search: mockSearch } }),
}))

import {
  useRouteRangeVocab,
  snapToRange,
  snapToSkillRange,
  snapToCostRange,
  snapToAlertRange,
} from '../useRouteRangeVocab'

// ---------------------------------------------------------------------------
// Pure snap helpers — band-boundary coverage
// ---------------------------------------------------------------------------

describe('snapToRange — Phase 26 vocab mirror', () => {
  it('returns "today" for 1h (well below 24h band edge)', () => {
    expect(snapToRange(1)).toBe('today')
  })

  it('returns "today" at the 24h band edge (inclusive)', () => {
    expect(snapToRange(24)).toBe('today')
  })

  it('returns "7d" at 25h (first value of the next band)', () => {
    expect(snapToRange(25)).toBe('7d')
  })

  it('returns "7d" at the 192h (8d) band edge (inclusive)', () => {
    expect(snapToRange(192)).toBe('7d')
  })

  it('returns "30d" at 193h (first value above 8d)', () => {
    expect(snapToRange(193)).toBe('30d')
  })
})

describe('snapToCostRange — 4-tier vocab', () => {
  it('returns "1d" for 1h', () => {
    expect(snapToCostRange(1)).toBe('1d')
  })

  it('returns "1d" at the 48h band edge (inclusive)', () => {
    expect(snapToCostRange(48)).toBe('1d')
  })

  it('returns "7d" at 49h (first value of the next band)', () => {
    expect(snapToCostRange(49)).toBe('7d')
  })

  it('returns "7d" at the 192h (8d) band edge (inclusive)', () => {
    expect(snapToCostRange(192)).toBe('7d')
  })

  it('returns "14d" at 193h (first value above 8d)', () => {
    expect(snapToCostRange(193)).toBe('14d')
  })

  it('returns "14d" at the 504h (21d) band edge (inclusive)', () => {
    expect(snapToCostRange(504)).toBe('14d')
  })

  it('returns "30d" at 505h (first value above 21d)', () => {
    expect(snapToCostRange(505)).toBe('30d')
  })
})

describe('snapToAlertRange — identical bands to snapToCostRange', () => {
  it('returns "1d" for 1h', () => {
    expect(snapToAlertRange(1)).toBe('1d')
  })

  it('returns "1d" at the 48h band edge (inclusive)', () => {
    expect(snapToAlertRange(48)).toBe('1d')
  })

  it('returns "7d" at 49h', () => {
    expect(snapToAlertRange(49)).toBe('7d')
  })

  it('returns "7d" at 192h (inclusive)', () => {
    expect(snapToAlertRange(192)).toBe('7d')
  })

  it('returns "14d" at 193h', () => {
    expect(snapToAlertRange(193)).toBe('14d')
  })

  it('returns "14d" at 504h (inclusive)', () => {
    expect(snapToAlertRange(504)).toBe('14d')
  })

  it('returns "30d" at 505h', () => {
    expect(snapToAlertRange(505)).toBe('30d')
  })
})

describe('snapToSkillRange — backend Literal "14d" | "30d"', () => {
  it('returns "14d" for 1h', () => {
    expect(snapToSkillRange(1)).toBe('14d')
  })

  it('returns "14d" at the 504h (21d) band edge (inclusive)', () => {
    expect(snapToSkillRange(504)).toBe('14d')
  })

  it('returns "30d" at 505h (first value above 21d)', () => {
    expect(snapToSkillRange(505)).toBe('30d')
  })
})

// ---------------------------------------------------------------------------
// useRouteRangeVocab hook — mocked router
// ---------------------------------------------------------------------------

describe('useRouteRangeVocab — generic hook contract', () => {
  beforeEach(() => {
    setSearch({})
  })

  it('returns routeDefault when search is empty (no time params)', () => {
    setSearch({})
    const { result } = renderHook(() => useRouteRangeVocab('14d', snapToSkillRange))
    expect(result.current).toBe('14d')
  })

  it('returns snap(windowHours) when time_from + time_to are both present and parseable', () => {
    // 25 days window → 600h → snapToSkillRange(600) → '30d'
    setSearch({ time_from: 'now-25d', time_to: 'now' })
    const { result } = renderHook(() => useRouteRangeVocab('14d', snapToSkillRange))
    expect(result.current).toBe('30d')
  })

  it('returns routeDefault when time_from is unparseable (asymmetric coverage)', () => {
    setSearch({ time_from: 'bogus', time_to: 'now' })
    const { result } = renderHook(() => useRouteRangeVocab('14d', snapToSkillRange))
    expect(result.current).toBe('14d')
  })

  it('returns routeDefault when time_to is unparseable (asymmetric coverage, other side)', () => {
    setSearch({ time_from: 'now-7d', time_to: 'bogus' })
    const { result } = renderHook(() => useRouteRangeVocab('14d', snapToSkillRange))
    expect(result.current).toBe('14d')
  })

  it('returns routeDefault when time_to is absent', () => {
    setSearch({ time_from: 'now-7d' })
    const { result } = renderHook(() => useRouteRangeVocab('14d', snapToSkillRange))
    expect(result.current).toBe('14d')
  })

  it('returns routeDefault when time_from is absent', () => {
    setSearch({ time_to: 'now' })
    const { result } = renderHook(() => useRouteRangeVocab('14d', snapToSkillRange))
    expect(result.current).toBe('14d')
  })

  it('returns routeDefault when windowHours <= 0 (inverted window)', () => {
    // from=now, to=now-1h → windowHours = -1 → fall back to routeDefault
    setSearch({ time_from: 'now', time_to: 'now-1h' })
    const { result } = renderHook(() => useRouteRangeVocab('14d', snapToSkillRange))
    expect(result.current).toBe('14d')
  })

  it('works with snapToCostRange + 2-day window → "1d"', () => {
    // 2 days window → 48h → snapToCostRange(48) → '1d'
    setSearch({ time_from: 'now-2d', time_to: 'now' })
    const { result } = renderHook(() => useRouteRangeVocab('7d', snapToCostRange))
    expect(result.current).toBe('1d')
  })

  it('works with snapToAlertRange + 14-day window → "14d"', () => {
    // 14 days window → 336h → snapToAlertRange(336) → '14d' (above 192h, ≤504h)
    setSearch({ time_from: 'now-14d', time_to: 'now' })
    const { result } = renderHook(() => useRouteRangeVocab('7d', snapToAlertRange))
    expect(result.current).toBe('14d')
  })
})
