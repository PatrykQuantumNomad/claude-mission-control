---
phase: 14-skills-api-page-panels
verified: 2026-05-03T07:30:00Z
status: human_needed
score: 5/5
overrides_applied: 0
human_verification:
  - test: "Navigate to /activity and confirm TopSkills panel renders with no 'Coming in v2' text; if skill data exists, rows appear with 14d/30d toggle and sparkline; empty state shows dataNoun caption"
    expected: "TopSkills panel displays real data from /api/skills/usage — no EmptyState placeholder"
    why_human: "Cannot verify visual rendering or live data flow programmatically without running the app"
  - test: "Navigate to /skills and confirm SkillCostCard (via SkillCostCardForTopSkill), SkillLatencyTable, and SkillTimeline all appear in the .cmc-card-grid; SkillTimeline has a filter input and pause/resume button"
    expected: "All three panels render; SkillCostCard shows 'Rates as of' caption and 'Attribution: request|session'; SkillLatencyTable shows sortable columns with Low sample badge on sub-30 skills"
    why_human: "Visual layout and live firehose stream cannot be verified programmatically"
  - test: "Navigate to /skills/analyze (or any known skill name), confirm the detail page renders with 3 sections: SkillCostCard + latency KpiTiles + SkillRunsTable; clicking a row opens the session drawer"
    expected: "Detail page loads without React errors; back-link to /skills is present; session drawer opens on row click"
    why_human: "Route rendering, drawer interaction, and browser console errors require manual check"
  - test: "Pause/resume test on SkillTimeline: click Pause — firehose stops updating; click Resume — events resume"
    expected: "useFirehose enabled prop toggles correctly; no new events appear while paused"
    why_human: "Real-time SSE behavior requires a running backend"
  - test: "Backend smoke: curl 'http://localhost:8788/api/skills/usage?range=2d' returns HTTP 422"
    expected: "422 Unprocessable Entity (Literal validation auto-422)"
    why_human: "Requires running backend server; integration test already covers this but human confirm closes the end-to-end gate (Plan 05 Task 3 checkpoint)"
---

# Phase 14: Skills API & Page Panels — Verification Report

**Phase Goal:** Reactivate v1.0 placeholder skill panels with real data and ship the full skills observability suite (frequency, cost, latency, timeline) plus a per-skill detail route.
**Verified:** 2026-05-03T07:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can hit GET /api/skills/usage?range=14d\|30d, GET /api/skills/{name}/cost, /latency, /runs and receive real data | VERIFIED | All 4 endpoints present in `backend/cmc/api/routes/skills.py:280-798`; 33 tests pass (including `test_skills_usage_top_n_with_sparkline`, `test_skill_cost_request_path_when_request_id_present`, `test_skill_latency_percentiles_basic`, `test_skill_runs_recent_ordered_desc`) |
| 2 | User can see TopSkills panel on /activity with top-N + 14d/30d toggle + sparkline + drill-in to /skills/$name | VERIFIED | `frontend/src/components/panels/TopSkills.tsx` fully rewritten; mounted at `routes/activity.tsx:46`; uses `useSkillUsage(range, 10)`; Link to `/skills/$name` present; no "Coming in v2" text |
| 3 | User can see SkillCostCard on /skills rendering tokens + dollars + cache split + 14-day trend + "Rates as of" caption | VERIFIED | `SkillCostCard.tsx` fully rewritten; `useSkillCost` wired; `Rates as of {data.rates_as_of}` at line 100; `Attribution: {data.cost_attribution}` at line 102; sourced from `/api/skills/{name}/cost` |
| 4 | User can see SkillLatencyTable (sortable, server-driven low_sample badge) + SkillTimeline (useFirehose bare event + pause/resume + filter) | VERIFIED | `SkillLatencyTable.tsx` uses `useQueries` from `@tanstack/react-query`; `Badge variant="warning"` wired to `latency.low_sample`; no `MIN_LATENCY_SAMPLES` frontend constant; `SkillTimeline.tsx` uses `eventName: 'skill_activated'` (BARE+camelCase); pause/resume + filter implemented |
| 5 | User can navigate to /skills/$name and see per-skill cost + latency + recent runs | VERIFIED | `frontend/src/routes/skills_.$name.tsx` exists with `createFileRoute('/skills_/$name')`; public URL `/skills/$name` confirmed in `routeTree.gen.ts:34`; 3 sections: SkillCostCard + SkillLatencySnapshot + SkillRunsTable; SessionsDetailsSheet drawer wired (D-09) |

**Score:** 5/5 truths VERIFIED

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/cmc/api/schemas/skills.py` | SkillRange + 5 response models + SkillSparklineRow + SkillRunRow | VERIFIED | `SkillRange`, `SkillSparklineRow`, `SkillUsageRow`, `SkillUsageResponse`, `SkillCostResponse`, `SkillLatencyResponse`, `SkillRunRow`, `SkillRunsResponse` all present at lines 30-167 |
| `backend/cmc/api/routes/skills.py` | 4 new path operations | VERIFIED | `skills_usage` (line 280), `skill_runs` (line 324), `skill_cost` (line 631), `skill_latency` (line 746) all present |
| `backend/cmc/api/sse.py` | payload includes `attrs_skill_name` | VERIFIED | Line 70: `"attrs_skill_name": row.attrs_skill_name,` present in json.dumps payload |
| `backend/tests/test_skills_router.py` | Coverage for 4 endpoints + SSE regression | VERIFIED | 33 tests in file; `test_skills_usage_top_n_with_sparkline`, `test_skill_cost_*`, `test_skill_latency_*`, `test_skill_runs_*`, `test_sse_firehose_includes_attrs_skill_name` all present; all 33 pass |
| `frontend/src/lib/api.ts` | SkillRange + 7 interfaces + 4 fetchers | VERIFIED | `type SkillRange` at line 16; interfaces at lines 433-486; `fetchSkillUsage`, `fetchSkillCost`, `fetchSkillLatency`, `fetchSkillRuns` confirmed at lines 1088-1090+ |
| `frontend/src/lib/queries.ts` | 4 hooks + 4 qk entries | VERIFIED | `qk.skillUsage`, `qk.skillCost`, `qk.skillLatency`, `qk.skillRuns` at lines 87-93; `useSkillUsage`, `useSkillCost`, `useSkillLatency`, `useSkillRuns` at lines 229-256+ |
| `frontend/src/lib/useFirehose.ts` | OtelEvent.attrs_skill_name field | VERIFIED | Line 32: `attrs_skill_name: string \| null` present |
| `frontend/src/components/panels/TopSkills.tsx` | Reactivated, min_lines 60 | VERIFIED | 165 lines; `useSkillUsage` at line 87; `to="/skills/$name"` at line 53; no placeholder |
| `frontend/src/components/panels/SkillCostCard.tsx` | Reactivated, no placeholder | VERIFIED | 109 lines; `useSkillCost` at line 45; `Rates as of` at line 100; `cost_attribution` at line 102 |
| `frontend/src/components/panels/SkillLatencyTable.tsx` | NEW, min_lines 70 | VERIFIED | 186 lines; `useQueries` imported and used (6 occurrences); `Badge variant="warning"` at line 61 |
| `frontend/src/components/panels/SkillTimeline.tsx` | NEW, min_lines 70 | VERIFIED | 133 lines; `eventName: 'skill_activated'` at line 41; pause/resume + filter implemented |
| `frontend/src/components/panels/index.ts` | Exports SkillLatencyTable + SkillTimeline + SkillRunsTable | VERIFIED | Lines 39-43: all three exported |
| `frontend/src/routes/skills.tsx` | Wires SkillLatencyTable + SkillTimeline + SkillCostCardForTopSkill wrapper | VERIFIED | `SkillCostCardForTopSkill` at lines 47-64 short-circuits to empty PanelCard (not `'(none)'`); `SkillLatencyTable` and `SkillTimeline` in `.cmc-card-grid` at lines 93-94 |
| `frontend/src/routes/skills_.$name.tsx` | NEW dynamic route (underscore flat-routing) | VERIFIED | `createFileRoute('/skills_/$name')` at line 174; 3 sections composed; D-09 Sheet drawer wired |
| `frontend/src/components/panels/SkillRunsTable.tsx` | NEW, Sheet drawer | VERIFIED | 290 lines; `useSkillRuns` at line 213; `Sheet` at line 273 |
| `frontend/src/routeTree.gen.ts` | Regenerated with /skills/$name | VERIFIED | `path: '/skills/$name'` at line 34; `grep -cF '$name'` = 13 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `backend/cmc/api/routes/skills.py` | `cmc.pricing.compute_cost` | Decimal cost compute | VERIFIED | Line 59 import; lines 697, 714 calls |
| `backend/cmc/api/routes/skills.py` | `otel_events.attrs_skill_name` (indexed) | `attrs_skill_name = :name` | VERIFIED | Lines 274, 397, 458 in SQL constants |
| `backend/cmc/api/routes/skills.py (skill_cost)` | `otel_events (event_name='api_request')` | Self-JOIN on (session_id, request_id) | VERIFIED | `WHERE o.event_name = 'api_request'` at lines 428, 510 |
| `backend/cmc/api/sse.py` | `OtelEvent.attrs_skill_name` column | `row.attrs_skill_name` in json.dumps | VERIFIED | Line 70 in sse.py |
| `frontend/src/lib/queries.ts` | `frontend/src/lib/api.ts (fetchers)` | `queryFn: () => fetchSkillUsage(range, limit)` | VERIFIED | Lines 229-256 hooks call fetchers |
| `frontend/src/lib/api.ts` | `/api/skills/usage` and `/api/skills/{name}/*` | `fetchJson via api.*` | VERIFIED | Lines 885-898 in api.ts; encodeURIComponent used |
| `frontend/src/lib/useFirehose.ts` | backend SSE payload | `JSON.parse(event.data)` yields `attrs_skill_name` | VERIFIED | OtelEvent interface line 32 |
| `TopSkills.tsx` | `useSkillUsage` | Hook call at line 87 | VERIFIED | `const query = useSkillUsage(range, 10)` |
| `TopSkills.tsx` | `/skills/$name` Link | `<Link to="/skills/$name" params={{name}}>` | VERIFIED | Line 52-57 |
| `SkillCostCard.tsx` | `useSkillCost` | Line 45 | VERIFIED | `const query = useSkillCost(name, range)` |
| `SkillLatencyTable.tsx` | `useQueries` + `fetchSkillLatency` | Fan-out per row | VERIFIED | Lines 121-133; `useQueries` from `@tanstack/react-query` |
| `SkillTimeline.tsx` | `useFirehose` | `{ eventName: 'skill_activated', enabled: !paused }` | VERIFIED | Lines 40-43 |
| `routes/skills.tsx` | `SkillLatencyTable + SkillTimeline + SkillCostCard` | Import + JSX | VERIFIED | Lines 33-43 imports; lines 92-94 JSX |
| `routes/skills_.$name.tsx` | `useParams({ from: '/skills_/$name' })` | TanStack Router params extraction | VERIFIED | Line 142 |
| `routes/skills_.$name.tsx` | `SkillCostCard + SkillRunsTable` | Imports from panels | VERIFIED | Lines 34-36 |
| `SkillRunsTable.tsx` | `useSkillRuns` | Line 213 | VERIFIED | `const query = useSkillRuns(name, 25)` |
| `SkillRunsTable.tsx` | `Sheet` (SessionsDetailsSheet pattern) | `useState<string|null>` + `Sheet open={Boolean(openSid)}` | VERIFIED | Lines 214, 273-282 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `SkillCostCard.tsx` | `data.cost_usd` | `useSkillCost` → `/api/skills/{name}/cost` → `compute_cost()` | Yes — DB query + Decimal compute | FLOWING |
| `SkillLatencyTable.tsx` | `tableRows` | `useQueries` fan-out → `/api/skills/{name}/latency` → window-CTE SQL | Yes — percentile CTE queries otel_events | FLOWING |
| `SkillTimeline.tsx` | `filtered` | `useFirehose` → SSE `/api/firehose` → `tail_otel_events` | Yes — polls otel_events DB | FLOWING |
| `TopSkills.tsx` | `data.rows` | `useSkillUsage` → `/api/skills/usage` → `_USAGE_TOP_SQL` | Yes — groups otel_events by skill_name | FLOWING |
| `SkillRunsTable.tsx` | `data.rows` | `useSkillRuns` → `/api/skills/{name}/runs` → `_RUNS_SQL` | Yes — LEFT JOIN otel_events + sessions | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Decimal-as-string invariant | `python -c "...SkillCostResponse(...).model_dump_json()...assert '\"cost_usd\":\"1.234\"'"` | `Decimal-as-string OK` | PASS |
| Schema importability | `from cmc.api.schemas.skills import SkillRange, SkillUsageResponse, SkillCostResponse, SkillLatencyResponse, SkillRunsResponse` | No errors | PASS |
| Backend skills router tests | `pytest tests/test_skills_router.py` | `33 passed` | PASS |
| Full backend test suite | `pytest` | `463 passed` | PASS |
| TypeScript check | `pnpm tsc --noEmit` | Exit 0 (no output) | PASS |
| Phase 14 panel tests | `pnpm vitest run` (5 skill panel test files) | `24 passed` | PASS |
| Full frontend test suite | `pnpm vitest run` | `255 passed, 1 failed` | INFO — 1 pre-existing failure in `SchedulesCard.test.tsx` (stale-row class test, unrelated to Phase 14) |
| routeTree $name token | `grep -cF '$name' frontend/src/routeTree.gen.ts` | `13` | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| SKIL-04 | 14-01, 14-02, 14-03 | GET /api/skills/usage?range top-N + sparkline | SATISFIED | Endpoint at routes/skills.py:280; D-01 deviation documented; 4 tests |
| SKIL-05 | 14-01, 14-02, 14-04 | GET /api/skills/{name}/cost Decimal + dual-path + trend | SATISFIED | Endpoint at routes/skills.py:631; dual-path SQL present; test_skill_cost_* suite |
| SKIL-06 | 14-01, 14-02, 14-04 | GET /api/skills/{name}/latency window-CTE percentiles + low_sample | SATISFIED | `_LATENCY_SQL` at skills.py:558; `MIN_LATENCY_SAMPLES=30` at line 368; `test_skill_latency_percentiles_basic` |
| SKIL-07 | 14-01, 14-02, 14-05 | GET /api/skills/{name}/runs recent invocations + cwd LEFT JOIN | SATISFIED | Endpoint at routes/skills.py:324; `_RUNS_SQL` with LEFT JOIN sessions |
| ACTV-04 | 14-03 | TopSkills panel on /activity with top-N + sparkline + drill-in | SATISFIED | TopSkills.tsx fully rewritten; mounted in activity.tsx:46; no placeholder |
| SKLP-02 | 14-04 | SkillCostCard on /skills with tokens + dollars + trend + Rates-as-of | SATISFIED | SkillCostCard.tsx fully rewritten; SkillCostCardForTopSkill wrapper in skills.tsx |
| SKLP-05 | 14-04 | SkillLatencyTable sortable + server-driven low_sample badge | SATISFIED | SkillLatencyTable.tsx with useQueries + Badge variant="warning" wired to response.low_sample |
| SKLP-06 | 14-04 | SkillTimeline live useFirehose + pause/resume + filter | SATISFIED | SkillTimeline.tsx with eventName='skill_activated' (BARE), pause/resume, skill filter |
| SKLP-07 | 14-05 | /skills/$name detail route with cost + latency + runs | SATISFIED | skills_.$name.tsx with 3-section composition; routeTree.gen.ts regenerated |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `SkillTimeline.tsx` | 70 | `placeholder="filter skill_name…"` | Info | HTML input placeholder attribute — not a code placeholder. Not a stub. |
| `SkillRunsTable.tsx` | 130 | `placeholder="Type a follow-up…"` | Info | HTML textarea placeholder attribute — not a code placeholder. Not a stub. |
| `frontend vitest` | SchedulesCard.test.tsx | 1 pre-existing failing test (stale-row class) | Warning | Unrelated to Phase 14; pre-dates this phase; 0 Phase 14 tests failing |

### Phase 13 Lock Compliance

| Lock | Description | Status | Evidence |
|------|-------------|--------|---------|
| Decimal-as-JSON-string | `cost_usd: Decimal` in backend; `cost_usd: string` in frontend; no float coercion | VERIFIED | `SkillCostResponse.cost_usd: Decimal` (schemas/skills.py:128); `cost_usd: string` (api.ts:459); runtime assertion passes |
| Range Literal 422 | `?range=2d` returns 422 | VERIFIED | `test_skills_usage_invalid_range_returns_422`, `test_skill_cost_invalid_range_returns_422`, `test_skill_latency_invalid_range_returns_422` all exist and pass |
| No `$` stored in DB | Read-time `compute_cost()` | VERIFIED | All cost endpoints call `compute_cost()` at routes/skills.py:697,714 |
| BARE event_name | SQL uses `'skill_activated'` not prefixed | VERIFIED | Lines 237, 273, 396, 458 in skills.py; comment at line 225 |
| `attrs_skill_name` indexed column | Queried directly, not re-extracted from JSON | VERIFIED | All SQL WHERE clauses use `o.attrs_skill_name = :name` directly |
| Pricing freshness gate | `cmc doctor` checks #9-14 still exist | VERIFIED | doctor.py:651-656 lists all 6 checks; `_check_pricing_freshness` at line 347 unchanged |
| SkillCostCardForTopSkill hotfix | Wrapper renders empty PanelCard when no top skill, NOT `SkillCostCard name="(none)"` | VERIFIED | skills.tsx:51-61: `if (!topName)` returns empty PanelCard shell |

### Human Verification Required

#### 1. End-to-End Visual Verification (Plan 05 Task 3 Checkpoint)

**Test:** Start backend (`cd backend && .venv/bin/uvicorn cmc.api.app:app --reload --port 8788`) and frontend (`cd frontend && pnpm dev`). Navigate through:
- `/activity` — TopSkills panel renders without "Coming in v2" text
- `/skills` — SkillCostCard, SkillLatencyTable, SkillTimeline all appear in the grid
- `/skills/analyze` (or any name) — Detail page shows 3 sections; back-link to /skills present; row click opens drawer
- Cross-link: click a TopSkills row → should land on `/skills/$name`

**Expected:** No React console errors; all panels render their real-data or empty-state branches cleanly; SkillTimeline pause/resume works

**Why human:** Visual layout, live SSE streaming, browser console error detection, and drawer interaction are not verifiable programmatically.

#### 2. Backend Endpoint Smoke

**Test:** `curl -s 'http://localhost:8788/api/skills/usage?range=2d'` should return 422; `curl -s 'http://localhost:8788/api/skills/test-skill/cost?range=14d' | jq .cost_attribution` should return `"request"` or `"session"` (not null).

**Expected:** 422 for invalid range; valid JSON with `cost_attribution` field for any skill name (even with 0 data)

**Why human:** Requires a running backend server; integration tests cover this but the Plan 05 Task 3 checkpoint specifically requires human sign-off.

### Gaps Summary

No automated gaps found. All 5 roadmap success criteria are VERIFIED against the codebase. The one pre-existing frontend test failure (`SchedulesCard.test.tsx — stale row class`) predates Phase 14 and is unrelated to any Phase 14 deliverable. Phase 14's 24 dedicated panel tests all pass.

The `human_needed` status is driven by Plan 05's mandatory Task 3 human checkpoint (the plan explicitly marks it as `type="checkpoint:human-verify" gate="blocking"`) — this is expected, not a deficiency. The automated evidence is complete.

---

_Verified: 2026-05-03T07:30:00Z_
_Verifier: Claude (gsd-verifier)_
