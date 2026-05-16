// Phase 28 Plan 02 — vitest regression net for `useLayoutState`.
//
// Pattern parity: mirrors `useRouteRangeVocab.test.ts` (Phase 27 Plan 01) —
// `@tanstack/react-router` is mocked at module scope so `useRouterState`
// returns a mutable `mockSearch` object and `useNavigate` returns a recorded
// spy that captures the search-mutator function.
//
// Coverage shape (one `it(...)` per behavior in the Plan 28-02 spec):
//   1. isHidden — false-default + true-after-set + false-after-clear
//   2. setHidden — writes URL with sorted CSV; removes param when set is empty
//   3. orderedPanels — URL drives order; registry trailing; unknown filtered
//   4. splitSizes — parses URL; undefined when absent
//   5. setSplit — number[] path + null prune + empty-array prune + last-group-prune
//   6. reset — clears 3 keys; preserves time/compare/uuid; no-op when clean
//
// LAYO-04 SC#3 + Pitfall 11 lock asserted via explicit `reset preserves
// non-layout params` test that walks ALL non-layout keys
// (time_from / time_to / compare_panels / range / a / b / schemaVersion).
//
// Pitfall 7 defense in depth: `orderedPanels` filters URL ids that are not
// in `PANEL_REGISTRY[route]` — asserted via the "unknown ids" case using a
// known panel id from `/` registered to a different column.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// Mutable search state + navigate-spy. Both are reset before each test via
// the `beforeEach` block below.
let mockSearch: Record<string, unknown> = {}
const navigateSpy = vi.fn()

function setSearch(next: Record<string, unknown>): void {
  mockSearch = next
}

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateSpy,
  useRouterState: ({
    select,
  }: {
    select: (s: {
      location: { pathname: string; search: Record<string, unknown> }
    }) => unknown
  }) => select({ location: { pathname: '/', search: mockSearch } }),
}))

import { useLayoutState } from '../useLayoutState'
import { PANEL_REGISTRY } from '../panelRegistry'

// ─────────────────────────────────────────────────────────────────────
// Helper: extract the resolved next-search object from the most recent
// navigate call. The hook always calls navigate({ to, search: fn,
// replace }) — we feed the same `mockSearch` to `fn` to compute what the
// URL would actually contain after the navigation.
// ─────────────────────────────────────────────────────────────────────

function lastNavigateSearch(): Record<string, unknown> {
  const call = navigateSpy.mock.calls.at(-1)
  if (!call) throw new Error('navigate was never called')
  const arg = call[0] as {
    search: (prev: Record<string, unknown>) => Record<string, unknown>
  }
  return arg.search(mockSearch)
}

// ─────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────

describe('useLayoutState (Phase 28 Plan 28-02 — LAYO-01/02/03/04)', () => {
  beforeEach(() => {
    setSearch({})
    navigateSpy.mockClear()
  })

  // ─────────────────────────── isHidden ───────────────────────────

  describe('isHidden(panelId)', () => {
    it('returns false by default when hidden_panels is undefined', () => {
      const { result } = renderHook(() => useLayoutState('/'))
      expect(result.current.isHidden('token-usage')).toBe(false)
    })

    it('returns true when panelId appears in hidden_panels CSV', () => {
      setSearch({ hidden_panels: 'token-usage,attention-bar' })
      const { result } = renderHook(() => useLayoutState('/'))
      expect(result.current.isHidden('token-usage')).toBe(true)
      expect(result.current.isHidden('attention-bar')).toBe(true)
    })

    it('returns false when panelId is not in the CSV', () => {
      setSearch({ hidden_panels: 'token-usage' })
      const { result } = renderHook(() => useLayoutState('/'))
      expect(result.current.isHidden('cache-efficiency')).toBe(false)
    })
  })

  // ────────────────────── setHidden → URL writes ──────────────────────

  describe('setHidden(panelId, hide)', () => {
    it('writes URL with hidden_panels=token-usage (sorted CSV)', () => {
      const { result } = renderHook(() => useLayoutState('/'))
      result.current.setHidden('token-usage', true)
      expect(navigateSpy).toHaveBeenCalledTimes(1)
      expect(lastNavigateSearch()).toEqual({ hidden_panels: 'token-usage' })
    })

    it('sorts CSV deterministically when multiple panels are hidden', () => {
      setSearch({ hidden_panels: 'token-usage' })
      const { result } = renderHook(() => useLayoutState('/'))
      result.current.setHidden('attention-bar', true)
      // Sorted: a < t — `attention-bar` precedes `token-usage`.
      expect(lastNavigateSearch()).toEqual({
        hidden_panels: 'attention-bar,token-usage',
      })
    })

    it('removes panelId from CSV when hide=false', () => {
      setSearch({ hidden_panels: 'token-usage,attention-bar' })
      const { result } = renderHook(() => useLayoutState('/'))
      result.current.setHidden('token-usage', false)
      expect(lastNavigateSearch()).toEqual({
        hidden_panels: 'attention-bar',
      })
    })

    it('removes hidden_panels from URL entirely when set becomes empty (Pitfall 2 — NOT empty string)', () => {
      setSearch({ hidden_panels: 'token-usage' })
      const { result } = renderHook(() => useLayoutState('/'))
      result.current.setHidden('token-usage', false)
      // The serializer returns undefined → the spread sets the key to
      // undefined; the URL param is removed by TanStack (NOT set to '').
      expect(lastNavigateSearch().hidden_panels).toBeUndefined()
    })

    it('uses replace: true to avoid back-button noise (Phase 25/26 pattern)', () => {
      const { result } = renderHook(() => useLayoutState('/'))
      result.current.setHidden('token-usage', true)
      const call = navigateSpy.mock.calls.at(-1)?.[0] as {
        replace?: boolean
      }
      expect(call.replace).toBe(true)
    })
  })

  // ────────────────────── orderedPanels ──────────────────────

  describe('orderedPanels(columnId)', () => {
    it('returns registry order when URL has no panel_order override', () => {
      const { result } = renderHook(() => useLayoutState('/'))
      // First `main` panel in `/` registry is `token-usage` (verified by
      // panelRegistry.ts — first non-`top` entry).
      const mainOrder = result.current.orderedPanels('main')
      const expectedHead = PANEL_REGISTRY['/']
        .filter((p) => p.columnId === 'main')
        .map((p) => p.panelId)
      expect(mainOrder).toEqual(expectedHead)
    })

    it('respects panel_order CSV when the group matches the columnId', () => {
      // URL forces order: cache-efficiency before token-usage. Both are
      // registered on `/` `main`. Other `main` registry entries should
      // append in registry order.
      setSearch({ panel_order: 'main:cache-efficiency,token-usage' })
      const { result } = renderHook(() => useLayoutState('/'))
      const order = result.current.orderedPanels('main')
      expect(order[0]).toBe('cache-efficiency')
      expect(order[1]).toBe('token-usage')
      // Rest of registry-main panels should follow.
      const registryMain = PANEL_REGISTRY['/']
        .filter((p) => p.columnId === 'main')
        .map((p) => p.panelId)
      expect(order.length).toBe(registryMain.length)
      // Both `cache-efficiency` and `token-usage` appear exactly once.
      expect(order.filter((id) => id === 'cache-efficiency').length).toBe(1)
      expect(order.filter((id) => id === 'token-usage').length).toBe(1)
    })

    it('filters out unknown panel ids via PANEL_REGISTRY (Pitfall 7 graceful drift)', () => {
      // URL references a panel id NOT in /'s `main` column — must drop.
      setSearch({ panel_order: 'main:fake-deleted-panel,token-usage' })
      const { result } = renderHook(() => useLayoutState('/'))
      const order = result.current.orderedPanels('main')
      expect(order).not.toContain('fake-deleted-panel')
      expect(order[0]).toBe('token-usage')
    })

    it('returns empty array for an unknown column on a known route', () => {
      const { result } = renderHook(() => useLayoutState('/'))
      expect(result.current.orderedPanels('does-not-exist')).toEqual([])
    })

    it('returns empty array for an unknown route', () => {
      const { result } = renderHook(() => useLayoutState('/nonexistent'))
      expect(result.current.orderedPanels('main')).toEqual([])
    })
  })

  // ────────────────────── setOrder ──────────────────────

  describe('setOrder(columnId, panelIds)', () => {
    it('writes panel_order CSV with the column group', () => {
      const { result } = renderHook(() => useLayoutState('/'))
      result.current.setOrder('main', ['cache-efficiency', 'token-usage'])
      expect(lastNavigateSearch().panel_order).toBe(
        'main:cache-efficiency,token-usage',
      )
    })

    it('preserves other columns when writing a single column', () => {
      setSearch({ panel_order: 'top:kpi-row,system-pressure' })
      const { result } = renderHook(() => useLayoutState('/'))
      result.current.setOrder('main', ['token-usage', 'cache-efficiency'])
      // Both groups present; serialized alphabetically by columnId.
      const out = lastNavigateSearch().panel_order as string
      expect(out).toContain('main:token-usage,cache-efficiency')
      expect(out).toContain('top:kpi-row,system-pressure')
    })
  })

  // ────────────────────── splitSizes ──────────────────────

  describe('splitSizes(groupId)', () => {
    it('parses split_sizes for a matching groupId', () => {
      setSearch({ split_sizes: 'compare:55,45' })
      const { result } = renderHook(() => useLayoutState('/sessions/compare'))
      expect(result.current.splitSizes('compare')).toEqual([55, 45])
    })

    it('returns undefined when split_sizes is absent', () => {
      const { result } = renderHook(() => useLayoutState('/sessions/compare'))
      expect(result.current.splitSizes('compare')).toBeUndefined()
    })

    it('returns undefined when group is not present', () => {
      setSearch({ split_sizes: 'other:50,50' })
      const { result } = renderHook(() => useLayoutState('/sessions/compare'))
      expect(result.current.splitSizes('compare')).toBeUndefined()
    })
  })

  // ────────────────────── setSplit ──────────────────────

  describe('setSplit(groupId, sizes)', () => {
    it('writes split_sizes for a numeric array', () => {
      const { result } = renderHook(() => useLayoutState('/sessions/compare'))
      result.current.setSplit('compare', [60, 40])
      expect(lastNavigateSearch().split_sizes).toBe('compare:60,40')
    })

    it('rounds non-integer sizes to integers', () => {
      const { result } = renderHook(() => useLayoutState('/sessions/compare'))
      result.current.setSplit('compare', [60.4, 39.6])
      expect(lastNavigateSearch().split_sizes).toBe('compare:60,40')
    })

    it('prunes the group when sizes is null', () => {
      setSearch({ split_sizes: 'compare:60,40;main:30,70' })
      const { result } = renderHook(() => useLayoutState('/sessions/compare'))
      result.current.setSplit('compare', null)
      // Only `main` group survives.
      expect(lastNavigateSearch().split_sizes).toBe('main:30,70')
    })

    it('prunes the group when sizes is an empty array (treated same as null)', () => {
      setSearch({ split_sizes: 'compare:60,40;main:30,70' })
      const { result } = renderHook(() => useLayoutState('/sessions/compare'))
      result.current.setSplit('compare', [])
      expect(lastNavigateSearch().split_sizes).toBe('main:30,70')
    })

    it('removes split_sizes from URL entirely when last group is pruned (Pitfall 2 lock)', () => {
      setSearch({ split_sizes: 'compare:60,40' })
      const { result } = renderHook(() => useLayoutState('/sessions/compare'))
      result.current.setSplit('compare', null)
      // No groups left → param is removed entirely (NOT empty string).
      expect(lastNavigateSearch().split_sizes).toBeUndefined()
    })
  })

  // ────────────────────── reset ──────────────────────

  describe('reset()', () => {
    it('clears hidden_panels, panel_order, and split_sizes from the URL', () => {
      setSearch({
        hidden_panels: 'token-usage',
        panel_order: 'main:cache-efficiency,token-usage',
        split_sizes: 'compare:60,40',
      })
      const { result } = renderHook(() => useLayoutState('/'))
      result.current.reset()
      const next = lastNavigateSearch()
      expect(next.hidden_panels).toBeUndefined()
      expect(next.panel_order).toBeUndefined()
      expect(next.split_sizes).toBeUndefined()
    })

    it('preserves time_from, time_to, compare_panels, range, a, b, schemaVersion (LAYO-04 SC#3 / Pitfall 11)', () => {
      setSearch({
        schemaVersion: 1,
        time_from: 'now-7d',
        time_to: 'now',
        compare_panels: 'token-usage',
        range: '7d',
        a: '12345678-1234-1234-1234-123456789012',
        b: 'abcdef01-2345-6789-abcd-ef0123456789',
        hidden_panels: 'token-usage',
        panel_order: 'main:cache-efficiency,token-usage',
        split_sizes: 'compare:60,40',
      })
      const { result } = renderHook(() => useLayoutState('/sessions/compare'))
      result.current.reset()
      const next = lastNavigateSearch()
      // The 7 non-layout keys MUST survive.
      expect(next.schemaVersion).toBe(1)
      expect(next.time_from).toBe('now-7d')
      expect(next.time_to).toBe('now')
      expect(next.compare_panels).toBe('token-usage')
      expect(next.range).toBe('7d')
      expect(next.a).toBe('12345678-1234-1234-1234-123456789012')
      expect(next.b).toBe('abcdef01-2345-6789-abcd-ef0123456789')
      // The 3 layout keys MUST be gone.
      expect(next.hidden_panels).toBeUndefined()
      expect(next.panel_order).toBeUndefined()
      expect(next.split_sizes).toBeUndefined()
    })

    it('is a no-op when the URL has no layout overrides (avoid history pollution)', () => {
      setSearch({ time_from: 'now-7d', time_to: 'now' })
      const { result } = renderHook(() => useLayoutState('/'))
      result.current.reset()
      expect(navigateSpy).not.toHaveBeenCalled()
    })

    it('fires when at least one layout key is present (partial state still resets)', () => {
      setSearch({
        time_from: 'now-7d',
        hidden_panels: 'token-usage',
        // panel_order + split_sizes absent — still triggers reset.
      })
      const { result } = renderHook(() => useLayoutState('/'))
      result.current.reset()
      expect(navigateSpy).toHaveBeenCalledTimes(1)
      const next = lastNavigateSearch()
      expect(next.hidden_panels).toBeUndefined()
      expect(next.time_from).toBe('now-7d') // preserved
    })
  })

  // ────────────────────── URL mutation contract ──────────────────────

  describe('setHidden / setOrder / setSplit URL mutation contract', () => {
    it('writes via navigate({ search: prev => ... }) — function form (Pitfall 1)', () => {
      const { result } = renderHook(() => useLayoutState('/'))
      result.current.setHidden('token-usage', true)
      const call = navigateSpy.mock.calls.at(-1)?.[0] as {
        search: unknown
      }
      // search is a FUNCTION (not an object literal) — the function form
      // is required so concurrent URL writes from other components don't
      // clobber each other (Phase 26 Pitfall 1 lock).
      expect(typeof call.search).toBe('function')
    })

    it('omits the param entirely when the value reduces to the empty set (Pitfall 2)', () => {
      // hidden_panels = '' is the regression — assert undefined, NOT ''.
      setSearch({ hidden_panels: 'token-usage' })
      const { result } = renderHook(() => useLayoutState('/'))
      result.current.setHidden('token-usage', false)
      expect(lastNavigateSearch().hidden_panels).toBeUndefined()
    })
  })
})
