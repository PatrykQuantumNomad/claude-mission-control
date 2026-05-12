// DefaultViewLoader — Phase 25 Plan 10 (VIEW-06).
//
// Zero-render effect-only component mounted in AppShell inside
// LoadedViewProvider. Returns null. Sole responsibility: when the user
// enters a route with EMPTY search params (excluding `schemaVersion`),
// apply the per-route default-view's `state_json` to the URL via
// `navigate({ search })` and set it as the loaded view.
//
// LOCKED invariants:
//   1. Querystring ALWAYS wins (Research Pitfall 8). If the URL has any
//      non-`schemaVersion` key, this effect is a no-op for the lifetime of
//      that route mount. Deep-links from bookmarks / Telegram alerts must
//      survive a default-view's existence.
//   2. One-shot per route entry. `appliedKeyRef` records the route id once
//      the effect has either applied OR explicitly skipped (deep-link won).
//      Without this guard the effect would re-fire after its own
//      `navigate({ search })` call — the URL would change → effect re-runs
//      → re-applies the default → infinite loop.
//   3. `replace: true` on the auto-apply: the back-button must NOT land on
//      the "bare URL" pre-default-apply state. Treating the default-apply
//      as a history push would create a hazardous back-stack.
//   4. Re-arm on route change: when the user navigates AWAY from a route
//      and returns, the `appliedKeyRef` is cleared so the default applies
//      again on the next entry.
//
// Why a component-not-a-hook: the effect needs to live INSIDE both
// LoadedViewProvider (for setLoadedView) AND the RouterProvider (for
// useNavigate + useRouterState). Mounting it as a sibling of the Outlet
// in AppShell is the cleanest place — it sees every route change without
// needing to be re-wired into every Route component.

import { useEffect, useRef } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useSavedView } from '../../lib/queries'
import { getDefaultViewId } from '../../lib/savedViews'
import { useLoadedView } from './LoadedViewContext'
import { normalizeRouteId } from './routeNormalize'

export function DefaultViewLoader() {
  const navigate = useNavigate()
  const location = useRouterState({ select: (s) => s.location })
  const { setLoadedView } = useLoadedView()
  // The last route id for which we've either applied the default OR
  // explicitly skipped because the URL had meaningful keys. Re-arms when
  // the route id changes (separate effect below).
  const appliedKeyRef = useRef<string | null>(null)

  const route = normalizeRouteId(location.pathname)
  const defaultId = getDefaultViewId(route)
  const { data: defaultView } = useSavedView(defaultId)

  useEffect(() => {
    // Re-arm whenever the user enters a new route id. Naked single-effect
    // would close over the previous `route` value; this isolated effect is
    // the cleanest re-arm trigger.
    appliedKeyRef.current = null
  }, [route])

  useEffect(() => {
    if (!defaultView) return
    if (appliedKeyRef.current === route) return // already handled for this entry

    const search = (location.search ?? {}) as Record<string, unknown>
    const meaningfulKeys = Object.keys(search).filter((k) => k !== 'schemaVersion')
    if (meaningfulKeys.length > 0) {
      // Deep-link wins (Pitfall 8). Lock the route in so re-renders don't
      // re-fire the effect, but do NOT mutate the URL.
      appliedKeyRef.current = route
      return
    }

    // Apply the default. `replace: true` so the back-button skips this
    // auto-apply (the user's history shows the bare URL → next page, not
    // bare URL → bare URL+filters → next page).
    navigate({
      to: location.pathname,
      search: defaultView.state_json as Record<string, unknown>,
      replace: true,
    })
    setLoadedView(defaultView)
    appliedKeyRef.current = route
  }, [
    defaultView,
    route,
    location.pathname,
    location.search,
    navigate,
    setLoadedView,
  ])

  return null
}
