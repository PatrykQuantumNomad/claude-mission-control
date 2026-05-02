# Codebase Structure

**Analysis Date:** 2026-05-02

## Directory Layout

```
claude-mission-control/          # repo root (detected by repo_root() via backend/+frontend/ siblings)
├── backend/                     # Python FastAPI backend
│   ├── cmc/                     # Main package
│   │   ├── api/                 # HTTP interface layer
│   │   │   ├── routes/          # FastAPI route handlers (one file per resource)
│   │   │   ├── schemas/         # Pydantic request/response models
│   │   │   └── sse.py           # Shared SSE generator for firehose + session stream
│   │   ├── app/                 # Application assembly
│   │   │   ├── factory.py       # FastAPIAppBuilder + create_app()
│   │   │   ├── lifespan.py      # Startup/shutdown: engine, migrations, ingest loop
│   │   │   └── templates/       # Jinja2 HTML templates (plist rendering)
│   │   ├── auth/                # Optional JWT authentication
│   │   │   ├── service.py       # JWTAuthService (shared-secret / JWKS)
│   │   │   ├── dependencies.py  # FastAPI get_current_principal dependency
│   │   │   └── models.py        # Principal dataclass
│   │   ├── cli/                 # CLI subcommands (setup_telegram, setup_otel, doctor)
│   │   ├── config/
│   │   │   └── settings.py      # Pydantic-settings Settings class
│   │   ├── core/                # Cross-cutting utilities
│   │   │   ├── errors.py        # Global exception handlers
│   │   │   ├── logging.py       # configure_logging()
│   │   │   ├── paths.py         # repo_root() (lru_cache), resolve_under_repo_root()
│   │   │   ├── process.py       # emergency_stop_all(), pid_dir()
│   │   │   ├── queue.py         # File-based JSONL queue writer (.tmp/mission-control-queue/)
│   │   │   └── static.py        # SPAStaticFiles (SPA catch-all)
│   │   ├── db/                  # Data layer
│   │   │   ├── engine.py        # create_engine_for_settings() + WAL/pragma listener
│   │   │   ├── session.py       # make_sessionmaker(), get_session() FastAPI dependency
│   │   │   ├── base.py          # SQLModel base
│   │   │   ├── health.py        # check_database_readiness()
│   │   │   └── models/          # SQLModel ORM table definitions (one file per table)
│   │   ├── dispatcher/          # Out-of-process task orchestrator
│   │   │   ├── heartbeat.py     # run_one_cycle() — full dispatcher loop
│   │   │   ├── claim.py         # claim_pending_tasks() — BEGIN IMMEDIATE atomic claim
│   │   │   ├── autonomy_gate.py # check_autonomy() — skill autonomy enforcement
│   │   │   ├── run_classic.py   # run_classic() — sync claude -p subprocess
│   │   │   ├── run_stream.py    # run_stream() — bidirectional NDJSON subprocess
│   │   │   ├── marker_parser.py # MarkerParser — DECISION/INBOX extractor
│   │   │   ├── skill_router.py  # pick_skill() — Haiku-4.5 skill assignment
│   │   │   ├── state.py         # PID files, tick stamp, max_concurrent()
│   │   │   ├── materialize.py   # Materialise due schedules into Task rows
│   │   │   ├── sweep.py         # sweep_stale_pids()
│   │   │   ├── answer_poll.py   # wait_for_answer() — polls queue file
│   │   │   ├── follow_ups.py    # FollowUpPump — inject follow-up files to stdin
│   │   │   ├── inbox_post.py    # post_inbox_marker() — POST to /api/inbox
│   │   │   ├── model_resolve.py # resolve_model() — skill → model name
│   │   │   ├── oneshot.py       # Entry point: python -m cmc.dispatcher.oneshot
│   │   │   └── templates/       # Jinja2 launchd plist template for dispatcher daemon
│   │   ├── ingest/              # JSONL transcript ingestion
│   │   │   ├── scheduler.py     # sync_once(), periodic_sync_loop()
│   │   │   ├── jsonl_parser.py  # parse_session_file() — pure, off-thread
│   │   │   ├── repository.py    # upsert_session/tools/token_usage DB helpers
│   │   │   └── otel_parser.py   # OTLP JSON parser helpers
│   │   ├── mcp/
│   │   │   └── aggregator.py    # Three-source MCP latency aggregator (window functions)
│   │   ├── middleware/          # Starlette middleware (one file per concern)
│   │   ├── observability/       # OTLP tracing + Prometheus metrics setup
│   │   ├── readiness/           # ReadinessRegistry + ReadinessCheckResult
│   │   ├── schedules/           # cron.py, nlcron.py (NL → cron via Haiku)
│   │   ├── skills/
│   │   │   └── scanner.py       # find_skill_files(), parse_skill(), scan_all()
│   │   ├── tasks/
│   │   │   ├── transitions.py   # validate_transition() — pure state machine
│   │   │   └── spawn.py         # spawn_dispatcher_oneshot() — detached Popen
│   │   └── telegram/            # Telegram bot integration
│   │       ├── handler.py       # Long-poll update loop
│   │       ├── api.py           # Telegram HTTP API wrappers
│   │       ├── dash_router.py   # Callback query → local API routing
│   │       ├── notifier.py      # Outgoing Telegram notifications
│   │       ├── oneshot_handler.py # Launchd entry point for telegram handler
│   │       └── templates/       # Jinja2 launchd plist templates
│   ├── migrations/              # Alembic migration scripts
│   │   └── versions/            # Migration version files
│   ├── tests/                   # Backend test suite
│   │   └── fixtures/            # Shared test fixtures
│   ├── alembic.ini              # Alembic configuration
│   └── pyproject.toml           # Python project + dependency config
├── frontend/                    # React TypeScript SPA
│   ├── src/
│   │   ├── main.tsx             # App bootstrap: router + theme pre-paint
│   │   ├── routeTree.gen.ts     # Auto-generated TanStack Router route tree
│   │   ├── styles.css           # Global CSS design system (CSS custom properties)
│   │   ├── vite-env.d.ts        # Vite env type declaration
│   │   ├── routes/              # File-based route components
│   │   │   ├── __root.tsx       # Root: QueryClientProvider + ErrorBoundary + AppShell
│   │   │   ├── index.tsx        # `/` — Command page (live panels)
│   │   │   ├── activity.tsx     # `/activity` — Activity page (historical)
│   │   │   └── skills.tsx       # `/skills` — Skills registry page
│   │   ├── components/
│   │   │   ├── panels/          # 30+ panel components (one per dashboard panel)
│   │   │   ├── shell/           # AppShell, NavBar, EmergencyStopBanner, ThemeToggle
│   │   │   └── ui/              # Primitive UI components (Button, Card, Badge, etc.)
│   │   ├── lib/
│   │   │   ├── api.ts           # Typed fetch client + all backend TS interfaces
│   │   │   ├── queries.ts       # TanStack Query hooks; all polling cadences live here
│   │   │   ├── useFirehose.ts   # Native EventSource SSE hook
│   │   │   ├── theme.ts         # applyTheme() / toggleTheme() / localStorage
│   │   │   ├── storage.ts       # localStorage wrappers
│   │   │   └── cron-utils.ts    # Cron expression utilities
│   │   └── test/                # Frontend test utilities + setup
│   ├── tests/e2e/               # Playwright end-to-end tests
│   └── package.json             # Frontend dependencies (Vite, React, TanStack)
├── data/                        # Runtime data (gitignored; cmc.db lives here)
│   └── cmc.db                   # SQLite database (WAL mode; auto-created by lifespan)
├── scripts/                     # Shell install/start/stop scripts + Python setup helpers
│   ├── install.sh               # One-shot install script
│   ├── start.sh / stop.sh       # Service management
│   ├── setup_telegram.py        # Python setup helper (mirrors CLI)
│   └── setup_otel.py
├── .tmp/mission-control-queue/  # File-based IPC queue (runtime; gitignored)
│   ├── decisions/               # HITL decision answers: {decision_id}.jsonl
│   ├── inbox/                   # Inbox replies: {inbox_id}.jsonl
│   └── messages/                # Session follow-ups: {session_id}.jsonl
├── .planning/                   # GSD project planning documents
│   ├── codebase/                # Codebase maps (this file and siblings)
│   ├── milestones/
│   ├── phases/                  # Per-phase implementation plans
│   └── research/
├── Makefile                     # Dev workflow targets (dev-backend, dev-frontend, test, etc.)
├── package.json                 # Root package.json (workspace root; minimal)
└── .pre-commit-config.yaml      # Pre-commit hooks (ruff, etc.)
```

## Directory Purposes

**`backend/cmc/api/routes/`:**
- Purpose: One FastAPI router per resource
- Contains: `sessions.py`, `tasks.py`, `skills.py`, `hitl.py`, `schedules.py`, `notifications.py`, `system.py`, `observability.py`, `sync.py`, `mcp.py`, `context.py`, `health.py`, `ingest.py`
- Key files: `__init__.py` — `all_routers()` and `raw_routers()` aggregators

**`backend/cmc/db/models/`:**
- Purpose: SQLModel ORM table definitions, one file per DB table
- Contains: `sessions.py`, `tasks.py`, `skills.py`, `decisions.py`, `inbox.py`, `schedules.py`, `tools.py`, `token_usage.py`, `live_state.py`, `system_state.py`, `otel_events.py`, `otel_metrics.py`, `mcp_stats.py`, `notification_log.py`, `activities.py`
- Key files: All imported by Alembic `env.py` for migration generation

**`backend/cmc/dispatcher/`:**
- Purpose: Self-contained task execution engine; runs out-of-process
- Key files: `heartbeat.py` (orchestration), `claim.py` (atomic DB), `run_stream.py` (HITL-capable)

**`frontend/src/lib/`:**
- Purpose: All shared frontend logic — no business logic in components
- Key files: `api.ts` (types + fetch), `queries.ts` (all hooks + cadences), `useFirehose.ts` (SSE)

**`frontend/src/components/panels/`:**
- Purpose: Dashboard panel components; each is a self-contained display unit
- Key files: `index.ts` barrel re-exports all panels; individual files named after the panel (e.g., `TaskBoard.tsx`, `DecisionsCard.tsx`, `LiveSessionsCard.tsx`)

## Key File Locations

**Entry Points:**
- `backend/cmc/app/factory.py`: `create_app()` — uvicorn factory target
- `backend/cmc/dispatcher/oneshot.py`: `main()` — dispatcher launchd entry point
- `backend/cmc/telegram/oneshot_handler.py`: Telegram daemon launchd entry point
- `frontend/src/main.tsx`: SPA bootstrap

**Configuration:**
- `backend/cmc/config/settings.py`: All `Settings` fields with defaults
- `backend/.env`: Dev environment overrides (gitignored)
- `~/.command-centre/.env`: Installed environment overrides (gitignored)
- `backend/alembic.ini`: Alembic migration config

**Core Logic:**
- `backend/cmc/app/lifespan.py`: Startup sequence (migrations, ingest loop, auth warmup)
- `backend/cmc/dispatcher/heartbeat.py`: Task dispatch cycle
- `backend/cmc/ingest/scheduler.py`: JSONL sync orchestration
- `backend/cmc/core/paths.py`: `repo_root()` — all path resolution anchors here
- `backend/cmc/core/queue.py`: File queue paths — single source of truth for `.tmp/` layout

**Testing:**
- `backend/tests/`: Python test suite (pytest)
- `backend/tests/fixtures/`: Shared fixtures
- `frontend/src/**/__tests__/`: Co-located unit tests
- `frontend/tests/e2e/`: Playwright end-to-end tests

**DB Models:**
- `backend/cmc/db/models/`: All ORM models; changes here require a new Alembic migration
- `backend/migrations/versions/`: Migration files (auto-generated with `alembic revision --autogenerate`)

## Naming Conventions

**Files (backend):**
- Python modules: `snake_case.py`
- One resource per file in `api/routes/` and `api/schemas/`
- Models named after DB table (singular): `tasks.py` → `class Task`
- Entry point scripts: `oneshot.py`, `oneshot_handler.py`

**Files (frontend):**
- React components: `PascalCase.tsx`
- Utility/hook files: `camelCase.ts`
- Auto-generated: `routeTree.gen.ts` (never edit manually)
- Test directories: `__tests__/` co-located with source

**Directories:**
- Backend: all lowercase, topic-named (`dispatcher/`, `ingest/`, `tasks/`)
- Frontend: lowercase for utility dirs (`lib/`, `routes/`, `test/`), lowercase for component category dirs (`panels/`, `shell/`, `ui/`)

**Classes (backend):**
- ORM models: `PascalCase` matching table concept (`Task`, `Skill`, `Decision`)
- Settings: `Settings` (single class)
- Services: `PascalCaseService` (`JWTAuthService`)
- Builder: `FastAPIAppBuilder`

**Variables/functions:**
- Backend: `snake_case` throughout
- Frontend: `camelCase` for functions and variables; `PascalCase` for components and types

## Where to Add New Code

**New API endpoint:**
1. Add route handler: `backend/cmc/api/routes/<resource>.py` (new file or extend existing)
2. Add Pydantic schemas: `backend/cmc/api/schemas/<resource>.py`
3. Register router in: `backend/cmc/api/routes/__init__.py` → `all_routers()` or `raw_routers()`
4. Add TS types: `frontend/src/lib/api.ts`
5. Add query hook: `frontend/src/lib/queries.ts` (with cadence)

**New DB table:**
1. Add SQLModel: `backend/cmc/db/models/<table>.py`
2. Import in Alembic `env.py` (or ensure all models are imported before `target_metadata`)
3. Generate migration: `alembic revision --autogenerate -m "add <table>"`
4. Run migration: applied automatically by lifespan on next startup

**New dispatcher feature:**
- Self-contained module in `backend/cmc/dispatcher/`
- Import in `heartbeat.py` at the appropriate cycle step

**New dashboard panel:**
1. Component: `frontend/src/components/panels/<PanelName>.tsx`
2. Export from: `frontend/src/components/panels/index.ts`
3. Query hook: `frontend/src/lib/queries.ts` (with explicit cadence comment)
4. Mount in route: `frontend/src/routes/index.tsx` or `activity.tsx`

**New frontend utility/hook:**
- Place in: `frontend/src/lib/<utilName>.ts`
- No business logic in components; shared logic always goes in `lib/`

**New Telegram command/callback:**
- Handler logic: `backend/cmc/telegram/handler.py` or `dash_router.py`

**New CLI subcommand:**
- Module: `backend/cmc/cli/<subcommand>.py` with `main()` callable

**New middleware:**
- Module: `backend/cmc/middleware/<name>.py`
- Register: `backend/cmc/app/factory.py` → `setup_middleware()`

## Special Directories

**`data/`:**
- Purpose: Runtime SQLite database (`cmc.db` + WAL files)
- Generated: Yes (by lifespan on first startup)
- Committed: No (gitignored)

**`.tmp/mission-control-queue/`:**
- Purpose: File-based IPC between FastAPI (writer) and dispatcher (reader)
- Generated: Yes (by `cmc.core.queue.queue_path()` at runtime)
- Committed: No (gitignored)

**`frontend/dist/`:**
- Purpose: Vite production build output; served by FastAPI SPA mount
- Generated: Yes (`cd frontend && npm run build`)
- Committed: No (gitignored)

**`frontend/.tanstack/`:**
- Purpose: TanStack Router code-gen cache
- Generated: Yes (by `vite-plugin-tanstack-router`)
- Committed: No (gitignored)

**`backend/migrations/versions/`:**
- Purpose: Alembic migration scripts (auto-generated, then reviewed)
- Generated: Partially (auto-generated skeleton, human-reviewed content)
- Committed: Yes

**`.planning/`:**
- Purpose: GSD project planning — milestones, phase plans, codebase maps
- Generated: By GSD commands
- Committed: Yes

---

*Structure analysis: 2026-05-02*
