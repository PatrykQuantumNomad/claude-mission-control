// frontend/src/lib/__tests__/recents.test.ts — Phase 26 Plan 02.
//
// Vitest coverage for the cmc.recents.routes FIFO ring (SHEL-05 + CMDK-04
// source of truth). Each test isolates by clearing window.localStorage in
// beforeEach so tests can run in parallel without cross-pollination.

import { describe, it, expect, beforeEach } from 'vitest'
import {
  pushRecentRoute,
  getRecentRoutes,
  clearRecentRoutes,
  type RecentRoute,
} from '../recents'

const KEY = 'cmc.recents.routes'

describe('recents — pushRecentRoute + getRecentRoutes (Phase 26 Plan 02)', () => {
  beforeEach(() => window.localStorage.clear())

  it('push single entry — getRecentRoutes returns it', () => {
    const entry: RecentRoute = { route: '/activity', visitedAt: 1000 }
    pushRecentRoute(entry)
    expect(getRecentRoutes()).toEqual([entry])
  })

  it('push 3 different routes — returns newest-first', () => {
    pushRecentRoute({ route: '/', visitedAt: 1000 })
    pushRecentRoute({ route: '/activity', visitedAt: 2000 })
    pushRecentRoute({ route: '/cost', visitedAt: 3000 })
    expect(getRecentRoutes()).toEqual([
      { route: '/cost', visitedAt: 3000 },
      { route: '/activity', visitedAt: 2000 },
      { route: '/', visitedAt: 1000 },
    ])
  })

  it('push same route twice in a row — ring length stays 1, visitedAt updates', () => {
    pushRecentRoute({ route: '/activity', visitedAt: 1000 })
    pushRecentRoute({ route: '/activity', visitedAt: 2000 })
    expect(getRecentRoutes()).toEqual([
      { route: '/activity', visitedAt: 2000 },
    ])
  })

  it('push NOT-in-a-row (A, B, A) — A surfaces to head, B drops to position 2, length 2', () => {
    pushRecentRoute({ route: '/activity', visitedAt: 1000 })
    pushRecentRoute({ route: '/cost', visitedAt: 2000 })
    pushRecentRoute({ route: '/activity', visitedAt: 3000 })
    expect(getRecentRoutes()).toEqual([
      { route: '/activity', visitedAt: 3000 },
      { route: '/cost', visitedAt: 2000 },
    ])
  })

  it('push > 20 routes — ring truncates to cap of 20', () => {
    for (let i = 0; i < 25; i += 1) {
      pushRecentRoute({ route: `/route-${i}`, visitedAt: i })
    }
    const ring = getRecentRoutes()
    expect(ring).toHaveLength(20)
    // Newest-first: /route-24 → /route-5 (the oldest 5 fall off the tail).
    expect(ring[0]).toEqual({ route: '/route-24', visitedAt: 24 })
    expect(ring[19]).toEqual({ route: '/route-5', visitedAt: 5 })
  })

  it('getRecentRoutes() on fresh localStorage — returns []', () => {
    expect(getRecentRoutes()).toEqual([])
  })

  it('clearRecentRoutes() empties the ring', () => {
    pushRecentRoute({ route: '/activity', visitedAt: 1000 })
    expect(getRecentRoutes()).toHaveLength(1)
    clearRecentRoutes()
    expect(getRecentRoutes()).toEqual([])
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it('readRing tolerates malformed JSON (returns [])', () => {
    window.localStorage.setItem(KEY, '{ not json')
    expect(getRecentRoutes()).toEqual([])
  })

  it('readRing tolerates non-array JSON (returns [])', () => {
    window.localStorage.setItem(KEY, '{"oops": true}')
    expect(getRecentRoutes()).toEqual([])
  })

  it('readRing filters out shape-invalid entries (defense in depth)', () => {
    // A stale storage blob from a future migration may include junk; the
    // filter keeps only shape-valid RecentRoute records.
    window.localStorage.setItem(
      KEY,
      JSON.stringify([
        { route: '/activity', visitedAt: 1000 },
        { route: 42, visitedAt: 2000 }, // route must be string
        { route: '/cost', visitedAt: 'recent' }, // visitedAt must be number
        null,
        'string-entry',
      ]),
    )
    expect(getRecentRoutes()).toEqual([
      { route: '/activity', visitedAt: 1000 },
    ])
  })

  it('writes under the cmc.* namespace (cmc.recents.routes)', () => {
    pushRecentRoute({ route: '/activity', visitedAt: 1000 })
    expect(window.localStorage.getItem(KEY)).toBe(
      JSON.stringify([{ route: '/activity', visitedAt: 1000 }]),
    )
  })
})
