<!-- refreshed: 2026-05-02 -->
# Architecture

**Analysis Date:** 2026-05-02

## System Overview

```text
┌────────────────────────────────────────────────────────────────────────┐
│                     React SPA (TanStack Router)                        │
│  `/`  CommandPage           `/activity`  ActivityPage                  │
│  `/skills`  SkillsPage                                                  │
│  `frontend/src/routes/`                                                 │
└──────────┬──────────────────────────────────────────────────┬──────────┘
           │  HTTP REST + SSE (EventSource)                   │
           ▼                                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│              FastAPI Application  `backend/cmc/app/factory.py`         │
│   Middleware stack: CORS / TrustedHost / Security / RateLimit /        │
│   RequestID / Logging / BodySize / Timeout                             │
│                                                                        │
│   /api/*  routers (all_routers)         raw routers (raw_routers)      │
│   sessions, tasks, skills, hitl,        /v1/logs, /v1/metrics          │
│   schedules, notifications, system,     (OTLP ingest)                  │
│   observability, sync, mcp, context     `backend/cmc/api/routes/`      │
└────────┬─────────────────────────┬──────────────────────────┬──────────┘
         │                         │                          │
         ▼                         ▼                          ▼
┌─────────────────┐  ┌──────────────────────┐  ┌──────────────────────────┐
│  SQLite DB      │  │  Ingest Scheduler     │  │  Dispatcher (launchd)    │
│  `data/cmc.db`  │  │  (lifespan asyncio   │  │  `cmc.dispatcher.oneshot`│
│  WAL mode       │  │   background task)   │  │  heartbeat.run_one_cycle │
│  aiosqlite /    │  │  Walks JSONL files   │  │  claim → autonomy gate   │
│  SQLAlchemy 2   │  │  every 120s          │  │  → run_classic|run_stream│
│  SQLModel ORM   │  │  `cmc/ingest/`       │  │  `cmc/dispatcher/`       │
└─────────────────┘  └──────────────────────┘  └──────────────────────────┘
         ▲                                                    │
         │                                                    ▼
         │                                    ┌──────────────────────────┐
         │                                    │  Claude CLI subprocess   │
         │                                    │  `claude -p PROMPT`      │
         └────────────────────────────────────│  NDJSON stdout (stream)  │
                                              │  or JSON (classic)       │
                                              └──────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  Telegram Handler (launchd daemon)                     │
│    long-poll getUpdates → relay text to `claude -p`                    │
│    callback_query → POST/PATCH local API (:8765)                       │
│    `backend/cmc/telegram/`                                             │
└────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| `FastAPIAppBuilder` | Fluent builder: assembles middleware, routes, SPA mount | `backend/cmc/app/factory.py` |
| `lifespan` | Startup/shutdown: engine, Alembic migrations, ingest loop, auth warmup | `backend/cmc/app/lifespan.py` |
| `Settings` | Pydantic-settings config; resolves all paths against repo root | `backend/cmc/config/settings.py` |
| API routes | HTTP handlers for every resource (sessions, tasks, skills, HITL, etc.) | `backend/cmc/api/routes/` |
| Pydantic schemas | Request/response models mirroring DB models | `backend/cmc/api/schemas/` |
| SQLModel ORM models | DB table definitions; all indexed | `backend/cmc/db/models/` |
| `create_engine_for_settings` | Async SQLite engine with WAL + pragma listener | `backend/cmc/db/engine.py` |
| `make_sessionmaker` / `get_session` | Session factory and FastAPI dependency | `backend/cmc/db/session.py` |
| `sync_once` / `periodic_sync_loop` | JSONL transcript ingestion (boot-time + 120s cadence) | `backend/cmc/ingest/scheduler.py` |
| `parse_session_file` | Pure JSONL → session/tools/token-usage dict; runs off event loop | `backend/cmc/ingest/jsonl_parser.py` |
| Ingest repository | `upsert_session`, `upsert_tools`, `accumulate_token_usage` | `backend/cmc/ingest/repository.py` |
| `run_one_cycle` | Dispatcher heartbeat: stamp tick → sweep → materialize → claim → fan-out | `backend/cmc/dispatcher/heartbeat.py` |
| `claim_pending_tasks` | Atomic `BEGIN IMMEDIATE` claim; returns dicts | `backend/cmc/dispatcher/claim.py` |
| `check_autonomy` | Autonomy gate: auto→proceed, review/manual→block + awaiting_approval | `backend/cmc/dispatcher/autonomy_gate.py` |
| `run_classic` | Synchronous `claude -p` subprocess; JSON output; marks done/failed | `backend/cmc/dispatcher/run_classic.py` |
| `run_stream` | Bidirectional `claude` subprocess; NDJSON stream; MarkerParser; HITL | `backend/cmc/dispatcher/run_stream.py` |
| `MarkerParser` | Fenced-code-aware DECISION/INBOX marker extractor from stream text | `backend/cmc/dispatcher/marker_parser.py` |
| `pick_skill` | Haiku-4.5 LLM router: assigns skill to unassigned tasks | `backend/cmc/dispatcher/skill_router.py` |
| `stamp_tick` / `write_pid_file` | Dispatcher liveness stamping and PID tracking | `backend/cmc/dispatcher/state.py` |
| `validate_transition` | Pure state machine for task status transitions | `backend/cmc/tasks/transitions.py` |
| `spawn_dispatcher_oneshot` | Detached subprocess for TASK-07 trigger endpoint | `backend/cmc/tasks/spawn.py` |
| `JWTAuthService` | Optional JWT validation (shared-secret, static key, or JWKS) | `backend/cmc/auth/service.py` |
| `MCPAggregator` | Three-source MCP latency aggregator with window-function percentiles | `backend/cmc/mcp/aggregator.py` |
| `tail_otel_events` | SSE generator for SAPI-05 firehose and SESS-05 live stream | `backend/cmc/api/sse.py` |
| `queue_path` / writers | File-based JSONL queue under `.tmp/mission-control-queue/` | `backend/cmc/core/queue.py` |
| `repo_root` | LRU-cached repo root anchor (walks up for `backend/`+`frontend/` siblings) | `backend/cmc/core/paths.py` |
| Telegram handler | Long-poll getUpdates → `claude -p` relay + callback routing | `backend/cmc/telegram/handler.py` |
| Frontend routes | React page components (Command, Activity, Skills) | `frontend/src/routes/` |
| `AppShell` | Layout: NavBar + CommandPalette + `<main>` + TaskComposerProvider | `frontend/src/components/shell/AppShell.tsx` |
| Panel components | Per-panel React components (30+ panels) | `frontend/src/components/panels/` |
| `api.ts` | Typed fetch client; all backend types as TS interfaces | `frontend/src/lib/api.ts` |
| `queries.ts` | TanStack Query hooks; polling cadences encoded here centrally | `frontend/src/lib/queries.ts` |
| `useFirehose` | Native EventSource SSE hook; ring-buffered otel events | `frontend/src/lib/useFirehose.ts` |

## Pattern Overview

**Overall:** Layered monolith — single FastAPI process serves both API and SPA. Separate launchd daemons for the dispatcher heartbeat and Telegram handler communicate via SQLite and a file-based queue.

**Key Characteristics:**
- FastAPI serves SPA static files at `/`; API routes are all under `/api`; OTLP endpoints at root (`/v1/*`)
- Dispatcher is out-of-process: `python -m cmc.dispatcher.oneshot` (launchd every 120s, or on-demand via TASK-07)
- Telegram handler is a separate always-on launchd daemon that communicates with the FastAPI server via `localhost:8765`
- SQLite WAL mode is the single shared datastore; no Redis, no message broker
- File-based queue at `.tmp/mission-control-queue/` passes HITL answers and follow-ups to the dispatcher

## Layers

**Presentation (Frontend):**
- Purpose: React SPA dashboard
- Location: `frontend/src/`
- Contains: Routes, panel components, shell, UI primitives, typed API client, query hooks
- Depends on: Backend REST API + SSE firehose
- Used by: Browser

**HTTP Interface (API):**
- Purpose: FastAPI request/response handling, auth enforcement, schema validation
- Location: `backend/cmc/api/`
- Contains: Route handlers (`routes/`), Pydantic schemas (`schemas/`), SSE generator
- Depends on: DB layer, core utilities, auth, observability
- Used by: Frontend SPA, Telegram handler (local HTTP), external OTLP exporters

**Application / Orchestration:**
- Purpose: App factory, lifespan management, middleware, config
- Location: `backend/cmc/app/`, `backend/cmc/config/`, `backend/cmc/middleware/`
- Contains: `FastAPIAppBuilder`, `lifespan`, `Settings`, all middleware
- Depends on: All other backend layers
- Used by: uvicorn entry point

**Dispatcher (Out-of-process):**
- Purpose: Task orchestration — claim tasks, resolve skills, run Claude subprocesses
- Location: `backend/cmc/dispatcher/`
- Contains: `heartbeat`, `claim`, `autonomy_gate`, `run_classic`, `run_stream`, `marker_parser`, `skill_router`, `state`
- Depends on: DB layer, config, core paths
- Used by: launchd plist (every 120s), TASK-07 spawn

**Ingestion:**
- Purpose: Parse Claude Code JSONL transcripts into DB
- Location: `backend/cmc/ingest/`
- Contains: `scheduler` (orchestration), `jsonl_parser` (pure parse), `repository` (DB upserts), `otel_parser`
- Depends on: DB layer, config
- Used by: `lifespan` (boot + background task), `/api/sync` route

**Data (DB):**
- Purpose: Async SQLite persistence
- Location: `backend/cmc/db/`
- Contains: `engine`, `session`, `base`, `health`, `models/`
- Depends on: `config.Settings`
- Used by: All backend layers

**Domain logic:**
- Purpose: Pure business logic (state machines, spawn helpers, cron, skill scanning)
- Location: `backend/cmc/tasks/`, `backend/cmc/schedules/`, `backend/cmc/skills/`
- Contains: `transitions`, `spawn`, `cron`, `nlcron`, `scanner`
- Depends on: DB models, config
- Used by: Dispatcher, API routes

**Telegram Integration:**
- Purpose: Bidirectional Telegram bot — relays text to Claude, routes callbacks to API
- Location: `backend/cmc/telegram/`
- Contains: `handler`, `api`, `dash_router`, `notifier`, `oneshot_handler`
- Depends on: DB layer, config, core paths
- Used by: launchd always-on daemon

**Cross-cutting:**
- Purpose: Logging, observability (OTLP traces + Prometheus metrics), auth, readiness, CLI tools
- Location: `backend/cmc/core/`, `backend/cmc/observability/`, `backend/cmc/auth/`, `backend/cmc/readiness/`, `backend/cmc/cli/`

## Data Flow

### Primary Request Path (REST API)

1. HTTP request hits uvicorn → middleware stack (`factory.py` middleware order: CORS → TrustedHost → SecurityHeaders → RateLimit → RequestID → RequestLogging → BodySize → Timeout)
2. FastAPI routes request to handler in `backend/cmc/api/routes/`
3. Handler receives `AsyncSession` via `Depends(get_session)` (`backend/cmc/db/session.py`)
4. Handler queries DB via SQLAlchemy, validates via Pydantic schema
5. Response serialized and returned

### Ingest Flow (Background)

1. `lifespan` starts `asyncio.create_task(periodic_sync_loop(...))` (`backend/cmc/app/lifespan.py:115`)
2. Every 120s (sleep-first): `sync_once(sessions, settings)` (`backend/cmc/ingest/scheduler.py:41`)
3. Globs `settings.jsonl_root` for `*/*.jsonl` (one level only — subagents excluded)
4. Per file: `asyncio.to_thread(parse_session_file, path)` → pure parse off event loop (`backend/cmc/ingest/jsonl_parser.py`)
5. `upsert_session`, `upsert_tools`, `accumulate_token_usage` committed in one session per file (`backend/cmc/ingest/repository.py`)

### Dispatcher Heartbeat (Out-of-process)

1. launchd invokes `python -m cmc.dispatcher.oneshot` every 120s (`backend/cmc/dispatcher/oneshot.py`)
2. `run_one_cycle()`: stamp tick → emergency-stop check → sweep stale PIDs → materialize due schedules → claim up to N pending tasks (`BEGIN IMMEDIATE`) (`backend/cmc/dispatcher/heartbeat.py:51`)
3. Per claimed task: resolve skill via Haiku-4.5 if unset (`backend/cmc/dispatcher/skill_router.py`) → check autonomy gate (`backend/cmc/dispatcher/autonomy_gate.py`)
4. Spawn `threading.Thread` → `run_classic` or `run_stream` depending on `execution_mode`
5. `run_stream`: NDJSON stdout → `MarkerParser` → `DECISION` inserts Decision row + waits for answer via file queue; `INBOX` POSTs to `/api/inbox` (`backend/cmc/dispatcher/run_stream.py`)
6. Thread joins; cycle exits

### HITL Decision Flow

1. `run_stream` emits `DECISION: <prompt>` → `MarkerParser` yields marker
2. Dispatcher inserts `Decision` row (status=`pending`) → polls `.tmp/mission-control-queue/decisions/{id}.jsonl`
3. Frontend calls `POST /api/decisions/{id}/answer` → route writes queue file FIRST, then DB UPDATE (`backend/cmc/api/routes/hitl.py`)
4. Dispatcher's `wait_for_answer` poll detects file write → continues subprocess

### SSE Firehose (Real-time)

1. Frontend calls `GET /api/firehose` → `EventSourceResponse` (`backend/cmc/api/routes/system.py`)
2. `tail_otel_events` generator polls `otel_events` table (1s interval, 60min cap) (`backend/cmc/api/sse.py`)
3. `useFirehose` hook in frontend ring-buffers up to 500 events (`frontend/src/lib/useFirehose.ts`)

**State Management (Frontend):**
- TanStack Query for all server state; polling cadences centralized in `frontend/src/lib/queries.ts`
- `QueryClient` mounted in `routes/__root.tsx`; staleTime 30s default, per-hook overrides
- Theme persisted to localStorage via `frontend/src/lib/theme.ts`; applied before first paint in `main.tsx`

## Key Abstractions

**`Task`:**
- Purpose: Unit of work dispatched to a Claude subprocess
- Examples: `backend/cmc/db/models/tasks.py`, `backend/cmc/api/schemas/tasks.py`
- Pattern: status state machine (`pending → running → done|failed|awaiting_approval`), validated by `cmc.tasks.transitions`

**`Skill`:**
- Purpose: Named capability definition with autonomy contract (`auto|review|manual`)
- Examples: `backend/cmc/db/models/skills.py`, `backend/cmc/skills/scanner.py`
- Pattern: Scanned from `~/.claude/skills/` and project `skills/`; stored in DB; Haiku router selects best skill per task

**`Decision`:**
- Purpose: Human-in-the-loop checkpoint emitted by a stream-mode task
- Examples: `backend/cmc/db/models/decisions.py`, `backend/cmc/api/routes/hitl.py`
- Pattern: File-then-DB write ordering; dedup_key prevents double-insertion

**`SystemState` KV:**
- Purpose: Global flag store (`emergency_stop`, `telegram_offset`, `dispatcher_last_tick_at`)
- Examples: `backend/cmc/db/models/system_state.py`
- Pattern: SQLite UPSERT; whitelist-filtered on public read endpoint (SAPI-03)

**`MarkerParser`:**
- Purpose: Fenced-code-aware streaming parser that extracts DECISION/INBOX markers from Claude output
- Examples: `backend/cmc/dispatcher/marker_parser.py`
- Pattern: Stateful chunk buffer; call `feed_text()` per delta, `flush()` at stream end

## Entry Points

**FastAPI server:**
- Location: `uvicorn --app-dir backend cmc.app:create_app --factory`
- Triggers: `cmc.app.factory.create_app()` → `FastAPIAppBuilder` chain
- Responsibilities: Assemble full app with middleware, routes, SPA static mount

**Dispatcher heartbeat:**
- Location: `backend/cmc/dispatcher/oneshot.py`
- Triggers: `python -m cmc.dispatcher.oneshot` (launchd or TASK-07)
- Responsibilities: One cycle of task claiming and Claude subprocess fan-out

**Telegram handler:**
- Location: `backend/cmc/telegram/oneshot_handler.py`
- Triggers: launchd KeepAlive daemon
- Responsibilities: Long-poll Telegram updates, relay to `claude -p`, route callbacks to local API

**Frontend:**
- Location: `frontend/src/main.tsx`
- Triggers: Vite dev server or `index.html` from SPA mount
- Responsibilities: Bootstrap TanStack Router + QueryClient; apply theme before paint

**CLI tools:**
- Location: `backend/cmc/cli/` (`setup_telegram.py`, `setup_otel.py`, `doctor.py`)
- Triggers: `python -m cmc.cli.<subcommand>`
- Responsibilities: Interactive setup wizards and health report

## Architectural Constraints

- **Threading:** FastAPI runs async (single event loop via uvicorn). Dispatcher runner threads (`run_classic`, `run_stream`) use `threading.Thread` (non-daemon) spawned from within `asyncio.to_thread`. Each thread calls `asyncio.run()` for its own DB writes (separate event loop per thread).
- **Global state:** `repo_root()` is `lru_cache(maxsize=1)` (`backend/cmc/core/paths.py`). `Settings` is loaded fresh per `load_settings()` call (no module-level singleton). `app.state` stores `engine`, `sessions`, `boot_time`, `sync_task`, `auth_service`, `http_client`, `readiness_registry`.
- **Circular imports:** None detected. Layers depend strictly downward: API → DB, dispatcher → DB + config, ingest → DB + config.
- **DB connections:** Dispatcher heartbeat builds its own engine per cycle (`create_engine_for_settings` in `heartbeat.run_one_cycle`); disposes it at end. FastAPI app uses the lifespan engine. Two separate engine lifetimes, same DB file, WAL mode for concurrent readers.
- **Subprocess env scrub:** `ANTHROPIC_API_KEY` is always removed from child process env in `run_classic` and `run_stream` (Pitfall 8), then re-injected from `Settings` so the value comes from the trusted config layer only.

## Anti-Patterns

### Inlining polling cadences in panel components

**What happens:** A component adds `refetchInterval: 5000` directly to a `useQuery()` call.
**Why it's wrong:** Cadence policy is scattered across 30+ files; impossible to audit or tune.
**Do this instead:** All polling cadences are encoded in `frontend/src/lib/queries.ts` hooks only. Panel components call the hook; they never inline `refetchInterval`.

### Using `BEGIN DEFERRED` (default) for task claim

**What happens:** Using `engine.begin()` or `AsyncSession` auto-begin before `UPDATE tasks SET status='running'`.
**Why it's wrong:** Two concurrent dispatcher cycles could double-claim the same task row.
**Do this instead:** Use `engine.connect()` + `BEGIN IMMEDIATE` as in `backend/cmc/dispatcher/claim.py`.

### Writing DB before queue file in HITL paths

**What happens:** `db.execute(UPDATE decisions ...)` then `write_decision_answer(...)` to queue file.
**Why it's wrong:** A FS error after DB write marks the decision answered with no queue record; dispatcher cannot receive the answer.
**Do this instead:** Write queue file FIRST, then DB UPDATE — as enforced in `backend/cmc/api/routes/hitl.py`.

## Error Handling

**Strategy:** Global exception handlers registered in `backend/cmc/core/errors.py` via `register_error_handlers`. All HTTP errors emit `{error: detail, request_id: ...}` not FastAPI's default `{detail: ...}`.

**Patterns:**
- `HTTPException` → `{error: exc.detail}` with original status code
- Unhandled `Exception` → `{error: "internal server error"}` with 500, `log.exception` with request_id
- Ingest per-file errors: logged + counted, loop continues (never kills the sync cycle)
- Dispatcher tick stamp wrapped in `try/finally` so liveness stamp always runs even on mid-cycle exception

## Cross-Cutting Concerns

**Logging:** Structured via Python `logging`; configured by `configure_logging(settings)` (`backend/cmc/core/logging.py`). `RequestLoggingMiddleware` emits per-request log lines with `request_id`.
**Validation:** Pydantic v2 models in `backend/cmc/api/schemas/`; Settings validation exits with pretty per-field message on `ValidationError` (no traceback, no leaked values).
**Authentication:** Optional JWT auth (`JWTAuthService`). When `settings.auth_enabled=True`, all `all_routers()` except `/healthcheck` get `Depends(get_current_principal)`. Default is disabled for local-only use.

---

*Architecture analysis: 2026-05-02*
