/**
 * Phase 25 / VIEW-06 + SHEL-06 + VIEW-09 — localStorage helper coverage.
 *
 * Mirrors the storage.test.ts pattern (clear localStorage between tests).
 * Pins the documented invariants: per-route isolation, dedupe behavior,
 * FIFO ordering, 50-cap truncation + atCap flag.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  getDefaultViewId,
  setDefaultViewId,
  getPinnedIds,
  setPinnedIds,
  pinView,
  unpinView,
  pushRecentState,
  getRecentStates,
  clearRecentStates,
  getAllRecentStates,
  RECENT_STATES_CAP,
} from '../savedViews'

beforeEach(() => {
  window.localStorage.clear()
})

// ---------------------------------------------------------------------------
// Default-view pointer (VIEW-06)
// ---------------------------------------------------------------------------

describe('savedViews — default-view pointer (VIEW-06)', () => {
  it('returns null when unset', () => {
    expect(getDefaultViewId('/cost')).toBeNull()
  })

  it('roundtrips per route', () => {
    setDefaultViewId('/cost', 42)
    setDefaultViewId('/alerts', 7)
    expect(getDefaultViewId('/cost')).toBe(42)
    expect(getDefaultViewId('/alerts')).toBe(7)
  })

  it('clears with null', () => {
    setDefaultViewId('/cost', 42)
    setDefaultViewId('/cost', null)
    expect(getDefaultViewId('/cost')).toBeNull()
  })

  it('uses the documented cmc.savedView.default.<route> key shape', () => {
    setDefaultViewId('/cost', 9)
    expect(window.localStorage.getItem('cmc.savedView.default./cost')).toBe('9')
  })
})

// ---------------------------------------------------------------------------
// Pinned ids (SHEL-06)
// ---------------------------------------------------------------------------

describe('savedViews — pinned ids (SHEL-06)', () => {
  it('starts empty', () => {
    expect(getPinnedIds()).toEqual([])
  })

  it('setPinnedIds roundtrips', () => {
    setPinnedIds([3, 1, 4])
    expect(getPinnedIds()).toEqual([3, 1, 4])
  })

  it('pinView appends + dedupes', () => {
    pinView(1)
    pinView(2)
    pinView(1) // duplicate — no-op
    expect(getPinnedIds()).toEqual([1, 2])
  })

  it('unpinView filters; no-op for absent id', () => {
    pinView(1)
    pinView(2)
    pinView(3)
    unpinView(2)
    expect(getPinnedIds()).toEqual([1, 3])
    unpinView(99) // not pinned — no-op
    expect(getPinnedIds()).toEqual([1, 3])
  })
})

// ---------------------------------------------------------------------------
// Recent ad-hoc states (VIEW-09)
// ---------------------------------------------------------------------------

describe('savedViews — recent ad-hoc states (VIEW-09)', () => {
  // console.warn fires when the cap is hit — silence it for the spec output.
  let warnSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('starts empty', () => {
    expect(getRecentStates('/cost')).toEqual([])
  })

  it('prepends new states (newest-first FIFO order)', () => {
    pushRecentState({ route: '/cost', state: { range: '7d' }, visitedAt: 1 })
    pushRecentState({ route: '/cost', state: { range: '30d' }, visitedAt: 2 })
    const recents = getRecentStates('/cost')
    expect(recents[0].state).toEqual({ range: '30d' })
    expect(recents[1].state).toEqual({ range: '7d' })
  })

  it('dedupes identical state (oscillating between same N states does not bloat the ring)', () => {
    pushRecentState({ route: '/cost', state: { range: '7d' }, visitedAt: 1 })
    pushRecentState({ route: '/cost', state: { range: '7d' }, visitedAt: 2 })
    expect(getRecentStates('/cost')).toHaveLength(1)
    // The newer visitedAt wins (the prior entry is filtered out before prepend).
    expect(getRecentStates('/cost')[0].visitedAt).toBe(2)
  })

  it('truncates to RECENT_STATES_CAP', () => {
    for (let i = 0; i < RECENT_STATES_CAP + 5; i++) {
      pushRecentState({ route: '/cost', state: { i }, visitedAt: i })
    }
    expect(getRecentStates('/cost')).toHaveLength(RECENT_STATES_CAP)
  })

  it('returns atCap=true when the list was at the cap before the push', () => {
    for (let i = 0; i < RECENT_STATES_CAP; i++) {
      pushRecentState({ route: '/cost', state: { i }, visitedAt: i })
    }
    const r = pushRecentState({
      route: '/cost',
      state: { extra: 1 },
      visitedAt: 999,
    })
    expect(r.atCap).toBe(true)
    // console.warn was emitted as the documented user-visible feedback signal.
    expect(warnSpy).toHaveBeenCalled()
  })

  it('returns atCap=false when below the cap', () => {
    const r = pushRecentState({
      route: '/cost',
      state: { x: 1 },
      visitedAt: 1,
    })
    expect(r.atCap).toBe(false)
  })

  it('isolates routes (per-route ring, not a single global ring)', () => {
    pushRecentState({ route: '/cost', state: { x: 1 }, visitedAt: 1 })
    pushRecentState({ route: '/alerts', state: { y: 1 }, visitedAt: 2 })
    expect(getRecentStates('/cost')).toHaveLength(1)
    expect(getRecentStates('/alerts')).toHaveLength(1)
    expect(getRecentStates('/cost')[0].state).toEqual({ x: 1 })
    expect(getRecentStates('/alerts')[0].state).toEqual({ y: 1 })
  })

  it('clearRecentStates wipes a single route only', () => {
    pushRecentState({ route: '/cost', state: { x: 1 }, visitedAt: 1 })
    pushRecentState({ route: '/alerts', state: { y: 1 }, visitedAt: 2 })
    clearRecentStates('/cost')
    expect(getRecentStates('/cost')).toEqual([])
    expect(getRecentStates('/alerts')).toHaveLength(1)
  })

  it('getAllRecentStates aggregates across the provided route list', () => {
    pushRecentState({ route: '/cost', state: { x: 1 }, visitedAt: 1 })
    pushRecentState({ route: '/alerts', state: { y: 1 }, visitedAt: 2 })
    pushRecentState({ route: '/skills', state: { z: 1 }, visitedAt: 3 })
    const all = getAllRecentStates(['/cost', '/alerts', '/skills'])
    expect(all).toHaveLength(3)
    // Order is route-list-driven, not visitedAt-driven (per docstring).
    expect(all[0].route).toBe('/cost')
    expect(all[1].route).toBe('/alerts')
    expect(all[2].route).toBe('/skills')
  })

  it('uses the documented cmc.savedView.recent.<route> key shape', () => {
    pushRecentState({ route: '/cost', state: { range: '7d' }, visitedAt: 1 })
    const raw = window.localStorage.getItem('cmc.savedView.recent./cost')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!) as Array<{ state: Record<string, unknown> }>
    expect(parsed[0].state).toEqual({ range: '7d' })
  })
})
