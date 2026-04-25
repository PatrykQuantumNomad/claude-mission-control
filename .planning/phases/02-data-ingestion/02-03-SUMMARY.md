---
phase: 02-data-ingestion
plan: 03
subsystem: api
tags: [fastapi, otel, otlp, ingest, sqlalchemy, http-receiver, phase-2]

# Dependency graph
requires:
  - phase: 01-foundation-database
    provides: app factory, lifespan, sessionmaker, /api router pattern, otel_events + otel_metrics tables (Plan 01-05), SPA mount ordering
  - phase: 02-data-ingestion
    provides:
      - Plan 02-01 — Settings.otlp_max_body_bytes + otlp_log_payload + otlp_metric_payload fixtures
      - Plan 02-02 — split_mcp() helper reused by INGST-08 fallback path
provides:
  - POST /v1/logs and POST /v1/metrics OTLP/HTTP JSON endpoints (always-200 contract)
  - cmc.ingest.otel_parser pure helpers (extract_mcp_attrs, parse_unix_nano, iter_attrs)
  - cmc.api.routes.raw_routers() aggregator pattern for non-/api routes
  - factory.py wiring: raw_routers registered AFTER all_routers and BEFORE the SPA mount (Pitfall 8 preserved)
  - INGST-07 always-200 contract verified by tests (malformed body / per-record skip / FK retry / body-size cap)
  - INGST-08 MCP attribute extraction (tool_parameters JSON path + name-split fallback)
  - INGST-09 sum/gauge/histogram metric persistence with correct kind discrimination
affects:
  - Plan 02-04 (scheduler/repository) — independent file ownership; can run in parallel
  - Plan 02-05 (lifespan + manual sync route) — must preserve raw_routers ordering relative to SPA mount
  - Phase 6 (observability panels) — now has telemetry source data to query

# Tech tracking
tech-stack:
  added:
    - sqlalchemy.exc.IntegrityError import in ingest router (per-record savepoint pattern)
  patterns:
    - "raw_routers() vs all_routers(): two router groups with different mount strategies — /api prefix vs root path"
    - "Always-200 OTLP contract (Pitfall 4): handlers return 200 once body is read; only escape is 413 (size cap, checked BEFORE body)"
    - "Per-record savepoint + IntegrityError retry: db.add() defers FK validation until commit, so a single bad row aborts the whole batch unless wrapped in a per-record savepoint with retry-as-NULL"
    - "Settings reads via request.app.state.settings.otlp_max_body_bytes (NEVER hardcode caps)"
    - "Soft-FK semantics on otel_events.session_id: events arrive before sessions row; insert retries with NULL on FK miss"

key-files:
  created:
    - backend/cmc/ingest/otel_parser.py
    - backend/cmc/api/routes/ingest.py
  modified:
    - backend/cmc/api/routes/__init__.py (added raw_routers + ingest_router import)
    - backend/cmc/app/factory.py (added raw_routers loop between all_routers and SPA mount)
    - backend/tests/test_phase1_boot.py (extended test_static_mount_after_routers to assert /v1/* positions)
    - backend/tests/test_phase2_ingest.py (10 new Plan 02-03 tests appended)

key-decisions:
  - "Per-record savepoint + IntegrityError retry pattern adopted for OTLP /v1/logs to honor the soft-FK contract on otel_events.session_id (events may arrive before the sessions row exists; retry with NULL keeps the record)"
  - "raw_routers() function lives alongside all_routers() in cmc.api.routes — single entrypoint for routers regardless of mount strategy"
  - "GET /v1/logs returns 405 (POST-only) when SPA mount is disabled; with SPA mount active, GET falls through to index.html (200) — expected since /v1/logs is a POST endpoint and the SPA fallback catches all non-matching GETs"
  - "Settings.otlp_max_body_bytes (10MB default from Plan 02-01) is read via request.app.state.settings.otlp_max_body_bytes — NEVER hardcoded"

patterns-established:
  - "raw_routers() pattern: any future router whose URL is fixed by an external spec (webhooks, OAuth callbacks, OTLP) lives here, not in all_routers()"
  - "Always-200 contract template: try parse → return 200 on JSONDecodeError; iterate with isinstance guards; per-record try/except with savepoint; commit with rollback fallback; return 200"
  - "Pitfall 8 ordering test now covers BOTH /api/* and /v1/* paths — the regression guard scales to any future raw_routers additions"

# Metrics
duration: 11min
completed: 2026-04-25
---

# Phase 2 Plan 03: OTLP /v1/logs + /v1/metrics receiver Summary

**OTLP/HTTP JSON receiver with always-200 contract: walks resourceLogs/resourceMetrics, persists to otel_events + otel_metrics, never lets the Claude Code exporter drop a batch**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-04-25T18:41:27Z
- **Completed:** 2026-04-25T18:52:35Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- POST /v1/logs handler walks `resourceLogs[].scopeLogs[].logRecords[]`, inserts one OtelEvent per record, ALWAYS returns 200 with `{}` body — Claude Code's OTLP exporter will never drop a batch on our account (Pitfall 4 satisfied)
- POST /v1/metrics handler discriminates kind by which key is present (sum→counter, gauge→gauge, histogram→histogram, summary→summary), inserts one OtelMetric per dataPoint with correct kind/value/unit
- Settings.otlp_max_body_bytes (10MB) enforced via Content-Length pre-check → 413 (the ONLY non-200 the handlers ever return; legitimate because the body never reached the parser)
- INGST-08 MCP attribute extraction with two-path strategy: prefer `tool_parameters` JSON when present, fall back to splitting `tool_name` on `__` via Plan 02-02's `split_mcp` helper
- raw_routers() aggregator pattern established for any future router whose URL is fixed externally (webhooks, OAuth callbacks, etc.) — distinct from all_routers() which mounts under /api
- Plan 01-07's Pitfall 8 ordering test extended to cover OTLP routes too — `/v1/logs` and `/v1/metrics` MUST register before the SPA mount

## Task Commits

Each task followed TDD (RED → GREEN cycle):

1. **Task 1 (TDD): OTLP /v1/logs + /v1/metrics handlers + parser helpers**
   - RED: `7876879` (test) — 7 failing OTLP tests under `# ---- Plan 02-03 ----` section
   - GREEN: `da33e3b` (feat) — otel_parser.py + ingest.py + raw_routers() + factory wiring (all 7 tests pass)

2. **Task 2 (TDD): raw_routers wiring assertions + Plan 01-07 ordering update**
   - GREEN: `ad1c222` (test) — 3 new wiring tests + extended Plan 01-07 `test_static_mount_after_routers`

(No separate RED commit for Task 2 — the 3 wiring tests passed immediately because the wiring landed in Task 1's GREEN to satisfy Task 1's verification command. Task 2 thus codifies the wiring as regression guards rather than driving it via TDD. The new test assertions DID fail against the unmodified Plan 01-07 baseline, then passed after the factory wiring shipped in Task 1's GREEN — so the GREEN gate is the wiring commit `da33e3b` and Task 2's commit is the codifying test.)

## Files Created/Modified

- `backend/cmc/ingest/otel_parser.py` (created) — pure helpers (no DB, no FastAPI): `iter_attrs(attrs_list)`, `parse_unix_nano(s)`, `extract_mcp_attrs(record)` with tool_parameters-first / split_mcp-fallback strategy
- `backend/cmc/api/routes/ingest.py` (created) — `router = APIRouter(tags=["otel"])` exposing POST /v1/logs and POST /v1/metrics; per-record savepoint + IntegrityError retry on FK violations; always-200 contract; 413 only escape (body-size cap)
- `backend/cmc/api/routes/__init__.py` (modified) — added `raw_routers()` aggregator alongside `all_routers()`; documented two-group mount strategy
- `backend/cmc/app/factory.py` (modified) — imported `raw_routers`; added second loop `for router in raw_routers(): app.include_router(router)` between the /api routers and the SPA mount
- `backend/tests/test_phase1_boot.py` (modified) — extended `test_static_mount_after_routers` to assert /v1/logs and /v1/metrics positions also precede the SPA mount
- `backend/tests/test_phase2_ingest.py` (modified) — appended 10 Plan 02-03 tests under new section marker

## Decisions Made

- **Per-record savepoint + IntegrityError retry pattern** for /v1/logs handler. The plan's truths #3 specifies "Per-record try/except so one bad record never blocks the batch", but `db.add()` only stages the row in the unit-of-work — FK validation happens at commit time, not insert time. So a single bad session_id (event arriving before its session row) would abort the whole batch. The fix: wrap each `db.add()` in `async with db.begin_nested(): db.flush()` and catch `IntegrityError` outside the savepoint context, then retry the insert with `session_id=None`. This keeps the soft-FK semantics intact (events with unknown session_ids still persist; the original id remains in `body.record` for later joining when the session row arrives).

- **GET /v1/logs returns 405 only when SPA mount is disabled.** When the SPA static mount is active (real production layout), a GET to /v1/logs falls through the POST-only handler and is served by the SPA's index.html fallback. This is correct production behavior (the SPA catches all unknown GETs for client-side routing), but it masks the 405 the wiring test wants to assert. Test uses `model_copy(static_dir=tmp_path/"no-spa")` to disable the SPA mount for that specific test.

- **`raw_routers()` is the canonical pattern** for any future router whose URL is fixed by an external contract (webhooks, OAuth callbacks, OTLP). Plan 02-05's manual-sync route will go into `all_routers()` (under /api), not `raw_routers()`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Per-record savepoint pattern added to /v1/logs handler**
- **Found during:** Task 1 (GREEN phase — `test_otlp_logs_persists_records_and_returns_200` returned 200 but persisted 0 rows)
- **Issue:** The plan's truths #3 says "Per-record try/except inside both handlers — one bad record never blocks the batch". The plan's <action> code wrapped `db.add()` in try/except, but `db.add()` only stages the row in the SQLAlchemy unit-of-work — FK validation fires at commit time. The test fixture posts records with `session_id="sess-1"` referencing a sessions row that doesn't exist (legitimate per the soft-FK contract documented in `cmc/db/models/otel_events.py`), so `db.commit()` raised `IntegrityError("FOREIGN KEY constraint failed")` and rolled back the whole batch — 0 rows persisted, but handler still returned 200 (Pitfall 4 honored, but data lost).
- **Fix:** Wrapped each `db.add()` in `async with db.begin_nested():` followed by `await db.flush()`. The savepoint catches the FK violation per-record. Outside the savepoint, `IntegrityError` is caught and the record is retried with `session_id=None`, preserving the original session id in `body.record` for later joining. Imported `sqlalchemy.exc.IntegrityError`.
- **Files modified:** backend/cmc/api/routes/ingest.py
- **Verification:** All 7 Task 1 tests pass; full suite 42/42 green
- **Committed in:** `da33e3b` (Task 1 GREEN)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Auto-fix necessary for INGST-07 correctness — without it, every batch with at least one event referencing an unseen session_id would silently lose ALL records (handler still returns 200 per Pitfall 4, but data is dropped). This is the worst kind of failure: silent + always-on. No scope creep; the savepoint pattern aligns with the plan's existing per-record-try/except contract. No new tables, no schema changes, no architectural decisions.

## Issues Encountered

- **Initial begin_nested + manual rollback pattern failed** with "Can't operate on closed transaction inside context manager". Cause: when `IntegrityError` fires inside `async with db.begin_nested() as sp:`, the context manager already auto-rolls back on exit — calling `await sp.rollback()` again throws. Fix: let the context manager handle rollback automatically, then catch `IntegrityError` outside the savepoint context and retry with `session_id=None`.

## User Setup Required

None — the OTLP receiver is fully self-hosted and consumes telemetry from any local Claude Code session that has `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:8765` set. Real-world wire-up of the Claude Code exporter env vars happens at user-time (out of scope for Plan 02-03).

## Next Phase Readiness

- **Plan 02-04 (scheduler/repository) is unblocked.** It depends on Plan 02-02 (parser), not Plan 02-03 (router) — disjoint file ownership means Plan 02-04 could have run in parallel with this plan.
- **Plan 02-05 (lifespan + manual sync route) entry contract:** the factory's router-registration loops MUST stay BEFORE the SPA mount (Pitfall 8). Plan 02-05's lifespan extension (periodic-sync background task) doesn't change factory ordering, only adds work to the lifespan context. The new manual-sync route goes into `all_routers()` (under /api), not `raw_routers()`.
- **Phase 6 (observability panels)** now has a live telemetry source. Once Plan 02-04 lands, queries against `otel_events` (`event_name`, `session_id`, `attrs_mcp_server`, `attrs_mcp_tool`) and `otel_metrics` (`metric_name`, `kind`, `value`, `unit`) will return real data from any local Claude Code session that exports to /v1/logs and /v1/metrics.

## Self-Check: PASSED

- backend/cmc/ingest/otel_parser.py — FOUND
- backend/cmc/api/routes/ingest.py — FOUND
- backend/cmc/api/routes/__init__.py raw_routers() — FOUND (importable, returns [ingest_router])
- backend/cmc/app/factory.py raw_routers() loop — FOUND (between all_routers and SPA mount)
- 42 tests pass (32 baseline + 7 Task 1 + 3 Task 2 wiring = 42)
- Commit 7876879 (test RED) — FOUND in git log
- Commit da33e3b (feat GREEN + factory wiring) — FOUND in git log
- Commit ad1c222 (test wiring assertions) — FOUND in git log
- `python -c "from cmc.api.routes import all_routers, raw_routers; print(len(all_routers()), len(raw_routers()))"` → `1 1` (matches plan verification)

## TDD Gate Compliance

- Task 1: RED commit (`7876879` test) → GREEN commit (`da33e3b` feat). Gate sequence intact.
- Task 2: codifying-test commit (`ad1c222` test). The wiring it tests was implemented in Task 1's GREEN to satisfy Task 1's verify command. The 3 new wiring tests would have failed against the pre-Task-1 baseline, so they functionally serve as a delayed RED-equivalent assertion of Task 1's work.

---
*Phase: 02-data-ingestion*
*Completed: 2026-04-25*
