# Codebase Structure

**Analysis Date:** 2026-05-02

## Directory Layout

```
claude-mission-control/
├── backend/                    # Python FastAPI server + dispatcher + CLI
│   ├── cmc/                    # Main Python package
│   │   ├── api/                # HTTP layer: routes + Pydantic schemas
│   │   │   ├── routes/         # 13 FastAPI routers (one file per domain)
│   │   │   ├── schemas/        # Pydantic I/O schemas (mirror frontend api.ts)
│   │   │   └── sse.py          # SSE helper for /api/firehose
│   │   ├── app/                # FastAPI application builder + lifespan
│   │   │   ├── factory.py      # FastAPIAppBuilder + create_app()
│   │   │   ├── lifespan.py     # Startup/shutdown: migrations, sync, JWT warmup
│   │   │   └── templates/      # Jinja2 plist template for app service
│   │   ├── auth/               # Optional JWT auth (disabled by default)
│   │   │   ├── dependencies.py # get_current_principal FastAPI dependency
│   │   │   ├── models.py       # Principal/token types
│   │   │   └── service.py      # JWTAuthService + JWKS cache
│   │   ├── cli/                # cmc CLI sub-commands
│   │   │   ├── doctor.py       # `cmc doctor` health checks
│   │   │   └── setup_telegram.py # `cmc setup telegram` wizard
│   │   ├── config/             # Pydantic-settings configuration
│   │   │   └── settings.py     # Settings class + load_settings()
│   │   ├── core/               # Shared utilities (no domain logic)
│   │   │   ├── errors.py       # Global FastAPI exception handlers
│   │   │   ├── logging.py      # configure_logging()
│   │   │   ├── paths.py        # repo_root() + resolve_under_repo_root()
│   │   │   ├── process.py      # PID file helpers, emergency_stop_all
│   │   │   ├── queue.py        # File-based queue writer (.tmp/mission-control-queue/)
│   │   │   └── static.py       # SPAStaticFiles (SPA catch-all)
│   │   ├── db/                 # Database: models, engine, sessions
│   │   │   ├── models/         # 14 SQLModel ORM models
│   │   │   ├── base.py         # SQLModel re-export
│   │   │   ├── engine.py       # create_engine_for_settings()
│   │   │   ├── health.py       # check_database_readiness()
│   │   │   └── session.py      # make_sessionmaker() + get_session dep
│   │   ├── dispatcher/         # Task execution engine
│   │   │   ├── oneshot.py      # Entry point: python -m cmc.dispatcher.oneshot
│   │   │   ├── heartbeat.py    # run_one_cycle() orchestrator
│   │   │   ├── claim.py        # Atomic task claim (BEGIN IMMEDIATE)
│   │   │   ├── materialize.py  # Schedules → Task rows
│   │   │   ├── sweep.py        # PID file GC
│   │   │   ├── autonomy_gate.py# auto/review/manual skill gate
│   │   │   ├── run_classic.py  # Classic-mode subprocess runner
│   │   │   ├── run_stream.py   # Stream-mode subprocess + NDJSON reader
│   │   │   ├── marker_parser.py# DECISION/INBOX marker extraction
│   │   │   ├── answer_poll.py  # Poll DB for decision answers
│   │   │   ├── follow_ups.py   # FollowUpPump (stdin injection)
│   │   │   ├── inbox_post.py   # POST /api/inbox from stream runner
│   │   │   ├── model_resolve.py# Resolve claude model for task
│   │   │   ├── skill_router.py # Haiku-powered skill assignment
│   │   │   ├── state.py        # PID file ops + stamp_tick + max_concurrent
│   │   │   └── templates/      # Jinja2 plist template for dispatcher daemon
│   │   ├── ingest/             # JSONL ingestion pipeline
│   │   │   ├── scheduler.py    # sync_once() + periodic_sync_loop()
│   │   │   ├── jsonl_parser.py # Claude Code JSONL file parser
│   │   │   ├── otel_parser.py  # OTel log/metric payload parser
│   │   │   └── repository.py   # upsert_session, upsert_tools, accumulate_token_usage
│   │   ├── mcp/                # MCP server aggregation
│   │   │   └── aggregator.py   # Aggregate MCP stats across sessions
│   │   ├── middleware/         # Starlette ASGI middleware
│   │   │   ├── body_size.py
│   │   │   ├── rate_limit.py
│   │   │   ├── request_id.py
│   │   │   ├── request_logging.py
│   │   │   ├── security_headers.py
│   │   │   └── timeout.py
│   │   ├── observability/      # OTel tracing + Prometheus metrics
│   │   │   ├── metrics.py
│   │   │   └── tracing.py
│   │   ├── readiness/          # Readiness check registry
│   │   ├── schedules/          # Cron schedule helpers
│   │   ├── skills/             # Skill scanner (CLAUDE.md skill discovery)
│   │   │   └── scanner.py
│   │   ├── tasks/              # Task domain logic
│   │   │   ├── spawn.py        # spawn_dispatcher_oneshot()
│   │   │   └── transitions.py  # Status state machine
│   │   └── telegram/           # Telegram bot integration
│   │       ├── handler.py      # Long-poll update loop
│   │       ├── notifier.py     # Proactive notification sender
│   │       ├── api.py          # Telegram Bot API HTTP calls
│   │       ├── dash_router.py  # Decode callback queries → local API
│   │       ├── messages.py     # Message formatting
│   │       └── templates/      # Jinja2 plist templates (4 daemon plists)
│   ├── migrations/             # Alembic migration scripts
│   │   └── versions/           # 0001_initial.py (single migration)
│   ├── tests/                  # pytest test suite
│   │   └── fixtures/           # Test fixture data
│   └── alembic.ini             # Alembic configuration
├── frontend/                   # React SPA
│   ├── src/
│   │   ├── main.tsx            # React root entry point
│   │   ├── styles.css          # Design system CSS (~51k lines, CSS custom props)
│   │   ├── routeTree.gen.ts    # Auto-generated by TanStack Router
│   │   ├── vite-env.d.ts       # Vite type declarations
│   │   ├── routes/             # File-based routes
│   │   │   ├── __root.tsx      # Root layout: QueryClientProvider + ErrorBoundary
│   │   │   ├── index.tsx       # / — Command page
│   │   │   ├── activity.tsx    # /activity — Activity page
│   │   │   └── skills.tsx      # /skills — Skills registry page
│   │   ├── components/
│   │   │   ├── panels/         # ~35 domain-specific panel widgets
│   │   │   ├── shell/          # AppShell, NavBar, EmergencyStopBanner, ThemeToggle
│   │   │   └── ui/             # ~20 primitive UI components
│   │   ├── lib/
│   │   │   ├── api.ts          # Typed fetcher map (all backend endpoints)
│   │   │   ├── queries.ts      # TanStack Query hooks + cadence policy + mutations
│   │   │   ├── useFirehose.ts  # Native EventSource hook for SSE firehose
│   │   │   ├── storage.ts      # localStorage helpers
│   │   │   ├── theme.ts        # Theme persistence
│   │   │   └── cron-utils.ts   # Cron string formatting
│   │   └── test/               # Vitest test setup
│   ├── tests/e2e/              # Playwright E2E tests
│   └── dist/                   # Built SPA (served by backend)
├── data/                       # SQLite database
│   └── cmc.db                  # Primary data store (+ WAL files at runtime)
├── scripts/                    # Shell utilities
│   ├── cmc                     # Main CLI launcher (wraps Python CLI)
│   ├── install.sh              # launchd installation helper
│   ├── start.sh / stop.sh      # Service control
│   ├── doctor.py               # System health diagnostics
│   └── setup_telegram.py       # Telegram setup wizard
├── .tmp/mission-control-queue/ # Cross-process file bus (gitignored)
│   ├── decisions/              # {decision_id}.jsonl — HITL decision answers
│   ├── inbox/                  # {inbox_id}.jsonl — inbox replies
│   ├── messages/               # {session_id}.jsonl — follow-up messages
│   └── dispatcher-logs/        # task-{id}-stream-*.log — subprocess logs
├── .planning/                  # GSD planning documents
│   ├── codebase/               # Architecture/stack documents (this file)
│   ├── milestones/             # Milestone definitions
│   └── phases/                 # Per-phase implementation plans
├── .claude/                    # Claude Code configuration
│   ├── commands/               # Slash commands
│   └── hooks/                  # Claude Code hook scripts
├── Makefile                    # Dev workflow targets
├── package.json                # Root package.json (pre-commit tooling)
└── README.md                   # User-facing documentation
```

## Directory Purposes

**`backend/cmc/api/routes/`:**
- Purpose: One FastAPI `APIRouter` per domain resource
- Contains: `health.py`, `sessions.py`, `tasks.py`, `hitl.py`, `schedules.py`, `skills.py`, `mcp.py`, `sync.py`, `system.py`, `observability.py`, `context.py`, `notifications.py`, `ingest.py`
- Key files: `__init__.py` (aggregates via `all_routers()` and `raw_routers()`)

**`backend/cmc/api/schemas/`:**
- Purpose: Pydantic v2 request/response models (single source of truth for wire shape)
- Contains: One file per domain matching the route files
- Key files: `tasks.py`, `sessions.py`, `hitl.py`, `schedules.py`, `system.py`

**`backend/cmc/db/models/`:**
- Purpose: SQLModel ORM models (one file per table)
- Contains: `sessions.py`, `tasks.py`, `schedules.py`, `skills.py`, `decisions.py`, `inbox.py`, `tools.py`, `token_usage.py`, `otel_events.py`, `otel_metrics.py`, `activities.py`, `live_state.py`, `mcp_stats.py`, `system_state.py`, `notification_log.py`

**`backend/cmc/dispatcher/`:**
- Purpose: Task execution engine; runs as a separate process
- Key files: `oneshot.py` (entry), `heartbeat.py` (cycle), `run_stream.py` (HITL-capable runner)

**`backend/cmc/telegram/templates/`:**
- Purpose: Jinja2 templates for launchd property list files
- Contains: `com.cmc.telegram-handler.plist.j2`, `com.cmc.telegram-notifier.plist.j2` and two others

**`frontend/src/components/panels/`:**
- Purpose: Observable panels consuming TanStack Query hooks
- Contains: ~35 panel components; exports collected via `index.ts`
- Key files: `TaskBoard.tsx`, `DecisionsCard.tsx`, `LiveSessionsCard.tsx`, `SystemHealthStrip.tsx`

**`frontend/src/components/shell/`:**
- Purpose: Application chrome (nav, error banner, theme)
- Key files: `AppShell.tsx`, `NavBar.tsx`, `EmergencyStopBanner.tsx`

**`frontend/src/components/ui/`:**
- Purpose: Reusable primitive components (no domain logic)
- Contains: `Button`, `Card`, `Badge`, `Sheet`, `DataTable`, `PanelCard`, `KpiTile`, `Skeleton`, `Tooltip`, `RangeToggle`, etc.

**`.tmp/mission-control-queue/`:**
- Purpose: Cross-process JSONL file bus between API server and dispatcher
- Generated: Yes (created at runtime)
- Committed: No (gitignored)

## Key File Locations

**Entry Points:**
- `backend/cmc/app/factory.py`: FastAPI `create_app()` factory
- `backend/cmc/dispatcher/oneshot.py`: Dispatcher `__main__` entry
- `frontend/src/main.tsx`: React DOM render root
- `scripts/cmc`: Shell CLI launcher

**Configuration:**
- `backend/cmc/config/settings.py`: All application settings (`Settings` class)
- `backend/.env.example`: Documented env var reference
- `backend/alembic.ini`: Alembic migration config
- `frontend/vite.config.ts`: Vite build config (if present)

**Core Logic:**
- `backend/cmc/core/paths.py`: `repo_root()` — used by everything that resolves paths
- `backend/cmc/core/queue.py`: File-based HITL/follow-up bus
- `backend/cmc/tasks/transitions.py`: Task status state machine
- `backend/cmc/dispatcher/heartbeat.py`: Dispatcher cycle orchestrator
- `backend/cmc/ingest/scheduler.py`: JSONL ingestion entry point

**Frontend Infrastructure:**
- `frontend/src/lib/api.ts`: All typed API fetchers (mirrors Pydantic schemas)
- `frontend/src/lib/queries.ts`: All TanStack Query hooks + cadence policy
- `frontend/src/routeTree.gen.ts`: Auto-generated route tree (do not edit)

**Testing:**
- `backend/tests/conftest.py`: pytest fixtures
- `backend/tests/fixtures/`: JSONL fixture files
- `frontend/src/test/`: Vitest setup
- `frontend/tests/e2e/`: Playwright tests

## Naming Conventions

**Backend Files:**
- Modules use `snake_case.py` matching their domain (`tasks.py`, `run_stream.py`)
- ORM models use `snake_case.py` matching table name (`system_state.py`, `otel_events.py`)
- Template files use the full launchd identifier with `.j2` suffix (`com.cmc.server.plist.j2`)

**Frontend Files:**
- React components: `PascalCase.tsx` (`TaskBoard.tsx`, `DecisionsCard.tsx`)
- Non-component TypeScript: `camelCase.ts` (`api.ts`, `queries.ts`, `useFirehose.ts`)
- Test files: co-located in `__tests__/` subdirectories (e.g., `components/panels/__tests__/`)

**Python Identifiers:**
- Classes: `PascalCase` (`FastAPIAppBuilder`, `JWTAuthService`)
- Functions/methods: `snake_case` (`create_app`, `run_one_cycle`, `claim_pending_tasks`)
- Constants: `UPPER_SNAKE_CASE` (`MAX_CONCURRENT`, `QUEUE_ROOT_REL`)
- Module-level loggers: `log = logging.getLogger(__name__)`

## Where to Add New Code

**New API endpoint (new resource domain):**
- Router: `backend/cmc/api/routes/{domain}.py` (new file)
- Schema: `backend/cmc/api/schemas/{domain}.py` (new file)
- Register router: add to `all_routers()` list in `backend/cmc/api/routes/__init__.py`
- Frontend types: add interfaces to `frontend/src/lib/api.ts`
- Frontend hook: add hook + query key to `frontend/src/lib/queries.ts`

**New API endpoint (existing resource):**
- Add route handler to existing `backend/cmc/api/routes/{domain}.py`
- Add schema types to existing `backend/cmc/api/schemas/{domain}.py`
- Add fetcher function to `frontend/src/lib/api.ts`
- Add query hook to `frontend/src/lib/queries.ts`

**New database model:**
- Create `backend/cmc/db/models/{name}.py` with SQLModel class
- Import in Alembic's `env.py` (or the initial migration) so metadata is visible
- Add Alembic migration under `backend/migrations/versions/`

**New panel component:**
- Create `frontend/src/components/panels/{PanelName}.tsx`
- Export from `frontend/src/components/panels/index.ts`
- Hook into existing query from `queries.ts` or add a new hook there
- Add to the appropriate route file (`routes/index.tsx` or `routes/activity.tsx`)

**New UI primitive:**
- Create `frontend/src/components/ui/{ComponentName}.tsx`
- Export from `frontend/src/components/ui/index.ts`

**New dispatcher capability:**
- Add module to `backend/cmc/dispatcher/{feature}.py`
- Call from `heartbeat.run_one_cycle()` or from `run_stream.py`/`run_classic.py`

**New middleware:**
- Create `backend/cmc/middleware/{name}.py`
- Export from `backend/cmc/middleware/__init__.py`
- Register in `FastAPIAppBuilder.setup_middleware()` (`backend/cmc/app/factory.py`)

**New Settings field:**
- Add to `Settings` class in `backend/cmc/config/settings.py`
- If path-shaped: add field name to `_resolve_repo_root_paths` validator
- Document in `backend/.env.example`

## Special Directories

**`.tmp/mission-control-queue/`:**
- Purpose: Cross-process JSONL file bus
- Generated: Yes, at runtime
- Committed: No — gitignored; created lazily by `core/queue.py`

**`data/`:**
- Purpose: SQLite database files
- Generated: Yes, at runtime (migrated on app startup)
- Committed: No — gitignored (`.db`, `.db-shm`, `.db-wal`)

**`frontend/dist/`:**
- Purpose: Production-built SPA served by `SPAStaticFiles`
- Generated: Yes (`cd frontend && npm run build`)
- Committed: No — gitignored

**`frontend/.tanstack/`:**
- Purpose: TanStack Router codegen cache
- Generated: Yes
- Committed: No

**`.planning/`:**
- Purpose: GSD planning artifacts (milestones, phases, codebase maps)
- Generated: By GSD commands
- Committed: Yes

**`.claude/`:**
- Purpose: Claude Code slash commands, agent configs, hooks
- Generated: Partially (some files are authored, some generated)
- Committed: Yes

---

*Structure analysis: 2026-05-02*
