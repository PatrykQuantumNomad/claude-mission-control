---
phase: 04-stateful-apis
plan: 03
subsystem: backend
tags: [phase-4, tasks, dispatcher, router, tdd, transitions, subprocess, popen]
dependency-graph:
  requires:
    - phase-1: SQLModel Task table (Plan 01-05)
    - phase-3: cmc.api.schemas.common.ORMBase + per-router test convention (Plan 03-01)
    - phase-4-wave-0: cmc.api.schemas.tasks (7 DTOs), cmc.tasks.transitions.validate_transition, cmc.tasks.spawn.spawn_dispatcher_oneshot, conftest factory make_task_row (Plan 04-01)
    - phase-4-wave-1: cmc.api.routes.__init__ extension pattern locked by hitl_router (Plan 04-02)
  provides:
    - cmc.api.routes.tasks.router — 7 endpoints under /api (TASK-01..07)
    - tasks_router registration in cmc.api.routes.all_routers() — 9th /api router
    - HTTP write surface for the task lifecycle (create -> approve|patch -> rerun|delete)
    - HTTP trigger surface for one-shot dispatcher runs (TASK-07)
  affects:
    - Phase 7 dashboard (TPNL-01..02): task board + composer post here for create/approve/rerun/patch/delete
    - Phase 8 dispatcher (DISP-04): reads pending tasks ordered by priority + scheduled_for; the writer side is this router
    - Phase 8 dispatcher (DISP-01): consumes the subprocess this router spawns when TASK-07 fires
tech-stack:
  added: []
  patterns:
    - "Pure-function transition matrix delegation: TASK-03 PATCH calls cmc.tasks.transitions.validate_transition(old, new); router never inlines its own allow-list (single source of truth in transitions.py)"
    - "Fixed-target source-state validation: TASK-05 (approve) and TASK-06 (rerun) bypass the matrix because their target is fixed and they validate the SOURCE state inline (awaiting_approval / failed)"
    - "TaskTriggerRequest deliberately absent: trigger handler signature is `request: Request` only (NOT an empty Pydantic model — would force callers to send {} and 422 on missing)"
    - "subprocess.Popen detachment via cmc.tasks.spawn.spawn_dispatcher_oneshot — start_new_session=True isolates dispatcher from FastAPI's signal disposition (Pitfall 2)"
    - "Argv list (NEVER shell=True): T-04-03-01 mitigation — argv comes from Settings.dispatcher_oneshot_cmd; Phase 8 swaps the stub by editing settings, not router code"
    - "Test-time monkeypatch of cmc.tasks.spawn.repo_root + cmc.tasks.spawn.subprocess.Popen lets TASK-07 tests exercise the router end-to-end without spawning real processes or writing to .tmp/"
key-files:
  created:
    - backend/cmc/api/routes/tasks.py
    - .planning/phases/04-stateful-apis/04-03-SUMMARY.md
  modified:
    - backend/cmc/api/routes/__init__.py
    - backend/tests/test_phase4_tasks.py
decisions:
  - "TASK-04 returns 204 No Content (not 200 + {ok:true}) — REST idiom: the response body adds nothing the caller cannot already infer from the status code"
  - "TASK-06 rerun preserves pid + stdout_path on the Task row (clears only started_at/ended_at/error_message) — operators can still inspect the previous failed run's logs after pressing rerun; dispatcher overwrites both columns on the next run"
  - "TASK-07 returns 202 Accepted (not 201 / 200) — the dispatcher runs ASYNC of the response: by the time JSON returns, the subprocess is already detached"
  - "TASK-07 takes NO body in v1 — handler signature is `request: Request` only; locked by Wave 0 absence of TaskTriggerRequest"
  - "Tasks router registered AFTER hitl_router in all_routers() — preserves the wave dependency order in __init__.py imports (Plan 04-02 < Plan 04-03)"
metrics:
  duration_minutes: 8
  tasks_completed: 2
  files_changed: 3
  tests_after: 177
  tests_before: 160
  completed_date: "2026-04-26"
---

# Phase 4 Plan 03: Tasks Router Summary

7 task-management endpoints (TASK-01..07) shipped in `cmc.api.routes.tasks` under `/api`. TASK-03 PATCH delegates legal-target validation to the pure-function state machine in `cmc.tasks.transitions`; TASK-05 (approve) and TASK-06 (rerun) validate the source state inline because their target is fixed (always `pending`). TASK-07 spawns a detached one-shot dispatcher via `cmc.tasks.spawn.spawn_dispatcher_oneshot` (subprocess.Popen + start_new_session=True; argv from `Settings.dispatcher_oneshot_cmd`) and returns 202 + PID. 17 new tests bring the suite from 160 to 177/177 green.

## Endpoints Inventory

| Method | Path                              | Req body              | Response model            | Status codes        |
| ------ | --------------------------------- | --------------------- | ------------------------- | ------------------- |
| GET    | `/api/tasks`                      | (query: status, quadrant, limit, offset) | `TaskListResponse` | 200          |
| POST   | `/api/tasks`                      | `TaskCreate`          | `TaskListItem`            | 201                 |
| PATCH  | `/api/tasks/{task_id}`            | `TaskUpdate`          | `TaskListItem`            | 200 / 400 / 404     |
| DELETE | `/api/tasks/{task_id}`            | (none)                | (no body — 204 No Content) | 204 / 404         |
| POST   | `/api/tasks/{task_id}/approve`    | (none)                | `TaskApproveResponse`     | 200 / 400 / 404     |
| POST   | `/api/tasks/{task_id}/rerun`      | (none)                | `TaskRerunResponse`       | 200 / 400 / 404     |
| POST   | `/api/dispatcher/trigger`         | (none)                | `TaskTriggerResponse`     | 202                 |

All seven mounted under `/api` via `all_routers()` in `cmc.api.routes.__init__.py`, registered after `hitl_router` (9th and last entry).

## Transition Matrix Enforcement (TASK-03)

Source of truth: `cmc.tasks.transitions._ALLOWED_TRANSITIONS` (Plan 04-01).

| From state          | Allowed targets                                  |
| ------------------- | ------------------------------------------------ |
| `pending`           | `running`, `awaiting_approval`, `failed`, `done` |
| `awaiting_approval` | `pending`, `failed`                              |
| `running`           | `done`, `failed`                                 |
| `done`              | (terminal — no transitions allowed)              |
| `failed`            | `pending` (rerun resets)                         |

`patch_task` enforcement skeleton:

```python
updates = payload.model_dump(exclude_unset=True)
new_status = updates.get("status")
if new_status is not None and new_status != row.status:
    if not validate_transition(row.status, new_status):
        raise HTTPException(
            status_code=400,
            detail=f"invalid status transition: {row.status!r} -> {new_status!r}",
        )
for k, v in updates.items():
    setattr(row, k, v)
```

The matrix is bypassed by TASK-05 and TASK-06 because their target state is fixed: the source-state guard is the right invariant for those endpoints (`awaiting_approval` / `failed`), not the matrix.

**Validated by tests:**
- `test_task03_patch_legal_transition` — pending -> running succeeds (200; DB updated)
- `test_task03_patch_illegal_transition` — done -> pending returns 400 + `error` contains "invalid status transition"; DB row unchanged
- `test_task03_patch_partial_update` — PATCH without status only touches the supplied fields; status untouched
- `test_task03_patch_404` — non-existent id returns 404 + `error == "task not found"`

## subprocess.Popen Invocation Contract (TASK-07)

The handler is the thinnest possible wrapper around `cmc.tasks.spawn.spawn_dispatcher_oneshot`:

```python
@router.post("/dispatcher/trigger", response_model=TaskTriggerResponse, status_code=202)
async def trigger_dispatcher(request: Request) -> TaskTriggerResponse:
    settings = request.app.state.settings
    pid = spawn_dispatcher_oneshot(settings)
    return TaskTriggerResponse(triggered=True, pid=pid)
```

`spawn_dispatcher_oneshot` (Plan 04-01 spawn.py) calls `subprocess.Popen` with this kwarg contract:

| kwarg              | value                                       | purpose                                                              |
| ------------------ | ------------------------------------------- | -------------------------------------------------------------------- |
| (positional argv)  | `list(settings.dispatcher_oneshot_cmd)`     | argv list — NEVER `shell=True` (T-04-03-01 mitigation)               |
| `cwd`              | `str(repo_root())`                          | dispatcher resolves repo-root-anchored paths consistently            |
| `stdout`           | open file in `.tmp/.../oneshot-{ts}.log`    | append-binary, unbuffered                                            |
| `stderr`           | `subprocess.STDOUT`                         | merged into the same log                                             |
| `stdin`            | `subprocess.DEVNULL`                        | dispatcher never reads from the FastAPI process's stdin              |
| `start_new_session`| `True`                                      | Pitfall 2: Ctrl+C on uvicorn does NOT propagate to the dispatcher    |
| `close_fds`        | `True`                                      | dispatcher does not inherit FastAPI's open sockets / DB FDs          |

The local log file FD is closed in a `finally` after Popen returns (Pitfall 10) — the subprocess keeps its own dup so the log file stays open in the child.

**Validated by `test_task07_trigger_calls_subprocess_popen`:**
- Response is 202 Accepted with `{triggered: true, pid: 12345}`.
- `mock_popen.call_count == 1` (exactly one Popen call).
- `args[0]` is a list whose first element is `sys.executable` (matches `Settings.dispatcher_oneshot_cmd` default).
- `kwargs["start_new_session"] is True`.
- `kwargs["stdin"] == subprocess.DEVNULL`.
- `kwargs["close_fds"] is True`.

The test monkeypatches `cmc.tasks.spawn.repo_root` to `tmp_path` so the log directory lands in a hermetic location, and monkeypatches `cmc.tasks.spawn.subprocess.Popen` so no real process is spawned. This pattern is reusable for any future test that exercises subprocess-spawning code paths.

## Test Inventory (17 cases mapping to requirements)

| #  | Test                                                          | Requirement |
| -- | ------------------------------------------------------------- | ----------- |
| 1  | `test_task01_list_default`                                    | TASK-01     |
| 2  | `test_task01_list_status_filter`                              | TASK-01     |
| 3  | `test_task01_list_quadrant_filter`                            | TASK-01     |
| 4  | `test_task02_create`                                          | TASK-02     |
| 5  | `test_task02_create_minimal`                                  | TASK-02     |
| 6  | `test_task03_patch_legal_transition`                          | TASK-03     |
| 7  | `test_task03_patch_illegal_transition`                        | TASK-03     |
| 8  | `test_task03_patch_partial_update`                            | TASK-03     |
| 9  | `test_task03_patch_404`                                       | TASK-03     |
| 10 | `test_task04_delete`                                          | TASK-04     |
| 11 | `test_task04_delete_404`                                      | TASK-04     |
| 12 | `test_task05_approve_legal`                                   | TASK-05     |
| 13 | `test_task05_approve_illegal`                                 | TASK-05     |
| 14 | `test_task05_approve_404`                                     | TASK-05     |
| 15 | `test_task06_rerun_legal`                                     | TASK-06     |
| 16 | `test_task06_rerun_illegal`                                   | TASK-06     |
| 17 | `test_task07_trigger_calls_subprocess_popen`                  | TASK-07     |

Plus 1 carry-over Wave-0 smoke (`test_phase4_tasks_smoke`) = 18 tests in `test_phase4_tasks.py`.

## Test Counts

| Phase                       | Tests | Notes                              |
| --------------------------- | ----- | ---------------------------------- |
| Phase 1 (boot)              | 25    | Unchanged                          |
| Phase 2 (ingest)            | 36    | Unchanged                          |
| Phase 3 (read APIs)         | 69    | Unchanged                          |
| Phase 4 Wave 0 smokes       | 4     | Unchanged                          |
| Phase 4 HITL (Wave 1)       | 17    | Unchanged                          |
| Phase 4 ESTOP (Wave 1)      | 9     | Unchanged                          |
| Phase 4 Tasks (Wave 2)      | 17    | NEW (this plan; smoke kept inside test_phase4_tasks.py) |
| **Total**                   | **177** | All green; 0 failures           |

`backend/.venv/bin/python -m pytest backend/tests/` returns `177 passed in ~95s`.

## Entry Contracts for Downstream Plans

### Plan 04-04 (Schedules router — Wave 3)

`SCHD-04` GET /api/schedules/{id}/runs joins `schedules` with `tasks` via `tasks.schedule_id`. The Tasks router's TASK-02 already accepts `schedule_id` in the create payload (TaskCreate has the field). No coordination needed between routers — both touch `cmc/api/routes/__init__.py` so 04-04 lands in Wave 3 to avoid the merge conflict surface.

### Phase 7 dashboard (TPNL-01 + TPNL-02)

```typescript
// Task board: GET /api/tasks?status=pending|running|done&quadrant=...
type TaskListItem = {
  id: number;
  title: string;
  description: string;
  status: "pending" | "running" | "done" | "failed" | "awaiting_approval";
  priority: number;            // 1=high, 5=low
  quadrant: "do" | "plan" | "delegate" | "drop" | null;
  approval: "auto" | "awaiting_approval";
  risk: "low" | "medium" | "high" | null;
  dry_run: boolean;
  model: string | null;
  execution_mode: "interactive" | "classic" | "stream";
  skill: string | null;
  scheduled_for: string | null;
  schedule_id: number | null;
  pid: number | null;
  stdout_path: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  approved_at: string | null;
};

// Composer: POST /api/tasks with TaskCreate (title required; defaults applied server-side)
// Approve button: POST /api/tasks/{id}/approve  (only when status === "awaiting_approval")
// Rerun button:   POST /api/tasks/{id}/rerun    (only when status === "failed")
// Delete:         DELETE /api/tasks/{id}        (204 No Content)
// Dispatcher button: POST /api/dispatcher/trigger  (no body; returns 202 + pid)
```

The dashboard SHOULD only render the approve / rerun buttons when the task's `status` matches the source-state requirement. The server enforces the invariant defensively (400 on mismatch), but offering an action that always 400s is bad UX.

### Phase 8 dispatcher (DISP-04 + DISP-01)

`DISP-04` reads pending tasks via:

```sql
SELECT * FROM tasks
WHERE status = 'pending'
ORDER BY priority ASC, scheduled_for ASC NULLS LAST, created_at ASC
LIMIT N
```

The `idx_tasks_status_priority_scheduled` composite index from Plan 01-05 supports this query. The Tasks router is the writer side: every `POST /api/tasks` and every `POST /api/tasks/{id}/approve` and every `POST /api/tasks/{id}/rerun` produces a row in `status='pending'` that the dispatcher will pick up on its next heartbeat.

`DISP-01` (the dispatcher itself) is the subprocess that TASK-07 spawns. Phase 4 ships the stub at `cmc.dispatcher.oneshot:main` (Plan 04-01); Phase 8 replaces the stub by editing `Settings.dispatcher_oneshot_cmd`'s default — no router-code change is needed in this file.

## Deviations from Plan

None — plan executed exactly as written. Both atomic commits landed in order, RED gate failed before GREEN, GREEN passed all 17 new tests on the first run plus carry-over smoke. No stubs introduced; no Rule 1/2/3 fixes required.

## TDD Gate Compliance

Plan type: tdd. Both gates landed in order:

| Gate     | Commit  | Message                                                        |
| -------- | ------- | -------------------------------------------------------------- |
| RED      | e491cd3 | `test(04-03): add failing tests for TASK-01..07 (RED)`         |
| GREEN    | ac74135 | `feat(04-03): implement TASK-01..07 router (GREEN)`            |
| REFACTOR | (none)  | None needed — no duplication or dead code in the router        |

`git log --oneline backend/cmc/api/routes/tasks.py backend/tests/test_phase4_tasks.py` confirms the order.

## Self-Check: PASSED

All artifacts verified present:
- `backend/cmc/api/routes/tasks.py` FOUND (7 endpoints + module docstring + transition-matrix delegation comment + subprocess detachment commentary; 274 lines)
- `backend/cmc/api/routes/__init__.py` modified — `tasks_router` import on line 29, registration on line 43 (`grep -n tasks_router` finds both)
- `backend/tests/test_phase4_tasks.py` FOUND (17 TASK tests + 1 Wave-0 smoke)

Both task commits verified in `git log`:
- `e491cd3` (Task 1 RED) FOUND
- `ac74135` (Task 2 GREEN) FOUND

177/177 tests passing; 0 failures. `grep -n "tasks_router" backend/cmc/api/routes/__init__.py` finds both the import and the registration entry.
