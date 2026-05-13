---
phase: 26-per-route-adoption-i-command-activity-sessions-time-cmd-k
plan: 06
subsystem: ui
tags: [cmdk, command-palette, density, time-range, recents, react, tanstack-router, sonner]

requires:
  - phase: 26
    provides: "Plan 01 — sonner toaster + serializeRange/parseRangeFromText + asTimeToken validator. Plan 02 — getRecentRoutes() FIFO ring from cmc.recents.routes. Plan 03 — TimePicker URL contract (?time_from=&time_to=) that Cmd+K presets mirror. Phase 25 Plan 08 — existing Saved Views Command.Group (relocated to slot 2 in this plan). Phase 25 Plan 10 — getAllRecentStates() cross-route ad-hoc state aggregation. Phase 24 Plan 02 — setDensity()/getDensity() from lib/density.ts (NO React Context — Pitfall 3)."
provides:
  - "CMDK-04 — Recents group at top of Cmd+K palette: top-5 routes + top-5 cross-route ad-hoc states with empty-state surface"
  - "CMDK-03 — Time range group: 4 condensed presets (1h/24h/7d/30d) + Copy/Paste commands via Cmd+Shift+C/V codepath reuse"
  - "CMDK-02 — Density group: 3 discrete commands with check-prefix on currently-active density; setDensity() called directly (no Context)"
  - "Locked JSX child order (Pitfall 10): Recents → Saved Views → Pages → Time range → Density → Actions"
  - "4 new testid families registered: cmdk-recents-route-{slug}, cmdk-recents-state-{idx}, cmdk-time-range-{value}, cmdk-density-{value} + exact-match cmdk-recents-empty / cmdk-time-range-copy / cmdk-time-range-paste"
  - "routeToTestidSlug() pure helper exported for testability — mirror of SidebarNavLink's slug derivation so cmdk-recents-route-{slug} speaks the same vocabulary as sidebar-link-{slug}"
affects: [27, 28]

tech-stack:
  added: []
  patterns:
    - "Cmd+K palette as second access path: each group's selection routes through the SAME primitive its first-access surface uses (Density via setDensity, Time range via function-form navigate, Recents via plain navigate). No Context bridges between Cmd+K and any consumer (Pitfall 3 lock for density specifically)."
    - "JSX child order is THE source of truth for cmdk render ordering (Pitfall 10). Group order is frequency-first per CONTEXT.md decision."
    - "User-event clipboard ordering: userEvent.setup() installs its own getter-based clipboard stub via attachClipboardStubToView. To win the override, defineProperty(navigator, 'clipboard', ...) MUST run AFTER userEvent.setup(). Same pattern applicable to any clipboard-dependent vitest spec going forward."

key-files:
  created:
    - frontend/src/components/ui/__tests__/CommandPalette.recents.test.tsx
    - frontend/src/components/ui/__tests__/CommandPalette.timeRange.test.tsx
    - frontend/src/components/ui/__tests__/CommandPalette.density.test.tsx
  modified:
    - frontend/src/components/ui/CommandPalette.tsx
    - docs/testid-registry.md

key-decisions:
  - "CMDK-04 in-scope routes for getAllRecentStates aggregation: mirror RecentRoutesTracker's IN_SCOPE_ROUTES set verbatim (/, /activity, /sessions/compare, /skills, /skills/$name, /cost, /alerts). Three lists must stay in sync — comment breadcrumbs added."
  - "Slug derivation for cmdk-recents-route-{slug} mirrors SidebarNavLink: root '/' → 'home', other pathnames strip leading slash and hyphenate remaining slashes. Same vocabulary as sidebar-link-{slug} so testid grep finds both."
  - "Density group uses local useState ONLY for the checkmark display; real state lives in <html data-density> + localStorage via setDensity(). Pitfall 3 lock prevents React Context bridge that would force subtree re-render."
  - "Time range Copy/Paste reuses lib/time/clipboard.ts + sonner exactly — no duplication of Cmd+Shift+C/V codepath. CMDK_TIME_PRESETS is a 4-entry condensed mirror of TimePicker's 13-preset list."

patterns-established:
  - "Cmd+K group additions land in the locked JSX child order — adding a future group requires planning its slot explicitly (Pitfall 10)."
  - "Testid registration immediately precedes/follows the JSX edit that introduces the testid — Phase 24 ESLint rule (testid-registry-only.cjs) enforces this."
  - "navigator.clipboard override in vitest specs MUST run after userEvent.setup() — documented inline in the test where the ordering matters."

duration: ~20 min
completed: 2026-05-13
---

# Phase 26 Plan 06: Cmd+K Density / Time range / Recents groups Summary

**Triple new Cmd+K surface: Recents at top (top-5 routes + top-5 ad-hoc states), Time range presets + copy/paste between Pages and Density, Density commands with check-prefix indicator routing through setDensity() directly — final locked 6-group palette layout.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-05-13T11:05:00Z
- **Completed:** 2026-05-13T11:24:48Z
- **Tasks:** 2 (auto)
- **Files modified:** 2 (CommandPalette.tsx, docs/testid-registry.md)
- **Files created:** 3 (CommandPalette.recents.test.tsx, CommandPalette.timeRange.test.tsx, CommandPalette.density.test.tsx)

## Accomplishments

- Extended `CommandPalette.tsx` with 3 new Command.Groups (Recents, Time range, Density) in the locked JSX child order (Pitfall 10): Recents → Saved Views → Pages → Time range → Density → Actions. Existing Phase 25 Plan 08 Saved Views group relocated cleanly (slot 2) and its 11 vitest cases continue to pass after relocation.
- CMDK-04 (Recents) reads getRecentRoutes() (Plan 02) + getAllRecentStates() (Phase 25 Plan 10) and renders top-5 of each. Empty state (`cmdk-recents-empty`) handles cold start. Selecting a recent route navigates via plain navigate; selecting an ad-hoc state navigates to its route with state as search params.
- CMDK-03 (Time range) condenses TimePicker's 13-preset grid to 4 high-frequency windows (1h/24h/7d/30d) + Copy/Paste commands. Selection writes time_from/time_to via function-form navigate — identical URL contract to TimePicker (Plan 03). Copy/Paste reuse lib/time/clipboard.ts helpers + sonner toasts so Cmd+K is a genuine second access path with zero duplication.
- CMDK-02 (Density) ships 3 discrete commands with check-prefix indicator on the currently-active density. Selection calls setDensity() from lib/density.ts directly — Pitfall 3 lock: NO React Context bridge. POLI-11 zero-rerender invariant preserved (CSS variables re-cascade with no React subtree re-render below CommandPalette).
- 4 new testid families registered in docs/testid-registry.md: `cmdk-recents-route-{slug}`, `cmdk-recents-state-{idx}`, `cmdk-time-range-{value}`, `cmdk-density-{value}` + 3 exact-match testids (`cmdk-recents-empty`, `cmdk-time-range-copy`, `cmdk-time-range-paste`). Slug derivation aligned with SidebarNavLink (routeToTestidSlug() exported pure helper).
- 17 new vitest cases (6 Recents + 6 Time range + 5 Density). All 42 CommandPalette tests pass (4 files: recents, timeRange, density, savedViews, original). Full vitest suite 587/0/0 (556 baseline + 14 from sibling Plan 05 + 17 from this plan).

## Task Commits

Each task was committed atomically (Phase 26 Plan 06 — branching_strategy: none, parallelization: true; sibling agent ran Plan 05 in parallel on disjoint files):

1. **Task 1: Insert Recents and Time Range groups into CommandPalette (JSX order)** — `21ebf9b` (feat)
2. **Task 2: Insert Density group into CommandPalette (CMDK-02)** — `a829862` (feat)

_Note: Task 1 left CommandPalette in the documented 5-group intermediate state (Density slot RESERVED with explicit placeholder comment); Task 2 atomically filled the slot. Both commits land back-to-back so the partial state never reaches downstream consumers — verified by re-asserting the FULL 6-group order via `grep -n "Command.Group heading"` after Task 2._

## Files Created/Modified

- `frontend/src/components/ui/CommandPalette.tsx` — modified: added Recents + Time range + Density groups, relocated Pages after Saved Views, added 6 imports (getRecentRoutes, getAllRecentStates, serializeRange, parseRangeFromText, asTimeToken, getDensity/setDensity/Density), added 3 module-level constants (RECENTS_IN_SCOPE_ROUTES, CMDK_TIME_PRESETS, CMDK_DENSITIES), exported routeToTestidSlug() pure helper, added 5 component-local memos/callbacks/state (recentRoutes useMemo, recentAdHocStates useMemo, applyTimeRange useCallback, onCopyTimeRange useCallback, onPasteTimeRange useCallback, currentDensity useState + chooseDensity useCallback).
- `frontend/src/components/ui/__tests__/CommandPalette.recents.test.tsx` — created: 6 vitest cases (empty rings, top-5 routes newest-first, route selection navigates + closes, mixed routes + states ordering, top-5 truncation, ad-hoc state navigation with search params).
- `frontend/src/components/ui/__tests__/CommandPalette.timeRange.test.tsx` — created: 6 vitest cases (6 items render, "Last 7 days" preset writes URL, Copy with no params → toast.error, Copy with valid params → clipboard write + toast.success, Paste with valid clipboard → navigate + toast.message, Paste with invalid clipboard → toast.error). Inline lock-comment documents the userEvent.setup() / navigator.clipboard ordering invariant.
- `frontend/src/components/ui/__tests__/CommandPalette.density.test.tsx` — created: 5 vitest cases (3 items render, check-prefix on active only, selection calls setDensity + closes, local state updates flow into next-open label, POLI-11 spot check — setDensity called exactly once per selection).
- `docs/testid-registry.md` — modified: added 4 dynamic patterns + 3 exact-match entries (Task 1 added 6 of the 7; Task 2 added the density pattern).

## Decisions Made

- **Cross-route recents aggregation list copied from RecentRoutesTracker** rather than imported via a shared constant — three IN_SCOPE_ROUTES sets now exist (RecentStateTracker, RecentRoutesTracker, CommandPalette's RECENTS_IN_SCOPE_ROUTES) and the comment breadcrumb in CommandPalette.tsx documents the cross-file invariant. Future Phase may unify into lib/routes.ts.
- **routeToTestidSlug() exported** so that future consumers (sidebar tests, e2e cmdk specs) can re-derive the same slug from a route pathname without copy-pasting the algorithm. Hyphenation handles `/skills/$name` → `skills-name` (the `$` is dropped) consistent with TanStack Router's dynamic-segment convention.
- **CMDK_DENSITIES module constant** (not inline-defined inside the component) so the array isn't re-allocated on every render. Mirrors CMDK_TIME_PRESETS.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Vitest specs override navigator.clipboard AFTER userEvent.setup() to defeat user-event's getter-based clipboard stub**

- **Found during:** Task 1 (CommandPalette.timeRange.test.tsx)
- **Issue:** `userEvent.setup()` calls `attachClipboardStubToView(view)` (@testing-library/user-event/dist/esm/utils/dataTransfer/Clipboard.js) which installs a getter via `Object.defineProperty(window.navigator, 'clipboard', { get: () => stub, configurable: true })`. When the test did `Object.defineProperty(navigator, 'clipboard', { value: fakeClipboard, configurable: true })` BEFORE `userEvent.setup()`, the user-event stub clobbered the fake. Symptom: `toast.success('Time range copied')` was called (which proves writeText DID resolve), but the closed-over `writes` array stayed empty — because writeText was the user-event stub's `Clipboard#writeText`, not our spy. Diagnosed by adding a runtime probe: `navigator.clipboard === fakeClipboard` was `false` at execution time but `true` immediately after defineProperty.
- **Fix:** Move `Object.defineProperty(navigator, 'clipboard', ...)` to AFTER `userEvent.setup()` in every clipboard-dependent spec. Added an inline lock-comment in the test file documenting the ordering invariant so future tests don't regress. TimePicker.test.tsx is unaffected because it uses `window.dispatchEvent(new KeyboardEvent(...))` directly (no userEvent.setup() in the clipboard path).
- **Files modified:** frontend/src/components/ui/__tests__/CommandPalette.timeRange.test.tsx (4 specs touched).
- **Verification:** All 6 timeRange specs pass; full CommandPalette test suite (42 specs across 5 files) passes; full vitest suite 587/0/0.
- **Committed in:** `21ebf9b` (Task 1 commit — the ordering is baked into the test file from its first commit).

**2. [Rule 1 — Bug] `navigate({ to: location.pathname })` requires `as never` cast under TanStack Router's strict typing**

- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** TanStack Router's `to` parameter is a typed union narrowed from the route tree. `location.pathname` is `string`, which is wider than the typed union → tsc TS2322. Plan 03's TimePicker hit the same constraint and used `as never` (line 56). Adopted the same workaround here for the 3 navigate sites that consume a runtime pathname/route string (applyTimeRange, recent route onSelect, recent state onSelect).
- **Fix:** Add `as never` cast to `to` and (where applicable) `search` argument. Behaviour unchanged at runtime — the router validates the search via the route's validateSearch.
- **Files modified:** frontend/src/components/ui/CommandPalette.tsx.
- **Verification:** `pnpm tsc --noEmit` clean across the whole frontend tree.
- **Committed in:** `21ebf9b` (Task 1 commit).

---

**Total deviations:** 2 auto-fixed (2 Rule-1 bugs)
**Impact on plan:** Both auto-fixes are test/typing plumbing — zero scope creep into product surface. Deviation 1 is a generic vitest infrastructure improvement applicable to any future clipboard-dependent component spec.

## Issues Encountered

- None beyond the two deviations above. Plan executed cleanly across two atomic commits with the intermediate-state lock honored (Density slot reserved at Task 1, filled at Task 2; final 6-group order asserted by grep before commit).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 26 Plan 06 closes CMDK-02 + CMDK-03 + CMDK-04. The Cmd+K palette is now the consolidated discoverability surface for the entire phase's foundation: Density (also reachable from header DensityToggle), Time range presets + copy/paste (also reachable from TimePicker popover and Cmd+Shift+C/V), Recents (also reachable from sidebar Recently Visited).
- 5/9 Phase 26 plans complete. Wave 3 (Plans 05–09 per-route adoption) is now half-shipped: this plan (06) + sibling Plan 05 (brush-zoom on /activity ChartsStrip). Wave 3 remaining: Plans 07, 08, 09 (per-route Activity / Sessions / Cost time-aware adoption + final close gate).
- Frontend vitest: 587/0/0 (556 baseline + 14 from Plan 05 + 17 from Plan 06). pnpm tsc --noEmit clean. pnpm lint --max-warnings 0 clean. ResponsiveContainer count delta = 0 (this plan introduces zero charts).
- Locked invariants verified: Pitfall 10 (6 Command.Group headings in JSX in the locked order), Pitfall 3 (Density commands route through `setDensity` import directly — no React Context callers in CommandPalette.tsx for density), POLI-11 (Density selection mutates only `<html data-density>` via setDensity; no React subtree re-render below the palette).

## Self-Check: PASSED

Verified files created:
- FOUND: frontend/src/components/ui/__tests__/CommandPalette.recents.test.tsx
- FOUND: frontend/src/components/ui/__tests__/CommandPalette.timeRange.test.tsx
- FOUND: frontend/src/components/ui/__tests__/CommandPalette.density.test.tsx

Verified commits exist:
- FOUND: 21ebf9b (Task 1)
- FOUND: a829862 (Task 2)

---
*Phase: 26-per-route-adoption-i-command-activity-sessions-time-cmd-k*
*Completed: 2026-05-13*
