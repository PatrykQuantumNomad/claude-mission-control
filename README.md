# Claude Mission Control

Claude Mission Control is a local macOS dashboard and automation layer for Claude Code.
It ingests Claude Code session transcripts and OpenTelemetry events, stores them in a
local SQLite database, exposes a FastAPI API, and serves a Vite/React dashboard for
monitoring sessions, tool usage, tasks, schedules, skills, MCP activity, and Telegram
interactions.

The project is designed to run locally on `127.0.0.1:8765`, with optional launchd
daemons for the API server, dispatcher, and Telegram notifier/handler.

## What It Does

- Tracks Claude Code sessions from `~/.claude/projects/*/*.jsonl`.
- Accepts Claude Code OTLP HTTP exports on `/v1/logs` and `/v1/metrics`.
- Shows live and historical dashboard panels for sessions, token usage, tool latency,
  failures, project rollups, MCP usage, and productivity signals.
- Provides HITL workflows: decisions, inbox messages, task creation, approvals,
  reruns, schedules, and emergency stop/resume.
- Dispatches local Claude tasks through a launchd heartbeat.
- Scans personal/project skills and MCP tool activity.
- Optionally sends Telegram notifications and routes Telegram replies/callbacks back
  into the local API.

## Architecture

```text
Claude Code
  |-- JSONL transcripts --> backend ingestion loop --> SQLite
  |-- OTLP HTTP logs/metrics --> /v1/logs, /v1/metrics --> SQLite

FastAPI backend
  |-- /api/* JSON APIs
  |-- /v1/* OTLP ingest endpoints
  |-- serves frontend/dist in production

React dashboard
  |-- /          command dashboard
  |-- /activity  historical activity and session tables
  |-- /skills    decisions, inbox, tasks, schedules, skills, MCP

launchd daemons
  |-- com.cmc.server
  |-- com.cmc.dispatcher
  |-- com.cmc.telegram-notifier
  |-- com.cmc.telegram-handler
```

## Repository Map

```text
backend/
  cmc/
    app/          FastAPI app factory, lifespan, launchd plist renderer
    api/          API routers and Pydantic response schemas
    cli/          doctor, OTEL setup, Telegram setup helpers
    config/       pydantic-settings configuration
    core/         logging, paths, errors, static file helpers, process utilities
    db/           SQLModel models, engine/session helpers
    dispatcher/   task claim/materialize/run heartbeat and Claude subprocess runners
    ingest/       Claude JSONL parser, OTLP parser, sync scheduler
    mcp/          MCP usage aggregation
    schedules/    cron and natural-language schedule helpers
    skills/       SKILL.md scanner
    tasks/        subprocess spawn/transition helpers
    telegram/     Telegram API wrappers, notifier, handler, callback routing
  migrations/     Alembic migrations
  tests/          pytest suite

frontend/
  src/
    components/   dashboard panels, shell, and shared UI primitives
    lib/          typed API client, React Query hooks, storage, theme utilities
    routes/       TanStack Router pages
    test/         frontend test setup and render helpers

scripts/
  install.sh      one-command macOS installer / dev setup
  cmc             local CLI dispatcher
  start.sh        launchd bootstrap wrapper
  stop.sh         launchd bootout wrapper
  doctor.py       shim to cmc.cli.doctor
  setup_otel.py   shim to cmc.cli.setup_otel
  setup_telegram.py shim to cmc.cli.setup_telegram
```

## Requirements

- macOS with launchd for the full daemon workflow.
- Python 3.13 for the backend package.
- `uv` for backend development.
- Node.js and pnpm for the frontend.
- Claude Code CLI available as `claude` for dispatcher and Telegram relay features.

## Developer Workflow

The root `Makefile` is the primary command surface for day-to-day development,
checks, and local operations. It wraps the backend, frontend, installer, and
`cmc` CLI commands so you can work from the repository root.

Start by listing available targets when in doubt:

```bash
make help
```

First-time setup:

```bash
make setup
test -f backend/.env || cp backend/.env.example backend/.env  # optional
make hooks-install                    # optional but recommended
```

Run the app locally with two terminals:

```bash
# Terminal 1: FastAPI on http://127.0.0.1:8765
make dev-backend

# Terminal 2: Vite on http://127.0.0.1:5173
make dev-frontend
```

Useful development commands:

```bash
make sync               # trigger POST /api/sync against the local API
make doctor             # local health report
make test               # backend and frontend unit/component tests
make lint               # backend ruff/pyright and frontend typecheck
make pre-commit         # run configured pre-commit hooks across all files
make check              # broad readiness check: lint, security, tests, build, dry-run
make build              # build frontend assets and backend package artifacts
make install-dry-run    # smoke check installer without writing files
```

Useful overrides:

```bash
make dev-backend PORT=9000
make test-backend PYTEST_ARGS="-x tests/test_phase1_boot.py"
make lint-backend RUFF_ARGS="cmc/api"
make install INSTALL_PREFIX="$HOME/.command-centre"
make status CMC_HOME="$HOME/.command-centre"
```

Operational targets delegate to `scripts/cmc` and honor `CMC_HOME`:

```bash
make setup-otel
make setup-telegram
make install-dev
make install
make start
make status
make logs
make stop
```

## Local Development

Use the Makefile flow from the repository root:

```bash
make setup
make dev-backend
make dev-frontend
```

The Vite dev server proxies `/api` requests to the backend, so open
`http://127.0.0.1:5173` for the dashboard.

The backend runs with `CMC_ENV=dev`, so it reads only `backend/.env`. The frontend
does not need a separate env file for the default local proxy setup.

For a production-style local build:

```bash
make build-frontend
make dev-backend
```

FastAPI mounts `frontend/dist` at `/` when `index.html` exists.

### Local Telegram Smoke Test

Telegram is optional and runs outside the backend/frontend dev servers. In local
development, `make setup-telegram` writes bot settings to `backend/.env`.

```bash
make setup-telegram
```

Restart the backend so it reloads `backend/.env`, then keep the frontend running
in another terminal:

```bash
make dev-backend
make dev-frontend
```

Start the inbound Telegram handler in a third terminal:

```bash
cd backend
uv run python -m cmc.telegram.oneshot_handler
```

Send the bot a message to test inbound relay. To test outbound notification cards,
create a pending decision and run one notifier cycle:

```bash
curl -sS -X POST http://127.0.0.1:8765/api/decisions \
  -H 'content-type: application/json' \
  -d '{"dedup_key":"telegram-smoke-1","prompt":"Telegram smoke test: choose yes or no","options":["yes","no"]}'

cd backend
uv run python -m cmc.telegram.oneshot_notifier
```

## macOS Install And CLI

The installer can run in development mode against this checkout or install into
`~/.command-centre`.

```bash
# Use the repo as the launchd root.
make install-dev

# Install a copy into ~/.command-centre.
make install
```

For a repo-root launchd install, use the Makefile:

```bash
make doctor          # health checks for Python, Claude, settings, port, API, launchd, Telegram
make setup-otel      # add Claude Code OTEL env keys to ~/.claude/settings.json
make setup-telegram  # BotFather wizard for backend/.env in dev mode
make start           # start server, dispatcher, and Telegram daemons
make status          # show launchd status
make logs            # tail daemon logs
make sync            # trigger POST /api/sync
make stop            # stop daemons
```

For an installed copy, call `cmc` directly or pass `CMC_HOME`:

```bash
cmc setup telegram
cmc start
cmc status

make status CMC_HOME="$HOME/.command-centre"
```

## Configuration And Env Files

Configuration is loaded with pydantic-settings from one dotenv file selected by
`CMC_ENV`, plus process environment variables. All settings have defaults, so CMC
can run without any `.env` file.

There is one checked-in env template:

- `backend/.env.example`: local template for server, database, security,
  observability, frontend, migration, ingestion, dispatcher, and Telegram
  settings.

The template is not read at runtime. Copy values you want to override into the
active env file for the mode you are using.

`CMC_ENV` isolates development and installed environments:

- `CMC_ENV=dev` reads only `backend/.env`.
- `CMC_ENV=install` reads only `~/.command-centre/.env`.
- If `CMC_ENV` is unset, backend code defaults to `dev`; launchd plists set
  `CMC_ENV=install`.
- Shell environment variables still override dotenv values.

### Development `.env`

Makefile development commands use `CMC_ENV=dev`, so the active dotenv file is
`backend/.env`.

```bash
cp backend/.env.example backend/.env
```

Most local runs need no edits. Common dev overrides are:

- `PORT`, `HOST`, and CORS/trusted-host settings for local network behavior.
- `DB_PATH` and `DB_ECHO` for SQLite location and SQL logging.
- `JSONL_ROOT`, `SESSION_IDLE_MINUTES`, and `OTLP_MAX_BODY_BYTES` for ingestion.
- `LOG_LEVEL`, `METRICS_ENABLED`, `OTEL_ENABLED`, and rate-limit settings while
  testing operational behavior.

Paths like `DB_PATH`, `STATIC_DIR`, and `ALEMBIC_INI_PATH` are resolved relative
to the repository root by `Settings`, not relative to `backend/`.

The dev Telegram wizard writes to `backend/.env`:

```bash
make setup-telegram
```

### Production Release `.env`

When installed with:

```bash
make install
```

CMC installs into `~/.command-centre` and creates `~/.command-centre/.env` if it
does not already exist. Re-running the installer preserves that file, so local
secrets and operational overrides are not overwritten.

For a production-style release install, put overrides in:

```bash
~/.command-centre/.env
```

The launchd jobs run with `~/.command-centre` as their working directory, so
their plists set `CMC_ENV=install` and load only `~/.command-centre/.env`. The
optional Telegram wizard also writes its values there when run from an installed
`cmc` command:

```bash
cmc setup telegram
```

The template intentionally keeps secrets blank or absent. Telegram setup appends
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and `TELEGRAM_ALLOWED_USER_IDS` to the
active env file. If you use Telegram relay through `claude -p` with an API key,
add `ANTHROPIC_API_KEY` to the active env file yourself.

Representative settings:

```bash
HOST=127.0.0.1
PORT=8765
DB_PATH=data/cmc.db
DB_ECHO=false
LOG_LEVEL=INFO
STATIC_DIR=frontend/dist
ALEMBIC_INI_PATH=backend/alembic.ini
JSONL_ROOT=~/.claude/projects
SESSION_IDLE_MINUTES=5
OTLP_MAX_BODY_BYTES=10000000
CLAUDE_BIN=/opt/homebrew/bin/claude
CLAUDE_DEFAULT_MODEL=sonnet
DISPATCHER_MAX_CONCURRENT=3
# Added by make setup-telegram or cmc setup telegram when Telegram is enabled:
# TELEGRAM_BOT_TOKEN=
# TELEGRAM_CHAT_ID=
# TELEGRAM_ALLOWED_USER_IDS=
# Optional for Telegram relay when using API-key auth:
# ANTHROPIC_API_KEY=
```

See `backend/.env.example` for the documented defaults and operational notes.

## Backend API

Ordinary application routes are mounted under `/api`; OTLP routes are mounted at
root because Claude Code exporters expect fixed paths.

Core route families:

- `/api/health`, `/api/system/*`, `/api/attention`
- `/api/sync`
- `/api/sessions*`
- `/api/usage/*`, `/api/tools/*`, `/api/hooks/*`, `/api/activity/*`
- `/api/mcp*`
- `/api/skills*`, `/api/context/health`
- `/api/decisions*`, `/api/inbox*`
- `/api/tasks*`, `/api/dispatcher/trigger`
- `/api/schedules*`
- `/api/notifications*`
- `/v1/logs`, `/v1/metrics`

OpenAPI is available at `http://127.0.0.1:8765/api/docs` when the backend is running.

## Database And Ingestion

The backend uses SQLite through SQLModel/SQLAlchemy async sessions. On startup, the
FastAPI lifespan creates the engine and runs Alembic migrations to head.

Ingestion has three entry points:

- boot-time sync when the API starts;
- periodic JSONL sync every 120 seconds;
- manual `POST /api/sync` through the API or `cmc sync`.

The JSONL sync scans one directory level under `JSONL_ROOT`, parses Claude Code session
files off the event loop, and upserts sessions, tools, and token usage. OTLP handlers
store log and metric records, returning `200 {}` for malformed batches after the body
is read so Claude Code does not disable telemetry for the session.

## Frontend

The frontend is a Vite app using React 19, TanStack Router, TanStack Query, Radix UI
primitives, Recharts, and Vitest.

Routes:

- `/` renders the command dashboard: health, KPIs, attention, live sessions, token
  usage, cache efficiency, outcomes, latency, MCP, and productivity panels.
- `/activity` renders historical activity: heatmap, charts, OTEL panel, failures,
  top skills, and session table.
- `/skills` renders decisions, inbox, task board, schedules, skills registry, MCP,
  skill cost, and context health.

The typed API surface lives in `frontend/src/lib/api.ts`; React Query wrappers live in
`frontend/src/lib/queries.ts`.

## Testing And Quality

Use Makefile targets from the repository root:

```bash
make test
make lint
make pre-commit
make check
```

Scope backend checks when iterating:

```bash
make test-backend PYTEST_ARGS="-x tests/test_foundation_boot.py"
make lint-backend RUFF_ARGS="cmc/config tests/test_foundation_boot.py"
```

Frontend-specific targets still live under `frontend/` when you need them:

```bash
cd frontend
pnpm run test:e2e
```

## Operational Notes

- The app is intentionally localhost-only by default. Do not bind it to `0.0.0.0`
  without adding an authentication layer.
- `data/cmc.db` is local state and is ignored by git.
- Re-running `scripts/install.sh --install` preserves installed state such as
  `.env` and `data/cmc.db`.
- Telegram is optional; when no bot token is configured, Telegram daemons no-op.
- The dispatcher honors the emergency stop flag before claiming tasks.
