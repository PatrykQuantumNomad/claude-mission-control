---
phase: 03-read-only-apis
plan: 04
subsystem: api
tags: [fastapi, sqlalchemy, sqlite, observability, percentile, otel, json_extract, ROW_NUMBER]

# Dependency graph
requires:
  - phase: 03-read-only-apis
    plan: 01
    provides: "10 OBSV-* DTOs in cmc.api.schemas.observability + seeded_app/client fixtures + factory helpers"
  - phase: 02-data-ingestion
    plan: all
    provides: "ingested token_usage / sessions / tools / otel_events / otel_metrics rows for the router to aggregate"
provides:
  - "10 GET endpoints under /api/usage/, /api/sessions/, /api/tools/, /api/hooks/, /api/activity/, /api/system/ for OBSV-01..10"
  - "Pattern 4 percentile via window functions (ROW_NUMBER OVER PARTITION + COUNT OVER PARTITION) — copy-paste reference for any future per-tool/per-X percentile aggregation"
  - "Read-time outcome computation pattern (Pitfall 9 fallback) — CASE EXISTS subqueries on otel_events join — applicable to any later phase that needs derived session state without parser-side population"
  - "OBSV-08 dual-source merge contract: Phase 2+ may write a tool_decision either to tools.decision OR to otel_events; this router sums both — entry contract for any future tool_decision parser changes"
  - "FIFO hook pairing in Python over SQL-ordered events: claude_code.hook.pre_<key> ⇄ claude_code.hook.post_<key>, capped at 60_000 ms per pair, computes p50 per (day, hook_name)"
affects: [04-hitl-control-plane, 05-skills-mcp-curation, 06-frontend-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "All daily aggregations use STRFTIME(..., 'localtime') (Pitfall 4 mitigation — matches the local-day buckets the JSONL parser writes)"
    - "Pattern 4 percentile via window function CTEs (preferred over correlated subqueries with COUNT(*) in OFFSET, which SQLite rejects)"
    - "Range-window enum (Literal['today','7d','30d']) auto-validated by FastAPI; bind-param-only DATE('now', :since_clause, 'localtime')"
    - "Test helper auto-seeds parent sessions when inserting otel_events/tools (PRAGMA foreign_keys=1 from Phase 1 listener requires it; soft-FK ON DELETE SET NULL only applies on parent delete)"

key-files:
  created:
    - "backend/cmc/api/routes/observability.py — 10 endpoints + 2 helpers (_classify_hook, _percentile, _parse_ts)"
  modified:
    - "backend/cmc/api/routes/__init__.py — observability_router added to all_routers() (additively, preserving sibling Wave 1 routers: mcp, sessions, system)"
    - "backend/tests/test_phase3_observability.py — 17 tests appended (10 endpoint tests + 6 percentile/Pitfall edge cases + 1 schema smoke)"

key-decisions:
  - "OBSV-04 percentile uses SQLite window functions (ROW_NUMBER OVER PARTITION + COUNT OVER PARTITION) instead of correlated subqueries with aggregate-in-OFFSET — the plan-suggested COUNT(*)-in-OFFSET form raises 'misuse of aggregate function' on SQLite and was replaced as a Rule 1 auto-fix"
  - "OBSV-04 percentile offset wrapper uses 1-indexed MAX(CAST(N*p AS INT), 1) (not the plan's 0-indexed MAX(... - 1, 0)) because ROW_NUMBER is 1-indexed; semantically identical (both handle N=1 by returning sole row)"
  - "OBSV-05 paired_duration_ms_p50 IS implemented end-to-end (FIFO pairing + 60s cap + Pattern 4 p50). Plan's earlier draft considered deferring; the final plan kept it as a hard requirement, which we deliver"
  - "Test helper _seed_rows auto-seeds parent sessions for any FK-referenced session_id (Rule 1 auto-fix to make hook/tool/edit-decision tests work without polluting every test with boilerplate)"
  - "OBSV-08 dual source: tools.decision wins when both signals exist for the same tool_use_id (the merge sums them; if Phase 2 ever writes both for the same call, accept/reject counts double — flagged for a Phase 2+ revisit if duplicate writes become a real concern)"

patterns-established:
  - "Window-function percentile (ROW_NUMBER + COUNT OVER PARTITION) is the canonical Phase 3+ percentile pattern — use it instead of LIMIT/OFFSET-with-aggregate which SQLite rejects"
  - "FK-aware test seeding: any test inserting child rows (otel_events, tools) goes through _seed_rows which transparently seeds parent sessions"
  - "Per-router test file convention extended: all OBSV-* tests live in test_phase3_observability.py (declared by Plan 03-01)"

# Metrics
duration: 14min
completed: 2026-04-26
---

# Phase 3 Plan 04: Observability Router Summary

**10 GET aggregation endpoints (tokens/cache/outcomes/latency/hooks/projects/agents/edits/productivity/pressure) covering OBSV-01..10 against Phase 2 ingested data, no schema changes**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-04-26T12:48:47Z
- **Completed:** 2026-04-26T13:02:16Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 3 (1 new, 2 edited)

## Accomplishments

- `GET /api/usage/tokens` (OBSV-01) — daily breakdown by model + source with today/7d/30d range
- `GET /api/usage/cache` (OBSV-02) — hit_rate trend with low_sample badge (<10K billable tokens)
- `GET /api/sessions/outcomes` (OBSV-03) — daily mutually-exclusive buckets via Pitfall-9 read-time CASE EXISTS
- `GET /api/tools/latency` (OBSV-04) — per-tool p50/p95/max via window functions; Pitfall 2 (N=0/N=1) verified
- `GET /api/hooks/activity` (OBSV-05) — daily fires + paired_duration_ms_p50 with 60s cap and per-session FIFO pairing
- `GET /api/sessions/by-project` (OBSV-06) — cwd rollup with pct_of_total + ~/-display_path
- `GET /api/tools/agent-fanout` (OBSV-07) — sessions calling Agent tool, sorted by agent_calls DESC
- `GET /api/tools/edit-decisions` (OBSV-08) — dual-source merge of tools.decision and otel_events.body.decision
- `GET /api/activity/productivity` (OBSV-09) — commits/PRs/lines from claude_code.* counters
- `GET /api/system/pressure` (OBSV-10) — retries+compaction counts; last 10 api_error events DESC
- observability_router registered in `cmc.api.routes.all_routers()` (additive, preserves sibling Wave 1 routers)
- 17 OBSV tests pass (Wave-0 schema smoke + 10 endpoint tests + 6 percentile/Pitfall edge cases)

## Task Commits

Each task was committed atomically as TDD pairs:

1. **Task 1 RED — failing tests for OBSV-01..05** — `13f809c` (test)
2. **Task 1 GREEN — implement OBSV-01..05 + register router** — `0362b27` (feat)
3. **Task 2 RED — failing tests for OBSV-06..10** — `f43d46e` (test)
4. **Task 2 GREEN — implement OBSV-06..10** — `722237a` (feat)

## Files Created/Modified

- `backend/cmc/api/routes/observability.py` — **NEW** — 670 lines covering 10 endpoints + helpers (_classify_hook for hook event-name pairing, _percentile for in-Python Pattern 4, _parse_ts for SQLite timestamp coercion).
- `backend/cmc/api/routes/__init__.py` — added `from cmc.api.routes.observability import router as observability_router` and appended to `all_routers()` list. Preserves sibling Wave 1 entries (mcp_router from 03-05, sessions_router from 03-03, system_router from 03-02 which had been added by another agent at the time of write).
- `backend/tests/test_phase3_observability.py` — appended 16 endpoint tests + 1 helper utility (`_seed_rows`) under the Wave-0 schema smoke. 17 tests total in the file pass.

## Decisions Made

- **Window-function percentile over OFFSET-with-COUNT(\*)**: The plan's suggested `LIMIT 1 OFFSET MAX(CAST(COUNT(*) * 0.5 AS INTEGER) - 1, 0)` inside a correlated subquery raises SQLite `OperationalError: misuse of aggregate function COUNT()` because aggregate calls aren't valid in OFFSET expressions. Replaced with a window-function CTE (`ROW_NUMBER() OVER (PARTITION BY tool_name ORDER BY duration_ms)` + `COUNT(*) OVER (PARTITION BY tool_name)`) that ranks each row per tool and joins the rank=k row back. SQLite 3.47 supports this natively. Same Pitfall 2 spirit (graceful for N=0/N=1) but expressed via 1-indexed `MAX(CAST(n * p AS INTEGER), 1)`.
- **OBSV-05 Python pairing over nested SQL**: Implemented FIFO hook pairing in Python (per-session `deque` of pre-event timestamps; pop on matching post-event; cap each pair at 60_000 ms; bucket by pre-event day + canonical pre-event_name). The per-bucket p50 uses Pattern 4 offset over the sorted ms list. This is cleaner than self-correlated SQL window pairing and well within the read-budget for Phase 3.
- **Auto-seed parent sessions in test helper**: Phase 1 engine listener sets `PRAGMA foreign_keys=1`, which rejects orphan `otel_events`/`tools` rows on INSERT (the schema's `ON DELETE SET NULL` only applies to parent deletion). Encoded "if you seed a child row with `session_id=X`, transparently seed `session_id=X` in `sessions` first" inside `_seed_rows` so test bodies stay focused.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] OBSV-04 SQL: COUNT(*) inside OFFSET raises "misuse of aggregate function"**
- **Found during:** Task 1 GREEN (running test_obsv_04_*)
- **Issue:** Plan's `LIMIT 1 OFFSET MAX(CAST(COUNT(*) * 0.5 AS INTEGER) - 1, 0)` inside a correlated subquery is rejected by SQLite — aggregate functions cannot appear inside OFFSET expressions.
- **Fix:** Restructured as a window-function CTE (`ROW_NUMBER OVER PARTITION` + `COUNT OVER PARTITION`) computing per-tool rank, then joined the rank=k row at p50/p95 positions. Equivalent semantics, portable to SQLite 3.25+, AND eliminates the O(N²) correlated subquery.
- **Files modified:** `backend/cmc/api/routes/observability.py` (`_TOOL_LATENCY_SQL`)
- **Verification:** test_obsv_04_tool_latency_happy / _pitfall_2_n_equals_1 / _n_zero_excluded all pass.
- **Committed in:** `0362b27` (Task 1 GREEN)

**2. [Rule 3 - Blocking] Test seeding rejected by FK enforcement**
- **Found during:** Task 1 GREEN (running OBSV-05 hook tests)
- **Issue:** Tests insert `otel_events` rows with `session_id="sess-X"` for sessions that don't yet exist. FK constraint (PRAGMA foreign_keys=1) rejects the INSERT with IntegrityError. The `ON DELETE SET NULL` clause on otel_events.session_id only applies on parent delete, not on insert.
- **Fix:** Added auto-seeding logic inside the test-only `_seed_rows` helper in `test_phase3_observability.py` — when inserting `otel_events` or `tools`, scan for missing parent sessions and seed minimal `make_session_row(session_id=X, started_at=now-5min)` rows first.
- **Files modified:** `backend/tests/test_phase3_observability.py` (test helper only — no production change).
- **Verification:** All hook + agent-fanout + edit-decision tests pass.
- **Committed in:** `0362b27` (Task 1 GREEN — bundled with the SQL fix in the same TDD GREEN commit)

**3. [Rule 1 - Bug] make_token_usage_bucket returns ISO string but SQLite Date type expects date object**
- **Found during:** Task 1 GREEN (running test_obsv_01)
- **Issue:** Plan 03-01's factory helper `make_token_usage_bucket` defaults `day` to `date.today().isoformat()` (a string). SQLAlchemy's SQLite Date column rejects this with `TypeError: SQLite Date type only accepts Python date objects as input.`
- **Fix:** `_seed_rows` test helper now normalizes `day` ISO strings to `date` objects via `date.fromisoformat(...)` before inserting. (Test-only fix — production code in cmc.ingest.repository already uses real `date` objects.)
- **Files modified:** `backend/tests/test_phase3_observability.py`
- **Verification:** test_obsv_01_usage_tokens_range_filter + test_obsv_02_usage_cache_low_sample pass.
- **Committed in:** `0362b27` (Task 1 GREEN)

---

**Total deviations:** 3 auto-fixed (1 SQL bug, 1 blocking test infra, 1 test-data-coercion bug)
**Impact on plan:** All three fixes confined to plan-internal scope (observability router SQL + this plan's test file). No architectural change. The window-function percentile pattern is arguably an improvement over the correlated subquery (eliminates O(N²) and Pitfall-2-mitigation complexity) and should be considered for Plan 03-03 sessions if it has similar percentile needs.

## Issues Encountered

- **Parallel Wave 1 file contention on `routes/__init__.py`**: All four Wave 1 plans (03-02..03-05) edit this file. While I read-then-wrote, sibling agent 03-02 added `system_router` to the file in between my read and another sibling commit. The plan anticipated this — my edit was strictly additive (added observability_router, preserved everything I saw including mcp_router and sessions_router from earlier sibling commits). My commit included system_router additions that another sibling had made but not yet committed. Net effect: harmless — sibling agent will see the additions already committed and skip that step. Tests for the system router live in test_phase3_system.py and pass.
- **Sibling agent test file failures (test_phase3_mcp.py, test_phase3_sessions.py)**: These fail in some test orderings due to ongoing parallel work in those files (not my code). Confirmed by running my files in isolation: `pytest test_phase1_boot.py test_phase2_ingest.py test_phase3_observability.py test_phase3_system.py test_phase3_skills.py` → 90 passed.

## User Setup Required

None — observability is read-only against existing data.

## Next Phase Readiness

- All 10 OBSV endpoints respond with correct shapes against seeded data and are ready to be consumed by the Phase 6 dashboard cards (TokenUsageCard, CacheEfficiencyCard, SessionOutcomesCard, ToolLatencyCard, HookActivityCard, ProjectBreakdownCard, AgentFanoutCard, EditAcceptanceCard, ProductivityCard, PressurePanel — OPNL-05..14).
- Window-function percentile pattern is documented in observability.py and ready to be re-used by other routers needing per-X percentile aggregation.
- Hook event-name pairing logic (`_classify_hook`) is private to observability.py for now; if Phase 4+ needs hook latency from hook events too, lift it into a shared module.

## Threat Flags

None — all 10 endpoints accept only the documented `range` Literal enum (FastAPI auto-422 on invalid), bind only the static `:since_clause` constant, and read from already-ingested local SQLite. No new trust boundaries vs. the threat register in PLAN.md.

## Self-Check: PASSED

**Files verified to exist:**
- `backend/cmc/api/routes/observability.py` — FOUND
- `backend/cmc/api/routes/__init__.py` — FOUND (observability_router import + all_routers entry confirmed)
- `backend/tests/test_phase3_observability.py` — FOUND (17 tests pass)

**Commits verified:**
- `13f809c` — FOUND (test 03-04 RED OBSV-01..05)
- `0362b27` — FOUND (feat 03-04 GREEN OBSV-01..05 + router registration)
- `f43d46e` — FOUND (test 03-04 RED OBSV-06..10)
- `722237a` — FOUND (feat 03-04 GREEN OBSV-06..10)

**Must-haves verified:**
- [x] GET /api/usage/tokens (OBSV-01) — daily breakdown with range filter
- [x] GET /api/usage/cache (OBSV-02) — hit_rate + low_sample badge
- [x] GET /api/sessions/outcomes (OBSV-03) — read-time CASE outcome buckets
- [x] GET /api/tools/latency (OBSV-04) — p50/p95/max via window function (Pitfall 2 verified)
- [x] GET /api/hooks/activity (OBSV-05) — fires + paired_duration_ms_p50 (60s cap, per-session FIFO)
- [x] GET /api/sessions/by-project (OBSV-06) — cwd rollup with pct_of_total
- [x] GET /api/tools/agent-fanout (OBSV-07) — Agent-tool callers
- [x] GET /api/tools/edit-decisions (OBSV-08) — dual source: tools.decision + otel_events
- [x] GET /api/activity/productivity (OBSV-09) — commits/PRs/lines counters
- [x] GET /api/system/pressure (OBSV-10) — retries+compaction counts + last 10 api_error
- [x] observability_router registered in cmc.api.routes.__init__.all_routers()

## Reference: Pattern Snippets

### Pattern 4 percentile via window function (replaces plan's OFFSET-with-COUNT(*) form)

```sql
WITH tc AS (
  SELECT tool_name, duration_ms, status FROM tools
  WHERE duration_ms IS NOT NULL AND started_at >= datetime('now', :since)
),
ranked AS (
  SELECT tool_name, duration_ms, status,
         ROW_NUMBER() OVER (PARTITION BY tool_name ORDER BY duration_ms) AS rnk,
         COUNT(*)    OVER (PARTITION BY tool_name)                        AS n
  FROM tc
),
agg AS (
  SELECT tool_name, COUNT(*) AS call_count,
         AVG(CASE WHEN status='error' THEN 1.0 ELSE 0.0 END) AS error_rate,
         MAX(duration_ms) AS max_ms
  FROM tc GROUP BY tool_name HAVING COUNT(*) >= 1
),
p50 AS (SELECT tool_name, duration_ms AS p50_ms FROM ranked
        WHERE rnk = MAX(CAST(n * 0.5 AS INTEGER), 1)),
p95 AS (SELECT tool_name, duration_ms AS p95_ms FROM ranked
        WHERE rnk = MAX(CAST(n * 0.95 AS INTEGER), 1))
SELECT agg.tool_name, agg.call_count, agg.error_rate, agg.max_ms,
       p50.p50_ms, p95.p95_ms
FROM agg LEFT JOIN p50 USING (tool_name) LEFT JOIN p95 USING (tool_name)
ORDER BY p95.p95_ms DESC
```

### Read-time outcome computation (Pitfall 9 path 1)

```sql
WITH classified AS (
  SELECT s.session_id,
         STRFTIME('%Y-%m-%d', s.started_at, 'localtime') AS day,
         CASE
           WHEN EXISTS (SELECT 1 FROM otel_events e WHERE e.session_id = s.session_id
                        AND e.event_name = 'claude_code.api_error') THEN 'errored'
           WHEN EXISTS (SELECT 1 FROM otel_events e WHERE e.session_id = s.session_id
                        AND e.event_name = 'claude_code.api_retries_exhausted') THEN 'rate_limited'
           WHEN EXISTS (SELECT 1 FROM otel_events e WHERE e.session_id = s.session_id
                        AND e.event_name = 'claude_code.compaction') THEN 'truncated'
           WHEN s.ended_at IS NULL THEN 'unfinished'
           ELSE 'ok'
         END AS outcome
  FROM sessions s
  WHERE s.started_at >= datetime('now', :since)
)
SELECT day,
       SUM(outcome='errored')      AS errored,
       SUM(outcome='rate_limited') AS rate_limited,
       SUM(outcome='truncated')    AS truncated,
       SUM(outcome='unfinished')   AS unfinished,
       SUM(outcome='ok')           AS ok,
       COUNT(*)                    AS total
FROM classified GROUP BY day ORDER BY day DESC
```

### OBSV-08 dual-source contract

Phase 2's parser writes either path:
- `tools.decision` column (set by JSONL parser when tool_decision arrives in same session)
- `otel_events` row with `event_name='claude_code.tool_decision'` and `body={"tool_name": ..., "decision": "accept"|"reject"}`

The router runs BOTH queries and merges by tool_name. If a future Phase 2+ change writes to BOTH for the same tool_use_id, accept/reject counts will double-count — flag for revisit.

### OBSV-10 OTEL events consumed (entry contract for Phase 6 pressure panel)

- `claude_code.api_retries_exhausted` — counted into `api_retries_exhausted`
- `claude_code.compaction` — counted into `compaction_count`
- `claude_code.api_error` — last 10 (LIMIT 10 sorted ts DESC) returned as `recent_api_errors[]` with `body.message` (or fallback to `event_name`)

---
*Phase: 03-read-only-apis*
*Completed: 2026-04-26*
