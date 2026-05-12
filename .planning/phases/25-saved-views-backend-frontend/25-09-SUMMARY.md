---
phase: 25-saved-views-backend-frontend
plan: 09
subsystem: ui
tags: [react, tanstack-router, react-query, saved-views, sidebar, localStorage]

# Dependency graph
requires:
  - phase: 25-05
    provides: useSavedViews() cross-route React Query hook + getPinnedIds() / setPinnedIds() / pinView() / unpinView() localStorage helpers
  - phase: 25-06
    provides: LoadedViewContext + useLoadedView() + LoadedViewProvider mounted in AppShell
  - phase: 25-08
    provides: routePathFromId() helper (static-vs-dynamic-route navigability) reused from CommandPalette
  - phase: 24
    provides: SidebarSection + Sidebar IA (Home / Observe / Operate / Configure) + collapsed-mode CSS via data-sidebar-collapsed
provides:
  - PinnedViewsSection component (cross-route Sidebar Pinned section, SHEL-06)
  - isPinnedViewActive() pure helper (Pitfall 9 active-state algorithm)
  - SidebarSection.testId prop (additive, backwards-compatible)
  - .cmc-sidebar__pinned-empty CSS rule with collapsed-mode hide
  - 3 new testids: sidebar-section-pinned, sidebar-pinned-empty, sidebar-pinned-view-{id}
affects: [25-10, 25-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sidebar IA addition pattern: locked 4 original sections + new section slotted between Operate and Configure (operational stuff -> pinned items -> settings)"
    - "Re-use Plan 08 routePathFromId helper for static-vs-dynamic-route navigability rather than duplicating the helper inline"
    - "Defensive Array.isArray guard on useSavedViews response so a malformed catch-all in tests / a server bug doesn't crash the entire app shell"

key-files:
  created:
    - frontend/src/components/savedviews/PinnedViewsSection.tsx
    - frontend/src/components/savedviews/__tests__/PinnedViewsSection.test.tsx
  modified:
    - frontend/src/components/shell/Sidebar.tsx
    - frontend/src/components/shell/SidebarSection.tsx
    - frontend/src/components/shell/__tests__/Sidebar.test.tsx
    - frontend/src/__tests__/integration.test.tsx
    - frontend/src/styles.css
    - docs/testid-registry.md

key-decisions:
  - "Re-used routePathFromId from CommandPalette (Plan 08) rather than duplicating inline — single coercion site for the static-vs-dynamic-route navigability decision"
  - "Active-state requires BOTH pathname AND structural search-state match (Pitfall 9 lock); exposed as isPinnedViewActive pure helper for vitest coverage"
  - "SidebarSection grew an optional `testId` prop (additive); the 4 original Phase 24 sections leave it undefined and are still addressed via per-link testids"
  - "PinnedViewsSection uses a <button> rather than a TanStack <Link> because navigation requires applying state_json via navigate({search:...}); the existing .cmc-sidebar__navlink-label collapsed-mode rule is element-agnostic so the button row inherits collapsed-mode for free"
  - "Defensive Array.isArray guard in PinnedViewsSection on the useSavedViews response — surfaced by the integration.test.tsx catch-all fetch returning {} for /api/views before the test mock was updated"
  - "schemaVersion is excluded from the structural compare (matches UnsavedPip Plan 06 convention) so forward-compat upgrades don't false-negative the active-state"

patterns-established:
  - "Sidebar IA addition: new section slotted between Operate and Configure; the 4 original Phase 24 sections (Home / Observe / Operate / Configure) remain locked in their positions"
  - "Cross-route Sidebar consumer pattern: useSavedViews() with no route filter + intersect with localStorage-backed pinned ids — same shape Plan 10's DefaultViewLoader will use for per-route default pointers"

# Metrics
duration: ~9min
completed: 2026-05-12
---

# Phase 25 Plan 09: Sidebar Pinned Views Section Summary

**Cross-route Sidebar Pinned section (SHEL-06) — sidebar IA grows to 5 sections; pinned saved views surface as clickable rows with Pitfall-9 pathname-AND-search active-state; clicks navigate + apply state_json + setLoadedView; collapsed mode inherits existing label-hide CSS for free.**

## Performance

- **Duration:** ~9 minutes
- **Started:** 2026-05-12T15:30:26Z
- **Completed:** 2026-05-12T15:40:07Z
- **Tasks:** 3 (all `type="auto"`, no checkpoints)
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments

- **Sidebar IA grew from 4 → 5 sections** — Home / Observe / Operate / **Pinned (NEW)** / Configure. The Pinned section header is ALWAYS visible (mirrors the Phase 24 Configure empty-body precedent); the body lists views whose ids are in `getPinnedIds()`, intersected with the cross-route useSavedViews() catalog.
- **Active-state algorithm locked per Pitfall 9** — a row accents (border-left 3px + tinted background via `cmc-sidebar__navlink--active`) ONLY when BOTH the pathname-prefix matches the view's route AND the structural compare of `state_json` vs URL search params is equal (ignoring `schemaVersion`). Exposed as `isPinnedViewActive` pure helper for direct vitest coverage.
- **Click navigation reuses Plan 08's `routePathFromId`** — static-route pinned views navigate verbatim + apply `state_json` + call `setLoadedView`. Dynamic-segment views (e.g. `/skills/$name`) navigate ONLY when the user is already on a matching base prefix; otherwise the click soft-warns and exits (same V1 limitation locked in Plan 08).
- **Collapsed sidebar mode handled with zero new CSS for the rows** — the existing `[data-sidebar-collapsed="true"] .cmc-sidebar__navlink-label { display: none }` rule is element-agnostic (targets the class, not anchor-vs-button), so the new `<button>` row inherits the label-hide automatically. Empty-state copy gets its own collapsed-mode hide.
- **7 vitest specs added** — 6 component specs (empty-state, filter-by-pin-ids, active-on-match, inactive-on-search-divergence, click-static-navigates+setLoadedView, click-dynamic-no-op+warn) + 1 pure-helper spec exercising `isPinnedViewActive` across 6 scenarios.
- **Baseline 436 → 443 vitest tests** (+7 new specs; 0 previously-passing tests regressed). 2 Rule-3 fixes brought the existing Sidebar.test.tsx + integration.test.tsx harnesses up to date.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create PinnedViewsSection component** — `a86e4f9` (feat)
2. **Task 2: Mount PinnedViewsSection in Sidebar between Operate and Configure** — `3351ceb` (feat)
3. **Task 3: Vitest coverage for PinnedViewsSection (7 specs)** — `e569c02` (test)

**Plan metadata:** Will be committed alongside STATE.md / ROADMAP.md / REQUIREMENTS.md updates.

## Files Created/Modified

**Created:**

- `frontend/src/components/savedviews/PinnedViewsSection.tsx` (181 lines) — the SHEL-06 component. Cross-route `useSavedViews()` + `getPinnedIds()` intersection; click handler routes through Plan 08's `routePathFromId` for the static-vs-dynamic-route navigability decision; exports `isPinnedViewActive` pure helper.
- `frontend/src/components/savedviews/__tests__/PinnedViewsSection.test.tsx` (349 lines) — 7 specs using the real-router + QueryClient + fetch-stub pattern (matches Plan 06/07/08 + SavedViewMenu.test.tsx).

**Modified:**

- `frontend/src/components/shell/Sidebar.tsx` — import + mount `<PinnedViewsSection />` between `<SidebarSection title="Operate">…</SidebarSection>` and `<SidebarSection title="Configure" />`. Updated file-header comment to document the 5-section IA. The 4 original Phase 24 sections + brand + chrome are unchanged.
- `frontend/src/components/shell/SidebarSection.tsx` — additive `testId?: string` prop forwarded to the section's root element. Backwards-compatible: the 4 existing call sites omit it.
- `frontend/src/components/shell/__tests__/Sidebar.test.tsx` — Rule-3 fix: wrap `RouterProvider` in `QueryClientProvider` + `LoadedViewProvider`, install a `fetch` spy for `/api/views`, clear `cmc.savedView.pinned` per-test. 5 existing specs all pass without behavioral change.
- `frontend/src/__tests__/integration.test.tsx` — Rule-3 fix: fetch mock catch-all gains an `/api/views` handler returning `{items:[],total:0}` so the new useSavedViews() call doesn't fall into the catch-all `{}` and crash the section's `.items.map(...)` (the defensive Array.isArray guard below covers the same case in production code).
- `frontend/src/styles.css` — `.cmc-sidebar__pinned-empty` rule (dim, muted, label-sized text) + `[data-sidebar-collapsed="true"]` hide; ~10 lines appended.
- `docs/testid-registry.md` — registered `sidebar-section-pinned` (exact), `sidebar-pinned-empty` (exact), `sidebar-pinned-view-{id}` (pattern).

## Decisions Made

- **Re-use `routePathFromId` from Plan 08** rather than duplicating the static-vs-dynamic-route navigability decision inline. The plan said "extract to shared util if convenient, but inline is acceptable for v1" — re-using the existing export is cleaner: single coercion site, one truth, and any future fix to the dynamic-route navigability rule auto-propagates.
- **`SidebarSection.testId` is an optional additive prop** (vs an inner wrapper div for the testid). Cleaner: the testid is on the actual section element rather than nested inside the body. The 4 original sections omit the prop and are still addressed via per-link testids.
- **PinnedViewsSection uses `<button>` not `<Link>`** because navigation requires `navigate({to, search: v.state_json})` — applying the view's state_json is the whole point. TanStack `<Link>` doesn't compose well with that pattern. The existing `.cmc-sidebar__navlink-label` collapsed-mode CSS is element-agnostic so the button row inherits collapsed-mode for free (no new CSS needed for the rows).
- **schemaVersion excluded from the structural compare** — same convention as UnsavedPip's `stableStringify` (Plan 06). Forward-compat: a schemaVersion bump on the view alone doesn't false-negative the active-state.
- **Active-state surfaces both class AND data attribute** — `cmc-sidebar__navlink--active` is the CSS hook (border-left + background tint); `data-active="true|false"` is the test signal; `aria-current="page"` is the a11y signal. All three coexist.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Sidebar.test.tsx harness needed QueryClientProvider + LoadedViewProvider**

- **Found during:** Task 2 (mounting PinnedViewsSection in Sidebar)
- **Issue:** The 5 existing Phase 24 Sidebar specs failed with "No QueryClient set, use QueryClientProvider to set one" once PinnedViewsSection landed in the Sidebar tree (it calls `useSavedViews()` which requires a QueryClient + `useLoadedView()` which requires LoadedViewProvider).
- **Fix:** Wrapped the in-memory `RouterProvider` in `QueryClientProvider` + `LoadedViewProvider`, added a fetch spy stubbing `/api/views` → empty list, and cleared `cmc.savedView.pinned` between tests. No behavioral assertions in the existing specs changed — only the harness.
- **Files modified:** frontend/src/components/shell/__tests__/Sidebar.test.tsx
- **Verification:** `pnpm test --run src/components/shell/__tests__/Sidebar.test.tsx` → 5/5 pass
- **Committed in:** `3351ceb` (Task 2 commit)

**2. [Rule 3 - Blocking] integration.test.tsx fetch mock missed `/api/views` and the catch-all `{}` crashed the section**

- **Found during:** Task 2 (verifying full vitest suite still passes after Sidebar change)
- **Issue:** integration.test.tsx mocks `globalThis.fetch` with a URL-routed switch; unmatched URLs fall through to `return json({})`. The new `useSavedViews()` call landed in that catch-all, so `allViews` was `{}`, `allViews.items` was `undefined`, and `.items.map(...)` inside the PinnedViewsSection `useMemo` threw. The throw bubbled to the root ErrorBoundary, replacing the entire app with "Couldn't reach the dashboard server", causing 7 unrelated integration specs to fail.
- **Fix:** Added a `/api/views` handler to the integration fetch mock returning `{items:[], total:0}`. Belt-and-suspenders: also added a defensive `Array.isArray(items)` guard in PinnedViewsSection so a similar future shape regression doesn't crash the shell.
- **Files modified:** frontend/src/__tests__/integration.test.tsx, frontend/src/components/savedviews/PinnedViewsSection.tsx
- **Verification:** `pnpm test --run` → 443/443 pass (436 baseline + 7 new)
- **Committed in:** `3351ceb` (Task 2 commit)

**3. [Rule 2 - Missing Critical] Defensive Array.isArray guard on useSavedViews response**

- **Found during:** Task 2 (alongside Deviation 2)
- **Issue:** The PinnedViewsSection useMemo did `allViews.items.map(...)` without checking whether `items` was actually an array. A malformed server response, an in-flight refetch returning a partial shape, or a future bug in `api.viewList` would crash the entire app shell.
- **Fix:** Replaced `if (!allViews) return []` with `const items = allViews?.items; if (!Array.isArray(items)) return []` — fails soft to "no pinned views render" rather than throwing.
- **Files modified:** frontend/src/components/savedviews/PinnedViewsSection.tsx
- **Verification:** Both the catch-all-`{}` integration case AND the explicit empty `{items:[],total:0}` SavedViewMenu case render the empty-state cleanly.
- **Committed in:** `3351ceb` (Task 2 commit, alongside Deviations 1 + 2)

---

**Total deviations:** 3 auto-fixed (2 Rule-3 blocking, 1 Rule-2 missing critical)
**Impact on plan:** All 3 are wiring fixes — they don't change the SHEL-06 behavior described in the plan must_haves. The plan called out the collapsed-mode CSS as the most likely deviation site; in practice the test-harness updates were the actual deviation surface (the CSS inherited from existing rules for free).

## Issues Encountered

- **Vitest `--reporter=basic` flag rejected by Vitest 4.1.5** — the baseline check command from the plan template ran with the default reporter instead; functionally equivalent.
- **TanStack Router's `ReturnType<typeof createRouter>` was overly strict for the test fixture wrapper** — the inferred type carried route-tree literals that didn't unify with `RouterCore<AnyRoute, …>`. Fixed by removing the explicit `RouterFixture` interface and inferring via `ReturnType<typeof makeFixture>` directly. Pattern matches the surrounding SavedViewMenu / EditOrForkDialog tests.

## Known Stubs

None. The empty-state copy ("Pin a saved view from the header menu") is not a stub — it's the user-facing empty-state for the no-pins case (Configure-pattern precedent). It points the user to the SavedViewMenu pin/unpin submenu action which is already wired (Plan 06 + 07).

## localStorage same-tab limitation (carried forward to Plan 11)

`cmc.savedView.pinned` writes from `SavedViewMenu` (pin/unpin submenu actions) do NOT trigger the browser `storage` event in the SAME tab — only OTHER tabs receive it. So the Pinned section's rendered list can lag a tab-local pin/unpin by exactly one render cycle. The user typically navigates after pinning (closing the menu re-renders the tree), so the lag is invisible in practice. Plan 11's Playwright e2e case for pin → visible should refresh the page between the pin action and the assertion, or rely on a subsequent navigation triggering the re-render organically.

A future plan can lift this by emitting a custom `cmc:savedView:pinChanged` event from `pinView`/`unpinView` and subscribing to it in PinnedViewsSection; intentionally NOT done in v1 to keep the SHEL-06 surface small.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Plan 10 (DefaultViewLoader + RecentStateTracker)** can mount inside `LoadedViewProvider` and consume `setLoadedView` the same way Pinned section does. The cross-route useSavedViews + getPinnedIds pattern is the same shape Plan 10 will need for the per-route default-view pointer (`getDefaultViewId`).
- **Plan 11 (close gate)** Playwright cases for `v13-sidebar.spec.ts`:
  - Pin a view from SavedViewMenu → reload → assert it appears in the Sidebar Pinned section (works around the same-tab localStorage limitation).
  - Click a pinned view from a different route → assert URL navigates to the pinned route + search params apply.
  - Active-state visual smoke: load a pinned view, assert `[data-active="true"]` on the row; change `?range=` via URL → assert `[data-active="false"]` (Pitfall 9 regression net).
  - Collapsed-mode (Cmd+B): assert `.cmc-sidebar__navlink-label` inside Pinned section is `display:none`, but the `<button>` row remains clickable.

## Self-Check: PASSED

- frontend/src/components/savedviews/PinnedViewsSection.tsx — FOUND
- frontend/src/components/savedviews/__tests__/PinnedViewsSection.test.tsx — FOUND
- .planning/phases/25-saved-views-backend-frontend/25-09-SUMMARY.md — FOUND
- Commit a86e4f9 (Task 1) — FOUND
- Commit 3351ceb (Task 2) — FOUND
- Commit e569c02 (Task 3) — FOUND

---
*Phase: 25-saved-views-backend-frontend*
*Plan: 09*
*Completed: 2026-05-12*
