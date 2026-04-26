---
phase: 04-stateful-apis
plan: 05
subsystem: backend
tags: [phase-4, estop, system-router, tdd, kill-switch, kv-upsert]
dependency-graph:
  requires:
    - phase-3: cmc.api.routes.system (router exists; SAPI-03 whitelist already includes 'emergency_stop')
    - phase-4-wave-0 (Plan 04-01): cmc.core.process.emergency_stop_all + validate_pid_is_claude + StopSummary; cmc.api.schemas.system.EmergencyStopResponse + EmergencyResumeResponse
    - phase-1: SystemState + Task SQLModel tables, KV-upsert pattern
  provides:
    - "POST /api/system/emergency-stop — flag flip + ps-validated SIGTERM + running-task fail (ESTOP-01..03)"
    - "POST /api/system/emergency-resume — clears system_state.emergency_stop='0' (ESTOP-04)"
  affects:
    - phase-7-dashboard: TPNL-05 emergency stop banner consumes /api/system/state?key=emergency_stop
    - phase-8-dispatcher: DISP-02 early-return when emergency_stop='1' before each cycle
    - phase-4-plan-03: Tasks router's transition matrix should treat 'emergency stop' error_message as a recognizable rerun reason
tech-stack:
  added: []  # no new deps; leverages 04-01's croniter/anthropic foundation
  patterns:
    - "KV-upsert via sqlalchemy.dialects.sqlite.insert(...).on_conflict_do_update(index_elements=['key'], set_={...})"
    - "SQLAlchemy update().where(...).values(...) bulk UPDATE + result.rowcount for failed-task counter"
    - "Mock at the import site (cmc.api.routes.system.emergency_stop_all), not the definition site"
    - "Order-critical multi-step handler: flag flip COMMITTED before SIGTERM scan; SIGTERM scan before bulk UPDATE"
key-files:
  created:
    - .planning/phases/04-stateful-apis/04-05-SUMMARY.md
  modified:
    - backend/cmc/api/routes/system.py
    - backend/tests/test_phase4_estop.py
decisions:
  - "ESTOP-04 clear semantics LOCKED (RESEARCH A3): UPDATE system_state SET value='0' (do NOT DELETE the row) so SAPI-03 distinguishes 'flag explicitly cleared' from 'flag never set'"
  - "Order of operations (Pitfall 8): flag flip BEFORE PID kill BEFORE task UPDATE — dispatcher's own DISP-02 early-return engages on the flag value so concurrent dispatcher cycles cannot re-flip 'failed' back to 'running' mid-handler"
  - "PID validation rule LOCKED: ps -p PID -o command= must contain BOTH 'claude' substring AND ' -p' (literal flag with leading space) — avoids '--prefix=claude' / '--processes=N' false positives"
  - "Race window between validate_pid_is_claude and os.kill(SIGTERM) ACCEPTED for v1 (Pitfall 4) — partly mitigated via ProcessLookupError -> 'missing' bucket; full mitigation deferred to Phase 9 hardening"
  - "Test mock site LOCKED: cmc.api.routes.system.emergency_stop_all (the import) NOT cmc.core.process.emergency_stop_all (the definition); Python re-binds at import time so the latter is a no-op"
metrics:
  duration_minutes: ~12
  tasks_completed: 2
  files_changed: 2
  tests_after: 160
  tests_before: 151
  completed_date: "2026-04-26"
---

# Phase 4 Plan 05: Emergency Stop Summary

Two POST endpoints appended to the existing `cmc.api.routes.system` module: `/api/system/emergency-stop` (KV-upserts the flag, scans `.tmp/.../pids/`, ps-validates each PID, SIGTERMs matching ones, and UPDATEs every running task to `status='failed'`) and `/api/system/emergency-resume` (KV-upserts the flag back to `'0'`, NOT a DELETE). 10 TDD tests; full suite 160/160 green.

## Endpoints

### POST `/api/system/emergency-stop` (ESTOP-01..03)

```http
POST /api/system/emergency-stop
(no request body)

200 OK
{
  "emergency_stop": true,
  "terminated_pids": [int, ...],
  "skipped_pids":    [int, ...],
  "missing_pids":    [int, ...],
  "failed_running_tasks": int
}
```

**Order of operations (committed to the contract):**

1. KV-upsert `system_state.emergency_stop = '1'` and **commit** the txn so the dispatcher's next DISP-02 cycle sees the flag.
2. Call `cmc.core.process.emergency_stop_all()` which scans `.tmp/mission-control-queue/pids/*.pid`, `ps`-validates each PID requires `'claude'` substring AND `' -p'` substring, and `os.kill(SIGTERM)` matching ones (NOT SIGKILL — dispatcher's shutdown handler can run).
3. `UPDATE tasks SET status='failed', ended_at=now, error_message='emergency stop' WHERE status='running'` and commit.

Steps 2 and 3 are intentionally serial after step 1 so the dispatcher cannot re-flip a `'failed'` row back to `'running'` between them. In practice the dispatcher's own DISP-02 early-return on the flag value prevents this; serial ordering keeps the invariant even if the dispatcher's polling cadence drifts.

### POST `/api/system/emergency-resume` (ESTOP-04)

```http
POST /api/system/emergency-resume
(no request body)

200 OK
{
  "emergency_stop": false
}
```

KV-upserts `system_state.emergency_stop = '0'`. The row is NOT deleted (per RESEARCH A3 / Open Q3) — SAPI-03 readers can distinguish `'flag was set then cleared'` (row with value `'0'`) from `'flag never set'` (row absent), even though both translate to the same UI behavior. Upsert path means the resume endpoint works correctly even without a prior stop.

## PID Validation Rule (ESTOP-02)

```python
def validate_pid_is_claude(pid: int) -> bool:
    out = subprocess.run(
        ["ps", "-p", str(int(pid)), "-o", "command="],
        capture_output=True, text=True, timeout=2, check=False,
    )
    if out.returncode != 0:
        return False
    line = out.stdout.strip()
    return ("claude" in line) and (" -p" in line)
```

**Why both substrings:** the literal `' -p'` flag (with leading space) avoids false positives like `claude --prefix=foo` or `claude --processes=4` where `--p...` could otherwise match.

**Race window acknowledgement (Pitfall 4):** between `validate_pid_is_claude(pid)` returning True and `os.kill(pid, SIGTERM)` actually firing, the kernel may recycle the PID to an unrelated process. We catch `ProcessLookupError` (PID gone) and route it to `missing_pids`; we do NOT catch the recycled-to-different-process case in v1. Phase 9 hardening can introduce a `prctl(PR_SET_PDEATHSIG)` or pidfd-based variant.

## Test Inventory (10 cases, all in `backend/tests/test_phase4_estop.py`)

| Test | Requirement | What it proves |
|------|-------------|----------------|
| `test_estop01_stop_with_no_pids_or_running_tasks` | ESTOP-01 | Happy-path no-op: empty PID lists, 0 failed tasks, flag persists at `'1'` |
| `test_estop01_stop_with_pid_files_validates_via_ps` | ESTOP-01 | `skipped_pids` surfaces correctly when ps-validation rejects (mocked at import site) |
| `test_estop02_validate_pid_is_claude_positive` | ESTOP-02 | Live pytest process returns False; mocked `claude -p ...` cmdline returns True |
| `test_estop02_validate_pid_is_claude_negative_no_p_flag` | ESTOP-02 | `'claude --prefix=foo'` correctly rejected (no literal `' -p'`) |
| `test_estop02_validate_pid_is_claude_dead_pid` | ESTOP-02 | `ps` returncode=1 (dead PID) returns False |
| `test_estop03_running_tasks_marked_failed` | ESTOP-03 | Both running tasks transition to `failed` with `error_message='emergency stop'` and `ended_at` set |
| `test_estop03_done_tasks_unchanged` | ESTOP-03 | `WHERE status='running'` filter is honored — `done` tasks untouched |
| `test_estop04_resume_clears_flag` | ESTOP-04 | Stop -> row.value='1'; resume -> row STILL EXISTS with value='0' |
| `test_estop04_resume_no_prior_stop` | ESTOP-04 | Upsert path: resume without prior stop creates row at value='0' |
| `test_estop_emergency_stop_visible_via_sapi03` | Cross-plan | SAPI-03 surfaces `'emergency_stop': '1'` after ESTOP write — confirms KV column shape agreement |

### Mocking pattern locked

```python
# DO mock at the import site:
monkeypatch.setattr(
    "cmc.api.routes.system.emergency_stop_all",  # router's local binding
    lambda: StopSummary(terminated=[], skipped=[], missing=[]),
)

# DO NOT mock at the definition site:
# monkeypatch.setattr("cmc.core.process.emergency_stop_all", ...)
# ^ Python's `from cmc.core.process import emergency_stop_all` re-binds at
#   import time, so patching the source no longer affects the router.
```

For ps-validation tests, the mock site is `cmc.core.process.subprocess.run` (the function called inside `validate_pid_is_claude`).

## Test Counts

| Phase | Tests | Notes |
|-------|-------|-------|
| Phase 1 (boot) | 25 | Unchanged |
| Phase 2 (ingest) | 36 | Unchanged |
| Phase 3 (read APIs) | 69 | Unchanged |
| Phase 4 Wave 0 | 4 | Wave 0 smokes (test_phase4_{hitl,tasks,schedules,estop}_smoke) |
| Phase 4 HITL (Plan 04-02 RED) | 17 | Already landed before this plan ran |
| **Phase 4 ESTOP (this plan)** | **10** | NEW: replaces the 1 smoke with 10 detailed cases |
| **Total** | **160** | All green |

`backend/.venv/bin/python -m pytest backend/tests/ -p no:warnings` returns `160 passed in ~94s`.

## Entry Contracts for Downstream Phases

### Phase 7 dashboard (TPNL-05 emergency stop banner)

```http
GET /api/system/state?key=emergency_stop
-> 200 {"items": {"emergency_stop": "1"}}     # active
-> 200 {"items": {"emergency_stop": "0"}}     # cleared
-> 404 {"error": "key not found"}             # never set (clean install)
```

The dashboard banner SHOULD render on `'1'`, hide on `'0'` OR 404. Treat 404 as 'no estop active' — Plan 03-02's whitelist returns 404 for both 'non-whitelisted' and 'whitelisted-but-absent', so the banner code does not need to distinguish them.

### Phase 8 dispatcher (DISP-02 early-return)

```python
async def dispatcher_cycle(...):
    row = await db.execute(
        select(SystemState).where(SystemState.key == "emergency_stop")
    )
    state = row.scalar_one_or_none()
    if state and state.value == "1":
        return  # ESTOP active — skip this cycle entirely
    ...
```

Note: `value='0'` (or row absent) means "not stopped". The dispatcher MUST NOT key on row presence alone — Plan 04-05 leaves the row in place after resume, so `row is not None` is insufficient.

## Deviations from Plan

None — plan executed exactly as written.

The plan's Task 1 instructions explicitly recommended seeding running tasks via the seeded_app's sessionmaker (`app.state.sessions`) and mocking `emergency_stop_all` at `cmc.api.routes.system.emergency_stop_all` (the import site). Both patterns followed verbatim. Task 2's append-only edits to `system.py` did not require any imports beyond what the plan listed. `backend/cmc/api/routes/__init__.py` was NOT touched (system_router already registered by Plan 03-02), as required.

## Self-Check: PASSED

All artifacts verified present:

- `backend/cmc/api/routes/system.py` — extended (NOT replaced); contains `/system/emergency-stop` (line 375) and `/system/emergency-resume` (line 435).
- `backend/tests/test_phase4_estop.py` — 10 test cases all passing.
- `backend/cmc/api/routes/__init__.py` — UNCHANGED (verified via `git status --short` — only system.py + test file modified).

All 2 task commits verified in `git log`:

- `4e7252d` (Task 1 RED) FOUND — `test(04-05): add failing tests for ESTOP-01..04 (RED)`
- `ca2e667` (Task 2 GREEN) FOUND — `feat(04-05): implement ESTOP-01..04 on system router (GREEN)`

160/160 tests passing; 0 failures.

## TDD Gate Compliance

- RED gate: commit `4e7252d` is a `test(...)` commit; tests landed in failing state (7/10 fail with `AttributeError: cmc.api.routes.system has no attribute 'emergency_stop_all'`, 3/10 pass — those 3 exercise `cmc.core.process` directly which Wave 0 already implemented).
- GREEN gate: commit `ca2e667` is a `feat(...)` commit AFTER `4e7252d`; all 10 tests now pass.
- REFACTOR gate: skipped intentionally (no cleanup needed; the GREEN code is idiomatic SQLAlchemy 2.0 async + matches Phase 3 router style).

Gate sequence valid: `test(...)` -> `feat(...)`.
