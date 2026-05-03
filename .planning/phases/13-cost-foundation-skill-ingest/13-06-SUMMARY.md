---
phase: 13-cost-foundation-skill-ingest
plan: 06
subsystem: testing
tags: [tests, e2e, integration, traceability, ANLY-01, ANLY-02, ANLY-03, ANLY-04, ANLY-05, INGST-11, INGST-12, INGST-13]

# Dependency graph
requires:
  - phase: 13-cost-foundation-skill-ingest
    provides: "Plans 01-05 — all Phase 13 source code (cmc.pricing module, 0002 alembic migration with pricing/sessions/otel_events/token_usage schema, cost router endpoints, doctor sensors, JSONL parser cache TTL split)"
provides:
  - "Plan 01 deferred async test stubs finalized: test_seed_loader_round_trip + test_pricing_window_self_correcting now pass (was 2 pytest.skip)"
  - "Single-test e2e trace exercising the full Phase 13 path: lifespan seed -> /v1/logs (skill_activated, dotted session.id, BUG-B path) -> idempotent re-POST -> /api/cost/summary -> /api/cost/breakdown"
  - "REPL-import-only test for roadmap success criterion #1 (compute_cost importable without app boot)"
  - "Shared db_session + seed_pricing fixtures in conftest.py with client-coexistence wiring (so tests can request both fixtures without lifespan double-entry)"
  - "Traceability matrix: every Phase 13 requirement (ANLY-01..05, INGST-11..13) maps to a passing test name + file path"
affects: [phase-14-skills-cost-ui, phase-15-alerts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "db_session fixture detects coexistence with `client` via request.fixturenames; when both are present, `client` owns the lifespan entry and `db_session` opens a session on the running engine without re-entering the context manager"
    - "seed_pricing is a marker fixture: lifespan ALREADY auto-seeds via Plan 01's load_seed; the fixture just asserts the precondition (5 SKUs present) so test signatures read intent-revealing"
    - "End-to-end test follows the freeze-date convention (2026-05-03): exact-Decimal arithmetic asserted with == not approx ($35 from 2M @ $5/Mtok + 1M @ $25/Mtok), no float drift"

key-files:
  created:
    - "backend/tests/test_phase13_e2e.py (179 lines, 2 tests)"
  modified:
    - "backend/tests/test_pricing.py (replaced 2 pytest.skip stubs with working async tests; +131 / -9 lines)"
    - "backend/tests/conftest.py (added db_session + seed_pricing fixtures with client-coexistence handling; +69 / -2 lines)"

key-decisions:
  - "db_session yields against the lifespan-booted app's engine (not a separate hermetic SQLite) — the 5 SKUs are already auto-seeded by load_seed, so the async tests verify post-seed state rather than seed-from-scratch state. Idempotency is proven by re-running load_seed and asserting models_seeded=0."
  - "test_pricing_window_self_correcting exercises the close_stmt UPDATE clause directly (not via load_seed monkeypatching pricing.json path) — proves the temporal-interval invariant without depending on file-system fixtures"
  - "test_phase13_full_trace re-fetches OtelEvent rows via a FRESH app.state.sessions() context (not the test-side db_session) because the ingest router commits via its own session and the test-side identity map would not see the commit"
  - "Freshness endpoint coverage was deliberately dropped from this plan (per the plan-checker note) — duplicates test_pricing_freshness_returns_hash_and_age in test_cost_router.py (Plan 04). Plan 06 references it from the traceability table."

patterns-established:
  - "Cross-fixture lifespan handoff: when two fixtures both need a booted app + lifespan, ONE of them (the higher-overhead one — typically `client`) enters the lifespan; the other detects via request.fixturenames and just opens a session on the running engine"
  - "Phase-level e2e tests live in tests/test_phase{N}_e2e.py and assert exact-Decimal totals against the freeze-date pricing rates"

# Metrics
duration: ~25 min
completed: 2026-05-03
---

# Phase 13 Plan 06: E2E Trace + Plan 01 Deferred Stubs Finalization Summary

**Closed Phase 13 by wiring Plan 01's two pytest.skip async stubs to working fixtures, adding a single end-to-end trace test that exercises every Phase 13 deliverable in one path, and proving every requirement traces to a green test (438 passed / 0 skipped, up from 434 + 2 skipped baseline).**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-03T13:08:00Z
- **Completed:** 2026-05-03T13:33:56Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- **Plan 01 stubs unstubbed.** `test_seed_loader_round_trip` (ANLY-02) and `test_pricing_window_self_correcting` (ANLY-03) now run real assertions against the lifespan-seeded pricing table. The deferred work tracked in Plan 01's done criteria is closed.
- **db_session + seed_pricing fixtures landed in conftest.py** with explicit client-coexistence handling. When a test requests both `client` and `db_session`, `client` owns the lifespan; when `db_session` is used standalone (e.g., by the Plan 01 stubs), it enters the lifespan itself. This pattern unblocks future async tests that don't need an HTTP layer.
- **End-to-end trace test (`test_phase13_full_trace`) lands the integration proof.** A single async test exercises: (1) lifespan auto-seed loaded 5 SKUs with `effective_from=2026-05-03`, (2) POST /v1/logs with synthetic skill_activated body using the dotted `session.id` key (LOCK-5 / BUG-B), (3) re-POST returns 200 and produces no second row (UNIQUE(session_id, otel_event_id) + on_conflict_do_nothing — INGST-13), (4) GET /api/cost/summary returns `total_usd="35"` (exact Decimal: 2M @ $5/Mtok + 1M @ $25/Mtok) with `rates_as_of: "2026-05-03"`, (5) GET /api/cost/breakdown?dim=skill returns the `data:analyze` row. A regression in any of Plans 01-05 surfaces here.
- **REPL-import smoke (`test_phase13_repl_import_compute_cost`)** locks roadmap success criterion #1: `from cmc.pricing import compute_cost` works without booting the app, and `compute_cost("claude-opus-4-7", 1_000_000, ...)` returns exactly `Decimal("5")` — no float drift, no DB.
- **Full-suite delta:** baseline `434 passed, 2 skipped` → after Plan 06 `438 passed, 0 skipped`. Net +4 (the 2 stubs now run + 2 new e2e tests). No regressions.

## Task Commits

1. **Task 1: Wire conftest fixtures + finalize Plan 01 deferred async tests** — `dad594c` (test)
2. **Task 2: Add Phase 13 end-to-end trace + db_session client-coexistence** — `b13de01` (test)

## Files Created/Modified

- **Created:** `backend/tests/test_phase13_e2e.py` — 2 tests (179 lines): `test_phase13_full_trace`, `test_phase13_repl_import_compute_cost`.
- **Modified:** `backend/tests/test_pricing.py` — replaced 2 `pytest.skip` stubs with working async cases; net +122 lines.
- **Modified:** `backend/tests/conftest.py` — added `db_session` (with client-coexistence detection) + `seed_pricing` (marker) fixtures; +67 lines.

## Phase 13 Requirement Traceability

The artifact gsd-verifier reads. Each Phase 13 requirement traces to at least one passing test:

| Requirement | Description                                            | Test name                                                                 | File path                              |
| ----------- | ------------------------------------------------------ | ------------------------------------------------------------------------- | -------------------------------------- |
| ANLY-01     | compute_cost returns Decimal, no float drift           | `test_compute_cost_decimal_no_float_drift`                                | `backend/tests/test_pricing.py`        |
| ANLY-01     | compute_cost importable from REPL without app boot     | `test_phase13_repl_import_compute_cost`                                   | `backend/tests/test_phase13_e2e.py`    |
| ANLY-02     | 5 SKUs seeded from data/pricing.json (idempotent)      | `test_seed_loader_round_trip`                                             | `backend/tests/test_pricing.py`        |
| ANLY-03     | Closed-open temporal intervals self-correct on update  | `test_pricing_window_self_correcting`                                     | `backend/tests/test_pricing.py`        |
| ANLY-04     | /api/cost/summary returns Decimal as JSON string       | `test_cost_summary_returns_decimal_strings`                               | `backend/tests/test_cost_router.py`    |
| ANLY-04     | /api/cost/breakdown total === /api/cost/summary total  | `test_breakdown_sums_to_summary`                                          | `backend/tests/test_cost_router.py`    |
| ANLY-04     | End-to-end summary chain (rates_as_of, total_usd > 0)  | `test_phase13_full_trace`                                                 | `backend/tests/test_phase13_e2e.py`    |
| ANLY-05     | doctor warns on stale pricing (>30d)                   | `test_pricing_freshness_warn_at_30d`                                      | `backend/tests/test_doctor.py`         |
| ANLY-05     | /api/pricing/freshness exposes hash + age              | `test_pricing_freshness_returns_hash_and_age`                             | `backend/tests/test_cost_router.py`    |
| ANLY-05     | doctor warns on unpriced (model, kind) buckets         | `test_unpriced_tokens_warn_per_bucket`                                    | `backend/tests/test_doctor.py`         |
| INGST-11    | OTLP logs extract attrs_skill_name from skill_activated| `test_otlp_logs_extracts_skill_name`                                      | `backend/tests/test_ingest.py`         |
| INGST-11    | End-to-end skill_name extraction + UI-side cost rollup | `test_phase13_full_trace`                                                 | `backend/tests/test_phase13_e2e.py`    |
| INGST-12    | Migration 0002 adds attrs_skill_name + cache TTL split | `test_0002_upgrade_from_0001`                                             | `backend/tests/test_migrations.py`     |
| INGST-12    | Migration 0002 reversible (downgrade restores 0001)    | `test_0002_downgrade_to_0001`                                             | `backend/tests/test_migrations.py`     |
| INGST-13    | (session_id, otel_event_id) UNIQUE dedups re-POST      | `test_otlp_logs_idempotent_session_seq`                                   | `backend/tests/test_ingest.py`         |
| INGST-13    | End-to-end re-POST dedup (event.sequence=1 stays at 1) | `test_phase13_full_trace` (step 4)                                        | `backend/tests/test_phase13_e2e.py`    |

All 8 requirements (ANLY-01..05 + INGST-11..13) covered by ≥1 passing test.

## Verification Results

```
$ cd backend && pytest tests/test_pricing.py tests/test_phase13_e2e.py -v --no-header
4 passed (test_pricing.py: 4/4 — was 2 passed + 2 skipped baseline)
2 passed (test_phase13_e2e.py)

$ cd backend && pytest tests/test_otel_parser.py tests/test_pricing.py tests/test_ingest.py \
                       tests/test_cost_router.py tests/test_doctor.py tests/test_migrations.py \
                       tests/test_phase13_e2e.py --no-header
80 passed (full Phase 13 plan-derived suite)

$ cd backend && pytest --no-header
438 passed, 1106 warnings in 146.76s
(was 434 passed + 2 skipped → +4 passing, 0 skipped)
```

## Roadmap Success Criteria

| # | Criterion                                                          | Status     | Evidence                                                                                          |
| - | ------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------- |
| 1 | `from cmc.pricing import compute_cost` works from REPL, no boot    | COMPLETE   | `test_phase13_repl_import_compute_cost`                                                           |
| 2 | /api/cost/summary returns non-zero total with rates_as_of populated | COMPLETE  | `test_phase13_full_trace` step 6 + `test_cost_summary_returns_decimal_strings`                    |
| 3 | "Rates as of" surfaces both inline + via /api/pricing/freshness    | COMPLETE   | `test_phase13_full_trace` (rates_as_of inline) + `test_pricing_freshness_returns_hash_and_age`    |
| 4 | skill_activated event populates attrs_skill_name (+ idempotent)    | COMPLETE   | `test_phase13_full_trace` steps 3-4 + `test_otlp_logs_extracts_skill_name`                        |
| 5 | ANLY-03 effective-window self-correction (Decimal exact)           | COMPLETE   | `test_pricing_window_self_correcting`                                                             |

## Deviations from Plan

**1. [Rule 3 - Blocking issue] db_session fixture initially failed when coexisting with client**

- **Found during:** Task 2 (running `test_phase13_full_trace` for the first time)
- **Issue:** Both `client` and `db_session` depend on the same `seeded_app` fixture, which returns a tuple `(app, cm)`. Pytest's function-scope caching means both fixtures share the SAME `cm` (an `_AsyncGeneratorContextManager`). The first fixture to enter `async with cm:` consumes its args; the second errors with `AttributeError: '_AsyncGeneratorContextManager' object has no attribute 'args'`.
- **Fix:** `db_session` now inspects `request.fixturenames`. When `"client"` is present in the test's fixture set, `db_session` skips entering the lifespan (relies on `client` to do it) and just opens a session on the already-running engine. When `client` is NOT requested, `db_session` enters the lifespan itself (preserving the Plan 01 stubs' standalone usage).
- **Files modified:** `backend/tests/conftest.py` (db_session fixture only)
- **Commit:** `b13de01` (the same Task 2 commit covers it)

No other deviations. Plan 04's note that "seed_pricing/seed_token_usage fixtures don't exist in conftest" was already known and acknowledged; Plan 06 added them as the plan's `files_modified` list permitted.

## Authentication Gates

None. The plan was fully autonomous (test-only changes against existing infrastructure).

## Self-Check: PASSED

- File `backend/tests/test_phase13_e2e.py` exists.
- File `backend/tests/test_pricing.py` modified (no `pytest.skip(...)` call sites remain — the only `pytest.skip` mention is in the module docstring as a historical reference).
- File `backend/tests/conftest.py` modified (db_session + seed_pricing fixtures present).
- Commit `dad594c` exists in git log.
- Commit `b13de01` exists in git log.
- Full suite: 438 passed, 0 skipped, 0 failed.
