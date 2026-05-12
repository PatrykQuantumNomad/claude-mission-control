---
phase: 25-saved-views-backend-frontend
plan: 10
subsystem: frontend / saved-views (shell)
tags: [VIEW-06, VIEW-09, shell, react, effect-only-components, view-load-default, view-recent-states]
dependency_graph:
  requires:
    - "Plan 05 — getDefaultViewId / pushRecentState helpers in lib/savedViews.ts (FIFO 50-cap; console.warn at cap)"
    - "Plan 06 — LoadedViewProvider mounted in AppShell (the two new children mount inside it)"
    - "lib/queries.ts useSavedView(id) — disabled when id is null"
  provides:
    - "DefaultViewLoader — VIEW-06: auto-applies per-route default view on empty-search route entry; deep-link wins; one-shot per entry"
    - "RecentStateTracker — VIEW-09: pushes every URL change on in-scope routes to cmc.savedView.recent.<route>"
    - "Shared routeNormalize utility — single coercion site for TanStack pathname → backend route id"
  affects:
    - "frontend/src/components/savedviews/SavedViewMenu.tsx — normalizeRouteId moved out + re-exported for backward compat"
    - "frontend/src/components/shell/AppShell.tsx — two new effect-only children inside LoadedViewProvider"
tech_stack:
  added: []
  patterns: [zero-render-effect-component, one-shot-via-useRef, structural-dedupe-via-stableStringify]
key_files:
  created:
    - frontend/src/components/savedviews/DefaultViewLoader.tsx
    - frontend/src/components/savedviews/RecentStateTracker.tsx
    - frontend/src/components/savedviews/routeNormalize.ts
    - frontend/src/components/savedviews/__tests__/DefaultViewLoader.test.tsx
    - frontend/src/components/savedviews/__tests__/RecentStateTracker.test.tsx
  modified:
    - frontend/src/components/shell/AppShell.tsx
    - frontend/src/components/savedviews/SavedViewMenu.tsx
decisions:
  - "normalizeRouteId extracted to routeNormalize.ts — single coercion site shared across Plans 06 (SavedViewMenu), 08 (CommandPalette), 09 (PinnedViewsSection), 10 (DefaultViewLoader + RecentStateTracker). SavedViewMenu still re-exports the symbol so the existing CommandPalette import works without churn."
  - "Plan-version of normalizeRouteId fixes a latent bug in the Plan 06 inline version: `/skills/` (trailing slash, the index route) previously collapsed to `/skills/$name`; the new version only collapses `/skills/<name>` (the detail route) and leaves `/skills/` as-is."
  - "DefaultViewLoader mount order is BEFORE RecentStateTracker inside LoadedViewProvider — auto-apply navigate fires first; the subsequent URL change is then captured by RecentStateTracker. The visit-order matters because of dedupe: the auto-applied state and a manual re-application of the same state must NOT both end up in the recents ring (dedupe is structural, so order alone is sufficient to ensure a single entry)."
  - "Replace:true on the auto-apply (DefaultViewLoader.navigate) — the back-button must skip the auto-step. Push would create a hazardous back-stack: bare URL → URL+filters → next page → back → URL+filters → back → bare URL → back → bare URL (with default reapplying)."
  - "appliedKeyRef short-circuit BOTH apply AND skip paths — when the URL has explicit search keys the effect locks the route id in too, so re-renders during the same route mount do not re-evaluate the meaningfulKeys check (cheap, but the intent is to make the apply-once invariant unambiguous regardless of why the second pass arrived)."
  - "Cap-warning surfacing decision (VIEW-09 user-visible feedback): kept the v1 console.warn from Plan 05 — adding a toast surface (sonner / react-hot-toast) would exceed Phase 25's locked dependency budget (3 frontend deps, all already shipped). Plan 11 can revisit if operator feedback shows the silent cap is a problem."
  - "RecentStateTracker bare-URL filter — only push when at least one non-schemaVersion key is present. Without the filter, every default-render URL (validateSearch injects schemaVersion=1) would be a recents entry, flooding the Cmd+K affordance with semantically-empty rows."
  - "IN_SCOPE_ROUTES is an explicit hard-coded set mirroring Plan 03/04/06's validateSearch routes — keeping it explicit makes adding a route to the saved-views surface a deliberate gate (rather than every new route silently inheriting the recents tracker)."
  - "DefaultViewLoader.test deep-link wins assertion uses a 50ms sleep rather than a negative waitFor — the effect runs synchronously after useSavedView resolves; once the data arrives the effect either skips or applies. A negative waitFor would race the resolution timing."
metrics:
  duration: "~12 min"
  completed_date: "2026-05-12"
  tasks: 3
  files_created: 5
  files_modified: 2
---

# Phase 25 Plan 10: DefaultViewLoader + RecentStateTracker Summary

VIEW-06 default-view auto-load + VIEW-09 recent ad-hoc state tracking shipped as two zero-render effect components mounted inside `LoadedViewProvider` in `AppShell`.

## Outcome

Mounted DefaultViewLoader + RecentStateTracker as `null`-rendering siblings of the shell layout inside LoadedViewProvider in `AppShell.tsx`. Extracted `normalizeRouteId` to its own module (`routeNormalize.ts`) as the single coercion site shared across Plans 06/08/09/10. Added 9 vitest specs (5 for DefaultViewLoader, 4 for RecentStateTracker) — frontend vitest 443 → 452. All gates clean: `pnpm tsc --noEmit` exit 0, `pnpm lint` exit 0, `pnpm build` clean.

## What changed

### DefaultViewLoader (VIEW-06)

Effect-only component (`frontend/src/components/savedviews/DefaultViewLoader.tsx`, +83 LOC). On every render it observes `location.pathname + location.search` via `useRouterState({select})`, normalizes the pathname to a route id, reads `getDefaultViewId(route)` from localStorage, and conditionally fetches the saved view via `useSavedView(defaultId)` (disabled when id is null — no fetch overhead for routes without a default).

Apply logic gated by three conditions:
1. `defaultView` has resolved (non-null).
2. `appliedKeyRef.current !== route` — apply-once invariant within the mount.
3. `meaningfulKeys.length === 0` — every search key except `schemaVersion` is absent. **If any key is present, the deep-link wins** (Pitfall 8 lock) and `appliedKeyRef.current` still locks to short-circuit future re-renders.

When the apply fires: `navigate({to: pathname, search: state_json, replace: true})` followed by `setLoadedView(defaultView)`. The `replace: true` makes the back-button skip the auto-applied entry — a `push` would yield a hazardous back-stack where the bare URL re-applies the default in a loop.

A separate `useEffect` re-arms `appliedKeyRef.current = null` whenever the normalized route id changes — leaving + returning to a route re-applies the default.

### RecentStateTracker (VIEW-09)

Effect-only component (`frontend/src/components/savedviews/RecentStateTracker.tsx`, +65 LOC). Observes the same `location.pathname + location.search` and, on every change, runs:
1. `normalizeRouteId(pathname)` → route id.
2. Skip if route is not in `IN_SCOPE_ROUTES`. The explicit set mirrors the routes with `validateSearch` from Plans 03/04 — adding a new tracked route is a deliberate gate.
3. Skip if the only key in search is `schemaVersion` (bare-URL noise filter).
4. Otherwise `pushRecentState({route, state: search, visitedAt: Date.now()})`.

Structural dedupe and FIFO 50-cap eviction are inherited from `pushRecentState` (Plan 05) — the cap-warning fires via the existing `console.warn`. No toast was added (decision in frontmatter).

### routeNormalize extraction

Pulled `normalizeRouteId` out of `SavedViewMenu.tsx` into `frontend/src/components/savedviews/routeNormalize.ts`. `SavedViewMenu.tsx` retains a `export { normalizeRouteId } from './routeNormalize'` line so the existing import in `CommandPalette.tsx` (`import { normalizeRouteId } from '../savedviews/SavedViewMenu'`) keeps working — no churn-edit required across Plans 08 / 09. The Plan-version of the function also fixes a latent bug: `/skills/` (trailing slash, the index route) is now left as `/skills/`, not collapsed to `/skills/$name`.

### AppShell mount

`AppShell.tsx` adds two imports and inserts `<DefaultViewLoader />` and `<RecentStateTracker />` as the first two children inside the existing `LoadedViewProvider`. Both must live inside `LoadedViewProvider` (DefaultViewLoader calls `setLoadedView`) AND inside the `RouterProvider` that wraps `AppShell` (both use `useNavigate` / `useRouterState`). The shell's docstring updated to record the mount.

### Tests

5 specs in `DefaultViewLoader.test.tsx`:
1. renders null (zero DOM output)
2. applies default on empty search (only schemaVersion) — observed via the LoadedViewObserver + memoryHistory.location.search check
3. deep-link wins: explicit search keys → no apply, no setLoadedView
4. no default set: no fetch, no apply, no setLoadedView
5. one-shot per entry: history length and search payload unchanged after second pass

4 specs in `RecentStateTracker.test.tsx`:
1. out-of-scope route → no pushRecentState call (verified via `/settings`, not in IN_SCOPE_ROUTES)
2. in-scope + non-empty search → exactly one call with `{route, state, visitedAt}` shape
3. in-scope + only schemaVersion → no call (bare-URL filter)
4. dynamic /skills/foo → push uses normalized `/skills/$name`

Tests use the same router-fixture pattern as PinnedViewsSection (Plan 09) — real `createRouter` with memory history, `LoadedViewProvider` wrapper, `setDefaultViewId` for storage seed, fetch spy for `useSavedView`, `vi.mock` of `pushRecentState` so the FIFO ring's localStorage internals stay owned by Plan 05's tests.

## Deviations from Plan

None — plan executed exactly as written. The only meaningful judgment call (whether to extract `normalizeRouteId` to its own file vs. just import from SavedViewMenu) was explicitly directed by the plan, and the additional bug-fix (`/skills/` index-route handling) was also explicitly directed (Plan's inline code intentionally diverges from the previous Plan 06 inline copy).

The plan suggested a check for adding a `sonner` toast for the cap-warning; I confirmed via grep that no toast library is installed, and the v1 console.warn was kept (recorded as a decision in the frontmatter).

## TDD Gate Compliance

Plan frontmatter is `type: execute`, not `type: tdd` — the RED/GREEN/REFACTOR gate sequence does not apply. The 9 new tests were written in Task 3 alongside the AppShell mount (component → tests in same task), which is consistent with the plan's task layout. tsc + lint + build verification was run after every task.

## Where to look first for Plan 11

**Success criterion 1 e2e:** "Save a view, set as default, navigate away, return to a clean URL → see the default applied; then navigate explicitly with `?range=14d` → see the explicit search retained." The Playwright spec lives in Plan 11; the DefaultViewLoader is the production substrate. The `replace: true` invariant means the back-button skips the auto-applied entry — the Playwright case should NOT assert via `page.goBack()` against the bare URL.

**Cmd+K recents extension:** Plan 11 extends `CommandPalette.tsx` to surface `getRecentStates(route)` as a new Command.Group below "Saved Views". The recents ring is populated by RecentStateTracker; Plan 11's e2e exercises the round-trip "filter change → ring entry → Cmd+K row → click → URL restored". `cmc.savedView.recent.<route>` is the canonical localStorage key.

**Known interaction with deep-link tests:** The default-view auto-apply happens as a `replace: true` navigation. Playwright's `expect(page).toHaveURL(...)` will see the auto-applied URL; tests that assert on the bare URL would have to skip past the apply (e.g. by visiting `/cost?range=30d` directly so deep-link wins).

## Verification commands

```bash
cd frontend && pnpm tsc --noEmit                    # exit 0
cd frontend && pnpm test --run                       # 88 files / 452 specs / 0 failed
cd frontend && pnpm lint                             # exit 0
cd frontend && pnpm build                            # built in <1s, no warnings
```

## Commits

- `d835890` feat(25-10): add DefaultViewLoader + extract normalizeRouteId
- `8c6cbd9` feat(25-10): add RecentStateTracker effect component
- `daf1474` feat(25-10): mount DefaultViewLoader + RecentStateTracker in AppShell + 9 vitest specs

## Self-Check: PASSED
- frontend/src/components/savedviews/DefaultViewLoader.tsx → FOUND
- frontend/src/components/savedviews/RecentStateTracker.tsx → FOUND
- frontend/src/components/savedviews/routeNormalize.ts → FOUND
- frontend/src/components/savedviews/__tests__/DefaultViewLoader.test.tsx → FOUND
- frontend/src/components/savedviews/__tests__/RecentStateTracker.test.tsx → FOUND
- frontend/src/components/shell/AppShell.tsx (modified) → FOUND
- frontend/src/components/savedviews/SavedViewMenu.tsx (modified) → FOUND
- Commit d835890 → FOUND
- Commit 8c6cbd9 → FOUND
- Commit daf1474 → FOUND
