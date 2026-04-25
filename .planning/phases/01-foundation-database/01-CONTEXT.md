# Phase 1: Foundation & Database - Context

**Gathered:** 2026-04-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Stand up the backend skeleton and database that every later phase builds on:
- FastAPI server using app factory pattern with lifespan manager
- SQLite database (WAL mode) with all 15 tables created
- Configuration loaded from environment + .env with validation
- React SPA shell that loads in a browser at http://localhost:8765

Out of scope (later phases): data ingestion, API endpoints beyond a health check, panels, dispatcher, installer.

</domain>

<decisions>
## Implementation Decisions

### Database access & schema
- ORM: **SQLAlchemy ORM / SQLModel** (model classes for the 15 tables)
- Driver: **async (aiosqlite)** — native async DB calls inside FastAPI
- Schema management: **Alembic** — initial revision creates all 15 tables; future phases add migrations
- WAL mode + sane PRAGMAs (foreign_keys=ON, etc.) configured at engine/connection setup
- DB file location: **Claude's discretion** during planning

### Configuration & validation
- Library: **pydantic-settings** (Pydantic v2 BaseSettings)
- Defaults philosophy: **sensible defaults everywhere; nothing required** — fresh clone boots out of the box
- .env: **single `.env` in repo root, gitignored, auto-loaded**; `.env.example` committed for documentation
- Validation failure UX: **pretty error** — list missing/invalid vars with hints, then exit cleanly (no raw Pydantic traceback)

### Project & module layout
- Top-level: **`backend/` + `frontend/`** at repo root, each with its own deps and tooling
- Python package: **single `cmc` package with modular subpackages** (e.g. `cmc/api`, `cmc/db`, `cmc/config`, `cmc/core`)
- FastAPI routers: **one router per resource** under `cmc/api/routes/` (e.g. `sessions.py`, `tasks.py`, `health.py`) — pattern set now so Phases 3 & 4 plug in cleanly

### Frontend integration & dev workflow
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

</decisions>

<specifics>
## Specific Ideas

- The success criterion is "visit http://localhost:8765 and the React SPA loads" — keep the Phase 1 SPA minimal (any route renders something) so the bar is just "the pipe works end to end".
- Router-per-resource layout chosen specifically because Phases 3 (read-only APIs) and 4 (stateful APIs) will add many endpoints — set the pattern now.
- pydantic-settings + zero required vars optimizes for a local-first dev tool: clone, run, it works. Required-only-with-defaults aligns with "single command to start the server" success criterion.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Auth, ingestion, API endpoints, panels, dispatcher, installer all already mapped to their own phases in ROADMAP.md.)

</deferred>

---

*Phase: 01-foundation-database*
*Context gathered: 2026-04-25*
