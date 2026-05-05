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

## Pricing And Cost Engine

The cost engine in `backend/cmc/pricing.py` reads token rates from `data/pricing.json`
and seeds them into the `pricing` SQLite table. `compute_cost(model, input, output,
cache_read, cache_create_5m, cache_create_1h)` returns a `Decimal` and is the single
source of truth for cost numbers across `/api/cost/*`, the Skills page, and
`/sessions/compare`.

### Pricing seed workflow

`data/pricing.json` is the project file you maintain. The source of truth is the
public Anthropic pricing page (`https://platform.claude.com/docs/en/about-claude/pricing`),
echoed in `pricing.json` as `source_url` and a `published_at` date.

The seed runs automatically on FastAPI lifespan startup — there is no separate
`cmc pricing seed` command. To refresh rates:

```bash
# 1. Edit data/pricing.json (bump published_at, update model rates).
# 2. Restart the server so the lifespan hook re-runs.
make stop && make start            # installed copy
# or just restart `make dev-backend` in development.
```

The lifespan loader (`cmc.pricing.load_seed`) is idempotent: it computes the SHA-256
of `data/pricing.json` and stores it as `seed_hash` on each pricing row. Re-running
with an unchanged file is a no-op. When `published_at` advances, the previously
active row's `effective_until` is closed and a new row is inserted with
`effective_from = published_at`, giving point-in-time-accurate retroactive cost math.

### Doctor checks for pricing

`cmc doctor` (see [Doctor And Health Checks](#doctor-and-health-checks)) surfaces
three pricing-related signals:

- **Pricing freshness** (check 9): warns when the newest `effective_from` is more
  than 30 days old. Refresh `data/pricing.json` when this fires.
- **pricing.json hash drift** (check 11): warns when the on-disk SHA-256 differs
  from the `seed_hash` stored on the most recent active pricing row. This means
  someone edited `pricing.json` without restarting the server. Restart to re-seed.
- **Unmapped models in otel_events** (check 13): warns when a `model` attribute on
  a recent `api_request` event has no matching row in `pricing`. Add the missing
  SKU to `data/pricing.json` and restart.

## Observability And OTEL Spike

Claude Code emits OpenTelemetry logs/metrics through the OTLP HTTP endpoints
(`/v1/logs`, `/v1/metrics`). The Mission Control dashboard reads these events from
the `otel_events` table to attribute cost, latency, and skill activations.

### `OTEL_LOG_TOOL_DETAILS`

Setting `OTEL_LOG_TOOL_DETAILS=1` in the environment Claude Code inherits is
required for the dashboard to attribute plugin and marketplace skill activations
correctly. When unset, plugin skill activation events emit `tool_name` but not
`skill_name`, so the Skills page falls back to `<unknown>` for those rows.

`cmc doctor` (check 14) warns when this env var is unset. The warning is
informational, not a hard failure: plain CLI / non-plugin workflows do not depend
on it. The setting can be added to `~/.claude/settings.json` via
`make setup-otel`, or exported in your shell profile.

### Phase 12 OTEL spike

The Phase 12 spike documented at [`.planning/research/SPIKE.md`](./.planning/research/SPIKE.md)
captures what the dashboard relies on from Claude Code OTEL output (verified
against `claude-code 2.1.116`):

- The cache TTL split (5-minute vs 1-hour `cache_creation` writes) is **JSONL-only**
  at this version — `api_request` OTEL events carry the aggregate
  `cache_creation_tokens`, but the 5m/1h split lives only on JSONL
  `message.usage.cache_creation.ephemeral_{5m,1h}_input_tokens`. The cost engine
  joins via OTEL `request_id` ↔ JSONL `requestId`.
- Session correlation key on OTEL events is `session.id` (dotted), not
  `session_id` (underscore).
- Skill-event attribute keys (`skill_name`, `duration_ms`) are tentative pending
  a re-run with the OTLP exporter env vars set in the spawned `claude` session.

See `SPIKE.md` for the full lock list, evidence, and Phase 13 follow-up
instructions. Future minor Claude Code versions trigger a re-run; check 10 of
`cmc doctor` (when added) flags `service.version` drift.

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
- `/skills/$name` (v1.1) renders a per-skill detail page with cost, latency, and
  recent activations.
- `/alerts` (v1.1) renders threshold/anomaly alert rules and firing history.
- `/sessions/compare?a=&b=` (v1.1) renders a two-up session diff.

The typed API surface lives in `frontend/src/lib/api.ts`; React Query wrappers live in
`frontend/src/lib/queries.ts`.

### v1.1 Dashboard Panels

An external companion guide (`build-your-own-dashboard-guide.html`) covers a subset
of these topics from a different angle and is maintained outside this repo.

#### `/alerts`

Threshold and anomaly alert rules with firing history.

- **Rules list** (`AlertRulesList`): table of configured rules with an enabled/disabled
  toggle and a Delete action. Toggle round-trips through `PATCH /api/alerts/rules/{id}`
  with a surgical optimistic update gated to `enabled`-only single-field changes.
- **Composer** (`AlertRuleForm`): two-tab segmented control (Threshold / Anomaly) that
  maps the Pydantic v2 discriminated union on `kind`. Threshold rules require
  `threshold_fire`; anomaly rules require `min_samples` and `params_json.window_n`
  with z-score defaults (fire=3.0 / clear=1.5).
- **Events history** (`AlertEventsList`): fired_at / rule / scope / status (Firing /
  Cleared) / value, with a 4-tier range toggle (1d / 7d / 14d / 30d) persisted under
  `alert-events-range`.
- **Acknowledgement**: v1.1 uses Telegram callback (`POST /api/alerts/_ack`) only —
  there is no in-UI Ack button.

Route file: `frontend/src/routes/alerts.tsx`. Backend routes live under
`/api/alerts/*` (see [Backend API](#backend-api)).

#### `/sessions/compare?a=&b=`

Two-up session diff. The URL is deep-linkable; both query parameters are validated as
UUIDs (anything else is stripped to `undefined`).

- Two entry points: per-row Compare button in `SessionsTable`, and a context-aware
  Cmd+K "Compare with…" action that opens a `ComparePicker` Sheet.
- Renders KPI strips (cost / tokens / tool calls / duration / model) per side, plus a
  side-by-side bar chart, a skill-set diff (SHARED / ONLY A / ONLY B), and a
  tool-counts diff with a delta column.
- Falls back to summary-only when either session has more than 500 tool calls
  (`SESSION_COMPARE_CAP=500`); KPI strips and token charts still render, only the
  tool-counts diff is replaced with an `EmptyState`.
- All diffs are tabular — no character-level diff library is loaded.

Route file: `frontend/src/routes/sessions_.compare.tsx`. Backend handler lives at
`GET /api/sessions/compare?a=&b=`.

#### `/skills` and `/skills/$name`

Per-skill cost and latency surfaces (Phase 13 / 14):

- The `/skills` page renders a top-skills table with cost and p95 latency columns.
- `/skills/$name` deep-links to a per-skill detail page driven by the skill name in
  the URL. The page renders cost, latency percentiles, and recent activations.

See [Pricing And Cost Engine](#pricing-and-cost-engine) for the cost computation
pipeline and the [OTEL spike](#observability-and-otel-spike) for the env var that
gates plugin/marketplace skill attribution.

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

## Doctor And Health Checks

`cmc doctor` (or `make doctor`) runs a sequence of local health checks and prints a
single-screen report. The current set covers Python and Claude CLI presence,
`~/.claude/settings.json` validity, the JSONL projects root, port `8765` availability,
the `/api/health` endpoint, launchd job state, Telegram configuration, pricing
freshness and drift, unpriced tokens, OTEL session-id NULL count, unmapped OTEL
models, and the `OTEL_LOG_TOOL_DETAILS` env var (see
[Observability And OTEL Spike](#observability-and-otel-spike)).

Run `cmc doctor --help` for the canonical list and exit-code semantics. The CLI
returns non-zero only when at least one check fails; warnings are informational and
do not block startup.

## Operational Notes

- The app is intentionally localhost-only by default. Do not bind it to `0.0.0.0`
  without adding an authentication layer.
- `data/cmc.db` is local state and is ignored by git.
- Re-running `scripts/install.sh --install` preserves installed state such as
  `.env` and `data/cmc.db`.
- Telegram is optional; when no bot token is configured, Telegram daemons no-op.
- The dispatcher honors the emergency stop flag before claiming tasks.
