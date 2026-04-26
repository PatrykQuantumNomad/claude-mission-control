---
phase: 04-stateful-apis
plan: 04
subsystem: backend
tags: [phase-4, schedules, router, tdd, cron, croniter, anthropic, nl-cron, recompute]
dependency-graph:
  requires:
    - phase-1: SQLModel Schedule + Task tables (Plan 01-05); Task.schedule_id FK is ON DELETE SET NULL
    - phase-3: cmc.api.schemas.common.ORMBase + per-router test convention (Plan 03-01)
    - phase-4-wave-0: cmc.api.schemas.schedules (7 DTOs), cmc.schedules.cron.{validate_cron, next_run}, cmc.schedules.nlcron.nl_to_cron, conftest factory make_schedule_row + mock_anthropic_client (Plan 04-01)
    - phase-4-wave-2: cmc.api.routes.__init__ extension pattern locked by tasks_router (Plan 04-03)
  provides:
    - cmc.api.routes.schedules.router — 6 endpoints under /api (SCHD-01..06)
    - schedules_router registration in cmc.api.routes.all_routers() — 10th /api router
    - HTTP write surface for the schedule lifecycle (create -> patch -> delete) with cron validation + next_run_at recompute invariant
    - HTTP read surface for schedule run history (last N tasks materialized from a schedule)
    - HTTP NL->cron entry point — 503-graceful when ANTHROPIC_API_KEY missing or model returns garbage
  affects:
    - Phase 7 dashboard (TPNL-03 + TPNL-04): schedule composer + schedule list post here for create/list/patch/delete + runs view
    - Phase 7 dashboard NL composer: POST /api/schedules/parse-nl turns "every weekday at 9am" into "0 9 * * 1-5" before the user submits POST /api/schedules
    - Phase 8 dispatcher (DISP-01): reads `schedules WHERE enabled=1 AND next_run_at <= now()` to materialize pending schedule rows into tasks every 120s — the writer side of next_run_at is THIS router (POST + PATCH paths populate it; PATCH-on-cron-change recomputes)
tech-stack:
  added: []
  patterns:
    - "Cron-validation-then-compute pattern: validate_cron BEFORE next_run inside the create/patch handlers — short-circuits the croniter constructor on bad input so the user gets a 422 instead of an unhandled ValueError"
    - "Clear-and-recompute on PATCH (Pitfall 7 + Open Q4): EITHER cron OR enabled change triggers next_run_at = next_run(...) when enabled, or NULL when disabled. Untouched on field-only PATCHes that don't affect either"
    - "tz-aware datetime.now(timezone.utc) at every cron boundary — naive bases would silently use local time (cmc.schedules.cron.next_run rejects naive inputs at the module boundary)"
    - "503-graceful NL fallback (Security V11): single 'natural-language schedules unavailable' message covers BOTH 'no API key' AND 'invalid model output' — distinguishing them would leak env config to localhost callers"
    - "Direct monkeypatch of cmc.api.routes.schedules.nl_to_cron in tests (cleaner than the AsyncAnthropic __import__ hack); the conftest mock_anthropic_client fixture remains available for tests that prefer it"
key-files:
  created:
    - backend/cmc/api/routes/schedules.py
    - .planning/phases/04-stateful-apis/04-04-SUMMARY.md
  modified:
    - backend/cmc/api/routes/__init__.py
    - backend/tests/test_phase4_schedules.py
decisions:
  - "SCHD-01 returns table-wide total (no filter parameters in v1); pagination via limit + offset only — mirrors Phase 3 list patterns"
  - "SCHD-02 strips cron whitespace before INSERT (consistent with cmc.schedules.cron.validate_cron's strip semantics)"
  - "SCHD-03 clear-and-recompute trigger is `cron_changed OR enabled_changed` (NOT just one or the other) — covers all four corners of the recompute matrix without branching: enable+cron-change recomputes; cron-change recomputes; enable-flip recomputes/clears; otherwise next_run_at untouched"
  - "SCHD-03 always refreshes updated_at on success — even when the only change is a no-op equality (model_dump returns the field but the equality check skips recompute). Acceptable: updated_at is the audit trail of 'someone touched this row', not 'next_run_at changed'"
  - "SCHD-04 returns 204 (no body) — REST idiom; the Task.schedule_id FK is ON DELETE SET NULL so historical runs are preserved"
  - "SCHD-05 returns 404 (not empty list) when the schedule does not exist — caller must distinguish 'no schedule' from 'schedule with zero runs'"
  - "SCHD-06 single 503 message hides whether the failure is missing API key vs invalid model output (Security V11) — both surface as 'natural-language schedules unavailable'"
  - "SCHD-06 tests monkeypatch cmc.api.routes.schedules.nl_to_cron at the import binding (NOT cmc.schedules.nlcron.nl_to_cron) — Python re-binds at import time so the latter would be a no-op (mirrors Plan 04-05's emergency_stop_all mock-site decision)"
  - "Test fix (Pitfall 4 cousin): SQLite strips tzinfo on round-trip; tests that compare `parsed > now-UTC` normalize naive datetimes to UTC before comparison — same workaround as Plan 04-02 HITL-06 idempotency check"
metrics:
  duration_minutes: 5
  tasks_completed: 2
  files_changed: 3
  tests_after: 193
  tests_before: 177
  completed_date: "2026-04-26"
---

# Phase 4 Plan 04: Schedules Router Summary

6 schedule-management endpoints (SCHD-01..06) shipped in `cmc.api.routes.schedules` under `/api`. SCHD-02 (POST) and SCHD-03 (PATCH) delegate cron validity to `cmc.schedules.cron.validate_cron` (croniter `is_valid`) and compute next firing via `cmc.schedules.cron.next_run` (tz-aware UTC base). The recompute invariant (Pitfall 7 + Open Q4) is enforced symmetrically across both endpoints: on first insert AND on every PATCH where `cron` OR `enabled` changes. SCHD-06 NL→cron returns 503 with a single error message for BOTH "no API key" and "invalid model output" (Security V11). 16 new tests bring the suite from 177 to 193/193 green.

## Endpoints Inventory

| Method | Path                                  | Req body         | Response model            | Status codes       |
| ------ | ------------------------------------- | ---------------- | ------------------------- | ------------------ |
| GET    | `/api/schedules`                      | (query: limit, offset) | `ScheduleListResponse` | 200          |
| POST   | `/api/schedules`                      | `ScheduleCreate` | `ScheduleListItem`        | 201 / 422 / 409    |
| PATCH  | `/api/schedules/{schedule_id}`        | `ScheduleUpdate` | `ScheduleListItem`        | 200 / 422 / 404 / 409 |
| DELETE | `/api/schedules/{schedule_id}`        | (none)           | (no body — 204 No Content) | 204 / 404        |
| GET    | `/api/schedules/{schedule_id}/runs`   | (query: limit)   | `ScheduleRunsResponse`    | 200 / 404          |
| POST   | `/api/schedules/parse-nl`             | `NLCronRequest`  | `NLCronResponse`          | 200 / 503          |

All six mounted under `/api` via `all_routers()` in `cmc.api.routes.__init__.py`, registered after `tasks_router` (10th and last entry).

## Recompute Matrix (SCHD-02 + SCHD-03)

The single source of truth for `next_run_at`: a row enabled at write time has it computed; a row disabled at write time has it `NULL`. The PATCH endpoint enforces the same rule on every transition that touches `cron` OR `enabled`.

| Operation                                  | enabled (after) | cron change | next_run_at outcome                         |
| ------------------------------------------ | --------------- | ----------- | ------------------------------------------- |
| POST  `enabled=true`                       | True            | n/a         | = `next_run(cron, now_utc)`                 |
| POST  `enabled=false`                      | False           | n/a         | = `NULL`                                    |
| PATCH `cron=new`             enabled stays | True            | yes         | = `next_run(new_cron, now_utc)` (RECOMPUTE) |
| PATCH `cron=new`             enabled stays | False           | yes         | = `NULL` (CLEARED — disabled rows hold no future firing) |
| PATCH `enabled=false`        cron stays    | False           | no          | = `NULL` (CLEARED)                          |
| PATCH `enabled=true`         cron stays    | True            | no          | = `next_run(cron, now_utc)` (RECOMPUTE)     |
| PATCH `name=new`             enabled stays, cron stays | (any) | no  | UNTOUCHED (recompute trigger gates on cron OR enabled change only) |

The `cron_changed OR enabled_changed` disjunction collapses these six cases into a single branch in `patch_schedule` — see [Pitfall 7 in Plan 04-RESEARCH.md].

## 503 Contract (SCHD-06)

`POST /api/schedules/parse-nl` returns 503 with body `{"error": "natural-language schedules unavailable"}` for ALL of the following failure modes — the caller cannot distinguish them from the response:

1. `ANTHROPIC_API_KEY` env var unset (`cmc.schedules.nlcron.nl_to_cron` early-returns `None`).
2. Model returns the literal string `"INVALID"` (no schedule implied).
3. Model returns text that fails `cmc.schedules.cron.validate_cron`.

Distinguishing case 1 from cases 2/3 would leak env-config information to localhost callers (Security V11). The dashboard SHOULD treat any 503 as a graceful "the NL composer is unavailable, fall back to the manual cron field" cue, not as an error to retry.

## Test Inventory (16 cases mapping to requirements)

| #  | Test                                                    | Requirement |
| -- | ------------------------------------------------------- | ----------- |
| 1  | `test_schd01_list`                                      | SCHD-01     |
| 2  | `test_schd02_create_valid_cron`                         | SCHD-02     |
| 3  | `test_schd02_create_disabled_skips_next_run`            | SCHD-02     |
| 4  | `test_schd02_create_invalid_cron`                       | SCHD-02     |
| 5  | `test_schd02_create_duplicate_name_409`                 | SCHD-02     |
| 6  | `test_schd03_patch_cron_change_recomputes_next_run`     | SCHD-03     |
| 7  | `test_schd03_patch_disable_clears_next_run`             | SCHD-03     |
| 8  | `test_schd03_patch_invalid_cron`                        | SCHD-03     |
| 9  | `test_schd03_patch_404`                                 | SCHD-03     |
| 10 | `test_schd04_delete`                                    | SCHD-04     |
| 11 | `test_schd04_delete_404`                                | SCHD-04     |
| 12 | `test_schd05_runs`                                      | SCHD-05     |
| 13 | `test_schd05_runs_404`                                  | SCHD-05     |
| 14 | `test_schd06_nl_cron_success_mocked`                    | SCHD-06     |
| 15 | `test_schd06_nl_cron_no_api_key_503`                    | SCHD-06     |
| 16 | `test_schd06_nl_cron_invalid_model_output_503`          | SCHD-06     |

Plus 1 carry-over Wave-0 smoke (`test_phase4_schedules_smoke`) = 17 tests in `test_phase4_schedules.py`.

## Test Counts

| Phase                       | Tests | Notes                              |
| --------------------------- | ----- | ---------------------------------- |
| Phase 1 (boot)              | 25    | Unchanged                          |
| Phase 2 (ingest)            | 36    | Unchanged                          |
| Phase 3 (read APIs)         | 69    | Unchanged                          |
| Phase 4 Wave 0 smokes       | 4     | Unchanged                          |
| Phase 4 HITL (Wave 1)       | 17    | Unchanged                          |
| Phase 4 ESTOP (Wave 1)      | 9     | Unchanged                          |
| Phase 4 Tasks (Wave 2)      | 17    | Unchanged                          |
| Phase 4 Schedules (Wave 3)  | 17    | NEW (this plan; 16 SCHD + smoke)   |
| **Total**                   | **193** | All green; 0 failures           |

`backend/.venv/bin/python -m pytest backend/tests/` returns `193 passed in ~89s`. NO real Anthropic API calls — `nl_to_cron` is monkeypatched at the router import binding for SCHD-06 success/invalid-output paths; the no-API-key path uses `monkeypatch.delenv` so the function early-returns.

## Entry Contracts for Downstream Plans

### Phase 7 dashboard (TPNL-03 + TPNL-04 — Schedule composer + list)

```typescript
// Schedule list
type ScheduleListItem = {
  id: number;
  name: string;
  cron: string;                       // 5-field unix cron
  enabled: boolean;
  next_run_at: string | null;         // ISO datetime, NULL when disabled
  last_run_at: string | null;
  task_template: Record<string, unknown>;
  skill: string | null;
  created_at: string;
  updated_at: string;
};

// Composer:  POST /api/schedules with ScheduleCreate
// Edit:      PATCH /api/schedules/{id} with ScheduleUpdate (only changed fields)
// Delete:    DELETE /api/schedules/{id}     (204 No Content)
// Runs:      GET   /api/schedules/{id}/runs (returns last 20 tasks by default)
// NL helper: POST  /api/schedules/parse-nl  ({description}) -> {cron, description}
//            On 503, gracefully hide the NL field and fall back to manual cron
```

The composer SHOULD call `parse-nl` first to get a cron string from the user's natural-language description, then submit POST /api/schedules with the result (and optionally allow the user to tweak the generated cron before submit). Server-side validation runs again on the submit, so a stale/garbage cron from the NL path still gets a 422.

### Phase 8 dispatcher (DISP-01 — Schedule materialization)

`DISP-01` reads pending schedules every 120s via:

```sql
SELECT * FROM schedules
WHERE enabled = 1
  AND next_run_at IS NOT NULL
  AND next_run_at <= :now_utc
```

The `idx_schedules_enabled_next_run` composite index from Plan 01-05 supports this query. For each row, the dispatcher creates a Task with `schedule_id={schedule.id}`, then UPDATEs `last_run_at = next_run_at` and recomputes `next_run_at = next_run(cron, now_utc)`. The Schedules router is the WRITER side of `cron` and the INITIAL writer of `next_run_at`; the dispatcher takes ownership of `next_run_at` advancement once the schedule starts firing.

The dispatcher MUST honor the same recompute rule on disable: if it observes `enabled=0` mid-cycle (operator disabled the schedule via PATCH), it should NOT advance `next_run_at` — the router has already cleared it. Reading `enabled` and `next_run_at` together (NOT JUST one) gives the dispatcher consistent semantics regardless of which row state it observes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test assertions on `tzinfo` failed because SQLite strips tz on round-trip**

- **Found during:** Task 2 (GREEN) test run.
- **Issue:** `test_schd02_create_valid_cron` and `test_schd03_patch_cron_change_recomputes_next_run` asserted `parsed.tzinfo is not None` on the `next_run_at` value returned from POST/PATCH. SQLite stores datetimes as naive ISO strings (no offset), so the response value comes back without `tzinfo` even though the value was inserted as a tz-aware UTC datetime. This is the same Pitfall-4 cousin documented in Plan 04-02 HITL-06's idempotency check.
- **Fix:** Tests now normalize naive parsed datetimes to UTC (`.replace(tzinfo=timezone.utc)`) before the futurity comparison, then continue with the assertion. Production behavior is correct (we always insert tz-aware, the value IS UTC); the test was over-strict on the wire format.
- **Files modified:** `backend/tests/test_phase4_schedules.py`
- **Commit:** `8a0ef25` (rolled into the GREEN commit since RED already had the over-strict assertion).

**This is the same pitfall the plan itself flagged in test 6's pitfall-awareness note** — the plan acknowledged that "the comparison must allow for either a naive or aware datetime in the response" but the initial RED tests asserted `tzinfo is not None` anyway. The GREEN-phase fix realigns the tests with the documented production behavior.

No other deviations. Both atomic commits landed in order, RED gate failed (16 new + 1 smoke pass = expected mix), GREEN passed all 17 schedule tests on the first run plus full-suite 193/193. No stubs introduced; no Rule 2/3 fixes required; no architectural-change asks (Rule 4).

## TDD Gate Compliance

Plan type: tdd. Both gates landed in order:

| Gate     | Commit  | Message                                                        |
| -------- | ------- | -------------------------------------------------------------- |
| RED      | 59402cf | `test(04-04): add failing tests for SCHD-01..06 (RED)`         |
| GREEN    | 8a0ef25 | `feat(04-04): implement SCHD-01..06 router (GREEN)`            |
| REFACTOR | (none)  | None needed — no duplication or dead code in the router        |

`git log --oneline backend/cmc/api/routes/schedules.py backend/tests/test_phase4_schedules.py` confirms the order: 59402cf adds the failing tests first, 8a0ef25 introduces the router and updates the tests in the same commit.

## Self-Check: PASSED

All artifacts verified present:
- `backend/cmc/api/routes/schedules.py` FOUND (6 endpoints + module docstring covering recompute matrix + 503 contract + Pitfall 7 reference; 250+ lines)
- `backend/cmc/api/routes/__init__.py` modified — `schedules_router` import on line 27, registration on line 47 (`grep -n schedules_router` finds both)
- `backend/tests/test_phase4_schedules.py` FOUND (16 SCHD tests + 1 Wave-0 smoke = 17 cases)

Both task commits verified in `git log`:
- `59402cf` (Task 1 RED) FOUND
- `8a0ef25` (Task 2 GREEN) FOUND

193/193 tests passing; 0 failures. NO real Anthropic network calls in tests (`nl_to_cron` monkeypatched at the router import binding for success + invalid-output cases; the no-API-key path uses `monkeypatch.delenv`).
