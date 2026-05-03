---
phase: 14-skills-api-page-panels
plan: 01
subsystem: api
tags: [fastapi, pydantic-v2, decimal, sqlalchemy, sqlite, skills, percentile-cte, request-scoped-attribution, dual-path]

# Dependency graph
requires:
  - phase: 13-cost-foundation-skill-ingest
    provides: "compute_cost (Decimal math), load_rates, otel_events.attrs_skill_name indexed column, BUG-A json_each canon, db_session/seed_pricing fixtures"
  - phase: 12-spike
    provides: "SPIKE.md LOCK-1 (BARE event_name post prefix-strip), LOCK-3 (duration_ms TENTATIVE), LOCK-5 (session.id dotted), LOCK-8 (status union), LOCK-9 (request_id TENTATIVE on skill_activated)"
provides:
  - "GET /api/skills/usage?range=14d|30d&limit=10 — top-N skills by invocation count + per-day sparkline (SKIL-04)"
  - "GET /api/skills/{name}/cost?range=14d|30d — Decimal-as-JSON-string cost_usd + cost_attribution: 'request'|'session' + 14-day daily cost trend + rates_as_of (SKIL-05)"
  - "GET /api/skills/{name}/latency?range=14d|30d — p50/p95/max + error_rate + sample_count + low_sample (SKIL-06)"
  - "GET /api/skills/{name}/runs?limit=20 — recent invocations ordered ts DESC with cwd LEFT JOIN sessions (SKIL-07)"
  - "SSE firehose payload extended with attrs_skill_name (enables Plan 04 SkillTimeline)"
  - "MIN_LATENCY_SAMPLES=30 surfaced as server-side low_sample bool (SKLP-05 source of truth)"
affects: [14-02 (frontend api.ts/queries), 14-03 (TopSkills + SkillCostCard panels), 14-04 (SkillLatencyTable + SkillTimeline panels), 14-05 (/skills/$name detail route)]

# Tech tracking
tech-stack:
  added: []  # Pure read-only endpoints — no new dependencies; reuses Phase 13 stack.
  patterns: [
    "Dual-path attribution (request-scoped JOIN + session-scoped fallback) with cost_attribution field on response",
    "SQLite window-CTE percentile adapted from observability._TOOL_LATENCY_SQL for skill latency",
    "Trend SQL derives from SELECTED branch (Decimal sum invariant: sum(trend.daily_cost) == cost_usd)",
    "Server-side low_sample threshold (MIN_LATENCY_SAMPLES=30) — server is source of truth, frontend re-asserts for defense-in-depth",
    "SSE payload extension pattern (one-line addition + regression test) for firehose-consuming panels",
    "_RANGE_TO_DAYS / _range_start helpers COPIED (not imported) across router files to keep them independent",
  ]

key-files:
  created:
    - .planning/phases/14-skills-api-page-panels/14-01-SUMMARY.md
  modified:
    - backend/cmc/api/schemas/skills.py (5 new response models + SkillRange + helper rows)
    - backend/cmc/api/routes/skills.py (4 new path operations + 6 SQL constants + MIN_LATENCY_SAMPLES + dual-path handler)
    - backend/cmc/api/sse.py (one-line attrs_skill_name addition to tail_otel_events payload)
    - backend/tests/test_skills_router.py (25 new tests across all three tasks)
    - .planning/REQUIREMENTS.md (SKIL-04 line — already updated by planner; verified + committed)
    - .planning/ROADMAP.md (Phase 14 SC#1 — already updated by planner; verified + committed)

key-decisions:
  - "D-01: SKIL-04 lives at /api/skills/usage (NOT /api/skills?range=) to preserve the existing catalog endpoint consumed by SkillsRegistry.tsx — REQUIREMENTS.md SKIL-04 + ROADMAP.md Phase 14 SC#1 carry the deviation annotation"
  - "D-02: skill_cost ships dual-path attribution (request-scoped JOIN + session-scoped fallback). cost_attribution: 'request'|'session' field exposes which branch produced the numbers. Defensive against TENTATIVE LOCK-9 — no live-data probe needed because the dual-path handles either outcome"
  - "D-03: latency SQL filters WHERE duration_ms IS NOT NULL; sample_count=0 returns 200 with all None + low_sample=true (NOT 500). Defensive against TENTATIVE LOCK-3 — empty-state UI, not failure"
  - "D-04: MIN_LATENCY_SAMPLES=30 is server-side source of truth (low_sample bool on response). Frontend re-asserts for defense-in-depth but does NOT define the threshold — prevents constant-drift between client and server (matches CacheEfficiencyCard pattern)"
  - "Trend cost SQL MUST derive from the SELECTED dual-path branch (TWO trend SQL variants: _COST_TREND_REQUEST_SCOPED_SQL + _COST_TREND_SESSION_SCOPED_SQL). Independent per-day attribution test was explicitly forbidden — would let different days land on different branches and break the Decimal sum invariant `sum(trend.daily_cost) == cost_usd`"
  - "Decimal-as-JSON-string lock honored (Pydantic v2 default; jsonable_encoder forbidden — would silently coerce to float)"
  - "BARE event_name in SQL ('skill_activated', 'api_request') — ingest strips the claude_code. prefix on write per LOCK-1"
  - "Test fixtures use _seed_otel_event(session_id=None) to avoid the soft-FK constraint to sessions when the test only needs the otel_events row (orphan-event pattern from test_system_router SAPI-05 tests)"

patterns-established:
  - "Pattern: dual-path defensive attribution. Try the precise (request-scoped) JOIN first; fall back to a coarser (session-scoped) sum. Surface the chosen path in a Literal field on the response so frontend + verifier can branch on it. cost_attribution: 'request'|'session' is the canonical name."
  - "Pattern: SQLite window-CTE percentile adapted from observability._TOOL_LATENCY_SQL. ROW_NUMBER() OVER (PARTITION BY x ORDER BY duration_ms) + COUNT(*) OVER (PARTITION BY x) + sub-CTEs for p50/p95 with `rnk = MAX(CAST(n*p AS INTEGER), 1)` clamp. N=1 case yields rnk=1 (the only row); N=100 with durations 1..100 yields p50=50, p95=95, max=100."
  - "Pattern: SSE payload extension. One-line addition to tail_otel_events json.dumps body + a direct unit test seeding an OtelEvent and asserting the new key appears in the payload (matches SAPI-05 idiom in test_system_router.py)."
  - "Pattern: trend cost MUST derive from the same branch as the main cost number (NOT independent per-bucket dual-path tests). Two trend SQL variants — handler picks based on cost_attribution. Decimal sum invariant test is mandatory."

# Metrics
duration: 19min
completed: 2026-05-03
---

# Phase 14 Plan 01: Skills API & Page Panels — Endpoints Summary

**4 new read-time-computed skills endpoints (SKIL-04..07) on the existing /api/skills router with dual-path cost attribution, SQLite window-CTE percentile latency, and a one-line SSE payload extension forwarding attrs_skill_name for Plan 04's SkillTimeline.**

## Performance

- **Duration:** 19 min
- **Started:** 2026-05-03T21:47:38Z
- **Completed:** 2026-05-03T22:06:44Z
- **Tasks:** 3
- **Files modified:** 4 code/test + 2 planning docs (REQUIREMENTS.md, ROADMAP.md)
- **Tests:** 438 baseline → 463 passed (net +25)

## Accomplishments

- Shipped 4 new path operations on the existing skills_router under /api/skills/{usage,/{name}/cost,/{name}/latency,/{name}/runs} — every Phase 14 frontend panel can now resolve its data dependency.
- Implemented the genuinely-novel dual-path cost attribution (D-02 — Path R: request-scoped JOIN; Path S: session-scoped fallback) with a `cost_attribution: "request" | "session"` field on the response. Defensive against TENTATIVE LOCK-9 (request_id presence on skill_activated) — handles both outcomes without a live-data probe.
- Adapted the SQLite window-CTE percentile pattern from `observability._TOOL_LATENCY_SQL` to per-skill latency. Verified empirically: 100 events at duration_ms=1..100 yields p50=50, p95=95, max=100 with the `MAX(CAST(n*p AS INTEGER), 1)` clamp.
- Extended `tail_otel_events` SSE payload with `attrs_skill_name` (one-line addition) so Plan 04's SkillTimeline can label firehose events by skill name without a new SSE channel.
- Server-side `MIN_LATENCY_SAMPLES=30` constant + `low_sample: bool` field on SkillLatencyResponse — server is source of truth (SKLP-05/D-04 — matches CacheEfficiencyCard pattern, prevents constant drift between client and server).
- Decimal-as-JSON-string serialization locked (Pydantic v2 default; `jsonable_encoder` forbidden — would silently coerce to float).
- All threats in the plan's `<threat_model>` mitigated: T-14-01-01 (skill name SQL injection — `_SKILL_NAME_RE` + '..' check), T-14-01-02 (range/limit clamping — Literal + Query ge/le), T-14-01-04 (window-CTE memory — same pattern shipped against millions of rows in observability), T-14-01-05 (cost attribution dispute — `cost_attribution` field exposes the path used).

## Task Commits

Each task was committed atomically. TDD per task (RED first via failing-import test, GREEN via implementation, then verify); the per-task commit captures both the RED test addition and the GREEN implementation in a single feat commit because the schemas/routes were greenfield (no existing failing-test cycle to bisect).

1. **Task 1: Add response schemas + Range alias + SSE payload extension** — `c913e6a` (feat)
2. **Task 2: Implement skills_usage + skill_runs endpoints + tests** — `a2735a4` (feat)
3. **Task 3: Implement skill_cost (dual-path) + skill_latency (window-CTE) + tests** — `f20b5aa` (feat)

**Plan metadata commit:** _final docs commit follows this SUMMARY.md write_

## Files Created/Modified

- `backend/cmc/api/schemas/skills.py` — added `SkillRange` Literal alias + 5 new response models (`SkillSparklineRow`, `SkillUsageRow`, `SkillUsageResponse`, `SkillCostResponse` with `cost_attribution: Literal["request", "session"]`, `SkillLatencyResponse` with `low_sample: bool`, `SkillRunRow`, `SkillRunsResponse`).
- `backend/cmc/api/routes/skills.py` — added 4 new path operations (`skills_usage`, `skill_runs`, `skill_cost`, `skill_latency`), 6 SQL `text()` constants (`_USAGE_TOP_SQL`, `_RUNS_SQL`, `_COST_REQUEST_SCOPED_SQL`, `_COST_SESSION_SCOPED_SQL`, `_COST_TREND_REQUEST_SCOPED_SQL`, `_COST_TREND_SESSION_SCOPED_SQL`, `_LATENCY_SQL`, `_ERROR_COUNT_SQL`), `MIN_LATENCY_SAMPLES = 30` module constant, and `_RANGE_TO_DAYS`/`_range_start`/`_coerce_effective_from` helpers copied from `cost.py`.
- `backend/cmc/api/sse.py` — one-line addition to `tail_otel_events` json.dumps payload: `"attrs_skill_name": row.attrs_skill_name`.
- `backend/tests/test_skills_router.py` — added 25 tests (2 Task 1 + 8 Task 2 + 15 Task 3) plus inline `_seed_otel_event`, `_seed_session_row`, `_make_skill_body`, `_make_api_request_body` helpers (matches `test_cost_router.py` inline helper convention).
- `.planning/REQUIREMENTS.md` — SKIL-04 line points to `/api/skills/usage` with the D-01 deviation annotation (planner already updated; verified + committed in Task 2).
- `.planning/ROADMAP.md` — Phase 14 Success Criterion #1 references `/api/skills/usage` with the D-01 deviation annotation (planner already updated; verified + committed in Task 2).

## Decisions Made

- **D-01 — `/api/skills/usage` endpoint path** (avoid colliding with the existing catalog endpoint). Already documented in PLAN frontmatter; REQUIREMENTS + ROADMAP carry the annotation.
- **D-02 — Dual-path skill cost attribution** with `cost_attribution: "request" | "session"` field. The plan's test fixtures `test_skill_cost_request_path_when_request_id_present` (Path R wins when matching api_request seeded) and `test_skill_cost_session_path_when_request_id_absent` (Path S wins when api_request absent) lock both branches — gsd-verifier should NOT hard-code "request" as the expected value.
- **D-03 — Latency `WHERE duration_ms IS NOT NULL` + sample_count=0 empty-state.** Returns 200, not 500 — UI surfaces as "no data" badge.
- **D-04 — Server-side `MIN_LATENCY_SAMPLES=30` source of truth.** Plan 04 (SkillLatencyTable) reads `response.low_sample` directly. Frontend re-asserts the threshold in the panel for defense-in-depth.
- **Trend SQL derives from SELECTED branch.** Two trend SQL variants — handler picks `_COST_TREND_REQUEST_SCOPED_SQL` or `_COST_TREND_SESSION_SCOPED_SQL` based on `cost_attribution`. Two regression tests (`test_skill_cost_trend_shape_session_path` + `test_skill_cost_trend_sum_equals_total_cost_usd_request_path`) lock the Decimal sum invariant `sum(trend.daily_cost) == cost_usd` on both paths.

## Deviations from Plan

None — plan executed exactly as written. The plan's `<deviations>` block (D-01..D-04) was front-loaded by the planner; this executor honored every deviation as specified.

The plan said "~14 new tests"; 25 landed (richer coverage of dual-path branches + Decimal sum invariant on BOTH paths). Not a deviation — strictly more thorough.

The plan's TDD-RED gate is satisfied at task-1-commit granularity (the new schema-importability test was a true failing import before the schemas existed; same for the SSE payload regression test). RED + GREEN merged into a single per-task commit per the plan's Task 1 action description ("create or extend backend/tests/test_skills_router.py… directly call json.dumps inline by extracting the dict-shape contract — accept whichever pattern matches existing test_observability_router.py / test_sse_*.py idioms"); the failing-import RED would have been a noise commit on a greenfield schema module.

## Issues Encountered

- **Initial Task-1 SSE test seeded session_id="sess-skl"** — the soft-FK on `otel_events.session_id` to `sessions.session_id` rejected with `IntegrityError`. Fixed by setting `session_id=None` (matches the orphan-event pattern in `test_system_router.py` SAPI-05 tests) since the SSE payload assertion is purely about `attrs_skill_name` forwarding. One-line fix; documented in test docstring.

## Test Coverage Matrix

| Requirement | Test(s) | Status |
|-------------|---------|--------|
| SKIL-04 (top-N + sparkline) | `test_skills_usage_top_n_with_sparkline` | PASS |
| SKIL-04 (Range Literal 422) | `test_skills_usage_invalid_range_returns_422` | PASS |
| SKIL-04 (limit clamping) | `test_skills_usage_limit_clamping` | PASS |
| SKIL-04 (empty-state) | `test_skills_usage_empty_returns_empty_rows` | PASS |
| SKIL-05 (Path R) | `test_skill_cost_request_path_when_request_id_present` | PASS |
| SKIL-05 (Path S) | `test_skill_cost_session_path_when_request_id_absent` | PASS |
| SKIL-05 (cost_attribution field present always) | `test_skill_cost_attribution_field_present` | PASS |
| SKIL-05 (Decimal-as-JSON-string) | `test_skill_cost_decimal_as_json_string` + `test_skills_router_schemas_importable` | PASS |
| SKIL-05 (trend Decimal sum invariant — Path S) | `test_skill_cost_trend_shape_session_path` | PASS |
| SKIL-05 (trend Decimal sum invariant — Path R) | `test_skill_cost_trend_sum_equals_total_cost_usd_request_path` | PASS |
| SKIL-05 (Range 422 + path traversal 400) | `test_skill_cost_invalid_range_returns_422` + `test_skill_cost_path_traversal_rejected` | PASS |
| SKIL-06 (window-CTE percentile correctness) | `test_skill_latency_percentiles_basic` | PASS |
| SKIL-06 (single sample) | `test_skill_latency_single_sample` | PASS |
| SKIL-06 (low_sample bool from server) | `test_skill_latency_low_sample_under_30` | PASS |
| SKIL-06 (zero samples empty-state) | `test_skill_latency_zero_samples_empty_state` | PASS |
| SKIL-06 (error_rate basic + LOCK-8 union) | `test_skill_latency_error_rate_basic` | PASS |
| SKIL-06 (Range 422 + path traversal 400) | `test_skill_latency_invalid_range_returns_422` + `test_skill_latency_path_traversal_rejected` | PASS |
| SKIL-07 (recent runs ordered ts DESC + cwd join) | `test_skill_runs_recent_ordered_desc` | PASS |
| SKIL-07 (path traversal 400) | `test_skill_runs_path_traversal_rejected` | PASS |
| SKIL-07 (unknown cwd '<unknown>' fallback) | `test_skill_runs_unknown_cwd_fallback` | PASS |
| SKIL-07 (limit clamping) | `test_skill_runs_limit_clamping` | PASS |
| SKLP-06 (SSE forwards attrs_skill_name) | `test_sse_firehose_includes_attrs_skill_name` | PASS |

## User Setup Required

None — no new environment variables, no external services, no manual configuration. Plan 14-01 is purely a backend read-side addition consuming Phase 13's already-seeded `otel_events.attrs_skill_name` column and `data/pricing.json` rates.

## Next Phase Readiness

**Plan 14-02 (frontend api.ts + queries) is unblocked:**
- Backend contract: 4 endpoints + SSE payload extension all green.
- TypeScript-side mirror: `SkillRange = '14d' | '30d'`, plus mirror DTOs for the 5 new response models (frontend should hand-roll, not generate, per project convention).
- New `useFirehose({ eventName: 'skill_activated' })` consumers in Plan 04 will see `attrs_skill_name` on the OtelEvent payload — TS interface needs the same key added.

**Plans 14-03, 14-04, 14-05 are unblocked** — every panel/page can now resolve its data dependency.

**No carryover blockers.** The TENTATIVE LOCK-3/LOCK-9 attributes (duration_ms, request_id on skill_activated) are no longer plan-blockers because the dual-path attribution + WHERE duration_ms IS NOT NULL + sample_count=0 empty-state handle both outcomes defensively.

## Self-Check: PASSED

Verified all created/modified files exist on disk:
- `backend/cmc/api/schemas/skills.py` — FOUND
- `backend/cmc/api/routes/skills.py` — FOUND
- `backend/cmc/api/sse.py` — FOUND
- `backend/tests/test_skills_router.py` — FOUND
- `.planning/phases/14-skills-api-page-panels/14-01-SUMMARY.md` — FOUND (this file)

Verified all 3 task commits + parent metadata commit exist in `git log`:
- `c913e6a` (Task 1) — FOUND
- `a2735a4` (Task 2) — FOUND
- `f20b5aa` (Task 3) — FOUND

Verified full backend suite: 463 passed, 0 failed (438 baseline + 25 new = 463).

---
*Phase: 14-skills-api-page-panels*
*Completed: 2026-05-03*
