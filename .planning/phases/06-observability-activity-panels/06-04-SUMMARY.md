---
phase: 06-observability-activity-panels
plan: 04
subsystem: ui
tags: [frontend, react, recharts, panels, activity-page, heatmap, sessions-table, vitest]

# Dependency graph
requires:
  - phase: 06-observability-activity-panels (06-01)
    provides: PanelCard / HeatmapGrid / DataTable / Button / RelativeTime ui primitives, useHeatmap / useTokens / useSessionsList query hooks, lib/api SessionListItemFull + HeatmapResponse types
  - phase: 06-observability-activity-panels (06-03)
    provides: TokenUsageCard.utils.ts groupTokensByDay (reused by ChartsStrip slice), Recharts ResponsiveContainer happy-dom width=0 mitigation pattern (assert on `.recharts-responsive-container` + sr-only fallback)
provides:
  - ActivityHeatmap (ACTV-01) — 30-day GitHub-style heatmap composing HeatmapGrid primitive + heatmapColorScale (5 buckets, blue progressive opacity)
  - ChartsStrip (ACTV-02) — 14-day Recharts BarChart sliced client-side from 30d response (sliceLast14Days)
  - SessionsTable (ACTV-06) — DataTable wrapper around /api/sessions with range/source/model filters + client-side search on session_id + cwd + Prev/Next pagination strip keyed off backend total
  - routes/activity.tsx wires the 3 live panels above the (still-present) PlaceholderCardGrid for ACTV-03/04/05
  - styles.css Wave-4 section: .cmc-charts-strip wrapper, .cmc-sessions-table-header / __field / __label, .cmc-sessions-table-pagination + __controls, .cmc-table input[type='text'] chrome
affects:
  - 06-05-PLAN.md (Wave 5 — fills ACTV-03 OtelPanel + ACTV-04 TopSkills v2 + ACTV-05 UnifiedFailures + DELETES PlaceholderCardGrid usage on /activity)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ChartsStrip overfetch+slice: backend Range Literal is closed-set; panels overfetch the next-largest range and slice client-side via a pure helper sibling (TokenUsageCard.utils reuse + ChartsStrip.utils delegate). Reusable for any future panel that needs a sub-range Recharts view."
    - "ActivityHeatmap color-bucket policy: 5 buckets keyed off var(--cmc-accent-blue) progressive opacity (0.25/0.45/0.7/1.0) — falls back to accent-blue ramp when no green-2..5 token ladder exists in styles.css. Locked single-helper ownership in ActivityHeatmap.utils.ts."
    - "SessionsTable header chrome via PanelCard.trailing: filter inputs + search input live in the trailing slot so the panel header pre-empts any page-level filter chrome. Reusable for any future paginated panel that wants its filters scoped to its own card boundary."
    - "Pagination strip below DataTable keyed off backend `total` (NOT in-memory filtered count) because client-side search narrows whatever the current page returned; backend has no `q=` param (RESEARCH §gotcha 9). Locked pattern for any future server-paginated + client-filtered table."

key-files:
  created:
    - frontend/src/components/panels/ActivityHeatmap.tsx
    - frontend/src/components/panels/ActivityHeatmap.utils.ts
    - frontend/src/components/panels/ChartsStrip.tsx
    - frontend/src/components/panels/ChartsStrip.utils.ts
    - frontend/src/components/panels/SessionsTable.tsx
    - frontend/src/components/panels/__tests__/ActivityHeatmap.test.tsx
    - frontend/src/components/panels/__tests__/ChartsStrip.test.tsx
    - frontend/src/components/panels/__tests__/SessionsTable.test.tsx
  modified:
    - frontend/src/components/panels/index.ts
    - frontend/src/routes/activity.tsx
    - frontend/src/styles.css

key-decisions:
  - "Field names: ACTV-06 SessionsTable binds the actual SessionListItemFull surface (`session_id`, `cwd`) — plan §Step 1 referenced `id` + `project` shorthand which never matched the backend SESS-01 response shape (Rule 1 inline correction)."
  - "Recharts ResponsiveContainer happy-dom width=0 mitigation reused in ChartsStrip test — assert on `.recharts-responsive-container` class + sr-only `<table>` fallback rather than inner SVG."
  - "ChartsStrip slice helper delegates to groupTokensByDay (Plan 06-03 utility) + slices the last 14 entries — single-source of token aggregation logic across both TokenUsageCard and ChartsStrip."
  - "Heatmap color tokens: blue progressive opacity (0.25/0.45/0.7/1.0) since styles.css has no green-2..5 token ladder; documented in ActivityHeatmap.utils.ts as the locked v1 ramp."

patterns-established:
  - "Pagination strip uses Button (Wave 1 ui primitive) NOT raw <button>: cmc-btn--ghost cmc-btn--sm for compact controls preserves hover lift + disabled styling without re-implementing CSS."
  - "Truncated session_id rendered as `r.session_id.slice(0, 8)` + U+2026 ellipsis text node — tests must read `.textContent.slice(0, 8)` since React produces two text nodes that break literal getByText matchers."
  - "Filter changes (range / source / model) reset page to 0 inline; search changes do NOT reset page (so an operator typing search after navigating to page 3 keeps their position)."

# Metrics
duration: ~13min
completed: 2026-04-27
---

# Phase 6 Plan 04: Activity Page Core Panels Summary

**ActivityHeatmap (ACTV-01) + ChartsStrip (ACTV-02) + SessionsTable (ACTV-06) shipped — 30-day session heatmap, 14-day client-side-sliced token chart, and paginated /api/sessions table with filters now live on /activity above the remaining ACTV-03/04/05 placeholders.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-04-27T12:24:00Z
- **Completed:** 2026-04-27T12:37:16Z
- **Tasks:** 2
- **Files modified:** 11 (8 created + 3 modified)

## Accomplishments

- ACTV-01 ActivityHeatmap: composes Wave-1 HeatmapGrid primitive + 5-bucket blue-opacity colorScale + tooltip per cell showing day + sessions + tokens_effective.
- ACTV-02 ChartsStrip: 14-day stacked Recharts BarChart sliced client-side from /api/usage/tokens?range=30d (backend Literal unchanged per RESEARCH §11 — no '14d' added).
- ACTV-06 SessionsTable: useSessionsList hook with snappy pagination via placeholderData (lib/queries.ts, owned by Wave 1) + client-side search on session_id + cwd + Range/Source/Model filter inputs in panel trailing.
- /activity route now renders ActivityHeatmap → ChartsStrip → SessionsTable above PlaceholderCardGrid (3 placeholders left for ACTV-03/04/05).
- Test count: 144 → 158 (+14 net): ActivityHeatmap 4, ChartsStrip 4, SessionsTable 6.

## Task Commits

Each task was committed atomically:

1. **Task 1: ActivityHeatmap + ChartsStrip (poll-based panels)** — `993d98c` (feat)
2. **Task 2: SessionsTable + routes/activity.tsx wiring** — `05032a3` (feat)

**Plan metadata:** `(this closing commit)` (docs: complete plan)

## Files Created/Modified

- `frontend/src/components/panels/ActivityHeatmap.tsx` — ACTV-01 panel, wraps HeatmapGrid + useHeatmap('30d')
- `frontend/src/components/panels/ActivityHeatmap.utils.ts` — heatmapColorScale (5 blue-opacity buckets)
- `frontend/src/components/panels/ChartsStrip.tsx` — ACTV-02 panel, 14-day Recharts BarChart
- `frontend/src/components/panels/ChartsStrip.utils.ts` — sliceLast14Days delegate over groupTokensByDay
- `frontend/src/components/panels/SessionsTable.tsx` — ACTV-06 panel, DataTable + filter chrome + pagination strip
- `frontend/src/components/panels/__tests__/ActivityHeatmap.test.tsx` — 4 tests (cell count, empty state, tooltip aria-label, color buckets)
- `frontend/src/components/panels/__tests__/ChartsStrip.test.tsx` — 4 tests (chart container, empty state, slice 14, slice <14)
- `frontend/src/components/panels/__tests__/SessionsTable.test.tsx` — 6 tests (50-row render, empty state, search filter, prev/next disabled, source filter refetch, next click)
- `frontend/src/components/panels/index.ts` — Wave-4 barrel section appended (3 names)
- `frontend/src/routes/activity.tsx` — ACTV-01/02/06 slots removed from ACTIVITY_SLOTS; live panels rendered above remaining 3-slot PlaceholderCardGrid
- `frontend/src/styles.css` — Wave-4 section appended: .cmc-charts-strip wrapper + SessionsTable header/pagination/input chrome

## Decisions Made

- **14-day slice happens client-side, no backend change.** /api/usage/tokens Range Literal stays {today, 7d, 30d} per RESEARCH §11. ChartsStrip overfetches 30d and ChartsStrip.utils.sliceLast14Days takes the last 14 distinct days from the groupTokensByDay output (delegates to TokenUsageCard.utils — single-source aggregation). Inline code comment in ChartsStrip.tsx flags the rationale.
- **SessionsTable uses placeholderData via lib/queries.useSessionsList.** No new keepPreviousData option introduced — Wave 1 already wired `placeholderData: (prev) => prev` on the hook. SessionsTable simply consumes it.
- **Pagination strip uses Button primitive, not raw `<button>`.** Provides cmc-btn--ghost cmc-btn--sm consistency + disabled styling out of the box. Plan §Step 1 said "Prev/Next buttons" without specifying primitive use; Wave-1 contract calls for ui-primitive imports so this aligns with the locked pattern.
- **Color ramp falls back to blue progressive opacity.** styles.css has no green-2..5 ladder (verified by grep). Plan §Step 1 explicitly authorized this fallback. Documented in ActivityHeatmap.utils.ts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SessionsTable column field names corrected to match SessionListItemFull**
- **Found during:** Task 2 (SessionsTable.tsx implementation)
- **Issue:** Plan §Step 1 wrote `r.id.slice(0, 8)` and `searchKeys=['id','project']`, but the SessionListItemFull / backend SESS-01 surface uses `session_id` and `cwd` (no `id`, no `project` field).
- **Fix:** Columns + searchKeys + cell renders use the real field names; Project column reads `r.cwd ?? '—'`.
- **Files modified:** frontend/src/components/panels/SessionsTable.tsx
- **Verification:** typecheck clean; SessionsTable test fixture uses real shape and passes
- **Committed in:** 05032a3 (Task 2 commit)

**2. [Rule 1 - Test infra] SessionsTable search test uses textContent.slice instead of getByText literal**
- **Found during:** Task 2 (SessionsTable test run)
- **Issue:** React renders `{r.session_id.slice(0, 8)}` and `{'\u2026'}` as two separate text nodes inside the `.cmc-mono` span; `screen.getByText('abc12345')` fails because RTL requires the full normalized text content (it would need to match `'abc12345…'` exactly).
- **Fix:** Test reads `.textContent.slice(0, 8)` from each first-column .cmc-mono span and compares the array to the expected prefix list. Pattern documented in patterns-established.
- **Files modified:** frontend/src/components/panels/__tests__/SessionsTable.test.tsx
- **Verification:** 6/6 SessionsTable tests pass
- **Committed in:** 05032a3 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug — wrong field names, 1 test infra — split text nodes)
**Impact on plan:** Both auto-fixes are corrections that keep the panel functioning against the real backend surface. No scope creep.

## Issues Encountered

None — plan landed cleanly in 2 commits with the 2 inline auto-fixes documented above.

## Threat Flags

None — no new network surface, auth path, file access pattern, or schema change introduced.

## Visual Smoke Notes

The dev server was not started for this plan because the user has not yet booted /activity in this session — the build step succeeded without errors and the next checkpoint (Plan 06-05 close-out) verifies /activity end-to-end against ROADMAP success criteria 1-5. Static smoke from production build (`npm run build`):
- dist/assets/activity-{hash}.js: 0.98 kB (route chunk for /activity)
- dist/assets/panels-{hash}.js: 415 kB (15 panels — Wave 2 + 3 + 4)
- No build warnings; chunk sizes match Wave-3 baseline +small Wave-4 additions

Expected runtime visuals (per plan §verification — to be confirmed in Plan 06-05 verifier):
- Top: ActivityHeatmap renders 30 cells in a tight grid; cell colors progress from surface-2 (zero) through 4 blue-opacity stops up to fully saturated accent-blue at the busiest day. Hover tooltip in JetBrains Mono shows "YYYY-MM-DD: N sessions, N tokens".
- Middle: ChartsStrip 14-day stacked bar chart full-width with 4 stack segments per day (input/output/cache_read/cache_create) using the same fill tokens as TokenUsageCard.
- Below: SessionsTable header chrome with Range select + Source / Model / Search text inputs; DataTable shows up to 50 rows; pagination strip "Page X of N (total)" with Prev/Next buttons (Prev disabled on page 0; Next disabled when offset+pageSize >= total).
- Bottom: PlaceholderCardGrid still rendering ACTV-03/04/05 placeholders with the cmc-card-grid responsive auto-fit layout from Plan 05-04.

## Next Phase Readiness

- Wave 5 (Plan 06-05) entry contract preserved:
  - panels barrel exports 18 names total: 4 (Wave 2) + 11 (Wave 3) + 3 (Wave 4 — ActivityHeatmap, ChartsStrip, SessionsTable). Wave 5 appends OtelPanel, TopSkillsCard, UnifiedFailuresCard.
  - routes/activity.tsx still imports PlaceholderCardGrid + ACTIVITY_SLOTS (now containing only ACTV-03/04/05 entries). Plan 06-05 replaces those last 3 slots with live panels and DELETES the PlaceholderCardGrid import + usage on /activity (mirrors what Plan 06-03 did to routes/index.tsx).
  - styles.css has Wave-4 section appended ending with `.cmc-table input[type='text']:focus-visible` block. Plan 06-05 appends its own Wave-5 section after.
- Phase 6 success criterion 5 ("Activity page shows 30-day heatmap, 14-day token charts, … sessions table with search/pagination") is 75% delivered by this plan; Plan 06-05 finishes "OTEL firehose with filtering" and unified failures view to close out the criterion.
- Frontend test baseline: 158 tests across 45 files. Backend unchanged at 202 tests.

## Self-Check: PASSED

Verified:
- Created files exist:
  - `frontend/src/components/panels/ActivityHeatmap.tsx` ✓
  - `frontend/src/components/panels/ActivityHeatmap.utils.ts` ✓
  - `frontend/src/components/panels/ChartsStrip.tsx` ✓
  - `frontend/src/components/panels/ChartsStrip.utils.ts` ✓
  - `frontend/src/components/panels/SessionsTable.tsx` ✓
  - `frontend/src/components/panels/__tests__/ActivityHeatmap.test.tsx` ✓
  - `frontend/src/components/panels/__tests__/ChartsStrip.test.tsx` ✓
  - `frontend/src/components/panels/__tests__/SessionsTable.test.tsx` ✓
- Commits exist in git log:
  - 993d98c (Task 1) ✓
  - 05032a3 (Task 2) ✓
- Test suite: 158/158 frontend ✓
- Typecheck: clean ✓
- Build: succeeds ✓

---
*Phase: 06-observability-activity-panels*
*Completed: 2026-04-27*
