# External Integrations

**Analysis Date:** 2026-05-02

## APIs & External Services

**Anthropic API:**
- Service: Anthropic Claude API — used for NL→cron expression conversion and skill routing decisions
  - SDK/Client: `anthropic==0.97.0` (`AsyncAnthropic`)
  - Auth: `ANTHROPIC_API_KEY` env var (loaded via Settings, never from bare `os.environ` in daemons)
  - Used in: `backend/cmc/schedules/nlcron.py` (claude-haiku-4-5 model), `backend/cmc/dispatcher/skill_router.py`
  - Note: Lazy import pattern — module import does NOT require key to be set; returns `None`/503 gracefully when unset

**Claude CLI (subprocess):**
- Purpose: Dispatcher spawns the local `claude` CLI binary to execute tasks
  - Binary path: Configured via `CLAUDE_BIN` setting (default `/opt/homebrew/bin/claude`)
  - Invoked as: `claude -p PROMPT --bare --output-format json --model MODEL` (classic mode)
  - Stream mode: bidirectional NDJSON via stdin/stdout pipes
  - Security: `ANTHROPIC_API_KEY` is scrubbed from child process env before spawn (Pitfall 8)
  - Relevant files: `backend/cmc/dispatcher/run_classic.py`, `backend/cmc/dispatcher/run_stream.py`

**Telegram Bot API:**
- Purpose: Push notifications for pending decisions, approvals, task failures, overdue schedules, inbox messages; relay text messages to Claude CLI
  - API base: `https://api.telegram.org/bot{token}`
  - Client: Custom thin wrapper using `httpx.AsyncClient` (`backend/cmc/telegram/api.py`)
  - Auth: `TELEGRAM_BOT_TOKEN` env var
  - Methods used: `getMe`, `sendMessage`, `getUpdates`, `answerCallbackQuery`, `editMessageReplyMarkup`
  - Plain text only — NO `parse_mode` parameter (avoids 400 errors from unescaped Markdown in DB content)
  - Components: `backend/cmc/telegram/notifier.py`, `backend/cmc/telegram/handler.py`, `backend/cmc/telegram/api.py`
  - Required config: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, optionally `TELEGRAM_ALLOWED_USER_IDS`

**OpenTelemetry (OTLP/HTTP):**
- Purpose: Distributed tracing export from the backend; also receives OTLP logs/metrics from Claude Code as inbound data
  - Outbound (tracing): OTLPSpanExporter to configurable endpoint, default `http://localhost:4318/v1/traces`
  - Inbound (data ingestion): `POST /v1/logs` and `POST /v1/metrics` endpoints receive OTLP JSON from Claude Code's exporter
  - Config: `OTEL_ENABLED`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`
  - Auto-instrumented: FastAPI, httpx, SQLAlchemy
  - Relevant files: `backend/cmc/observability/tracing.py`, `backend/cmc/api/routes/ingest.py`, `backend/cmc/ingest/otel_parser.py`

## Data Storage

**Databases:**
- SQLite (WAL mode)
  - Connection: `DB_PATH` env var (default `data/cmc.db`, resolved relative to repo root)
  - Client: SQLAlchemy `2.0.49` async engine + SQLModel + aiosqlite
  - Engine file: `backend/cmc/db/engine.py`
  - Pragmas applied at connect: WAL mode, foreign keys ON, busy timeout 5000ms, synchronous=NORMAL
  - Migrations: Alembic (`backend/migrations/`, `backend/alembic.ini`)
  - Models: `backend/cmc/db/models/` (sessions, tools, token_usage, tasks, decisions, schedules, skills, inbox, otel_events, otel_metrics, mcp_stats, activities, notification_log, system_state, live_state)
  - Constraint: Local filesystem only — WAL does NOT work on NFS or iCloud

**File Storage:**
- Claude Code JSONL transcripts: `~/.claude/projects` (default, configurable via `JSONL_ROOT`)
  - The backend scrapes these files for session/tool/token data
  - Ingestion: `backend/cmc/ingest/jsonl_parser.py`, `backend/cmc/ingest/scheduler.py`

**Caching:**
- Redis (optional) — available as `redis` package extra (`uv sync --extra redis`)
  - Used for rate limiting storage in multi-process deployments
  - Configured via `RATE_LIMIT_STORAGE_URL` (Redis URL)
  - Falls back to in-memory `MemoryRateLimitStore` when not configured
  - Relevant file: `backend/cmc/middleware/rate_limit.py`

## Authentication & Identity

**Auth Provider:**
- Custom stateless JWT validation (opt-in, disabled by default)
  - `AUTH_ENABLED=false` by default — no auth in local development
  - Implementation: `backend/cmc/auth/service.py` (`JWTAuthService`)
  - Supports three modes:
    1. Shared secret (HS256): `AUTH_JWT_SECRET` env var
    2. Static public key (RS256/ES256): `AUTH_JWT_PUBLIC_KEY` env var
    3. JWKS endpoint: `AUTH_JWKS_URL` env var with TTL cache (default 300s, stale up to 3600s)
  - Config: `AUTH_JWT_ALGORITHMS`, `AUTH_JWT_AUDIENCE`, `AUTH_JWT_ISSUER`, `AUTH_REQUIRE_EXP`, `AUTH_CLOCK_SKEW_SECONDS`
  - Telegram allowlist: `TELEGRAM_ALLOWED_USER_IDS` — CSV of Telegram user IDs that can relay messages to Claude

## Monitoring & Observability

**Prometheus Metrics (optional):**
- Enabled via `METRICS_ENABLED=true`
- Scrape endpoint: `GET /metrics`
- Middleware: `starlette-exporter` `PrometheusMiddleware`
- Includes: request count, latency, body sizes; app info gauge
- Config prefix: `METRICS_PREFIX` (default `cmc`)
- Relevant file: `backend/cmc/observability/metrics.py`

**OpenTelemetry Tracing (optional):**
- Enabled via `OTEL_ENABLED=true`
- Exporter: OTLP/HTTP protobuf to `OTEL_EXPORTER_OTLP_ENDPOINT`
- Auto-instruments: FastAPI routes, httpx calls, SQLAlchemy queries
- Service name: `OTEL_SERVICE_NAME` (default `claude-mission-control`)
- Relevant file: `backend/cmc/observability/tracing.py`

**Structured Logging:**
- Library: `structlog 25.5.0`
- Format: `LOG_FORMAT=text` (default) or `json`
- Level: `LOG_LEVEL=INFO` (default)
- Backend configuration: `backend/cmc/core/logging.py`

**Health Endpoints:**
- `GET /healthcheck` — Basic health check
- `GET /ready` — Readiness check (database connectivity, auth service, optional details)

## CI/CD & Deployment

**Hosting:**
- macOS local machine — launchd daemons for persistent background services
- Install location: `~/.command-centre/`
- Plist templates: `backend/cmc/app/templates/`, `backend/cmc/telegram/templates/`, `backend/cmc/dispatcher/templates/`

**CI Pipeline:**
- None (no GitHub Actions or other CI configured in this repo)
- Pre-commit hooks run locally: pyright typecheck, ruff lint (backend), tsc typecheck (frontend)
- Pre-commit config: `/.pre-commit-config.yaml`

**Build pipeline:**
- Frontend: `pnpm build` → `tsc -b && vite build` → outputs to `frontend/dist/`
- Backend: served directly from source via uvicorn in dev; `uv` manages venv in `backend/.venv/`

## Webhooks & Callbacks

**Incoming:**
- `POST /v1/logs` — Receives OTLP JSON log batches from Claude Code's OpenTelemetry exporter
- `POST /v1/metrics` — Receives OTLP JSON metric batches from Claude Code
- Telegram long-poll (NOT a webhook): the `cmc.telegram.oneshot_handler` daemon uses `getUpdates` long-polling (25s timeout), not a registered webhook endpoint

**Outgoing:**
- Telegram Bot API: `https://api.telegram.org/bot{token}/sendMessage` etc. — push notifications
- Self (localhost): The Telegram notifier calls `GET http://127.0.0.1:8765/api/inbox` internally for HTTP-symmetric inbox discovery

## Environment Configuration

**Required env vars (non-default features):**
- `ANTHROPIC_API_KEY` — NL→cron and Telegram→Claude relay (gracefully degrades when unset)
- `TELEGRAM_BOT_TOKEN` — Telegram bot; Telegram integration disabled when not set
- `TELEGRAM_CHAT_ID` — Target chat for notifications
- `AUTH_JWT_SECRET` or `AUTH_JWKS_URL` or `AUTH_JWT_PUBLIC_KEY` — Required when `AUTH_ENABLED=true`
- `OTEL_EXPORTER_OTLP_ENDPOINT` — Required when `OTEL_ENABLED=true`
- `RATE_LIMIT_STORAGE_URL` — Redis URL for multi-process rate limiting

**Secrets location:**
- Dev: `backend/.env` (gitignored)
- Install: `~/.command-centre/.env`
- Example template: `backend/.env.example`

---

*Integration audit: 2026-05-02*
