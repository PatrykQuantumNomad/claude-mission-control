# External Integrations

**Analysis Date:** 2026-05-02

## APIs & External Services

**Anthropic / Claude:**
- Anthropic Messages API (Claude Haiku 4.5) — NL→cron conversion via `backend/cmc/schedules/nlcron.py`
  - SDK/Client: `anthropic` 0.97.0 (`AsyncAnthropic`)
  - Auth: `ANTHROPIC_API_KEY` env var (optional; feature returns 503 when unset)
- Claude CLI subprocess — task dispatcher invokes the local `claude` binary directly via `subprocess.Popen`
  - Configuration: `CLAUDE_BIN` (default `/opt/homebrew/bin/claude`), `CLAUDE_DEFAULT_MODEL` (default `sonnet`)
  - Used by: `backend/cmc/dispatcher/run_classic.py`, `backend/cmc/dispatcher/run_stream.py`
  - Security: `ANTHROPIC_API_KEY` is explicitly scrubbed from the child process env for subscription-auth runs (Pitfall P8)

**Telegram Bot API:**
- Telegram Bot API (api.telegram.org) — human-in-the-loop notifications and command relay
  - SDK/Client: custom thin wrapper using `httpx` (`backend/cmc/telegram/api.py`)
  - Auth: `TELEGRAM_BOT_TOKEN` env var (BotFather token)
  - Endpoints used: `getMe`, `getUpdates` (long-poll), `sendMessage`, `answerCallbackQuery`, `editMessageReplyMarkup`
  - User-to-Claude relay via `claude -p` subprocess launched by `backend/cmc/telegram/handler.py`
  - Poll loop: `TELEGRAM_POLL_TIMEOUT_S=25` (kept under 30s for launchd cycle compatibility)
  - Notifier: `TELEGRAM_NOTIFIER_INTERVAL_S=30`
  - Access control: `TELEGRAM_ALLOWED_USER_IDS` (CSV or JSON array) restricts which Telegram user IDs can relay commands

## Data Storage

**Databases:**
- SQLite (WAL mode) — single local file, all application data
  - Connection: `DB_PATH` env var (default `data/cmc.db`, resolved relative to repo root)
  - Client: SQLAlchemy 2.0 async + aiosqlite driver (`sqlite+aiosqlite:///`)
  - Engine: `backend/cmc/db/engine.py` (WAL, foreign keys ON, busy_timeout=5000, synchronous=NORMAL)
  - ORM: SQLModel 0.0.38
  - Migrations: Alembic 1.18.4 (`backend/alembic.ini`, `backend/migrations/`)
  - Models: `backend/cmc/db/models/` (activities, decisions, inbox, live_state, mcp_stats, notification_log, otel_events, otel_metrics, schedules, sessions, skills, system_state, tasks, token_usage, tools)
  - Constraint: WAL mode does NOT work on NFS or iCloud-synced paths

**File Storage:**
- Local filesystem — Claude Code JSONL session transcripts
  - Location: `JSONL_ROOT` env var (default `~/.claude/projects`)
  - Consumed by: `backend/cmc/ingest/jsonl_parser.py`, `backend/cmc/ingest/scheduler.py`
  - Pattern: glob `*/*.jsonl` (one level only — subagents excluded)

**Caching:**
- In-memory — rate limit buckets (`MemoryRateLimitStore` in `backend/cmc/middleware/rate_limit.py`)
- Optional Redis — for multi-process rate limit storage (`RATE_LIMIT_STORAGE_URL`; requires `redis` optional dependency)
- In-memory — JWKS cache in `backend/cmc/auth/service.py` (`AUTH_JWKS_CACHE_TTL_SECONDS=300`, `AUTH_JWKS_MAX_STALE_SECONDS=3600`)

## Authentication & Identity

**Auth Provider:**
- Optional — disabled by default (`AUTH_ENABLED=false`)
- JWT resource-server mode: validates externally issued JWTs
  - Implementation: `backend/cmc/auth/service.py` (`JWTAuthService`)
  - Supported strategies: shared secret (HS256), static RSA/EC public key, or remote JWKS
  - Config: `AUTH_JWT_SECRET`, `AUTH_JWT_PUBLIC_KEY`, `AUTH_JWKS_URL`, `AUTH_JWT_AUDIENCE`, `AUTH_JWT_ISSUER`
  - Library: `pyjwt` >=2.12.1 + `cryptography` >=47.0.0
  - Dependencies: `backend/cmc/auth/dependencies.py`, `backend/cmc/auth/models.py`

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry or equivalent detected)

**Metrics:**
- Prometheus — optional (`METRICS_ENABLED=false` default)
  - Endpoint: `GET /metrics`
  - Middleware: `starlette-exporter` (`PrometheusMiddleware`)
  - Setup: `backend/cmc/observability/metrics.py`

**Distributed Tracing:**
- OpenTelemetry — optional (`OTEL_ENABLED=false` default)
  - Exporter: OTLP/HTTP (`OTEL_EXPORTER_OTLP_ENDPOINT`, default `http://localhost:4318/v1/traces`)
  - Auto-instrumented: FastAPI, httpx, SQLAlchemy
  - Setup: `backend/cmc/observability/tracing.py`
  - Service name: `OTEL_SERVICE_NAME` (default `claude-mission-control`)

**Logs:**
- Structured logging via `structlog` 25.5.0
- Format: text (dev) or JSON (`LOG_FORMAT=json`) — configured in `backend/cmc/core/logging.py`
- Level: `LOG_LEVEL` (default `INFO`)
- OTLP log/metric ingestion endpoints: `POST /v1/logs`, `POST /v1/metrics` (Prometheus-compatible ingest, handled by `backend/cmc/api/routes/observability.py`)

## CI/CD & Deployment

**Hosting:**
- macOS local machine — daemon processes managed by launchd
- Install prefix: `~/.command-centre/`
- Plist templates generated for:
  - App server: `backend/cmc/app/templates/com.cmc.server.plist.j2`
  - Dispatcher: `backend/cmc/dispatcher/templates/com.cmc.dispatcher.plist.j2`
  - Telegram handler: `backend/cmc/telegram/templates/com.cmc.telegram-handler.plist.j2`
  - Telegram notifier: `backend/cmc/telegram/templates/com.cmc.telegram-notifier.plist.j2`
- Scripts: `scripts/cmc` (install/uninstall/status CLI)

**CI Pipeline:**
- None detected in repository

**Build artifacts:**
- Frontend SPA: `frontend/dist/` (Vite build output, served as static files by FastAPI)
- Backend wheel/sdist: via `uv build` (hatchling)

## Environment Configuration

**Required env vars (none are strictly required — all have defaults):**
- `TELEGRAM_BOT_TOKEN` — required only to enable Telegram integration
- `ANTHROPIC_API_KEY` — required only for NL→cron conversion and Telegram→Claude relay
- `CLAUDE_BIN` — override when `claude` is not at `/opt/homebrew/bin/claude`
- `AUTH_JWT_SECRET` or `AUTH_JWT_PUBLIC_KEY` or `AUTH_JWKS_URL` — required if `AUTH_ENABLED=true`

**Secrets location:**
- Dev: `backend/.env` (gitignored)
- Install: `~/.command-centre/.env` (user home directory)
- Template reference: `backend/.env.example`

## Webhooks & Callbacks

**Incoming:**
- `POST /v1/logs` — OTLP log ingestion (max body: `OTLP_MAX_BODY_BYTES`, default 10MB)
- `POST /v1/metrics` — OTLP metric ingestion (same size limit)
- These are documented in `backend/cmc/api/routes/ingest.py` and `backend/cmc/api/routes/observability.py`

**Outgoing:**
- Telegram Bot API long-poll (`getUpdates`) from daemon running `backend/cmc/telegram/handler.py`
- Local HTTP POST to `http://127.0.0.1:8765/api/inbox` from dispatcher (`backend/cmc/dispatcher/inbox_post.py`) for INBOX markers
- Anthropic API calls from `backend/cmc/schedules/nlcron.py` (on-demand, per NL→cron request)

---

*Integration audit: 2026-05-02*
