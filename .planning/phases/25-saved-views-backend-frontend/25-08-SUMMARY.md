---
phase: 25-saved-views-backend-frontend
plan: 08
subsystem: frontend-cmdk
tags: [frontend, react, cmdk, saved-views, command-palette, vitest, cmdk-01]
requires:
  - "25-05 (frontend data layer — useSavedViews hook + SavedView type)"
  - "25-06 (LoadedViewContext — useLoadedView setter, normalizeRouteId export from SavedViewMenu)"
provides:
  - "CommandPalette 'Saved Views' Command.Group — cross-route list of every saved view, surfaced inside Cmd+K"
  - "Sort: current-route's views first, then other routes; alpha secondary sort by name"
  - "Selection contract: navigate to view's route + state_json AS search params, then setLoadedView(v), then close palette"
  - "Dynamic-route navigability guard: routes containing $ (e.g. /skills/$name) only navigable when current pathname is on the matching base prefix; else soft console.warn + no-op exit"
  - "2 new testids in docs/testid-registry.md: cmdk-saved-views-empty (exact), cmdk-saved-view-{id} (pattern)"
  - "2 exported pure helpers (routePathFromId, sortSavedViewsForPalette) — reusable in Plan 09 (Sidebar Pinned) if cross-route sort is needed there too"
  - "CMDK-01 satisfied — second access path to saved views (Cmd+K) in addition to SavedViewMenu in the header"
affects:
  - "Plan 09 (Sidebar Pinned section) — can import sortSavedViewsForPalette if it adopts the same ordering convention"
  - "Plan 11 (close-gate Playwright + axe sweep) — demo flow is 'seed saved view → Cmd+K from another route → select it → assert URL flips'"
tech-stack:
  added: []
  patterns:
    - "Cross-route useSavedViews() invocation (no route filter) — returns the entire saved-views list across every route. The cache key (qk.savedViews()) is distinct from the route-filtered slice; both can coexist."
    - "Pure-function helpers exported from CommandPalette.tsx (routePathFromId, sortSavedViewsForPalette) — testable without rendering React. Same pattern as Plan 06's normalizeRouteId export from SavedViewMenu."
    - "Dynamic-route base-prefix matching — `/skills/$name` → base `/skills`; navigable only when currentPathname startsWith base + '/' (the trailing slash matters — bare '/skills' is NOT a detail route)."
    - "Selection side-effect bundle: navigate + setLoadedView + close — same trio as SavedViewMenu's handleOpen (Plan 06). Both surfaces feed the same chrome consumer state."
key-files:
  created:
    - "frontend/src/components/ui/__tests__/CommandPalette.savedViews.test.tsx (~410 lines, 11 specs)"
  modified:
    - "frontend/src/components/ui/CommandPalette.tsx (+101 / -1 lines — Saved Views group + routePathFromId + sortSavedViewsForPalette + onSavedViewSelect + header comments)"
    - "frontend/src/components/ui/__tests__/CommandPalette.test.tsx (+8 / -0 lines — wrap in LoadedViewProvider, Rule 3 fix)"
    - "docs/testid-registry.md (+2 lines — cmdk-saved-views-empty exact + cmdk-saved-view-{id} pattern)"
decisions:
  - "Sort algorithm is current-route first, then alphabetical by name. The plan suggested name-alpha as the secondary sort; we kept that. updated_at-DESC was considered briefly but rejected — alpha is stable across renders and user-predictable. If Plan 09 (Sidebar Pinned) wants 'recently used first', that's an additive layer the sort helper does NOT preclude (caller can sort by updated_at first then pass to sortSavedViewsForPalette)."
  - "Dynamic-route handling: ROUTES CONTAINING `$` ARE NAVIGABLE ONLY WHEN THE CURRENT PATHNAME IS ON THE MATCHING BASE PREFIX. This is the v1 limitation called out in the plan. The alternative (storing the resolved param in state_json or adding a `params` field on SavedView) is a Phase 26+ additive change. Rationale for v1 deferral: (a) the only dynamic route in v1.3 is /skills/$name; (b) the failure mode is benign — user gets a soft warn + the palette closes, no broken navigation; (c) adding `params` to the backend SavedView model touches Plan 02 (Pydantic + Alembic) and Plan 04 (router + tests) — out of scope for a frontend-only plan."
  - "Routes with bare base (e.g. /skills with no /$name child) are NOT navigable as a /skills/$name view (routePathFromId returns null). The trailing-slash check `currentPathname.startsWith(base + '/')` enforces this. Test: routePathFromId('/skills/$name', '/skills') → null."
  - "Selection branch ALSO closes the palette in the soft-warn path. Rationale: the user explicitly clicked an item; leaving the palette open after a no-op would feel broken. The console.warn is the only feedback channel in v1; Plan 11 e2e can extend with a toast if the UX team wants louder feedback."
  - "Existing CommandPalette tests needed LoadedViewProvider wrapping (Rule 3 — auto-fix blocking issue). The CommandPalette now consumes useLoadedView, which throws when no provider is mounted. Production wiring at AppShell already provides it; the test wrapper had to be updated to match. 14 existing tests revalidated post-change."
  - "Helpers (routePathFromId, sortSavedViewsForPalette) are EXPORTED from CommandPalette.tsx, not extracted to a sibling utility module. Rationale: they are CMDK-01-specific and live conceptually with the palette. Future plans that need cross-route view sorting can either re-export from a sibling module or copy the 6-line helper — the cost of a fresh utility module is higher than the duplication risk at this size."
  - "Helper EXPORTS are intentional — the testid `cmdk-saved-views-empty` data-testid value also satisfies the ESLint testid-registry-only rule via the exact-match list entry. Both helper exports and the testid entries are append-only additions; no existing surface was modified."
metrics:
  duration: "~7 min (2 atomic commits + SUMMARY; auto-fix LoadedViewProvider wiring counted toward Task 1)"
  completed: "2026-05-12"
  vitest: "425 → 436 (+11; target was ≥4 covering ordering, navigation, empty state, dynamic-route guard)"
  tasks: 2
  files_created: 1
  files_modified: 3
---

# Phase 25 Plan 08: CommandPalette Saved Views Group (CMDK-01) Summary

**One-liner:** Shipped a new `Saved Views` Command.Group inside Cmd+K, cross-route, sorted current-route-first, with a dynamic-segment navigability guard. Selecting a view both navigates to its route+search and writes the loaded-view slot so the SavedViewMenu trigger label, UnsavedPip, and EditOrForkDialog all wire correctly. CMDK-01 closed.

## Performance

- **Duration:** ~7 min (2 atomic commits + SUMMARY)
- **Completed:** 2026-05-12
- **Tasks:** 2 (both auto, no checkpoints)
- **Files created:** 1
- **Files modified:** 3 (`CommandPalette.tsx`, `CommandPalette.test.tsx`, `testid-registry.md`)
- **Vitest:** 425 → 436 (+11)
- **TypeScript:** clean
- **ESLint (incl. testid-registry-only):** exit 0
- **Build:** clean

## Sort Algorithm (canonical)

```
sortSavedViewsForPalette(items, currentRoute) =
  items
    |> partition (v.route === currentRoute) into [current, other]
    |> sort each band by v.name.localeCompare(...)
    |> concat: current ++ other
```

Pure-function helper exported from `CommandPalette.tsx` and unit-tested at the bottom of `CommandPalette.savedViews.test.tsx`. Does not mutate the input.

## Dynamic-Route Navigability Guard

`routePathFromId(routeId, currentPathname)` resolves a saved view's stored route id into a navigable pathname:

| `routeId`         | `currentPathname` | Result          | Behaviour                             |
| ----------------- | ----------------- | --------------- | ------------------------------------- |
| `/cost`           | any               | `/cost`         | Navigate verbatim (static route).     |
| `/sessions/compare` | `/`             | `/sessions/compare` | Navigate verbatim.                 |
| `/skills/$name`   | `/skills/foo`     | `/skills/foo`   | Navigate preserving the dynamic param. |
| `/skills/$name`   | `/skills/bar-baz` | `/skills/bar-baz` | Navigate preserving the dynamic param. |
| `/skills/$name`   | `/cost`           | `null`          | NO-OP + `console.warn`.               |
| `/skills/$name`   | `/`               | `null`          | NO-OP + `console.warn`.               |
| `/skills/$name`   | `/skills`         | `null`          | NO-OP + `console.warn` (base-list is NOT detail). |

**v1 limitation:** A saved view created on `/skills/foo` and selected from `/cost` does NOT navigate. The user must first navigate to any `/skills/<name>` page, then the palette will resolve the view against the current `<name>`.

**Failure mode is benign:**

- `console.warn` fires once with a directive: `Saved view "Skill detail view" requires a specific entity (route /skills/$name) — navigate to /skills/<id> first.`
- The palette closes (Cmd+K state collapses).
- No router state changes. No loaded-view slot mutation.

## Future Improvement (Phase 26+ if needed)

If the v1 dynamic-route limitation becomes a UX pain, the additive fix is:

1. Add a `params` field (`Mapping[str, str]`) to the backend `SavedView` model (Plan 02 Pydantic + Plan 03 Alembic migration `ALTER TABLE saved_views ADD COLUMN params_json TEXT NOT NULL DEFAULT '{}'`).
2. Extend `SavedViewCreate` + `SavedViewUpdate` Pydantic schemas (additive).
3. Frontend writes `params` when saving on `/skills/foo` (e.g. `{ name: 'foo' }`).
4. Frontend `routePathFromId` reads `params` to interpolate `/skills/$name` → `/skills/foo` regardless of currentPathname.

The decision NOT to do this in v1.3 is deliberate — frontend-only plans should not require backend schema changes. The current frontend-only fallback (navigate-when-on-route) is the cheapest safe behaviour.

## Selection Side-Effect Bundle

Each click on a saved-view `Command.Item`:

| Phase             | Action                                                       |
| ----------------- | ------------------------------------------------------------ |
| 1. Resolve target | `routePathFromId(v.route, location.pathname)` → pathname OR null. |
| 2. Guard          | If null → `console.warn` + `close()` and return.            |
| 3. Navigate       | `navigate({ to: target, search: v.state_json })`            |
| 4. Loaded slot    | `setLoadedView(v)` — wires SavedViewMenu trigger label + UnsavedPip + EditOrForkDialog. |
| 5. Close          | `close()` — palette state collapses.                         |

Mirrors `SavedViewMenu.handleOpen` (Plan 06) — both surfaces are equivalent access paths to the same `loadedView` slot.

## Empty State

When `useSavedViews().data.items.length === 0`:

```jsx
<div className="cmc-cmdk__empty" data-testid="cmdk-saved-views-empty">
  No saved views yet
</div>
```

Rendered inside the `Saved Views` group instead of any `Command.Item`. The group heading itself remains visible (gives the user context that the surface exists; mirrors how the empty `Actions` group might look in v0).

## Test Inventory (+11 specs)

**Component specs (5):** `CommandPalette.savedViews.test.tsx` describe `CommandPalette — Saved Views group (CMDK-01)`:

1. `renders the empty state when no saved views exist` — seeds `qk.savedViews()` with `{items:[],total:0}`; asserts `cmdk-saved-views-empty` text.
2. `sorts current-route views first, then other routes (alpha secondary)` — 3 views (2 `/cost` + 1 `/skills/$name`) on `/cost`; asserts document-position ordering.
3. `selecting a static-route view navigates + setLoadedView + closes palette` — `/cost` view selected from `/`; asserts router pathname + search + loaded-view slot + palette closed.
4. `selecting a dynamic-route view from an unrelated path is a no-op + console.warn` — `/skills/$name` view selected from `/cost`; asserts pathname unchanged, loadedView null, warnSpy called with our message (Radix's "DialogContent requires DialogTitle" warn is filtered out by message match — preexisting Radix a11y nag, not our concern).
5. `selecting a dynamic-route view from /skills/foo navigates + setLoadedView` — `/skills/$name` view selected from `/skills/foo`; asserts pathname stays `/skills/foo`, search has view's state_json, loaded-view slot set.

**Pure helper specs (6):** `routePathFromId` (3) + `sortSavedViewsForPalette` (3) — fast unit tests without React rendering.

## Deviations from Plan

**1. [Rule 3 - Blocking issue] Wrapped existing CommandPalette tests in LoadedViewProvider**

- **Found during:** Task 1 verification (`pnpm test --run src/components/ui/__tests__/CommandPalette.test.tsx`).
- **Issue:** `CommandPalette` now consumes `useLoadedView()` for the new Saved Views group. The pre-existing `CommandPalette.test.tsx` did NOT mount `LoadedViewProvider`, so all 14 existing specs threw `useLoadedView must be used within LoadedViewProvider`.
- **Fix:** Added `import { LoadedViewProvider } from '../../savedviews/LoadedViewContext'` and wrapped the test wrapper's tree with it (between `ActiveSessionProvider` and `TaskComposerProvider`). Mirrors the production mount site at `shell/AppShell.tsx`.
- **Files modified:** `frontend/src/components/ui/__tests__/CommandPalette.test.tsx` (+8 lines).
- **Commit:** `0e2ea91` (bundled into Task 1 — the test wrapper update is part of "make CommandPalette use useLoadedView").

**2. [Rule 1 - Bug] Filtered console.warn assertion by message rather than total call count**

- **Found during:** Task 2 first vitest run.
- **Issue:** Spec 4 (dynamic-route no-op) initially asserted `expect(warnSpy).toHaveBeenCalledTimes(1)`. happy-dom's Radix Dialog primitive emits a separate a11y warning ("DialogContent requires a DialogTitle for the component to be accessible") that fires when cmdk's `Command.Dialog` mounts. That brought the total to 2 warnings, failing the equality assertion.
- **Fix:** Replaced the count assertion with a filter-by-message check using `warnSpy.mock.calls.find(...)` against `/requires a specific entity/i`. This pins OUR warning fires without false-failing on the preexisting Radix a11y nag.
- **Rationale for not fixing Radix's warn:** The DialogTitle warn is a global Radix-flavour-of-cmdk a11y issue (every cmdk Dialog in the app surfaces it under happy-dom — search the codebase for a fix being out of scope for this plan). Out-of-scope per execute-plan.md's SCOPE BOUNDARY rule.
- **Files modified:** `frontend/src/components/ui/__tests__/CommandPalette.savedViews.test.tsx` (5-line replacement).
- **Commit:** `e8049d7` (bundled into Task 2).

**No architectural changes (Rule 4).** No checkpoints. No auth gates.

## Known Stubs

None. Every JSX path wired to real data — `useSavedViews()` resolves from the saved-views cache (production query goes to `/api/views` — Plans 02-04 backend). The empty-state surface IS the empty-data path; it's not a placeholder for unimplemented work.

## Self-Check: PASSED

**Files created exist:**

- `frontend/src/components/ui/__tests__/CommandPalette.savedViews.test.tsx` — FOUND.
- `.planning/phases/25-saved-views-backend-frontend/25-08-SUMMARY.md` — FOUND (this file).

**Commits exist:**

- `0e2ea91` (Task 1: feat(25-08): add Saved Views group to CommandPalette) — FOUND.
- `e8049d7` (Task 2: test(25-08): vitest coverage for CommandPalette Saved Views group) — FOUND.

**Verification gates:**

- `pnpm tsc --noEmit` — clean (exit 0).
- `pnpm lint` — clean (exit 0; testid-registry-only PASSES — `cmdk-saved-views-empty` + `cmdk-saved-view-{id}` both registered).
- `pnpm test --run` — 425 → 436 / 0 / 0 (+11 specs).
- `pnpm build` — clean.
