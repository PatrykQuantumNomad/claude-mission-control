---
phase: 25-saved-views-backend-frontend
plan: 10
type: execute
wave: 5
depends_on: ["05", "06"]
files_modified:
  - frontend/src/components/savedviews/DefaultViewLoader.tsx
  - frontend/src/components/savedviews/RecentStateTracker.tsx
  - frontend/src/components/shell/AppShell.tsx
  - frontend/src/components/savedviews/__tests__/DefaultViewLoader.test.tsx
  - frontend/src/components/savedviews/__tests__/RecentStateTracker.test.tsx
  - docs/testid-registry.md
autonomous: true

must_haves:
  truths:
    - "When user navigates to a route with empty search params, the per-route default view's state_json is applied (if a default is set)"
    - "When user navigates with explicit search params (deep-link), the querystring ALWAYS wins over the default — default is NOT applied (VIEW-06 lock)"
    - "Each URL change on an in-scope route is pushed to cmc.savedView.recent.<route> with FIFO 50-cap (VIEW-09)"
    - "Recent-state cap-warning surfaces to the user (existing console.warn from Plan 05 + optional inline toast or status text)"
  artifacts:
    - path: "frontend/src/components/savedviews/DefaultViewLoader.tsx"
      provides: "One-shot effect that applies the per-route default-view when URL is empty (VIEW-06)"
      contains: "DefaultViewLoader"
    - path: "frontend/src/components/savedviews/RecentStateTracker.tsx"
      provides: "Effect that pushes every URL change to recent-states FIFO (VIEW-09)"
      contains: "RecentStateTracker"
  key_links:
    - from: "frontend/src/components/shell/AppShell.tsx"
      to: "DefaultViewLoader + RecentStateTracker"
      via: "JSX mount as zero-render side-effect components"
      pattern: "DefaultViewLoader|RecentStateTracker"
    - from: "DefaultViewLoader"
      to: "frontend/src/lib/savedViews.ts (getDefaultViewId)"
      via: "read per-route pointer on mount + first navigation"
      pattern: "getDefaultViewId"
---

<objective>
Ship VIEW-06 + VIEW-09: the per-route default-view auto-load behavior AND the recent-ad-hoc-states tracking. Both are zero-render side-effect components mounted in `AppShell`.

VIEW-06 (default-view auto-load):
- On route mount with empty search params (excluding `schemaVersion`), apply the per-route default view's state_json via `navigate({ search })`.
- Querystring ALWAYS wins over the default (deep-link wins per VIEW-06 lock).
- One-shot per route entry — no re-firing within the same mount.

VIEW-09 (recent ad-hoc states):
- Every URL state change on an in-scope route pushes the new state into `cmc.savedView.recent.<route>` with FIFO 50-cap (Plan 05's `pushRecentState`).
- Deduped — same state at top is not re-pushed.

Purpose: Both criteria are non-visual side-effects of navigation. Implementing them as effect-only components keeps the React tree clean and the logic colocated.
Output: User sets a default on `/cost`, navigates away, returns to `/cost` with no query — sees the default-view's filters applied. User makes 6 ad-hoc filter changes — sees them surfaced via Plan 11's Cmd+K extension (visible only at e2e; Plan 10 stops at the storage push).
</objective>

<execution_context>
@/Users/patrykattc/.claude/get-shit-done/workflows/execute-plan.md
@/Users/patrykattc/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/25-saved-views-backend-frontend/25-RESEARCH.md
@.planning/phases/25-saved-views-backend-frontend/25-05-SUMMARY.md
@.planning/phases/25-saved-views-backend-frontend/25-06-SUMMARY.md

# Reference patterns
@frontend/src/components/shell/AppShell.tsx
@frontend/src/lib/savedViews.ts
@frontend/src/lib/queries.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create DefaultViewLoader effect-only component</name>
  <files>frontend/src/components/savedviews/DefaultViewLoader.tsx, docs/testid-registry.md</files>
  <action>
Create `frontend/src/components/savedviews/DefaultViewLoader.tsx`. Returns `null`; only side-effect is the one-shot default-view application.

```typescript
import { useEffect, useRef } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useSavedView } from '../../lib/queries'
import { getDefaultViewId } from '../../lib/savedViews'
import { useLoadedView } from './LoadedViewContext'
import { normalizeRouteId } from './routeNormalize'  // extract this util shared with SavedViewMenu (Plan 06) + CommandPalette (Plan 08)

/**
 * VIEW-06: applies the per-route default view's state_json when the user
 * enters a route with empty search params (excluding schemaVersion).
 *
 * One-shot per route entry — re-firing would cause an infinite loop
 * (apply → URL changes → effect re-runs → apply again).
 *
 * Querystring ALWAYS wins over the default (Pitfall 8). When the URL has any
 * meaningful key (not schemaVersion), this effect is a no-op.
 */
export function DefaultViewLoader() {
  const navigate = useNavigate()
  const location = useRouterState({ select: (s) => s.location })
  const { setLoadedView } = useLoadedView()
  const appliedKeyRef = useRef<string | null>(null)

  const route = normalizeRouteId(location.pathname)
  const defaultId = getDefaultViewId(route)
  const { data: defaultView } = useSavedView(defaultId)

  useEffect(() => {
    // Re-arm whenever the user enters a new route id
    appliedKeyRef.current = null
  }, [route])

  useEffect(() => {
    if (!defaultView) return
    if (appliedKeyRef.current === route) return  // already applied for this entry

    const meaningfulKeys = Object.keys(location.search ?? {}).filter((k) => k !== 'schemaVersion')
    if (meaningfulKeys.length > 0) {
      // Deep-link wins; mark as "applied" so we don't re-fire later in the same mount.
      appliedKeyRef.current = route
      return
    }

    // Apply the default
    navigate({
      to: location.pathname,
      search: defaultView.state_json as Record<string, unknown>,
      replace: true,  // don't push a history entry for the auto-apply
    })
    setLoadedView(defaultView)
    appliedKeyRef.current = route
  }, [defaultView, route, location.pathname, location.search, navigate, setLoadedView])

  return null
}
```

NOTE on `normalizeRouteId`: this is the SAME utility used by Plan 06's SavedViewMenu + Plan 08's CommandPalette + Plan 09's PinnedViewsSection. Extract it now into `frontend/src/components/savedviews/routeNormalize.ts` (single export `normalizeRouteId(pathname: string): string`). Update Plans 06/08/09 if their inline versions still exist (find/replace; same logic).

```typescript
// frontend/src/components/savedviews/routeNormalize.ts
/**
 * Convert a TanStack pathname (e.g. /skills/foo) to a route id (e.g. /skills/$name).
 * Phase 25 — only /skills/$name uses a dynamic segment. Future dynamic routes
 * extend this map.
 */
export function normalizeRouteId(pathname: string): string {
  if (pathname.startsWith('/skills/') && pathname !== '/skills/') return '/skills/$name'
  return pathname || '/'
}
```

Register `default-view-loader` is NOT needed (component renders null, no testid). No registry change.

CRITICAL invariants:
- Pitfall 8 (querystring wins): the empty-search check excludes `schemaVersion`. A URL like `/cost?schemaVersion=1` is "empty" for VIEW-06 purposes.
- One-shot per entry: `appliedKeyRef` prevents re-firing within the same route mount. When the user navigates AWAY and comes back, the `useEffect` re-init on `route` change re-arms.
- `replace: true` on the auto-apply prevents a back-button "back to bare URL" hazard.
  </action>
  <verify>
`pnpm tsc --noEmit` clean. Vitest in Task 3. Manual smoke: set a default view on /cost (via SavedViewMenu "Set as default"); navigate to /alerts; navigate to /cost with NO query — see the default's filters appear in the URL (via DevTools Network or address bar); navigate to /cost?range=7d explicitly — see range=7d remain (deep link wins).
  </verify>
  <done>
DefaultViewLoader applies default on empty-search route entry; deep-link wins; one-shot per entry.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create RecentStateTracker effect-only component</name>
  <files>frontend/src/components/savedviews/RecentStateTracker.tsx</files>
  <action>
Create `frontend/src/components/savedviews/RecentStateTracker.tsx`. Returns null; pushes every URL change into `cmc.savedView.recent.<route>` via Plan 05's `pushRecentState`.

```typescript
import { useEffect } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { pushRecentState } from '../../lib/savedViews'
import { normalizeRouteId } from './routeNormalize'

const IN_SCOPE_ROUTES = new Set([
  '/', '/activity', '/skills', '/skills/$name', '/cost', '/alerts', '/sessions/compare',
])

/**
 * VIEW-09: track every URL change as a recent ad-hoc state for the route.
 * FIFO 50-cap (dedupe in pushRecentState). Only in-scope routes are tracked
 * (out-of-scope routes don't have validateSearch, so their search params
 * aren't meaningful for the saved-views surface).
 */
export function RecentStateTracker() {
  const location = useRouterState({ select: (s) => s.location })

  useEffect(() => {
    const route = normalizeRouteId(location.pathname)
    if (!IN_SCOPE_ROUTES.has(route)) return

    const search = location.search as Record<string, unknown>
    const meaningfulKeys = Object.keys(search).filter((k) => k !== 'schemaVersion')
    if (meaningfulKeys.length === 0) return  // bare URL — not a meaningful ad-hoc state

    pushRecentState({
      route,
      state: search,
      visitedAt: Date.now(),
    })
  }, [location.pathname, location.search])

  return null
}
```

IMPORTANT:
- ONLY push when there's at least one non-`schemaVersion` key. The bare default-render URLs would otherwise flood the recents list with noise.
- Dedupe is handled by `pushRecentState` (Plan 05) — same state at the head is not re-pushed.
- `IN_SCOPE_ROUTES` is the set of routes with `validateSearch` from Plans 03 + 04. If a future plan adds another route, this set MUST be extended (or — better — derive it from a single source).

OPTIONAL: surface the at-cap warning visibly. Plan 05's `pushRecentState` returns `{ atCap }` and emits a `console.warn`. For v1, the console.warn is the minimum. Plan 10 can OPTIONALLY add a toast via the existing toast system if there is one — search the codebase for `sonner` or a similar toast library. If no toast system exists, leave `console.warn` as the user-visible signal and document in SUMMARY.
  </action>
  <verify>
`pnpm tsc --noEmit` clean. Manual: navigate to `/cost?range=7d`, then `/cost?range=30d`, then `/cost?range=14d` — DevTools localStorage → `cmc.savedView.recent./cost` should hold 3 entries with the most recent first.
  </verify>
  <done>
RecentStateTracker pushes meaningful URL changes; out-of-scope routes ignored; bare-URL noise filtered.
  </done>
</task>

<task type="auto">
  <name>Task 3: Mount both effect-only components in AppShell + vitest coverage</name>
  <files>frontend/src/components/shell/AppShell.tsx, frontend/src/components/savedviews/__tests__/DefaultViewLoader.test.tsx, frontend/src/components/savedviews/__tests__/RecentStateTracker.test.tsx</files>
  <action>
**File A — `AppShell.tsx`**: mount both components inside `LoadedViewProvider` (set up in Plan 06) but ABOVE the Outlet — they need access to navigation + loaded-view context, but they themselves render nothing. Read the existing `AppShell.tsx` structure first.

```tsx
import { DefaultViewLoader } from '../savedviews/DefaultViewLoader'
import { RecentStateTracker } from '../savedviews/RecentStateTracker'

// inside the AppShell return, somewhere inside LoadedViewProvider:
<LoadedViewProvider>
  <DefaultViewLoader />
  <RecentStateTracker />
  {/* existing JSX: Sidebar, AppShellHeader, Outlet */}
</LoadedViewProvider>
```

**File B — `DefaultViewLoader.test.tsx`**: vitest cases:
- Renders null (assert no DOM output).
- When `useSavedView(defaultId)` returns a view AND search has only `schemaVersion`, calls `navigate({ search: view.state_json, replace: true })`.
- When search has any non-schemaVersion key, does NOT navigate (deep-link wins).
- When `getDefaultViewId` returns null, does NOT navigate.
- Re-firing within the same route mount is a no-op (apply-once invariant).

Mock pattern follows Plan 09's tests.

**File C — `RecentStateTracker.test.tsx`**: vitest cases:
- Out-of-scope route → no `pushRecentState` call.
- In-scope route + non-empty search → `pushRecentState` called with `{route, state, visitedAt}`.
- In-scope route + empty search (only schemaVersion) → no call.
- Successive identical states → only one push (dedupe handled in lib/savedViews; this test asserts via mock call count).

Mock `pushRecentState` directly via `vi.mock`.

IMPORTANT:
- These two components mounted in AppShell are LIVE on every route — a regression here is a project-wide hazard. The tests are the regression net.
- Plan 09's PinnedViewsSection uses `getPinnedIds` synchronously from localStorage; same pattern applies here. Tests reset localStorage between cases.
  </action>
  <verify>
`pnpm test --run src/components/savedviews/__tests__/DefaultViewLoader.test.tsx src/components/savedviews/__tests__/RecentStateTracker.test.tsx` — all 9+ cases pass. Full vitest matrix still green.
  </verify>
  <done>
Both components mounted in AppShell; ~9 vitest cases passing; tsc + lint clean.
  </done>
</task>

</tasks>

<verification>
1. `cd frontend && pnpm tsc --noEmit` clean.
2. `cd frontend && pnpm test --run` — full vitest green; count up by ~9.
3. `cd frontend && pnpm lint` clean.
4. `cd frontend && pnpm build` succeeds.
5. Manual flow (success criterion 1 from ROADMAP):
   - On `/skills/<name>`, save a view via SavedViewMenu.
   - Set it as default.
   - Navigate to `/alerts`.
   - Navigate back to `/skills/<name>` with NO query (clean URL).
   - Watch the URL gain the saved-view's filters automatically.
   - Now navigate to `/skills/<name>?range=14d` explicitly — query stays as `?range=14d` (deep-link wins).
6. Manual flow (VIEW-09):
   - Change filters 5 times in a row on `/cost`.
   - DevTools → Application → localStorage → `cmc.savedView.recent./cost` shows 5 entries.
</verification>

<success_criteria>
- VIEW-06 satisfied: per-route default applies on empty-URL entry; deep-link wins.
- VIEW-09 satisfied: recent ad-hoc states tracked into FIFO with cap; out-of-scope routes ignored.
- Both components mounted in AppShell — live on every route.
- Plan 11 e2e can verify the cold-load default behavior and the recent-states surfacing (the latter requires Plan 11 to extend CommandPalette to show the recents — note for Plan 11).
</success_criteria>

<output>
After completion, create `.planning/phases/25-saved-views-backend-frontend/25-10-SUMMARY.md` documenting:
- AppShell mount order (DefaultViewLoader before RecentStateTracker; both inside LoadedViewProvider)
- normalizeRouteId extraction (shared util across Plans 06/08/09/10)
- Cap-warning surfacing decision (toast vs console.warn) — document the choice
- vitest count delta
- "Where to look first" hint for Plan 11: success criterion 1's e2e is "save a view + set as default + navigate away + return"
</output>
