# Technology Stack

**Analysis Date:** 2026-05-02

## Languages

**Primary:**
- Python 3.13 - Backend API server, dispatcher, ingestion, Telegram daemons
- TypeScript 6.0 - Frontend SPA (strict mode, target ES2022)

**Secondary:**
- CSS - Frontend styles (`frontend/src/styles.css`)

## Runtime

**Environment:**
- Python: `>=3.13` (see `backend/pyproject.toml`)
- Node.js: Evergreen (no `.nvmrc` pinning; frontend targets modern browsers)

**Package Managers:**
- Backend: `uv` (via `uv sync --extra dev`) — lockfile: `backend/uv.lock`
- Frontend: `pnpm@10.26.2` — lockfile: `frontend/pnpm-lock.yaml`
- Workspace root: `pnpm@10.33.2` — lockfile: `pnpm-lock.yaml`

## Frameworks

**Core:**
- FastAPI `0.136.1` - Backend REST API + SSE (`backend/cmc/app/factory.py`)
- Uvicorn `0.46.0` (standard) - ASGI server (`UVICORN_APP=cmc.app.factory:create_app`)
- React `19.2.5` - Frontend SPA (`frontend/src/main.tsx`)
- Vite `8.0.10` - Frontend build tool and dev server (`frontend/vite.config.ts`)

**Routing:**
- `@tanstack/react-router@1.168.24` - File-based frontend routing with auto code-splitting (`frontend/src/routeTree.gen.ts`)

**Data Fetching:**
- `@tanstack/react-query@5.100.5` - Server state management on the frontend (`frontend/src/lib/queries.ts`)

**UI Components:**
- `@radix-ui/*` - Headless components (alert-dialog, collapsible, dialog, tooltip)
- `lucide-react@1.11.0` - Icons
- `framer-motion@12.38.0` - Animations
- `recharts@3.8.1` - Charts
- `cmdk@1.1.1` - Command palette

**ORM / Database:**
- SQLAlchemy `2.0.49` - Async ORM (`backend/cmc/db/engine.py`)
- SQLModel `0.0.38` - Pydantic-integrated models (`backend/cmc/db/models/`)
- aiosqlite `0.22.1` - Async SQLite driver
- Alembic `1.18.4` - Schema migrations (`backend/migrations/`)

**Testing:**
- Backend: pytest `>=9.0` + pytest-asyncio `>=0.24` (`backend/pyproject.toml`)
- Frontend unit: Vitest `4.1.5` + happy-dom `20.9.0` (`frontend/vitest.config.ts`)
- Frontend E2E: Playwright `1.59.1` (`frontend/playwright.config.ts`)

**Build/Dev:**
- `@tanstack/router-plugin@1.167.26` - Vite plugin for route tree generation
- `@vitejs/plugin-react@6.0.1` - React JSX transform for Vite
- pre-commit `>=4.0` - Git hooks (`/.pre-commit-config.yaml`)
- Makefile - Root automation layer (`/Makefile`)

## Key Dependencies

**Critical:**
- Pydantic `2.13.3` + pydantic-settings `2.14.0` - Settings management and request/response validation (`backend/cmc/config/settings.py`)
- anthropic `0.97.0` - Anthropic API client for NL→cron conversion and skill routing (`backend/cmc/schedules/nlcron.py`, `backend/cmc/dispatcher/skill_router.py`)
- httpx `>=0.28` - Async HTTP client used for Telegram API and local inter-service calls
- structlog `25.5.0` - Structured logging throughout the backend
- psutil `7.2.2` - System memory/process metrics for `/api/system`

**Infrastructure:**
- prometheus-client `>=0.25.0` + starlette-exporter `>=0.23.0` - Optional Prometheus metrics (`backend/cmc/observability/metrics.py`)
- opentelemetry-api/sdk/exporter-otlp-proto-http `>=1.41.1` - Optional OTel tracing (`backend/cmc/observability/tracing.py`)
- opentelemetry-instrumentation-fastapi/httpx/sqlalchemy `>=0.62b1` - Auto-instrumentation
- PyJWT `>=2.12.1` + cryptography `>=47.0.0` - Optional JWT auth (`backend/cmc/auth/service.py`)
- croniter `6.2.2` - Cron expression validation (`backend/cmc/schedules/`)
- cronstrue `3.14.0` - Human-readable cron descriptions (frontend)
- redis `>=7.4.0` (optional extra) - Redis-backed rate limiting store (`backend/cmc/middleware/rate_limit.py`)
- greenlet `>=3.0` - Required by SQLAlchemy async

## Configuration

**Environment:**
- Dev mode: reads `backend/.env`
- Install mode: reads `~/.command-centre/.env`
- Mode selector: `CMC_ENV` env var (`dev`/`local`/`development` vs `install`/`installed`/`prod`/`production`)
- All settings have sensible defaults — `.env` is optional in dev
- Example config: `backend/.env.example`
- Settings class: `backend/cmc/config/settings.py`

**Key configs required for non-default features:**
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` — Telegram notifications
- `ANTHROPIC_API_KEY` — NL→cron conversion and Telegram relay
- `AUTH_JWT_SECRET` or `AUTH_JWKS_URL` — JWT authentication (when `AUTH_ENABLED=true`)
- `OTEL_ENABLED=true` + `OTEL_EXPORTER_OTLP_ENDPOINT` — OpenTelemetry
- `METRICS_ENABLED=true` — Prometheus metrics
- `RATE_LIMIT_ENABLED=true` — Rate limiting (optionally with `RATE_LIMIT_STORAGE_URL` for Redis)

**Build:**
- `frontend/vite.config.ts` - Vite build config (output to `frontend/dist/`)
- `frontend/tsconfig.json` - TypeScript strict mode, ES2022 target
- `backend/alembic.ini` - Migration config
- `Makefile` - Orchestrates `uv`, `pnpm`, pre-commit, and launchd

## Platform Requirements

**Development:**
- macOS primary (launchd integration, default `CLAUDE_BIN=/opt/homebrew/bin/claude`)
- Python `>=3.13`
- `uv` for backend dependency management
- `pnpm` for frontend dependency management
- Claude CLI binary (for dispatcher subprocess spawning)

**Production:**
- macOS launchd daemons (Telegram handler, notifier, dispatcher heartbeat)
- SQLite with WAL mode (local filesystem only — not NFS/iCloud)
- FastAPI served by uvicorn on `127.0.0.1:8765` (localhost-only, never `0.0.0.0`)
- Frontend SPA served as static files from `frontend/dist/` by FastAPI

---

*Stack analysis: 2026-05-02*
