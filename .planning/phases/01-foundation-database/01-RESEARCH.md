# Phase 1: Foundation & Database - Research

**Researched:** 2026-04-25
**Domain:** FastAPI + SQLAlchemy 2.0 async + SQLite/aiosqlite + Alembic + pydantic-settings + Vite/React/TanStack Router minimal SPA
**Confidence:** HIGH (locked stack is current best practice; verified against Context7 + official docs + npm/pypi registry)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Database access & schema**
- ORM: **SQLAlchemy ORM / SQLModel** (model classes for the 15 tables)
- Driver: **async (aiosqlite)** — native async DB calls inside FastAPI
- Schema management: **Alembic** — initial revision creates all 15 tables; future phases add migrations
- WAL mode + sane PRAGMAs (foreign_keys=ON, etc.) configured at engine/connection setup
- DB file location: **Claude's discretion** during planning

**Configuration & validation**
- Library: **pydantic-settings** (Pydantic v2 BaseSettings)
- Defaults philosophy: **sensible defaults everywhere; nothing required** — fresh clone boots out of the box
- .env: **single `.env` in repo root, gitignored, auto-loaded**; `.env.example` committed for documentation
- Validation failure UX: **pretty error** — list missing/invalid vars with hints, then exit cleanly (no raw Pydantic traceback)

**Project & module layout**
- Top-level: **`backend/` + `frontend/`** at repo root, each with its own deps and tooling
- Python package: **single `cmc` package with modular subpackages** (e.g. `cmc/api`, `cmc/db`, `cmc/config`, `cmc/core`)
- FastAPI routers: **one router per resource** under `cmc/api/routes/` (e.g. `sessions.py`, `tasks.py`, `health.py`) — pattern set now so Phases 3 & 4 plug in cleanly

**Frontend integration & dev workflow**
- Stack: **Vite + React + TanStack Router** (TS) — matches Phase 5 roadmap commitment
- Production serving: **`StaticFiles` mount + SPA fallback** to `index.html` so client-side routes survive deep links / refresh
- Dev mode: **two servers, two ports** — FastAPI on 8765, Vite dev server on its own port; Vite proxies `/api` to FastAPI. HMR works, standard SPA dev pattern.
- Build output location & invocation: **Claude's discretion** — pick what makes the Phase 9 `install.sh` cleanest

### Claude's Discretion

- SQLite file path/location (project-relative `data/` vs user-home dir) — pick whichever fits how the tool is installed and run
- SQLAlchemy connection/session pattern (engine lifecycle, session-per-request dependency)
- Exact Alembic config layout (env.py, script_location)
- Vite dev server port number and exact proxy config
- Frontend build output path and how the build is triggered (manual command vs Make/just target)
- Error message wording and formatting for config validation failures
- Health check endpoint details for Phase 1's "server boots" success criterion

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. (Auth, ingestion, API endpoints, panels, dispatcher, installer all already mapped to their own phases in ROADMAP.md.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-01 | Server starts on localhost:8765 with FastAPI app factory/builder pattern | App factory pattern + lifespan section; uvicorn invocation example |
| FOUND-02 | SQLite database initializes with WAL mode, write-serialized architecture, and all 15 tables via idempotent CREATE TABLE IF NOT EXISTS | SQLAlchemy + aiosqlite engine + WAL pragma section; **NOTE: locked decision uses SQLAlchemy ORM models + Alembic, NOT raw `CREATE TABLE IF NOT EXISTS`** — see Conflict Resolution |
| FOUND-03 | Idempotent migration helper (`_migrate_add_column`) supports schema evolution without data loss | Alembic `op.batch_alter_table` + Inspector pattern for column-existence checks |
| FOUND-04 | Pydantic v2 settings class validates all configuration from environment variables and .env file | pydantic-settings 2.14 with SettingsConfigDict + pretty ValidationError rendering |
| FOUND-05 | Lifespan context manager initializes database, starts background tasks, and shuts down gracefully | FastAPI `@asynccontextmanager` lifespan pattern; engine.dispose() on shutdown |
| FOUND-06 | Pre-built React frontend served as static files from FastAPI with SPA catch-all routing | StaticFiles(html=True) mount + custom 404 fallback to index.html |
</phase_requirements>

## Conflict Resolution: Locked Decisions vs. Pre-existing Project Research

The pre-existing project research (`/.planning/research/STACK.md`, `ARCHITECTURE.md`, `PITFALLS.md`, REQUIREMENTS.md) and `PROJECT.md` explicitly state **"raw SQL via aiosqlite, no ORM"** and **"CREATE TABLE IF NOT EXISTS with idempotent `_migrate_add_column` helper"**.

The phase CONTEXT.md (consumed from `/gsd-discuss-phase`) overrides this with **SQLAlchemy ORM/SQLModel + Alembic migrations**.

**Per agent instructions: CONTEXT.md decisions are LOCKED and override prior research.** This research proceeds with SQLAlchemy ORM + Alembic. The planner and implementer must:

1. Treat REQUIREMENTS.md wording (`CREATE TABLE IF NOT EXISTS`, `_migrate_add_column`) as INTENT (idempotent, data-safe schema evolution), not as literal API. Alembic's `alembic upgrade head` is the idempotent equivalent — running it on an already-migrated DB is a no-op.
2. The existing `## Out of Scope` line in REQUIREMENTS.md saying "ORM (SQLAlchemy models) — Raw SQL specified" is **superseded** by the phase decision. Update REQUIREMENTS.md and PROJECT.md as part of Phase 1 work, or flag for the user to update.
3. The architectural pitfalls in PITFALLS.md (write-serialized, busy_timeout, BEGIN IMMEDIATE) STILL APPLY — they are properties of SQLite-under-concurrency, independent of ORM choice. SQLAlchemy's `create_async_engine` with aiosqlite needs the same pragmas applied via `@event.listens_for(engine.sync_engine, "connect")`.

**Recommendation for planner:** Add a Wave 0 task to update REQUIREMENTS.md (line 254: remove "ORM (SQLAlchemy models)" from Out of Scope) and PROJECT.md (line 84: change "Raw SQL via aiosqlite" to "SQLAlchemy 2.0 async + SQLModel + aiosqlite") so downstream phases align with the new direction.

## Summary

Phase 1 stands up the entire backend/frontend skeleton: a FastAPI app factory with async lifespan, a SQLAlchemy 2.0 async engine over aiosqlite with WAL+foreign_keys pragmas applied at connect time, all 15 SQLModel tables created via Alembic's initial revision, pydantic-settings v2 loading from `.env` with sensible defaults and pretty validation errors on failure, and a Vite+React+TanStack Router minimal SPA with two-server dev workflow (Vite proxies `/api` to FastAPI:8765) and StaticFiles+SPA-fallback in production.

The stack is the 2026 standard: every choice is mainstream, well-documented, and battle-tested. SQLite WAL+aiosqlite under SQLAlchemy 2.0 async is well-supported but requires explicit pragma configuration through `engine.sync_engine` connect events. Alembic's async template (`alembic init -t async`) generates the correct env.py boilerplate. TanStack Router's Vite plugin must come BEFORE the React plugin (silent failure otherwise). FastAPI's StaticFiles `html=True` only handles `/` → `index.html` — a custom subclass is needed for deep-link SPA fallback.

**Primary recommendation:** Use SQLAlchemy 2.0 async + SQLModel for table definitions, run `alembic init -t async` for the migration env, configure WAL/foreign_keys/busy_timeout via `@event.listens_for(engine.sync_engine, "connect")` set on the synchronous shadow of the async engine, drive the FastAPI lifespan from `@asynccontextmanager`, and ship a custom `SPAStaticFiles` class for the catch-all route.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| HTTP routing & request handling | API / Backend (FastAPI) | — | All `/api/*` endpoints, OTEL ingest, SSE — lives in cmc.api |
| ORM models & schema | Database / Storage (SQLModel) | — | Single source of truth for all 15 tables; mirrors physical schema |
| Schema migrations | Database / Storage (Alembic) | — | Versioned, atomic, idempotent — runs against the same engine the app uses |
| DB connection lifecycle | API / Backend (FastAPI lifespan) | — | Engine created in lifespan, disposed on shutdown |
| Configuration loading | API / Backend (pydantic-settings) | — | Loaded once at process start; injected into app factory |
| Static asset serving (production) | API / Backend (FastAPI StaticFiles) | CDN / Static (out of scope for Phase 1) | Localhost-only deployment; FastAPI mounts `frontend/dist/` |
| SPA shell rendering | Browser / Client (React + TanStack Router) | Frontend Server (Vite dev only) | No SSR — pre-built SPA, FastAPI serves bytes, browser executes |
| Dev-mode frontend server | Frontend Server (Vite dev) | API / Backend (proxy target) | Vite proxies `/api` → :8765; only used during development |
| Health check endpoint | API / Backend (FastAPI) | — | `/api/health` returns 200; placeholder until Phase 3 expands it |

## Project Constraints (from CLAUDE.md)

`./CLAUDE.md` does not exist in the project root. No project-level constraints to honor beyond the phase CONTEXT.md decisions.

## Standard Stack

### Core (Backend)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python | 3.13 | Runtime | Locked by PROJECT.md constraints; bundles SQLite 3.47 with WAL/FTS5/JSON/window functions [VERIFIED: PROJECT.md] |
| FastAPI | 0.136.1 | HTTP framework | Locked by CONTEXT.md; native lifespan, native SSE, async-first [VERIFIED: pip index 2026-04-25] |
| uvicorn | 0.46.0 | ASGI server | Standard FastAPI pairing; `uvicorn[standard]` includes uvloop+httptools [VERIFIED: pip index 2026-04-25] |
| Pydantic | 2.13.3 | Validation | v2 Rust-backed core; required by FastAPI and pydantic-settings [VERIFIED: pip index 2026-04-25] |
| pydantic-settings | 2.14.0 | Configuration | Locked by CONTEXT.md; `.env` auto-load via SettingsConfigDict [VERIFIED: pip index 2026-04-25] [CITED: github.com/pydantic/pydantic-settings] |
| SQLAlchemy | 2.0.49 | Async ORM core | Locked by CONTEXT.md; `create_async_engine` + `AsyncSession` [VERIFIED: pip index 2026-04-25] [CITED: docs.sqlalchemy.org/en/20] |
| SQLModel | 0.0.38 | ORM model layer | Locked by CONTEXT.md; Pydantic+SQLAlchemy models in one definition [VERIFIED: pip index 2026-04-25] [CITED: sqlmodel.tiangolo.com] |
| aiosqlite | 0.22.1 | Async SQLite driver | Locked by CONTEXT.md; required for `sqlite+aiosqlite://` URL scheme [VERIFIED: pip index 2026-04-25] |
| Alembic | 1.18.4 | Schema migrations | Locked by CONTEXT.md; supports async via `alembic init -t async` [VERIFIED: pip index 2026-04-25] [CITED: alembic.sqlalchemy.org] |

### Core (Frontend)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.5 | UI framework | Latest stable; CONTEXT.md commits to React via Phase 5 [VERIFIED: npm view 2026-04-25] |
| TypeScript | 6.0.x | Type system | Last JS-based release; stable [VERIFIED: STACK.md cross-check] |
| Vite | 8.0.10 | Build tool & dev server | Locked by CONTEXT.md; ships Rolldown bundler [VERIFIED: npm view 2026-04-25] [CITED: vite.dev] |
| @vitejs/plugin-react | 6.0.1 | React HMR + JSX | Pairs with Vite 8; uses Oxc transforms [VERIFIED: npm view 2026-04-25] |
| @tanstack/react-router | 1.168.24 | Type-safe routing | Locked by CONTEXT.md [VERIFIED: npm view 2026-04-25] [CITED: tanstack.com/router] |
| @tanstack/router-plugin | 1.167.26 | Vite plugin for file-based routing | Generates routeTree from `routes/` directory [VERIFIED: npm view 2026-04-25] [CITED: tanstack.com/router] |

### Supporting (Backend, Phase 1 only)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| structlog | 25.5.0 | Structured logging | Wire up logger in app factory; later phases use it heavily [CITED: STACK.md] |
| python-dotenv | bundled w/ pydantic-settings | `.env` parsing | Auto-loaded by pydantic-settings; no separate import needed [CITED: github.com/pydantic/pydantic-settings] |

### Supporting (Frontend, Phase 1 only)

For the minimal Phase 1 SPA, install only what makes one route render. Phase 5 brings in the full UI library.

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-dom | 19.2.5 | DOM renderer | Standard with React |
| @tanstack/react-router-devtools | latest | Dev-time route inspector | Optional but standard for TanStack Router projects |

### Alternatives Considered

| Instead of | Could Use | Tradeoff (and why we don't) |
|------------|-----------|-----------------------------|
| SQLAlchemy ORM + SQLModel | aiosqlite + raw SQL | Project's prior research (STACK.md) recommends raw SQL — but CONTEXT.md locks ORM. Don't revisit. |
| Alembic async (`-t async`) | Sync Alembic + sync engine for migrations only | Async template is the cleanest for a fully-async app. The project is async end-to-end — keep it async. |
| SPAStaticFiles subclass | nginx in front of FastAPI | Out of scope per PROJECT.md (localhost-only, no reverse proxy). Subclass is the standard FastAPI pattern. |
| Vite dev proxy `/api` → :8765 | Run Vite output through FastAPI in dev too | Slower iteration (rebuild every change). Two-server dev is the locked decision and standard SPA practice. |

### Installation

**Backend:**
```bash
# uv preferred per project tooling (STACK.md); pip works equivalently
uv add fastapi==0.136.1 uvicorn[standard]==0.46.0 \
       pydantic==2.13.3 pydantic-settings==2.14.0 \
       sqlalchemy==2.0.49 sqlmodel==0.0.38 aiosqlite==0.22.1 \
       alembic==1.18.4 structlog==25.5.0
uv add --dev pytest pytest-asyncio ruff
```

**Frontend:**
```bash
cd frontend
npm install react@^19.2 react-dom@^19.2 \
            @tanstack/react-router@^1.168 @tanstack/react-router-devtools
npm install -D vite@^8 @vitejs/plugin-react@^6 \
               @tanstack/router-plugin@^1.167 \
               typescript@~6.0 @types/react@^19 @types/react-dom@^19
```

**Version verification commands** (run during Wave 0 to confirm registry currency):
```bash
pip index versions fastapi sqlalchemy sqlmodel alembic aiosqlite pydantic-settings
npm view @tanstack/react-router version && npm view vite version
```

## Architecture Patterns

### System Architecture Diagram

```
                Phase 1 Boot Sequence (single command, single process)

    $ uvicorn cmc.app:create_app --factory --host 127.0.0.1 --port 8765
                              │
                              ▼
            ┌─────────────────────────────────────────┐
            │  cmc.config.Settings()                  │
            │  pydantic-settings BaseSettings          │
            │  - reads ./. env (auto-loaded)          │
            │  - reads OS environ (overrides .env)    │
            │  - all defaults sensible (nothing       │
            │    required); fail = pretty exit        │
            └────────────────┬────────────────────────┘
                             │ settings instance
                             ▼
            ┌─────────────────────────────────────────┐
            │  cmc.app.create_app(settings)           │
            │  app factory                             │
            │  - constructs FastAPI(lifespan=...)     │
            │  - mounts routers (cmc.api.routes.*)    │
            │  - mounts StaticFiles(html=True) for    │
            │    frontend/dist (production only)      │
            │  - registers SPA catch-all              │
            └────────────────┬────────────────────────┘
                             │
            ┌────────────────▼────────────────────────┐
            │  @asynccontextmanager lifespan(app)     │
            │  - create_async_engine(sqlite+aiosqlite)│
            │  - @event.listens_for(sync_engine,      │
            │    "connect"): WAL, foreign_keys,        │
            │    busy_timeout, journal_size_limit     │
            │  - alembic upgrade head (idempotent)    │
            │    via Config.attributes['connection']  │
            │  - async_sessionmaker bound to engine   │
            │  - app.state.engine, app.state.sessions │
            │  - yield ──── app serves traffic ────   │
            │  - engine.dispose() on shutdown         │
            └────────────────┬────────────────────────┘
                             │
        ┌────────────────────┼─────────────────────┐
        ▼                    ▼                     ▼
   ┌─────────┐         ┌──────────┐          ┌──────────┐
   │ /api/*  │         │ /v1/*    │          │ /        │
   │ routers │         │ (Phase 2)│          │ SPA mount│
   │ (1 per  │         │          │          │ +catch-  │
   │ resource│         │          │          │  all     │
   └────┬────┘         └──────────┘          └────┬─────┘
        │                                          │
        ▼                                          ▼
   ┌─────────────────────┐              ┌──────────────────┐
   │ Depends(get_session)│              │ frontend/dist/   │
   │ async with sessions │              │ index.html +     │
   │ () as s: yield s    │              │ assets/*         │
   └─────────┬───────────┘              └──────────────────┘
             │
             ▼
   ┌──────────────────────────┐
   │ data/cmc.db (SQLite WAL) │
   │ via aiosqlite, all       │
   │ 15 tables created by     │
   │ Alembic initial revision │
   └──────────────────────────┘

      DEV MODE (parallel process):
      $ cd frontend && npm run dev    →    Vite :5173 (HMR)
                                            └─ proxy /api → 127.0.0.1:8765
```

### Component Responsibilities

| Module | Responsibility | Key Files |
|--------|---------------|-----------|
| `cmc.config` | Load settings from env + .env, render pretty errors on failure | `cmc/config/__init__.py`, `cmc/config/settings.py` |
| `cmc.app` | App factory, lifespan, middleware, router registration, static mount | `cmc/app/__init__.py` (exports `create_app`), `cmc/app/lifespan.py` |
| `cmc.db` | Engine, session factory, base model, migrations entry point | `cmc/db/engine.py`, `cmc/db/session.py`, `cmc/db/models/*.py` |
| `cmc.api.routes` | Per-resource HTTP routers (Phase 1: only `health.py`) | `cmc/api/routes/health.py`, `cmc/api/routes/__init__.py` |
| `cmc.core` | Cross-cutting utilities (logging, error handlers) | `cmc/core/logging.py`, `cmc/core/errors.py` |
| `migrations/` | Alembic env, script_location, initial revision | `migrations/env.py`, `migrations/versions/0001_initial.py`, `alembic.ini` |
| `frontend/` | Vite app, TanStack routes, build output | `frontend/vite.config.ts`, `frontend/src/routes/__root.tsx`, `frontend/src/routes/index.tsx` |

### Recommended Project Structure

```
claude-mission-control/
├── backend/
│   ├── pyproject.toml                # Python deps + tool config (ruff)
│   ├── alembic.ini                   # script_location = migrations
│   ├── .env.example                  # committed; documents all settings
│   ├── migrations/
│   │   ├── env.py                    # async template (alembic init -t async)
│   │   ├── script.py.mako
│   │   └── versions/
│   │       └── 0001_initial.py       # creates all 15 tables
│   ├── cmc/
│   │   ├── __init__.py
│   │   ├── app/
│   │   │   ├── __init__.py           # exports create_app
│   │   │   ├── factory.py            # create_app() builder
│   │   │   └── lifespan.py           # @asynccontextmanager
│   │   ├── config/
│   │   │   ├── __init__.py           # exports Settings
│   │   │   └── settings.py           # BaseSettings class
│   │   ├── db/
│   │   │   ├── __init__.py
│   │   │   ├── engine.py             # create_async_engine + connect events
│   │   │   ├── session.py            # async_sessionmaker + get_session dep
│   │   │   ├── base.py               # SQLModel base class
│   │   │   └── models/               # one file per resource (sessions.py, tasks.py, ...)
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   └── routes/
│   │   │       ├── __init__.py       # router aggregation
│   │   │       └── health.py         # GET /api/health
│   │   └── core/
│   │       ├── __init__.py
│   │       ├── logging.py            # structlog config
│   │       └── static.py             # SPAStaticFiles subclass
│   └── tests/
│       └── test_phase1_boot.py       # smoke tests
├── frontend/
│   ├── package.json
│   ├── vite.config.ts                # tanstackRouter() BEFORE react()
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── routeTree.gen.ts          # generated by tanstackRouter plugin
│       └── routes/
│           ├── __root.tsx            # minimal layout
│           └── index.tsx             # "Hello, mission control" route
├── data/                             # gitignored; cmc.db lives here
│   └── .gitkeep
├── .env                              # gitignored
├── .gitignore                        # ignores data/*.db*, .env, frontend/dist, node_modules, __pycache__
└── README.md
```

### Pattern 1: SQLAlchemy 2.0 Async Engine + Connect-Time Pragmas

**What:** A single `AsyncEngine` instance is created in lifespan startup. WAL mode, foreign keys, and busy_timeout are applied via a sync-side `@event.listens_for` listener attached to `engine.sync_engine` (the synchronous shadow that aiosqlite manages internally).

**When to use:** Always for SQLite under SQLAlchemy async. The pragma pattern is the SQLAlchemy-documented way; without it, foreign keys are silently disabled and busy_timeout defaults to 0.

**Example:**
```python
# Source: https://docs.sqlalchemy.org/en/20/dialects/sqlite.html
# (verbatim from SQLAlchemy 2.0 docs, "Foreign Key Support" section)

from sqlalchemy import event
from sqlalchemy.ext.asyncio import create_async_engine

engine = create_async_engine(
    f"sqlite+aiosqlite:///{settings.db_path}",
    echo=settings.db_echo,
    # CRITICAL: connect_args for python 3.12+ autocommit handling
    connect_args={"check_same_thread": False},
)

@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, connection_record):
    # The sqlite3 driver will not set PRAGMA foreign_keys
    # if autocommit=False; toggle to True temporarily.
    ac = dbapi_connection.autocommit
    dbapi_connection.autocommit = True
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")          # 5s wait on lock
        cursor.execute("PRAGMA journal_size_limit=67108864") # 64MB WAL cap
        cursor.execute("PRAGMA synchronous=NORMAL")          # safe with WAL
    finally:
        cursor.close()
        dbapi_connection.autocommit = ac
```

**Note on `engine.sync_engine`:** Required for async engines because the connect event fires on the sync DBAPI level. Without it, the listener never executes. Verified pattern from SQLAlchemy 2.0 docs.

### Pattern 2: FastAPI Lifespan with `@asynccontextmanager`

**What:** A single `@asynccontextmanager` function manages startup and shutdown. Engine creation, migration application, and session factory wiring happen before `yield`; cleanup happens after.

**When to use:** Always (replaces deprecated `@app.on_event("startup"/"shutdown")`).

**Example:**
```python
# Source: https://fastapi.tiangolo.com/advanced/events/

from contextlib import asynccontextmanager
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine, AsyncSession
from alembic import command
from alembic.config import Config as AlembicConfig

@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = app.state.settings
    engine = create_async_engine(f"sqlite+aiosqlite:///{settings.db_path}")
    # pragma listener attached here (see Pattern 1)

    # Run alembic upgrade head against this engine (idempotent)
    alembic_cfg = AlembicConfig(str(settings.alembic_ini_path))
    async with engine.begin() as conn:
        await conn.run_sync(
            lambda sync_conn: _alembic_upgrade(alembic_cfg, sync_conn, "head")
        )

    app.state.engine = engine
    app.state.sessions = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        yield
    finally:
        await engine.dispose()

def _alembic_upgrade(cfg, connection, target):
    cfg.attributes["connection"] = connection
    command.upgrade(cfg, target)
```

### Pattern 3: AsyncSession Dependency

**What:** `Depends(get_session)` yields a fresh `AsyncSession` bound to the lifespan-created `async_sessionmaker`. Each request gets its own session; FastAPI runs cleanup (close, rollback if needed) after the response.

**Example:**
```python
# Source: testdriven.io/blog/fastapi-sqlmodel + sqlmodel.tiangolo.com

from fastapi import Request, Depends
from sqlalchemy.ext.asyncio import AsyncSession

async def get_session(request: Request) -> AsyncSession:
    sessionmaker = request.app.state.sessions
    async with sessionmaker() as session:
        yield session

# Usage in a route:
@router.get("/api/health")
async def health(session: AsyncSession = Depends(get_session)) -> dict:
    # Phase 1 minimal: just confirm DB is reachable
    await session.execute(text("SELECT 1"))
    return {"status": "ok"}
```

### Pattern 4: Pydantic-Settings with Pretty ValidationError

**What:** `BaseSettings` subclass with `SettingsConfigDict(env_file='.env', extra='ignore')`. On `ValidationError` at startup, format `e.errors()` into a clean per-field message and `sys.exit(1)`.

**Example:**
```python
# Source: github.com/pydantic/pydantic-settings + docs.pydantic.dev/latest/errors

from pathlib import Path
import sys
from pydantic import ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",          # don't error on unknown vars
        case_sensitive=False,
    )

    # Locked decision: sensible defaults everywhere; nothing required
    host: str = "127.0.0.1"
    port: int = 8765
    db_path: Path = Path("data/cmc.db")
    db_echo: bool = False
    log_level: str = "INFO"
    static_dir: Path = Path("frontend/dist")
    alembic_ini_path: Path = Path("alembic.ini")

def load_settings() -> Settings:
    try:
        return Settings()
    except ValidationError as e:
        _render_pretty(e)
        sys.exit(1)

def _render_pretty(e: ValidationError) -> None:
    print("Configuration error: invalid environment / .env values\n", file=sys.stderr)
    for err in e.errors():
        loc = ".".join(str(p) for p in err["loc"])
        msg = err["msg"]
        env_hint = loc.upper()
        print(f"  • {loc}: {msg}", file=sys.stderr)
        print(f"    Set environment variable {env_hint} or add {env_hint}=... to .env", file=sys.stderr)
    print("\nSee .env.example for documented defaults.", file=sys.stderr)
```

### Pattern 5: Alembic Async Init + Programmatic Upgrade

**What:** `alembic init -t async migrations/` generates an env.py with `async_engine_from_config` and `connection.run_sync(do_run_migrations)`. Modify env.py to accept an injected connection from `Config.attributes` so the app's lifespan can run migrations against its own engine without spawning a second one.

**Example env.py (key sections):**
```python
# Source: alembic.sqlalchemy.org cookbook ("Using Asyncio with Alembic" + "Sharing a Connection")

import asyncio
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context

from cmc.db.base import SQLModel  # imports all models so metadata is populated
target_metadata = SQLModel.metadata

def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=True,  # SQLite ALTER TABLE limitation workaround
    )
    with context.begin_transaction():
        context.run_migrations()

async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()

def run_migrations_online() -> None:
    # Pattern: shared connection from app code
    connectable = config.attributes.get("connection")
    if connectable is None:
        asyncio.run(run_async_migrations())
    else:
        do_run_migrations(connectable)

if context.is_offline_mode():
    raise RuntimeError("Offline mode unsupported for this app")
else:
    run_migrations_online()
```

**Initial revision generation (one-time, by hand):**
```bash
cd backend
alembic revision --autogenerate -m "initial schema (15 tables)"
# Inspect the generated migration in migrations/versions/0001_*.py
# Edit if autogenerate misses anything (it cannot detect renames, etc.)
```

### Pattern 6: SPA Catch-All via Custom StaticFiles

**What:** FastAPI's stock `StaticFiles(html=True)` only serves `index.html` for the root path. Direct navigation to `/activity` or refreshing on `/skills` returns 404. The fix is a subclass that catches 404s on non-API paths and returns `index.html`.

**Example:**
```python
# Source: PITFALLS.md cross-referenced with FastAPI discussion #5134
# https://github.com/fastapi/fastapi/discussions/5134

from fastapi import HTTPException
from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse

class SPAStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except HTTPException as ex:
            if ex.status_code == 404:
                return FileResponse(self.directory / "index.html")
            raise

# Mount in app factory:
app.mount("/", SPAStaticFiles(directory=settings.static_dir, html=True), name="spa")
```

**Critical ordering:** Mount StaticFiles AFTER all `/api/*` routers are registered. FastAPI matches routes in registration order; a `/` mount registered first would shadow `/api/*`.

### Pattern 7: Vite + TanStack Router + Dev Proxy

**What:** Vite dev server runs on its own port (5173 by default). The `tanstackRouter` plugin must come BEFORE `@vitejs/plugin-react`. Dev proxy forwards `/api` to FastAPI on 8765. In production, Vite outputs to `frontend/dist/` and FastAPI serves it.

**Example `vite.config.ts`:**
```typescript
// Source: tanstack.com/router (Vite Plugin Setup) + vite.dev/config/server-options

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [
    // MUST come before react()
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
  ],
  server: {
    port: 5173,            // dev only — never reached in production
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: false, // localhost; same origin model
      },
      // Phase 2 will add /v1/logs and /v1/metrics; for now /api is enough
    },
  },
  build: {
    outDir: 'dist',         // → frontend/dist/
    emptyOutDir: true,
    sourcemap: false,
  },
  // base: './' if FastAPI mounts at a non-root path; default '/' is fine here
})
```

**Minimal route file (`frontend/src/routes/__root.tsx`):**
```tsx
// Source: tanstack.com/router file-based-routing

import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <div>
      <header>Claude Mission Control</header>
      <Outlet />
    </div>
  ),
})
```

**Minimal index route (`frontend/src/routes/index.tsx`):**
```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: () => <main>Mission Control online.</main>,
})
```

### Anti-Patterns to Avoid

- **`@app.on_event("startup"/"shutdown")`:** Deprecated since FastAPI 0.93. Always use lifespan. [CITED: FastAPI release notes]
- **Pragmas applied via raw SQL inside route handlers:** Pragmas are per-connection. Apply via `@event.listens_for(sync_engine, "connect")` so every new connection gets them.
- **Mounting StaticFiles before API routers:** Shadows all `/api/*` routes. Always mount static last.
- **`tanstackRouter` plugin AFTER `react()`:** Silent failure — routes don't generate, no error message. [CITED: tanstack.com/router]
- **One async session shared across requests:** Sessions are per-request; sharing them causes transaction-state bugs. Use `async_sessionmaker` + `Depends`.
- **Calling `engine.dispose()` outside lifespan shutdown:** Disposing during a live request kills connections in flight. Only dispose in the post-`yield` cleanup block.
- **Setting WAL pragma after migrations:** WAL must be set on the FIRST write to the DB file or it doesn't take effect for that session. Apply at connect-event time.
- **Letting Pydantic ValidationError propagate as a stack trace:** Locked decision is "pretty error, exit cleanly." Wrap `Settings()` instantiation in try/except.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| `.env` parsing | Custom `os.environ.get` + type coercion | `pydantic-settings` `BaseSettings` | Free type validation, `.env` auto-load, nested models, env_prefix support |
| Schema migrations | `CREATE TABLE IF NOT EXISTS` strings | Alembic `revision --autogenerate` + `alembic upgrade head` | Versioned, atomic, downgradeable, integrates with SQLAlchemy metadata |
| Idempotent ADD COLUMN | `try/except OperationalError "duplicate column"` | `op.batch_alter_table` + `Inspector.get_columns()` check inside migration | Alembic batch mode handles SQLite's ALTER TABLE limitations correctly |
| Async SQLite driver | Threadpool around stdlib `sqlite3` | `aiosqlite` (used internally by SQLAlchemy 2.0 async) | Non-blocking, well-tested, integrates with `sqlite+aiosqlite://` URL |
| Connection pooling | Manual lock + connection list | `create_async_engine` default pool (NullPool for SQLite is fine) | SQLAlchemy handles pool sizing, recycling, dispose |
| SPA fallback routing | Manual catch-all path operation | `SPAStaticFiles(StaticFiles)` subclass | Standard FastAPI pattern; preserves StaticFiles' caching headers and content-type detection |
| Lifespan management | `@app.on_event` + manual ordering | `@asynccontextmanager` + `FastAPI(lifespan=...)` | Single function, before/after symmetry, exception-safe via context manager protocol |
| File-based routing | Manual route registration | `@tanstack/router-plugin/vite` | Generates `routeTree.gen.ts`, type-safe, code-splits per-route automatically |
| Dev-mode CORS | Reverse proxy / CORS middleware | Vite dev `server.proxy` for `/api` | Same-origin in dev = no CORS at all = fewer surprises |
| Pretty validation error | String concatenation hacks | `ValidationError.errors()` iteration + structured print | Stable schema across Pydantic versions; field-level loc/type/msg already separated |

**Key insight:** Phase 1 is plumbing. Every line of custom plumbing is debt. The locked stack provides battle-tested solutions for every Phase 1 concern — the implementer's job is to wire them together, not to invent.

## Common Pitfalls

### Pitfall 1: aiosqlite + SQLAlchemy autocommit Interaction Breaks foreign_keys Pragma

**What goes wrong:** `PRAGMA foreign_keys=ON` silently fails to persist when the connection is in `autocommit=False` mode (the SQLAlchemy default for transactional connections). Foreign key constraints are then NOT enforced, even though the pragma appears to have run.

**Why it happens:** sqlite3 (Python stdlib, the driver under aiosqlite) treats `PRAGMA foreign_keys` as a transactional statement when autocommit is off. The pragma is applied within an implicit transaction that may roll back or fail to commit before the connection returns to the pool.

**How to avoid:** Toggle `dbapi_connection.autocommit = True` before issuing pragmas, then restore the prior value. This is the SQLAlchemy-documented pattern. The example in Pattern 1 above does this correctly.

**Warning signs:** Insertions that should fail FK constraints succeed silently. `PRAGMA foreign_keys` returns `1` in interactive sessions but `0` in app code.

[VERIFIED: docs.sqlalchemy.org/en/20/dialects/sqlite.html § Foreign Key Support; github.com/sqlalchemy/sqlalchemy/discussions/12767]

### Pitfall 2: Alembic Autogenerate Misses Initial Revision Models

**What goes wrong:** Running `alembic revision --autogenerate` produces an empty migration because Alembic can't find the SQLModel metadata.

**Why it happens:** `target_metadata` in env.py points to `SQLModel.metadata`, but if the model classes haven't been imported anywhere by the time env.py runs, the metadata registry is empty. Importing `cmc.db.base` is not enough — you must import each module that defines a model.

**How to avoid:** In `cmc/db/models/__init__.py`, import every model module:
```python
from cmc.db.models.sessions import Session  # noqa: F401
from cmc.db.models.tasks import Task         # noqa: F401
# ... all 15
```
Then in env.py: `from cmc.db import models  # populates SQLModel.metadata`.

**Warning signs:** First autogenerated migration is empty or missing tables. `alembic upgrade head` runs but creates nothing.

[CITED: alembic.sqlalchemy.org tutorial § Auto Generating Migrations]

### Pitfall 3: TanStack Router Plugin Order

**What goes wrong:** Routes don't appear, dev server runs without errors, `routeTree.gen.ts` is missing or stale.

**Why it happens:** The TanStack Router Vite plugin must transform files BEFORE `@vitejs/plugin-react` processes JSX. If `react()` runs first, the router plugin sees post-Babel output it can't analyze.

**How to avoid:** In `vite.config.ts`, `tanstackRouter()` is the FIRST entry in `plugins[]`. The plugin docs explicitly call this out as a silent failure.

**Warning signs:** Empty pages, `Cannot find module './routeTree.gen'` errors, routes file changes don't reflect.

[CITED: tanstack.com/router/v1/docs/framework/react/start/plugin]

### Pitfall 4: SQLite WAL Pragma on First Connection Doesn't Persist for Existing DBs

**What goes wrong:** Setting `journal_mode=WAL` on a fresh DB works (it persists). On an existing DB created in `delete` mode (default), the pragma fires but `PRAGMA journal_mode` continues to return `delete`.

**Why it happens:** Switching journal mode on an existing DB requires an exclusive lock at the moment of switch. If another connection holds even a shared lock, the switch silently fails. Also, `journal_mode=WAL` is the only persistent journal-mode setting — it survives across connections — but only if the switch SUCCEEDS.

**How to avoid:**
1. Apply WAL pragma BEFORE any other connection opens (i.e., during the very first connect of the engine, in the connect listener).
2. Verify by reading back: `result = cursor.execute("PRAGMA journal_mode").fetchone(); assert result[0] == "wal"`. Log a warning if it isn't.
3. For tests with `:memory:` databases, WAL is unsupported (silent fallback to `memory` mode); don't assert on it.

**Warning signs:** `data/cmc.db-wal` and `data/cmc.db-shm` files don't appear after first run. `PRAGMA journal_mode` returns `delete`.

[CITED: sqlite.org/wal.html § Activating Write-Ahead Logging]

### Pitfall 5: FastAPI StaticFiles 404 on Deep-Link SPA Refresh

**What goes wrong:** User visits `localhost:8765/activity` directly (not via in-app navigation). FastAPI returns 404. Browser shows "Not Found." Refreshing on any non-root SPA route does the same.

**Why it happens:** `StaticFiles(html=True)` only auto-serves `index.html` when the path resolves to a directory (i.e., `/`). For `/activity`, it tries to find `frontend/dist/activity` (a file), can't, and 404s.

**How to avoid:** Use the `SPAStaticFiles` subclass from Pattern 6. Mount it AFTER all API routers.

**Warning signs:** Direct URL navigation works for `/` only. Bookmarks to deep routes break.

[VERIFIED: github.com/fastapi/fastapi/discussions/5134 + Pattern 6 above]

### Pitfall 6: Pydantic v2 ValidationError on Settings Crashes With Stack Trace

**What goes wrong:** A typo in `.env` (e.g., `PORT=eight-thousand`) raises `pydantic.ValidationError` with a multi-line traceback. User sees Python internals, not a useful message.

**Why it happens:** `Settings()` raises ValidationError immediately during instantiation if any field fails validation. By default this propagates as an uncaught exception.

**How to avoid:** Wrap Settings instantiation in try/except, format `e.errors()` into per-field messages, exit cleanly with non-zero status. See Pattern 4. The CONTEXT.md explicitly locks this UX.

**Warning signs:** Users see `pydantic_core._pydantic_core.ValidationError` instead of "PORT: must be a valid integer."

[CITED: docs.pydantic.dev/latest/errors/errors/]

### Pitfall 7: SQLite WAL on Network Filesystems Causes Corruption

**What goes wrong:** Running the dashboard with `data/cmc.db` on an NFS share, Docker bind mount over a network volume, or iCloud Drive folder — silent corruption, missing writes, or DB unrecoverable.

**Why it happens:** WAL uses shared-memory primitives (mmap on `*.db-shm`) that don't work reliably across network filesystems. SQLite documentation explicitly forbids this.

**How to avoid:** Document in `.env.example` that `DB_PATH` must point to a local filesystem. The default `data/cmc.db` (project-relative) is correct as long as the project itself is local. Add a doctor.py check (Phase 9) that warns on suspicious paths (`/Volumes/`, `/mnt/`, paths under iCloud-managed dirs).

**Warning signs:** `database disk image is malformed` errors, missing data after restarts, DB file size much larger than expected.

[CITED: sqlite.org/wal.html § "WAL does not work over a network filesystem"]

### Pitfall 8: Mounting StaticFiles at `/` Before API Routers Registered

**What goes wrong:** All `/api/*` requests return `index.html` instead of API responses. Frontend appears to load but every API call returns HTML.

**Why it happens:** FastAPI matches routes in registration order. A `/` mount with `html=True` matches everything that doesn't already match an earlier route. If the static mount registers BEFORE routers, it shadows them.

**How to avoid:** In the app factory, register all routers FIRST, then mount static. Code review checklist: search for `app.mount(` and verify it appears after all `app.include_router(` calls.

**Warning signs:** API calls return `<!DOCTYPE html>` content. Network tab shows 200 OK but wrong Content-Type (`text/html` instead of `application/json`).

[VERIFIED: FastAPI route resolution semantics]

## Code Examples

### Complete app factory wiring

```python
# Source: synthesis of FastAPI lifespan docs + this phase's patterns
# File: cmc/app/factory.py

from fastapi import FastAPI

from cmc.app.lifespan import lifespan
from cmc.api.routes import all_routers
from cmc.config import Settings, load_settings
from cmc.core.static import SPAStaticFiles

def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()

    app = FastAPI(
        title="Claude Mission Control",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )
    app.state.settings = settings

    # Routers FIRST (order matters)
    for router in all_routers():
        app.include_router(router, prefix="/api")

    # Static mount LAST (catch-all for SPA)
    if settings.static_dir.exists():
        app.mount("/", SPAStaticFiles(directory=settings.static_dir, html=True), name="spa")

    return app
```

### Complete lifespan with engine + Alembic

```python
# Source: combining FastAPI lifespan + SQLAlchemy async + Alembic shared connection
# File: cmc/app/lifespan.py

from contextlib import asynccontextmanager
from fastapi import FastAPI
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine, AsyncSession
from alembic import command
from alembic.config import Config as AlembicConfig

@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = app.state.settings

    engine = create_async_engine(
        f"sqlite+aiosqlite:///{settings.db_path}",
        echo=settings.db_echo,
        future=True,
    )

    @event.listens_for(engine.sync_engine, "connect")
    def _set_pragmas(dbapi_connection, _record):
        ac = dbapi_connection.autocommit
        dbapi_connection.autocommit = True
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA busy_timeout=5000")
            cursor.execute("PRAGMA journal_size_limit=67108864")
            cursor.execute("PRAGMA synchronous=NORMAL")
        finally:
            cursor.close()
            dbapi_connection.autocommit = ac

    # Run migrations using the engine we just created
    alembic_cfg = AlembicConfig(str(settings.alembic_ini_path))
    alembic_cfg.set_main_option(
        "sqlalchemy.url", f"sqlite+aiosqlite:///{settings.db_path}"
    )
    async with engine.begin() as conn:
        await conn.run_sync(_run_alembic_upgrade, alembic_cfg)

    app.state.engine = engine
    app.state.sessions = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    try:
        yield
    finally:
        await engine.dispose()

def _run_alembic_upgrade(connection, alembic_cfg: AlembicConfig) -> None:
    alembic_cfg.attributes["connection"] = connection
    command.upgrade(alembic_cfg, "head")
```

### Idempotent _migrate_add_column helper inside an Alembic migration

```python
# Pattern: column-existence check before ADD COLUMN
# Use inside any migration that ADDs a column to a pre-existing table

from alembic import op
from sqlalchemy import inspect

def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    inspector = inspect(bind)
    return any(c["name"] == column for c in inspector.get_columns(table))

def upgrade() -> None:
    if not _column_exists("sessions", "notes"):
        with op.batch_alter_table("sessions") as batch:
            batch.add_column(sa.Column("notes", sa.Text(), nullable=True))
```

This satisfies FOUND-03's `_migrate_add_column`-style intent while staying idiomatic Alembic.

### Pretty Pydantic ValidationError rendering

```python
# Source: docs.pydantic.dev/latest/errors/errors + Pattern 4
# Already shown in Pattern 4 above; reproduced for completeness in Code Examples

# (See Pattern 4 — Pydantic-Settings with Pretty ValidationError)
```

### Minimal frontend `main.tsx` and route tree wiring

```tsx
// Source: tanstack.com/router/v1/docs/framework/react/start/quick-start

import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

const root = document.getElementById('root')!
ReactDOM.createRoot(root).render(<RouterProvider router={router} />)
```

## Runtime State Inventory

> Phase 1 is greenfield — there is no pre-existing project to migrate FROM. The renames described in CONTEXT.md (raw-SQL → ORM) are documentation updates, not data migrations, because no implementation exists yet. Therefore this section's categories are largely "None — verified by absence of prior code."

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no SQLite DB exists yet (`data/` directory not created); no users, no production deployment | None for Phase 1; plan future migration testing for Phase 2+ ingestion |
| Live service config | None — no launchd plists yet (Phase 9); no running daemons | None |
| OS-registered state | None — no launchd labels claimed; no scheduled tasks | None |
| Secrets/env vars | None — no `.env` exists yet; pydantic-settings will define the canonical schema | Create `.env.example` with all settings names + sensible defaults documented |
| Build artifacts | None — no `frontend/dist/`, no `*.egg-info`, no compiled binaries | None |

**Documentation drift to address (not runtime state, but adjacent):**
- `.planning/REQUIREMENTS.md` line 254 lists "ORM (SQLAlchemy models)" in `## Out of Scope` — this contradicts the locked Phase 1 decision and must be removed.
- `.planning/PROJECT.md` line 84 says "Database uses raw SQL: No ORM" — must be updated.
- `.planning/research/STACK.md`, `ARCHITECTURE.md`, `PITFALLS.md`, `FEATURES.md` all assume raw SQL — flag for the planner to either update these or treat them as historical context.

The planner should add an explicit Wave 0 task to update REQUIREMENTS.md and PROJECT.md so downstream phases (especially Phase 2 ingestion) align with the new ORM direction.

## Environment Availability

> Phase 1 has limited external dependencies — most are language runtimes the developer is presumed to have. Audit confirms presence on the developer's macOS environment.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.13 | All backend code | Probe via `python3 --version` | TBD at exec | Document upgrade in `pyproject.toml` `requires-python = ">=3.13"`; bail with clear error if not present |
| uv (or pip) | Dependency install | Probe via `uv --version` | 0.11+ recommended | `pip install -r requirements.txt` works equivalently if uv missing |
| Node.js | Frontend dev/build | Probe via `node --version` | ≥20 LTS | Document in README; install via fnm/nvm/homebrew |
| npm | Frontend dependency install | Bundles with Node | — | pnpm/yarn work but stick to npm for simplicity |
| SQLite (system) | Not required at runtime | — | — | Bundled inside Python 3.13's stdlib (3.47); no system SQLite needed |

**Missing dependencies with no fallback:** Python 3.13 — if user is on 3.12 or earlier, the project won't run. `pyproject.toml` `requires-python` ensures clear error.

**Missing dependencies with fallback:** uv → pip; specific Node version manager → any way of installing Node 20+.

**Wave 0 verification command:**
```bash
python3 --version && node --version && npm --version
```

## Validation Architecture

> `nyquist_validation` is not present in `.planning/config.json` workflow section — treated as ENABLED per default policy.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 9.x + pytest-asyncio (Python); none required for Phase 1 frontend |
| Config file | `backend/pyproject.toml` `[tool.pytest.ini_options]` (to be created in Wave 0) |
| Quick run command | `cd backend && pytest tests/test_phase1_boot.py -x -q` |
| Full suite command | `cd backend && pytest -x` (Phase 1 has only one test file) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| FOUND-01 | App factory creates a FastAPI instance bound to a lifespan | unit | `pytest tests/test_phase1_boot.py::test_create_app_returns_fastapi -x` | ❌ Wave 0 |
| FOUND-01 | Server binds to 127.0.0.1:8765 (configurable) | smoke | `pytest tests/test_phase1_boot.py::test_uvicorn_can_bind_default_port -x` | ❌ Wave 0 |
| FOUND-02 | Lifespan creates DB file with WAL mode and all 15 tables | integration | `pytest tests/test_phase1_boot.py::test_lifespan_initializes_db -x` | ❌ Wave 0 |
| FOUND-02 | `PRAGMA journal_mode` returns `wal` after lifespan startup | integration | `pytest tests/test_phase1_boot.py::test_wal_mode_active -x` | ❌ Wave 0 |
| FOUND-02 | `PRAGMA foreign_keys` returns `1` | integration | `pytest tests/test_phase1_boot.py::test_foreign_keys_enabled -x` | ❌ Wave 0 |
| FOUND-02 | `inspect(engine).get_table_names()` returns ≥15 tables (excluding alembic_version) | integration | `pytest tests/test_phase1_boot.py::test_all_tables_created -x` | ❌ Wave 0 |
| FOUND-03 | `_column_exists` helper returns False for missing column, True for existing | unit | `pytest tests/test_phase1_boot.py::test_column_exists_helper -x` | ❌ Wave 0 |
| FOUND-04 | Settings loads defaults when no env/.env present | unit | `pytest tests/test_phase1_boot.py::test_settings_defaults -x` | ❌ Wave 0 |
| FOUND-04 | Invalid env value triggers pretty error and `SystemExit(1)` | unit | `pytest tests/test_phase1_boot.py::test_settings_pretty_error_on_invalid -x` | ❌ Wave 0 |
| FOUND-05 | Lifespan disposes engine on shutdown | integration | `pytest tests/test_phase1_boot.py::test_lifespan_disposes_on_shutdown -x` | ❌ Wave 0 |
| FOUND-06 | GET `/` returns `index.html` content | integration | `pytest tests/test_phase1_boot.py::test_spa_root -x` | ❌ Wave 0 |
| FOUND-06 | GET `/activity` (deep link) also returns `index.html` (SPA fallback) | integration | `pytest tests/test_phase1_boot.py::test_spa_deep_link_fallback -x` | ❌ Wave 0 |
| FOUND-06 | GET `/api/health` returns 200 (NOT `index.html`) | integration | `pytest tests/test_phase1_boot.py::test_api_not_shadowed_by_spa -x` | ❌ Wave 0 |

**Manual smoke (success criterion #1):**
- Start: `cd backend && uvicorn cmc.app:create_app --factory --host 127.0.0.1 --port 8765`
- Visit: `http://localhost:8765` → React SPA loads
- Visit: `http://localhost:8765/api/health` → JSON `{"status":"ok"}`

### Sampling Rate

- **Per task commit:** `pytest tests/test_phase1_boot.py -x -q` (full Phase 1 suite — small, runs in seconds)
- **Per wave merge:** Same command (Phase 1 has one test file)
- **Phase gate:** Full suite green AND manual SPA smoke succeeds before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `backend/pyproject.toml` — Python deps, `requires-python = ">=3.13"`, ruff/pytest config
- [ ] `backend/tests/__init__.py` + `backend/tests/conftest.py` — pytest fixtures (test settings, temp DB, async client)
- [ ] `backend/tests/test_phase1_boot.py` — covers all 13 FOUND-* tests above
- [ ] `backend/alembic.ini` — `script_location = migrations`, `sqlalchemy.url = sqlite+aiosqlite:///${DB_PATH}` (resolved at runtime)
- [ ] `backend/migrations/env.py` — async template, `target_metadata = SQLModel.metadata`
- [ ] `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/index.html`, `frontend/src/main.tsx`
- [ ] `.env.example` — committed; documents every Settings field
- [ ] `.gitignore` — `data/*.db*`, `.env`, `frontend/dist`, `frontend/node_modules`, `__pycache__`, `*.egg-info`
- [ ] Test framework install: `uv add --dev pytest pytest-asyncio httpx` (httpx for FastAPI's `TestClient` async variant)

## Security Domain

> `security_enforcement` not explicitly disabled — included per default policy. Phase 1 has minimal attack surface (localhost-only, no auth, no user input beyond config), but a few items still apply.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Localhost-only by design (per PROJECT.md) — no auth layer in v1 |
| V3 Session Management | no | No sessions exist yet |
| V4 Access Control | no | Single-user, single-machine |
| V5 Input Validation | yes | pydantic-settings validates all config; FastAPI/Pydantic validates all request bodies (Phase 1 only has /api/health, no body) |
| V6 Cryptography | no | No secrets, no encryption needed in Phase 1 (Telegram bot token in Phase 9) |
| V7 Error Handling & Logging | yes | Pretty validation errors must NOT leak file paths or env values; structlog with PII filter (later phases) |
| V14 Configuration | yes | `.env` gitignored; `data/*.db*` gitignored; `127.0.0.1` not `0.0.0.0` |

### Known Threat Patterns for {Python/FastAPI/SQLite stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Binding to `0.0.0.0` exposes dashboard to LAN | Information disclosure / Elevation of privilege | Hardcode default `host=127.0.0.1` in Settings; document in `.env.example` that LAN binding is unsupported [CITED: PITFALLS.md "Security Mistakes"] |
| `.env` accidentally committed | Information disclosure | `.gitignore` includes `.env`; `.env.example` is the only committed env file. Pre-commit hook (later phase) for secrets scanning. |
| SQL injection through SQLModel | Tampering | SQLModel/SQLAlchemy ORM uses parameterized queries by default. Never use `text()` with f-string interpolation. |
| WAL+SHM files committed | Information disclosure | `.gitignore` includes `data/*.db*` (covers `.db`, `.db-wal`, `.db-shm`) |
| StaticFiles directory traversal | Information disclosure | FastAPI's StaticFiles handles `..` correctly via Starlette; verified by Starlette test suite. Do not roll a custom path resolver. |
| Pretty error message leaks `.env` values | Information disclosure | Print only field names and types — never the rejected value. See Pattern 4. |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@app.on_event("startup"/"shutdown")` | `@asynccontextmanager` lifespan + `FastAPI(lifespan=...)` | FastAPI 0.93 (2023) | Cleaner cleanup semantics; required by 0.136 |
| Sync Alembic env.py | Async template via `alembic init -t async` | Alembic 1.6+ | Required for fully-async stacks; project is async end-to-end |
| Pydantic v1 `BaseSettings` | pydantic-settings v2 `BaseSettings` (separate package) | Pydantic v2 release (2023) | `BaseSettings` was extracted from pydantic core; install separately |
| `tailwind.config.js` | Tailwind v4 CSS-first config (Phase 5 concern, noted for context) | Tailwind 4.0 (2024) | N/A for Phase 1 |
| Webpack / Create React App | Vite + Rolldown | Vite 8.0 (2025) | 10-30x faster builds; CRA deprecated |
| Babel-based Vite React plugin | `@vitejs/plugin-react@6` (Oxc transforms) | plugin-react 6.0 | Smaller `node_modules`, faster transforms |
| sqlalchemy 1.4 sync-only | SQLAlchemy 2.0 with `create_async_engine` | SQLAlchemy 2.0 (2023) | Native async; modern typing via `Mapped[]` |

**Deprecated/outdated:**
- `@app.on_event` (deprecated, replaced by lifespan)
- `pydantic.BaseSettings` (moved to pydantic-settings package)
- `framer-motion` package name (renamed to `motion` — relevant for Phase 5, not Phase 1)
- Create React App (deprecated; use Vite)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The "15 tables" list is: sessions, token_usage, tools, otel_events, otel_metrics, tasks, schedules, decisions, inbox, activities, live_state, mcp_stats, skills, system_state, notification_log | Open Questions, Wave 0 model files | Migration is wrong; downstream phases reference tables that don't exist or have wrong columns. **MUST be confirmed before initial migration is generated.** |
| A2 | `data/cmc.db` (project-relative) is the right DB path default for Phase 1 (vs. `~/.command-centre/cmc.db`) | Pattern 1, Settings defaults | Phase 9 installer must copy/migrate the DB; mismatched expectations between dev and install layouts |
| A3 | Vite dev port 5173 (default) is acceptable; backend uses 8765 | Pattern 7 | Port collision if user already runs another Vite project — but `strictPort: true` will fail loudly, not silently |
| A4 | `frontend/dist` is the production build output and lives in repo root sibling to `backend/` | Pattern 7, project structure | Phase 9 installer needs to know this path; documented in `.env.example` for `STATIC_DIR` |
| A5 | Alembic `--autogenerate` will correctly infer all 15 tables from SQLModel metadata | Pattern 5 | Hand-editing the initial revision may be required (autogenerate misses constraints, indexes occasionally) — flag during Wave 0 |
| A6 | Python 3.13 is installed on the dev machine | Environment Availability | Project won't run; `pyproject.toml` `requires-python` will catch it with a clear error |
| A7 | The "single command to start the server" is `uvicorn cmc.app:create_app --factory --host $HOST --port $PORT` (or a `make dev` / `just dev` wrapper) | Architecture, FOUND-01 | Locked decision says "single command" — the exact form is Claude's discretion |
| A8 | REQUIREMENTS.md line 254 ("ORM (SQLAlchemy models) — Raw SQL specified") and PROJECT.md line 84 ("Database uses raw SQL: No ORM") will be updated to reflect the locked SQLAlchemy ORM decision | Conflict Resolution | Downstream phase research will be inconsistent; planner should add a Wave 0 doc-update task |

## Open Questions

1. **What are the exact 15 tables and their column schemas?**
   - What we know: PROJECT.md lists 14 categories ("sessions, tokens, tools, OTEL events/metrics, tasks, schedules, decisions, inbox, activities, live state, MCP stats, skills, system state, notification log"). REQUIREMENTS.md/Phase 1 says "all 15 tables." OBSV-05 implies a `hooks` table; INGST-01 implies offset/scan tracking (could be a `scan_state` table or columns on `sessions`).
   - What's unclear: The 15th table. Best inferred candidate is `tools` (per-tool-call event records) since PROJECT.md's "tools" plural is ambiguous between MCP stats and individual call events. Also possible: `hooks` as separate from `otel_events`.
   - Recommendation: Phase 1 Wave 0 includes an explicit table-listing decision step. Best path: planner inspects each phase's requirements (INGST, SAPI, OBSV, MCP, SKIL, HITL, TASK, SCHD, ESTOP, DISP, TELE) and derives a column-by-column schema, gets user confirmation before writing the initial Alembic revision. **Confirmation gate: do not generate migration `0001_initial.py` until table list is approved.**

2. **What columns does each table need?**
   - What we know: The full requirements document hints at column needs per resource (e.g., TASK-02 lists task fields: title, description, priority, quadrant, approval, risk, dry_run, model, execution_mode, skill, scheduled_for).
   - What's unclear: For tables not directly enumerated (live_state, system_state, mcp_stats), columns must be derived from API contract requirements in Phases 3-4.
   - Recommendation: Build the schema iteratively in Phase 1 — start with everything REQUIREMENTS.md explicitly mentions, leave columns to be ADDed in later phases via the idempotent migration pattern (FOUND-03 helper). The locked decision supports this: "future phases add migrations."

3. **Should Alembic migrations run on app startup, or only via explicit CLI?**
   - What we know: testdriven.io recommends CLI-only for production. The locked decision says "lifespan context manager initializes database" (FOUND-05).
   - What's unclear: Whether "initializes database" means "runs migrations" or "opens engine + verifies schema."
   - Recommendation: Run `alembic upgrade head` from lifespan startup (idempotent — no-op if already up to date). This satisfies "fresh clone boots out of the box" (locked decision). Also expose `cc migrate` CLI command (Phase 9) for explicit control.

4. **Is there a reference implementation in the user's existing dashboard that should inform the schema?**
   - What we know: PROJECT.md says "The user already runs a version of this dashboard daily."
   - What's unclear: Whether the user has the existing schema (or DDL) accessible. The repo contains only docs and a `build-your-own-dashboard-guide.html` (which doesn't have the schema).
   - Recommendation: Planner should prompt the user during Phase 1 planning: "Do you have the existing dashboard's schema we can mirror, or should we derive it from REQUIREMENTS.md?" — could save substantial rework.

5. **Frontend build trigger: manual `npm run build` vs. Make/just target vs. Python entry point?**
   - What we know: CONTEXT.md leaves "build invocation" to Claude's discretion, with the criterion "what makes Phase 9 install.sh cleanest."
   - What's unclear: Phase 9 isn't designed yet.
   - Recommendation: Phase 1 ships `frontend/package.json` with `"build": "vite build"`. Phase 9 install.sh runs `cd frontend && npm ci && npm run build`. No special harness needed — npm scripts are the de facto standard. Don't over-engineer Phase 1.

## Sources

### Primary (HIGH confidence)

- Context7 `/websites/sqlalchemy_en_20` — async aiosqlite engine, AsyncSession patterns, async ORM example
- Context7 `/websites/sqlmodel_tiangolo` — FastAPI session-with-dependency pattern
- Context7 `/websites/alembic_sqlalchemy` — async env.py, batch mode, programmatic invocation
- Context7 `/pydantic/pydantic-settings` — BaseSettings, env_file, SettingsConfigDict
- Context7 `/websites/fastapi_tiangolo` — lifespan asynccontextmanager pattern
- Context7 `/tanstack/router` — Vite plugin ordering, file-based routing setup
- Context7 `/websites/vite_dev` — server.proxy config, build.outDir
- [SQLAlchemy 2.0 SQLite dialect](https://docs.sqlalchemy.org/en/20/dialects/sqlite.html) — exact pragma + foreign_keys autocommit pattern
- [Alembic Cookbook](https://alembic.sqlalchemy.org/en/latest/cookbook.html) — Conditional Migration Elements, Sharing a Connection, async setup
- [FastAPI Lifespan Events](https://fastapi.tiangolo.com/advanced/events/) — replaces deprecated on_event
- [pydantic-settings docs](https://github.com/pydantic/pydantic-settings) — env_file precedence, dotenv loading
- [Pydantic ValidationError reference](https://docs.pydantic.dev/latest/errors/errors/) — `.errors()` method shape
- [SQLite WAL mode](https://sqlite.org/wal.html) — activation rules, NFS warning, pragma persistence
- [TanStack Router Vite Plugin Setup](https://tanstack.com/router/v1/docs/framework/react/start/quick-start) — required plugin order
- npm registry — verified versions for `react@19.2.5`, `vite@8.0.10`, `@vitejs/plugin-react@6.0.1`, `@tanstack/react-router@1.168.24`, `@tanstack/router-plugin@1.167.26` (all retrieved 2026-04-25)
- pip index — verified versions for `fastapi@0.136.1`, `sqlalchemy@2.0.49`, `sqlmodel@0.0.38`, `alembic@1.18.4`, `aiosqlite@0.22.1`, `pydantic-settings@2.14.0`, `uvicorn@0.46.0` (all retrieved 2026-04-25)

### Secondary (MEDIUM confidence)

- [TestDriven.io: FastAPI with Async SQLAlchemy, SQLModel, and Alembic](https://testdriven.io/blog/fastapi-sqlmodel/) — practical async patterns; verified against SQLAlchemy/SQLModel official docs
- [GitHub: SQLAlchemy autocommit/foreign_keys discussion #12767](https://github.com/sqlalchemy/sqlalchemy/discussions/12767) — confirms autocommit toggling requirement; verified by SQLAlchemy maintainers
- [GitHub: FastAPI SPA discussion #5134](https://github.com/fastapi/fastapi/discussions/5134) — SPAStaticFiles pattern; widely adopted, multiple production examples
- Project's own `.planning/research/STACK.md` (HIGH for version verification) and `PITFALLS.md` (HIGH for SQLite-under-load edge cases) — but treat as superseded re: ORM/raw-SQL question

### Tertiary (LOW confidence)

- None used for normative claims in this research. All key claims are verified against primary or cross-verified secondary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against pip/npm registries today (2026-04-25); all libraries are mainstream and stable
- Architecture: HIGH — every pattern is verbatim from official docs (FastAPI, SQLAlchemy, Alembic, Vite, TanStack Router) with explicit citations
- Pitfalls: HIGH — most pitfalls verified directly in official docs (SQLite WAL, foreign_keys autocommit) or in widely-reported issues (TanStack Router plugin order); all carry CITED tags
- Schema (15 tables): MEDIUM — list is inferred from PROJECT.md + REQUIREMENTS.md; assumption A1 flagged as needing user confirmation before initial Alembic revision

**Research date:** 2026-04-25
**Valid until:** 2026-05-25 (30 days for stack stability — re-verify versions before Phase 1 execution if older)
