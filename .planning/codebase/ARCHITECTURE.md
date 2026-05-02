<!-- refreshed: 2026-05-02 -->
# Architecture

**Analysis Date:** 2026-05-02

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                          React SPA (TanStack Router + Query)                 │
│   `frontend/src/routes/`  ──  `frontend/src/components/panels/`             │
│   `frontend/src/lib/api.ts` (typed fetchers)                                 │
│   `frontend/src/lib/queries.ts` (cadenced hooks + mutations)                │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │  HTTP/SSE  (same-origin: SPA served by backend)
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                      FastAPI Server  (single process)                        │
│   Entry: `backend/cmc/app/factory.py::create_app()`                         │
│   ┌──────────────────┬────────────────────┬───────────────────────────────┐  │
│   │  API layer       │  Ingestion layer   │  Dispatcher layer             │  │
│   │ `cmc/api/routes` │ `cmc/ingest/`      │ `cmc/dispatcher/`             │  │
│   │  13 routers,     │  periodic JSONL    │  heartbeat → claim → runner   │  │
│   │  /api prefix     │  sync loop         │  threads (claude subprocess)  │  │
│   └────────┬─────────┴──────────┬─────────┴───────────────┬───────────────┘  │
│            │                   │                          │                  │
│            ▼                   ▼                          ▼                  │
│   ┌────────────────────────────────────────────────────────────────────────┐  │
│   │              SQLite (async via aiosqlite / SQLAlchemy 2)               │  │
│   │              `data/cmc.db`                                             │  │
│   └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
         ▲                              ▲
         │ OTel/HTTP                    │ launchd plist
         │ `/v1/logs`, `/v1/metrics`    │ `cmc/dispatcher/oneshot.py`
         │                             │
  Claude Code hooks             Dispatcher one-shot
  (external agents)             (system scheduler)
         │
         ▼
  ~/.claude/projects/**/*.jsonl   ←  ingest source
  .tmp/mission-control-queue/     ←  HITL/follow-up bus
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| `create_app` | Fluent builder: middleware, routes, SPA, observability | `backend/cmc/app/factory.py` |
| `lifespan` | Startup: migrations, sessions, boot sync, periodic task | `backend/cmc/app/lifespan.py` |
| `Settings` | Single pydantic-settings config; all paths repo-root anchored | `backend/cmc/config/settings.py` |
| `repo_root()` | cwd-independent anchor for all path resolution | `backend/cmc/core/paths.py` |
| API routes | 13 domain routers aggregated in `all_routers()` | `backend/cmc/api/routes/__init__.py` |
| HITL routes | Decisions + inbox endpoints | `backend/cmc/api/routes/hitl.py` |
| Tasks router | TASK-01..08 CRUD + dispatcher trigger | `backend/cmc/api/routes/tasks.py` |
| System router | Health, attention, state KV, SSE firehose, ESTOP | `backend/cmc/api/routes/system.py` |
| Sessions router | SESS-01..07 list, live, details, follow-up, summary | `backend/cmc/api/routes/sessions.py` |
| Dispatcher heartbeat | One-cycle orchestrator: sweep → materialize → claim → fan-out | `backend/cmc/dispatcher/heartbeat.py` |
| Dispatcher oneshot | `python -m cmc.dispatcher.oneshot` launchd entry point | `backend/cmc/dispatcher/oneshot.py` |
| `claim_pending_tasks` | Atomic SQLite `BEGIN IMMEDIATE` claim | `backend/cmc/dispatcher/claim.py` |
| `materialize_due_schedules` | Schedules → Task rows on each cycle | `backend/cmc/dispatcher/materialize.py` |
| `run_stream` | Stream-mode subprocess with NDJSON reader + HITL callbacks | `backend/cmc/dispatcher/run_stream.py` |
| `run_classic` | Classic-mode subprocess with timeout | `backend/cmc/dispatcher/run_classic.py` |
| Autonomy gate | Per-skill `auto/review/manual` block/proceed | `backend/cmc/dispatcher/autonomy_gate.py` |
| `sweep_stale_pids` | Prune dead PID files; return live PID set | `backend/cmc/dispatcher/sweep.py` |
| `sync_once` | One full JSONL ingestion cycle | `backend/cmc/ingest/scheduler.py` |
| `queue.py` | File-based queue writer for HITL/follow-up bus | `backend/cmc/core/queue.py` |
| Telegram handler | Long-poll bot loop; routes text to claude, callbacks to API | `backend/cmc/telegram/handler.py` |
| DB models | SQLModel ORM models for all 14 entities | `backend/cmc/db/models/` |
| `api.ts` | Typed fetcher map for all backend endpoints | `frontend/src/lib/api.ts` |
| `queries.ts` | TanStack Query hooks + cadence policy + mutations | `frontend/src/lib/queries.ts` |
| Panel components | Domain-specific widgets consuming query hooks | `frontend/src/components/panels/` |

## Pattern Overview

**Overall:** Layered monolith with detached process fan-out

**Key Characteristics:**
- FastAPI serves both the REST API (`/api/*`) and the built React SPA (`/`) from a single process.
- Dispatcher runs as a separate one-shot process (`python -m cmc.dispatcher.oneshot`) invoked by launchd on a cron schedule or on demand via `POST /api/dispatcher/trigger`. It exits after one cycle.
- All inter-process communication uses SQLite (tasks table, system_state KV) and file-based queues under `.tmp/mission-control-queue/`.
- The ingestion pipeline is a background asyncio task that polls `~/.claude/projects/**/*.jsonl` every 120 seconds — no webhooks from Claude Code.
- Frontend is a fully static SPA (`frontend/dist/`) served by `SPAStaticFiles` as the final catch-all mount.

## Layers

**Configuration Layer:**
- Purpose: Centralize all settings and path resolution
- Location: `backend/cmc/config/`
- Contains: `Settings` (pydantic-settings), `load_settings()`, `repo_root()` anchor
- Depends on: nothing in `cmc`
- Used by: every other layer

**Application Layer:**
- Purpose: Build and configure the FastAPI application
- Location: `backend/cmc/app/`
- Contains: `FastAPIAppBuilder`, `create_app()`, `lifespan` context manager
- Depends on: config, db, auth, middleware, observability, api routes
- Used by: uvicorn entry (`uvicorn cmc.app:create_app --factory`)

**API Layer:**
- Purpose: HTTP request/response contracts; validation via Pydantic schemas
- Location: `backend/cmc/api/routes/` and `backend/cmc/api/schemas/`
- Contains: 13 routers (health, sync, mcp, sessions, observability, system, skills, context, hitl, tasks, schedules, notifications, ingest)
- Depends on: db layer, core utilities, tasks domain logic
- Used by: frontend SPA, Telegram integration, external OTel agents

**Domain Logic Layer:**
- Purpose: Pure business logic decoupled from HTTP
- Location: `backend/cmc/tasks/`, `backend/cmc/schedules/`, `backend/cmc/skills/`, `backend/cmc/mcp/`
- Contains: `transitions.py` (state machine), `spawn.py`, `cron.py`, `scanner.py`, `aggregator.py`
- Depends on: config, db models
- Used by: API routes, dispatcher

**Dispatcher Layer:**
- Purpose: Run claude subprocesses; claim tasks; handle HITL interaction
- Location: `backend/cmc/dispatcher/`
- Contains: `oneshot.py` (entry), `heartbeat.py` (orchestrator), `claim.py`, `materialize.py`, `sweep.py`, `run_classic.py`, `run_stream.py`, `autonomy_gate.py`, `skill_router.py`, `marker_parser.py`, `answer_poll.py`, `follow_ups.py`
- Depends on: db, config, tasks domain, core/queue
- Used by: launchd, `POST /api/dispatcher/trigger`

**Ingestion Layer:**
- Purpose: Parse Claude Code JSONL session files and upsert into DB
- Location: `backend/cmc/ingest/`
- Contains: `scheduler.py` (sync_once, periodic_sync_loop), `jsonl_parser.py`, `otel_parser.py`, `repository.py`
- Depends on: db layer, config
- Used by: `lifespan` (background asyncio task), `POST /api/sync`

**Database Layer:**
- Purpose: ORM models, engine creation, session factory
- Location: `backend/cmc/db/`
- Contains: 14 SQLModel models under `models/`, `engine.py`, `session.py`, `health.py`
- Depends on: SQLModel, aiosqlite, alembic
- Used by: all layers that touch persistence

**Cross-cutting Infrastructure:**
- Purpose: Middleware, auth, observability, readiness
- Location: `backend/cmc/middleware/`, `backend/cmc/auth/`, `backend/cmc/observability/`, `backend/cmc/readiness/`

**Frontend Layer:**
- Purpose: Single-page React dashboard
- Location: `frontend/src/`
- Contains: route files, panel components, shell, UI primitives, `api.ts`, `queries.ts`
- Depends on: backend REST/SSE API (same-origin fetch)

## Data Flow

### Primary Request Path (API)

1. HTTP request → CORSMiddleware → TrustedHostMiddleware → SecurityHeadersMiddleware → RequestLoggingMiddleware → RequestIDMiddleware → RateLimitMiddleware → BodySizeLimitMiddleware → TimeoutMiddleware (`backend/cmc/app/factory.py`)
2. FastAPI router matches `/api/*` → optional `get_current_principal` auth dependency (`backend/cmc/auth/dependencies.py`)
3. Route handler → `Depends(get_session)` injects `AsyncSession` (`backend/cmc/db/session.py`)
4. Handler queries SQLite models, serializes via Pydantic schema, returns response

### Dispatcher Cycle (background process)

1. launchd fires `cmc.dispatcher.oneshot` every N seconds → `run_one_cycle()` (`backend/cmc/dispatcher/heartbeat.py`)
2. Stamp tick in `system_state` (liveness signal to SAPI-04)
3. Check `system_state.emergency_stop` — abort if set
4. `sweep_stale_pids()` → live PID set (`backend/cmc/dispatcher/sweep.py`)
5. `materialize_due_schedules()` → insert Task rows for due schedules (`backend/cmc/dispatcher/materialize.py`)
6. `claim_pending_tasks(engine, slots)` via `BEGIN IMMEDIATE` atomic claim (`backend/cmc/dispatcher/claim.py`)
7. Per claimed task: `pick_skill` → `check_autonomy` → spawn `run_classic` or `run_stream` in thread
8. Classic mode: `subprocess.Popen` with timeout → mark done/failed (`backend/cmc/dispatcher/run_classic.py`)
9. Stream mode: `subprocess.Popen` with NDJSON reader thread; `DECISION` markers → insert Decision row → poll for answer → inject reply to stdin; `INBOX` markers → POST `/api/inbox` (`backend/cmc/dispatcher/run_stream.py`)

### Ingestion Cycle (background asyncio task, same process as API)

1. `lifespan` starts `asyncio.create_task(periodic_sync_loop(..., interval_s=120))` after boot-time `sync_once` (`backend/cmc/app/lifespan.py`)
2. `sync_once` globs `~/.claude/projects/*/*.jsonl` (one level only) (`backend/cmc/ingest/scheduler.py`)
3. Per file: `asyncio.to_thread(parse_session_file, path)` → `upsert_session`, `upsert_tools`, `accumulate_token_usage` (`backend/cmc/ingest/repository.py`)
4. `POST /api/sync` can trigger `sync_once` on demand (`backend/cmc/api/routes/sync.py`)

### HITL Decision Flow

1. Stream runner detects `DECISION:` marker in claude stdout
2. INSERT `decisions` row (dedup via `sha256(task_id:body)`)  → `backend/cmc/dispatcher/run_stream.py:_insert_decision_sync`
3. Frontend `useDecisions` hook polls `GET /api/decisions?status=pending` every 5s
4. User submits answer → `POST /api/decisions/{id}/answer` → writes answer to `system_state` + file queue `.tmp/mission-control-queue/decisions/{id}.jsonl`
5. `wait_for_answer` polls DB every 2s → returns answer to stream runner → writes to subprocess stdin
6. Telegram bot also polls and can answer via callback buttons → same POST endpoint

### SSE Firehose (OTel events)

1. External OTel agent (Claude Code hook) POSTs to `/v1/logs` or `/v1/metrics`
2. Ingest router stores events in `otel_events` table
3. Frontend `useFirehose` opens `EventSource('/api/firehose')` 
4. `tail_otel_events` (`backend/cmc/api/sse.py`) polls DB and emits `event: otel` frames

**State Management:**
- Backend: SQLite is the single source of truth. `system_state` KV table holds operational flags (`emergency_stop`, `telegram_offset`, `dispatcher_last_tick_at`).
- Frontend: TanStack Query caches responses with per-domain cadences defined in `frontend/src/lib/queries.ts`. No global client-side state store.
- File-based queue under `.tmp/mission-control-queue/` is the cross-process bus for HITL decisions, inbox replies, and follow-up messages.

## Key Abstractions

**`FastAPIAppBuilder`:**
- Purpose: Fluent builder encapsulating the full FastAPI setup sequence
- Examples: `backend/cmc/app/factory.py`
- Pattern: Method-chaining builder (`setup_logging().setup_settings()...build()`)

**Task State Machine:**
- Purpose: Enforce legal status transitions for tasks
- Examples: `backend/cmc/tasks/transitions.py`
- Pattern: Pure-function dict lookup; router delegates all transition validation here

**`repo_root()` path anchor:**
- Purpose: cwd-independent path resolution used by all path-shaped fields
- Examples: `backend/cmc/core/paths.py`
- Pattern: `lru_cache` walk-up to find parent containing `backend/` and `frontend/`

**File-based queue (`core/queue.py`):**
- Purpose: Cross-process bus for HITL decisions, inbox replies, follow-up messages
- Examples: `backend/cmc/core/queue.py`
- Pattern: Append-only JSONL files under `.tmp/mission-control-queue/{sub}/{key}.jsonl`

**`MarkerParser`:**
- Purpose: Parse streaming text from claude for `DECISION:` and `INBOX:` markers
- Examples: `backend/cmc/dispatcher/marker_parser.py`
- Pattern: Incremental text buffer; yields `Marker` objects as they complete

**Typed API fetcher map (`api` object):**
- Purpose: Central registry of all backend endpoints with TypeScript types
- Examples: `frontend/src/lib/api.ts`
- Pattern: `const api = { ... } as const`; callers never construct raw fetch calls

**Query key factory (`qk` object):**
- Purpose: Single source of truth for TanStack Query cache keys
- Examples: `frontend/src/lib/queries.ts`
- Pattern: `export const qk = { ... } as const`; used in both hooks and invalidation calls

## Entry Points

**FastAPI Server:**
- Location: `backend/cmc/app/factory.py::create_app`
- Triggers: `uvicorn --app-dir backend cmc.app:create_app --factory` or `make dev-backend`
- Responsibilities: Build app, run migrations, start ingestion loop, serve API + SPA

**Dispatcher One-shot:**
- Location: `backend/cmc/dispatcher/oneshot.py`
- Triggers: launchd `StartInterval` plist, or `POST /api/dispatcher/trigger`, or `cmc start`
- Responsibilities: Run one heartbeat cycle (materialize → claim → run tasks)

**Frontend Dev Server:**
- Location: `frontend/src/main.tsx`
- Triggers: `vite dev` / `make dev-frontend`
- Responsibilities: React root render; applies persisted theme before first paint

**CLI:**
- Location: `scripts/cmc`
- Triggers: `cmc start`, `cmc stop`, `cmc doctor`, `cmc setup telegram`
- Responsibilities: Install launchd plists, check system health, configure integrations

## Architectural Constraints

- **Threading:** FastAPI process is async (asyncio). Dispatcher runner threads use `asyncio.run_coroutine_threadsafe` with a dedicated per-task event loop for DB/httpx calls from the reader thread.
- **Global state:** `repo_root()` is cached via `lru_cache(maxsize=1)` — tests that change the working directory must be careful. `load_settings()` re-instantiates on each call; callers cache it themselves if needed.
- **Circular imports:** No known circular chains. Dispatcher modules import from `cmc.db`, `cmc.config`, `cmc.core` only — never from `cmc.api`.
- **SQLite WAL:** All dispatcher claim operations use `BEGIN IMMEDIATE` to prevent double-claiming. FastAPI sessions use `DEFERRED` (default). Do not mix these transaction types on the same connection object.
- **SPA mount order:** The SPA `SPAStaticFiles` mount MUST be last in `setup_routes` / `setup_static` or it will shadow API routes.
- **Path anchoring:** All `Settings` path fields (`db_path`, `static_dir`, `alembic_ini_path`) are resolved against `repo_root()`, not `cwd`. `jsonl_root` and `claude_bin` are intentionally excluded and resolved via `Path.expanduser()` / absolute path respectively.

## Anti-Patterns

### Mixing session transaction modes in the dispatcher

**What happens:** Opening an `AsyncSession` (auto-DEFERRED) and then issuing `BEGIN IMMEDIATE` on it.
**Why it's wrong:** SQLAlchemy 2 auto-BEGIN fires before the explicit IMMEDIATE, causing a conflict or making IMMEDIATE a no-op.
**Do this instead:** Use `engine.connect()` and issue `BEGIN IMMEDIATE` manually before any execute, as shown in `backend/cmc/dispatcher/claim.py`.

### Inlining `refetchInterval` in panel components

**What happens:** A panel component passes `refetchInterval` directly to `useQuery`.
**Why it's wrong:** Cadence policy is scattered; changing polling frequency requires hunting across all panels.
**Do this instead:** Define all cadences in `frontend/src/lib/queries.ts` hooks; panels import and call the hook with no polling config.

### Reading `.env` or `os.environ` directly for secrets

**What happens:** Code calls `os.environ.get("ANTHROPIC_API_KEY")` rather than reading from `Settings`.
**Why it's wrong:** launchd daemons do not inherit shell environment; keys will silently be `None`.
**Do this instead:** Access `settings.anthropic_api_key` which is loaded from the correct env file for the runtime mode.

### Using `**/*.jsonl` glob in ingestion

**What happens:** `root.glob("**/*.jsonl")` would include sub-agent JSONL files nested one level deeper.
**Why it's wrong:** Sub-agent sessions are incomplete and would inflate token counts and session metrics.
**Do this instead:** Always use `root.glob("*/*.jsonl")` (one level only), as enforced in `backend/cmc/ingest/scheduler.py`.

## Error Handling

**Strategy:** Each layer owns its error boundary and never lets transient errors propagate to crash the process.

**Patterns:**
- Dispatcher cycle: `try/finally` around the entire body ensures `stamp_tick` always runs, even on exception.
- Ingestion: per-file `except Exception` logs and increments `errors` counter; loop continues.
- Dispatcher materialization: per-schedule `SAVEPOINT`; bad `task_template` caught + logged; `next_run_at` left untouched so operator can see the lag.
- Stream runner: non-fatal errors in INBOX post are logged and swallowed; only `DECISION` timeout aborts the task.
- FastAPI: global exception handlers registered in `backend/cmc/core/errors.py`; error shape is `{"error": detail}` not FastAPI's default `{"detail": ...}`.
- Frontend: top-level `ErrorBoundary` in `frontend/src/routes/__root.tsx` catches render errors and shows a recovery UI.

## Cross-Cutting Concerns

**Logging:** Structured logging via stdlib `logging`. Format configured by `backend/cmc/core/logging.py`. All log calls use `extra={"key": val}` kwargs for structured fields; never f-string interpolation into the message template. Logger name is the module path (e.g., `cmc.dispatcher.heartbeat`).

**Validation:** Pydantic v2 for all API I/O via FastAPI schemas in `backend/cmc/api/schemas/`. Domain models are SQLModel (extends SQLModel/SQLAlchemy). Frontend types in `frontend/src/lib/api.ts` mirror backend schemas verbatim.

**Authentication:** Optional JWT auth via `backend/cmc/auth/`. Disabled by default (`auth_enabled=False`). When enabled, `get_current_principal` dependency injected on all `/api` routers except the health router.

---

*Architecture analysis: 2026-05-02*
