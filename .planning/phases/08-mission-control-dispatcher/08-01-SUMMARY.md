---
phase: 08-mission-control-dispatcher
plan: 01
subsystem: dispatcher
tags: [dispatcher, sqlite-wal, launchd, python, asyncio, sqlalchemy, psutil, croniter]

# Dependency graph
requires:
  - phase: 04-stateful-apis
    provides: cmc.core.process.pid_dir, cmc.schedules.cron.next_run, cmc.dispatcher.oneshot stub, Settings.dispatcher_oneshot_cmd, Phase 4 conftest fixtures (tmp_pid_dir, make_task_row dict helper, mock_anthropic_client)
  - phase: 01-foundation-database
    provides: Task / Schedule / SystemState ORM models + indices (idx_tasks_status_priority_scheduled, idx_schedules_enabled_next_run); SQLite WAL via create_engine_for_settings PRAGMA listener
provides:
  - PID-file r/w contract (atomic os.replace, FileNotFoundError-tolerant unlink, psutil-mediated liveness)
  - Atomic claim primitive (BEGIN IMMEDIATE + UPDATE...RETURNING via engine.connect())
  - Schedules→tasks materializer (per-row SAVEPOINT, Pitfall-7-hardened beyond TypeError)
  - run_one_cycle async orchestration shell (try/finally tick stamp, emergency-stop early return, sweep+materialize+claim sequence)
  - 7 dispatcher Settings fields + bare-name env override (no CMC_ prefix — matches Phase 1 PORT/DB_PATH convention)
  - httpx promoted from dev to runtime dep (Plan 04 INBOX poster prerequisite)
  - Phase 8 single test file (backend/tests/test_phase8_dispatcher.py) with conftest extensions (tmp_pid_dir_monkey, mock_psutil_pids, make_task_orm, make_schedule_orm)
affects: [08-02 classic runner, 08-03 stream runner, 08-04 fan-out integration, 09-launchd-deployment, dashboard SAPI-04 consumers]

# Tech tracking
tech-stack:
  added: ["httpx>=0.28 (promoted from dev to runtime)"]
  patterns:
    - "Atomic claim via engine.connect() + manual BEGIN IMMEDIATE — bypasses AsyncSession auto-BEGIN/DEFERRED conflict (locked alternative: engine.connect().execution_options(isolation_level='SERIALIZABLE'))"
    - "Tick stamp at TOP of run_one_cycle wrapped in try/finally — Pitfall 5 (SAPI-04 liveness survives sweep/claim/materialize exceptions)"
    - "Per-schedule SAVEPOINT in materialize_due_schedules — IntegrityError + TypeError + SQLAlchemyError caught; one bad task_template doesn't poison the loop"
    - "Bad-template defense leaves next_run_at UNTOUCHED so SAPI-04 surfaces lag (Pitfall 7 visibility — operator notices misconfigured schedule)"
    - "Atomic PID file write: tmp + os.replace (POSIX rename) — Pitfall 10 mid-spawn SIGTERM cannot lose the PID reference"
    - "Plan 8 conftest naming convention: ALL new fixtures use unique names (tmp_pid_dir_monkey, make_task_orm) — DO NOT redefine Phase 4's tmp_pid_dir or make_task_row (would break ESTOP/HITL tests)"

key-files:
  created:
    - backend/cmc/dispatcher/state.py
    - backend/cmc/dispatcher/sweep.py
    - backend/cmc/dispatcher/claim.py
    - backend/cmc/dispatcher/materialize.py
    - backend/cmc/dispatcher/heartbeat.py
    - backend/tests/test_phase8_dispatcher.py
  modified:
    - backend/pyproject.toml
    - backend/uv.lock
    - backend/cmc/config/settings.py
    - backend/cmc/dispatcher/__init__.py
    - backend/tests/conftest.py

key-decisions:
  - "Dispatcher env var convention LOCKED at bare names (no CMC_ prefix) — matches Phase 1 PORT/DB_PATH/LOG_LEVEL convention; Plan deferred CMC_-prefix experiment that would have required env_prefix='CMC_' on SettingsConfigDict (would also require renaming all existing env vars)."
  - "claim_pending_tasks signature takes AsyncEngine (NOT AsyncSession) — AsyncSession auto-begins DEFERRED on first execute, conflicts with explicit BEGIN IMMEDIATE; engine.connect() gives untransacted Connection so we issue BEGIN IMMEDIATE ourselves before any auto-BEGIN"
  - "Pitfall 7 hardened beyond plan: catches IntegrityError + SQLAlchemyError + ValueError in addition to TypeError, because SQLModel/Pydantic accept unknown kwargs silently (extra='allow') — typo only fails at NOT NULL flush. Per-schedule SAVEPOINT prevents one bad row from poisoning the cycle."
  - "Per-task fan-out left as TODO in heartbeat.run_one_cycle — Plan 08-04 wires run_classic / run_stream once both runners exist (claim flips status='running' but no subprocess spawned this plan)"
  - "Conftest fixture additivity: tmp_pid_dir_monkey is DISTINCT from Phase 4's tmp_pid_dir (the latter just returns a path; Phase 8's variant additionally monkeypatches cmc.core.process.pid_dir + cmc.dispatcher.state._phase4_pid_dir). make_task_row gains optional timeout_s kwarg (backward-compatible for Plan 02's DISP-05 timeout test)."

patterns-established:
  - "Pattern (cross-cycle WAL serialization): BEGIN IMMEDIATE issued on a fresh engine.connect() Connection, before any auto-BEGIN. Returned dicts via .mappings().all() so callers route by execution_mode without ORM object lifetime concerns. Reusable for any future endpoint that needs SERIALIZABLE-equivalent semantics on SQLite"
  - "Pattern (atomic-write file): tmp.write_text + os.replace(tmp, final). Dispatcher PID files use this; pattern reusable for any future case where readers must see all-or-nothing file contents (status JSON, dispatcher heartbeat log)"
  - "Pattern (orchestrator try/finally for liveness signal): heartbeat.run_one_cycle wraps body in try/finally with stamp_tick at the TOP. Future dispatcher-adjacent loops (sync workers, watchdog) follow the same shape so SAPI-04-style staleness checks survive partial failures"
  - "Pattern (per-row SAVEPOINT for tolerance): materialize uses begin_nested() per schedule; rollback on bad row, commit on good. Reusable for any batch ingest where one bad record must not abort the batch (e.g., future bulk task creation, bulk schedule import)"
  - "Pattern (single-file Phase test convention): backend/tests/test_phase8_dispatcher.py is THE Phase 8 test file. Plans 02/03/04 APPEND DISP-05..12 sections; do not create per-plan files (mirrors Phase 4's monolithic phase-test convention)"
  - "Pattern (engine.dispose idempotency): tests that pass a manually-constructed engine into run_one_cycle do NOT need to patch dispose — pool.dispose() is safe to call multiple times; downstream session-factory calls reacquire connections through SQLAlchemy's pool"

# Metrics
duration: 11min
completed: 2026-04-27
---

# Phase 8 Plan 1: Mission Control Dispatcher Wave 1 (Foundations & State) Summary

**Atomic-claim primitive (BEGIN IMMEDIATE + UPDATE…RETURNING) plus PID-file contract, schedules-fan-out materializer, and async run_one_cycle orchestration shell — DISP-02/03 + atomic-claim half of DISP-01 + concurrency-cap half of DISP-04 land; per-task fan-out deferred to Plan 04 as documented TODO.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-04-27T21:11:17Z
- **Completed:** 2026-04-27T21:22:12Z
- **Tasks:** 2 (TDD; 4 commits = 2 RED + 2 GREEN)
- **Files modified:** 11 (6 created + 5 modified)

## Accomplishments

- **DISP-01 atomic claim**: `claim_pending_tasks(engine, slots)` serializes overlapping run_one_cycle invocations across processes via SQLite WAL `BEGIN IMMEDIATE`; verified by `asyncio.gather`-launching two cycles racing for slots=3 against 5 pending rows — neither double-claims nor strands a row.
- **DISP-01 schedules fan-out**: `materialize_due_schedules(db)` inserts Task rows from due Schedule.task_template, advances next_run_at via croniter, leaves next_run_at UNTOUCHED on bad-template (Pitfall 7 lag visibility).
- **DISP-02 emergency stop**: `run_one_cycle` early-returns when `system_state.emergency_stop='1'`; tick stamp still written (Pitfall 5).
- **DISP-03 stale-PID sweep**: `sweep_stale_pids()` walks `.tmp/mission-control-queue/pids/*.pid`, psutil-discriminates live vs dead, unlinks dead files, returns live set as DISP-04 input.
- **DISP-04 concurrency cap (half)**: `slots = max(0, max_concurrent - len(live_pids))`; verified that 3 live PIDs against `max_concurrent=3` produces 0 slots → no claim → 5 pending tasks remain pending.
- **Settings extended**: 7 dispatcher fields (claude_bin, claude_default_model, dispatcher_max_concurrent, dispatcher_classic_timeout_s, dispatcher_decision_timeout_s, dispatcher_followup_poll_s, dispatcher_answer_poll_s); env-overridable via bare names (`DISPATCHER_MAX_CONCURRENT=7` round-trips).
- **httpx promoted to runtime**: Plan 04 INBOX poster now importable without dev install.
- **Test infra**: 17 new tests (12 from Task 2 + 5 from Task 1); suite grows from 209 → 226 (all green).

## Task Commits

Each task was committed atomically following TDD (RED → GREEN):

1. **Task 1 RED — Failing tests for Settings + state.py + conftest fixtures** — `8c6231e` (test)
2. **Task 1 GREEN — Settings 7 fields, httpx promotion, state.py helpers** — `c975de6` (feat)
3. **Task 2 RED — Failing tests for sweep/claim/materialize/heartbeat** — `5a8b6cf` (test)
4. **Task 2 GREEN — Implementations of sweep, claim, materialize, heartbeat skeleton** — `f7b4eb3` (feat)

**Plan metadata:** _(this commit — see final_commit step)_

## Files Created/Modified

### Created

| File | Purpose | Public API |
|---|---|---|
| `backend/cmc/dispatcher/state.py` | Cross-cutting dispatcher state | `pid_dir()`, `write_pid_file(task_id, pid)`, `unlink_pid_file(task_id)`, `list_live_pids() -> set[int]`, `stamp_tick(sessions)`, `max_concurrent()`, `MAX_CONCURRENT=3` |
| `backend/cmc/dispatcher/sweep.py` | DISP-03 stale-PID pruner | `sweep_stale_pids() -> set[int]` |
| `backend/cmc/dispatcher/claim.py` | DISP-01 atomic claim | `claim_pending_tasks(engine: AsyncEngine, slots: int) -> list[dict]` |
| `backend/cmc/dispatcher/materialize.py` | DISP-01 schedules→tasks materializer | `materialize_due_schedules(db: AsyncSession) -> list[int]` |
| `backend/cmc/dispatcher/heartbeat.py` | DISP-01/02/04 orchestration shell | `run_one_cycle() -> int`, `MAX_CONCURRENT=3` |
| `backend/tests/test_phase8_dispatcher.py` | Phase 8 single test file (17 tests this plan; Plans 02/03/04 will append DISP-05..12) | _(test file)_ |

### Modified

| File | Change |
|---|---|
| `backend/pyproject.toml` | Promote `httpx>=0.28` from `[project.optional-dependencies].dev` to `[project].dependencies` |
| `backend/uv.lock` | Refreshed by `uv sync --all-extras` |
| `backend/cmc/config/settings.py` | Add 7 dispatcher fields after `dispatcher_oneshot_cmd`; `claude_bin` deliberately omitted from `_resolve_repo_root_paths` |
| `backend/cmc/dispatcher/__init__.py` | Re-export `run_one_cycle` from `cmc.dispatcher.heartbeat` |
| `backend/tests/conftest.py` | Add `tmp_pid_dir_monkey` + `mock_psutil_pids` fixtures, `make_task_orm` + `make_schedule_orm` helpers; extend `make_task_row` with `timeout_s` kwarg (backward-compat) |

## Settings fields added

| Field | Default | Env var | Purpose |
|---|---|---|---|
| `claude_bin` | `Path("/opt/homebrew/bin/claude")` | `CLAUDE_BIN` | Absolute path to claude CLI (launchd has no PATH) |
| `claude_default_model` | `"sonnet"` | `CLAUDE_DEFAULT_MODEL` | DISP-10 fallback when task.model is null |
| `dispatcher_max_concurrent` | `3` | `DISPATCHER_MAX_CONCURRENT` | DISP-04 cap |
| `dispatcher_classic_timeout_s` | `600` | `DISPATCHER_CLASSIC_TIMEOUT_S` | DISP-05 default classic timeout |
| `dispatcher_decision_timeout_s` | `3600` | `DISPATCHER_DECISION_TIMEOUT_S` | DISP-07 answer-poll cap |
| `dispatcher_followup_poll_s` | `1.0` | `DISPATCHER_FOLLOWUP_POLL_S` | DISP-09 queue-file poll cadence |
| `dispatcher_answer_poll_s` | `2.0` | `DISPATCHER_ANSWER_POLL_S` | DISP-07 decision-status poll cadence |

## Decisions Made

1. **Env var convention LOCKED at bare names (no CMC_ prefix).** Matches existing Phase 1 PORT/DB_PATH/LOG_LEVEL/STATIC_DIR convention; Plan 04's ANTHROPIC_API_KEY follows SDK convention. Adding env_prefix='CMC_' to SettingsConfigDict would require renaming all existing env vars and is a project-wide refactor — out of scope for this plan.

2. **claim_pending_tasks signature: `(engine: AsyncEngine, slots: int)` NOT `(db: AsyncSession, slots: int)`.** AsyncSession auto-begins DEFERRED transactions on first execute, which conflicts with explicit `BEGIN IMMEDIATE`. `engine.connect()` returns a Connection that hasn't begun any transaction yet, so we issue `BEGIN IMMEDIATE` ourselves before any auto-BEGIN. Heartbeat passes `engine` directly (not `sessions`) — claim owns its own connection lifecycle.

3. **Pitfall 7 hardened beyond plan**: catch `IntegrityError + SQLAlchemyError + ValueError` in addition to `TypeError`. SQLModel/Pydantic accept unknown kwargs silently (extra='allow') so a typo like `{"priorty": 5}` only fails at INSERT (NOT NULL on `title`). Per-schedule `db.begin_nested()` SAVEPOINT prevents the IntegrityError from poisoning the session for subsequent schedules in the same cycle.

4. **Per-task fan-out left as TODO**. heartbeat.run_one_cycle's claim flips status='running' but does NOT spawn subprocesses; Plan 08-04 wires `run_classic` (DISP-05/06) and `run_stream` (DISP-07/08) once both exist. This is documented in the heartbeat module docstring AND in the Plan 08-04 entry contract.

5. **Conftest fixture additivity**. `tmp_pid_dir_monkey` is a NEW fixture — distinct from Phase 4's `tmp_pid_dir(tmp_path)` which only returns a Path without monkeypatching. Phase 4 ESTOP tests continue to use `tmp_pid_dir`; Phase 8 dispatcher tests use `tmp_pid_dir_monkey`. `make_task_row` gains an optional `timeout_s=None` kwarg (backward-compatible — Plan 02's DISP-05 timeout tests will use it).

6. **Test infrastructure helper `_bootstrap_db(test_settings)`**: alembic-upgrades a fresh engine and returns `(engine, sessions)`. Mirrors `cmc.app.lifespan`'s `engine.begin() + conn.run_sync(_upgrade) + cfg.attributes['connection']` pattern (avoids `asyncio.run() cannot be called from running event loop` error from `command.upgrade(cfg, 'head')` in async tests).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's CMC_ env-prefix convention was incorrect**
- **Found during:** Task 1 GREEN (`test_settings_env_overrides`)
- **Issue:** Plan's `must_haves` truth said "Settings exposes claude_bin (...) — all env-overridable" with the implication of CMC_-prefixed env names. Pydantic-Settings does NOT auto-prefix; the existing Phase 1 settings prove this (PORT, DB_PATH, LOG_LEVEL all use bare names). Without `env_prefix='CMC_'` on SettingsConfigDict, `CMC_DISPATCHER_MAX_CONCURRENT=5` was silently ignored.
- **Fix:** Aligned tests with existing Phase 1 convention (bare names: `CLAUDE_BIN`, `DISPATCHER_MAX_CONCURRENT`). Added a project-wide decision note in Decisions Made above. Adding env_prefix would have been a 13-call rename across docs + tests + .env.example out of scope for Plan 8.
- **Files modified:** `backend/tests/test_phase8_dispatcher.py`
- **Verification:** Test passes; manual round-trip via `DISPATCHER_MAX_CONCURRENT=7 uv run python -c ...` prints 7.
- **Committed in:** `c975de6` (Task 1 GREEN)

**2. [Rule 2 - Missing Critical] materialize_due_schedules must catch IntegrityError + SQLAlchemyError + ValueError**
- **Found during:** Task 2 GREEN (`test_disp01_materialize_handles_bad_template`)
- **Issue:** Plan's action block said `except TypeError as exc:` for the bad-template case. SQLModel's `Task(**{"priorty": 5})` (typo) does NOT raise TypeError — Pydantic's extra='allow' silently absorbs unknown kwargs. The error fires later at `db.flush()` as `sqlite3.IntegrityError: NOT NULL constraint failed: tasks.title`. Without broader exception handling, the bad schedule would crash the entire cycle and mask the lag from SAPI-04.
- **Fix:** Wrap each schedule's INSERT in a `db.begin_nested()` SAVEPOINT; catch `(TypeError, IntegrityError, SQLAlchemyError, ValueError)`; rollback the savepoint on error (preserves session usability for subsequent schedules); leave next_run_at untouched (Pitfall 7 visibility preserved).
- **Files modified:** `backend/cmc/dispatcher/materialize.py`
- **Verification:** `test_disp01_materialize_handles_bad_template` passes; the good schedule still materializes despite the bad one's IntegrityError.
- **Committed in:** `f7b4eb3` (Task 2 GREEN)

**3. [Rule 1 - Test infra] AsyncEngine.dispose is read-only — `monkeypatch.setattr(engine, "dispose", ...)` raises AttributeError**
- **Found during:** Task 2 GREEN (`test_disp02_emergency_stop_early_return`, `test_disp01_one_cycle_smoke`, `test_disp04_concurrency_cap`, `test_disp_tick_stamp_on_exception`)
- **Issue:** Plan's test pattern attempted to no-op the heartbeat's `await engine.dispose()` call so the test could keep using its own engine after run_one_cycle. SQLAlchemy 2.0 marks `AsyncEngine.dispose` as a read-only attribute (defined via `__slots__` + property), so monkeypatch can't replace it.
- **Fix:** Removed the dispose-patch entirely. Confirmed by reading SQLAlchemy 2.0 source that `engine.dispose()` calls `pool.dispose()`, which is idempotent — subsequent session-factory calls just acquire fresh connections through the same pool. Tests work correctly with run_one_cycle disposing the engine; the test's own `finally: await engine.dispose()` is a harmless second call.
- **Files modified:** `backend/tests/test_phase8_dispatcher.py`
- **Verification:** All 4 heartbeat tests pass; full suite 226/226 green.
- **Committed in:** `f7b4eb3` (Task 2 GREEN)

---

**Total deviations:** 3 auto-fixed (1 bug, 1 missing-critical, 1 test-infra)
**Impact on plan:** All auto-fixes were necessary for correctness. Decision #1 (env-prefix convention) is the most architecturally significant — locks dispatcher env vars to bare names project-wide. Decisions #2-3 are implementation details that don't change the public API.

## Issues Encountered

None — all issues were caught early via TDD RED runs and resolved within Rules 1-3. Zero architectural escalations (Rule 4) needed.

## Atomic-Claim Contract Confirmation (cross-process WAL)

`test_disp01_claim_partitions_pending` is the canonical proof:

```python
results = await asyncio.gather(
    claim_pending_tasks(engine, 3),
    claim_pending_tasks(engine, 3),
)
ids_a = {r["id"] for r in results[0]}
ids_b = {r["id"] for r in results[1]}
assert ids_a.isdisjoint(ids_b)        # no double-claim
assert ids_a | ids_b == {1, 2, 3, 4, 5}  # full coverage
```

The first cycle gets the WAL write lock via BEGIN IMMEDIATE → claims rows 1-3 → commits. The second cycle's BEGIN IMMEDIATE blocks until commit (busy_timeout=5000), then re-evaluates the SELECT (which now sees only rows 4-5) and claims those. Result: exactly 5 rows distributed between the two cycles, no overlap.

This contract holds across two separate `python -m cmc.dispatcher.oneshot` processes (cross-process) because SQLite's WAL serialization is process-aware via the OS file-lock primitives.

## TODO Markers (Plan 04 finalizes)

- `cmc/dispatcher/heartbeat.py` line ~88: `# TODO(Plan 08-04): per-task fan-out via run_classic / run_stream.`
- `cmc/dispatcher/__init__.py` docstring: "Plans 08-02..04 add run_classic / run_stream / fan-out wiring."
- Plan 04's spawn logic will swap `cmc/dispatcher/oneshot.py:main` from the Phase 4 stub to `asyncio.run(run_one_cycle())`.

## User Setup Required

None — no external service configuration required for Plan 01. (Plan 04 will require launchd plist registration; documented separately.)

## Next Phase Readiness

- **Plan 08-02 (Wave 2: Classic runner)**: Foundation contract locked. Plan 02 imports `from cmc.dispatcher.state import write_pid_file, unlink_pid_file` for ESTOP-08 PID-file ownership and `from cmc.dispatcher.heartbeat import claim_pending_tasks` is NOT used (heartbeat owns claim). Plan 02 will add `cmc/dispatcher/runners/classic.py` with `run_classic(task_dict, settings)` and APPEND DISP-05/06 tests to `test_phase8_dispatcher.py`.
- **Plan 08-03 (Wave 2: Stream runner + decisions)**: Same foundation contract. Plan 03 adds `cmc/dispatcher/runners/stream.py` with `run_stream(task_dict, settings)` + DECISION/INBOX line parser; APPENDS DISP-07/08/09 tests.
- **Plan 08-04 (Wave 3: Fan-out + oneshot wire-up)**: Replaces the TODO in `heartbeat.py` with `await asyncio.gather(*runner_tasks)`; swaps `cmc/dispatcher/oneshot.py:main` from Phase 4 stub to `asyncio.run(run_one_cycle())`. APPENDS DISP-10/11/12 tests + integration smoke.

**Test count delta:** 209 → 226 (+17). Suite grows by ~17 each Plan; expect ~250+ at Phase 8 close.

## Self-Check: PASSED

Verified all created files exist and all commit hashes resolve:

- `backend/cmc/dispatcher/state.py` — FOUND
- `backend/cmc/dispatcher/sweep.py` — FOUND
- `backend/cmc/dispatcher/claim.py` — FOUND
- `backend/cmc/dispatcher/materialize.py` — FOUND
- `backend/cmc/dispatcher/heartbeat.py` — FOUND
- `backend/tests/test_phase8_dispatcher.py` — FOUND
- Commit `8c6231e` — FOUND
- Commit `c975de6` — FOUND
- Commit `5a8b6cf` — FOUND
- Commit `f7b4eb3` — FOUND
- Test suite: `cd backend && uv run pytest` → 226 passed (209 baseline + 17 new) — PASSED
- Env override smoke: `DISPATCHER_MAX_CONCURRENT=7 uv run python -c "..." → 7` — PASSED

---
*Phase: 08-mission-control-dispatcher*
*Completed: 2026-04-27*
