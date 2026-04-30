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

## Makefile Usage

The root `Makefile` is the preferred command surface for day-to-day development and
release checks. It wraps the existing backend, frontend, installer, and `cmc` CLI
commands without replacing them.

Start by listing available targets:

```bash
make help
```

Common workflows:

```bash
make setup              # install backend and frontend development dependencies
make dev-backend        # run FastAPI on 127.0.0.1:8765
make dev-frontend       # run Vite on 127.0.0.1:5173
make test               # run backend and frontend unit tests
make lint               # run backend ruff checks and frontend typecheck
make check              # run lint, tests, frontend build, and installer dry-run
make build              # build frontend assets and backend package artifacts
make install-dry-run    # smoke check installer without writing files
```

Operational targets delegate to `scripts/cmc` and honor `CMC_HOME`:

```bash
make doctor
make setup-otel
make setup-telegram
make start
make status
make logs
make sync
make stop
```

Useful overrides:

```bash
make dev-backend PORT=9000
make test-backend PYTEST_ARGS="-x tests/test_phase1_boot.py"
make lint-backend RUFF_ARGS="cmc/api"
make install INSTALL_PREFIX="$HOME/.command-centre"
make status CMC_HOME="$HOME/.command-centre"
```

## Local Development

Install backend dependencies:

```bash
cd backend
uv sync --extra dev
```

Install frontend dependencies:

```bash
cd frontend
pnpm install
```

Run the backend API:

```bash
cd backend
uv run uvicorn cmc.app.factory:create_app --factory --host 127.0.0.1 --port 8765
```

Run the frontend dev server in another terminal:

```bash
cd frontend
pnpm run dev
```

The Vite dev server runs on `http://127.0.0.1:5173` and proxies `/api` requests to
`http://127.0.0.1:8765`.

For a production-style local build, build the frontend first and then start the backend.
FastAPI mounts `frontend/dist` at `/` when `index.html` exists.

```bash
cd frontend
pnpm run build

cd ../backend
uv run uvicorn cmc.app.factory:create_app --factory --host 127.0.0.1 --port 8765
```

## macOS Install And CLI

The installer can run in development mode against this checkout or install into
`~/.command-centre`.

```bash
# Use the repo as the install root.
bash scripts/install.sh

# Install a copy into ~/.command-centre.
bash scripts/install.sh --install
```

After installation, use the `cmc` CLI:

```bash
cmc doctor          # health checks for Python, Claude, settings, port, API, launchd, Telegram
cmc setup otel      # add Claude Code OTEL env keys to ~/.claude/settings.json
cmc setup telegram  # optional BotFather setup wizard
cmc start           # start server, dispatcher, and Telegram daemons
cmc status          # show launchd status
cmc logs            # tail daemon logs
cmc sync            # trigger POST /api/sync
cmc stop            # stop daemons
```

## Configuration

Configuration is loaded with pydantic-settings from dotenv files and process
environment variables. All settings have defaults, so CMC can run without any
`.env` file.

`backend/.env.example` is the template and reference. It is not read at runtime.
Copy the values you want to override into the active `.env` file for the mode
you are using.

### Development `.env`

Local development commands in this README and the Makefile run the backend from
the `backend/` directory, so the active development dotenv file is
`backend/.env`.

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` only when you need to override defaults such as `PORT`,
`DB_PATH`, `JSONL_ROOT`, JWT settings, metrics, or rate limiting. Paths like
`DB_PATH`, `STATIC_DIR`, and `ALEMBIC_INI_PATH` are still resolved relative to
the repository root by `Settings`, not relative to `backend/`.

### Production Release `.env`

When installed with:

```bash
bash scripts/install.sh --install
```

CMC installs into `~/.command-centre` and creates `~/.command-centre/.env` if it
does not already exist. Re-running the installer preserves that file, so local
secrets and operational overrides are not overwritten.

For a production-style release install, put overrides in:

```bash
~/.command-centre/.env
```

The launchd jobs run with `~/.command-centre` as their working directory, so
that file is loaded as both the current `.env` and the install-mode env file.
The optional Telegram wizard also writes its values there:

```bash
cmc setup telegram
```

If both `backend/.env` and `~/.command-centre/.env` are visible to a process,
the install-mode file has dotenv precedence. Shell environment variables still
override dotenv values.

Common settings:

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
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_ALLOWED_USER_IDS=
ANTHROPIC_API_KEY=
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

Backend:

```bash
cd backend
uv run pytest
uv run ruff check cmc tests
```

Frontend:

```bash
cd frontend
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run test:e2e
```

Installer smoke check:

```bash
bash scripts/install.sh --dry-run
```

## Operational Notes

- The app is intentionally localhost-only by default. Do not bind it to `0.0.0.0`
  without adding an authentication layer.
- `data/cmc.db` is local state and is ignored by git.
- Re-running `scripts/install.sh --install` preserves installed state such as
  `.env` and `data/cmc.db`.
- Telegram is optional; when no bot token is configured, Telegram daemons no-op.
- The dispatcher honors the emergency stop flag before claiming tasks.
