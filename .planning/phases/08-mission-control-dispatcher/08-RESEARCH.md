# Phase 8: Mission Control Dispatcher — Research

**Researched:** 2026-04-27
**Domain:** Standalone Python dispatcher process driven by launchd (heartbeat every 120s); atomic task claim + schedule materialization in SQLite; subprocess management for `claude -p` (classic) and `claude --output-format stream-json --input-format stream-json` (stream); DECISION:/INBOX: marker extraction from a structured-message stream; PID-file lifecycle; emergency-stop flag honoring; skill autonomy gate + Haiku-based skill router; model-resolution chain.
**Confidence:** HIGH on Phase 4 inheritance contracts (queue paths, PID dir, emergency-stop flag, transitions, croniter, anthropic client, ps validation); HIGH on Claude Agent SDK Python message wire format (verified 2026-04-27 against `anthropics/claude-agent-sdk-python` `types.py` + `_internal/message_parser.py`); HIGH on launchd plist shape; MEDIUM on `--input-format stream-json` stdin shape (officially undocumented per anthropics/claude-code#24594; the SDK's `parse_message` covers what to **emit** for user follow-ups since the stream-json wire format is symmetric); MEDIUM on the project-internal DECISION:/INBOX: marker grammar (defined here in §6.7 — locked by Phase 8 plan; downstream phases must conform).

## Summary

Phase 8 is purely backend. It produces (a) a standalone Python entrypoint `python -m cmc.dispatcher.oneshot` that launchd invokes every 120 seconds, (b) supporting modules under `cmc.dispatcher.*` (claim, materialize, run-classic, run-stream, sweep, skill-router, model-resolve, marker-parser, follow-up-injector), (c) a launchd LaunchAgent plist template, and (d) the dispatcher tick stamp into `system_state.dispatcher_last_tick_at` so the existing SAPI-04 stale-dispatcher banner lights up correctly. The Phase 4 stub (`cmc.dispatcher.oneshot.main()` returning 0) is replaced; nothing in Phase 4–7 router code changes besides a one-line ingestion of the stale-dispatcher tick stamp on each cycle.

The hard parts are not the launchd wiring or subprocess.Popen — those are already proven in Phase 4 (`cmc.tasks.spawn`, `cmc.core.process`). The hard parts are: (1) atomic task claim under WAL across ≤3 concurrent dispatcher slots without losing or double-claiming a row; (2) DECISION:/INBOX: marker extraction from `--output-format stream-json` events, ignoring fenced code blocks (PITFALLS.md §6 — must be addressed before stream mode ships); (3) blocking on a decision answer poll (`status='answered'`) without busy-waiting against the DB; (4) injecting user follow-ups (HITL-04..07 + SESS-06 queue files) into a running stream-mode subprocess via stdin in the symmetric stream-json shape; (5) bounded concurrency across cycles (PIDs from a previous cycle may still be running when the next launchd tick fires).

The model resolution chain (DISP-10) is plain dict precedence with no surprises. The skill router (DISP-11) is one Haiku call with a strict JSON-output system prompt, the same shape as Phase 4's `nl_to_cron` — already proven. The launchd plist (DISP-12) only needs `<key>StartInterval</key><integer>120</integer>` plus the `${repo_root}/backend/.venv/bin/python` absolute path (NOT `/usr/bin/python3`, which is the 3.9 system Python and lacks our deps).

**Primary recommendation:** Five plans across four waves. Wave 0 lays down `cmc.dispatcher.heartbeat` (orchestrator: emergency-stop check, sweep, claim, materialize, fan-out) plus shared `cmc.dispatcher.state` helpers (tick stamp + concurrency cap + pid-file write/read). Wave 1 ships classic mode + the launchd plist template (DISP-05 + DISP-12 — they belong together because the plist's StandardOutPath/StandardErrorPath need to exist before classic-mode logs are useful). Wave 2 ships stream mode minus follow-up injection (DISP-06 + DISP-07 + DISP-08 — emit DECISION/INBOX, block on answer poll). Wave 3 ships follow-up injection + the skill router + model resolver (DISP-09 + DISP-10 + DISP-11 — they all touch the per-task spawn config). Wave 4 ships the cross-cutting tests (one large fixture-driven test_phase8_dispatcher.py + a launchd plist render smoke test) and the close-out checkpoint. Total estimated 5 plans, ~30–40 unit + 4–6 integration tests, no Alembic migration (no schema changes).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 120s heartbeat trigger | OS / launchd (LaunchAgent plist with StartInterval=120) | — | Native macOS supervision — DISP-12 mandates a plist template; no in-process scheduler. |
| Heartbeat orchestrator (claim → materialize → fan-out → tick stamp) | Standalone Python (`cmc.dispatcher.heartbeat.run_one_cycle()`) | Database / Storage (SQLite WAL) | Runs in a separate process from FastAPI; shares only the `data/cmc.db` file (PROJECT.md decision). |
| Atomic task claim (`status='pending' → 'running'`) | Database / Storage (SQLite `BEGIN IMMEDIATE` + `UPDATE … WHERE id IN (...) RETURNING`) | Standalone Python (claim helper) | WAL allows one writer at a time; `BEGIN IMMEDIATE` plus a bounded `LIMIT N` sub-select serialize claim across concurrent dispatcher invocations. |
| Schedule materialization (`schedules → tasks` rows) | Standalone Python (`cmc.dispatcher.materialize`) | Database / Storage | Cron evaluation already in `cmc.schedules.cron`; materialize is just `INSERT INTO tasks(...schedule_id=...)` plus `UPDATE schedules SET last_run_at, next_run_at`. |
| Classic-mode subprocess (`claude -p "PROMPT"`) | OS / Process (`subprocess.Popen` + timeout) | Filesystem (stdout log file in `.tmp/.../classic-logs/`) | Identical shape to Phase 4's `spawn_dispatcher_oneshot` minus `start_new_session=True` — dispatcher is now the parent that wants to wait. |
| Stream-mode subprocess (`claude --output-format stream-json --input-format stream-json --verbose`) | OS / Process (`subprocess.Popen` with stdin/stdout pipes) | Standalone Python (line reader → marker parser) | Bidirectional NDJSON over stdin/stdout; reader is one async (or threaded) loop per task. |
| DECISION:/INBOX: marker extraction | Standalone Python (`cmc.dispatcher.marker_parser`) | — | Pure function: input = stream-json event dict; output = (kind, payload, in_code_fence_state). PITFALLS.md §6 mandates fenced-code-block skip. |
| Decision answer wait loop | Database / Storage (`SELECT … WHERE status='answered'`) | Standalone Python (poll-with-sleep, max 1h) | DB is the single source of truth (HITL-03 writes `status='answered'` after queue-file write). Polling cadence: 2s (matches dashboard 5s polling — dispatcher should be at least as responsive as the user-facing UI). |
| Follow-up injection (queue files → subprocess stdin) | Filesystem (`.tmp/mission-control-queue/{decisions,inbox,messages}/`) | Standalone Python (poll → write NDJSON to stdin) | The queue files already exist (SESS-06, HITL-03, HITL-07 — Phase 3/4); the dispatcher reads-then-truncates atomically and injects `{"type":"user","message":{"role":"user","content":[{"type":"text","text":"…"}]}}` into stdin. |
| Stale PID sweep (zombie cleanup) | Standalone Python (`cmc.dispatcher.sweep`) | Filesystem (`.tmp/.../pids/*.pid`) + OS (`os.kill(pid, 0)`) | One pass per cycle BEFORE claiming new tasks — frees concurrency slots. |
| Bounded concurrency (≤3 tasks) | Standalone Python (slot accounting via PID-file count) | — | `MAX_CONCURRENT - len(live_pids_after_sweep)` = how many to claim this cycle. |
| Skill autonomy gate (skill.autonomy ∈ {auto,review,manual}) | Standalone Python (read `skills.autonomy` for `task.skill`) | Database / Storage | `auto` runs immediately; `review`/`manual` flip task to `awaiting_approval` instead of `running`. |
| Skill router (Haiku selects best skill) | Standalone Python (`cmc.dispatcher.skill_router`) | External service (Anthropic API via existing `anthropic==0.97.0` dep) | Mirrors `nl_to_cron` (Phase 4) — strict system prompt, JSON-validated output, 503-graceful when API key missing. |
| Model resolution (task > skill frontmatter > env > CLI default) | Standalone Python (pure function `resolve_model(task, skill, settings)`) | — | Plain precedence chain; no I/O. |
| Emergency-stop flag honoring | Database / Storage (`SELECT system_state WHERE key='emergency_stop'`) | Standalone Python (early return) | One SELECT at top of `run_one_cycle()`; if value=='1', skip everything and return. Phase 4 ESTOP-01..03 already writes the flag. |
| Dispatcher tick stamp | Database / Storage (`INSERT … ON CONFLICT DO UPDATE` on `system_state` key=`dispatcher_last_tick_at`) | Standalone Python (after every cycle, success or failure) | SAPI-02 daemon_ages + SAPI-04 stale_dispatcher_seconds both already read this key. |

## Project Constraints (from CLAUDE.md)

`./CLAUDE.md` does not exist in the project root [VERIFIED: file missing]. Operative project-level constraints come from `.planning/PROJECT.md` and `.planning/STATE.md`:

- macOS-only platform; **launchd is the supervision model** (PROJECT.md "Constraints"). Linux portability (systemd) is v2 (PLAT-01).
- Python 3.13+ via `backend/.venv/bin/python` (uv-managed, CPython 3.13.1). [VERIFIED: `cat backend/.venv/pyvenv.cfg`]
- SQLite single-file WAL with `PRAGMA foreign_keys=ON` enforced via the engine's connect listener. Two writers (FastAPI + dispatcher) MUST coordinate; WAL handles serialization, but `BEGIN IMMEDIATE` is required for the claim transaction or two dispatcher invocations could double-claim.
- Bind to 127.0.0.1 only — no auth. Dispatcher does NOT need to listen on a port; it speaks to FastAPI by writing to the shared SQLite + queue files (DISP-08 INBOX uses POST to `/api/inbox` per requirement, so it DOES make a localhost HTTP call — see §6.4 for the rationale and the alternative).
- No outbound network calls except (a) optional Telegram, (b) optional Anthropic API for SCHD-06 / DISP-11. DISP-11 MUST tolerate a missing `ANTHROPIC_API_KEY` by skipping the router and falling back to "no skill assigned" (the task runs without skill context — see §6.5).
- Repo-root path resolution lives in `cmc.core.paths.repo_root()`; **all queue / PID / log file paths anchor here**. The dispatcher MUST set its working directory to the repo root when spawning so `repo_root()` resolves correctly (or import `cmc.core.paths` and call it explicitly).
- `cmc.tasks.spawn.spawn_dispatcher_oneshot` already detaches the dispatcher with `start_new_session=True` — the dispatcher itself does NOT do that for its child `claude` processes (it wants to be the parent so it can wait/poll). [VERIFIED: backend/cmc/tasks/spawn.py L27-37]
- `cmc/dispatcher/oneshot.py` exists as a Phase 4 stub (returns 0). Phase 8 replaces its body. [VERIFIED]
- The Phase 4 transition matrix (`cmc.tasks.transitions`) already permits the transitions Phase 8 needs: `pending → running` (claim), `pending → awaiting_approval` (autonomy gate), `running → done` (success), `running → failed` (timeout / nonzero exit / emergency stop). Done is terminal; failed → pending requires explicit /api/tasks/{id}/rerun. [VERIFIED: backend/cmc/tasks/transitions.py L16-22]

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DISP-01 | Heartbeat runs every 120s via launchd, claims pending tasks atomically, materializes schedules, invokes dispatcher | §3 launchd, §4 atomic claim, §5 materialize, §6 orchestrator |
| DISP-02 | Dispatcher honors emergency_stop flag with early return | §6.1 — one SELECT at top of `run_one_cycle`; same KV row Phase 4 ESTOP-03 writes |
| DISP-03 | Dispatcher sweeps stale PIDs from `.tmp/mission-control-queue/pids/` | §6.2 — `os.kill(pid, 0)` probe, ProcessLookupError → unlink stale .pid file; mirrors Phase 4 Pattern 7 |
| DISP-04 | Dispatcher runs up to MAX_CONCURRENT (3) tasks with skill autonomy check | §6.3 — `MAX_CONCURRENT - len(live_pids)`; skill.autonomy in {auto,review,manual}; review/manual → `pending → awaiting_approval` |
| DISP-05 | Classic mode: `subprocess.Popen claude -p` with timeout, stdout capture, PID tracking | §7.1 — `subprocess.Popen([claude_bin, "-p", prompt, "--output-format", "json", "--bare"], stdout=PIPE, ...)`; `proc.wait(timeout=...)`; PID file write before wait |
| DISP-06 | Stream mode: `subprocess.Popen` with stdin/stdout pipes, JSON line parsing, PID tracking | §7.2 — pipes both directions; line-buffered reader; `--output-format stream-json --input-format stream-json --verbose --include-partial-messages` |
| DISP-07 | Stream mode parses `DECISION:` markers (skipping fenced code blocks), blocks on answer poll | §7.3 — marker_parser as state machine; assistant message text only; fenced-code state tracked across deltas; `wait_for_answer(decision_id, timeout_s)` polls `decisions.status` |
| DISP-08 | Stream mode parses `INBOX:` markers and posts to `/api/inbox` | §7.4 — same marker_parser; POST via `httpx` (already a dev dep) to `http://127.0.0.1:{settings.port}/api/inbox` |
| DISP-09 | Stream mode polls queue file for user follow-ups and injects to stdin | §7.5 — read-then-truncate `.tmp/.../{decisions,inbox,messages}/{key}.jsonl`, write user messages as NDJSON to subprocess stdin |
| DISP-10 | Dispatcher resolves model from task > skill frontmatter > env > CLI default | §8 — pure-function precedence; `Skill.frontmatter` already a JSON dict per Phase 3 SKIL-01 |
| DISP-11 | Skill router uses Haiku to pick best skill for unassigned tasks | §9 — mirrors `nl_to_cron`; system prompt enumerates available skills (filter by `user_invocable=True`); JSON output validated against skill names |
| DISP-12 | Launchd plist template with correct Python path (not `/usr/bin/python3`) | §3 launchd; absolute path to `${repo_root}/backend/.venv/bin/python`; rendered from a Jinja-style template, NOT shipped pre-rendered (per-machine repo path) |

## Standard Stack

### Core (already installed — Phases 1–4, NO change)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python | 3.13.1 | Runtime | [VERIFIED: backend/.venv/pyvenv.cfg `version_info = 3.13.1`]; PROJECT.md constraint |
| SQLAlchemy | 2.0.49 + SQLModel 0.0.38 + aiosqlite 0.22.1 | Async ORM stack — dispatcher reads/writes via the same engine factory FastAPI uses | [VERIFIED: backend/pyproject.toml] — Phase 4 already proved cross-process WAL coordination works |
| psutil | 7.2.2 | Already installed (Phase 3 SAPI-02 memory_info); reused for live-PID sweep + classic-mode timeout backstop | [VERIFIED: backend/pyproject.toml L16] |
| croniter | 6.2.2 | Already installed (Phase 4 SCHD-02); reused by materializer | [VERIFIED: backend/pyproject.toml L17] |
| anthropic | 0.97.0 | Already installed (Phase 4 SCHD-06); reused for DISP-11 skill router | [VERIFIED: backend/pyproject.toml L18 + 2026-04-27 PyPI re-check returned `0.97.0`] |
| structlog | 25.5.0 | Already installed; dispatcher logs to a per-cycle log file via the same logger config FastAPI uses | [VERIFIED: backend/pyproject.toml L15] |

### New for Phase 8

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| httpx | >=0.28 (already in dev extras as test dep) | DISP-08 posts INBOX markers to `http://127.0.0.1:{port}/api/inbox` | [VERIFIED: backend/pyproject.toml L25 — already a dev dep]. Promote to a runtime dep (move under `[project] dependencies`). Alternative: write directly to the `inbox` table via SQLAlchemy — see §6.4 Open Q1. |

**Installation:**
```bash
cd backend && uv add httpx  # promote from dev to runtime
```

**Version verification (re-run before locking the plan):**
```bash
python3 -c "import urllib.request, json; print('httpx', json.load(urllib.request.urlopen('https://pypi.org/pypi/httpx/json'))['info']['version'])"
python3 -c "import urllib.request, json; print('anthropic', json.load(urllib.request.urlopen('https://pypi.org/pypi/anthropic/json'))['info']['version'])"  # confirm 0.97.0 still current
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| httpx for DISP-08 | Direct SQLAlchemy `INSERT INTO inbox(...)` | Saves the dep promotion AND localhost RTT. **Recommendation:** still use httpx — DISP-08's REQUIREMENTS.md wording says "posts to /api/inbox" verbatim. Direct INSERT bypasses Pydantic validation, response-shape tests, and the future possibility of inbox-creation side effects (notifications, etc.). Pay the localhost call. |
| anthropic SDK for DISP-11 | aiohttp + raw HTTP to api.anthropic.com | Phase 4 SCHD-06 set the precedent — use the SDK for consistency. |
| `subprocess.Popen` (sync) for `claude` children | `asyncio.create_subprocess_exec` | Both work. Phase 4 TASK-07 / DISP-05 / DISP-06 (REQUIREMENTS.md verbatim) all say `subprocess.Popen`. Stick with the spec. The reader loop runs in a thread (`threading.Thread` per task) or in `asyncio.to_thread()` so the dispatcher's main loop stays responsive. |
| Threads per task | `asyncio` per task | The dispatcher is a one-shot CLI run, not a long-lived async server — `threading.Thread` per stream-mode task is simpler (no event loop policy entanglement, no async-context-manager cleanup races). |
| `psutil.pid_exists(pid)` for sweep | `os.kill(pid, 0)` | psutil.Process(pid).is_running() is more reliable against PID reuse [CITED: psutil docs 7.2.3]. Use `psutil.pid_exists()` for the cheap cleanup-only path (sweep) and `os.kill(pid, signal.SIGTERM)` for the kill path (already in cmc.core.process). |
| Custom JSON line reader for stream-json | `json.loads(line)` per stdout line | Plain stdlib is correct. The Claude Agent SDK's `parse_message` (verified 2026-04-27 against `anthropics/claude-agent-sdk-python` `_internal/message_parser.py`) demonstrates the exact wire shape: each line is one complete JSON object with `type` ∈ {user, assistant, system, result, stream_event} and a nested `message` for assistant/user. We do NOT need to import the SDK — we implement the same `match data["type"]` switch ourselves (the project already chose to call the CLI directly, not the SDK, per §11 below). |
| `claude-agent-sdk-python` SDK | Direct CLI subprocess | The SDK adds an async-only API and a runtime dep on `mcp`, plus its own message parsing layer. We need bidirectional pipes, marker parsing, and follow-up injection — all of which we'd have to bolt on top of the SDK anyway. Direct subprocess + symmetric NDJSON wins on simplicity. |

## Architecture Patterns

### System Architecture Diagram

```
   launchd (LaunchAgent ~/Library/LaunchAgents/com.cmc.dispatcher.plist)
                       │
                       │ StartInterval=120  (every 120s, plus RunAtLoad on user login)
                       ▼
   ${repo_root}/backend/.venv/bin/python -m cmc.dispatcher.oneshot
                       │
                       ▼
   cmc.dispatcher.heartbeat.run_one_cycle()
                       │
                       ├─► [1] cmc.config.Settings()  (load env + .env)
                       │
                       ├─► [2] open async engine + sessionmaker (cmc.db.create_engine_for_settings)
                       │
                       ├─► [3] SELECT system_state WHERE key='emergency_stop'
                       │       ── if value=='1': stamp tick, dispose engine, return 0
                       │
                       ├─► [4] cmc.dispatcher.sweep.sweep_stale_pids()
                       │       └─► glob .tmp/mission-control-queue/pids/*.pid
                       │           psutil.pid_exists(pid) ? skip : unlink stale .pid
                       │           returns set[int] of live PIDs
                       │
                       ├─► [5] cmc.dispatcher.materialize.materialize_due_schedules(now)
                       │       └─► SELECT schedules WHERE enabled=1 AND next_run_at <= :now
                       │           for each: INSERT INTO tasks(...schedule_id=s.id)
                       │                     UPDATE schedules SET last_run_at=:now,
                       │                            next_run_at=next_run(cron, :now)
                       │
                       ├─► [6] cmc.dispatcher.claim.claim_pending_tasks(slots_available)
                       │       └─► slots_available = MAX_CONCURRENT (3) - len(live_pids)
                       │           BEGIN IMMEDIATE
                       │             UPDATE tasks SET status='running', started_at=:now
                       │             WHERE id IN (
                       │               SELECT id FROM tasks
                       │                WHERE status='pending'
                       │                  AND (scheduled_for IS NULL OR scheduled_for <= :now)
                       │                ORDER BY priority ASC, created_at ASC
                       │                LIMIT :slots_available
                       │             )
                       │             RETURNING *
                       │           COMMIT
                       │           Returns list[Task] of the rows actually claimed.
                       │
                       ├─► [7] for each claimed task (in a Thread):
                       │       └─► cmc.dispatcher.autonomy_gate(task) ──┐
                       │              skill.autonomy in {review,manual}? ──► PATCH task to awaiting_approval, exit
                       │       ┌───────────────────────────────────────┘
                       │       └─► cmc.dispatcher.run_classic OR run_stream
                       │              │
                       │              ├─► cmc.dispatcher.model_resolve(task, skill, settings)
                       │              ├─► subprocess.Popen([claude_bin, ...args])
                       │              ├─► .tmp/.../pids/{task_id}.pid := proc.pid
                       │              │
                       │              ├─► classic: capture stdout (PIPE), proc.wait(timeout=task.timeout_s)
                       │              ├─► stream:  reader thread parses NDJSON →
                       │              │                ├─► assistant text → marker_parser
                       │              │                │       ├─► DECISION: → INSERT decisions; wait_for_answer
                       │              │                │       └─► INBOX:    → httpx POST /api/inbox
                       │              │                └─► follow-up poller thread reads queue files →
                       │              │                       writes user-message NDJSON to stdin
                       │              │
                       │              └─► on exit: UPDATE task SET status, ended_at, error_message
                       │                          unlink .tmp/.../pids/{task_id}.pid
                       │
                       └─► [8] UPSERT system_state SET key='dispatcher_last_tick_at',
                                  value=now.isoformat()
                              dispose engine; return 0
```

### Recommended Project Structure

```
backend/cmc/dispatcher/
├── __init__.py                    # NEW: re-export run_one_cycle for testability
├── oneshot.py                     # REPLACE: Phase-4 stub becomes real entry point
├── heartbeat.py                   # NEW: run_one_cycle orchestrator (DISP-01)
├── claim.py                       # NEW: atomic BEGIN IMMEDIATE + UPDATE … RETURNING
├── materialize.py                 # NEW: schedules → tasks rows + recompute next_run_at
├── sweep.py                       # NEW: stale PID file cleanup
├── run_classic.py                 # NEW: DISP-05 — subprocess.Popen claude -p
├── run_stream.py                  # NEW: DISP-06 — Popen + reader + follow-up injector
├── marker_parser.py               # NEW: DISP-07/08 — fenced-code-aware marker extraction
├── follow_ups.py                  # NEW: DISP-09 — queue-file → stdin NDJSON injector
├── model_resolve.py               # NEW: DISP-10 — pure-function precedence chain
├── skill_router.py                # NEW: DISP-11 — Haiku skill picker (anthropic SDK)
└── state.py                       # NEW: tick stamp, pid-file r/w, MAX_CONCURRENT const

backend/cmc/dispatcher/templates/
└── com.cmc.dispatcher.plist.j2    # NEW: DISP-12 — launchd plist template

backend/tests/
└── test_phase8_dispatcher.py      # NEW: single test file per Phase-3/4 convention
                                   # ~30-40 unit tests, ~4-6 integration tests
```

**Why one test file:** Phase 3+ established "one test file per phase" (test_phase4_hitl.py, test_phase4_tasks.py, etc.). Phase 8 has 12 reqs concentrated in one domain (the dispatcher) — split into one file with section-marker comments per DISP-* req, mirroring the per-router split in Phase 4.

### Pattern 1: Atomic claim under SQLite WAL (DISP-01)

**What:** Two dispatcher invocations could overlap if the previous cycle ran longer than 120s (heavy load, slow stream-mode task). Both will try to claim pending tasks. Without a write lock, both could see the same `status='pending'` row, both UPDATE it to `running`, and both spawn a `claude -p` subprocess for the same task.

**When to use:** This is THE foundation pattern for DISP-01. Every other DISP-* depends on it being correct.

**Example:**
```python
# Source: SQLite docs lang_returning.html + lang_transaction.html (WebFetch 2026-04-27)
# Pattern verified against the existing decision/task models in this codebase.
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.db.models.tasks import Task

CLAIM_SQL = text("""
    UPDATE tasks
    SET status = 'running',
        started_at = :now
    WHERE id IN (
        SELECT id FROM tasks
        WHERE status = 'pending'
          AND (scheduled_for IS NULL OR scheduled_for <= :now)
        ORDER BY priority ASC, created_at ASC
        LIMIT :slots
    )
    RETURNING *
""")


async def claim_pending_tasks(db: AsyncSession, slots: int) -> list[dict]:
    """Atomically claim up to `slots` pending tasks. Returns claimed rows."""
    if slots <= 0:
        return []
    now = datetime.now(timezone.utc)

    # BEGIN IMMEDIATE acquires the write lock NOW (instead of deferring to first
    # write). Without this, two dispatcher invocations could each see the same
    # 3 'pending' rows during their SELECT phase and double-claim. WAL allows
    # one writer; BEGIN IMMEDIATE serializes the claim transaction.
    async with db.begin():
        # SQLAlchemy 2.0 async sessions use BEGIN by default. Force IMMEDIATE
        # via raw SQL — connection lives until the with-block exits.
        await db.execute(text("BEGIN IMMEDIATE"))
        result = await db.execute(CLAIM_SQL, {"now": now, "slots": slots})
        rows = result.mappings().all()
    return [dict(r) for r in rows]
```

**Pitfalls:**
- SQLite's `BEGIN IMMEDIATE` can fail with `SQLITE_BUSY` if another writer holds the lock. The `busy_timeout` PRAGMA (already set in the engine connect listener — Plan 01-04) gives us 5–30s to wait. If still busy, the cycle ends without claiming; the next 120s tick retries. Document this as expected behavior.
- `RETURNING *` since SQLite 3.35 [VERIFIED: sqlite.org/lang_returning.html]; we have 3.51.0 [VERIFIED: `sqlite3 --version` 2026-04-27]. Memory buffering of RETURNING output is fine for `LIMIT 3` — three tasks max.
- Order of RETURNING rows is NOT guaranteed [CITED: sqlite.org/lang_returning.html]. We don't depend on order — we iterate the list and spawn one subprocess per row.
- Don't put a subquery in RETURNING that references `tasks` — undefined behavior per the docs. We're returning all columns; no subquery needed.

### Pattern 2: Schedule materialization (DISP-01)

**What:** Schedules with `enabled=1 AND next_run_at <= now` need a `tasks` row created from `schedules.task_template` (a JSON column populated by SCHD-02). After insert, recompute `next_run_at = next_run(cron, now)` and stamp `last_run_at=now`.

**Example:**
```python
# Source: backend/cmc/db/models/schedules.py (Phase 1) + cmc.schedules.cron.next_run (Phase 4).
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.db.models.schedules import Schedule
from cmc.db.models.tasks import Task
from cmc.schedules.cron import next_run


async def materialize_due_schedules(db: AsyncSession) -> list[int]:
    """Returns list of newly-created task ids. One schedule -> one task row."""
    now = datetime.now(timezone.utc)
    due = (
        await db.execute(
            select(Schedule)
            .where(Schedule.enabled == True)  # noqa: E712 — explicit for SQLite
            .where(Schedule.next_run_at <= now)
        )
    ).scalars().all()

    created: list[int] = []
    for s in due:
        # Project task_template into the Task row. task_template is a dict like
        # {"title": "...", "description": "...", "model": "claude-sonnet-4", "execution_mode": "classic", ...}.
        # Spread it into Task() — extra keys (not on the model) raise; document as a contract:
        # task_template MUST only contain valid Task field names.
        t = Task(
            **s.task_template,
            schedule_id=s.id,
            status="pending",
            created_at=now,
            scheduled_for=now,  # claim eligibility starts now
        )
        db.add(t)
        await db.flush()  # populate t.id before commit for the return
        created.append(t.id)

        s.last_run_at = now
        s.next_run_at = next_run(s.cron, now)

    await db.commit()
    return created
```

**Pitfalls:**
- `task_template` is operator-supplied JSON via SCHD-02 — validate at SCHEDULE-CREATE time (Phase 4 already does this via Pydantic), not at materialize time. The materializer trusts the column.
- If `next_run` raises (corrupted cron — should be unreachable since SCHD-02 validated, but defensive), the schedule is left untouched and we move on. Don't crash the cycle.
- Race: a schedule materialized in cycle N might still have its previous task running when cycle N+1 fires. That's intentional — multiple invocations of the same schedule are explicitly allowed (the user could want a chatty heartbeat task). The autonomy gate / `awaiting_approval` is the throttle, not the materializer.

### Pattern 3: launchd LaunchAgent plist with venv Python path (DISP-12)

**What:** A `~/Library/LaunchAgents/com.cmc.dispatcher.plist` file rendered from a template. `${repo_root}` and `${python_path}` are substituted at install time (Phase 9). StartInterval=120 fires every 120s; RunAtLoad=true gives an immediate cycle when the user logs in.

**Why "not /usr/bin/python3":** macOS 12+ ships Python 3.9 at `/usr/bin/python3`. Our deps require Python 3.13+. The plist MUST point at the venv-managed interpreter, which is `${repo_root}/backend/.venv/bin/python` (CPython 3.13.1) [VERIFIED: backend/.venv/pyvenv.cfg].

**Example:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.cmc.dispatcher</string>

    <key>ProgramArguments</key>
    <array>
        <string>${python_path}</string>          <!-- e.g. /Users/foo/.../backend/.venv/bin/python -->
        <string>-m</string>
        <string>cmc.dispatcher.oneshot</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${repo_root}</string>                <!-- so cmc.core.paths.repo_root() resolves correctly -->

    <key>EnvironmentVariables</key>
    <dict>
        <key>PYTHONUNBUFFERED</key>
        <string>1</string>                       <!-- so log lines appear in real time -->
        <key>PATH</key>
        <string>${python_path_dir}:/usr/bin:/bin</string>  <!-- so subprocess.Popen finds `claude` -->
    </dict>

    <key>StartInterval</key>
    <integer>120</integer>                       <!-- DISP-01 cadence -->

    <key>RunAtLoad</key>
    <true/>                                      <!-- fire one cycle on login -->

    <key>StandardOutPath</key>
    <string>${repo_root}/.tmp/mission-control-queue/dispatcher-logs/oneshot.out</string>

    <key>StandardErrorPath</key>
    <string>${repo_root}/.tmp/mission-control-queue/dispatcher-logs/oneshot.err</string>

    <key>ProcessType</key>
    <string>Background</string>                  <!-- macOS QoS: low priority, throttled CPU -->
</dict>
</plist>
```

**Loading (operator command, documented for Phase 9 install.sh):**
```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.cmc.dispatcher.plist
launchctl enable gui/$(id -u)/com.cmc.dispatcher
launchctl kickstart gui/$(id -u)/com.cmc.dispatcher    # fire one cycle now
launchctl print gui/$(id -u)/com.cmc.dispatcher        # debug
launchctl bootout gui/$(id -u)/com.cmc.dispatcher      # uninstall
```

**Pitfalls:**
- launchd does NOT inherit the user's `$PATH`. Subprocess.Popen for `claude` MUST either (a) get the full path to the binary (`/opt/homebrew/bin/claude`) [VERIFIED: `which claude` 2026-04-27], or (b) set `PATH` in the plist's `EnvironmentVariables`. Use both: ship a `Settings.claude_bin` field defaulting to `/opt/homebrew/bin/claude`, and ALSO set PATH in the plist for safety.
- StartInterval drift: launchd does NOT guarantee exactly 120s — if the system was asleep, the next wake fires ONCE (not 50 catch-up cycles). [CITED: launchd.info "if the system is asleep, the job will be started the next time the computer wakes up"]
- StandardOutPath and StandardErrorPath directories must exist BEFORE the plist loads or launchd silently drops output. The install script must `mkdir -p` the dispatcher-logs dir.
- `bootstrap`/`bootout` is the modern API (macOS 10.10+); `load -w` / `unload -w` is deprecated. Use the modern form. [CITED: launchd.info]

### Pattern 4: Stream-json wire format (DISP-06/07/08/09)

**What:** Each line on `claude --output-format stream-json` stdout is one complete JSON object. The Python Agent SDK's parser (verified 2026-04-27 against `anthropics/claude-agent-sdk-python` `_internal/message_parser.py`) tells us exactly what to expect:

| `type` field | Carries | Field shape |
|--------------|---------|-------------|
| `system` | metadata: init, api_retry, plugin_install, task_progress, etc. | `{"type":"system", "subtype": "init"\|"api_retry"\|..., ...}` |
| `assistant` | one assistant turn (post-stream consolidated) | `{"type":"assistant", "message": {"role":"assistant", "model": "...", "content": [ContentBlock]}, "session_id": "...", "uuid": "..."}` |
| `user` | one user turn (echoed back from CLI) or a tool_result wrapping | `{"type":"user", "message": {"role":"user", "content": "..." or [ContentBlock]}, ...}` |
| `result` | final envelope at end of run | `{"type":"result", ...}` |
| `stream_event` | per-token streaming delta (only when `--include-partial-messages`) | `{"type":"stream_event", "event": {"type":"content_block_delta"\|..., "delta": {"type":"text_delta", "text":"..."}}}` |

**ContentBlock shapes** (from `types.py` L860-936, verified 2026-04-27):

| `block.type` | Fields |
|--------------|--------|
| `text` | `{"type":"text", "text": str}` |
| `thinking` | `{"type":"thinking", "thinking": str, "signature": str}` |
| `tool_use` | `{"type":"tool_use", "id": str, "name": str, "input": dict}` |
| `tool_result` | `{"type":"tool_result", "tool_use_id": str, "content": str\|list[dict], "is_error": bool}` |
| `server_tool_use` | `{"type":"server_tool_use", "id": str, "name": str, "input": dict}` |
| `advisor_tool_result` | `{"type":"advisor_tool_result", "tool_use_id": str, "content": dict}` |

**Stream input (DISP-09 follow-up injection):** The SDK's bidirectional input shape is symmetric — `{"type":"user", "message": {"role":"user", "content": "..." OR list[ContentBlock]}}`. Each NDJSON line written to stdin is one such object. [CITED: code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode — "yield {type: 'user', message: {role: 'user', content: '...'}}"]

**Caveat (anthropics/claude-code#24594, verified 2026-04-27):** The CLI flag `--input-format stream-json` is officially under-documented. The SDK exposes the symmetric NDJSON shape via TypeScript/Python wrappers; we are using the same wire format directly. If the CLI rejects our stdin format we fall back to the SDK (introduces dep on `claude-agent-sdk` — see §11 contingency).

### Pattern 5: Marker parser as fenced-code-aware state machine (DISP-07/08)

**What:** PITFALLS.md §6 mandates: "Track fenced code block state: maintain a boolean `in_code_fence` flag that toggles on lines starting with triple backticks. Only parse for markers when `in_code_fence` is false. Require markers to appear at the start of a line (after optional whitespace)."

**Example:**
```python
# Source: PITFALLS.md §6 + own design.
# Lives at: backend/cmc/dispatcher/marker_parser.py
import re
from dataclasses import dataclass
from typing import Iterator, Literal, Optional

_DECISION_RE = re.compile(r"^\s*DECISION:\s*(?P<body>.*\S)\s*$")
_INBOX_RE    = re.compile(r"^\s*INBOX:\s*(?P<body>.*\S)\s*$")
_FENCE_RE    = re.compile(r"^\s*```")  # any line whose first non-ws is ```


@dataclass
class Marker:
    kind: Literal["DECISION", "INBOX"]
    body: str  # the text after the marker, stripped


class MarkerParser:
    """Fenced-code-aware DECISION:/INBOX: extractor.

    Stateful: feed `feed_text(text)` per assistant text-delta; toggles fence
    state across deltas. Yields zero or more Markers.

    Why stateful: stream-json delivers text in chunks (deltas + consolidated
    assistant message). A fenced ``` opening can land in one chunk and the
    matching closing fence in another. The fence flag spans the whole stream.

    Also tracks an internal line-buffer: text that doesn't end in '\\n'
    waits for the next chunk before being parsed. Prevents 'DECISI' in chunk N
    + 'ON: foo' in chunk N+1 from looking like noise.
    """
    def __init__(self) -> None:
        self.in_fence = False
        self._buffer = ""

    def feed_text(self, text: str) -> Iterator[Marker]:
        self._buffer += text
        while "\n" in self._buffer:
            line, self._buffer = self._buffer.split("\n", 1)
            yield from self._parse_line(line)

    def flush(self) -> Iterator[Marker]:
        """Call at end-of-stream to emit any buffered final line."""
        if self._buffer:
            yield from self._parse_line(self._buffer)
            self._buffer = ""

    def _parse_line(self, line: str) -> Iterator[Marker]:
        if _FENCE_RE.match(line):
            self.in_fence = not self.in_fence
            return
        if self.in_fence:
            return  # never parse markers inside fenced code
        m = _DECISION_RE.match(line)
        if m:
            yield Marker(kind="DECISION", body=m.group("body"))
            return
        m = _INBOX_RE.match(line)
        if m:
            yield Marker(kind="INBOX", body=m.group("body"))
```

**Wired up to the stream-json reader:**
```python
from cmc.dispatcher.marker_parser import MarkerParser

parser = MarkerParser()

for line in iter(proc.stdout.readline, b""):
    event = json.loads(line)
    match event.get("type"):
        case "assistant":
            for block in event.get("message", {}).get("content", []):
                if block.get("type") == "text":
                    for marker in parser.feed_text(block["text"]):
                        if marker.kind == "DECISION":
                            handle_decision(marker.body, task)
                        else:  # INBOX
                            handle_inbox(marker.body, task)
        case "stream_event":
            ev = event.get("event", {})
            if ev.get("type") == "content_block_delta":
                delta = ev.get("delta", {})
                if delta.get("type") == "text_delta":
                    for marker in parser.feed_text(delta["text"]):
                        ... # same as above
        case _:
            pass  # system, user, result — ignore for marker purposes

for marker in parser.flush():
    ...  # final flush
```

**Pitfalls:**
- A marker spanning multiple lines (rare but possible — the LLM could emit `DECISION:\nWhich foo?`). The regex requires the body on the SAME line. Document this as the v1 contract: markers are one-line; downstream phases can extend to multi-line if real-world stream output requires it.
- `~~~` fenced blocks (CommonMark allows this) — NOT handled in v1. Markdown's ```` ``` ```` is the dominant fence; document the limitation.
- An LLM-generated "documentation example that says `DECISION:`" inside backticks but on a single line (no fence) WILL trigger a false positive. Mitigation: require markers to be the FIRST non-whitespace text on the line (already in regex `^\s*`). An inline backtick `` `DECISION: should I deploy?` `` has the backtick before `DECISION`, so `^\s*DECISION:` doesn't match. Verified in the regex above.

### Pattern 6: Decision answer poll (DISP-07)

**What:** After writing a `DECISION:` row, the dispatcher must wait for the user to answer. Phase 4 HITL-03 writes `decisions.status='answered'` AND the answer body to the queue file (file-then-DB ordering). The dispatcher polls the DB; on answer, reads the queue file (or the DB row's `answer` column) and resumes.

**Example:**
```python
import asyncio
from datetime import datetime, timezone
from sqlalchemy import select

from cmc.db.models.decisions import Decision

POLL_INTERVAL_S = 2.0   # match dashboard's 5s polling — be at least as responsive
MAX_WAIT_S      = 3600  # 1h cap — log + auto-fail beyond this


async def wait_for_answer(sessions, decision_id: int) -> Optional[str]:
    """Poll until decision answered. Returns answer string or None on timeout."""
    deadline = datetime.now(timezone.utc).timestamp() + MAX_WAIT_S
    while datetime.now(timezone.utc).timestamp() < deadline:
        async with sessions() as db:
            row = (
                await db.execute(select(Decision).where(Decision.id == decision_id))
            ).scalar_one_or_none()
            if row is not None and row.status == "answered":
                return row.answer  # may be None if the user "skipped"
        await asyncio.sleep(POLL_INTERVAL_S)
    return None  # timed out
```

**Pitfalls:**
- Don't hold a session open across the sleep. Open a fresh session per poll iteration so the connection isn't pinned.
- The dashboard polls decisions every 5s (Phase 7 HPNL-01). Dispatcher polling at 2s means the answer reaches the running task within ~2s of the user's POST — feels instant.
- If `wait_for_answer` returns None (timeout), the dispatcher writes a SIGTERM-ish stop into the stream-mode subprocess via stdin (an `interrupt` user message — see §6.6) and marks the task `failed` with `error_message="decision timeout"`.

### Pattern 7: Skill router via Haiku (DISP-11)

**What:** When a task has no `skill` set AND skills exist in the registry, ask Haiku 4.5 to pick the best skill. Mirrors `nl_to_cron` exactly.

**Example:**
```python
# Source: backend/cmc/schedules/nlcron.py (Phase 4 SCHD-06) + own skill router design.
import json
import os
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from cmc.db.models.skills import Skill

_SYSTEM_PROMPT = """You are a skill router. Given a task title, description, and a list of available skills (name + description), output ONLY a JSON object {"skill": "<name>"} where <name> is one of the provided skill names, or {"skill": null} if no skill matches. Do NOT include explanations, code blocks, or any other text."""


async def pick_skill(db: AsyncSession, task_title: str, task_desc: str) -> Optional[str]:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return None  # graceful degradation — task runs without skill

    available = (
        await db.execute(
            select(Skill).where(Skill.user_invocable == True)  # noqa: E712
        )
    ).scalars().all()
    if not available:
        return None

    skill_list = "\n".join(
        f"- {s.name}: {s.description or '(no description)'}"
        for s in available
    )
    user_prompt = (
        f"Task title: {task_title}\n"
        f"Task description: {task_desc}\n\n"
        f"Available skills:\n{skill_list}"
    )

    from anthropic import AsyncAnthropic
    client = AsyncAnthropic(api_key=api_key)
    msg = await client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=128,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )
    text = msg.content[0].text.strip()

    try:
        parsed = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(parsed, dict):
        return None
    chosen = parsed.get("skill")
    if not chosen:
        return None
    # Validate against the registry — model could hallucinate.
    valid_names = {s.name for s in available}
    return chosen if chosen in valid_names else None
```

**Pitfalls:**
- Hallucinated skill name → reject (last block above).
- Empty skill registry → return None and run the task without skill context. Don't crash.
- Token cost: ~200–500 input tokens (skill list) + 64 output tokens ≈ $0.0005 per call. Negligible. [VERIFIED: platform.claude.com/docs/en/about-claude/models/overview — Haiku 4.5 $1/$5 per MTok]

### Pattern 8: Model resolution chain (DISP-10)

**What:** Pure function. No I/O.

**Example:**
```python
def resolve_model(task, skill, settings) -> str:
    """task > skill.frontmatter.model > env CMC_DEFAULT_MODEL > CLI default."""
    if task.model:
        return task.model
    if skill is not None:
        fm_model = (skill.frontmatter or {}).get("model")
        if fm_model:
            return str(fm_model)
    env_model = os.environ.get("CMC_DEFAULT_MODEL")
    if env_model:
        return env_model
    # CLI default — passing nothing is correct behavior; claude picks for us.
    return "sonnet"  # documented v1 default; Haiku is too cheap for the typical task
```

**Pitfalls:**
- Tasks without an explicit model AND no skill AND no env still need a default — pick "sonnet" (most useful general-purpose). Document in PROJECT.md / settings docstring.
- The chosen model is passed to claude as `--model <alias>` or via the system prompt — verify which form claude CLI accepts in v2.1.112 [VERIFIED: `claude --version` returned 2.1.112; `--model` flag exists per `claude --help` (manual probe deferred to plan)].

### Anti-Patterns to Avoid

- **Don't run the dispatcher inside the FastAPI process.** ARCHITECTURE.md §Anti-Pattern 3 + STATE.md decisions both forbid this. The dispatcher is a separate process under launchd. (Phase 4 TASK-07 already established subprocess.Popen detachment — Phase 8 doesn't change that contract.)
- **Don't share a sessionmaker between FastAPI and the dispatcher.** They are different processes. Each constructs its own engine via `cmc.db.create_engine_for_settings(settings)` and disposes at end of cycle.
- **Don't `os.kill(pid, signal.SIGKILL)` for cleanup.** Use SIGTERM (Phase 4 ESTOP-01 standard); the dispatcher's classic-mode timeout uses Popen.kill() which is SIGKILL — but ONLY after a `terminate()` + grace period.
- **Don't busy-wait on the answer poll.** 2s sleep per iteration; never `while True: select(...)` without a sleep.
- **Don't import from `cmc.api.*` in `cmc.dispatcher.*`.** ARCHITECTURE.md §Anti-Pattern 4 — dispatcher and server share only the DB. Importing routes pulls FastAPI into the dispatcher's import graph for no reason.
- **Don't use `asyncio.create_subprocess_exec` for `claude`.** REQUIREMENTS.md DISP-05/06 say `subprocess.Popen` verbatim. Stick with the spec.
- **Don't ship the rendered plist in the repo.** It contains absolute paths that differ per machine. Ship a template; render at install time.
- **Don't parse markers from raw text lines.** PITFALLS.md §6 — parse from the `assistant` event's `content[*].text`, NOT from raw stdout chars. (The marker parser DOES use raw text — but only the inner text of an assistant content block, not raw NDJSON bytes. Re-read §6.5 to be sure.)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cron next-run computation | New parser | `cmc.schedules.cron.next_run` (already in repo) | Phase 4 already shipped this with DST, leap, weekday-wrap handling. |
| PID file scan + ps validation | New module | `cmc.core.process` (already in repo) | Phase 4 ESTOP-02 already proved the BSD ps `command=` pattern. Phase 8 reuses for sweep + emergency-stop in-cycle check. |
| Queue path layout | New helper | `cmc.core.queue.queue_path("decisions"\|"inbox"\|"messages", key)` | One source of truth; HITL-03/07 + SESS-06 + Phase 8 follow-up reader all route through this. |
| Stream-json parser | NDJSON tokenizer | `json.loads(line)` per stdout line + a `match data["type"]` switch | The Python Agent SDK's `_internal/message_parser.py` is 200 lines of one-line-per-event JSON parsing — we copy that pattern, not the SDK itself. |
| HITL marker grep | `re.findall("DECISION:", text)` over raw stdout | `MarkerParser` (Pattern 5 here) | The fence-state pitfall (PITFALLS.md §6) ALONE invalidates a grep approach. |
| Haiku call boilerplate | New `messages.create` wrapper | Copy the shape of `cmc.schedules.nlcron.nl_to_cron` | Already proven in Phase 4 — single async call, JSON-validated output, 503-graceful, lazy-imported AsyncAnthropic for testability. |
| launchd plist boilerplate | Hand-write per developer | A single Jinja-style template under `cmc/dispatcher/templates/` rendered by Phase 9's install.sh | DISP-12 wording; deliverable is a template + a render helper. |
| Atomic claim | Loop-and-retry SELECT-then-UPDATE | `BEGIN IMMEDIATE` + `UPDATE … WHERE id IN (SELECT … LIMIT N) RETURNING *` | Compare-and-swap costs many round-trips and still races on WAL. RETURNING in one statement is one transaction. |
| Stale PID detection | Custom `/proc` reader | `psutil.pid_exists(pid)` (we already have psutil 7.2.2) | psutil handles the macOS sandbox-deny case. For mass cleanup, this is fine; for kill, use `cmc.core.process.validate_pid_is_claude` (Pattern 7 in Phase 4) to avoid SIGTERM'ing unrelated PIDs. |
| Symmetric stream-json input format | Reverse-engineer from blog posts | The shape is documented in [code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode): `{"type":"user","message":{"role":"user","content":"..."}}` per NDJSON line | Documented (in the SDK overview) even if the CLI flag itself is under-documented. |

**Key insight:** Phase 8 is mostly **reuse**. Every cross-cutting concern (cron, PID, queue paths, ps validation, KV upsert, anthropic SDK call shape, transition matrix) was solved in Phase 4. The genuinely new code is: heartbeat orchestration, atomic claim SQL, marker parser state machine, stream-json reader/writer threads, follow-up file-to-stdin pump, and the launchd plist template. ~1000–1500 LOC total across `cmc/dispatcher/*`.

## Runtime State Inventory

> Phase 8 is greenfield code — but it INTRODUCES new runtime state that downstream phases (9: install.sh, telegram) and operators must be aware of.

| Category | Items Introduced | Action Required |
|----------|------------------|-----------------|
| Stored data | (a) `tasks` rows transitioning `pending → running → done\|failed` (Phase 4 schema, no migration); (b) `decisions` rows inserted via DECISION: marker; (c) `inbox` rows posted via DISP-08; (d) `system_state.dispatcher_last_tick_at` upsert per cycle | None for Phase 8 — schema already exists. Phase 8 plan only writes/reads. |
| Live service config | (a) `~/Library/LaunchAgents/com.cmc.dispatcher.plist` registered with launchd (per-user); (b) launchd service `com.cmc.dispatcher` enabled in `gui/$(id -u)` domain | Plist registered by Phase 9 `install.sh` (DISP-12 ships the template; install.sh renders + bootstraps). Phase 8's deliverable is the template + a render helper, NOT the install. |
| OS-registered state | launchd job entry; if Phase 8 ships a hand-tested `bootstrap` command, the operator's launchd state changes durably until `bootout` | Document the bootstrap/bootout commands in the plan's checkpoint section. Tests run against a temp plist path; never bootstrap in tests. |
| Secrets/env vars | (a) `ANTHROPIC_API_KEY` (optional, for DISP-11); (b) `CMC_DEFAULT_MODEL` (optional, for DISP-10 fallback); (c) launchd plist `EnvironmentVariables` block must NOT contain ANTHROPIC_API_KEY in plaintext — sourced via `~/.cmc/env` if needed | Phase 8 plan: document that the plist's EnvironmentVariables intentionally OMITS ANTHROPIC_API_KEY; install.sh sources it from a separate user-config file. v1 acceptable: dispatcher reads from `os.environ` which inherits from launchd → empty by default. Operator runs `launchctl setenv ANTHROPIC_API_KEY ...` if they want skill router. |
| Build artifacts | New module `cmc/dispatcher/templates/com.cmc.dispatcher.plist.j2` — must be a package-data file so `importlib.resources` can load it | Add to `[tool.hatch.build.targets.wheel] include = [...]` if hatchling needs an explicit include for non-`.py` files (verify: by default hatchling includes everything under the package root). |
| Filesystem queues | NEW directories the dispatcher writes to: `.tmp/mission-control-queue/dispatcher-logs/oneshot.{out,err}`, `.tmp/mission-control-queue/dispatcher-logs/{task_id}-{cycle}.log`, and `.tmp/mission-control-queue/pids/{task_id}.pid`. The queue READ directories (`decisions/`, `inbox/`, `messages/`) already exist from Phase 3/4 writes. | `.gitignore` already covers `.tmp/` [VERIFIED: backend/.gitignore L17]. The dispatcher MUST `mkdir(parents=True, exist_ok=True)` for any new subdir on first write. |

## Common Pitfalls

### Pitfall 1: Two dispatcher cycles overlap and double-claim

**What goes wrong:** A stream-mode task runs longer than 120s. launchd fires cycle N+1 while cycle N is still mid-spawn. Both call `claim_pending_tasks(slots=3)`. Without a write lock, both see the same 3 pending rows; both UPDATE; both spawn `claude` for the same task. User sees 2 PIDs for one task.

**Why it happens:** SQLite WAL allows one writer at a time, but the implicit BEGIN at the start of `db.begin()` is DEFERRED, not IMMEDIATE — the lock is acquired on first WRITE. The SELECT-LIMIT-3 in our claim runs before the UPDATE, so two cycles can each read the same rows during their respective SELECT phases.

**How to avoid:** Force `BEGIN IMMEDIATE` at the start of the claim transaction (Pattern 1 above). The first cycle gets the write lock; the second waits up to `busy_timeout` (5s default, set in Phase 1 engine listener). If the second cycle still can't get the lock, it logs and exits cleanly — the next 120s tick retries.

**Warning signs:** Two PID files for the same `{task_id}.pid`; two `oneshot-{ts}.log` files spawning the same `claude -p`; user reports "the task ran twice".

### Pitfall 2: launchd cycle exceeds 120s + doesn't gracefully overlap

**What goes wrong:** Long-running stream-mode tasks (interactive, waiting for human answers) easily exceed 120s. launchd does not wait for the previous invocation to exit before firing the next StartInterval — it just spawns another. Concurrent dispatcher PIDs accumulate.

**Why it happens:** StartInterval is fire-and-forget per launchd's design. [CITED: launchd.info]

**How to avoid:** Each cycle is its own process, owns its own claimed tasks (atomic claim guarantees no overlap), and writes its own `dispatcher-logs/oneshot-{ts}.log`. The PID FILES (`{task_id}.pid`) are the cross-cycle coordination — sweep at the top of each cycle reclaims slots from finished tasks. **DO NOT** add a "wait for previous cycle" mutex; that defeats the cap and bottlenecks the system.

**Warning signs:** Dispatcher logs piling up at `.tmp/.../dispatcher-logs/`; multiple Python processes via `pgrep -f "cmc.dispatcher.oneshot"`. (Multiple is OK as long as the PID-file count never exceeds MAX_CONCURRENT.)

### Pitfall 3: Stream mode subprocess hangs on stdin pipe

**What goes wrong:** We open stdin=PIPE so we can inject follow-ups. But if no follow-up ever arrives, claude waits forever on its end. The dispatcher's main thread waits on `proc.wait()`. Deadlock.

**Why it happens:** A pipe's reader (claude) blocks until either data or EOF. We never close stdin while the task is running.

**How to avoid:** A separate **follow-up poller thread** (cmc.dispatcher.follow_ups) reads from the queue file every 1s; when there's a new line, write it to stdin (with a trailing `\n`); when the parent task should end, close stdin (`proc.stdin.close()`) so claude sees EOF and exits its read loop. The reader thread (parsing stdout) signals end-of-stream by joining when stdout closes.

**Warning signs:** Stream-mode tasks staying in `running` state for >1 hour with no log output; ESTOP-01 SIGTERMs them.

### Pitfall 4: DECISION marker landing inside fenced code block (PITFALLS.md §6)

**What goes wrong:** Claude generates a code example that contains `DECISION:`. Naive grep creates a phantom decision row.

**Why it happens:** Marker convention applied to assistant text without context awareness.

**How to avoid:** Pattern 5 above — `MarkerParser` tracks `in_fence` boolean across deltas; only emits markers when fence is closed; requires `^\s*DECISION:` (line-start) anchor. Test cases MUST include: (a) DECISION inside ```` ``` ```` fence → no emission; (b) closing fence then DECISION → one emission; (c) DECISION inside backtick-inline `` `DECISION:` `` → no emission (line-start anchor).

**Warning signs:** Phantom decisions in the queue containing backticks or code-syntax bodies; PITFALLS.md §6 "Decisions containing backtick-fenced content or code syntax".

### Pitfall 5: Stale `dispatcher_last_tick_at` on dispatcher crash

**What goes wrong:** Cycle crashes early (e.g., DB connection failure). `dispatcher_last_tick_at` doesn't get updated. SAPI-04 banner lights up "stale dispatcher". Operator panics.

**Why it happens:** Tick stamp lives at the END of `run_one_cycle()`; an exception bypasses it.

**How to avoid:** Stamp the tick **at the START** of the cycle, OR wrap the cycle body in `try/finally` and stamp in `finally`. Recommendation: `try/finally` so a tick that's actively running registers liveness even when the cycle is failing internally. Document this as the contract for SAPI-04.

**Warning signs:** Stale-dispatcher banner during otherwise-healthy operation; dispatcher_last_tick_at age stuck at 600s+.

### Pitfall 6: Claude CLI binary path differs across machines

**What goes wrong:** Dispatcher hard-codes `/opt/homebrew/bin/claude`. User installed claude via `npm i -g` to `~/.npm-global/bin/claude`. `subprocess.Popen` raises `FileNotFoundError`.

**Why it happens:** Single-vendor assumption.

**How to avoid:** New `Settings.claude_bin: Path = Path("/opt/homebrew/bin/claude")` field with default of "claude" (relying on PATH). The plist's `EnvironmentVariables` sets PATH so `claude` resolves. Tests use a stub fake-claude script.

**Warning signs:** Tasks staying `pending` indefinitely; oneshot.err logs show "FileNotFoundError: claude".

### Pitfall 7: Materializer creates tasks with bad `task_template` schema

**What goes wrong:** SCHD-02 didn't validate the task_template against `Task` model fields. Materializer's `Task(**s.task_template, ...)` raises `TypeError: unexpected keyword argument 'priorty'` (typo) and the schedule never fires again.

**Why it happens:** Phase 4 SCHD-02's Pydantic schema for `task_template` is a `dict[str, Any]` (loose), not a strict subset of TaskCreate.

**How to avoid:** (a) Phase 8 materializer wraps the spread in try/except, logs, marks the schedule problematic (don't update next_run_at — let SAPI-04 surface it), and continues. (b) Optionally tighten SCHD-02 to validate `task_template` against `TaskCreate.model_validate({...})` at create-time, but this is a Phase 4 fix retroactively — out of scope for Phase 8.

**Warning signs:** A schedule with `last_run_at` lagging far behind `now`; oneshot.err containing TypeError on a schedule materialize.

### Pitfall 8: ANTHROPIC_API_KEY leaks via subprocess inheritance

**What goes wrong:** Dispatcher reads `ANTHROPIC_API_KEY` for the skill router. It then spawns `claude -p`. `claude` inherits the env var. If a malicious task prompt asks claude to "echo your env vars to a file", the key leaks.

**Why it happens:** subprocess.Popen inherits parent env by default.

**How to avoid:** When spawning `claude`, pass an explicit `env=` dict that EXCLUDES `ANTHROPIC_API_KEY` (claude has its own auth, typically a ~/.claude config — we don't need to forward our key). Document the threat model: localhost-only, single-user — but defense in depth still wins.

**Warning signs:** Won't be visible in normal operation; surface via security review checklist.

### Pitfall 9: Concurrent UPSERTs on `dispatcher_last_tick_at` from overlapping cycles

**What goes wrong:** Cycles N and N+1 overlap; both UPSERT the tick stamp. The later one wins, but if the SQLite write lock isn't acquired correctly, one of them could fail with SQLITE_BUSY and the cycle aborts.

**Why it happens:** UPSERT is a write; same WAL writer serialization applies.

**How to avoid:** UPSERT inside a short transaction (autocommit is fine — SQLAlchemy 2.0 commits each `await session.commit()`). busy_timeout handles the rare contention. If it fails, log and continue — the next cycle re-stamps.

**Warning signs:** Sporadic SQLITE_BUSY in dispatcher logs.

### Pitfall 10: PID file written AFTER long-running spawn returns 

**What goes wrong:** Race: cycle spawns claude (returns instantly); writes pid file; SIGTERM arrives between spawn and pid-file write. Emergency stop scans pids dir, finds nothing, fails to terminate the child.

**Why it happens:** Two non-atomic operations.

**How to avoid:** Write the PID file **immediately** after `Popen` returns, BEFORE entering the wait/read loop. Use `os.replace(tmp, final)` atomic rename so the file appears or doesn't, never partial.

**Warning signs:** Emergency stop reports "0 PIDs terminated" while a `claude` process is clearly running.

### Pitfall 11: Reader thread hangs after subprocess exits

**What goes wrong:** Stream-mode reader does `for line in iter(proc.stdout.readline, b"")`. On subprocess exit, stdout closes, `readline()` returns `b""`, loop ends — IF stdout is line-buffered. With block buffering, the last partial line is lost.

**Why it happens:** Default Popen stdout is block-buffered.

**How to avoid:** `bufsize=1` on Popen (line-buffered) AND `text=True` (or wrap stdout in TextIOWrapper). Both standard.

**Warning signs:** Last assistant message body missing in dispatcher logs; markers near end of stream not emitted.

### Pitfall 12: Skill autonomy field has unexpected value

**What goes wrong:** `skills.autonomy` is a free-text column in the schema [VERIFIED: backend/cmc/db/models/skills.py L25]. The dispatcher branches on `if skill.autonomy in {"auto", "review", "manual"}`. A skill with `autonomy="approval-required"` (someone hand-edited a SKILL.md) isn't in our set, so the dispatcher's else-branch kicks in.

**Why it happens:** No enum constraint.

**How to avoid:** Treat unknown autonomy values as `manual` (most conservative). Document the v1 vocabulary in the autonomy gate's docstring.

**Warning signs:** Tasks with skill X always going to `awaiting_approval` despite the user expecting `auto`.

## Code Examples

Verified patterns — sources cited inline.

### Example 1: One-cycle orchestrator

```python
# Source: own design synthesizing Pattern 1-8 above + cmc.config + cmc.db.
# Lives at: backend/cmc/dispatcher/heartbeat.py
import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select, text
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.config import load_settings
from cmc.db import create_engine_for_settings, make_sessionmaker
from cmc.db.models.system_state import SystemState
from cmc.dispatcher.claim import claim_pending_tasks
from cmc.dispatcher.materialize import materialize_due_schedules
from cmc.dispatcher.run_classic import run_classic
from cmc.dispatcher.run_stream import run_stream
from cmc.dispatcher.sweep import sweep_stale_pids

log = logging.getLogger(__name__)

MAX_CONCURRENT = 3


async def run_one_cycle() -> int:
    """One launchd-driven heartbeat cycle. Returns process exit code."""
    settings = load_settings()
    engine = create_engine_for_settings(settings)
    sessions = make_sessionmaker(engine)

    try:
        # 1. Tick stamp BEFORE the body so SAPI-04 sees liveness even on crash.
        await _stamp_tick(sessions)

        # 2. Emergency stop check.
        async with sessions() as db:
            row = (await db.execute(
                select(SystemState).where(SystemState.key == "emergency_stop")
            )).scalar_one_or_none()
            if row is not None and (row.value or "") == "1":
                log.info("dispatcher.emergency_stop_active")
                return 0

        # 3. Sweep stale PID files.
        live_pids = sweep_stale_pids()

        # 4. Materialize due schedules.
        async with sessions() as db:
            new_task_ids = await materialize_due_schedules(db)
            if new_task_ids:
                log.info("dispatcher.materialized %s", new_task_ids)

        # 5. Claim pending tasks (capped by available slots).
        slots = max(0, MAX_CONCURRENT - len(live_pids))
        if slots == 0:
            log.info("dispatcher.no_slots live=%d", len(live_pids))
            return 0
        async with sessions() as db:
            claimed = await claim_pending_tasks(db, slots)
        log.info("dispatcher.claimed %d", len(claimed))

        # 6. Fan out — one thread per task. Wait for all to finish.
        threads = []
        for row in claimed:
            mode = row.get("execution_mode") or "classic"
            target = run_stream if mode == "stream" else run_classic
            t = threading.Thread(target=target, args=(row, settings, sessions), daemon=False)
            t.start()
            threads.append(t)
        for t in threads:
            t.join()

        return 0
    finally:
        await engine.dispose()


async def _stamp_tick(sessions) -> None:
    now = datetime.now(timezone.utc)
    async with sessions() as db:
        await db.execute(
            sqlite_insert(SystemState)
            .values(key="dispatcher_last_tick_at", value=now.isoformat(), updated_at=now)
            .on_conflict_do_update(
                index_elements=["key"],
                set_={"value": now.isoformat(), "updated_at": now},
            )
        )
        await db.commit()
```

### Example 2: Classic-mode runner (DISP-05)

```python
# Source: subprocess docs + Phase 4 spawn.py pattern.
# Lives at: backend/cmc/dispatcher/run_classic.py
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from cmc.core.paths import repo_root
from cmc.core.process import pid_dir
from cmc.dispatcher.model_resolve import resolve_model

DEFAULT_TIMEOUT_S = 600  # 10 min default — task.timeout_s overrides if present


def run_classic(task_row: dict, settings, sessions) -> None:
    """Classic-mode: claude -p PROMPT, capture stdout, write task result."""
    task_id = task_row["id"]
    model = resolve_model(task_row, _load_skill(task_row, sessions), settings)
    timeout_s = task_row.get("timeout_s") or DEFAULT_TIMEOUT_S

    log_dir = repo_root() / ".tmp" / "mission-control-queue" / "dispatcher-logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / f"task-{task_id}-{int(datetime.now().timestamp())}.log"

    env = os.environ.copy()
    env.pop("ANTHROPIC_API_KEY", None)  # Pitfall 8

    cmd = [
        settings.claude_bin,
        "-p", task_row["description"] or task_row["title"],
        "--bare",                          # skip auto-discovery for hermeticity
        "--output-format", "json",
        "--model", model,
    ]

    pid_file = pid_dir() / f"{task_id}.pid"
    pid_file.parent.mkdir(parents=True, exist_ok=True)

    log_fp = open(log_path, "ab", buffering=0)
    try:
        proc = subprocess.Popen(
            cmd,
            cwd=str(repo_root()),
            stdout=subprocess.PIPE,
            stderr=log_fp,
            stdin=subprocess.DEVNULL,
            env=env,
            close_fds=True,
        )
        pid_file.write_text(str(proc.pid))   # Pitfall 10: immediately
        try:
            stdout_bytes, _ = proc.communicate(timeout=timeout_s)
        except subprocess.TimeoutExpired:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
            _mark_failed(task_id, "timeout", log_path, sessions)
            return

        log_fp.write(stdout_bytes)
        if proc.returncode != 0:
            _mark_failed(task_id, f"nonzero exit {proc.returncode}", log_path, sessions)
        else:
            _mark_done(task_id, log_path, sessions)
    finally:
        log_fp.close()
        try:
            pid_file.unlink()
        except FileNotFoundError:
            pass
```

### Example 3: Atomic claim test sketch

```python
# Source: pytest-asyncio + the Phase 4 conftest factories.
# Verifies Pattern 1.
import asyncio

import pytest

from cmc.dispatcher.claim import claim_pending_tasks


@pytest.mark.asyncio
async def test_two_concurrent_claims_partition_pending(seeded_app, sessions):
    # Seed 5 pending tasks.
    async with sessions() as db:
        for i in range(5):
            db.add(make_task_row(status="pending", priority=3, title=f"t{i}"))
        await db.commit()

    # Two concurrent claims with slots=3 each — should partition the 5 rows
    # without overlap. (Even though they ASK for 6 total, BEGIN IMMEDIATE
    # serializes — second sees only what's left.)
    async def one_claim():
        async with sessions() as db:
            return await claim_pending_tasks(db, slots=3)

    a, b = await asyncio.gather(one_claim(), one_claim())
    a_ids = {r["id"] for r in a}
    b_ids = {r["id"] for r in b}
    assert not (a_ids & b_ids), "double-claim detected"
    assert (a_ids | b_ids) == set([1, 2, 3, 4, 5]) or len(a_ids | b_ids) == 5
```

### Example 4: Marker parser test cases

```python
def test_marker_parser_skips_fenced_code():
    p = MarkerParser()
    chunks = [
        "Some prose\n",
        "```python\n",
        "DECISION: should I deploy?\n",   # inside fence -> ignored
        "```\n",
        "DECISION: should I deploy?\n",   # outside fence -> emitted
        "INBOX: heads up\n",
    ]
    out = []
    for c in chunks:
        out.extend(p.feed_text(c))
    out.extend(p.flush())
    assert [m.kind for m in out] == ["DECISION", "INBOX"]
    assert out[0].body == "should I deploy?"
    assert out[1].body == "heads up"


def test_marker_parser_inline_backtick_no_match():
    p = MarkerParser()
    out = list(p.feed_text("Like `DECISION: foo` but not really\n"))
    assert out == []  # backtick before DECISION -> not a line-start marker
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Cron daemon spawning python scripts | launchd LaunchAgent with StartInterval | macOS 10.4+ (2005) — but the PYTHON ecosystem still defaults to crontab | Phase 8 follows PROJECT.md decision: launchd is the macOS-native supervision model. |
| `os.fork()` daemonization | `subprocess.Popen` parent-managed children | Python 3.2+ — but Phase 4 already locked this | Phase 8 inherits the pattern verbatim. |
| Polling DB for "any change" | NOTIFY/LISTEN (Postgres) | Postgres 9.x — N/A for SQLite | Phase 8 keeps polling; SQLite has no notify. 2s poll is fine. |
| Hand-grepping CLI text output | Structured `--output-format stream-json` NDJSON | claude CLI ~v1.0+ (2025) | Phase 8 uses stream-json verbatim, not raw text. |
| Custom NDJSON parser | `json.loads` per line + match-statement on `type` | Python 3.10+ match | Phase 8 uses the SDK's `parse_message` shape but reimplements (no SDK dep). |
| `psutil.pid_exists(pid)` for kill | Two-step `psutil.Process(pid).is_running()` then `os.kill(pid, SIGTERM)` | psutil 5.x | Phase 4's `cmc.core.process` already uses ps + os.kill; Phase 8 reuses for sweep, uses `pid_exists()` for the cheaper "is the file stale?" check. |

**Deprecated/outdated:**
- `datetime.utcnow()` (Python 3.12+ deprecated) — use `datetime.now(timezone.utc)`. (Already enforced project-wide.)
- launchd `launchctl load -w` — use `bootstrap`/`bootout`. [CITED: launchd.info]
- launchd `KeepAlive: true` for periodic jobs — use `StartInterval`. KeepAlive restarts on exit, which would create an infinite loop for our one-shot model.
- `subprocess.Popen(..., universal_newlines=True)` — use `text=True`.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 9.0+ + pytest-asyncio 0.24+ + httpx 0.28+ + pytest-freezer 0.4+ |
| Config file | `backend/pyproject.toml` `[tool.pytest.ini_options]` (asyncio_mode=auto, testpaths=tests, addopts=-q) |
| Quick run command | `cd backend && uv run pytest tests/test_phase8_dispatcher.py -x` |
| Full suite command | `cd backend && uv run pytest -x` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| DISP-01 | Heartbeat one-cycle: claim + materialize + tick | integration | `pytest tests/test_phase8_dispatcher.py::test_disp01_one_cycle -x` | ❌ Wave 0 |
| DISP-02 | Emergency stop early-return | unit | `pytest tests/test_phase8_dispatcher.py::test_disp02_emergency_stop -x` | ❌ Wave 0 |
| DISP-03 | Stale PID sweep | unit | `pytest tests/test_phase8_dispatcher.py::test_disp03_sweep_stale -x` | ❌ Wave 0 |
| DISP-04 | MAX_CONCURRENT cap + autonomy gate | unit | `pytest tests/test_phase8_dispatcher.py::test_disp04_concurrency_and_autonomy -x` | ❌ Wave 0 |
| DISP-05 | Classic mode subprocess + timeout | integration (fake-claude shim) | `pytest tests/test_phase8_dispatcher.py::test_disp05_classic -x` | ❌ Wave 0 |
| DISP-06 | Stream mode subprocess + JSON line parsing | integration (fake-claude shim emitting NDJSON) | `pytest tests/test_phase8_dispatcher.py::test_disp06_stream -x` | ❌ Wave 0 |
| DISP-07 | DECISION marker + fence skip + answer poll | unit + integration | `pytest tests/test_phase8_dispatcher.py::test_disp07_decision_markers -x` | ❌ Wave 0 |
| DISP-08 | INBOX marker → POST /api/inbox | integration | `pytest tests/test_phase8_dispatcher.py::test_disp08_inbox_post -x` | ❌ Wave 0 |
| DISP-09 | Follow-up file → stdin injection | integration (fake-claude reading stdin) | `pytest tests/test_phase8_dispatcher.py::test_disp09_followup -x` | ❌ Wave 0 |
| DISP-10 | Model resolution chain | unit | `pytest tests/test_phase8_dispatcher.py::test_disp10_model_resolution -x` | ❌ Wave 0 |
| DISP-11 | Skill router (mocked Anthropic) | unit | `pytest tests/test_phase8_dispatcher.py::test_disp11_skill_router_mocked -x` | ❌ Wave 0 |
| DISP-12 | Plist template render | unit (string template) | `pytest tests/test_phase8_dispatcher.py::test_disp12_plist_render -x` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd backend && uv run pytest tests/test_phase8_dispatcher.py -x`
- **Per wave merge:** `cd backend && uv run pytest -x` (all phases must stay green)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `backend/tests/test_phase8_dispatcher.py` — covers DISP-01..12 (single file per phase convention)
- [ ] `backend/tests/conftest.py` — extend with: `tmp_pid_dir` (already exists from Phase 4 ESTOP), `fake_claude_classic` fixture (a script that writes JSON to stdout and exits 0), `fake_claude_stream` fixture (a script that emits NDJSON events and reads NDJSON from stdin), `mock_anthropic_skill_router` fixture (monkeypatches AsyncAnthropic for DISP-11)
- [ ] `backend/cmc/dispatcher/templates/com.cmc.dispatcher.plist.j2` — template + a render helper (`importlib.resources` + `string.Template.safe_substitute`)
- [ ] Settings extensions: `claude_bin: Path = Path("/opt/homebrew/bin/claude")`, `claude_default_model: str = "sonnet"`, `dispatcher_max_concurrent: int = 3`, `dispatcher_decision_timeout_s: int = 3600`, `dispatcher_classic_timeout_s: int = 600` — all with env-var overrides

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | localhost-only, single-user; no auth layer in scope |
| V3 Session Management | no | no sessions |
| V4 Access Control | yes | Dispatcher writes to DB and queue files; only PIDs it spawned have their lifecycle managed by it. ESTOP only kills validated `claude -p` PIDs. |
| V5 Input Validation | yes | Marker parser validates fence state + line-start anchor; skill router validates Haiku output is a known skill name; cron in materialize trusted (validated upstream by Phase 4 SCHD-02). |
| V6 Cryptography | no | No crypto. |
| V7 Error Handling | yes | Dispatcher uses structlog; failures log without leaking secrets; tick stamp ensures visibility on partial-cycle failures. |
| V11 Config Security | yes | Plist template's PATH includes `/usr/bin:/bin` only — minimal env exposure to subprocesses. ANTHROPIC_API_KEY scrubbed from `claude` subprocess env (Pitfall 8). |
| V12 File / Resource | yes | PID files anchored under `repo_root() / .tmp/.../pids/`; queue paths sanitized via `cmc.core.queue.queue_path`; log file names use task id (int) — no path traversal vector. |
| V13 Code-Reuse | yes | subprocess.Popen NEVER receives `shell=True`; argv list always; binary path from settings, not from user input. |
| V14 Configuration | yes | `Settings.claude_bin` and `dispatcher_max_concurrent` configurable via env; defaults safe. |

### Known Threat Patterns for Dispatcher / Subprocess Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Command injection via task.title/description | Tampering / Elevation | Pass via argv list (`["claude", "-p", task.title]`), never string-concat into a shell. claude itself receives the prompt as a single argv string — no shell parsing on our side. |
| Marker injection from prompt content reflected by claude | Spoofing | Marker parser only reads `assistant`-typed events. The user's prompt round-tripping back as `user` events is excluded by event-type filter. (Even if echoed as assistant, the convention is for the model to GENERATE markers, not regurgitate them — pragmatic risk; flagged for plan review.) |
| ANTHROPIC_API_KEY leak via subprocess inheritance | Information Disclosure | Strip from `env=` dict on Popen (Pitfall 8). |
| Stale PID file holds reference to reused PID | Tampering | psutil.pid_exists for sweep; `cmc.core.process.validate_pid_is_claude` for kill — already two-step in Phase 4. |
| Path traversal via task_id or schedule_id | Tampering | All IDs are typed `int` (Pydantic + SQLAlchemy); queue path helper casts to int before path concat. |
| Subprocess inherits launchd file descriptors | Tampering | `close_fds=True` on Popen (already in Phase 4 spawn.py); don't pass our log fp to child stdout (we redirect explicitly). |
| Race in emergency-stop while dispatcher is mid-spawn | Repudiation | Phase 4 already orders flag-flip BEFORE SIGTERM. Dispatcher cycle re-reads flag; if set mid-cycle, in-flight subprocesses are SIGTERMed at next ESTOP call. |
| launchd plist tampered post-install | Tampering | Plist lives in `~/Library/LaunchAgents/` — user-writable. Threat model accepts this (single-user, localhost). Document in Phase 9 install.sh. |
| Anthropic prompt injection in skill router | Tampering | Strict system prompt + JSON-validated output + skill-name allow-list (last block of Pattern 7). Worst case: model picks the wrong skill — usability bug, not security. |

## Sources

### Primary (HIGH confidence)

- `backend/cmc/dispatcher/oneshot.py` — Phase 4 stub to be replaced (verified)
- `backend/cmc/tasks/spawn.py` — Phase 4 detached subprocess pattern (verified, NOT used verbatim — dispatcher does NOT detach its children)
- `backend/cmc/core/process.py` — PID validation via ps; reused for sweep + ESTOP-02 path
- `backend/cmc/core/queue.py` — queue_path helper; reused for follow-up file reading
- `backend/cmc/tasks/transitions.py` — transition matrix already permits Phase 8's needs
- `backend/cmc/schedules/cron.py` — `next_run` for materializer
- `backend/cmc/schedules/nlcron.py` — Haiku call shape pattern, mirrored for skill router
- `backend/cmc/db/models/{tasks,decisions,inbox,schedules,system_state,skills}.py` — schema verified, no migration needed
- `backend/cmc/api/routes/system.py` — emergency_stop / dispatcher_last_tick_at integration points (Phase 3 + 4)
- `backend/cmc/app/lifespan.py` — engine factory pattern the dispatcher reuses
- `backend/cmc/config/settings.py` — `dispatcher_oneshot_cmd` already exists; Phase 8 adds `claude_bin` + sibling fields
- `backend/.venv/pyvenv.cfg` — confirms Python 3.13.1 venv interpreter path
- `backend/pyproject.toml` — confirms all deps already installed (psutil 7.2.2, croniter 6.2.2, anthropic 0.97.0)
- `.planning/REQUIREMENTS.md` L178-189 — DISP-01..12 verbatim
- `.planning/PROJECT.md` — launchd, single-user, localhost, no-auth constraints
- `.planning/research/PITFALLS.md` §6 — fenced-code marker false-positive (canonical statement)
- `.planning/research/ARCHITECTURE.md` §Pattern 4 + §Pattern 6 + §Anti-Pattern 3 — dispatcher-as-separate-process; HITL marker protocol
- `.planning/STATE.md` — accumulated decisions through Phase 7

### Primary (verified live, 2026-04-27)

- `pypi.org/pypi/psutil/json` → 7.2.2 (matches installed)
- `pypi.org/pypi/croniter/json` → 6.2.2 (matches installed)
- `pypi.org/pypi/anthropic/json` → 0.97.0 (matches installed)
- `code.claude.com/docs/en/headless` (WebFetch 2026-04-27) — `--output-format stream-json` documented; `--bare` recommended for scripts; `--include-partial-messages` enables stream_event deltas
- `code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode` (WebFetch 2026-04-27 via redirect from platform.claude.com) — symmetric `{type:"user", message:{role:"user", content:"..."}}` for stdin
- `https://raw.githubusercontent.com/anthropics/claude-agent-sdk-python/main/src/claude_agent_sdk/types.py` (Bash curl 2026-04-27) — TextBlock / ThinkingBlock / ToolUseBlock / ToolResultBlock / AssistantMessage / UserMessage / SystemMessage shapes
- `https://raw.githubusercontent.com/anthropics/claude-agent-sdk-python/main/src/claude_agent_sdk/_internal/message_parser.py` (Bash curl 2026-04-27) — `parse_message(data)` switches on `data["type"]` ∈ {user, assistant, system, result, stream_event}; canonical wire-shape verification
- `launchd.info` (WebFetch 2026-04-27) — Label, ProgramArguments, StartInterval, RunAtLoad, StandardOutPath fields; "if asleep, fires once on wake"; modern bootstrap/bootout API
- `sqlite.org/lang_returning.html` (WebFetch 2026-04-27) — UPDATE…RETURNING since SQLite 3.35; memory buffering; no order guarantee; subquery-of-modified-table caveat
- macOS Darwin 25.3.0 / sqlite3 3.51.0 / claude 2.1.112 / uv 0.6.3 / Python 3.13.1 [VERIFIED via local probes 2026-04-27]

### Secondary (MEDIUM confidence)

- `backgroundclaude.com/blog/stream-json` (WebFetch 2026-04-27) — confirms stream_event for tokens; only documents api_retry shape in detail
- `github.com/anthropics/claude-code/issues/24594` (WebFetch 2026-04-27) — `--input-format stream-json` officially under-documented; mentions third-party reverse-engineering of NDJSON shape — informs §11 contingency plan
- `psutil.readthedocs.io/en/latest/` (WebSearch 2026-04-27) — `is_running()` preferred over `pid_exists()` for kill paths to handle PID reuse

### Tertiary (LOW confidence)

- DECISION:/INBOX: marker grammar (this research §6.5/§6.7) is project-internal — there is no upstream specification. The grammar is **locked by this research**: `^\s*(DECISION|INBOX):\s+(.*\S)\s*$` on assistant text outside fenced code blocks. Downstream phases (telegram, install) treat this as binding.
- One-cycle vs multi-cycle dispatcher overlap behavior — based on launchd.info docs and personal-experience reasoning; not explicitly tested in this codebase. Plan should include an integration test that simulates overlapping cycles via two `asyncio.gather`'d `run_one_cycle()` calls (Example 3 above).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Atomic claim via `BEGIN IMMEDIATE` + `UPDATE … WHERE id IN (SELECT … LIMIT N) RETURNING *` is correct under SQLite WAL with ≤3 concurrent dispatcher invocations | Pattern 1 / Pitfall 1 | MEDIUM. Tested by Example 3 sketch; if SQLite's busy-timeout doesn't behave under genuine OS-level concurrent process contention (only verified for in-process asyncio contention), a row could double-claim. Plan should add a multi-process integration test using `subprocess.Popen` to spawn two dispatchers and verify partition. |
| A2 | `--input-format stream-json` accepts the symmetric NDJSON shape `{"type":"user", "message":{"role":"user","content":"..."}}` per line on stdin | Pattern 4 / §6.6 / DISP-09 | MEDIUM. The SDK exposes this exact shape; CLI flag is officially under-documented (#24594). If the CLI rejects the shape, fallback options: (a) introduce dep on `claude-agent-sdk` for input handling only; (b) probe with a small spike during Wave 2; (c) make the dispatcher write each follow-up as a separate `claude -p --resume <session_id>` invocation (loses interactivity). |
| A3 | Markers must appear at line-start (`^\s*`) on assistant text only; fenced code blocks toggle a state flag | Pattern 5 / Pitfall 4 | MEDIUM. PITFALLS.md §6 lays out exactly this approach as the recommendation; this research locks the grammar. If dispatcher consumers (telegram, future skills) need richer marker syntax (multi-line bodies, inline JSON payloads), the grammar will need v2 extension. v1 is intentionally narrow. |
| A4 | Dispatcher does NOT use `start_new_session=True` for its `claude` children — it WANTS to be the parent for wait/poll | Pattern 6 / §6 orchestrator | LOW. The launchd-supervised dispatcher is the natural parent; if launchd kills the dispatcher mid-cycle (rare — would require `launchctl bootout` or a system reboot), the children become orphans that ESTOP scans pid files to clean up. Acceptable. |
| A5 | DISP-08's "POST to /api/inbox" should use httpx, NOT direct DB write | §Standard Stack alternatives / Open Q1 | LOW. The wording is verbatim "posts to /api/inbox". Direct DB write saves a localhost RTT but skips any future inbox-creation side effects (e.g. telegram fan-out). Recommend: keep the HTTP call. |
| A6 | DISP-11 skill router gracefully degrades to "no skill" when ANTHROPIC_API_KEY is unset | Pattern 7 / Pitfall — none yet | LOW. Mirrors Phase 4 SCHD-06 503-graceful pattern. Only side effect: tasks created without skill don't get auto-picked one. Acceptable. |
| A7 | The launchd plist's `WorkingDirectory` should be `${repo_root}` so `cmc.core.paths.repo_root()` resolves correctly | §Pattern 3 / DISP-12 | LOW. `repo_root()` walks upward looking for sentinels (.git, pyproject.toml); WorkingDirectory anchors the walk's start. If anchored elsewhere (e.g. user homedir), `repo_root()` would still find the marker but only if the marker is a parent — risky. WorkingDirectory inside the repo is the safe choice. |
| A8 | Tasks have `execution_mode ∈ {classic, stream, interactive}` — interactive maps to which runner? | §Architecture Map / Pitfall 12 sibling | MEDIUM. Phase 1 schema [VERIFIED: backend/cmc/db/models/tasks.py L34] declares `execution_mode: str = Field(default="interactive")`. REQUIREMENTS.md DISP-05/06 only define classic + stream. **Recommendation:** Phase 8 plan treats `interactive` as the default-when-unset, mapping it to `classic` (one-shot non-streaming) per the user-facing UI default. Document in plan; flag to user. |
| A9 | Materializer's `Task(**s.task_template, ...)` is safe — task_template only contains valid Task field names | Pattern 2 / Pitfall 7 | MEDIUM. SCHD-02 doesn't strictly validate task_template against TaskCreate — Pydantic schema is loose dict[str, Any]. Plan must wrap in try/except and log+continue on TypeError. Optionally tighten SCHD-02 retroactively (out of scope for Phase 8). |
| A10 | `claude --bare` is the right flag for scripted hermeticity | Pattern 4 / Example 2 | LOW. [CITED: code.claude.com/docs/en/headless — "Bare mode is useful for CI and scripts where you need the same result on every machine"]. v1 dispatcher is a CI-like context — use bare. Operator who wants project CLAUDE.md context can ship that via task description. |

## Open Questions

1. **DISP-08 — direct DB INSERT vs httpx POST to /api/inbox**
   - What we know: REQUIREMENTS.md DISP-08 says "posts to /api/inbox" verbatim. Direct DB write is faster and avoids the dep promotion of httpx → runtime.
   - What's unclear: Whether "posts to" is binding wording or a description-of-effect.
   - Recommendation: use httpx. Future-proof against side effects (telegram fan-out, audit logging) baked into the route handler.

2. **DISP-09 — `--input-format stream-json` stdin shape**
   - What we know: Symmetric NDJSON per the SDK overview. Officially under-documented at the CLI level (#24594).
   - What's unclear: Whether claude CLI 2.1.112 accepts the shape verbatim, or requires SDK wrappers.
   - Recommendation: Plan Wave 2 spike — write a 30-line test that pipes one user message into `claude --output-format stream-json --input-format stream-json --verbose -p ""` and verifies the response. If accepted, lock the shape; if rejected, fallback option in §A2.

3. **DISP-04 — interaction between MAX_CONCURRENT and skill autonomy gate**
   - What we know: 3 max concurrent. Autonomy gate routes review/manual to `awaiting_approval` (not running).
   - What's unclear: Does autonomy-gated routing count against MAX_CONCURRENT? (No subprocess is spawned, so no PID file is written, so no slot is consumed.)
   - Recommendation: autonomy gate runs INSIDE the per-task thread, BUT the gate completes synchronously without consuming a "PID slot". Document: a cycle can claim 3 tasks, autonomy-gate-flip 2 to awaiting_approval, leave 1 actually running. This is correct and doesn't violate the cap. Cycle ends with 1 PID file.

4. **DISP-10 — what's the actual CLI default model?**
   - What we know: `claude --model <alias>` exists; `--help` (manual probe deferred) lists supported aliases.
   - What's unclear: If we omit `--model`, what does claude pick? (Probably Sonnet, but verify in plan.)
   - Recommendation: always pass `--model <resolved>` so the dispatcher's resolution is canonical, never relying on CLI default. Add a defensive default of "sonnet" at the bottom of the chain.

5. **What if `cmc.dispatcher.oneshot` import fails (ImportError) from launchd?**
   - What we know: launchd will fire again next cycle; nothing user-visible.
   - What's unclear: Operator visibility of broken installs.
   - Recommendation: Phase 9 doctor.py checks `python -m cmc.dispatcher.oneshot --check` (a no-op flag that imports modules and exits 0) — out of scope for Phase 8 itself.

6. **Should the dispatcher use `asyncio.run(run_one_cycle())` or sync code throughout?**
   - What we know: SQLAlchemy async + AsyncAnthropic both require an event loop. `subprocess.Popen` is sync (we run it in `asyncio.to_thread()` or in a `threading.Thread`).
   - What's unclear: One global event loop for the whole cycle, vs sync code that creates `asyncio.run` only when async APIs are needed.
   - Recommendation: `asyncio.run(run_one_cycle())` once at the top of `oneshot.py`. The orchestrator is async; per-task threads spawn from inside the async function via `asyncio.to_thread()` for the synchronous subprocess ops. Cleaner than mixing.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python | All | ✓ (in `backend/.venv/bin/python`) | 3.13.1 | — |
| sqlite3 (engine) | Atomic claim, all DB ops | ✓ | 3.51.0 | — |
| `claude` CLI | DISP-05, DISP-06 | ✓ (`/opt/homebrew/bin/claude`) | 2.1.112 | None — operator must install. doctor.py will surface absence (Phase 9). |
| launchd | DISP-12 (heartbeat) | ✓ (macOS native) | Darwin 25.3.0 | None — macOS-only by PROJECT.md constraint. Linux fallback (systemd) is v2 PLAT-01. |
| psutil 7.2.2 | DISP-03 sweep | ✓ | 7.2.2 | — |
| croniter 6.2.2 | DISP-01 materialize | ✓ | 6.2.2 | — |
| anthropic 0.97.0 | DISP-11 skill router | ✓ | 0.97.0 | — (for the dep). At RUNTIME, `ANTHROPIC_API_KEY` may be unset → graceful "no skill" degradation. |
| httpx (currently dev-only) | DISP-08 POST /api/inbox | ✗ at runtime | (dev: ≥0.28) | Promote to runtime dep. Alternative fallback: direct DB INSERT (§Open Q1). |
| `~/Library/LaunchAgents/` writability | DISP-12 install | ✓ (default user-writable) | — | If sandboxed environment, install.sh emits a manual install message. |
| `${repo_root}/.tmp/mission-control-queue/dispatcher-logs/` | StandardOutPath/StandardErrorPath | ✗ (created by install.sh / first-cycle mkdir) | — | Plan creates this dir in install.sh; dispatcher mkdir's it on first run defensively. |

**Missing dependencies with no fallback:** None. (claude CLI is required; doctor.py surfaces absence — out of scope for this phase.)

**Missing dependencies with fallback:**
- httpx at runtime → promote dev → runtime, or fall back to direct DB write (Open Q1). Recommendation: promote.

## Sources

### Primary (HIGH confidence)
- `anthropics/claude-agent-sdk-python` source (`types.py`, `_internal/message_parser.py`) — fetched 2026-04-27 via `curl raw.githubusercontent.com`
- `code.claude.com/docs/en/headless` — `--output-format`, `--bare`, `--include-partial-messages` flags documented
- `code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode` — symmetric stream-json shape for stdin
- `launchd.info` — Label, ProgramArguments, StartInterval, bootstrap/bootout
- `sqlite.org/lang_returning.html` — UPDATE…RETURNING semantics, memory buffering, no order guarantee
- Local backend codebase: all `cmc/dispatcher/*` (Phase 4 stub), `cmc/tasks/*`, `cmc/schedules/*`, `cmc/core/{queue,process,paths}.py`, `cmc/db/models/*`, `cmc/app/lifespan.py`, `cmc/config/settings.py`
- `.planning/{REQUIREMENTS,PROJECT,STATE,ROADMAP}.md`
- `.planning/research/{PITFALLS,ARCHITECTURE,FEATURES}.md`
- `.planning/phases/04-stateful-apis/04-RESEARCH.md` — Phase 4 patterns directly inherited

### Secondary (MEDIUM confidence)
- `backgroundclaude.com/blog/stream-json` — additional event-shape commentary
- `github.com/anthropics/claude-code/issues/24594` — input-format stream-json under-documentation status
- `psutil.readthedocs.io/en/latest/` — pid_exists vs is_running tradeoffs

### Tertiary (LOW confidence)
- DECISION:/INBOX: marker grammar — project-internal, locked by this research

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every dep already pinned and installed; only httpx promotion needed
- Architecture: HIGH — most patterns inherited from Phase 4 with verified provenance
- Pitfalls: HIGH on classes 1, 4–11 (codebase + Phase 4 history); MEDIUM on classes 2, 3, 12 (overlap-cycle + interactive-mode-mapping require Wave 0 spike)
- DISP-09 stdin shape: MEDIUM — symmetric per docs but CLI flag under-documented (#24594); plan must include a Wave-2 spike or fallback path

**Research date:** 2026-04-27
**Valid until:** 2026-05-27 (anthropic SDK + claude CLI move fast — re-verify shapes before Phase 9 ships)
