---
phase: 26-per-route-adoption-i-command-activity-sessions-time-cmd-k
verified: 2026-05-13T14:38:43Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Phase 26: Per-Route Adoption I (Command/Activity/Sessions) + Time + Cmd+K Verification Report

**Phase Goal:** Roll the Phase 24 primitives + Phase 25 saved-view infrastructure through the three highest-traffic routes (`/`, `/activity`, `/sessions/compare`) and ship the global time picker (with copy/paste, compare-to-previous overlay, brush-zoom) plus the Cmd+K density / time-range / recents groups and sidebar recently-visited section. Validates the adoption pattern before Phase 27 repeats it on tail-end routes.
**Verified:** 2026-05-13T14:38:43Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                       | Status     | Evidence                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Global time picker now-7d → time-anchored panels on / + /activity + /sessions/compare re-query; auto-refresh toggle (off/30s/1m/5m)         | VERIFIED   | `TimePicker.tsx:46-143` mounts a Radix Popover preset+calendar that calls `applyRange()` (`navigate({ search: prev => ({ ...prev, time_from, time_to }) })`). `RefreshDropdown.tsx:47-116` lists exactly the four intervals (`off`, `30s`, `1m`, `5m`), persists to `cmc.autoRefresh.interval`, dispatches `cmc:auto-refresh-changed`. `AutoRefreshController.tsx:40-78` consumes both event channels via `setInterval` → `queryClient.invalidateQueries({ predicate: isTimeAnchoredKey })`. `AppShellHeader.tsx:41-52` mounts `<TimePicker />` + `<RefreshDropdown />`; `AppShell.tsx:13+82` mounts `<AutoRefreshController />`. Panels consume `useRouteRange()` (`lib/time/useRouteRange.ts:36-43`) which converts URL → backend `Range` vocab via `rangeToVocab`. `routes/index.tsx:33-68`, `routes/activity.tsx:25-59`, `routes/sessions_.compare.tsx:28-75` all add the append-only `time_from`/`time_to` validators. |
| 2   | Cmd+Shift+C copies range, Cmd+Shift+V on different route pastes (relative tokens preserved)                                                  | VERIFIED   | `TimePicker.tsx:72-110` registers a window-level `keydown` handler that calls `serializeRange()` on Cmd+Shift+C and `parseRangeFromText()` + `asTimeToken()` defense-in-depth on Cmd+Shift+V, then `applyRange()` writes to whatever the **current** `location.pathname` is (cross-route paste). `lib/time/clipboard.ts:11-30` produces a URL-fragment-shaped payload preserving the original tokens (`now-7d`, `now-24h`, etc.) verbatim — no collapsing to absolute. `lib/searchSchemas.ts` `asTimeToken` accepts both `GRAFANA_REL` and `ISO_ABS` regex shapes so relative symbols round-trip cleanly. Toast feedback via `sonner` on success/error. |
| 3   | Drag region on /activity recharts time-series → chart zooms; global TimePicker updates; URL time_from/time_to update; other panels re-anchor | VERIFIED   | `ChartBrushController.tsx:36-68` exposes `useChartBrush()` returning an `onDragEnd` handler that coerces date-only rows to full ISO and calls `navigate({ search: prev => ({ ...prev, time_from, time_to }) })`. `ChartsStrip.tsx:41-105` wires `<Brush onDragEnd={onDragEnd as never} />` inside the existing `BarChart`/`ResponsiveContainer` (Phase 24 lock preserved — no new RC). `ResetZoomButton.tsx:13-45` reads `time_from` via `useRouterState`, detects ISO via `ISO_RE`, and clears both params on click. URL → other panels: `useRouteRange()` reads the same `useRouterState` search slice, so siblings re-anchor on next render. AutoRefreshController pause branch (`isAbsolute(timeFrom)`) freezes refresh during investigation. |
| 4   | Cmd+K Recents shows last 5 routes (SHEL-05) + ad-hoc states (VIEW-09); "Set density: Compact" + "Last 7 days" commands re-paint without navigating | VERIFIED   | `CommandPalette.tsx:510-562` renders a `Command.Group heading="Recents"` reading `getRecentRoutes().slice(0, 5)` + `getAllRecentStates(RECENTS_IN_SCOPE_ROUTES).slice(0, 5)`. `CommandPalette.tsx:665-677` renders `Command.Group heading="Density"` mapping `CMDK_DENSITIES` to three items that call `setDensity()` directly (no React Context — Pitfall 3 lock). `CommandPalette.tsx:623-658` renders `Command.Group heading="Time range"` mapping 4 condensed presets + Copy + Paste items; selection calls `applyTimeRange()` (function-form navigate writing `time_from`/`time_to`). Group order: Recents → Saved Views → Pages → Time range → Density → Actions matches the JSX order in `CommandPalette.tsx:510-703` (Pitfall 10). `RecentRoutesTracker.tsx:50-58` zero-render effect pushes the current route to `cmc.recents.routes` on every in-scope navigation; mounted in `AppShell.tsx:71`. |
| 5   | Sheet on /sessions/compare stays inside viewport at every density × viewport ≥1024px; long session IDs and cwd paths truncate; pages stay bounded with internal panel scroll | VERIFIED   | `routes/sessions_.compare.tsx:82` adds `cmc-page--bounded` modifier to the route shell. `SessionCompareView.tsx:743` passes `bounded` prop to the PanelCard; `SessionCompareView.tsx:619/626` wraps session IDs + cwd in `<TruncatedCell copyable />` (CONT-03 primitive). `SessionsTable.tsx:96-108` (consumed on `/activity`) also wires `TruncatedCell` + `CopyIconButton` for `session_id` + `cwd`. Adoption inventory: 27 `bounded` uses across `frontend/src/components/panels/*.tsx` (15 on /, 6 on /activity, 1 on /sessions/compare; balance on shared panels). All three routes flagged `cmc-page--bounded`. Viewport containment for Sheet portal verified by `v13-portal-containment.spec.ts` (3 → 6 chrome walks including TimePicker popover, RefreshDropdown menu, sonner Toaster). |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact                                                                  | Expected                                                                | Status     | Details                                                                                               |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| `frontend/src/components/time/TimePicker.tsx`                             | Radix Popover + presets + custom calendar + Cmd+Shift+C/V hotkeys      | VERIFIED   | 143 LOC. Imported in `AppShellHeader.tsx:41`; rendered at line 51.                                    |
| `frontend/src/components/time/PresetList.tsx`                             | 13 presets in 3 groups                                                  | VERIFIED   | 105 LOC. Imported by TimePicker.                                                                      |
| `frontend/src/components/time/CustomRangeCalendar.tsx`                    | react-day-picker dual-month calendar                                    | VERIFIED   | 45 LOC. Imported by TimePicker.                                                                       |
| `frontend/src/components/time/RefreshDropdown.tsx`                        | Radix DropdownMenu, off/30s/1m/5m, Paused, active pulse                 | VERIFIED   | 116 LOC. Imported in `AppShellHeader.tsx:42`; rendered at line 52.                                    |
| `frontend/src/components/time/AutoRefreshController.tsx`                  | Zero-render effect: setInterval + queryClient.invalidateQueries        | VERIFIED   | 78 LOC. Imported in `AppShell.tsx:13`; rendered at line 82.                                            |
| `frontend/src/components/time/ChartBrushController.tsx`                   | useChartBrush hook returning onDragEnd                                  | VERIFIED   | 68 LOC. Imported in `ChartsStrip.tsx:31`; called at line 43.                                          |
| `frontend/src/components/ui/ResetZoomButton.tsx`                          | Visible only when time_from is ISO; clears URL                          | VERIFIED   | 45 LOC. Rendered in `ChartsStrip.tsx:47`.                                                              |
| `frontend/src/components/time/CompareToggle.tsx`                          | Per-panel CSV CompareToggle (TIME-04)                                   | VERIFIED   | 102 LOC. Imported in `TokenUsageCard.tsx:47`; rendered at line 114.                                   |
| `frontend/src/components/recents/RecentRoutesTracker.tsx`                 | Zero-render effect pushing to cmc.recents.routes                        | VERIFIED   | 58 LOC. Imported in `AppShell.tsx:12`; rendered at line 71.                                            |
| `frontend/src/components/recents/RecentlyVisitedSection.tsx`              | Sidebar section; top 3 filtered-by-current; always renders header       | VERIFIED   | 110 LOC. Imported in `Sidebar.tsx:69`; rendered at line 167.                                          |
| `frontend/src/lib/time/grafanaSyntax.ts`                                  | Pure regex parser for now-Nu shorthand                                  | VERIFIED   | 39 LOC.                                                                                               |
| `frontend/src/lib/time/coerce.ts`                                         | ISO/Grafana → Date with date-fns                                        | VERIFIED   | 78 LOC.                                                                                               |
| `frontend/src/lib/time/rangeToVocab.ts`                                   | LOAD-BEARING bridge: URL token → backend Range vocab                    | VERIFIED   | 51 LOC. Consumed by `useRouteRange.ts:33+42`.                                                          |
| `frontend/src/lib/time/clipboard.ts`                                      | serializeRange + parseRangeFromText                                     | VERIFIED   | 30 LOC. Used by both TimePicker (line 21) and CommandPalette (line 90).                               |
| `frontend/src/lib/time/useRouteRange.ts`                                  | Hook: URL → backend Range with per-route default at READ site           | VERIFIED   | 43 LOC. Consumed by 9 panels on / + UnifiedFailures + SessionsTable on /activity + TokenUsageCard.   |
| `frontend/src/lib/recents.ts`                                             | FIFO ring (cap 20) with head-dedupe + getRecentRoutes/clearRecentRoutes | VERIFIED   | 76 LOC. Consumed by RecentRoutesTracker + RecentlyVisitedSection + CommandPalette.                    |
| Append-only validateSearch on /, /activity, /sessions/compare              | time_from?, time_to?, compare_panels? — defaults undefined per Pitfall 13 | VERIFIED   | All three route files import `asTimeToken` + `asComparePanels` and add the 3 search fields. SCHEMA_VERSION unchanged. |
| `frontend/src/components/ui/CommandPalette.tsx` Recents/Time-range/Density groups | 6-group JSX order Recents→SavedViews→Pages→Time range→Density→Actions | VERIFIED   | Lines 510, 563, 588, 623, 665, 678 — exactly 6 `Command.Group` declarations in that order.            |
| 21 panels migrated to `bounded` mode                                       | BoundedPanelCard adoption on / + /activity + /sessions/compare         | VERIFIED   | 27 `bounded` occurrences across panels/*.tsx (15 on /, 6 on /activity + shared, +TokenUsageCard, +SessionCompareView, +SessionsTable, +UnifiedFailures); 3 routes flagged `cmc-page--bounded`. |
| TokenUsageCard prior-period overlay (TIME-04)                              | Bar with stackId='prior', dataKey='prior_total', fillOpacity=0.25      | VERIFIED   | `TokenUsageCard.tsx:121-166` merges `prior_total` into chart data and renders the Bar; gated on `compare_panels` CSV containing the panel id AND range='7d'. |
| `frontend/tests/e2e/v13-time-picker.spec.ts`                              | 19 NEW tests covering TIME-01..05 + CMDK-02..04 + SHEL-05 + group order | VERIFIED   | 496 LOC, 19 `test(` blocks counted.                                                                    |
| 30 NEW visual-capture PNGs in phase visual-check dir                       | 5 chrome surfaces × 3 densities × 2 themes                              | VERIFIED   | `ls visual-check/ | wc -l` = 30.                                                                       |

### Key Link Verification

| From                                 | To                                       | Via                                                              | Status | Details                                                                                              |
| ------------------------------------ | ---------------------------------------- | ---------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| AppShellHeader                       | TimePicker / RefreshDropdown            | direct mount (lines 51-52)                                       | WIRED  | Imported lines 41-42; mounted top of `header` row.                                                   |
| AppShell                             | AutoRefreshController                    | zero-render mount (line 82)                                       | WIRED  | Imported line 13; rendered as sibling of other zero-render effects.                                  |
| AppShell                             | RecentRoutesTracker                      | zero-render mount (line 71)                                       | WIRED  | Imported line 12.                                                                                    |
| Sidebar                              | RecentlyVisitedSection                   | direct mount (line 167)                                          | WIRED  | Imported line 69, passes `collapsed` prop.                                                            |
| TimePicker (Cmd+Shift+C/V)           | clipboard helpers                        | serializeRange + parseRangeFromText + asTimeToken                | WIRED  | Lines 21-22 imports; lines 82-101 call sites.                                                         |
| TimePicker / CommandPalette          | URL writes                               | useNavigate + function-form search                                | WIRED  | Pitfall 4 honored; same code path on both surfaces — Cmd+K is a genuine second access path.          |
| ChartsStrip Brush.onDragEnd          | URL absolute ISO write                   | useChartBrush hook navigate()                                     | WIRED  | `ChartBrushController.tsx:54-62`.                                                                      |
| ResetZoomButton click                | URL clear                                | navigate with time_from/time_to: undefined                        | WIRED  | `ResetZoomButton.tsx:22-30`.                                                                          |
| AutoRefreshController setInterval    | queryClient invalidate                   | predicate isTimeAnchoredKey                                       | WIRED  | `AutoRefreshController.tsx:66-70`; predicate exported from `lib/queries.ts`.                          |
| CompareToggle URL write              | TokenUsageCard prior-period query        | useRouterState.search.compare_panels CSV                          | WIRED  | `TokenUsageCard.tsx:67-90` reads CSV; gates priorQuery; merges `prior_total` into chartData.         |
| CommandPalette Density               | setDensity (no React Context)            | direct lib/density.ts call                                        | WIRED  | `CommandPalette.tsx:480-486`; Pitfall 3 lock honored.                                                  |
| CommandPalette Recents               | getRecentRoutes + getAllRecentStates     | direct lib calls memoized on pathname                             | WIRED  | `CommandPalette.tsx:397-403`.                                                                          |

### Data-Flow Trace (Level 4)

| Artifact                        | Data Variable           | Source                                                                 | Produces Real Data | Status      |
| ------------------------------- | ----------------------- | ---------------------------------------------------------------------- | ------------------ | ----------- |
| TimePicker label                | `timeFrom`/`timeTo`     | `useRouterState({ select: s => s.location.search })`                   | Yes (URL truth)    | FLOWING     |
| RefreshDropdown active/paused   | `interval` + `timeFrom` | localStorage `cmc.autoRefresh.interval` + URL search                   | Yes                | FLOWING     |
| AutoRefreshController invalidations | tick handle             | window.setInterval + queryClient.invalidateQueries on predicate         | Yes                | FLOWING     |
| Panel re-queries on URL change  | `effectiveRange`        | `useRouteRange()` → `rangeToVocab()` → backend Range vocab → useTokens(range) | Yes                | FLOWING     |
| ChartsStrip brush commit        | `startIndex`/`endIndex` → ISO | `useChartBrush({ data })` from sliced 14-day rows                 | Yes                | FLOWING     |
| ResetZoomButton visibility       | `isZoomed`               | `ISO_RE.test(timeFrom)`                                                | Yes                | FLOWING     |
| RecentlyVisitedSection rows      | `top3`                   | `getRecentRoutes()` from localStorage ring                              | Yes                | FLOWING     |
| Cmd+K Recents items              | `recentRoutes`/`recentAdHocStates` | `getRecentRoutes()` + `getAllRecentStates()` memoized on pathname | Yes                | FLOWING     |
| TokenUsageCard prior overlay     | `prior_total`            | `useTokens('30d')` slice `[-14, -7)` merged into chartData              | Yes                | FLOWING     |

### Behavioral Spot-Checks

| Behavior                                                            | Command                                                                                  | Result                                  | Status |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------- | ------ |
| TimePicker file substantive (>= 100 LOC, contains Popover + presets)| `wc -l + grep "Popover\|PresetList\|CustomRangeCalendar"`                                | 143 LOC, all three references present  | PASS   |
| Append-only URL contract docs/tests still pass                       | Quoted in VISUAL-CHECK.md: `backend pytest test_url_contract.py 2/2 PASS`                | 2/2 PASS                                | PASS   |
| Cmd+K 6-group JSX order                                              | Count `Command.Group heading=` in CommandPalette.tsx                                     | 6 groups in the locked order            | PASS   |
| 19 v13-time-picker spec tests exist                                  | `grep -E "^\s*test\(" frontend/tests/e2e/v13-time-picker.spec.ts | wc -l`                | 19                                      | PASS   |
| 30 NEW visual-capture PNGs                                           | `ls visual-check/ | wc -l`                                                              | 30                                      | PASS   |
| ResponsiveContainer count preserved (Phase 24 lock)                  | VISUAL-CHECK.md line 44 + Plan 09 SUMMARY                                                | 26 (preserved)                          | PASS   |
| `useRouteRange` consumed by panels (TIME-02 bridge)                  | `grep -rn "useRouteRange" src/components/panels`                                         | TokenUsageCard + 9+ panels consume it   | PASS   |
| Operator verdict signed PASS                                         | VISUAL-CHECK.md line 353-354 + line 399                                                  | "PASS signed by Patryk Golabek on 2026-05-13" | PASS   |

### Requirements Coverage

| Requirement | Source Plan              | Description                                                                                                 | Status     | Evidence                                                                                                          |
| ----------- | ------------------------ | ----------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| SHEL-05     | Plan 04                  | Sidebar "Recently visited" auto-tracks last 5 routes/views                                                  | SATISFIED  | RecentRoutesTracker.tsx + RecentlyVisitedSection.tsx + lib/recents.ts + Sidebar.tsx:167                            |
| TIME-01     | Plan 03                  | Global time picker in top bar + auto-refresh selector (off/30s/1m/5m)                                       | SATISFIED  | TimePicker + RefreshDropdown + AutoRefreshController mounted in AppShellHeader + AppShell                          |
| TIME-02     | Plans 02 + 03 + 08       | All time-anchored panels sync via validateSearch time params; opt-outs clean                                 | SATISFIED  | Append-only validators on 3 routes; useRouteRange bridge consumed by panels; OtelPanel opts out via Card direct    |
| TIME-03     | Plan 03                  | Cmd+Shift+C/V copy/paste time-range hotkeys (Grafana convention)                                            | SATISFIED  | TimePicker.tsx:72-110 window-level keydown + clipboard.ts serialize/parse + asTimeToken DiD                       |
| TIME-04     | Plan 07                  | Compare-to-previous overlay toggle                                                                          | SATISFIED  | CompareToggle.tsx + asComparePanels validator + TokenUsageCard prior_total Bar overlay                            |
| TIME-05     | Plan 05                  | Brush-zoom on time-series; updates global picker                                                            | SATISFIED  | useChartBrush hook + ChartsStrip Brush wiring + ResetZoomButton chrome row + AutoRefreshController pause branch    |
| CMDK-02     | Plan 06 Task 2           | Set Density command with current-state indicator                                                            | SATISFIED  | CommandPalette.tsx:665-677 Density group; calls setDensity() direct (Pitfall 3 lock)                              |
| CMDK-03     | Plan 06 Task 1           | Time Range commands (1h/24h/7d/30d + Copy/Paste)                                                            | SATISFIED  | CommandPalette.tsx:623-658 Time range group; reuses lib/time/clipboard.ts                                          |
| CMDK-04     | Plan 06 Task 1           | Recent items group: last 5 routes + ad-hoc states                                                           | SATISFIED  | CommandPalette.tsx:510-562 Recents group; getRecentRoutes + getAllRecentStates                                     |

**9/9 active Phase 26 requirements SATISFIED.** No orphaned requirements: ROADMAP and REQUIREMENTS.md mapping tables both list the same nine REQ-IDs for Phase 26 (SHEL-05, TIME-01..05, CMDK-02..04).

### Anti-Patterns Found

| File                                  | Line | Pattern                          | Severity | Impact                                                                                                  |
| ------------------------------------- | ---- | -------------------------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| —                                     | —    | None blocking goal achievement   | —        | Spot-grep across all Phase 26 source files surfaced standard documented deviations (e.g. `as never` casts for TanStack Router runtime pathname/route strings — mirror of Plan 03 TimePicker), all of which are intentional and called out in plan SUMMARYs. No `TODO`/`FIXME`/`PLACEHOLDER`/stub returns found in Phase 26 source. |

### Human Verification Required

None outstanding. The operator (Patryk Golabek) signed the PASS verdict on 2026-05-13 in `26-VISUAL-CHECK.md` after live Chrome DevTools MCP verification of all 5 ROADMAP success criteria plus the 30-PNG visual matrix set-level approval (line 397-399).

### Gaps Summary

No gaps. Every must-have truth is achieved by substantive, wired, data-flowing code:

- **SC #1**: Global time picker + auto-refresh contract is end-to-end. TimePicker writes URL → useRouteRange + rangeToVocab translates → panels re-query via TanStack Query; RefreshDropdown persists choice and dispatches an event that AutoRefreshController listens for, which then invalidates all `isTimeAnchoredKey` queries on a tick. Pause-on-absolute is mirrored independently in both RefreshDropdown (visual) and AutoRefreshController (behavior) by reading the same URL state — no shared bridge needed.
- **SC #2**: Cmd+Shift+C/V hotkeys are bound at window level and route through serializeRange/parseRangeFromText, which preserves Grafana relative tokens (`now-7d`, `now-1h`) verbatim. Cross-route paste works because TimePicker reads `location.pathname` at call time and writes to whatever route is currently active.
- **SC #3**: Brush-zoom commits ABSOLUTE ISO `time_from`/`time_to` via `useChartBrush` → `navigate()`. Other panels on `/activity` re-anchor through the same URL → `useRouteRange` → query-key invalidation pipeline. ResetZoomButton appears conditionally when ISO is detected and clears both params.
- **SC #4**: Cmd+K palette declares all 6 groups in the locked JSX order (Pitfall 10), with Density calling `setDensity()` direct (Pitfall 3 lock, no Context bridge) and Time range commands reusing the same URL-write codepath as TimePicker — making Cmd+K a genuine second access path, not a parallel implementation.
- **SC #5**: All three high-traffic routes adopt `cmc-page--bounded`; 21 panels migrated to `BoundedPanelCard bounded` mode (15 on / + 6 on /activity + SessionCompareView). Long `session_id`/`cwd` surfaces wrap via TruncatedCell + CopyIconButton on both SessionCompareView (per-side header rows) and SessionsTable columns. Sheet portal containment verified by 6 portal-containment chrome walks.

Supporting evidence (already verified, used as confirmatory):
- Frontend vitest 610/0/0 (Phase 25 baseline 452 → +158)
- Playwright 207 tests (203 pass + 4 forward-compat skip); 19 NEW v13-time-picker.spec.ts tests pass
- Lighthouse 9/9 PASS at median; axe 39/39 PASS; portal containment 6/6 PASS; URL contract 2/2 PASS
- ResponsiveContainer count = 26 (Phase 24 lock preserved)
- 30 NEW visual-capture PNGs in `visual-check/`; 96 total v1.3 visual matrix
- Operator verdict PASS signed by Patryk Golabek on 2026-05-13

---

_Verified: 2026-05-13T14:38:43Z_
_Verifier: Claude (gsd-verifier)_
