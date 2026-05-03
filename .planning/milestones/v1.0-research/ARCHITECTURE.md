# Architecture Research

**Domain:** Local developer observability dashboard with task dispatching and HITL workflows
**Researched:** 2026-04-25
**Confidence:** HIGH

## System Overview

```
                              macOS localhost

 DATA SOURCES                  INGEST LAYER                 STORAGE
 ============                  ============                 =======

 ~/.claude/projects/**/*.jsonl                              data/
 (session transcripts,         ┌──────────────────┐         dashboard.db
  tool calls, tokens,    ──120s──> JSONL Scraper   │──┐      (SQLite WAL)
  outcomes)                    │  (background task)│  │
                               └──────────────────┘  │     ┌──────────────┐
                                                     ├────>│   Database    │
 Claude Code OTEL              ┌──────────────────┐  │     │  (15 tables,  │
 (CLAUDE_CODE_ENABLE_     POST │  OTEL Receiver   │──┘     │  raw SQL,     │
  TELEMETRY=1)           ────> │  /v1/logs        │        │  aiosqlite)   │
                               │  /v1/metrics     │        └──────┬───────┘
                               └──────────────────┘               │
                                                                  │
 SERVING LAYER                 API LAYER                          │
 =============                 =========                          │
                                                                  │
 ui/dist/                      ┌──────────────────┐               │
 (pre-built React      <──────│  FastAPI          │<──────────────┘
  static files)                │  :8765            │
                               │                  │──── SSE /api/firehose
 Browser                       │  REST endpoints  │──── JSON /api/*
 localhost:8765         <──────│  + static mount   │
                               └──────────────────┘

 DISPATCH LAYER (separate process)          OPTIONAL LAYER
 ====================================      ==============

 ┌──────────────────────────────┐           ┌───────────────────┐
 │  Mission Control Dispatcher  │           │  Telegram Bridge   │
 │  (launchd, 120s heartbeat)   │           │  (launchd daemon)  │
 │                              │           │                    │
 │  - Claims pending tasks      │           │  - Polls decisions │
 │  - Spawns claude -p / claude │──writes──>│  - Sends alerts    │
 │  - Parses DECISION:/INBOX:   │  to DB   │  - Inline buttons  │
 │  - PID files for kill        │           │  - Chat routing    │
 │  - Materializes schedules    │           └───────────────────┘
 └──────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **FastAPI Server** | HTTP API, OTEL receiver, SSE streaming, static file serving, JSONL scraper host | Single uvicorn process on :8765, app factory + builder pattern from fastapi-chassis |
| **JSONL Scraper** | Scan ~/.claude/projects/, parse session files, upsert sessions/tokens/tools | asyncio background task in lifespan, 120s cycle, tracks file mtimes to skip unchanged |
| **OTEL Receiver** | Accept OTLP/HTTP JSON at /v1/logs and /v1/metrics, normalize, store | Two FastAPI POST endpoints, parse ExportLogsServiceRequest / ExportMetricsServiceRequest |
| **Database (SQLite WAL)** | Single source of truth for all dashboard data | Single .db file in data/, aiosqlite for async, raw SQL, idempotent migrations on startup |
| **React Frontend** | Dense observability UI, HITL decision/inbox, task board, schedule composer | Pre-built Vite output in ui/dist/, TanStack Router (3 pages), React Query polling |
| **SSE Firehose** | Real-time OTEL event stream to browser | FastAPI EventSourceResponse, fan-out to connected clients |
| **Mission Control Dispatcher** | Task execution, schedule materialization, subprocess lifecycle | Separate Python process via launchd, 120s heartbeat, reads/writes same SQLite DB |
| **Telegram Bridge** | Remote notifications and HITL responses | Separate Python process via launchd, polls DB for pending decisions/alerts |

## Recommended Project Structure

```
claude-mission-control/
├── main.py                    # Uvicorn entry point, app = create_app()
├── pyproject.toml             # Dependencies, project metadata
├── install.sh                 # One-command installer (OTEL wizard, Telegram wizard, launchd plists)
├── cc                         # CLI shim: start/stop/restart/doctor/setup/sync/logs
│
├── src/
│   └── app/
│       ├── __init__.py        # create_app() factory
│       ├── app_builder.py     # Builder pattern: setup_db, setup_otel, setup_routes, etc.
│       ├── settings.py        # Pydantic BaseSettings (APP_ prefix)
│       ├── lifespan.py        # LifespanManager: DB init, scraper start, shutdown cleanup
│       │
│       ├── db/
│       │   ├── connection.py  # aiosqlite connection pool (read pool + write serializer)
│       │   ├── migrations.py  # Idempotent schema: CREATE IF NOT EXISTS + _migrate_add_column
│       │   ├── queries/       # Raw SQL organized by domain (sessions.py, tokens.py, tasks.py...)
│       │   └── health.py      # Readiness check: SELECT 1
│       │
│       ├── ingest/
│       │   ├── scraper.py     # JSONL scanner: walk projects dir, parse, upsert
│       │   ├── parser.py      # JSONL line parser: extract sessions, tools, tokens, outcomes
│       │   └── otel.py        # OTLP/HTTP receiver: parse log/metric payloads, normalize, store
│       │
│       ├── routes/
│       │   ├── api.py         # Main API router aggregating sub-routers
│       │   ├── sessions.py    # GET /api/sessions, /api/sessions/{id}, /api/sessions/live
│       │   ├── tokens.py      # GET /api/tokens (daily stacked bars)
│       │   ├── tools.py       # GET /api/tools/latency, /api/tools/mcp
│       │   ├── outcomes.py    # GET /api/outcomes (daily session outcome buckets)
│       │   ├── cache.py       # GET /api/cache (hit rate, daily trend)
│       │   ├── tasks.py       # GET/POST/PATCH /api/tasks, /api/tasks/{id}/approve
│       │   ├── schedules.py   # GET/POST/PATCH/DELETE /api/schedules
│       │   ├── decisions.py   # GET/POST /api/decisions (HITL queue)
│       │   ├── inbox.py       # GET/POST /api/inbox (agent-to-user messages)
│       │   ├── firehose.py    # GET /api/firehose (SSE stream)
│       │   ├── health.py      # /healthcheck, /ready
│       │   ├── system.py      # GET /api/system (health strip, KPI, pressure)
│       │   └── otel.py        # POST /v1/logs, /v1/metrics (OTEL receiver endpoints)
│       │
│       ├── services/
│       │   ├── dashboard.py   # Aggregation logic for KPI, health strip, attention bar
│       │   ├── sessions.py    # Session query + enrichment logic
│       │   ├── analytics.py   # Token/cache/outcome aggregation
│       │   └── mcp.py         # MCP server drill-down: per-server, per-tool latency
│       │
│       ├── middleware/
│       │   ├── request_id.py  # X-Request-ID propagation
│       │   └── logging.py     # Structured request logging
│       │
│       ├── errors/
│       │   └── handlers.py    # Global exception handlers
│       │
│       └── readiness/
│           └── registry.py    # Readiness check registry (from chassis)
│
├── dispatcher/
│   ├── __init__.py
│   ├── main.py                # Dispatcher entry point (launchd runs this)
│   ├── executor.py            # Subprocess management: spawn claude -p / claude, PID tracking
│   ├── scheduler.py           # Cron evaluation, stale detection, task materialization
│   ├── stream_parser.py       # Parse DECISION:/INBOX: markers from claude stdout
│   └── pid_manager.py         # PID file read/write in .tmp/mission-control-queue/pids/
│
├── telegram/
│   ├── __init__.py
│   ├── main.py                # Telegram bridge entry point (launchd runs this)
│   ├── notifier.py            # Send decision alerts, approval confirmations, failure notices
│   ├── handler.py             # Inline button callbacks, chat routing
│   └── poller.py              # Poll DB for pending notifications
│
├── tools/
│   ├── doctor.py              # Deterministic health check (no LLM), colored output
│   └── setup.py               # OTEL wizard, Telegram wizard helpers
│
├── ui/
│   ├── dist/                  # Pre-built React app (committed or built via npm run build)
│   ├── src/
│   │   ├── routes/
│   │   │   ├── __root.tsx     # Root layout: health strip, KPI row, attention bar, nav
│   │   │   ├── index.tsx      # Command page (/)
│   │   │   ├── activity.tsx   # Activity page (/activity)
│   │   │   └── skills.tsx     # Skills page (/skills)
│   │   ├── components/        # Reusable UI components (panels, charts, tables, drawers)
│   │   ├── hooks/             # React Query hooks per API endpoint
│   │   └── lib/               # API client, SSE client, utilities
│   ├── package.json
│   └── vite.config.ts
│
├── data/                      # SQLite database file (gitignored)
│   └── dashboard.db
│
├── plists/                    # launchd plist templates
│   ├── com.user.claude-dashboard.plist
│   ├── com.user.claude-dispatcher.plist
│   └── com.user.claude-telegram.plist
│
└── tests/
    ├── unit/                  # pytest unit tests for services, parsers, queries
    ├── integration/           # API endpoint tests with test DB
    └── e2e/                   # Playwright tests for UI
```

### Structure Rationale

- **src/app/:** Follows chassis convention -- everything under a single app package, imported via `from app import create_app`. Builder pattern keeps bootstrap explicit.
- **src/app/db/queries/:** Raw SQL organized by domain (not by table). Each module exports async functions that take an aiosqlite connection. No ORM abstractions.
- **src/app/ingest/:** Separates the two ingest paths (scraper + OTEL) from the API layer. Both write to the same DB but through different triggers (timer vs HTTP POST).
- **src/app/routes/ vs src/app/services/:** Routes handle HTTP concerns (validation, response shaping). Services handle business logic (aggregation, enrichment). One-way dependency: routes call services, never the reverse.
- **dispatcher/:** Completely separate Python package. Shares only the DB file and settings module. Runs in its own process under launchd. Does not import from `app`.
- **telegram/:** Same separation as dispatcher. Shares DB path and settings. Independent launchd process.
- **ui/dist/:** Committed or CI-built. FastAPI mounts this as StaticFiles with html=True. No SSR, no server-side rendering concerns.

## Architectural Patterns

### Pattern 1: App Factory + Builder (from fastapi-chassis)

**What:** `create_app()` factory function calls `FastAPIAppBuilder` with chained `.setup_*()` methods. Each setup method owns one concern and returns `self`.

**When to use:** Always -- this is the project's foundational bootstrap pattern. Adapted from the user's existing chassis.

**Trade-offs:** Slightly more code than a flat `app = FastAPI()` script, but makes the boot sequence testable, explicit, and documented.

**Adaptation for this project:**
```python
# Stripped chassis setup methods not needed (auth, cache, rate_limit, metrics)
# Added project-specific setup methods
app = (
    FastAPIAppBuilder(settings=settings, logger=logger)
    .setup_settings()           # from chassis
    .setup_logging()            # from chassis
    .setup_database()           # adapted: SQLite + aiosqlite, no SQLAlchemy
    .setup_otel_receiver()      # NEW: register /v1/logs, /v1/metrics routes
    .setup_error_handlers()     # from chassis
    .setup_routes()             # adapted: dashboard-specific routers
    .setup_static_files()       # NEW: mount ui/dist/ as StaticFiles
    .setup_middleware()          # simplified: no auth, no rate limiting
    .build()
)
```

### Pattern 2: Write-Serialized / Read-Concurrent SQLite

**What:** A single write connection serializes all mutations. Multiple read connections serve concurrent API requests. All via aiosqlite with WAL mode.

**When to use:** Any SQLite project with concurrent readers and periodic writes. This project has two write sources (scraper + OTEL ingest) and many read sources (API endpoints).

**Trade-offs:** Simple and effective for single-machine use. Cannot scale beyond one machine. WAL file can grow unbounded if reads never quiesce -- needs periodic checkpointing.

**Implementation approach:**
```python
# In lifespan startup:
# 1. Open one write connection (serialized via asyncio.Lock)
# 2. Open a small pool of read connections (3-5 for a single-user dashboard)
# 3. Run migrations on the write connection
# 4. Store both on app.state

class DatabasePool:
    def __init__(self, db_path: str):
        self._write_lock = asyncio.Lock()
        self._write_conn: aiosqlite.Connection | None = None
        self._read_pool: list[aiosqlite.Connection] = []

    async def write(self, sql: str, params=()) -> int:
        async with self._write_lock:
            cursor = await self._write_conn.execute(sql, params)
            await self._write_conn.commit()
            return cursor.lastrowid

    async def read(self, sql: str, params=()) -> list[Row]:
        conn = await self._acquire_reader()
        try:
            cursor = await conn.execute(sql, params)
            return await cursor.fetchall()
        finally:
            await self._release_reader(conn)
```

### Pattern 3: Background Scraper as Lifespan Task

**What:** The JSONL scraper runs as an `asyncio.create_task()` inside the FastAPI lifespan context. It wakes every 120s, walks `~/.claude/projects/`, and upserts new/changed session data.

**When to use:** Periodic background work that must start with the server and stop when it shuts down. Avoids needing a separate process for ingest.

**Trade-offs:** Runs in the same event loop as the API server. A slow scrape cycle could theoretically increase latency for concurrent API requests, but JSONL parsing is CPU-light and 120s intervals are generous. If scraping ever becomes heavy, it could be moved to a thread pool executor.

**Implementation approach:**
```python
# In LifespanManager.lifespan():
scraper_task = asyncio.create_task(
    run_scraper_loop(app.state.db, settings.scraper_interval_seconds)
)
yield
scraper_task.cancel()
with contextlib.suppress(asyncio.CancelledError):
    await scraper_task
```

### Pattern 4: Dispatcher as Separate Process with Shared DB

**What:** The Mission Control dispatcher is a standalone Python script run by launchd with a 120s heartbeat (StartInterval). It reads tasks/schedules from SQLite, claims them atomically with `UPDATE ... WHERE status='pending' AND claimed_by IS NULL`, spawns `claude -p` or `claude` subprocesses, and writes results back.

**When to use:** When a background worker needs to spawn long-running subprocesses that outlive HTTP request cycles. The dispatcher must survive server restarts and vice versa.

**Trade-offs:** Two processes writing to the same SQLite file. WAL mode handles this safely (one writer at a time, busy_timeout prevents instant failures). The dispatcher and server never need to write simultaneously to the same rows, so contention is minimal.

**Critical detail -- PID tracking:** macOS 12+ restricts environment variable disclosure to root, so the dispatcher cannot identify its children by env var. Instead, it writes PID files to `.tmp/mission-control-queue/pids/{task_id}.pid` immediately after `subprocess.Popen()`. Emergency stop reads these PID files and sends SIGTERM.

### Pattern 5: SSE Firehose with Polling Fallback

**What:** OTEL events stream to the browser via SSE (EventSourceResponse). Everything else uses React Query polling at 30s intervals (5s for decisions, 10s for inbox).

**When to use:** Single-user local dashboards where SSE is sufficient for the only real-time need (live event stream). Polling is simpler and more reliable for dashboard panels that update infrequently.

**Trade-offs:** SSE is unidirectional (server to client) and simpler than WebSockets. For a single-user dashboard, one SSE connection is fine. Polling intervals are tunable per-endpoint. The main risk is stale data in the UI -- 30s is acceptable for observability panels, but HITL decisions need faster polling (5s) to feel responsive.

### Pattern 6: HITL via Stdout Marker Parsing

**What:** The dispatcher reads stdout from `claude` (stream mode) subprocesses line-by-line. Lines matching `DECISION:` or `INBOX:` patterns are parsed and written to the decisions/inbox tables. The React frontend polls these tables and presents approval/reply UI.

**When to use:** When the AI subprocess needs to pause for human input but cannot directly call the dashboard API (it is a spawned CLI process).

**Trade-offs:** Marker-based protocols are fragile -- if Claude's output format changes, parsing breaks. Mitigated by keeping the marker format simple and well-documented. The alternative (MCP tool for HITL) would require the dispatcher to run an MCP server, which is more complex than stdout parsing.

## Data Flow

### Ingest Flow (JSONL Path)

```
~/.claude/projects/**/*.jsonl
    |
    | (120s scraper cycle)
    v
Scraper checks file mtimes against last_scan table
    |
    | (changed files only)
    v
Parser reads JSONL lines, extracts:
  - Session metadata (id, model, cwd, timestamps)
  - Token usage per message (input, output, cache_read, cache_create)
  - Tool calls with duration (tool_use -> tool_result delta)
  - Session outcome (result event: ok/errored/truncated/rate_limited)
    |
    v
Upsert to SQLite via write connection:
  sessions, tokens, tools, outcomes tables
```

### Ingest Flow (OTEL Path)

```
Claude Code (with OTEL enabled)
    |
    | POST /v1/logs (tool_result, api_request, api_error, hook, compaction, MCP)
    | POST /v1/metrics (counters: commits, PRs, lines_of_code)
    v
OTEL receiver endpoints parse OTLP/HTTP JSON payload
    |
    v
Normalize: extract event_type, attributes, timestamp, resource labels
    |
    v
Insert to SQLite: otel_events, otel_metrics tables
    |
    | (also)
    v
Push to in-memory SSE fan-out channel for firehose subscribers
```

### API Read Flow

```
React Frontend (browser)
    |
    | React Query: GET /api/sessions/live        (30s poll)
    | React Query: GET /api/tokens?range=7d      (30s poll)
    | React Query: GET /api/decisions?status=pending (5s poll)
    | React Query: GET /api/inbox?unread=true     (10s poll)
    | EventSource: GET /api/firehose              (SSE stream)
    v
FastAPI route handlers
    |
    v
Service layer: aggregation, enrichment, formatting
    |
    v
Raw SQL queries via aiosqlite read connection pool
    |
    v
SQLite WAL (readers never block writers or each other)
```

### Task Dispatch Flow

```
User creates task via UI or Cmd+K
    |
    | POST /api/tasks {prompt, mode, skill_id, requires_approval}
    v
Task inserted: status=pending (or status=approved if auto-approve)
    |
    | (120s dispatcher heartbeat)
    v
Dispatcher claims task:
  UPDATE tasks SET status='running', claimed_by=?, claimed_at=?
  WHERE status IN ('pending','approved') AND claimed_by IS NULL
    |
    v
Dispatcher spawns subprocess:
  - Classic: claude -p "prompt" --output-format json
  - Stream:  claude --stream (reads stdout line-by-line)
    |
    | Write PID file: .tmp/mission-control-queue/pids/{task_id}.pid
    v
Monitor subprocess:
  - Parse stdout for DECISION:/INBOX: markers -> insert to DB
  - Wait for exit code
  - Update task: status=done/failed, output, exit_code, duration
    |
    v
Cleanup: remove PID file
```

### HITL Decision Flow

```
Dispatcher parses "DECISION: Should I refactor the auth module?" from stdout
    |
    v
Insert to decisions table: status=pending, task_id, question, options
    |
    | (5s poll by React frontend)
    v
User sees decision in Attention Bar + Decisions panel
    |
    | User clicks "Approve" or types response
    v
POST /api/decisions/{id}/answer {choice, comment}
    |
    v
Dispatcher reads answer from DB on next check cycle
    |
    v
Writes answer to subprocess stdin (stream mode) or uses it for next prompt
```

### Emergency Stop Flow

```
User clicks Emergency Stop button
    |
    | POST /api/system/emergency-stop
    v
Server reads all PID files from .tmp/mission-control-queue/pids/
    |
    v
For each PID: os.kill(pid, signal.SIGTERM)
    |
    v
Update tasks table: status=killed for affected task_ids
    |
    v
Clean up PID files
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 user, 1 machine (target) | Current architecture is ideal. Single SQLite file, single uvicorn worker, no pool tuning needed. |
| 2-5 concurrent sessions | No changes. WAL handles concurrent reads effortlessly. Write contention between scraper + OTEL is minimal (different tables, short transactions). |
| Heavy OTEL volume (>100 events/sec) | Batch OTEL inserts (accumulate for 1s, insert as batch). Add WAL checkpoint on a timer. Consider OTEL event retention policy (e.g., drop events older than 30d). |
| Large session history (>10K sessions) | Add SQLite indexes on sessions(created_at), tokens(day), tools(session_id). Paginate session list API. Consider archiving old sessions to a separate DB file. |

### Scaling Priorities

1. **First bottleneck: WAL file growth.** If the firehose panel stays open while OTEL events stream in, the WAL file grows because the SSE reader holds a snapshot. Mitigate with periodic `PRAGMA wal_checkpoint(PASSIVE)` on a timer and SSE connection timeouts.

2. **Second bottleneck: JSONL scan time.** As the user accumulates thousands of session files over months, the 120s full walk of `~/.claude/projects/` gets slower. Mitigate by tracking file mtimes in a `scan_state` table and only re-parsing changed files. Consider only scanning files modified in the last 7 days by default.

## Anti-Patterns

### Anti-Pattern 1: ORM Abstraction Layer

**What people do:** Add SQLAlchemy models, relationship mappings, and session factories for "future flexibility."
**Why it's wrong:** This project uses 15 tables with known, stable schemas. The read patterns are aggregation-heavy (GROUP BY, window functions, CTEs). An ORM adds a translation layer that obscures the SQL and makes performance tuning harder. The spec explicitly says "raw SQL."
**Do this instead:** Organize SQL into domain-specific query modules. Use named parameters. Test queries directly against a test DB.

### Anti-Pattern 2: WebSocket for Everything

**What people do:** Use WebSocket connections for all real-time updates (sessions, tokens, decisions).
**Why it's wrong:** WebSockets are bidirectional and stateful -- overkill for a single-user dashboard. They add connection management complexity, reconnection logic, and make debugging harder. Most panels update every 30s; WebSockets provide no benefit there.
**Do this instead:** SSE for the one truly real-time need (OTEL firehose). React Query polling with appropriate intervals for everything else. Simpler, more debuggable, no connection state to manage.

### Anti-Pattern 3: Dispatcher Inside FastAPI

**What people do:** Run the task dispatcher as a background task inside the FastAPI process.
**Why it's wrong:** The dispatcher spawns long-running subprocesses (claude sessions can run for minutes). If the FastAPI process crashes or restarts, those subprocesses become orphans. The dispatcher needs independent lifecycle management.
**Do this instead:** Separate launchd-managed process. Shares only the SQLite DB. Can be restarted independently. launchd handles crash recovery.

### Anti-Pattern 4: Shared Module Imports Between Server and Dispatcher

**What people do:** Import from `app.services` or `app.db` in the dispatcher code.
**Why it's wrong:** Creates tight coupling between two independently deployed processes. Changes to the server's internal structure break the dispatcher. The dispatcher needs to start without loading FastAPI.
**Do this instead:** Dispatcher and Telegram bridge import only from a shared `settings.py` and use their own raw SQL queries. They share the DB path, not the codebase.

### Anti-Pattern 5: Polling Decisions at Dashboard Refresh Rate

**What people do:** Poll decisions at the same 30s interval as observability panels.
**Why it's wrong:** HITL decisions are time-sensitive. A developer waiting 30s to see a decision question feels broken. The whole point of HITL is fast human feedback.
**Do this instead:** Poll decisions at 5s, inbox at 10s. These are lightweight queries (SELECT WHERE status='pending') and the table is tiny. The cost is negligible.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Claude Code CLI | subprocess.Popen with stdout/stderr pipes | Dispatcher spawns `claude -p` (classic) or `claude` (stream). PID tracked via files. |
| Claude Code JSONL | File system read (glob + mtime check) | Scraper walks `~/.claude/projects/`. Read-only. Never writes to JSONL files. |
| Claude Code OTEL | OTLP/HTTP receiver (POST /v1/logs, /v1/metrics) | Dashboard acts as the OTEL collector. Claude Code configured via settings.json env vars. |
| Telegram Bot API | HTTPS POST to api.telegram.org | Only outbound network call. Optional. Bridge polls DB, sends via Bot API, receives callbacks. |
| launchd | Plist configuration files | Three plists: dashboard server, dispatcher, telegram bridge. Install.sh generates them. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| FastAPI server <-> SQLite | aiosqlite (async Python sqlite3) | Write serialized via lock, reads concurrent via pool |
| Dispatcher <-> SQLite | sqlite3 (sync, single connection) | Atomic UPDATE for task claiming. Short transactions only. |
| Telegram <-> SQLite | sqlite3 (sync, single connection) | Reads pending notifications, writes delivery status. |
| FastAPI <-> React Frontend | Static file mount + REST API + SSE | StaticFiles(html=True) for SPA routing. API under /api/. SSE at /api/firehose. |
| Dispatcher <-> Claude CLI | subprocess stdin/stdout/stderr | PID files for tracking. DECISION:/INBOX: markers parsed from stdout. |
| React <-> User | Browser | localhost:8765. React Query for data. Cmd+K command palette. localStorage for UI state. |

## Build Order (Dependency Chain)

The components have clear dependency ordering that determines the recommended build sequence:

```
Phase 1: Foundation (no dependencies)
  ├── Settings (Pydantic BaseSettings)
  ├── Database schema + migrations
  ├── App factory + builder skeleton
  └── Health/readiness endpoints

Phase 2: Data Ingest (depends on: Phase 1)
  ├── JSONL parser + scraper
  ├── OTEL receiver endpoints
  └── Background scraper loop in lifespan

Phase 3: API Layer (depends on: Phase 1, 2)
  ├── Session/token/tool/outcome endpoints
  ├── Dashboard aggregation service
  ├── MCP drill-down service
  └── SSE firehose endpoint

Phase 4: Frontend Shell (depends on: Phase 3)
  ├── Vite + TanStack Router setup
  ├── Root layout (health strip, KPI, attention bar)
  ├── Static file mount in FastAPI
  └── React Query hooks for API

Phase 5: Frontend Panels (depends on: Phase 4)
  ├── Observability panels (sessions, tokens, tools, cache, outcomes)
  ├── MCP centerpiece panel
  ├── Activity heatmap + token charts
  └── Sessions table with filters

Phase 6: HITL + Dispatch (depends on: Phase 1, separate from 2-5)
  ├── Task table + API endpoints
  ├── Schedule table + API endpoints
  ├── Decision/inbox tables + API endpoints
  ├── Dispatcher subprocess executor
  ├── Stream parser (DECISION:/INBOX:)
  └── PID manager + emergency stop

Phase 7: HITL Frontend (depends on: Phase 4, 6)
  ├── Task board (3 columns, composer)
  ├── Schedule composer (cron, toggle, history)
  ├── Decision queue panel
  └── Inbox panel

Phase 8: Polish + Integration (depends on: all above)
  ├── Telegram bridge
  ├── Command palette (Cmd+K)
  ├── install.sh + cc CLI
  ├── doctor.py
  └── Playwright e2e tests
```

**Build order rationale:**
- **Foundation first** because every other component depends on settings + DB.
- **Ingest before API** because API endpoints are meaningless without data. The scraper populates the DB with real session data immediately, making all subsequent development testable against real data.
- **API before frontend** because React Query hooks need working endpoints. Building API first also validates the DB schema and query patterns.
- **HITL/Dispatch can parallel with frontend panels** (Phases 5-6) because they share only the DB schema, not code paths. The dispatcher is a separate process that does not depend on the API server being complete.
- **Polish last** because Telegram, install scripts, and e2e tests are integration concerns that benefit from a stable system.

## Sources

- [SQLite WAL mode documentation](https://www.sqlite.org/wal.html) -- read concurrency and checkpointing behavior
- [FastAPI SSE (EventSourceResponse)](https://fastapi.tiangolo.com/tutorial/server-sent-events/) -- built-in SSE support since FastAPI 0.135.0
- [FastAPI lifespan events](https://fastapi.tiangolo.com/advanced/events/) -- async context manager for startup/shutdown
- [FastAPI static files](https://fastapi.tiangolo.com/tutorial/static-files/) -- StaticFiles mount with html=True for SPA
- [OTLP HTTP specification](https://opentelemetry.io/docs/specs/otlp/) -- /v1/logs, /v1/metrics endpoint format
- [Python subprocess module](https://docs.python.org/3/library/subprocess.html) -- Popen for spawning claude CLI
- [launchd tutorial](https://launchd.info/) -- macOS daemon management with StartInterval
- [SQLite concurrent writes (Fly.io)](https://fly.io/blog/sqlite-internals-wal/) -- WAL internals and read concurrency
- [HITL patterns for AI agents (Redis)](https://redis.io/blog/ai-human-in-the-loop/) -- approval gate, checkpoint/resume
- [React Query + SSE integration](https://fragmentedthought.com/blog/2025/react-query-caching-with-server-side-events) -- combining polling with event streams
- fastapi-chassis repo (local) -- app factory, builder pattern, settings, lifespan, readiness registry

---
*Architecture research for: Claude Mission Control -- local developer observability dashboard with task dispatching and HITL*
*Researched: 2026-04-25*
