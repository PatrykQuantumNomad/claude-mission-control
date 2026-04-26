---
phase: 04-stateful-apis
plan: 01
subsystem: backend
tags: [phase-4, foundation, schemas, helpers, croniter, anthropic, conftest]
dependency-graph:
  requires:
    - phase-1: SQLModel tables (decisions, inbox, tasks, schedules, system_state) + cmc.core.paths.repo_root
    - phase-2: ingestion stack (no direct dep, but lifespan + sessionmaker primitives reused)
    - phase-3: cmc.api.schemas.common (ORMBase + ErrorResponse) + per-router test convention
  provides:
    - cmc.dispatcher.oneshot:main (Phase-4 stub; Phase 8 replaces)
    - Settings.dispatcher_oneshot_cmd (argv list for TASK-07)
    - cmc.api.schemas.hitl (11 DTOs for HITL-01..07)
    - cmc.api.schemas.tasks (7 DTOs for TASK-01..07; TaskTriggerRequest intentionally absent)
    - cmc.api.schemas.schedules (7 DTOs for SCHD-01..06)
    - cmc.api.schemas.system extended with EmergencyStopResponse + EmergencyResumeResponse
    - cmc.core.queue (write_decision_answer + write_inbox_reply + queue_path)
    - cmc.core.process (validate_pid_is_claude + emergency_stop_all + StopSummary)
    - cmc.tasks.transitions (validate_transition state-machine)
    - cmc.tasks.spawn (spawn_dispatcher_oneshot)
    - cmc.schedules.cron (validate_cron + next_run)
    - cmc.schedules.nlcron (nl_to_cron — async; 503-graceful)
    - conftest factories (make_decision_row, make_inbox_row, make_task_row, make_schedule_row)
    - conftest fixtures (tmp_pid_dir, mock_anthropic_client)
    - 4 Phase-4 test scaffold files (test_phase4_{hitl,tasks,schedules,estop}.py)
  affects:
    - Wave 1 plans 04-02 (HITL), 04-03 (Tasks), 04-04 (Schedules), 04-05 (ESTOP) all import from this foundation
tech-stack:
  added:
    - croniter==6.2.2 (cron parsing + next-run computation)
    - anthropic==0.97.0 (NL→cron via Claude Haiku 4.5 for SCHD-06)
  patterns:
    - "Local-import for optional SDKs (anthropic only loaded when SCHD-06 is hit)"
    - "Pure-function state machine for status transitions (small, static, explicit allow-list)"
    - "Single source of truth for queue paths (cmc.core.queue owns .tmp/mission-control-queue/{decisions,inbox})"
    - "list[str] argv via Settings.dispatcher_oneshot_cmd (Phase 8 replaces stub by editing settings, not router code)"
key-files:
  created:
    - backend/cmc/dispatcher/__init__.py
    - backend/cmc/dispatcher/oneshot.py
    - backend/cmc/tasks/__init__.py
    - backend/cmc/tasks/transitions.py
    - backend/cmc/tasks/spawn.py
    - backend/cmc/schedules/__init__.py
    - backend/cmc/schedules/cron.py
    - backend/cmc/schedules/nlcron.py
    - backend/cmc/core/queue.py
    - backend/cmc/core/process.py
    - backend/cmc/api/schemas/hitl.py
    - backend/cmc/api/schemas/tasks.py
    - backend/cmc/api/schemas/schedules.py
    - backend/tests/test_phase4_hitl.py
    - backend/tests/test_phase4_tasks.py
    - backend/tests/test_phase4_schedules.py
    - backend/tests/test_phase4_estop.py
  modified:
    - backend/pyproject.toml
    - backend/uv.lock
    - backend/cmc/config/settings.py
    - backend/cmc/api/schemas/system.py
    - backend/tests/conftest.py
decisions:
  - "Open Q1 (queue path layout) RESOLVED: .tmp/mission-control-queue/{decisions,inbox}/{id}.jsonl mirrors SESS-06's messages/ sibling directory shape"
  - "Open Q2 (status transition matrix) LOCKED v1: pending↔running/awaiting_approval/failed/done; awaiting_approval→{pending,failed}; running→{done,failed}; done terminal; failed→pending (for rerun)"
  - "Open Q5 (TASK-07 dispatcher cmd) RESOLVED via Settings.dispatcher_oneshot_cmd argv list (Phase 8 swaps stub by editing default, not router code)"
  - "Open Q6 (Anthropic env var) LOCKED: ANTHROPIC_API_KEY (SDK convention); missing key → nl_to_cron returns None → router 503"
  - "Open Q7 (answered_by typing) LOCKED: Literal['dashboard','telegram','cli'] beats free-text for cleaner UI typing"
  - "TaskTriggerRequest intentionally NOT defined — trigger endpoint takes NO body in v1; FastAPI handler should omit body parameter rather than declaring an empty Pydantic model"
metrics:
  duration_minutes: ~25
  tasks_completed: 4
  files_changed: 22
  tests_after: 134
  tests_before: 130
  completed_date: "2026-04-26"
---

# Phase 4 Plan 01: Phase 4 Foundation Summary

Wave 0 foundation for Phase 4 stateful APIs: croniter + anthropic deps, 4 Pydantic v2 schema modules + ESTOP DTOs, file-queue writer, PID-scan ESTOP helper, task transitions matrix + dispatcher spawn, cron parser + Anthropic Haiku NL→cron, dispatcher stub, and conftest extension with 4 factories + 2 fixtures + 4 test scaffolds (134/134 tests green).

## Deps Installed

| Library    | Version  | Purpose                                              |
| ---------- | -------- | ---------------------------------------------------- |
| croniter   | 6.2.2    | Parse 5-field cron exprs + compute next-run datetime |
| anthropic  | 0.97.0   | AsyncAnthropic SDK for SCHD-06 NL→cron via Haiku 4.5 |

`backend/pyproject.toml` runtime dependencies extended with both pins; `uv sync --all-extras` resolved cleanly. `croniter.is_valid('0 9 * * *')` returns True; `from anthropic import AsyncAnthropic` succeeds.

## DTO Inventory

### `cmc.api.schemas.hitl` (HITL-01..07)

| DTO                         | Base       | Used by                                            |
| --------------------------- | ---------- | -------------------------------------------------- |
| `DecisionListItem`          | ORMBase    | GET /api/decisions response item                   |
| `DecisionListResponse`      | BaseModel  | GET /api/decisions envelope (items + total)        |
| `DecisionCreate`            | BaseModel  | POST /api/decisions request body                   |
| `DecisionAnswerRequest`     | BaseModel  | POST /api/decisions/{id}/answer body               |
| `DecisionAnswerResponse`    | BaseModel  | POST /api/decisions/{id}/answer response           |
| `InboxListItem`             | ORMBase    | GET /api/inbox response item                       |
| `InboxListResponse`         | BaseModel  | GET /api/inbox envelope                            |
| `InboxCreate`               | BaseModel  | POST /api/inbox request body                       |
| `InboxReadResponse`         | BaseModel  | POST /api/inbox/{id}/read response                 |
| `InboxReplyRequest`         | BaseModel  | POST /api/inbox/{id}/reply body                    |
| `InboxReplyResponse`        | BaseModel  | POST /api/inbox/{id}/reply response                |

`DecisionAnswerRequest.answered_by` is `Literal["dashboard", "telegram", "cli"]` (Open Q7 resolution).

### `cmc.api.schemas.tasks` (TASK-01..07)

| DTO                       | Base       | Used by                                          |
| ------------------------- | ---------- | ------------------------------------------------ |
| `TaskListItem`            | ORMBase    | GET /api/tasks item (all 19 Task columns)        |
| `TaskListResponse`        | BaseModel  | GET /api/tasks envelope                          |
| `TaskCreate`              | BaseModel  | POST /api/tasks body (TASK-02)                   |
| `TaskUpdate`              | BaseModel  | PATCH /api/tasks/{id} body (TASK-03)             |
| `TaskApproveResponse`     | BaseModel  | POST /api/tasks/{id}/approve response (TASK-05)  |
| `TaskRerunResponse`       | BaseModel  | POST /api/tasks/{id}/rerun response (TASK-06)    |
| `TaskTriggerResponse`     | BaseModel  | POST /api/dispatcher/trigger response (TASK-07)  |

`TaskTriggerRequest` deliberately omitted. The trigger endpoint takes no body in v1 — the FastAPI handler should omit any body parameter entirely rather than declaring an empty Pydantic model that would force `{}` payloads and 422 on missing.

### `cmc.api.schemas.schedules` (SCHD-01..06)

| DTO                       | Base       | Used by                                              |
| ------------------------- | ---------- | ---------------------------------------------------- |
| `ScheduleListItem`        | ORMBase    | GET /api/schedules item (all 9 columns)              |
| `ScheduleListResponse`    | BaseModel  | GET /api/schedules envelope                          |
| `ScheduleCreate`          | BaseModel  | POST /api/schedules body (SCHD-02)                   |
| `ScheduleUpdate`          | BaseModel  | PATCH /api/schedules/{id} body (SCHD-03)             |
| `ScheduleRunsResponse`    | BaseModel  | GET /api/schedules/{id}/runs (cross-imports TaskListItem) |
| `NLCronRequest`           | BaseModel  | POST /api/schedules/parse-nl body (SCHD-06)          |
| `NLCronResponse`          | BaseModel  | POST /api/schedules/parse-nl response                |

### `cmc.api.schemas.system` (extended; existing DTOs preserved)

| DTO                          | Base       | Used by                                       |
| ---------------------------- | ---------- | --------------------------------------------- |
| `EmergencyStopResponse`      | BaseModel  | POST /api/system/emergency-stop (ESTOP-01..03)|
| `EmergencyResumeResponse`    | BaseModel  | POST /api/system/emergency-resume (ESTOP-04)  |

## Public API Contracts

### `cmc.core.queue`

```python
QUEUE_ROOT_REL = ".tmp/mission-control-queue"
def queue_path(sub: str, key: str) -> Path
def write_decision_answer(decision_id: int, answer: str, answered_by: str) -> Path
def write_inbox_reply(inbox_id: int, reply: str) -> Path
```

JSONL line shape (decisions): `{"ts": iso_utc, "decision_id": id, "answer": str, "answered_by": str}`. JSONL line shape (inbox): `{"ts": iso_utc, "inbox_id": id, "reply": str}`. Phase 8 dispatcher reads from these paths — Phase 4 is the writer side.

### `cmc.core.process`

```python
PID_DIR_REL = ".tmp/mission-control-queue/pids"
class StopSummary(TypedDict):
    terminated: list[int]
    skipped: list[int]
    missing: list[int]

def pid_dir() -> Path
def validate_pid_is_claude(pid: int) -> bool
def emergency_stop_all(pid_directory: Optional[Path] = None) -> StopSummary
```

`validate_pid_is_claude` runs `ps -p PID -o command=` and matches both `claude` substring AND ` -p` flag (literal-flag-with-leading-space — avoids `--prefix=claude` false positives). `emergency_stop_all` SIGTERMs (NOT SIGKILL — dispatcher's shutdown handler can run) matching PIDs and reports per-PID outcome via TypedDict.

### `cmc.tasks.transitions` matrix

| From state          | Allowed targets                                  |
| ------------------- | ------------------------------------------------ |
| `pending`           | `running`, `awaiting_approval`, `failed`, `done` |
| `awaiting_approval` | `pending`, `failed`                              |
| `running`           | `done`, `failed`                                 |
| `done`              | (terminal — no transitions allowed)              |
| `failed`            | `pending` (rerun)                                |

`validate_transition(old, new)` returns True iff `new ∈ allowed[old]`. Pure function, no DB dependency, suitable for unit testing in isolation. TASK-05 (approve) and TASK-06 (rerun) bypass this matrix because their target state is fixed (`pending` from `awaiting_approval` / `failed` respectively).

### `cmc.tasks.spawn`

```python
def spawn_dispatcher_oneshot(settings: Settings) -> int
```

Spawns detached `subprocess.Popen(settings.dispatcher_oneshot_cmd, ..., start_new_session=True)`, returns PID immediately (does NOT wait). Stdout+stderr redirected to `repo_root() / .tmp/mission-control-queue/dispatcher-logs/oneshot-{utc-stamp}.log`. Pitfall 10 mitigated via `try/finally` close on the local FD; subprocess keeps its own dup so the log file stays open.

### `cmc.schedules.cron`

```python
def validate_cron(expr: str) -> bool                  # 5-field cron validity
def next_run(expr: str, base: datetime) -> datetime   # tz-aware base required
```

`next_run` raises `ValueError("base must be tz-aware")` on naive input (Pitfall 3 mitigation: croniter would silently use local time).

### `cmc.schedules.nlcron`

```python
async def nl_to_cron(prompt: str) -> Optional[str]
```

Returns `None` when:
- `ANTHROPIC_API_KEY` env var is unset (caller emits 503), OR
- Model returns the literal string `"INVALID"` (no schedule implied), OR
- Model output fails `validate_cron` post-call validation.

`AsyncAnthropic` is constructed inside the function (not at module import) so module loading does not require the API key. Tests monkeypatch `builtins.__import__` to inject a fake client (see `mock_anthropic_client` fixture).

### `Settings.dispatcher_oneshot_cmd`

```python
dispatcher_oneshot_cmd: list[str] = Field(
    default_factory=lambda: [sys.executable, "-m", "cmc.dispatcher.oneshot"],
    description="argv list spawned by TASK-07; Phase 4 default invokes the stub",
)
```

Phase 8 replaces the stub by editing this default (or via env override `DISPATCHER_ONESHOT_CMD=...` once a JSON-list parser is added) — router code does NOT change. The default is `default_factory` because list mutables can't be class-level defaults in Pydantic v2.

## conftest Extensions

### Factory helpers (module-level, NOT fixtures)

| Helper               | Returns                                       | Used by              |
| -------------------- | --------------------------------------------- | -------------------- |
| `make_decision_row`  | dict shaped for Decision ORM construction     | test_phase4_hitl.py  |
| `make_inbox_row`     | dict shaped for InboxMessage ORM construction | test_phase4_hitl.py  |
| `make_task_row`      | dict shaped for Task ORM construction         | test_phase4_tasks.py |
| `make_schedule_row`  | dict shaped for Schedule ORM construction     | test_phase4_schedules.py |

All four mirror the Phase 3 pattern: tz-aware `datetime.now(timezone.utc)` defaults, Optional types match ORM nullability, callers pass kwargs to override per-test.

### Fixtures (pytest)

| Fixture                | Scope    | Purpose                                                            |
| ---------------------- | -------- | ------------------------------------------------------------------ |
| `tmp_pid_dir`          | function | `tmp_path/pids` directory for ESTOP tests (no real `.tmp/` writes) |
| `mock_anthropic_client`| function | Patches `builtins.__import__` for `from anthropic import AsyncAnthropic` inside `nl_to_cron`; sets `ANTHROPIC_API_KEY=test-key` |

## Test Scaffolds

Four files seeded with module docstring (per-router convention from Plan 03-01) + 1 smoke test each that imports its matching schema module / helper and asserts one DTO is constructible (proves wiring is sound):

- `test_phase4_hitl.py` — HITL-01..07 (Wave 1 plan 04-02 appends)
- `test_phase4_tasks.py` — TASK-01..07 (Wave 1 plan 04-03 appends)
- `test_phase4_schedules.py` — SCHD-01..06 (Wave 1 plan 04-04 appends)
- `test_phase4_estop.py` — ESTOP-01..04 (Wave 1 plan 04-05 appends)

`test_phase4_estop_smoke` exercises `emergency_stop_all(pid_directory=tmp_pid_dir)` against an empty tmp dir (returns three empty lists) — proves the file-scan early-return path AND the `tmp_pid_dir` fixture wiring.

## Test Counts

| Phase                  | Tests | Notes                                          |
| ---------------------- | ----- | ---------------------------------------------- |
| Phase 1 (boot)         | 25    | Unchanged                                      |
| Phase 2 (ingest)       | 36    | Unchanged                                      |
| Phase 3 (read APIs)    | 69    | Unchanged                                      |
| Phase 4 Wave 0 smokes  | 4     | NEW: test_phase4_{hitl,tasks,schedules,estop}_smoke |
| **Total**              | **134** | All green; 0 failures                       |

`backend/.venv/bin/python -m pytest backend/tests/ -p no:warnings` returns `134 passed in ~89s`.

## Open Questions Resolved

| Question | Resolution |
| -------- | ---------- |
| A1 — queue path layout | `.tmp/mission-control-queue/{decisions,inbox}/{id}.jsonl` (mirrors SESS-06 sibling) |
| A2 — TASK-07 dispatcher cmd source | `Settings.dispatcher_oneshot_cmd: list[str]` argv (Phase 8 replaces stub by editing default) |
| A3 — ESTOP-04 flag clear semantics | Will be `UPDATE system_state SET value='0'` (NOT DELETE) — preserves audit row; locked here, implemented in 04-05 |
| A4 — Status transition matrix | Locked v1 in `cmc.tasks.transitions._ALLOWED_TRANSITIONS` |
| A6 — Anthropic env var name | `ANTHROPIC_API_KEY` (SDK convention); missing key → `nl_to_cron` returns None |
| A7 — `answered_by` typing | `Literal["dashboard", "telegram", "cli"]` (cleaner UI types than free-text) |

## Entry Contracts for Wave 1 Plans

### Plan 04-02 (HITL router)

Imports the foundation provides:
```python
from cmc.api.schemas.hitl import (
    DecisionCreate, DecisionAnswerRequest, DecisionAnswerResponse,
    DecisionListItem, DecisionListResponse,
    InboxCreate, InboxReadResponse, InboxReplyRequest, InboxReplyResponse,
    InboxListItem, InboxListResponse,
)
from cmc.core.queue import write_decision_answer, write_inbox_reply
```

Uses `make_decision_row` + `make_inbox_row` factories in tests. Appends test cases to `test_phase4_hitl.py`.

### Plan 04-03 (Tasks router)

Imports the foundation provides:
```python
from cmc.api.schemas.tasks import (
    TaskCreate, TaskUpdate, TaskListItem, TaskListResponse,
    TaskApproveResponse, TaskRerunResponse, TaskTriggerResponse,
)
from cmc.tasks.transitions import validate_transition
from cmc.tasks.spawn import spawn_dispatcher_oneshot
```

TASK-03 PATCH calls `validate_transition(old_status, new_status)` and 400s on False. TASK-07 dispatcher trigger calls `spawn_dispatcher_oneshot(settings)` and returns `{triggered: True, pid}` immediately. Uses `make_task_row` factory in tests.

### Plan 04-04 (Schedules router)

Imports the foundation provides:
```python
from cmc.api.schemas.schedules import (
    ScheduleCreate, ScheduleUpdate, ScheduleListItem, ScheduleListResponse,
    ScheduleRunsResponse, NLCronRequest, NLCronResponse,
)
from cmc.schedules.cron import validate_cron, next_run
from cmc.schedules.nlcron import nl_to_cron
```

SCHD-06 router emits 503 when `await nl_to_cron(description)` returns None. Uses `make_schedule_row` factory + `mock_anthropic_client` fixture in tests.

### Plan 04-05 (ESTOP — extends system router)

Imports the foundation provides:
```python
from cmc.api.schemas.system import EmergencyStopResponse, EmergencyResumeResponse
from cmc.core.process import emergency_stop_all
```

POST /api/system/emergency-stop calls `emergency_stop_all()`, then KV-upserts `emergency_stop=1`, then `UPDATE tasks SET status='failed', error_message='emergency stop' WHERE status='running'`. POST /api/system/emergency-resume sets `system_state.value='0'`. Uses `tmp_pid_dir` fixture in tests.

## Deviations from Plan

None — plan executed exactly as written. Task split (Task 1 → 1A + 1B) was already encoded in the plan file at execution time. `TaskTriggerRequest` removal was already encoded in the artifacts spec. Only one process note: initial `uv sync` (without `--all-extras`) pruned dev deps; immediately re-ran `uv sync --all-extras` to restore pytest + ruff. Both `uv.lock` mutations land cleanly in the Task 1A commit.

## Self-Check: PASSED

All artifacts verified present:
- `backend/cmc/dispatcher/__init__.py` FOUND
- `backend/cmc/dispatcher/oneshot.py` FOUND
- `backend/cmc/tasks/transitions.py` FOUND
- `backend/cmc/tasks/spawn.py` FOUND
- `backend/cmc/schedules/cron.py` FOUND
- `backend/cmc/schedules/nlcron.py` FOUND
- `backend/cmc/core/queue.py` FOUND
- `backend/cmc/core/process.py` FOUND
- `backend/cmc/api/schemas/hitl.py` FOUND
- `backend/cmc/api/schemas/tasks.py` FOUND
- `backend/cmc/api/schemas/schedules.py` FOUND
- `backend/tests/test_phase4_hitl.py` FOUND
- `backend/tests/test_phase4_tasks.py` FOUND
- `backend/tests/test_phase4_schedules.py` FOUND
- `backend/tests/test_phase4_estop.py` FOUND

All 4 task commits verified in `git log`:
- `447627c` (Task 1A) FOUND
- `237f204` (Task 1B) FOUND
- `fcdaa2e` (Task 3) FOUND
- `c865e7b` (Task 4) FOUND

134/134 tests passing; 0 failures.
