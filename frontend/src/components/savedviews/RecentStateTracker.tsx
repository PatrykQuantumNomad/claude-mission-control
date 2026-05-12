// RecentStateTracker — Phase 25 Plan 10 (VIEW-09).
//
// Zero-render effect-only component mounted in AppShell inside
// LoadedViewProvider. Returns null. Sole responsibility: push every URL
// change on an in-scope route into `cmc.savedView.recent.<route>` via
// Plan 05's `pushRecentState` helper (FIFO 50-cap with structural
// dedupe).
//
// LOCKED invariants:
//   1. Only in-scope routes are tracked — out-of-scope routes do not have
//      `validateSearch`, so their search params are unstructured and not
//      meaningful for the saved-views surface. `IN_SCOPE_ROUTES` mirrors
//      the route-id set across Plans 03 + 04 + 06; if a future plan adds
//      a route with `validateSearch`, this set MUST be extended.
//   2. Bare-URL noise filter — only push when the URL has at least ONE
//      key that is not `schemaVersion`. Default-render URLs (e.g. a fresh
//      `/cost` with only `schemaVersion=1` injected by validateSearch)
//      would otherwise flood the ring with semantically-empty entries.
//   3. Structural dedupe lives in pushRecentState (Plan 05) — repeated
//      identical states at the head are NOT re-pushed (oscillation safe).
//   4. Cap signal — pushRecentState emits a console.warn when the ring is
//      at 50 entries. v1 surfaces only the console.warn; an upgraded toast
//      affordance was considered (decision documented in 25-10-SUMMARY.md
//      — sonner isn't installed; adding a toast library exceeds the
//      Phase 25 dependency budget).

import { useEffect } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { pushRecentState } from '../../lib/savedViews'
import { normalizeRouteId } from './routeNormalize'

/** Routes whose search params are managed by `validateSearch` and therefore
 * meaningful for ad-hoc-state tracking. Keep in sync with Phase 25
 * planning — extending this set is the deliberate gate for adding a new
 * route to the saved-views surface. */
const IN_SCOPE_ROUTES = new Set([
  '/',
  '/activity',
  '/skills',
  '/skills/$name',
  '/cost',
  '/alerts',
  '/sessions/compare',
])

export function RecentStateTracker() {
  const location = useRouterState({ select: (s) => s.location })

  useEffect(() => {
    const route = normalizeRouteId(location.pathname)
    if (!IN_SCOPE_ROUTES.has(route)) return

    const search = (location.search ?? {}) as Record<string, unknown>
    const meaningfulKeys = Object.keys(search).filter((k) => k !== 'schemaVersion')
    if (meaningfulKeys.length === 0) return // bare URL — not a meaningful ad-hoc state

    pushRecentState({
      route,
      state: search,
      visitedAt: Date.now(),
    })
  }, [location.pathname, location.search])

  return null
}
