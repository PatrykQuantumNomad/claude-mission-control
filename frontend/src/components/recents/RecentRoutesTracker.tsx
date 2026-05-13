// RecentRoutesTracker — Phase 26 Plan 04 (SHEL-05, CMDK-04).
//
// Zero-render effect that pushes the current route to cmc.recents.routes
// on every navigation to an IN_SCOPE_ROUTES route. Mirror of Phase 25
// Plan 10's RecentStateTracker pattern — but writes ROUTE NAMES (not URL
// states): the FIFO ring is the source of truth for both the Sidebar
// "Recently Visited" section (top 3) and the Cmd+K Recents group (top 5,
// shipped in a later plan).
//
// IN_SCOPE_ROUTES mirrors RecentStateTracker's set. /skills/$name is the
// only dynamic-segment route — any pathname starting with `/skills/`
// (and NOT equal to `/skills/`, the index) collapses to `/skills/$name`
// via the local normalizeRouteId helper (kept inline rather than imported
// from savedviews/routeNormalize.ts to keep the recents/ module
// self-contained — both helpers are identical and intentionally
// duplicated; if they diverge in the future, this comment is the
// breadcrumb).
//
// Pitfall 8 option (b): we DO push from useEffect (post-render) and
// RecentlyVisitedSection re-renders on the next navigation via
// useRouterState. The "currently active" route is FILTERED OUT of the
// display list (in RecentlyVisitedSection), so the one-frame flicker is
// invisible — the user never sees the route they're standing on in
// "Recently Visited".

import { useEffect } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { pushRecentRoute } from '../../lib/recents'

const IN_SCOPE_ROUTES = new Set<string>([
  '/',
  '/activity',
  '/sessions/compare',
  '/skills',
  '/skills/$name',
  '/cost',
  '/alerts',
])

function normalizeRouteId(pathname: string): string {
  // `/skills/` (index, trailing slash) does NOT collapse — only
  // `/skills/<name>` becomes `/skills/$name`. Mirrors Phase 25
  // savedviews/routeNormalize.ts exactly.
  if (pathname.startsWith('/skills/') && pathname !== '/skills/') {
    return '/skills/$name'
  }
  return pathname
}

export function RecentRoutesTracker() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  useEffect(() => {
    const route = normalizeRouteId(pathname)
    if (!IN_SCOPE_ROUTES.has(route)) return
    pushRecentRoute({ route, visitedAt: Date.now() })
  }, [pathname])
  return null
}
