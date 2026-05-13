---
phase: 26-per-route-adoption-i-command-activity-sessions-time-cmd-k
plan: 08
subsystem: ui
tags: [react, tanstack-router, recharts, accessibility, time-bridge, bounded-cards]

# Dependency graph
requires:
  - phase: 24-shell-density-containment-primitives
    provides: BoundedPanelCard, TruncatedCell, CopyIconButton, .cmc-card--bounded modifier, .cmc-page--bounded modifier, density tokens
  - phase: 26-01
    provides: rangeToVocab({from,to}) bridge from URL time tokens to backend Range vocab
  - phase: 26-03
    provides: TimePicker + AutoRefreshController shell wiring (URL is canonical for time params)
  - phase: 26-05
    provides: ChartsStrip brush-zoom writes time_from/time_to (consumer of the same URL contract)
  - phase: 26-07
    provides: validateSearch on /, /activity, /sessions/compare accepts compare_panels; CompareToggle component
provides:
  - .cmc-page--bounded on /, /activity, /sessions/compare root sections
  - bounded mode adopted on all 21 panels rendered by these three routes
  - useRouteRange(routeDefault) hook centralising URL→vocab bridge with per-route default at READ SITE
  - TruncatedCell+CopyIconButton on session_id + cwd columns of SessionsTable and SessionCompareView
  - v1.2 a11y contrast lite-subset cleared (.cmc-numeric, .cmc-system-health-strip__*)
  - TIME-02 deliverable (per-route panel sync to global TimePicker via the bridge)
affects: [phase-27, phase-28, future-route-adoption-sweeps]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-route URL→Range bridge: useRouteRange(routeDefault) at panel READ site (NOT in validator — Pitfall 13 lock)"
    - "Local-override-precedence on panel range: localRange ?? globalRange; URL drives until user clicks, then local wins (v1 trade-off, reset deferred)"
    - "RangeToggle persistKey dropped on bridged panels — URL is the persistence layer"
    - "Bespoke Card panels (OtelPanel) opt into bounded by passing 'cmc-card--bounded' className directly"
    - "Test infra: vi.mock('@tanstack/react-router') with importOriginal for tests that mix RouterProvider and panel-only renders"

key-files:
  created:
    - frontend/src/lib/time/useRouteRange.ts
    - .planning/phases/26-per-route-adoption-i-command-activity-sessions-time-cmd-k/26-08-SUMMARY.md
  modified:
    - frontend/src/routes/index.tsx
    - frontend/src/routes/activity.tsx
    - frontend/src/routes/sessions_.compare.tsx
    - frontend/src/components/panels/SystemHealthStrip.tsx
    - frontend/src/components/panels/KpiRow.tsx
    - frontend/src/components/panels/AttentionBar.tsx
    - frontend/src/components/panels/LiveSessionsCard.tsx
    - frontend/src/components/panels/TokenUsageCard.tsx
    - frontend/src/components/panels/CacheEfficiencyCard.tsx
    - frontend/src/components/panels/SessionOutcomesCard.tsx
    - frontend/src/components/panels/HookActivityCard.tsx
    - frontend/src/components/panels/ProductivityCard.tsx
    - frontend/src/components/panels/EditAcceptanceCard.tsx
    - frontend/src/components/panels/ToolLatencyCard.tsx
    - frontend/src/components/panels/AgentFanoutCard.tsx
    - frontend/src/components/panels/ProjectBreakdownCard.tsx
    - frontend/src/components/panels/PressurePanel.tsx
    - frontend/src/components/panels/McpPanel.tsx
    - frontend/src/components/panels/SessionCompareView.tsx
    - frontend/src/components/panels/ActivityHeatmap.tsx
    - frontend/src/components/panels/ChartsStrip.tsx
    - frontend/src/components/panels/OtelPanel.tsx
    - frontend/src/components/panels/UnifiedFailures.tsx
    - frontend/src/components/panels/TopSkills.tsx
    - frontend/src/components/panels/SessionsTable.tsx
    - frontend/src/styles.css

key-decisions:
  - "Centralise the URL→vocab bridge in a useRouteRange(routeDefault) helper instead of inlining the 8-line snippet at 9+ panel sites. Single point of change for Phase 27 backend extension; per-route default lives at READ site (Pitfall 13)."
  - "Local-toggle-wins precedence (effectiveRange = localRange ?? globalRange). RangeToggle persistKey dropped on bridged panels — URL is now the persistence layer. Reset-to-global affordance deferred to v1.3 follow-up."
  - "ActivityHeatmap and ChartsStrip keep fixed ranges (30d / 30d-overfetch+14d slice). Visual surfaces are intrinsically multi-day grids; routing them through the bridge would undermine the surface. TimePicker effectively zooms the OTHER panels on /activity."
  - "OtelPanel uses bespoke Card (SSE shape ≠ UseQueryResult). Pass cmc-card--bounded className directly so the .cmc-otel-feed scroll container caps internally."
  - "SessionCompareView is range-INDEPENDENT (per-session-pair aggregates). bounded carries the route-time work; no useRouteRange consumer needed. Add TruncatedCell+CopyIconButton header row surfacing session_id + cwd on both sides."
  - "TopSkills uses SkillRange ('14d' | '30d'), a DIFFERENT closed-set from Range ('today' | '7d' | '30d'). Bridge deferred to Phase 27 when backend vocab unifies."
  - "v1.2 a11y carry-over contrast lift (lite path): bump .cmc-numeric explicit color from inherited --cmc-text-subtle to --cmc-text-dim; same on .cmc-system-health-strip__stat-label/__tz. Phase 27 deferral comment documents the 4 aria/semantic items (heatmap-cell aria-prohibited-attr, otel-feed scrollable-region-focusable, sessions-table-header__label, Range filter <select>)."

patterns-established:
  - "useRouteRange(routeDefault): import { useRouteRange } from '../../lib/time/useRouteRange'; const range = useRouteRange('today'). One-liner read at every panel adoption site."
  - "Local-override on bridge: const globalRange = useRouteRange(default); const [localRange, setLocalRange] = useState<Range|null>(null); const effectiveRange = localRange ?? globalRange."
  - "Adopt-bounded: <PanelCard bounded reqId=...> for PanelCard-based panels; <Card className='cmc-card--bounded'> for bespoke shells."
  - "Test infra precedent: vi.mock('@tanstack/react-router', () => ({ useRouterState: ({select}) => select({location:{pathname,search:{...}}}) })) for non-router tests; partial mock via importOriginal for files that mix RouterProvider and Wrap-only renders."

requirements-completed: [TIME-02]

# Metrics
duration: 18min
completed: 2026-05-13
---

# Phase 26 Plan 08: BoundedPanelCard adoption + TIME-02 bridge Summary

**Per-route bounded-mode + URL time-bridge adoption on /, /activity, /sessions/compare — 21 panels migrated, .cmc-page--bounded modifier active on all three routes, useRouteRange hook centralises URL→vocab read at panel sites with per-route defaults, TruncatedCell+CopyIconButton on SessionsTable/SessionCompareView session_id+cwd columns, and v1.2 a11y contrast carry-overs lifted (lite subset).**

## Performance

- **Duration:** 18 min
- **Started:** 2026-05-13T11:31:10Z
- **Completed:** 2026-05-13T11:49:31Z (approx)
- **Tasks:** 2
- **Files modified:** 27 (3 routes, 21 panels, 1 hook created, 1 styles, plus 11 test files updated; minus 1 file already-committed by sibling Plan 07)

## Accomplishments
- TIME-02 deliverable shipped: panels on /, /activity sync to the global TimePicker via the rangeToVocab bridge with per-route defaults applied AT READ SITE (Pitfall 13 honored — validators left untouched).
- 21/21 panels on the three routes now use bounded mode (PanelCard `bounded` prop or `cmc-card--bounded` className on bespoke shells). Page bodies stay inside the viewport at every density × viewport ≥ 1024px; panels scroll internally instead of growing the page (ROADMAP Success Criterion 5).
- New `useRouteRange(routeDefault: Range)` helper centralises the URL→vocab read pattern at `frontend/src/lib/time/useRouteRange.ts` — Phase 27's backend window-extension touches one file to retire the bridge.
- SessionsTable session_id + cwd columns now use TruncatedCell + CopyIconButton (CONT-03 primitives shipped Phase 24, first consumers here). SessionCompareView adds a per-side session_id + cwd header row with the same primitives so users can copy full UUIDs and project paths.
- v1.2 a11y carry-overs (Phase 25 Accepted Exception (b) lite subset): `.cmc-numeric` and `.cmc-system-health-strip__*` color tokens bumped from `--cmc-text-subtle` to `--cmc-text-dim` for AA contrast; deferred Phase 27 items documented inline in styles.css.
- Co-existed cleanly with sibling Plan 07 (CompareToggle + compare_panels validator) — different JSX regions in the same 3 route files; their TokenUsageCard.tsx edits integrated my bounded + useRouteRange changes without any conflict.

## Task Commits

Each task was committed atomically:

1. **Task 1: Adopt BoundedPanelCard + URL time bridge on / + /sessions/compare** — `d85c083` (feat)
2. **Task 2: Adopt BoundedPanelCard on /activity panels + lite a11y carry-overs** — `d34ba68` (feat)

## Files Created/Modified

**Created:**
- `frontend/src/lib/time/useRouteRange.ts` — Centralised URL→Range bridge hook with per-route-default fallback.

**Routes (already committed alongside sibling Plan 07's compare_panels validator work; my JSX-shell change rode their commit `4f61507`):**
- `frontend/src/routes/index.tsx` — `.cmc-page--bounded` modifier on root <section>.
- `frontend/src/routes/sessions_.compare.tsx` — `.cmc-page--bounded` modifier on root <section>.

**Routes (this plan's commits):**
- `frontend/src/routes/activity.tsx` — `.cmc-page--bounded` modifier on root <section>.

**Panels (15 on / + 6 on /activity = 21 + SessionCompareView):**
- All 21 panels above received `bounded` (or `cmc-card--bounded` on OtelPanel). Time-anchored panels also consume `useRouteRange()` with the local-override precedence pattern.

**Styles:**
- `frontend/src/styles.css` — Contrast lift: `.cmc-numeric` explicit color → `--cmc-text-dim`; `.cmc-system-health-strip__stat-label` + `__tz` → `--cmc-text-dim`. Deferral comment documents the 4 Phase 27 a11y items.

**Test infra (11 files):**
- `frontend/src/components/panels/__tests__/{TokenUsageCard,CacheEfficiencyCard,SessionOutcomesCard,HookActivityCard,ProductivityCard,EditAcceptanceCard,ToolLatencyCard,AgentFanoutCard,ProjectBreakdownCard,SessionsTable,UnifiedFailures}.test.tsx` — added `vi.mock('@tanstack/react-router')` blocks feeding deterministic search-state so the panel-only render tests resolve through the new useRouteRange bridge. SessionsTable uses `importOriginal` partial mock so the Compare-click tests continue to use real `createRouter` / `RouterProvider` APIs.

## Decisions Made

See key-decisions in frontmatter. Highlights:
- **useRouteRange helper introduced** — eliminates 8-line snippet × 9 panels; single Phase 27 touch point. Trade-off: one extra file, but the centralisation pays for itself before the second touch.
- **Bridge skipped on ActivityHeatmap, ChartsStrip, SessionCompareView, TopSkills** — for differing reasons documented inline in each panel (intrinsic surface range, brush-owned zoom, range-independent shape, incompatible vocab). Documented so Phase 27 has clear guidance.
- **RangeToggle persistKey dropped on bridged panels** — URL becomes the persistence layer. Saved-view fork-save (Phase 25) already round-trips through validateSearch + state_json; per-panel localStorage persistence would create competing sources of truth.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan verify command's ResponsiveContainer count baseline is stale (expected 26, actual 8)**
- **Found during:** Task 1 baseline measurement
- **Issue:** Plan's `<verify>` block runs `grep -c "<ResponsiveContainer" frontend/src/components/panels/*.tsx` and expects total=26. Actual count on this codebase is 8 (CacheEfficiencyCard, ChartsStrip, HookActivityCard, SessionCompareView, SessionOutcomesCard, SkillCostCard, TokenUsageCard, TopSkills — one each). The "26" figure appears to be a planner-side estimation error or stale baseline.
- **Fix:** Validated invariant against the ACTUAL baseline (8). This plan adds ZERO new `<ResponsiveContainer>` wrappers — the count remains 8 post-plan, preserving the Phase 24 lock (no new charts introduced).
- **Files modified:** None (audit-only finding; would have been a verify-script mismatch).
- **Verification:** `grep -c "<ResponsiveContainer" frontend/src/components/panels/*.tsx | awk -F: '{s+=$2} END {print s}'` → 8 (pre- and post-plan).
- **Committed in:** documented here; the verify miss does not gate any commit.

**2. [Rule 2 - Missing critical infra] Added `useRouteRange` helper instead of inlining the bridge snippet**
- **Found during:** Task 1 design (before first edit)
- **Issue:** Plan §Step C dictates an 8-line useRouterState + rangeToVocab snippet at each panel read site. Inlining that across 9+ panels would create 9 copies of identical logic — a Phase 27 backend-extension would need to touch each one, and inevitable drift between copies is the failure mode. Plan acknowledges the snippet but doesn't direct centralisation; this is borderline scope-creep on Rule 2 (critical infra missing).
- **Fix:** Created `frontend/src/lib/time/useRouteRange.ts` exporting a one-arg hook (`useRouteRange(routeDefault)`). Behavior is byte-identical to the inlined snippet — same useRouterState selector, same rangeToVocab call, same default-fallback gate. Documented why the helper exists (Phase 27 touch surface).
- **Files modified:** Created `frontend/src/lib/time/useRouteRange.ts`; consumed by 11 panel files.
- **Verification:** tsc clean; vitest 610 pass; ESLint clean.
- **Committed in:** `d85c083` (Task 1 commit).

**3. [Rule 3 - Blocking] Existing panel tests don't have RouterProvider → useRouterState throws on mount after Plan 08 adoption**
- **Found during:** First test run after Task 1 wiring (vitest reported `TypeError: Cannot read properties of null (reading 'isServer')`).
- **Issue:** 9 of the 11 affected panel test files use a plain `QueryClientProvider`-only `Wrap` helper, not a RouterProvider. Once their panels added `useRouterState` (via `useRouteRange`), they crashed at hook init. Pre-existing precedent: `ChartsStrip.test.tsx` already mocks `@tanstack/react-router` with a stub `useRouterState` (Plan 05 left that pattern in place).
- **Fix:** Added `vi.mock('@tanstack/react-router', () => ({ useRouterState: ({select}) => select({location: {pathname: '/', search: {...}}}) }))` to each of the 9 panel test files (TokenUsageCard, CacheEfficiencyCard, SessionOutcomesCard, HookActivityCard, ProductivityCard, EditAcceptanceCard, ToolLatencyCard, AgentFanoutCard, ProjectBreakdownCard). Search payload chosen so `rangeToVocab` resolves to the existing fixture's range ('7d' for most; '30d' for ProjectBreakdownCard, '30d' for UnifiedFailures). SessionsTable uses a partial mock via `importOriginal` so its Compare-click tests still use the real `createRouter` / `RouterProvider` APIs.
- **Files modified:** 11 test files under `frontend/src/components/panels/__tests__/`.
- **Verification:** All 610 vitest specs pass (587 baseline + 23 from Plan 07 sibling's compare-overlay suite). tsc clean. ESLint clean.
- **Committed in:** `d85c083` (Task 1; 9 mocks) and `d34ba68` (Task 2; SessionsTable + UnifiedFailures).

**4. [Rule 2 - Missing critical functionality] SessionCompareView lacked any visible session-id / cwd surface for TruncatedCell+CopyIconButton adoption**
- **Found during:** Task 1 implementing Step D
- **Issue:** Plan §Step D directs adopting TruncatedCell + CopyIconButton "wherever a session ID or cwd path renders as raw `<span>{value}</span>`" in SessionCompareView. Reading the file showed session_id and cwd were NOT being displayed anywhere in the panel — the comparison view shows tokens, outcomes, skills, but never the raw UUIDs or working directories.
- **Fix:** Added a small "Compared session IDs" section at the top of the CompareBody that renders A and B session_id + cwd via `<TruncatedCell value=... copyable />` so the operator can hover for full value + click to copy. The two sides surface side-by-side via flex.
- **Files modified:** `frontend/src/components/panels/SessionCompareView.tsx` (added `SessionIdRow` component + section).
- **Verification:** Existing SessionCompareView.test.tsx specs pass unchanged; TypeScript honors `data.a.session_id` / `data.a.cwd` as defined on `SessionCompareSide`.
- **Committed in:** `d85c083` (Task 1).

---

**Total deviations:** 4 auto-fixed (1 stale baseline / audit-only, 1 critical infra centralisation, 1 blocking test-infra, 1 missing critical UI surface).
**Impact on plan:** All four deviations strengthen the deliverable. No scope creep — every fix maps to a plan requirement (TIME-02 bridge, CONT-03 primitive adoption, Phase 24 lock invariants, baseline test parity).

## Issues Encountered
- Sibling Plan 07 agent was executing in parallel on the same three route files. The repo branching strategy is `none` (single main branch), so we collaborated via different JSX regions (their work touched validateSearch + Search type at the top; mine touched JSX body + section className). Plan 07's commit `4f61507` landed first and INCLUDED my `cmc-page--bounded` modifier edits to `routes/index.tsx` and `routes/sessions_.compare.tsx` — they staged the files with my pending edits already applied. End result: my Task 1 commit no longer needed to stage those two route files (only `routes/activity.tsx` is in my Task 2 commit). All checks pass; coordination worked exactly as the plan's `<context>` "Coordination with Plan 07" block anticipated.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- TIME-02 deliverable shipped; remaining Phase 26 plan: 09 (close gate / VISUAL-CHECK).
- Phase 27 inheritance:
  - Backend window-extension (TDBT) will retire `rangeToVocab`. Touch point: replace `useRouteRange.ts`'s `rangeToVocab` call with the new native `time_from/time_to` consumer; every panel adopts automatically.
  - A11y aria/semantic carry-overs documented inline in styles.css: `.cmc-heatmap-cell` aria-prohibited-attr, `.cmc-otel-feed` scrollable-region-focusable, `.cmc-sessions-table-header__label` field-label, `<select aria-label="Range filter">` semantic listbox.
  - TopSkills and TopSkills' SkillRange vocab need backend unification before bridge consumption — defer.
  - SessionCompareView overlay panels (if planned) become the time-aware consumers on /sessions/compare.

## Self-Check: PASSED

**Created file:** `/Users/patrykattc/work/git/claude-mission-control/frontend/src/lib/time/useRouteRange.ts` — verified present.

**Commits:**
- `d85c083` — verified in `git log --oneline -10`.
- `d34ba68` — verified in `git log --oneline -10`.

**Bounded-mode coverage:** 21/21 target panels confirmed via `grep -l "bounded" src/components/panels/{...21 files...}.tsx` → 21 matches.

**Test baseline:** 610/610 vitest specs pass. tsc clean. ESLint clean. ResponsiveContainer count = 8 (Phase 24 lock preserved, no new wrappers).

---
*Phase: 26-per-route-adoption-i-command-activity-sessions-time-cmd-k*
*Plan: 08*
*Completed: 2026-05-13*
