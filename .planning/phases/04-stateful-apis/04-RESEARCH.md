# Phase 4: Stateful APIs — Research

**Researched:** 2026-04-26
**Domain:** FastAPI 0.136 stateful CRUD routers (4 routers, 24 endpoints), SQLAlchemy 2.0 async write patterns (INSERT OR IGNORE on partial unique index, upserts, status state machine), cron expression parsing + next-run computation (croniter 6.2.2), file-based queue writes for HITL answer/reply queue, subprocess.Popen orchestration for one-shot dispatcher trigger, PID-file scan + ps-based process validation for emergency stop, optional Anthropic SDK for natural-language → cron Haiku conversion.
**Confidence:** HIGH on codebase patterns (Phase 3 routers re-read in full), HIGH on schema (15-table SCHEMA verified — see `backend/cmc/db/models/{decisions,inbox,tasks,schedules,system_state}.py`), HIGH on stack additions (croniter + anthropic versions verified against PyPI on 2026-04-26), MEDIUM on the dispatcher PID-file location (deferred to Phase 8 — Phase 4 establishes the **read** contract: `repo_root() / .tmp/mission-control-queue/pids/`), MEDIUM on the answer-queue file format (extending the Plan 03-03 pattern: `repo_root() / .tmp/mission-control-queue/{decisions,inbox}/{id}.jsonl`).

## Summary

Phase 4 layers four CRUD-shaped routers on top of the same FastAPI/SQLAlchemy/SQLModel/Alembic stack already shipped in Phases 1–3. The HTTP plumbing is identical to the Phase 3 read-only routers (Pydantic v2 schemas, `Depends(get_session)`, repo-anchored paths) — the new content is **write semantics**: status transitions, partial-unique INSERT OR IGNORE, JSON column updates, file-queue side effects, subprocess spawning, and PID-file scanning. The schema is already migrated (Plan 01-05 created decisions, inbox, tasks, schedules, system_state, plus the partial-unique `uq_decisions_pending_dedup_key` index). No Alembic migration is required for Phase 4 — every column referenced by HITL/TASK/SCHD/ESTOP requirements already exists.

Two genuinely new dependencies: **croniter 6.2.2** (Pallets-maintained, released 2026-03-15) for cron parsing + next-run computation, and (optionally, behind a feature flag) **anthropic 0.97.0** (released 2026-04-23) for SCHD-06 natural-language → cron via Claude Haiku 4.5. Everything else (subprocess, signal, json, os, datetime) is standard library.

The two file-queue write paths (HITL-03 decision answer, HITL-07 inbox reply) follow the path-anchoring pattern Plan 03-03 already established at `repo_root() / .tmp/mission-control-queue/messages/{sid}.jsonl`. Phase 4 extends this to two new directory siblings: `decisions/{id}.jsonl` and `inbox/{id}.jsonl`. The dispatcher (Phase 8) reads from these directories — Phase 4 is the writer side of the contract.

**Primary recommendation:** Five plans across two waves. Wave 0 (parallel-safe) lands the foundation: croniter dep, optional anthropic dep, request/response Pydantic schemas, the `cmc.core.queue` writer module (single source of truth for `.tmp/mission-control-queue/{decisions,inbox,messages}/` writes), and the `cmc.core.process` PID-file scan + `ps`-validation helper. Wave 1 ships four router plans in parallel: HITL (decisions + inbox in one router — they share the queue-writer dependency), Tasks (TASK-01..07 + dispatcher-trigger sub-route), Schedules (SCHD-01..06, with Anthropic Haiku call for SCHD-06), Emergency Stop (ESTOP-01..04 — extends the existing system router rather than creating a new one). One test file per router (sticking with Phase 3's per-router convention): `test_phase4_hitl.py`, `test_phase4_tasks.py`, `test_phase4_schedules.py`, `test_phase4_estop.py`. Total estimated 24 endpoints + ~50 test cases.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| HTTP routing for 24 endpoints | API / Backend (`cmc.api.routes.{hitl,tasks,schedules,system}`) | — | Per-resource routers under `/api`; ESTOP extends existing system router |
| Pydantic v2 request/response schemas | API / Backend (`cmc.api.schemas.{hitl,tasks,schedules,system}`) | — | Distinct from SQLModel table classes — UI contract independent of storage |
| INSERT OR IGNORE on partial unique index | Database / Storage (SQLAlchemy core via `sqlite_on_conflict_do_nothing` or `INSERT OR IGNORE` text) | API / Backend (HITL-02 handler) | SQLite-specific dialect; pattern lives in router code, not a generic helper |
| Status state machine (TASK-03) | API / Backend (`cmc.tasks.transitions` — new pure-function module) | — | Validation table is small + static; pure-function lookup with explicit allow-list |
| Cron parsing + next-run computation | API / Backend (`cmc.schedules.cron` — thin wrapper over croniter) | — | Two functions: `validate(expr) → bool` and `next_run(expr, base_dt) → datetime` |
| File-based queue writes | API / Backend (`cmc.core.queue` — new module) | Filesystem (`repo_root() / .tmp/mission-control-queue/`) | Single source of truth for queue paths; HITL-03/07 + SESS-06 (existing) all route through this |
| Subprocess spawn (TASK-07 dispatcher trigger) | API / Backend (`cmc.tasks.spawn` or inline in router) | OS / Process (subprocess.Popen) | Detached subprocess so the FastAPI request doesn't block on dispatcher lifetime |
| PID-file scan + ps validation (ESTOP-01..02) | API / Backend (`cmc.core.process` — new module) | Filesystem + OS shell (ps, os.kill) | Scan PID files under `.tmp/mission-control-queue/pids/`, validate via `ps -p PID -o command=`, then `os.kill(pid, signal.SIGTERM)` |
| Emergency-stop singleton flag | Database / Storage (`system_state.emergency_stop` row, KV upsert) | API / Backend (ESTOP-03/04 handlers) | Existing KV table; treat as singleton with `INSERT ... ON CONFLICT(key) DO UPDATE` |
| Natural-language → cron (SCHD-06, optional) | External service (Anthropic API, Claude Haiku 4.5) | API / Backend (`cmc.schedules.nlcron` — new thin wrapper) | Single LLM call; deterministic prompt; response strictly validated by croniter before return |

## Project Constraints (from CLAUDE.md)

`./CLAUDE.md` does not exist in the project root [VERIFIED: `test -f /Users/patrykattc/work/git/claude-mission-control/CLAUDE.md` returns missing]. Operative project-level constraints come from `.planning/PROJECT.md` and `.planning/STATE.md`:

- macOS-only platform; install paths use `~/.claude/...`, dispatcher uses launchd. [VERIFIED: PROJECT.md "Constraints" section] Linux portability is a v2 concern (PLAT-01).
- Python 3.13+ (active venv 3.13). [VERIFIED: backend/pyproject.toml `requires-python = ">=3.13"`]
- SQLite 3.47.x single-file with WAL; `PRAGMA foreign_keys = ON` enforced via the engine's connect listener (Plan 01-04). [VERIFIED: STATE.md decisions]
- SQLAlchemy 2.0.49 async + SQLModel 0.0.38 + Alembic 1.18.4 — locked Phase 1 stack, no deviation. [VERIFIED: backend/pyproject.toml]
- FastAPI 0.136.1. [VERIFIED: backend/pyproject.toml]
- Bind to 127.0.0.1 only — no auth, no remote access. (Implies subprocess.Popen for the dispatcher trigger is acceptable: only localhost callers can hit the endpoint.)
- No outbound network calls except (a) optional Telegram, (b) optional Anthropic API for SCHD-06. SCHD-06 MUST tolerate a missing API key with a graceful 503 (do not crash the router).
- Repo-root path resolution lives in `cmc.core.paths.repo_root()`; all queue / PID file paths MUST anchor here. [VERIFIED: STATE.md decisions]
- Pre-existing app HTTPException handler emits `{error: detail}`, NOT FastAPI default `{detail: ...}` — tests must check `r.json()["error"]`. [VERIFIED: STATE.md Plan 03-03 note]

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HITL-01 | GET /api/decisions returns filtered decision list (status=pending\|answered) | §1, §3 — direct SELECT on `decisions` with optional `WHERE status = ?` filter and ORDER BY created_at DESC. |
| HITL-02 | POST /api/decisions creates decision with INSERT OR IGNORE on partial unique index | §3 — partial unique index `uq_decisions_pending_dedup_key` already exists (decisions.py L48–55). Use SQLAlchemy core `insert(...).prefix_with("OR IGNORE")` against SQLite dialect. |
| HITL-03 | POST /api/decisions/{id}/answer writes answer to queue file, returns {answered: true} | §3, §4 — write JSONL line to `repo_root() / .tmp/mission-control-queue/decisions/{id}.jsonl`, then UPDATE the decision row (`status='answered'`, `answer`, `answered_at`, `answered_by`). |
| HITL-04 | GET /api/inbox returns filtered inbox messages (unread, max_age_days) | §1, §3 — SELECT with optional `WHERE read = 0` and `WHERE created_at >= datetime('now', :days)`. |
| HITL-05 | POST /api/inbox creates agent-to-user inbox message | §3 — plain INSERT; no partial unique constraint on inbox table. |
| HITL-06 | POST /api/inbox/{id}/read marks message read | §3 — UPDATE inbox SET read=1, read_at=now() WHERE id=:id. |
| HITL-07 | POST /api/inbox/{id}/reply writes user reply to queue file | §3, §4 — write JSONL line to `repo_root() / .tmp/mission-control-queue/inbox/{id}.jsonl`, then UPDATE row (`reply`, `replied_at`). |
| TASK-01 | GET /api/tasks returns filtered task list (status, quadrant) | §1, §3 — SELECT with optional `WHERE status = ?` and `WHERE quadrant = ?` filters; ORDER BY priority ASC, created_at DESC. |
| TASK-02 | POST /api/tasks creates task with all fields | §3 — full INSERT; all 13 user-supplied columns documented in §3.4. |
| TASK-03 | PATCH /api/tasks/{id} updates task with status transition validation | §3, §6 — pure-function `validate_transition(old, new) → bool` against the matrix in §6. Reject invalid transitions with 400. |
| TASK-04 | DELETE /api/tasks/{id} deletes task | §3 — DELETE; 404 when missing. |
| TASK-05 | POST /api/tasks/{id}/approve flips awaiting_approval to pending, stamps approved_at | §3, §6 — guard `WHERE status = 'awaiting_approval'`; 400 on mismatched state. |
| TASK-06 | POST /api/tasks/{id}/rerun resets failed task to pending (400 if not failed) | §3, §6 — guard `WHERE status = 'failed'`; reset `started_at`, `ended_at`, `error_message` to NULL. |
| TASK-07 | POST /api/dispatcher/trigger spawns one-shot dispatcher run via subprocess.Popen | §7 — detached `subprocess.Popen(..., start_new_session=True)`. Phase 8 ships the actual dispatcher script; Phase 4 ships the trigger endpoint with a stubbed binary path resolved from settings. |
| SCHD-01 | GET /api/schedules returns schedule list | §1 — direct SELECT on `schedules`. |
| SCHD-02 | POST /api/schedules creates schedule | §3, §5 — validate `cron` via `croniter.is_valid()`, compute `next_run_at` via `croniter(expr, now).get_next(datetime)`, then INSERT. |
| SCHD-03 | PATCH /api/schedules/{id} updates schedule (clears next_run_at on cron change) | §3, §5 — diff old vs new cron in handler; if changed, recompute next_run_at; if `enabled` flips false, clear next_run_at. |
| SCHD-04 | DELETE /api/schedules/{id} deletes schedule | §3 — DELETE; 404 when missing. |
| SCHD-05 | GET /api/schedules/{id}/runs returns last N materialized tasks | §3 — SELECT FROM tasks WHERE schedule_id = :id ORDER BY created_at DESC LIMIT :n. (Schema FK already exists: `tasks.schedule_id`.) |
| SCHD-06 | POST /api/schedules/parse-nl converts natural language to cron via Haiku | §5, §8 — call `anthropic.AsyncAnthropic().messages.create(model="claude-haiku-4-5", ...)` with a strict system prompt; validate the returned cron with `croniter.is_valid()` before returning. 503 if API key missing or model fails. |
| ESTOP-01 | POST /api/system/emergency-stop SIGTERMs dispatcher-launched children via PID file scan with process validation | §7 — scan `repo_root() / .tmp/mission-control-queue/pids/*.pid`, read PID, validate via `ps -p PID -o command=`, `os.kill(pid, SIGTERM)` on match, log + skip on mismatch. |
| ESTOP-02 | Emergency stop verifies PID is a claude -p process via ps command before SIGTERM | §7 — `ps -p PID -o command=` (BSD ps on macOS, also works on GNU/Linux); match `claude` substring AND `-p` flag in args. Reject with `[VERIFIED 2026-04-26: ps -p $$ -o command= returns full command line on macOS Darwin 25.3.0]`. |
| ESTOP-03 | Emergency stop sets system_state.emergency_stop = '1' and fails running tasks | §3 — KV upsert (`INSERT ... ON CONFLICT(key) DO UPDATE`); UPDATE tasks SET status='failed', error_message='emergency stop' WHERE status='running'. |
| ESTOP-04 | POST /api/system/emergency-resume clears emergency flag | §3 — UPDATE system_state SET value='0' WHERE key='emergency_stop'. (Or DELETE the row — see Open Q3.) |

## Standard Stack

### Core (already installed — Phase 1/2/3, no change)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | 0.136.1 | HTTP framework | [VERIFIED: backend/pyproject.toml L7] Established Phase 1; Phase 3 routers all use this — Phase 4 routers follow the same pattern. |
| SQLAlchemy | 2.0.49 | Async ORM core | [VERIFIED: backend/pyproject.toml L11] |
| SQLModel | 0.0.38 | Table layer | [VERIFIED: backend/pyproject.toml L12] |
| aiosqlite | 0.22.1 | Async SQLite driver | [VERIFIED: backend/pyproject.toml L13] |
| Alembic | 1.18.4 | Schema migrations | [VERIFIED: backend/pyproject.toml L14] No new migration required for Phase 4. |
| Pydantic | 2.13.3 | Request/response schemas | [VERIFIED: backend/pyproject.toml L9] Use `ConfigDict(from_attributes=True)` via `cmc.api.schemas.common.ORMBase` for ORM-row → response model. |

### New for Phase 4

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| croniter | 6.2.2 | Parse cron expressions, compute next-run datetime, validate | [VERIFIED: pypi.org/pypi/croniter/json on 2026-04-26 → version 6.2.2, upload_time 2026-03-15T08:43:46]. Pallets-maintained (Flask org); MIT license; Python 3.9+; the canonical Python cron library — Sentry, dbt, and Apache Airflow all use it. `is_valid()` and `get_next(datetime)` are the only two functions Phase 4 needs. |
| anthropic | 0.97.0 | Claude API client for SCHD-06 (natural-language → cron) | [VERIFIED: pypi.org/pypi/anthropic/json on 2026-04-26 → version 0.97.0, upload_time 2026-04-23T20:52:32] Official SDK; provides `AsyncAnthropic().messages.create()`. **Optional**: SCHD-06 returns 503 when `ANTHROPIC_API_KEY` is unset, so installations without an API key skip this feature gracefully. |

**Installation:**
```bash
cd backend && uv add croniter==6.2.2 anthropic==0.97.0
```

**Version verification (re-run before locking the plan):**
```bash
python3 -c "import urllib.request, json; print('croniter', json.load(urllib.request.urlopen('https://pypi.org/pypi/croniter/json'))['info']['version'])"
python3 -c "import urllib.request, json; print('anthropic', json.load(urllib.request.urlopen('https://pypi.org/pypi/anthropic/json'))['info']['version'])"
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| croniter 6.2.2 | cronsim 2.7 | cronsim is also alive (2025-10-21 release), faster, no dependencies. Strictly stdlib-only. **Rejected:** croniter has `is_valid()` as a class method (cronsim has no validator API — you have to catch exceptions during construction); croniter's API is the de-facto standard across the Python ecosystem; switching costs nothing later if we ever need to. [CITED: pypi.org/pypi/cronsim/json] |
| croniter 6.2.2 | hand-roll cron parser | We need 5-field cron parsing + DST-correct next-run computation. The DST math alone is a known footgun (see §6 Pitfall: "DST in cron"). Don't hand-roll. |
| anthropic SDK | aiohttp + raw HTTP to api.anthropic.com | Saves the dependency, but loses streaming, retry, structured error mapping, and version-pinning safety. Anthropic explicitly blesses the SDK in their docs. |
| anthropic SDK | Skip SCHD-06 entirely (return 501) | Acceptable fallback if the user opts out of LLM features. **Recommendation:** install the dep, but make the endpoint return 503 when `ANTHROPIC_API_KEY` env is unset — the SCHD-06 requirement says "via Haiku" but a 503 is honest and the dashboard can show a friendly disabled state. |
| subprocess.Popen for TASK-07 | asyncio.create_subprocess_exec | Both work. **subprocess.Popen** matches REQUIREMENTS.md wording ("via subprocess.Popen") AND mirrors how Phase 8 will spawn classic-mode dispatcher children (DISP-05 says "subprocess.Popen claude -p"). Consistency wins. |

## Architecture Patterns

### System Architecture Diagram

```
   FastAPI request (POST /api/decisions/{id}/answer, etc.)
              │
              ▼
   Pydantic v2 request schema validation (cmc.api.schemas.hitl)
              │
              ▼
   Router handler (cmc.api.routes.hitl)
              │
              ├──────────────► AsyncSession (cmc.db.get_session)
              │                       │
              │                       ▼
              │                SQLAlchemy core / SQLModel
              │                       │
              │                       ▼
              │                aiosqlite ─► sqlite WAL ─► 15-table schema
              │
              ├──────────────► File queue writer (cmc.core.queue.write)
              │                       │
              │                       ▼
              │              repo_root() / .tmp/mission-control-queue/
              │                  ├── decisions/{id}.jsonl   (HITL-03)
              │                  ├── inbox/{id}.jsonl       (HITL-07)
              │                  └── messages/{sid}.jsonl   (SESS-06, existing)
              │
              ├──────────────► subprocess.Popen (TASK-07)
              │                       │
              │                       ▼
              │              dispatcher.py (Phase 8) — detached, start_new_session=True
              │                       │
              │                       ▼
              │              writes its own PID to .tmp/mission-control-queue/pids/
              │
              ├──────────────► PID-file scan (ESTOP-01..02)
              │                       │
              │                       ▼
              │              .tmp/mission-control-queue/pids/*.pid
              │                       │
              │                       ▼
              │              ps -p PID -o command=  (validate "claude" + "-p")
              │                       │
              │                       ▼
              │              os.kill(pid, SIGTERM) on match; skip+log on mismatch
              │
              └──────────────► Anthropic API (SCHD-06 only, opt-in)
                                      │
                                      ▼
                              AsyncAnthropic().messages.create(model="claude-haiku-4-5")
                                      │
                                      ▼
                              cron string → croniter.is_valid() → 200 or 422
```

### Recommended Project Structure

```
backend/cmc/
├── api/
│   ├── routes/
│   │   ├── hitl.py             # NEW: HITL-01..07 (decisions + inbox in one router)
│   │   ├── tasks.py            # NEW: TASK-01..07
│   │   ├── schedules.py        # NEW: SCHD-01..06
│   │   ├── system.py           # EXTEND: ESTOP-01..04 (POST /system/emergency-stop, /emergency-resume)
│   │   └── __init__.py         # EXTEND: register hitl_router, tasks_router, schedules_router
│   └── schemas/
│       ├── hitl.py             # NEW: DecisionCreate, DecisionAnswer, InboxCreate, InboxReply, ...
│       ├── tasks.py            # NEW: TaskCreate, TaskUpdate, TaskListResponse, TaskTriggerResponse
│       ├── schedules.py        # NEW: ScheduleCreate, ScheduleUpdate, NLCronRequest, NLCronResponse
│       └── system.py           # EXTEND: EmergencyStopResponse, EmergencyResumeResponse
├── core/
│   ├── queue.py                # NEW: write_decision_answer(id, answer), write_inbox_reply(id, reply)
│   └── process.py              # NEW: scan_dispatcher_pids(), validate_pid_is_claude(pid), terminate(pid)
├── tasks/
│   ├── __init__.py             # NEW
│   ├── transitions.py          # NEW: validate_transition(old, new) — pure-function state machine
│   └── spawn.py                # NEW: spawn_dispatcher_oneshot() — subprocess.Popen wrapper
└── schedules/
    ├── __init__.py             # NEW
    ├── cron.py                 # NEW: validate_cron(expr), next_run(expr, base) — croniter wrappers
    └── nlcron.py               # NEW: nl_to_cron(prompt) — AsyncAnthropic Haiku call
```

### Pattern 1: SQLAlchemy 2.0 INSERT OR IGNORE on partial unique index (HITL-02)

**What:** Insert a row, but silently ignore if a partial-unique constraint would be violated. SQLite's syntax is `INSERT OR IGNORE`. The `decisions` table has `uq_decisions_pending_dedup_key UNIQUE(dedup_key) WHERE status='pending'` (decisions.py L48–55). This lets the dispatcher post the same decision repeatedly until a human answers it, without spawning duplicates.

**When to use:** HITL-02 specifically. The pattern generalizes to any "soft idempotent" insert.

**Example:**
```python
# Source: SQLAlchemy 2.0 dialect dispatch + decisions.py partial unique index
# https://docs.sqlalchemy.org/en/20/dialects/sqlite.html#sqlalchemy.dialects.sqlite.Insert.on_conflict_do_nothing
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from cmc.db.models.decisions import Decision

@router.post("/decisions", response_model=DecisionListItem, status_code=201)
async def create_decision(
    payload: DecisionCreate,
    db: AsyncSession = Depends(get_session),
):
    stmt = (
        sqlite_insert(Decision)
        .values(
            session_id=payload.session_id,
            task_id=payload.task_id,
            dedup_key=payload.dedup_key,
            prompt=payload.prompt,
            options=payload.options,
            status="pending",
        )
        .on_conflict_do_nothing(
            index_elements=["dedup_key"],
            index_where=text("status = 'pending'"),
        )
        .returning(Decision)
    )
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        # Conflict → fetch the existing pending row with the same dedup_key
        existing = (
            await db.execute(
                select(Decision).where(
                    Decision.dedup_key == payload.dedup_key,
                    Decision.status == "pending",
                )
            )
        ).scalar_one()
        await db.commit()
        return DecisionListItem.model_validate(existing)
    await db.commit()
    return DecisionListItem.model_validate(row)
```

**Pitfalls:** [ASSUMED] `RETURNING` after `OR IGNORE` returns NULL when ignored — the test must cover both branches. SQLite supports RETURNING since 3.35; we have 3.47.x [VERIFIED in Phase 3 RESEARCH]. The fallback SELECT is by `(dedup_key, status='pending')` because that's the partial-unique tuple.

### Pattern 2: KV upsert for system_state singleton (ESTOP-03)

**What:** SQLite-native upsert for a single-row KV table. The `system_state` table has `key` as primary key and two value columns (`value` TEXT, `value_json` JSON). For boolean-like flags, use the `value` column with `'0'` / `'1'`.

**Example:**
```python
# Source: backend/cmc/db/models/system_state.py + SQLAlchemy SQLite dialect
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from cmc.db.models.system_state import SystemState

stmt = (
    sqlite_insert(SystemState)
    .values(key="emergency_stop", value="1", updated_at=datetime.utcnow())
    .on_conflict_do_update(
        index_elements=["key"],
        set_={"value": "1", "updated_at": datetime.utcnow()},
    )
)
await db.execute(stmt)
await db.commit()
```

**Why this shape:** The Phase 3 SAPI-03 whitelist already includes `emergency_stop` (Plan 03-02). The `value` column is a string (the schema's `value_json` is for richer payloads). Reading: `r.value == '1'` is "stopped"; `r.value == '0'` (or missing row) is "running". Phase 3 system router's `_coerce_value` helper already handles both columns.

### Pattern 3: Cron parsing + next-run computation (SCHD-02, SCHD-03)

**What:** Two operations: validate a cron expression, and compute the next datetime it will fire after a base datetime.

**Example:**
```python
# Source: github.com/pallets-eco/croniter README (verified 2026-04-26)
from croniter import croniter
from datetime import datetime, timezone

def validate_cron(expr: str) -> bool:
    """Return True iff `expr` is a valid 5-field cron expression."""
    return croniter.is_valid(expr)

def next_run(expr: str, base: datetime) -> datetime:
    """Return the next firing datetime after `base`. base MUST be tz-aware UTC."""
    if base.tzinfo is None:
        raise ValueError("base must be tz-aware")
    it = croniter(expr, base)
    return it.get_next(datetime)
```

**Pitfalls:**
- **DST awareness:** croniter handles DST when given a tz-aware base. Storing `next_run_at` as UTC (matches Phase 2's UTC convention) sidesteps DST entirely at storage time, but the cron expression is evaluated in **local time** by the dispatcher. Phase 4 stores UTC; the dispatcher (Phase 8) resolves local-time semantics on read.
- **`is_valid` does NOT accept 6-field (with seconds) or named-day expressions by default.** Stick to 5-field standard cron.

### Pattern 4: Status state machine (TASK-03)

**What:** Validate a status transition against a small allow-list table. Reject invalid transitions with HTTP 400.

**Example:**
```python
# Source: own design — see §6 transition matrix
# Pure-function module with one frozen dict; no DB read.
_ALLOWED_TRANSITIONS: dict[str, frozenset[str]] = {
    "pending":            frozenset({"running", "awaiting_approval", "failed", "done"}),
    "awaiting_approval":  frozenset({"pending", "failed"}),  # approve→pending; reject path TBD
    "running":            frozenset({"done", "failed"}),
    "done":               frozenset(),  # terminal
    "failed":             frozenset({"pending"}),  # rerun resets to pending
}

def validate_transition(old: str, new: str) -> bool:
    return new in _ALLOWED_TRANSITIONS.get(old, frozenset())
```

**When to use:** TASK-03 PATCH must call this and 400 when invalid. TASK-05 (approve) and TASK-06 (rerun) are SHORTCUTS over this matrix — they validate the source state explicitly (`WHERE status = 'awaiting_approval'` for approve, `WHERE status = 'failed'` for rerun) and bypass the matrix because the target is fixed.

### Pattern 5: File-based queue writer (HITL-03, HITL-07)

**What:** Single source of truth for writing JSONL records to `repo_root() / .tmp/mission-control-queue/{decisions,inbox,messages}/{key}.jsonl`. SESS-06 already writes to `.../messages/{sid}.jsonl` (Plan 03-03). Phase 4 reuses that path-anchoring pattern for two new sub-directories.

**Example:**
```python
# Source: backend/cmc/api/routes/sessions.py L380–402 (SESS-06 prior art)
import json
from datetime import datetime, timezone
from pathlib import Path
from cmc.core.paths import repo_root

QUEUE_ROOT = ".tmp/mission-control-queue"

def _queue_path(sub: str, key: str) -> Path:
    """Return the JSONL queue path for a given subdir + key.

    sub ∈ {"decisions", "inbox", "messages"}
    key is the row id or session_id; MUST be sanitized by the caller.
    """
    qdir = repo_root() / QUEUE_ROOT / sub
    qdir.mkdir(parents=True, exist_ok=True)
    return qdir / f"{key}.jsonl"

def write_decision_answer(decision_id: int, answer: str, answered_by: str) -> Path:
    p = _queue_path("decisions", str(decision_id))
    line = json.dumps(
        {
            "ts": datetime.now(timezone.utc).isoformat(),
            "decision_id": decision_id,
            "answer": answer,
            "answered_by": answered_by,
        },
        separators=(",", ":"),
    ) + "\n"
    with p.open("a", encoding="utf-8") as f:
        f.write(line)
    return p

def write_inbox_reply(inbox_id: int, reply: str) -> Path:
    p = _queue_path("inbox", str(inbox_id))
    line = json.dumps(
        {
            "ts": datetime.now(timezone.utc).isoformat(),
            "inbox_id": inbox_id,
            "reply": reply,
        },
        separators=(",", ":"),
    ) + "\n"
    with p.open("a", encoding="utf-8") as f:
        f.write(line)
    return p
```

**Why one module:** The Phase 8 dispatcher reads from all three subdirectories. Centralizing the path helper means a future change to the queue layout edits one file, not three routers.

### Pattern 6: Subprocess.Popen for one-shot dispatcher (TASK-07)

**What:** Spawn a detached process and return immediately. The FastAPI request must NOT block on dispatcher completion (the dispatcher might run for minutes).

**Example:**
```python
# Source: cpython subprocess docs + pid-detachment idiom
import subprocess
import sys
from pathlib import Path
from cmc.core.paths import repo_root

def spawn_dispatcher_oneshot(settings) -> int:
    """Launch a one-shot dispatcher run, return its PID. Does NOT wait.

    Detaches via start_new_session=True so the dispatcher survives the
    FastAPI worker restart. stdout/stderr go to a log file under
    `.tmp/mission-control-queue/dispatcher-logs/<ts>.log`.

    Phase 4 stub: launches `python -m cmc.dispatcher.oneshot` (Phase 8 ships
    that module). For Phase 4, the trigger endpoint may instead launch a
    placeholder shell command from settings — see Open Q5.
    """
    log_dir = repo_root() / ".tmp" / "mission-control-queue" / "dispatcher-logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    log_path = log_dir / f"oneshot-{ts}.log"
    cmd = [sys.executable, "-m", "cmc.dispatcher.oneshot"]
    proc = subprocess.Popen(
        cmd,
        cwd=str(repo_root()),
        stdout=open(log_path, "ab", buffering=0),
        stderr=subprocess.STDOUT,
        start_new_session=True,  # detach from FastAPI process group
        close_fds=True,
    )
    return proc.pid
```

**Pitfalls:**
- **Do NOT pass `shell=True`.** PID-1 reaping aside, shell=True is a command-injection footgun.
- **Do NOT pipe stdin.** A pipe forces the FastAPI process to stay alive until the dispatcher reads stdin. `subprocess.DEVNULL` or omission is correct.
- **Do close stdout/stderr handles when the request ends.** The opened log file leaks the FD if not. Workaround: open the file before Popen, pass it as file= argument, immediately close the local handle after Popen returns (subprocess copies the FD internally).

### Pattern 7: PID file scan + ps validation (ESTOP-01..02)

**What:** Walk a directory of `*.pid` files, read each PID, validate via `ps -p PID -o command=` that it's a `claude -p` subprocess we spawned, then SIGTERM only matching PIDs.

**Example:**
```python
# Source: own design + macOS ps(1) man page (verified 2026-04-26 on Darwin 25.3.0)
import os
import signal
import subprocess
from pathlib import Path
from cmc.core.paths import repo_root

PID_DIR = repo_root() / ".tmp" / "mission-control-queue" / "pids"

def _read_pid(pid_file: Path) -> int | None:
    try:
        return int(pid_file.read_text().strip())
    except (OSError, ValueError):
        return None

def validate_pid_is_claude(pid: int) -> bool:
    """Return True iff PID is alive AND its command line contains both
    'claude' and the '-p' flag. Used to refuse to SIGTERM unrelated PIDs.
    """
    try:
        # ps -p PID -o command=  → full command line, no header
        # Works on macOS BSD ps and GNU/Linux ps with `command=` keyword.
        out = subprocess.run(
            ["ps", "-p", str(pid), "-o", "command="],
            capture_output=True, text=True, timeout=2, check=False,
        )
    except (subprocess.TimeoutExpired, OSError):
        return False
    if out.returncode != 0:
        return False  # PID doesn't exist
    line = out.stdout.strip()
    if not line:
        return False
    # Heuristic: must contain "claude" AND " -p" (with space) to avoid matching
    # `--prefix=claude` or similar false positives. Tighten further if needed.
    return ("claude" in line) and (" -p" in line)

def emergency_stop_all() -> dict[str, list]:
    """Scan PID dir, validate each, SIGTERM matching ones. Return summary."""
    if not PID_DIR.exists():
        return {"terminated": [], "skipped": [], "missing": []}
    terminated: list[int] = []
    skipped: list[int] = []
    missing: list[int] = []
    for pid_file in sorted(PID_DIR.glob("*.pid")):
        pid = _read_pid(pid_file)
        if pid is None:
            missing.append(0)
            continue
        if not validate_pid_is_claude(pid):
            skipped.append(pid)
            continue
        try:
            os.kill(pid, signal.SIGTERM)
            terminated.append(pid)
        except ProcessLookupError:
            missing.append(pid)
        except PermissionError:
            skipped.append(pid)
    return {"terminated": terminated, "skipped": skipped, "missing": missing}
```

**Pitfalls:**
- `ps -p PID` returns exit code 1 when PID is dead (good — we treat that as "missing").
- **Do not SIGKILL.** SIGTERM lets the dispatcher run shutdown handlers. The dispatcher (Phase 8) handles SIGTERM by writing a "stopped" record to its task row.
- **Race window:** A PID can be reaped + reused between `validate_pid_is_claude` and `os.kill`. Mitigation: validate again right before `os.kill` (we already do — the function is single-call). Catch `ProcessLookupError` and treat as `missing`.
- **macOS sandbox:** macOS may deny `ps` info for processes owned by other users. We only target our own dispatcher children, so this is not an issue in practice; but document it.

### Pattern 8: Anthropic Haiku NL → cron (SCHD-06)

**What:** Make a single async call to Claude Haiku 4.5 with a deterministic prompt, parse the response, validate as cron.

**Example:**
```python
# Source: github.com/anthropics/anthropic-sdk-python README (fetched 2026-04-26)
# Model alias: https://platform.claude.com/docs/en/about-claude/models/overview
import os
from anthropic import AsyncAnthropic
from croniter import croniter

_SYSTEM_PROMPT = """You are a cron expression generator. Given a natural-language
schedule description, output ONLY a valid 5-field cron expression (minute hour
day-of-month month day-of-week). Do NOT include explanations, code blocks, or
any other text. If the description is ambiguous, output the most reasonable
interpretation. If no schedule is implied, output exactly "INVALID"."""

async def nl_to_cron(prompt: str) -> str | None:
    """Convert a natural-language schedule description to a 5-field cron
    expression. Returns None when the model output is invalid or the API key
    is missing.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return None
    client = AsyncAnthropic(api_key=api_key)
    msg = await client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=64,                 # cron is at most ~30 chars; cap tokens
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    # Response shape: msg.content is list[ContentBlock]; first block is TextBlock
    text = msg.content[0].text.strip()
    if text == "INVALID" or not croniter.is_valid(text):
        return None
    return text
```

**Pitfalls:**
- **API key missing:** Return None and let the router emit 503 with a friendly detail. Do NOT crash.
- **Hallucinated output:** Always `croniter.is_valid()` before returning. The system prompt asks for ONLY the cron string; if the model returns prose, `is_valid()` rejects it.
- **Cost:** Haiku 4.5 is $1/MTok input, $5/MTok output [VERIFIED: platform.claude.com/docs/en/about-claude/models/overview]. With max_tokens=64, each call costs <$0.001. Negligible at single-user scale.
- **Latency:** Haiku is the fastest model; expect 200–500ms. Acceptable for an interactive composer.

### Anti-Patterns to Avoid

- **Don't write to the DB FIRST then the queue file.** Crash-window inconsistency: dispatcher could see `status='answered'` in DB but no answer in the queue file. **Order: file write FIRST, then DB UPDATE.** If the file write fails, the DB update never happens — dispatcher resends.
- **Don't open AsyncAnthropic in module-scope.** Tests need to monkeypatch `ANTHROPIC_API_KEY` per-call. Construct the client inside the function.
- **Don't call `croniter.is_valid()` on a stripped quoted string without trim.** Whitespace/quotes from JSON bodies will fail validation. Strip first.
- **Don't return raw SQLite IntegrityError messages to the client on HITL-02.** That leaks schema details. Map to 200 (already-pending) or 201 (created).
- **Don't use FastAPI's BackgroundTasks for TASK-07.** BackgroundTasks runs after the response is sent BUT IN THE SAME WORKER PROCESS. We need a detached subprocess so the dispatcher survives a uvicorn `--reload`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cron expression parsing + next-run computation | Manual regex parser | `croniter==6.2.2` | DST handling, leap-day handling, day-of-month/day-of-week interaction (`OR` not `AND`), weekday wrap (`0` and `7` both = Sunday). All non-obvious. |
| Natural-language → cron | Hand-tuned regex matcher for "every X minutes / at 9am every weekday" etc. | Anthropic Haiku 4.5 + `croniter.is_valid()` validator | The user-facing surface area of NL schedule descriptions is unbounded. LLM + strict validator is the right combination. |
| Async PID validation via `psutil.Process(pid).cmdline()` | Use psutil (already a dep) | `subprocess.run(["ps", "-p", PID, "-o", "command="])` | psutil DOES work, but `ps` is canonical, requires no permissions on macOS, and the REQUIREMENTS.md explicitly says "via ps command" (ESTOP-02). Stick to the spec. |
| File-based queue locking | flock / fcntl | Append-only mode `"a"` + single-writer assumption | Phase 4 routers are the ONLY writers to `decisions/`, `inbox/`, `messages/`. The dispatcher reads-then-truncates atomically (Phase 8 problem). No locks needed in Phase 4. |
| Status state machine | Switch / if-else cascade | Frozen dict allow-list (Pattern 4) | The state graph is tiny (5 states, 7 edges); a literal dict is more reviewable than branching code. |
| Subprocess process group management | os.setsid + custom signal handler | `start_new_session=True` | Single kwarg; correct on macOS + Linux. |

**Key insight:** Every "system-y" piece of Phase 4 (cron, PID, subprocess, queue files) has a 20-year-old well-tested standard library or de-facto-standard package. The risk of hand-rolling these isn't "it doesn't work" — it's "it works for 6 months until DST, or until a SIGCHLD race, or until a leap day". Pay the small dependency cost; ship the boring path.

## Common Pitfalls

### Pitfall 1: Crash-window inconsistency between queue file and DB

**What goes wrong:** HITL-03 / HITL-07 do two side-effects: write a JSONL line, UPDATE a DB row. If the order is `DB then file` and the process crashes between them, the dashboard shows "answered" but the dispatcher never sees the answer.

**Why it happens:** Default Python ordering — code reads top-to-bottom; the lazier path is to UPDATE first because it's less typing.

**How to avoid:** **File write FIRST**, then DB UPDATE. fsync the file (or accept WAL-style "good enough" because the dispatcher polls every 120s and a missed write replays naturally — see HITL-02 partial-unique).

**Warning signs:** Tests that mock the DB but not the filesystem; queue files with no corresponding answered rows after a chaos test.

### Pitfall 2: TASK-07 subprocess inherits the FastAPI event loop's signal handlers

**What goes wrong:** The dispatcher subprocess inherits SIGCHLD and SIGINT handlers from uvicorn. SIGINT to uvicorn (Ctrl+C) propagates to the dispatcher group, killing both.

**Why it happens:** `subprocess.Popen` defaults inherit the calling process's signal disposition.

**How to avoid:** Use `start_new_session=True`. This puts the dispatcher in a new session AND a new process group; uvicorn's Ctrl+C no longer reaches it. The launchd plist (Phase 9 SETUP-04) will own the dispatcher independently.

**Warning signs:** Restarting the API server kills mid-flight dispatcher tasks.

### Pitfall 3: croniter on a tz-naive datetime silently uses local time

**What goes wrong:** `croniter("0 9 * * *", datetime.utcnow())` computes a local-time-9am next run interpreted as UTC, which is wrong by `tzoffset` hours.

**Why it happens:** Python's `datetime.utcnow()` is **tz-naive** (deprecated since 3.12). croniter accepts both naive and aware datetimes; on naive input it assumes "local-time".

**How to avoid:** Always pass a tz-aware UTC datetime: `datetime.now(timezone.utc)`. Consistent with Phase 2's UTC-everywhere convention. Add a defensive `if base.tzinfo is None: raise ValueError(...)` to the wrapper.

**Warning signs:** `next_run_at` values that drift by exactly your tzoffset; tests passing during winter and failing during DST.

### Pitfall 4: ps command output races with PID reuse

**What goes wrong:** Between `validate_pid_is_claude(pid)` and `os.kill(pid, SIGTERM)`, the OS reaps the PID and assigns it to a new (possibly innocent) process.

**Why it happens:** PID reuse is a UNIX feature, not a bug. The window is microseconds but real.

**How to avoid:** (a) Sanity-check via a SECOND `ps` call right before `os.kill` (acceptable Phase 4; not free but cheap). (b) Use `os.kill(pid, 0)` to "ping" the PID right before SIGTERM and rescue `ProcessLookupError`. (c) Phase 9: switch to `kqueue`/`pidfd` (macOS / Linux respectively) once the dispatcher gains a real lifetime manager.

**Warning signs:** "Skipped" PIDs in emergency_stop logs that you can't explain; rare reports of unrelated processes dying. Mitigation status: Phase 4 ships Pattern 7 (single ps call before kill) — race window is acknowledged in the test plan but not fully closed.

### Pitfall 5: Pydantic v2 ConfigDict is missing → ORM rows produce empty response models

**What goes wrong:** `TaskResponse.model_validate(task_orm_row)` returns a model with all fields = defaults / None when `from_attributes=True` is missing.

**Why it happens:** Pydantic v2 dropped `orm_mode=True` (v1) for `ConfigDict(from_attributes=True)` (v2). Plain `BaseModel` does NOT pull attributes off ORM rows.

**How to avoid:** Inherit from `cmc.api.schemas.common.ORMBase` (already exists, sets `from_attributes=True`). [VERIFIED: backend/cmc/api/schemas/common.py L39–47]

**Warning signs:** Tests that pass a dict to `model_validate()` work; tests that pass an ORM row return zeroed fields.

### Pitfall 6: HITL-02 conflict path returns the wrong row

**What goes wrong:** When `INSERT OR IGNORE` is silently ignored, the handler must fetch the existing pending row to return. If you fetch by `dedup_key` alone (without `status='pending'`), you'll match an old answered row instead of the still-pending dup target.

**Why it happens:** The partial-unique constraint scopes uniqueness by `WHERE status='pending'`, but a naive SELECT misses that scope.

**How to avoid:** Always include `Decision.status == 'pending'` in the fallback SELECT.

**Warning signs:** Tests that re-POST the same `dedup_key` after answering the previous one return the OLD answered row instead of creating a new pending one.

### Pitfall 7: Schedule.cron change in PATCH doesn't recompute next_run_at

**What goes wrong:** SCHD-03 says "clears next_run_at on cron change". A naive PATCH does `UPDATE schedules SET cron=:cron WHERE id=:id` and forgets next_run_at.

**Why it happens:** UPDATE-by-PATCH-payload routinely passes through whatever the client sent.

**How to avoid:** Diff old vs new cron in the handler; if changed, set next_run_at = `next_run(new_cron, now)` (or NULL — see Open Q4 for which the dispatcher prefers).

**Warning signs:** Schedules that fire on the OLD cron schedule until the next dispatcher heartbeat catches up.

### Pitfall 8: Emergency-stop "fails running tasks" race

**What goes wrong:** ESTOP-03 says "fails running tasks". If you UPDATE BEFORE the SIGTERM completes, the dispatcher might still be writing task progress and overwrite `status='failed'` with `status='running'` again.

**Why it happens:** Concurrent writers to the same row.

**How to avoid:** Order: (a) flip emergency_stop flag, (b) SIGTERM PIDs, (c) UPDATE tasks WHERE status='running'. The dispatcher (Phase 8) MUST honor the flag at the top of every iteration (DISP-02 requirement) — once flipped, dispatcher writes stop. Add a small grace sleep (~250ms) between (b) and (c) to let SIGTERM-handlers exit. Document this in §6.

**Warning signs:** Emergency-stopped tasks reverting to running in the dashboard for a few seconds before settling.

### Pitfall 9: ANTHROPIC_API_KEY in tests crashes the test suite

**What goes wrong:** Test imports `nl_to_cron`, the module-level `AsyncAnthropic()` constructor reads `ANTHROPIC_API_KEY` and raises if absent.

**Why it happens:** Eager client construction.

**How to avoid:** Construct AsyncAnthropic INSIDE the function (Pattern 8 above). Tests can monkeypatch `os.environ` or pass a fake `httpx.MockTransport`-backed client.

**Warning signs:** `ImportError: ANTHROPIC_API_KEY` raised by pytest during collection.

### Pitfall 10: subprocess.Popen with redirected stdout file handle leaks fds

**What goes wrong:** The handler opens a log file, passes it as `stdout=`, returns. Python's GC closes the local handle, but the subprocess kept its dup. If the request handler is invoked many times, fd table fills.

**Why it happens:** Misunderstanding of Popen's fd-dup semantics.

**How to avoid:** Open the file BEFORE Popen, pass the file object, IMMEDIATELY close the local handle in a `finally:` block. Subprocess has its own dup.

**Warning signs:** `OSError: too many open files` after sustained TASK-07 traffic.

## Runtime State Inventory

> **Trigger note:** Phase 4 is greenfield (no rename/refactor). However, it introduces NEW runtime state that downstream phases must be aware of. Treat this section as forward-looking inventory rather than retrospective.

| Category | Items Introduced | Action Required |
|----------|------------------|-----------------|
| Stored data | (a) decisions / inbox / tasks / schedules row writes via Phase 4 routers; (b) `system_state.emergency_stop` row | None for Phase 4 — the schema and the partial unique index already exist (Plan 01-05). Phase 8 dispatcher reads these. |
| Live service config | None — Phase 4 has no daemon registrations or external service config. | None. |
| OS-registered state | None for Phase 4. (Phase 8 will register launchd plists.) | None. |
| Secrets/env vars | (a) `ANTHROPIC_API_KEY` (optional, for SCHD-06). | Document in `.env.example`; SCHD-06 returns 503 when missing. |
| Build artifacts | New deps in `uv.lock`: croniter, anthropic. | `uv sync` after adding to pyproject.toml; commit `uv.lock`. |
| Filesystem queues | NEW directories: `repo_root() / .tmp/mission-control-queue/{decisions,inbox,dispatcher-logs,pids}/`. The `messages/` and `pids/` dirs are pre-declared by Plan 03-03 / Phase 8 plan but not yet created on disk. | `.gitignore` already covers `.tmp/` (Plan 03-03 — VERIFIED: `.gitignore` L17–18). No additional ignores needed. Queue writer must `mkdir(parents=True, exist_ok=True)`. |

## Code Examples

Verified patterns from the existing codebase + official library docs.

### Example 1: Router skeleton mirroring Phase 3 patterns

```python
# Source: backend/cmc/api/routes/sessions.py L1–46 (verified pattern)
"""HITL router — HITL-01..07 (decisions + inbox)."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, text, update
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.api.schemas.hitl import (
    DecisionAnswerRequest, DecisionAnswerResponse,
    DecisionCreate, DecisionListItem, DecisionListResponse,
    InboxCreate, InboxListItem, InboxListResponse,
    InboxReplyRequest, InboxReplyResponse,
)
from cmc.core.queue import write_decision_answer, write_inbox_reply
from cmc.db import get_session
from cmc.db.models.decisions import Decision
from cmc.db.models.inbox import InboxMessage

router = APIRouter(tags=["hitl"])
```

### Example 2: PATCH with status transition validation (TASK-03)

```python
# Source: own design + Pattern 4 transition matrix
@router.patch("/tasks/{task_id}", response_model=TaskListItem)
async def patch_task(
    task_id: int,
    payload: TaskUpdate,
    db: AsyncSession = Depends(get_session),
):
    row = (
        await db.execute(select(Task).where(Task.id == task_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="task not found")

    update_kwargs: dict = payload.model_dump(exclude_unset=True)
    new_status = update_kwargs.get("status")
    if new_status is not None and new_status != row.status:
        if not validate_transition(row.status, new_status):
            raise HTTPException(
                status_code=400,
                detail=f"invalid status transition: {row.status!r} → {new_status!r}",
            )
    for k, v in update_kwargs.items():
        setattr(row, k, v)
    await db.commit()
    await db.refresh(row)
    return TaskListItem.model_validate(row)
```

### Example 3: Schedule POST with cron validation + next_run_at compute (SCHD-02)

```python
# Source: croniter README + Pattern 3
from cmc.schedules.cron import validate_cron, next_run

@router.post("/schedules", response_model=ScheduleListItem, status_code=201)
async def create_schedule(
    payload: ScheduleCreate,
    db: AsyncSession = Depends(get_session),
):
    if not validate_cron(payload.cron):
        raise HTTPException(status_code=422, detail="invalid cron expression")
    now = datetime.now(timezone.utc)
    nxt = next_run(payload.cron, now) if payload.enabled else None
    row = Schedule(
        name=payload.name,
        cron=payload.cron,
        enabled=payload.enabled,
        next_run_at=nxt,
        task_template=payload.task_template,
        skill=payload.skill,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError as exc:
        # uq_schedules_name conflict
        await db.rollback()
        raise HTTPException(status_code=409, detail="schedule name already exists") from exc
    await db.refresh(row)
    return ScheduleListItem.model_validate(row)
```

### Example 4: Emergency stop endpoint (ESTOP-01..03)

```python
# Source: Patterns 2 + 7
from cmc.core.process import emergency_stop_all
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

@router.post("/system/emergency-stop", response_model=EmergencyStopResponse)
async def emergency_stop(db: AsyncSession = Depends(get_session)):
    # 1. Set the flag FIRST so dispatcher early-returns on its next iteration.
    now = datetime.now(timezone.utc)
    await db.execute(
        sqlite_insert(SystemState)
        .values(key="emergency_stop", value="1", updated_at=now)
        .on_conflict_do_update(
            index_elements=["key"],
            set_={"value": "1", "updated_at": now},
        )
    )
    await db.commit()

    # 2. Scan PID files + SIGTERM matching processes.
    summary = emergency_stop_all()  # synchronous; subprocess.run is sync

    # 3. Mark in-flight tasks as failed.
    await db.execute(
        update(Task)
        .where(Task.status == "running")
        .values(
            status="failed",
            ended_at=now,
            error_message="emergency stop",
        )
    )
    await db.commit()

    return EmergencyStopResponse(
        emergency_stop=True,
        terminated_pids=summary["terminated"],
        skipped_pids=summary["skipped"],
        missing_pids=summary["missing"],
    )
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `INSERT ... ON DUPLICATE KEY UPDATE` (MySQL) | `INSERT ... ON CONFLICT DO NOTHING/UPDATE` (SQLite, PostgreSQL) | SQLite 3.24 (2018) | Phase 4 uses SQLite-native `on_conflict_do_*` via SQLAlchemy's dialect. |
| `python -m anthropic.cli` (deprecated) | `from anthropic import AsyncAnthropic` | SDK 0.18+ | Modern async API; module-level CLI dropped. |
| `croniter.croniter(expr).get_next()` returning float | `.get_next(datetime)` returning datetime | croniter 0.3 (2014) — long-standing | We pass `datetime` everywhere. Pinning >=6.0 sidesteps the deprecation entirely. |
| `os.fork()` daemon spawning | `subprocess.Popen(start_new_session=True)` | Python 3.2+ | Phase 4 + Phase 8 use start_new_session. |
| `psutil.Process(pid).cmdline()` | `subprocess.run(["ps", "-p", pid, "-o", "command="])` | N/A — both work | REQUIREMENTS.md ESTOP-02 says "via ps command" → follow the spec. |

**Deprecated/outdated:**
- `datetime.utcnow()` (Python 3.12+ deprecated). Use `datetime.now(timezone.utc)`.
- Pydantic v1 `Config(orm_mode=True)`. Use Pydantic v2 `ConfigDict(from_attributes=True)` (already done in `cmc.api.schemas.common.ORMBase`).
- `BackgroundTasks` for long-running work. Use `subprocess.Popen` with `start_new_session=True`.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 9.0+ + pytest-asyncio 0.24+ + httpx 0.28+ + pytest-freezer 0.4+ |
| Config file | `backend/pyproject.toml` `[tool.pytest.ini_options]` (asyncio_mode=auto, testpaths=tests, addopts=-q) |
| Quick run command | `cd backend && uv run pytest tests/test_phase4_<router>.py -x` |
| Full suite command | `cd backend && uv run pytest -x` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| HITL-01 | List filter by status | unit | `pytest tests/test_phase4_hitl.py::test_hitl01_list_filtered -x` | ❌ Wave 0 |
| HITL-02 | INSERT OR IGNORE on partial unique | unit | `pytest tests/test_phase4_hitl.py::test_hitl02_insert_or_ignore -x` | ❌ Wave 0 |
| HITL-03 | Answer queue write + DB update | unit + filesystem | `pytest tests/test_phase4_hitl.py::test_hitl03_answer -x` | ❌ Wave 0 |
| HITL-04 | List filter unread + max_age | unit | `pytest tests/test_phase4_hitl.py::test_hitl04_inbox_list -x` | ❌ Wave 0 |
| HITL-05 | Create inbox message | unit | `pytest tests/test_phase4_hitl.py::test_hitl05_create -x` | ❌ Wave 0 |
| HITL-06 | Mark read | unit | `pytest tests/test_phase4_hitl.py::test_hitl06_mark_read -x` | ❌ Wave 0 |
| HITL-07 | Reply queue write + DB update | unit + filesystem | `pytest tests/test_phase4_hitl.py::test_hitl07_reply -x` | ❌ Wave 0 |
| TASK-01 | List filter by status, quadrant | unit | `pytest tests/test_phase4_tasks.py::test_task01_list -x` | ❌ Wave 0 |
| TASK-02 | Create with all fields | unit | `pytest tests/test_phase4_tasks.py::test_task02_create -x` | ❌ Wave 0 |
| TASK-03 | PATCH with transition validation | unit | `pytest tests/test_phase4_tasks.py::test_task03_patch_transitions -x` | ❌ Wave 0 |
| TASK-04 | Delete | unit | `pytest tests/test_phase4_tasks.py::test_task04_delete -x` | ❌ Wave 0 |
| TASK-05 | Approve flips status | unit | `pytest tests/test_phase4_tasks.py::test_task05_approve -x` | ❌ Wave 0 |
| TASK-06 | Rerun from failed | unit | `pytest tests/test_phase4_tasks.py::test_task06_rerun -x` | ❌ Wave 0 |
| TASK-07 | Spawn dispatcher subprocess | unit + integration | `pytest tests/test_phase4_tasks.py::test_task07_trigger -x` | ❌ Wave 0 |
| SCHD-01 | List schedules | unit | `pytest tests/test_phase4_schedules.py::test_schd01_list -x` | ❌ Wave 0 |
| SCHD-02 | Create with cron + next_run_at | unit | `pytest tests/test_phase4_schedules.py::test_schd02_create -x` | ❌ Wave 0 |
| SCHD-03 | Patch + cron change clears next_run | unit | `pytest tests/test_phase4_schedules.py::test_schd03_patch -x` | ❌ Wave 0 |
| SCHD-04 | Delete | unit | `pytest tests/test_phase4_schedules.py::test_schd04_delete -x` | ❌ Wave 0 |
| SCHD-05 | Last N runs | unit | `pytest tests/test_phase4_schedules.py::test_schd05_runs -x` | ❌ Wave 0 |
| SCHD-06 | NL → cron via Haiku (mocked) | unit | `pytest tests/test_phase4_schedules.py::test_schd06_nl_cron_mocked -x` | ❌ Wave 0 |
| ESTOP-01 | PID scan + SIGTERM | unit + integration | `pytest tests/test_phase4_estop.py::test_estop01_stop -x` | ❌ Wave 0 |
| ESTOP-02 | ps validates claude -p | unit | `pytest tests/test_phase4_estop.py::test_estop02_ps_validation -x` | ❌ Wave 0 |
| ESTOP-03 | Sets emergency flag + fails running | unit | `pytest tests/test_phase4_estop.py::test_estop03_flag_and_fail -x` | ❌ Wave 0 |
| ESTOP-04 | Resume clears flag | unit | `pytest tests/test_phase4_estop.py::test_estop04_resume -x` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd backend && uv run pytest tests/test_phase4_<router>.py -x`
- **Per wave merge:** `cd backend && uv run pytest -x` (all phases must stay green)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `backend/tests/test_phase4_hitl.py` — covers HITL-01..07
- [ ] `backend/tests/test_phase4_tasks.py` — covers TASK-01..07
- [ ] `backend/tests/test_phase4_schedules.py` — covers SCHD-01..06
- [ ] `backend/tests/test_phase4_estop.py` — covers ESTOP-01..04
- [ ] `backend/tests/conftest.py` — extend with `make_decision_row`, `make_inbox_row`, `make_task_row`, `make_schedule_row` factories; add `tmp_pid_dir` fixture for ESTOP tests; add `mock_anthropic_client` fixture for SCHD-06
- [ ] Framework install: `cd backend && uv sync` (croniter + anthropic on first run after pyproject update)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | localhost-only, single-user; no auth layer in scope |
| V3 Session Management | no | no sessions |
| V4 Access Control | yes | All endpoints implicit-trust; ESTOP and TASK-07 are sensitive — but only reachable from 127.0.0.1 (PROJECT.md constraint) |
| V5 Input Validation | yes | Pydantic v2 schemas validate all request bodies; cron validated by croniter; status transitions validated by allow-list |
| V6 Cryptography | no | No crypto in Phase 4 |
| V7 Error Handling | yes | Pre-existing `cmc.core.errors` handler emits `{error: detail}` — no stack traces leak |
| V11 Config Security | yes | Path traversal guarded by repo-root anchoring + sanitized integer IDs in queue paths |
| V12 File / Resource | yes | Queue file paths restricted to `repo_root() / .tmp/mission-control-queue/`; file mode `"a"` append-only |
| V13 Code-Reuse | yes | subprocess.Popen never receives shell=True; argv list always |

### Known Threat Patterns for FastAPI/SQLAlchemy/subprocess Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via filter params | Tampering | SQLAlchemy core / SQLModel parameterizes all user input — already enforced by Phase 1/2/3 patterns |
| Path traversal in queue file IDs | Tampering | Cast `id` and `session_id` params to int / UUID via Pydantic; never accept raw strings into `Path(...)` |
| Command injection via TASK-07 | Tampering / Elevation | Always pass `cmd` as `list[str]`, never `shell=True`. Settings field for the dispatcher binary path is whitelisted to repo-root-anchored. |
| ps output injection (ESTOP-02) | Tampering | We READ ps output, not pass user input to ps. PID is `int` after Pydantic; subprocess.run with argv list. |
| Anthropic prompt injection (SCHD-06) | Tampering | The user's NL prompt is the input; the SYSTEM prompt is locked. The model's output is validated by `croniter.is_valid()` — any non-cron output is rejected. Worst case: model returns a valid cron that doesn't match the user's intent (a usability bug, not a security one). |
| ANTHROPIC_API_KEY exfiltration | Information Disclosure | Read once from env in the SCHD-06 handler; never log; never surface in 503 detail (just say "natural-language schedules unavailable"). |
| Race in emergency-stop PID kill | Repudiation | Pre-kill `ps` check + post-kill log entry to system_state or otel_events. Phase 4 logs to structlog; Phase 8 will write a structured row. |
| Untrusted JSONL file content | Repudiation / Tampering | The queue file content originates from authenticated localhost user input (validated by Pydantic). Phase 8 dispatcher MUST treat queue content as untrusted (re-validate on read). Phase 4 only writes; documenting the contract here for Phase 8. |

## Sources

### Primary (HIGH confidence)

- backend/cmc/db/models/{decisions,inbox,tasks,schedules,system_state}.py — verified all 5 tables, all column names, types, defaults, and indexes match SCHEMA + REQUIREMENTS
- backend/cmc/api/routes/sessions.py — Plan 03-03 SESS-06 queue writer pattern that Phase 4 extends (L267–402)
- backend/cmc/api/routes/system.py — Plan 03-02 system router that Phase 4 will EXTEND with ESTOP endpoints (L1–364)
- backend/cmc/api/routes/__init__.py — `all_routers()` registration pattern (L29–39)
- backend/cmc/api/schemas/common.py — `ORMBase` mixin with `from_attributes=True` (L39–47)
- backend/cmc/api/schemas/sessions.py — Pydantic v2 schema patterns (request + response shapes, ORMBase usage)
- backend/cmc/db/session.py — `get_session` dependency (request.app.state.sessions sessionmaker) (L15–23)
- backend/cmc/core/paths.py — `repo_root()` helper (L17–32)
- backend/cmc/app/lifespan.py — engine + alembic + sync_task wiring; reference for how Phase 4 should NOT add lifespan-level state
- backend/tests/conftest.py — `seeded_app`, `client`, `make_*` factory pattern that Phase 4 extends
- backend/tests/test_phase3_sessions.py — per-router test file convention; `_seed` helper (L50–60)
- .planning/phases/01-foundation-database/01-01-SCHEMA.md — canonical 15-table schema
- .planning/STATE.md — Phase 1/2/3 decisions, conventions, contracts
- .planning/PROJECT.md — project-level constraints (macOS, localhost, no auth, SQLite)
- .planning/REQUIREMENTS.md — REQ definitions for HITL-01..07, TASK-01..07, SCHD-01..06, ESTOP-01..04 (L122–154)
- .planning/phases/03-read-only-apis/03-RESEARCH.md — research patterns Phase 4 mirrors (verification-by-codebase-read approach)
- .planning/phases/03-read-only-apis/03-03-PLAN.md — plan-shape exemplar for Wave 0 + Wave 1 split

### Primary (verified live)

- pypi.org/pypi/croniter/json — version 6.2.2, upload 2026-03-15 [VERIFIED 2026-04-26 via urllib]
- pypi.org/pypi/anthropic/json — version 0.97.0, upload 2026-04-23 [VERIFIED 2026-04-26 via urllib]
- pypi.org/pypi/cronsim/json — version 2.7, upload 2025-10-21 [VERIFIED 2026-04-26 — alternative considered, rejected]
- platform.claude.com/docs/en/about-claude/models/overview — Claude Haiku 4.5 model alias `claude-haiku-4-5`, ID `claude-haiku-4-5-20251001`, $1 input / $5 output per MTok [VERIFIED via WebFetch 2026-04-26]
- macOS `man ps` (Darwin 25.3.0) — `-p PID -o command=` keyword and equals-suffix syntax [VERIFIED 2026-04-26 via local shell]

### Secondary (MEDIUM confidence)

- github.com/pallets-eco/croniter — README pattern for `is_valid` + `get_next` [WebFetch 2026-04-26]
- github.com/anthropics/anthropic-sdk-python — README async pattern (specific Haiku call sample inferred from generic `messages.create` pattern) [WebFetch 2026-04-26]
- man7.org/linux/man-pages/man1/ps.1.html — Linux ps `command=` keyword for cross-platform validation [WebSearch 2026-04-26]

### Tertiary (LOW confidence)

- (none — every claim in this document is either verified against the codebase, the schema, the PyPI registry, or an official docs source)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Queue path for HITL-03 / HITL-07 = `repo_root() / .tmp/mission-control-queue/{decisions,inbox}/{id}.jsonl` extending the SESS-06 pattern | Pattern 5, Open Q1 | LOW — the path can be changed in one place; Phase 8 dispatcher reads from this contract. If Phase 8 expects a different layout, the planner can shift it during plan-checking with one search-replace. |
| A2 | TASK-07 launches `python -m cmc.dispatcher.oneshot` (Phase 8 module not yet shipped) — Phase 4 either ships a stub binary, OR makes the path configurable via Settings | Pattern 6, Open Q5 | MEDIUM — if Phase 8 adopts a different module name, TASK-07 breaks at runtime (not during Phase 4 tests, since tests will mock subprocess.Popen). Recommend adding a `dispatcher_oneshot_cmd: list[str]` Settings field for clean indirection. |
| A3 | ESTOP-04 sets `system_state.emergency_stop = '0'` (vs DELETE the row) | Pattern 2, Open Q3 | LOW — Plan 03-02 SAPI-03 reads emergency_stop via the whitelist; both `'0'` and "row absent" mean "not stopped" to the consumer. Decision is cosmetic; either works. Recommend `'0'` to avoid the absence-vs-explicit-clear ambiguity. |
| A4 | TASK-03 status state machine matrix (§6 Pattern 4): pending↔awaiting_approval, pending→running, running→{done,failed}, failed→pending, done is terminal | Pattern 4, Open Q2 | MEDIUM — REQUIREMENTS.md says "status transition validation" but doesn't enumerate the matrix. The matrix in this research is consistent with TASK-05/06 wording but may need adjustment for skill-driven flows. Plan should ask the user to confirm the matrix in /gsd-discuss-phase OR document the matrix as locked-by-research. |
| A5 | dispatcher PID files live at `repo_root() / .tmp/mission-control-queue/pids/*.pid` | Pattern 7, Open Q6 | LOW — REQUIREMENTS.md DISP-03 says ".tmp/mission-control-queue/pids/" verbatim. Phase 4 ESTOP-01 just READS this directory; Phase 8 writes it. The path is locked by REQUIREMENTS, not by this research. |
| A6 | ANTHROPIC_API_KEY env var name (vs CLAUDE_API_KEY) | Pattern 8 | LOW — Anthropic SDK reads `ANTHROPIC_API_KEY` by default [CITED: github.com/anthropics/anthropic-sdk-python README]. Confirmed in WebFetch. |
| A7 | answered_by values are unconstrained free strings (vs enum {dashboard, telegram, cli}) | HITL-03 schema | LOW — decisions.py declares `answered_by: Optional[str]` with no constraint. Phase 4 schema can be a Pydantic Literal for the three known values OR a free string. Plan should pick one — recommend Literal for cleaner UI. |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.
*This table is non-empty. The 7 assumptions above are non-blocking for planning but worth surfacing in /gsd-discuss-phase before locking task scope.*

## Open Questions (RESOLVED)

1. **Queue file format & path for HITL-03 + HITL-07**
   - What we know: SESS-06 (Plan 03-03) uses `repo_root() / .tmp/mission-control-queue/messages/{sid}.jsonl` with one JSON record per line `{ts, session_id, message}`. The dispatcher (Phase 8) tails this directory.
   - What's unclear: HITL-03 / HITL-07 file naming and record shape are not pre-specified in the requirements text.
   - Recommendation: extend the established pattern verbatim — `decisions/{id}.jsonl` with `{ts, decision_id, answer, answered_by}`; `inbox/{id}.jsonl` with `{ts, inbox_id, reply}`. Lock this in Plan 04-01 (Wave 0) so the four router plans share the writer.
   - **RESOLVED:** repo_root() / .tmp/mission-control-queue/{decisions,inbox}/{id}.jsonl per Plan 04-01 cmc.core.queue

2. **TASK-03 status transition matrix**
   - What we know: REQUIREMENTS.md TASK-03 says "status transition validation" but does not enumerate legal transitions.
   - What's unclear: Is `running → awaiting_approval` ever legal? (e.g., dispatcher escalates mid-task to require approval). Is `done → pending` legal (manual rerun of a successful task)?
   - Recommendation: Lock the §6 Pattern 4 matrix in research as the v1 contract; add an explicit "v2 may extend" comment. Phase 8 dispatcher will discover whether the matrix is too tight; we can extend in Phase 8 plan.
   - **RESOLVED:** Locked matrix in cmc.tasks.transitions per Plan 04-01 (research §6 Pattern 4)

3. **ESTOP-04 resume: clear flag value or DELETE row?**
   - What we know: SAPI-03 whitelists `emergency_stop`. Phase 3 patterns set explicit values.
   - What's unclear: Whether SAPI-03 should return `null` (absent) or `'0'` for the cleared state.
   - Recommendation: UPDATE the row to `value='0'` (don't DELETE). Avoids the "absent vs explicitly cleared" ambiguity in the dashboard. The cost is one extra row, which is fine.
   - **RESOLVED:** UPDATE value='0', do not delete row (Plan 04-05)

4. **SCHD-03 cron-change: clear next_run_at AND recompute, or recompute only?**
   - What we know: REQUIREMENTS.md says "clears next_run_at on cron change". The dispatcher will recompute on its next heartbeat anyway (DISP-01 materializes schedules).
   - What's unclear: Whether the API should pre-compute the new `next_run_at` immediately for the dashboard's countdown widget.
   - Recommendation: do BOTH — clear, then recompute via `next_run(new_cron, now)`. This makes the SCHD-02 and SCHD-03 paths produce the same outcome and keeps the dashboard countdown immediately accurate. Document as the locked behavior.
   - **RESOLVED:** Clear AND recompute next_run_at when cron changes (Plan 04-04)

5. **TASK-07 dispatcher binary location**
   - What we know: REQUIREMENTS.md TASK-07 says "spawns one-shot dispatcher run via subprocess.Popen". The actual dispatcher script is a Phase 8 deliverable.
   - What's unclear: What does Phase 4 launch? A no-op stub? An imported module that doesn't exist yet?
   - Recommendation: Add a Settings field `dispatcher_oneshot_cmd: list[str]` defaulting to `["python", "-m", "cmc.dispatcher.oneshot"]`. Phase 4 ships the trigger endpoint + a stub `cmc.dispatcher.oneshot:main()` that just exits 0 with a logged "stub". Phase 8 replaces the stub with the real implementation. Tests mock subprocess.Popen.
   - **RESOLVED:** Settings.dispatcher_oneshot_cmd defaults to [sys.executable, '-m', 'cmc.dispatcher.oneshot']; stub in 04-01, real in Phase 8

6. **Phase 8 PID file format and lifecycle**
   - What we know: REQUIREMENTS.md DISP-03 says PIDs live at `.tmp/mission-control-queue/pids/`.
   - What's unclear: file naming convention (`{task_id}.pid`? `{pid}.pid`? `{session_id}.pid`?), file content (`PID\n` only? PID + claude argv?), cleanup (sweep on exit? sweep stale files on start?).
   - Recommendation: Phase 4 ESTOP-01 just iterates `*.pid` files and reads the first integer line. Phase 8 owns the format. Phase 4 must be tolerant of garbage files (skip non-int + log).
   - **RESOLVED:** Phase 4 tolerates malformed/garbage PID files (try/except per file); format finalized in Phase 8

7. **Inbox INSERT idempotency**
   - What we know: `inbox` table has no partial unique index (verified inbox.py L44–48).
   - What's unclear: Should HITL-05 dedup on (session_id, subject)? (It currently doesn't.)
   - Recommendation: No dedup in v1. The dispatcher (Phase 8 DISP-08) will need to be careful not to spam the inbox, but that's a producer-side problem, not an API-side problem.
   - **RESOLVED:** No dedup in v1; inserts always succeed (Plan 04-02). Phase 8 producer side enforces if needed

8. **Anthropic SDK availability in the test environment**
   - What we know: anthropic 0.97.0 is on PyPI; we can install it.
   - What's unclear: Whether the test environment has network access to Anthropic's API. (Almost certainly NO during CI.)
   - Recommendation: Mock `AsyncAnthropic.messages.create` in tests via `unittest.mock.AsyncMock`. The real-network path is verified manually during the plan checkpoint (or never — the live call is rare).
   - **RESOLVED:** Test fixture mocks anthropic.AsyncAnthropic in conftest.py per Plan 04-01 Task 3

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.13 | All Phase 4 work | ✓ | 3.13 (pyproject `requires-python = ">=3.13"`) | — |
| FastAPI 0.136.1 | All routers | ✓ | 0.136.1 | — |
| SQLAlchemy 2.0.49 | All routers | ✓ | 2.0.49 | — |
| SQLite 3.47.x with WAL + foreign_keys=ON | All DB writes; partial unique INSERT OR IGNORE | ✓ | 3.47.x (system) | — |
| Alembic 1.18.4 | None for Phase 4 (no schema change) | ✓ | 1.18.4 | — |
| ps (BSD/GNU) | ESTOP-01..02 PID validation | ✓ | macOS BSD ps | — (Linux GNU ps also accepts `command=` keyword) |
| /bin/kill / os.kill | ESTOP-01 SIGTERM | ✓ | stdlib `os.kill` + `signal.SIGTERM` | — |
| croniter | SCHD-02, SCHD-03, SCHD-06 | ✗ | — | NEW: `uv add croniter==6.2.2` |
| anthropic | SCHD-06 only | ✗ | — | NEW: `uv add anthropic==0.97.0`. **Optional**: SCHD-06 returns 503 when ANTHROPIC_API_KEY unset. |
| ANTHROPIC_API_KEY env | SCHD-06 runtime only | ✗ | — | SCHD-06 returns 503 with `detail="natural-language schedules unavailable"`. |

**Missing dependencies with no fallback:** None — Phase 4 can ship without ANTHROPIC_API_KEY (SCHD-06 degrades gracefully).

**Missing dependencies with fallback:** anthropic SDK + ANTHROPIC_API_KEY → SCHD-06 returns 503 (documented user-facing behavior).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every existing dep verified against backend/pyproject.toml; new deps verified against PyPI on 2026-04-26 with timestamps.
- Architecture: HIGH — Phase 3 patterns are directly readable in the codebase; Phase 4 follows them verbatim. The four router plans + ESTOP-extends-system pattern is the obvious extension.
- Pitfalls: HIGH — pulled from a combination of (a) verified language features (Pydantic v2, SQLAlchemy 2.0 dialect), (b) shell behavior verified locally (ps -o command=, BSD on Darwin 25.3.0), (c) cross-references to known croniter/anthropic SDK gotchas.
- Schema: HIGH — every requirement's column/index/constraint is grep-verified in the SQLModel files.
- File queue path: MEDIUM — extends Plan 03-03 pattern; the precise sub-directory names (decisions/, inbox/) are this research's recommendation, not pre-existing locked decisions.
- TASK-03 transition matrix: MEDIUM — synthesized from REQUIREMENTS.md text + Pattern 4. Worth surfacing in /gsd-discuss-phase.

**Research date:** 2026-04-26
**Valid until:** 2026-06-25 (60 days — relatively stable area; revisit if FastAPI 0.137+ or anthropic 1.0 ships in the interim)
