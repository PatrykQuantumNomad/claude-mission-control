// routeNormalize — Phase 25 Plan 10 extraction.
//
// Shared coercion utility. TanStack Router exposes a *resolved* pathname
// (e.g. `/skills/foo`) at runtime, but the backend `saved_views.route` column
// is keyed by the route *id* (e.g. `/skills/$name`) so a single saved view
// matches every `/skills/<name>` visit. This function is the single
// coercion site — every consumer (SavedViewMenu Plan 06, CommandPalette
// Plan 08, PinnedViewsSection Plan 09, DefaultViewLoader + RecentStateTracker
// Plan 10) imports `normalizeRouteId` from here. Inline copies have been
// removed; do not re-introduce them.
//
// Wave-2 v1.3 routes:
//   - `/`, `/activity`, `/skills`, `/cost`, `/alerts`, `/sessions/compare`
//     are static — pathname === route id; passes through unchanged.
//   - `/skills/$name` is the only dynamic-segment route — any pathname
//     starting with `/skills/` (and NOT equal to `/skills/`, which is the
//     index route, not the detail route) collapses to `/skills/$name`.
//
// Future dynamic routes extend this single function. Keep callers
// downstream pure: only normalize once at the boundary, never inside
// derived state.

export function normalizeRouteId(pathname: string): string {
  // `/skills/` (with trailing slash) is the index route — do NOT coerce it to
  // the detail route id; only `/skills/<name>` collapses to `/skills/$name`.
  if (pathname.startsWith('/skills/') && pathname !== '/skills/') {
    return '/skills/$name'
  }
  return pathname || '/'
}
