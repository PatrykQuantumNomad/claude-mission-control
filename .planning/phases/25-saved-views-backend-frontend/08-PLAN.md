---
phase: 25-saved-views-backend-frontend
plan: 08
type: execute
wave: 5
depends_on: ["05", "06"]
files_modified:
  - frontend/src/components/ui/CommandPalette.tsx
  - frontend/src/components/ui/__tests__/CommandPalette.savedViews.test.tsx
  - docs/testid-registry.md
autonomous: true

must_haves:
  truths:
    - "Cmd+K shows a new 'Saved Views' Command.Group listing every saved view across routes"
    - "Current-route's views appear first in the group; other routes' views appear after"
    - "Selecting a view navigates to its route + applies its state_json as search; sets it as loaded view"
    - "Empty state ('No saved views yet') renders gracefully when useSavedViews returns []"
  artifacts:
    - path: "frontend/src/components/ui/CommandPalette.tsx"
      provides: "New Command.Group heading='Saved Views' rendered between existing Pages/Actions groups"
      contains: "Saved Views"
    - path: "frontend/src/components/ui/__tests__/CommandPalette.savedViews.test.tsx"
      provides: "vitest covering current-route-first ordering + selection navigation"
      contains: "CommandPalette"
  key_links:
    - from: "frontend/src/components/ui/CommandPalette.tsx"
      to: "frontend/src/lib/queries.ts (useSavedViews)"
      via: "hook call with no route filter (cross-route)"
      pattern: "useSavedViews"
    - from: "frontend/src/components/ui/CommandPalette.tsx"
      to: "frontend/src/components/savedviews/LoadedViewContext.tsx"
      via: "useLoadedView setter on selection"
      pattern: "useLoadedView|setLoadedView"
---

<objective>
Ship CMDK-01: a "Saved Views" group inside the Cmd+K palette. Lists every saved view across every route, with the current-route's views surfaced first. Selecting a view both navigates to its route AND sets it as the loaded view (so the menu trigger label + pip + EditOrForkDialog all wire correctly).

Purpose: A second access path to saved views (in addition to SavedViewMenu in the header). Useful when the user is on a different route and wants to jump.
Output: New `Command.Group heading="Saved Views"` in `CommandPalette.tsx`. Existing groups ("Pages", "Actions") are unchanged. Sorting: current-route views first, then other routes.
</objective>

<execution_context>
@/Users/patrykattc/.claude/get-shit-done/workflows/execute-plan.md
@/Users/patrykattc/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/25-saved-views-backend-frontend/25-RESEARCH.md
@.planning/phases/25-saved-views-backend-frontend/25-05-SUMMARY.md
@.planning/phases/25-saved-views-backend-frontend/25-06-SUMMARY.md

# Reference Command.Group patterns
@frontend/src/components/ui/CommandPalette.tsx
@frontend/src/components/savedviews/LoadedViewContext.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend CommandPalette with Saved Views group</name>
  <files>frontend/src/components/ui/CommandPalette.tsx, docs/testid-registry.md</files>
  <action>
Read `frontend/src/components/ui/CommandPalette.tsx` first — particularly the existing `<Command.Group heading="Pages">` block (around line 241-269 per research). Match its exact shape for consistency.

Add a new `<Command.Group heading="Saved Views">` between Pages and Actions (or wherever the existing ordering convention places it). Inside, render items sorted by `currentRoute === view.route ? 0 : 1`.

```typescript
import { useSavedViews } from '../../lib/queries'
import { useLoadedView } from '../savedviews/LoadedViewContext'

// inside CommandPalette component:
const { data: savedViewsData } = useSavedViews()  // no route filter — get all
const { setLoadedView } = useLoadedView()
const currentRoute = normalizeRouteId(location.pathname)  // reuse Plan 06's helper or duplicate inline

const sortedViews = useMemo(() => {
  if (!savedViewsData) return []
  return [...savedViewsData.items].sort((a, b) => {
    const aIsCurrent = a.route === currentRoute ? 0 : 1
    const bIsCurrent = b.route === currentRoute ? 0 : 1
    if (aIsCurrent !== bIsCurrent) return aIsCurrent - bIsCurrent
    return a.name.localeCompare(b.name)  // stable secondary sort
  })
}, [savedViewsData, currentRoute])

// JSX:
<Command.Group heading="Saved Views" className="cmc-cmdk__group">
  {sortedViews.length === 0 && (
    <div className="cmc-cmdk__empty" data-testid="cmdk-saved-views-empty">
      No saved views yet
    </div>
  )}
  {sortedViews.map((v) => (
    <Command.Item
      key={v.id}
      value={`saved-view-${v.id} ${v.name} ${v.route}`}  // searchable string includes both name + route
      className="cmc-cmdk__item"
      data-testid={`cmdk-saved-view-${v.id}`}
      onSelect={() => {
        navigate({
          to: routePathFromId(v.route),  // see note below
          search: v.state_json as Record<string, unknown>,
        })
        setLoadedView(v)
        close()  // existing close() helper from CommandPalette
      }}
    >
      <span className="cmc-cmdk__item-name">{v.name}</span>
      <span className="cmc-cmdk__item-meta">{v.route}</span>
    </Command.Item>
  ))}
</Command.Group>
```

Notes on `routePathFromId`:
- Plan 06 chose to store route IDs like `/skills/$name` (TanStack route ID format) in the backend `route` column. TanStack `navigate({ to: '/skills/$name' })` requires a `params` object to resolve dynamic segments.
- For Phase 25, the saved view's `state_json` is the search params only — it does NOT contain the resolved skill name. Therefore a saved view for `/skills/$name` cannot be navigated to without ALSO knowing the param value.
- DECISION FOR THIS PLAN: if the route id contains `$`, the saved-view is "current-route-only-meaningful" — when selecting from CommandPalette and the current pathname doesn't match the route's base prefix, surface a soft warning (toast or inline message) and DO NOT navigate. When the current pathname IS on the right route (e.g. user is on `/skills/foo` and selects a `/skills/$name` view), navigate using the current pathname (preserve the param).
- Implementation:

```typescript
function routePathFromId(routeId: string, currentPathname: string): string | null {
  // Static routes
  if (!routeId.includes('$')) return routeId
  // Dynamic-segment routes: only navigable when the current pathname is on the same base prefix
  // e.g. routeId '/skills/$name', currentPathname '/skills/foo' → return '/skills/foo'
  const base = routeId.split('/$')[0]  // '/skills'
  if (currentPathname.startsWith(base + '/')) return currentPathname
  return null  // not navigable from current route
}

// In onSelect:
const target = routePathFromId(v.route, location.pathname)
if (target === null) {
  console.warn(`[CommandPalette] Saved view "${v.name}" requires a specific entity (e.g. a skill name) — navigate to /skills/<name> first.`)
  return
}
navigate({ to: target, search: v.state_json as Record<string, unknown> })
setLoadedView(v)
close()
```

This is a v1 limitation — Phase 26+ can store the resolved param alongside `state_json` (additive `params` field on SavedView) if it becomes a UX pain point. Document in SUMMARY.

Register new testids in `docs/testid-registry.md`:
- `cmdk-saved-views-empty` — exact match
- `cmdk-saved-view-{id}` — dynamic pattern

IMPORTANT:
- The new group is OPTIONAL to render when `savedViewsData.items.length === 0` — match how the existing groups handle empty.
- The `value` prop on `Command.Item` is what cmdk searches against — including both `name` and `route` lets the user type either to find a view.
- `setLoadedView(v)` is critical — it ensures the chrome (SavedViewMenu trigger label + UnsavedPip) updates after the navigation.
- DO NOT touch the existing Pages or Actions groups in CommandPalette.
  </action>
  <verify>
`pnpm tsc --noEmit` clean. `pnpm lint` clean. Manual smoke with a seeded saved view on `/cost`:
- Open Cmd+K from `/cost` — see "Saved Views" group with the seeded view first.
- Open Cmd+K from `/skills/<name>` — same view appears (but lower in the list since it's not the current route).
- Type the view's name — it filters.
- Select it — navigates to `/cost` with the view's filters applied.
  </verify>
  <done>
"Saved Views" group renders in Cmd+K; current-route-first ordering; selection navigates + sets loaded view; testids registered.
  </done>
</task>

<task type="auto">
  <name>Task 2: Vitest coverage for CommandPalette Saved Views group</name>
  <files>frontend/src/components/ui/__tests__/CommandPalette.savedViews.test.tsx</files>
  <action>
Create `frontend/src/components/ui/__tests__/CommandPalette.savedViews.test.tsx`. Mock `useSavedViews` + `useLoadedView` + `useNavigate` + `useRouterState`.

Required cases (≥4):
- Renders empty state when `useSavedViews().data.items === []`.
- Renders views sorted with current-route first.
- Selecting a static-route view (e.g. `/cost`) calls `navigate({ to: '/cost', search: v.state_json })` AND `setLoadedView(v)` AND `close()`.
- Selecting a dynamic-segment view (`/skills/$name`) from `/cost` does NOT navigate (the routePathFromId returns null).
- Selecting a dynamic-segment view from `/skills/foo` navigates to `/skills/foo` with the view's state_json.

Use the existing CommandPalette test pattern — read any existing spec in `frontend/src/components/ui/__tests__/` to match the mocking convention. cmdk's `Command.Group` filtering happens internally; the test asserts the items render in the right order, not the filtering itself.

If the existing `CommandPalette.tsx` doesn't have a directly-testable export (it may be wrapped in an open-state context), the test may need to bypass the chrome and test a smaller extracted helper. If so, refactor: extract `useSortedSavedViews(currentRoute)` and `routePathFromId` into a sibling utility module + test those purely. Note this in the SUMMARY.

IMPORTANT:
- These tests cover CMDK-01's correctness. They are the regression net for the current-route-first ordering and the dynamic-route navigation guard.
- happy-dom may not fully simulate cmdk's keyboard handling; e2e coverage lands in Plan 11.
  </action>
  <verify>
`pnpm test --run src/components/ui/__tests__/CommandPalette.savedViews.test.tsx` — all 4+ cases pass.
  </verify>
  <done>
~4 new vitest cases passing; covers ordering, empty state, navigation, dynamic-route guard.
  </done>
</task>

</tasks>

<verification>
1. `cd frontend && pnpm tsc --noEmit` clean.
2. `cd frontend && pnpm test --run` — full vitest green; count up by ~4.
3. `cd frontend && pnpm lint` clean.
4. `cd frontend && pnpm build` succeeds.
5. Manual: Cmd+K from `/cost` shows Saved Views group with current-route's views first; selection navigates correctly; pip + menu trigger update.
</verification>

<success_criteria>
- CMDK-01 satisfied: Cmd+K Saved Views group renders, sorts current-route first, navigates on select.
- Dynamic-route saved views (e.g. `/skills/$name`) handled gracefully (navigate-when-on-route; skip + warn otherwise) — v1 limitation documented in SUMMARY.
- Plan 11 e2e can extend `command-palette.spec.ts` with the Cmd+K → Saved-View flow.
</success_criteria>

<output>
After completion, create `.planning/phases/25-saved-views-backend-frontend/25-08-SUMMARY.md` documenting:
- Final sort algorithm (current-route first, then name alphabetical)
- Dynamic-route handling decision (skip vs navigate-with-current-pathname)
- vitest count delta
- Future-Phase note: if dynamic-route navigation is painful, Phase 26+ adds a `params` field on SavedView
</output>
