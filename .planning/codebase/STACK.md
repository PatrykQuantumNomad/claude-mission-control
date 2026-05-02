# Technology Stack

**Analysis Date:** 2026-05-02

## Languages

**Primary:**
- Python 3.13+ — backend API server, dispatcher, ingest, CLI
- TypeScript 6.0 — frontend SPA (strict mode, ES2022 target)

**Secondary:**
- SQL — SQLite schema via SQLModel/Alembic migrations

## Runtime

**Backend Environment:**
- Python >=3.13 (pinned in `backend/pyproject.toml`)
- ASGI server: uvicorn[standard] 0.46.0

**Frontend Environment:**
- Node.js (version managed by pnpm)
- Browser target: ES2022

**Package Managers:**
- `uv` — Python backend dependency management (`backend/uv.lock` lockfile present)
- `pnpm` 10.26.2 (frontend) / 10.33.2 (root) — Node.js dependency management (`frontend/pnpm-lock.yaml` and root `pnpm-lock.yaml` present)

## Frameworks

**Backend Core:**
- FastAPI 0.136.1 — async REST API framework
- Pydantic 2.13.3 — data validation and serialization
- pydantic-settings 2.14.0 — environment-based configuration via `backend/cmc/config/settings.py`
- SQLModel 0.0.38 — SQLAlchemy + Pydantic ORM layer
- SQLAlchemy 2.0.49 (async) — database ORM engine
- Alembic 1.18.4 — database migrations (`backend/alembic.ini`, `backend/migrations/`)

**Frontend Core:**
- React 19.2.5 — UI component framework
- @tanstack/react-router 1.168.24 — type-safe file-based routing with auto code-splitting
- @tanstack/react-query 5.100.5 — async data fetching and server-state cache
- Vite 8.0.10 — build tool and dev server (`frontend/vite.config.ts`)

**UI Components:**
- @radix-ui/react-alert-dialog, @radix-ui/react-collapsible, @radix-ui/react-dialog, @radix-ui/react-tooltip — accessible headless UI primitives
- lucide-react 1.11.0 — icon library
- framer-motion 12.38.0 — animation
- recharts 3.8.1 — chart components
- cmdk 1.1.1 — command palette

**Testing (Backend):**
- pytest >=9.0 with pytest-asyncio >=0.24 — async test runner
- pytest-cov >=7.1.0 — coverage
- pytest-freezer >=0.4 — deterministic time in tests

**Testing (Frontend):**
- vitest 4.1.5 — unit test runner (`frontend/vitest.config.ts`)
- @testing-library/react 16.3.2 — component testing
- @playwright/test 1.59.1 — end-to-end testing (`frontend/playwright.config.ts`)
- happy-dom / jsdom — DOM environments

**Build/Dev (Backend):**
- hatchling — Python wheel build backend
- ruff >=0.9 — linter and formatter (line-length 100, Python 3.13 target)
- pyright >=1.1.409 — type checker (basic mode)
- bandit >=1.9.4 — security audit
- pip-audit >=2.10.0 — dependency vulnerability audit
- pre-commit >=4.0 — git hooks

**Build/Dev (Frontend):**
- @vitejs/plugin-react 6.0.1 — React fast refresh
- @tanstack/router-plugin 1.167.26 — Vite plugin for route generation
- TypeScript compiler (`tsc -b`) — type checking + build

## Key Dependencies

**Critical:**
- `anthropic` 0.97.0 — Anthropic Python SDK; used in `backend/cmc/schedules/nlcron.py` for NL→cron conversion (Claude Haiku 4.5) and surfaced in Telegram relay handler
- `aiosqlite` 0.22.1 — async SQLite driver backing all DB operations
- `structlog` 25.5.0 — structured logging
- `psutil` 7.2.2 — system process monitoring
- `croniter` 6.2.2 — cron expression validation and scheduling
- `httpx` >=0.28 — async HTTP client used by Telegram API calls, JWKS fetch, and OTel export
- `pyjwt` >=2.12.1 — JWT decoding for optional auth
- `cryptography` >=47.0.0 — JWT RSA/EC key support

**Observability:**
- `prometheus-client` >=0.25.0 — Prometheus metrics (opt-in via `METRICS_ENABLED`)
- `starlette-exporter` >=0.23.0 — Prometheus middleware for FastAPI
- `opentelemetry-api/sdk` >=1.41.1 — OTel tracing (opt-in via `OTEL_ENABLED`)
- `opentelemetry-exporter-otlp-proto-http` >=1.41.1 — OTLP trace export
- `opentelemetry-instrumentation-fastapi/httpx/sqlalchemy` >=0.62b1 — auto-instrumentation

**Optional:**
- `redis` >=7.4.0 — optional extra for multi-process rate limit storage (`rate_limit_storage_url`)

## Configuration

**Environment Loading:**
- Dev mode (`CMC_ENV=dev`): reads `backend/.env`
- Install mode (`CMC_ENV=install`): reads `~/.command-centre/.env`
- All settings have sensible defaults; `.env` is entirely optional
- Config class: `backend/cmc/config/settings.py` (`Settings` / `load_settings()`)
- Template: `backend/.env.example`

**Key Config Variables:**
- `HOST`, `PORT` (default 127.0.0.1:8765) — server bind address
- `DB_PATH` (default `data/cmc.db`) — SQLite file, resolved relative to repo root
- `STATIC_DIR` (default `frontend/dist`) — built SPA assets
- `LOG_LEVEL`, `LOG_FORMAT` (text or json)
- `AUTH_ENABLED`, `AUTH_JWT_SECRET`, `AUTH_JWKS_URL` — optional JWT auth
- `METRICS_ENABLED`, `OTEL_ENABLED`, `OTEL_EXPORTER_OTLP_ENDPOINT` — optional observability
- `RATE_LIMIT_ENABLED`, `RATE_LIMIT_STORAGE_URL` — optional rate limiting (in-memory default; Redis optional)
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_ALLOWED_USER_IDS` — optional Telegram bot
- `ANTHROPIC_API_KEY` — optional; required for NL→cron and Telegram→Claude relay
- `CLAUDE_BIN` (default `/opt/homebrew/bin/claude`) — Claude CLI path for dispatcher
- `JSONL_ROOT` (default `~/.claude/projects`) — Claude Code transcript ingestion path

**Build Config Files:**
- `backend/pyproject.toml` — Python project manifest, ruff/pyright/pytest config
- `frontend/vite.config.ts` — Vite build config with `/api` proxy to port 8765
- `frontend/tsconfig.json` — TypeScript strict config
- `frontend/vitest.config.ts` — Vitest config
- `frontend/playwright.config.ts` — Playwright E2E config

## Platform Requirements

**Development:**
- macOS (primary target; launchd plist generation in `backend/cmc/app/plist_render.py`, `backend/cmc/dispatcher/plist_render.py`, `backend/cmc/telegram/plist_render.py`)
- `uv` for Python, `pnpm` for Node.js
- `make` for orchestration (`Makefile`)

**Production:**
- macOS (launchd managed daemons installed to `~/.command-centre/`)
- SQLite (WAL mode) — local filesystem only; not compatible with NFS/iCloud paths
- Serves the built React SPA as static files via FastAPI's `SPAStaticFiles` (`backend/cmc/core/static.py`)
- Backend listens on `127.0.0.1:8765` by default (never 0.0.0.0)

---

*Stack analysis: 2026-05-02*
