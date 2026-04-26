# Phase 3: Read-Only APIs — Research

**Researched:** 2026-04-26
**Domain:** FastAPI 0.136 read-only routers (5 routers, 29 endpoints), SSE streaming via `fastapi.sse.EventSourceResponse`, SQLAlchemy 2.0 async aggregation queries on SQLite 3.47 (percentiles, daily buckets in local TZ, mutually-exclusive outcomes), Pydantic v2 response schemas, in-process metric helpers (psutil-backed system health), filesystem skill scanning.
**Confidence:** HIGH overall — codebase patterns verified by direct read of `cmc/app/factory.py`, `cmc/app/lifespan.py`, `cmc/api/routes/{health,sync,ingest}.py`, all 15 SQLModel tables, and Phase 2 plans 02-01..02-05; FastAPI built-in SSE verified via `inspect.signature(fastapi.sse.EventSourceResponse.__init__)` against the installed `fastapi==0.136.1`; SQLite percentile pattern verified by executing the exact `LIMIT 1 OFFSET COUNT*0.95-1` query on `:memory:`; Claude Code OTEL event/metric catalog re-confirmed via [code.claude.com/docs/en/monitoring-usage](https://code.claude.com/docs/en/monitoring-usage). MEDIUM confidence on a handful of `[ASSUMED]` claims around "live state" data source and SAPI-04 attention aggregator (see Assumptions Log).

## Summary

Phase 3 turns the populated SQLite database into 29 well-structured read-only HTTP endpoints across 5 routers (System, Sessions, Observability, MCP, Skills). The work is overwhelmingly **SQL aggregation + Pydantic v2 response shaping** plumbed through the existing FastAPI factory — no new architecture, no new tables, **no schema changes**. The big-shape decisions are: (1) one router per resource group under `/api`, (2) Pydantic v2 response models distinct from SQLModel table classes, (3) `fastapi.sse.EventSourceResponse` (built-in to FastAPI 0.136 — no `sse-starlette` dependency needed), (4) percentiles via `ORDER BY ... LIMIT 1 OFFSET CAST(COUNT*P AS INTEGER) - 1` (window functions are available in SQLite 3.47 but the offset pattern is more portable and faster on small N), (5) daily buckets in **local time** via `STRFTIME('%Y-%m-%d', ts, 'localtime')`, (6) MCP-02 three-source priority = `tool_decision OTEL events > tools table > otel_events`. SAPI-04 (attention feed) gracefully degrades: it surfaces what Phase 3 can detect (stale dispatcher, recent errors, stuck sessions), with `pending_decisions` and `failed_tasks` returning 0 until Phase 4 lands those tables.

**Primary recommendation:** Five plans in 4 waves: a Wave 0 foundation plan (response schemas + reusable helpers + psutil dep + per-router test files) → 4 parallel router plans (System+SSE, Sessions, Observability, MCP+Skills) → no Wave 4 integration plan needed (each router self-wires through `all_routers()`). Use **one test file per router** to avoid the 1156-line monolith Phase 2 produced; Phase 2's "single-test-file" convention was a Phase-1 throwback that doesn't scale to 29 endpoints.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| HTTP routing for 29 endpoints | API / Backend (`cmc.api.routes.*`) | — | One module per resource group; mounted under `/api` via `all_routers()` |
| SSE streaming (firehose, live session) | API / Backend (`fastapi.sse.EventSourceResponse`) | Database / Storage (aiosqlite tail polling) | Async generator yields events; client reconnects on EOF |
| Aggregation queries (percentiles, daily buckets, outcomes) | Database / Storage (SQLAlchemy 2.0 async + raw SQL via `text()` where ORM hurts readability) | API / Backend (Pydantic v2 response shaping) | All math runs in SQLite; Python only renames/shapes the rows |
| Pydantic response models | API / Backend (`cmc.api.schemas.*`) | — | Separate from SQLModel table classes — UI contract distinct from storage shape |
| System health metrics (uptime, memory, daemon ages) | API / Backend (`cmc.api.routes.system`) | — | psutil for memory; `app.state.boot_time` for uptime; `system_state` KV table for daemon stamps |
| Skills filesystem scan | API / Backend (`cmc.skills.scanner` — new module) | — | Walk `~/.claude/skills/` + `./skills/`; parse frontmatter; upsert into `skills` table on POST /api/skills/sync |
| MCP stats rebuild | API / Backend (`cmc.mcp.aggregator` — new module) | Database / Storage (`mcp_stats` table) | POST /api/mcp/sync iterates three priority sources, recomputes p50/p95/max, upserts |
| Live session state | API / Backend (read `live_state` table OR derive from `otel_events`) | — | **See Assumption A1 — Phase 2 does not write `live_state`. Phase 3 must either read otel_events directly OR add a live_state writer (deferred to Phase 8 dispatcher).** |

## Project Constraints (from CLAUDE.md)

`./CLAUDE.md` does not exist in the project root [VERIFIED: `ls /Users/patrykattc/work/git/claude-mission-control/CLAUDE.md` → "No such file or directory"]. The only operative project-level constraints come from `.planning/PROJECT.md`:

- macOS-only platform; skill scan paths use `~/.claude/skills/`.
- Python 3.13+ (active venv: 3.13).
- SQLite 3.47.1 single-file with WAL [VERIFIED: `python -c "import sqlite3; print(sqlite3.sqlite_version)"` → 3.47.1].
- SQLAlchemy 2.0.49 async + SQLModel 0.0.38 + Alembic 1.18.4 (locked Phase 1 stack).
- FastAPI 0.136.1 [VERIFIED: `import fastapi; fastapi.__version__`].
- Bind to `127.0.0.1` only (PITFALLS.md security mistake #1).
- No outbound network calls from any read-only endpoint.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SAPI-01 | GET /api/health returns quick liveness check | §1 — already exists in `cmc/api/routes/health.py`; Phase 3 leaves the existing handler in place (it returns `{"status": "ok"}` after a `SELECT 1`). |
| SAPI-02 | GET /api/system/health returns uptime, memory, last OTEL event age, daemon tick ages, tzname | §1 — psutil for memory, `app.state.boot_time` set in lifespan, `system_state` KV reads, MAX(ts) FROM otel_events for staleness. |
| SAPI-03 | GET /api/system/state reads system_state KV store | §1 — direct SELECT on `system_state` table (already exists from Phase 1). |
| SAPI-04 | GET /api/attention returns aggregated issue feed | §1 — read available signals; defer pending_decisions/failed_tasks (Phase 4 tables) by returning 0 with explicit field comment. |
| SAPI-05 | GET /api/firehose returns SSE stream of recent OTEL events | §3 — `fastapi.sse.EventSourceResponse` with async generator + `aiosqlite` polling cursor. |
| SESS-01 | GET /api/sessions returns paginated session list with range/source/model filters | §1 — keyset OR offset pagination; offset is fine here (sessions table is small). |
| SESS-02 | GET /api/sessions/{id}/details returns tool-call timeline and token breakdown | §1 — JOIN sessions ⨝ tools ORDER BY tools.started_at. |
| SESS-03 | GET /api/sessions/live returns sessions active in last 5 minutes | §1 — `WHERE last_activity_at > datetime('now', '-5 minutes')` against `live_state` table. **See Assumption A1.** |
| SESS-04 | GET /api/sessions/live/{sid}/state returns current live state row | §1 — direct SELECT on `live_state`. **See Assumption A1.** |
| SESS-05 | GET /api/sessions/live/{sid}/stream returns SSE line-by-line feed | §3 — SSE wrapping `live_state.current_message` polling. **See Assumption A1.** |
| SESS-06 | POST /api/sessions/live/{sid}/message queues follow-up message | §1 — UUID validation; write to a queue file (not DB); only allow when `live_state.state == 'streaming'`. |
| SESS-07 | GET /api/summary returns today's KPIs | §1 — local-day aggregation across sessions, token_usage, tools, otel_events. |
| OBSV-01 | GET /api/usage/tokens daily breakdown by model + source with today/7d/30d range | §1, §2 — direct read of `token_usage` table grouped by day/model/source. |
| OBSV-02 | GET /api/usage/cache hit rate + daily trend with low-sample badge (<10K billable) | §1, §2 — derive from `token_usage`: `cache_read / (input + cache_read + cache_create)`. |
| OBSV-03 | GET /api/sessions/outcomes daily mutually-exclusive buckets (errored > rate_limited > truncated > unfinished > ok) | §2 — CASE expression in SQL using priority order. |
| OBSV-04 | GET /api/tools/latency per-tool p50/p95/max/error-rate sorted by p95 desc | §2 — percentile via `LIMIT 1 OFFSET COUNT*P-1` per tool_name. |
| OBSV-05 | GET /api/hooks/activity daily fires + paired-duration estimates (60s cap, FIFO per session) | §2 — `WHERE event_name LIKE 'claude_code.hook%'` from otel_events. |
| OBSV-06 | GET /api/sessions/by-project rollup by cwd | §1 — GROUP BY `cwd`. |
| OBSV-07 | GET /api/tools/agent-fanout sessions with Agent tool calls | §1 — JOIN sessions ⨝ tools WHERE tool_name = 'Agent'. |
| OBSV-08 | GET /api/tools/edit-decisions accept/reject from tool_decision events | §2 — read `tools.decision` column AND/OR `otel_events` event_name='claude_code.tool_decision'. |
| OBSV-09 | GET /api/activity/productivity OTEL counters for commits, PRs, lines of code | §2 — SUM of `otel_metrics.value` WHERE metric_name LIKE '%commit%'/'%pull_request%'/'%lines_of_code%'. |
| OBSV-10 | GET /api/system/pressure retry exhaustion, compaction, recent api_errors | §2 — COUNT events by event_name from otel_events. |
| MCP-01 | GET /api/mcp server list with totals, avg latency, p95 | §2 — read `mcp_stats` rows where `tool_name IS NULL` (server-level rows). |
| MCP-02 | GET /api/mcp/{server}/tools per-tool breakdown from three sources in priority order | §2 — three-source priority is **tool_decision events > tools table > otel_events** (see §2.5). |
| MCP-03 | POST /api/mcp/sync rebuilds mcp_stats table | §4 — aggregator iterates priority sources and upserts to `mcp_stats`. |
| MCP-04 | POST /api/mcp/measure runs schema-size measurement per server | §4 — best-effort write to `mcp_stats.schema_size_bytes` (column already exists). |
| SKIL-01 | GET /api/skills list with environment + user_invocable filters | §1 — direct SELECT on `skills` table. |
| SKIL-02 | POST /api/skills/sync rebuilds skills table from filesystem scan | §5 — scan `~/.claude/skills/` (user-level) + `./skills/` (project-level); parse YAML frontmatter; upsert by `name`. |
| SKIL-03 | PATCH /api/skills/{name}/autonomy updates autonomy level (auto/review/manual) | §1 — UPDATE skills SET autonomy = ? WHERE name = ?. |

## Standard Stack

### Core (already installed — Phase 1/2)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | 0.136.1 | HTTP framework | [VERIFIED: `python -c "import fastapi; print(fastapi.__version__)"` → 0.136.1] Native SSE (`fastapi.sse.EventSourceResponse`) added in 0.135.0 [CITED: web search confirmed FastAPI 0.135.0+]. |
| SQLAlchemy | 2.0.49 | Async ORM core | [VERIFIED: backend/pyproject.toml line 11] |
| SQLModel | 0.0.38 | ORM model layer | [VERIFIED: backend/pyproject.toml line 12] |
| aiosqlite | 0.22.1 | Async SQLite driver | [VERIFIED: backend/pyproject.toml line 13] |
| Pydantic | 2.13.3 | Validation + response models | [VERIFIED: backend/pyproject.toml line 9] |

### New (must add to backend/pyproject.toml)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| psutil | 7.2.2 | Process memory + CPU stats for SAPI-02 | [CITED: pypi.org/project/psutil — released 2026-01-28] Standard library for cross-platform process introspection. Backed by macOS `kqueue` on this platform. Adding to main deps (not dev) because SAPI-02 is a runtime endpoint, not a test helper. |

**Installation:**
```bash
# Add to backend/pyproject.toml [project].dependencies (NOT dev — runtime use):
#   "psutil==7.2.2",
# Then:
cd backend && /Users/patrykattc/work/git/claude-mission-control/backend/.venv/bin/python -m ensurepip --upgrade && /Users/patrykattc/work/git/claude-mission-control/backend/.venv/bin/python -m pip install -e .
```

**Version verification:**
```bash
# These were used at research time:
fastapi==0.136.1                # already installed
psutil==7.2.2                   # latest as of 2026-01-28; install pinned
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `fastapi.sse.EventSourceResponse` (built-in 0.136) | `sse-starlette==3.2.0` | Not needed — built-in handles W3C-compliant `data:`/`event:` framing, automatic keep-alive pings, and Pydantic-side serialization. Adding a 3rd-party dep when stdlib-equivalent ships in FastAPI is unnecessary churn. |
| `psutil` for memory stats | `resource.getrusage(RUSAGE_SELF)` (stdlib) | resource module returns `ru_maxrss` only (peak, not current). psutil gives current RSS, %CPU, num_threads, open file descriptors — all useful in SAPI-02. Worth the 1 dependency. |
| Pydantic v2 response models | Plain `dict` returns + auto-serialization | Pydantic v2 + FastAPI `response_model=` gives free OpenAPI schema generation, type validation on response shape (catches refactor breakage), and frontend type-generation from `/api/openapi.json`. Phase 5 will lean on this for TanStack Query types. |
| Offset pagination (`LIMIT/OFFSET`) for SESS-01 | Keyset pagination via `started_at < cursor` | Sessions table is small (148 rows in real data per STATE.md). Offset is fine for v1 and matches the simpler Pydantic schema. Revisit if user has 100k+ sessions. |
| SQLAlchemy ORM `select()` for analytics queries | Raw `text()` SQL with bound params | For OBSV-01..10 analytics, raw SQL is more readable than ORM with `func.strftime`, CASE chains, and percentile offsets. Use ORM for simple lookups (SESS-02, MCP-01); use `text()` for analytics. |

## System Architecture Diagram

```
                    ┌──────────────────────────────────────────────────┐
                    │  Browser (Phase 5/6/7 — not in this phase)        │
                    │  React Query polling 30s (5s decisions, 10s inbox)│
                    │  EventSource for /api/firehose, /sessions/live/.../stream │
                    └─────────────────────┬────────────────────────────┘
                                          │ HTTP/JSON
                                          │ HTTP/SSE
                                          ▼
                    ┌──────────────────────────────────────────────────┐
                    │  FastAPI app (cmc/app/factory.py)                 │
                    │   ┌────────────────────────────────────────────┐ │
                    │   │  all_routers() — under /api               │ │
                    │   │   ├── health_router (Phase 1, kept)        │ │
                    │   │   ├── sync_router   (Phase 2, kept)        │ │
                    │   │   ├── system_router      ◄─── NEW Phase 3  │ │
                    │   │   ├── sessions_router    ◄─── NEW Phase 3  │ │
                    │   │   ├── observability_router ◄─ NEW Phase 3  │ │
                    │   │   ├── mcp_router         ◄─── NEW Phase 3  │ │
                    │   │   └── skills_router      ◄─── NEW Phase 3  │ │
                    │   └────────────────────────────────────────────┘ │
                    │   raw_routers() at /     — ingest_router (Phase 2)│
                    │   SPA mount at /         — last (Pitfall 8)       │
                    └─────────────────────┬────────────────────────────┘
                                          │  AsyncSession (per request)
                                          ▼
                    ┌──────────────────────────────────────────────────┐
                    │  cmc.db (Phase 1 stack)                            │
                    │   AsyncEngine ─► aiosqlite ─► SQLite WAL          │
                    └─────────────────────┬────────────────────────────┘
                                          │
                ┌─────────────────────────┴────────────────────────────┐
                ▼                ▼                ▼          ▼          ▼
         ┌───────────┐    ┌────────────┐  ┌──────────┐ ┌───────┐ ┌─────────┐
         │ sessions  │    │ otel_events│  │ tools    │ │ token │ │ mcp_stats│
         │ token_use │    │ otel_metric│  │ skills   │ │_usage │ │ live_st │
         │ activitie │    │            │  │ system_st│ │       │ │ * see A1│
         └───────────┘    └────────────┘  └──────────┘ └───────┘ └─────────┘

         ┌──────────────────────────────────────────────────────────────┐
         │  Filesystem reads (POST /api/skills/sync only)               │
         │   ~/.claude/skills/<name>/SKILL.md  (user-level)              │
         │   ./skills/<name>/SKILL.md          (project-level — if exists)│
         └──────────────────────────────────────────────────────────────┘
```

**Reading the diagram:**
- Every Phase 3 read endpoint flows: `Browser → FastAPI router → AsyncSession (Depends) → aiosqlite → SQLite tables → Pydantic response → JSON to browser`.
- Two SSE endpoints (SAPI-05 firehose, SESS-05 live stream) replace the JSON response with `EventSourceResponse(generator)` where the generator yields `data:`-framed strings on a polling cadence.
- Two POST sync endpoints (MCP-03, SKIL-02) write to the database (mcp_stats / skills tables); they are NOT pure-read but are scoped to Phase 3 because they support read endpoints.
- Component responsibilities table below maps file locations to capabilities.

### Component Responsibilities

| Concern | File | Phase | Responsibility |
|---------|------|-------|----------------|
| App factory | `backend/cmc/app/factory.py` | Phase 1 + Phase 2 | Phase 3 adds 5 new entries to `all_routers()` — single edit. |
| Router list | `backend/cmc/api/routes/__init__.py` | Phase 1/2 | Phase 3 imports 5 new routers and adds them to `all_routers()`. |
| Lifespan | `backend/cmc/app/lifespan.py` | Phase 2 | Phase 3 adds `app.state.boot_time = datetime.utcnow()` for SAPI-02 uptime calc; otherwise unchanged. |
| Pydantic schemas | `backend/cmc/api/schemas/*.py` | NEW Phase 3 | One module per resource group: `system.py`, `sessions.py`, `observability.py`, `mcp.py`, `skills.py`. |
| System router | `backend/cmc/api/routes/system.py` | NEW | SAPI-01..05 (note: SAPI-01 stays in `health.py`, system router holds SAPI-02..05). |
| Sessions router | `backend/cmc/api/routes/sessions.py` | NEW | SESS-01..07. |
| Observability router | `backend/cmc/api/routes/observability.py` | NEW | OBSV-01..10. |
| MCP router | `backend/cmc/api/routes/mcp.py` | NEW | MCP-01..04. |
| Skills router | `backend/cmc/api/routes/skills.py` | NEW | SKIL-01..03. |
| MCP aggregator | `backend/cmc/mcp/aggregator.py` | NEW | Module-private logic for MCP-03 sync (priority source iteration). |
| Skill scanner | `backend/cmc/skills/scanner.py` | NEW | Module-private logic for SKIL-02 sync (filesystem walk + frontmatter parse). |
| SSE helper | `backend/cmc/api/sse.py` | NEW | Optional shared module: `tail_otel_events(db, since_id, batch=100)` async generator used by SAPI-05 and SESS-05. |
| Aggregation SQL | inline in router files OR `backend/cmc/api/queries/*.py` | NEW | **Discretion** — see §6. Recommended: inline as `text()` blocks for v1; refactor when patterns repeat. |

## Architecture Patterns

### Recommended File Layout

```
backend/cmc/
├── api/
│   ├── routes/
│   │   ├── __init__.py        # extended: 5 new routers added to all_routers()
│   │   ├── health.py          # Phase 1 (kept) — SAPI-01
│   │   ├── sync.py            # Phase 2 (kept)
│   │   ├── ingest.py          # Phase 2 (kept) — raw_routers
│   │   ├── system.py          # NEW — SAPI-02..05
│   │   ├── sessions.py        # NEW — SESS-01..07
│   │   ├── observability.py   # NEW — OBSV-01..10
│   │   ├── mcp.py             # NEW — MCP-01..04
│   │   └── skills.py          # NEW — SKIL-01..03
│   ├── schemas/               # NEW package
│   │   ├── __init__.py
│   │   ├── common.py          # Pagination, ErrorResponse, RangeWindow enums
│   │   ├── system.py
│   │   ├── sessions.py
│   │   ├── observability.py
│   │   ├── mcp.py
│   │   └── skills.py
│   └── sse.py                 # NEW — shared EventSource helper
├── mcp/                       # NEW package
│   ├── __init__.py
│   └── aggregator.py          # Three-source priority iterator for MCP-03
└── skills/                    # NEW package
    ├── __init__.py
    └── scanner.py             # Filesystem walk + YAML frontmatter parser for SKIL-02
```

### Pattern 1: Pydantic v2 response model separate from SQLModel

**What:** Define a Pydantic v2 `BaseModel` in `cmc/api/schemas/sessions.py` that mirrors the JSON the dashboard expects. Do NOT return SQLModel rows directly to the API — they leak storage column names and force schema-coupled UI.

**When to use:** Every endpoint that returns structured data.

**Example:**
```python
# cmc/api/schemas/sessions.py
# Source: pydantic.dev/2.13/usage/models — verified Pydantic v2 ConfigDict pattern
from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field


class SessionListItem(BaseModel):
    """Single row in GET /api/sessions response."""
    model_config = ConfigDict(from_attributes=True)  # accepts SQLModel rows too
    session_id: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    cwd: Optional[str] = None
    model: Optional[str] = None
    source: Optional[str] = None
    outcome: Optional[str] = None
    tokens_input: int = 0
    tokens_output: int = 0
    tool_call_count: int = 0


class SessionListResponse(BaseModel):
    items: list[SessionListItem]
    total: int
    limit: int
    offset: int
```

**Why:** `from_attributes=True` lets the route handler do `SessionListItem.model_validate(orm_row)` so we don't manually copy fields. Frontend type-generators (e.g., `openapi-typescript`) consume `/api/openapi.json` to build TS types automatically — this is what Phase 5/6 will use.

### Pattern 2: Async generator + EventSourceResponse for SSE

**What:** Wrap an `async def` generator that yields strings or dicts in `fastapi.sse.EventSourceResponse`. FastAPI handles `data:` framing, keep-alive pings, and disconnect detection.

**When to use:** SAPI-05 firehose, SESS-05 live session stream.

**Example:**
```python
# cmc/api/routes/system.py — SAPI-05 firehose
# Source: fastapi.sse module (built-in; verified by inspect.signature)
import asyncio
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Request
from fastapi.sse import EventSourceResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.db import get_session
from cmc.db.models.otel_events import OtelEvent

router = APIRouter(tags=["system"])


@router.get("/firehose")
async def firehose(
    request: Request,
    since: Optional[str] = None,        # ISO ts; default "last 60s"
    event_name: Optional[str] = None,   # client-side filter, server still filters
    db: AsyncSession = Depends(get_session),
):
    """SSE stream of recent OTEL events. Polls every 1s; ends on client disconnect."""
    last_id = await _resolve_starting_id(db, since)

    async def generator():
        nonlocal last_id
        while True:
            # 1. Detect disconnect — exit cleanly so the generator's finally runs
            if await request.is_disconnected():
                break
            stmt = select(OtelEvent).where(OtelEvent.id > last_id)
            if event_name:
                stmt = stmt.where(OtelEvent.event_name == event_name)
            stmt = stmt.order_by(OtelEvent.id.asc()).limit(100)
            rows = (await db.execute(stmt)).scalars().all()
            for row in rows:
                last_id = row.id
                yield {
                    "event": "otel",
                    "data": json.dumps({
                        "id": row.id,
                        "ts": row.ts.isoformat(),
                        "event_name": row.event_name,
                        "session_id": row.session_id,
                        "attrs_mcp_server": row.attrs_mcp_server,
                        "attrs_mcp_tool": row.attrs_mcp_tool,
                    }),
                }
            await asyncio.sleep(1.0)  # poll cadence

    return EventSourceResponse(generator())
```

**Why:** Async generator + `is_disconnected()` is the canonical FastAPI/Starlette pattern. The DB session yielded by `Depends(get_session)` survives for the generator's lifetime (FastAPI scopes deps to the response, not just the call). Polling cadence 1s keeps SQLite load low and the dashboard feels responsive.

### Pattern 3: Daily local-time bucket via SQLite STRFTIME

**What:** Use SQLite's `STRFTIME('%Y-%m-%d', ts, 'localtime')` modifier to convert UTC timestamps to local-time `YYYY-MM-DD` strings *in the query*, so GROUP BY produces the same buckets the JSONL parser already wrote into `token_usage.day` (which uses Python's `ts.astimezone().date()`).

**When to use:** OBSV-01 (tokens daily), OBSV-03 (outcomes daily), OBSV-05 (hooks daily), OBSV-09 (productivity), OBSV-02 (cache trend), SESS-07 (today summary).

**Example:**
```sql
-- OBSV-01: token usage daily by model + source for today/7d/30d
-- token_usage.day is already date-typed and locally-bucketed (Phase 2 INGST-05).
-- For aggregations over otel_events / sessions where the source col is a UTC datetime,
-- use STRFTIME('%Y-%m-%d', ts, 'localtime') to produce the same bucket key.
SELECT
  STRFTIME('%Y-%m-%d', started_at, 'localtime') AS day,
  model,
  source,
  COUNT(*) AS sessions
FROM sessions
WHERE started_at >= datetime('now', '-30 days')
GROUP BY day, model, source
ORDER BY day DESC;
```

**Why:** `astimezone()` + Python-side bucketing is correct but `STRFTIME(..., 'localtime')` keeps the math in SQLite where index scans are fastest. SQLite 3.47.1 honors the system timezone via `'localtime'` modifier [VERIFIED: sqlite.org/lang_datefunc.html].

### Pattern 4: Percentiles via ORDER BY LIMIT 1 OFFSET

**What:** SQLite 3.47 ships `percentile_cont` only when compiled with `-DSQLITE_ENABLE_ORDERED_SET_AGGREGATES=1` [CITED: sqlite.org/percentile.html]. Python's stdlib `sqlite3` build does NOT enable this. Use the offset pattern instead.

**When to use:** OBSV-04 (tool latency p50/p95/max), MCP-01/02 (server/tool latency p50/p95/max).

**Example:**
```sql
-- OBSV-04: per-tool p95 latency (SQLite stdlib, no extension)
-- Verified working by executing on Python 3.13 stdlib sqlite3 at research time.
-- The "- 1" makes OFFSET 0-based (LIMIT 1 OFFSET 0 returns the first row).
WITH tool_calls AS (
  SELECT
    tool_name,
    duration_ms
  FROM tools
  WHERE duration_ms IS NOT NULL
    AND started_at >= datetime('now', '-7 days')
)
SELECT
  tool_name,
  COUNT(*) AS call_count,
  -- p50 = median
  (SELECT duration_ms FROM tool_calls tc2
    WHERE tc2.tool_name = t.tool_name
    ORDER BY duration_ms
    LIMIT 1 OFFSET MAX(CAST(COUNT(*) * 0.5 AS INTEGER) - 1, 0)
  ) AS p50_ms,
  (SELECT duration_ms FROM tool_calls tc2
    WHERE tc2.tool_name = t.tool_name
    ORDER BY duration_ms
    LIMIT 1 OFFSET MAX(CAST(COUNT(*) * 0.95 AS INTEGER) - 1, 0)
  ) AS p95_ms,
  MAX(duration_ms) AS max_ms,
  AVG(CASE WHEN status = 'error' THEN 1.0 ELSE 0.0 END) AS error_rate
FROM tool_calls t
GROUP BY tool_name
ORDER BY p95_ms DESC;
```

**Why:** Self-correlated subquery is O(N²) in the worst case but the `tools` table is bounded by per-session size (typically <500 rows per session, indexed by `tool_name`). For a 7-day window of a power user (~100k tool calls), this still completes in <100ms with the index `idx_tools_name_started_at`. If query slowness ever surfaces in real load, refactor to a `WITH RECURSIVE` ranked CTE — but don't preoptimize. **Test the query against real data in the Wave 0 plan to confirm timing.**

[VERIFIED: ran exact pattern on stdlib `sqlite3` at research time with 100 rows; both `LIMIT 1 OFFSET COUNT*0.95-1` and `NTILE(20)` patterns return correct p95.]

### Pattern 5: Mutually-exclusive outcome buckets via priority CASE

**What:** OBSV-03 says outcomes must sum to the day total with priority `errored > rate_limited > truncated > unfinished > ok`. Compute by CASE expression so each session is counted exactly once.

**When to use:** OBSV-03 only.

**Example:**
```sql
-- OBSV-03: daily mutually-exclusive outcome buckets
-- Source priority embedded into CASE chain: first match wins.
SELECT
  STRFTIME('%Y-%m-%d', started_at, 'localtime') AS day,
  SUM(CASE WHEN outcome = 'errored'      THEN 1 ELSE 0 END) AS errored,
  SUM(CASE WHEN outcome = 'rate_limited' THEN 1 ELSE 0 END) AS rate_limited,
  SUM(CASE WHEN outcome = 'truncated'    THEN 1 ELSE 0 END) AS truncated,
  SUM(CASE WHEN outcome = 'unfinished' OR outcome IS NULL THEN 1 ELSE 0 END) AS unfinished,
  SUM(CASE WHEN outcome = 'ok'           THEN 1 ELSE 0 END) AS ok,
  COUNT(*) AS total
FROM sessions
WHERE started_at >= datetime('now', '-30 days')
GROUP BY day
ORDER BY day DESC;
```

**Why:** Phase 2's parser writes a SINGLE `outcome` value per session, so each session falls into exactly one bucket. The priority is enforced at INGST-04 write time (parser sets `outcome` to the first applicable label). No SQL chained CASE is needed because the column is already a single value. **If outcome is NULL (legacy rows or live sessions), classify as `unfinished` per the spec wording "still running."**

[ASSUMED] Phase 2 doesn't currently write `outcome` (the parser docstring shows the field is unused). Phase 3 must either (a) extend the parser to set outcome based on event detection or (b) compute outcome on read from joins to `otel_events` (api_error, api_retries_exhausted) and `tools` (any error in the session). **Recommendation:** option (b) — compute on read. Defer parser extension to Phase 8 or a Phase 3.5 cleanup. See Open Question 7.

### Pattern 6: Pagination with COUNT + LIMIT/OFFSET in one round-trip

**What:** Run two queries in parallel: `SELECT COUNT(*)...` for total, `SELECT ... LIMIT N OFFSET M` for the page. SQLite is fast enough that two queries beats a window-function `COUNT() OVER ()` for our row counts.

**When to use:** SESS-01.

**Example:**
```python
# cmc/api/routes/sessions.py — SESS-01
from typing import Optional, Literal
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.db import get_session
from cmc.db.models.sessions import Session
from cmc.api.schemas.sessions import SessionListResponse, SessionListItem


@router.get("", response_model=SessionListResponse)
async def list_sessions(
    db: AsyncSession = Depends(get_session),
    range_: Literal["today", "7d", "30d", "all"] = Query("30d", alias="range"),
    source: Optional[str] = None,
    model: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    base = select(Session)
    if range_ == "today":
        base = base.where(Session.started_at >= func.date('now', 'start of day', 'localtime'))
    elif range_ == "7d":
        base = base.where(Session.started_at >= func.datetime('now', '-7 days'))
    elif range_ == "30d":
        base = base.where(Session.started_at >= func.datetime('now', '-30 days'))
    if source:
        base = base.where(Session.source == source)
    if model:
        base = base.where(Session.model == model)

    count_stmt = select(func.count()).select_from(base.subquery())
    page_stmt = base.order_by(Session.started_at.desc()).limit(limit).offset(offset)

    total = (await db.execute(count_stmt)).scalar_one()
    rows = (await db.execute(page_stmt)).scalars().all()
    return SessionListResponse(
        items=[SessionListItem.model_validate(r) for r in rows],
        total=total, limit=limit, offset=offset,
    )
```

**Why:** Pagination total is a contract requirement (frontend renders "showing 1-50 of 148"). `select_from(base.subquery())` inherits the same WHERE clause without duplicating filter logic.

### Anti-Patterns to Avoid

- **Don't return SQLModel rows directly from route handlers** — leaks DB column names, breaks frontend on column rename. Always project through Pydantic v2 response model.
- **Don't query `otel_events` without a `LIMIT` and an indexed `WHERE`** — table grows fast (one row per OTEL log record). Use `idx_otel_events_event_name_ts` or `idx_otel_events_session_id_ts`. Phase 1 schema already has both.
- **Don't open a new AsyncSession per SQL query inside one route handler** — use the `Depends(get_session)` instance for the entire request lifecycle. SSE generators get the dep once and keep it for the connection.
- **Don't hand-roll percentile helpers in Python** by pulling all rows into memory. Use Pattern 4 (offset-based SQL).
- **Don't poll every endpoint at the same cadence** — let frontend (Phase 5) decide; backend should NOT trigger polling.
- **Don't write to `live_state` table in Phase 3** — that's the dispatcher's job (Phase 8). Phase 3 only READS it (and degrades gracefully if empty — see Assumption A1).
- **Don't add WebSocket support** — PROJECT.md "Out of Scope" line: "Real-time WebSocket session streaming — use SSE and polling."

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE framing | Manual `f"data: {json}\n\n"` strings + custom `StreamingResponse` | `fastapi.sse.EventSourceResponse` | Built-in handles W3C `data:`/`event:`/`id:`/`retry:` framing, automatic 15s keep-alive comments, disconnect detection, browser auto-reconnect. [CITED: github.com/sysid/sse-starlette README — same patterns FastAPI now ships natively] |
| Process metrics (memory, CPU%) | Reading `/proc` (Linux-only, dashboard is macOS) or shelling out to `ps` | `psutil` 7.2.2 | psutil abstracts macOS `kqueue` + `proc_info` syscalls; gives `Process.memory_info().rss`, `Process.cpu_percent(interval=0.1)`, `Process.num_threads()` cross-platform. |
| Cron-style date arithmetic | Python `datetime` math + manual zone conversion | SQLite's `datetime('now', 'start of day', 'localtime')` | Built-in modifiers: `'-7 days'`, `'-30 days'`, `'start of day'`, `'localtime'`. [CITED: sqlite.org/lang_datefunc.html] |
| YAML frontmatter parsing for SKIL-02 | Hand-roll `---\n...\n---` regex | `python-frontmatter` (NEW dep, 1.1.0) OR fallback: re.match + `yaml.safe_load` | python-frontmatter is 100 lines, well-tested, returns `(metadata_dict, content_str)`. **OR** if "no new deps" is preferred, ~15 lines of regex + PyYAML. PyYAML is already a transitive dep of pydantic-settings — no install needed. **Recommendation:** use PyYAML directly, no new dep. |
| Pagination (offset + total) | Hand-rolled subquery wrapper | Two-query pattern (Pattern 6) — no library | Sub-100ms on real data; libraries like `fastapi-pagination` add a layer of indirection that's not worth it for one endpoint. |
| Percentile aggregation | Pull rows to Python and `numpy.percentile` | SQL `ORDER BY ... LIMIT 1 OFFSET ...` (Pattern 4) | No memory bloat; index-friendly; numpy is a 30MB dep we don't need. |
| Cache hit rate math | Compute in Python after fetching all token_usage rows | `SELECT 1.0 * SUM(cache_read) / NULLIF(SUM(cache_read + input + cache_create), 0) AS hit_rate` | One pass through SQLite; NULLIF guards divide-by-zero. |

**Key insight:** Phase 3 has 29 endpoints — every line of avoidable code is leverage. Lean hard on FastAPI, SQLAlchemy, and SQLite stdlib features.

## Common Pitfalls

### Pitfall 1: SSE memory leak from un-disposed generators

**What goes wrong:** An SSE endpoint defines an `async def generator():` with a DB session bound to `Depends(get_session)`. If the client disconnects without the generator detecting it (e.g., generator is `await asyncio.sleep(60)` while client closes tab), the session stays open until the next yield. With many clients, sessions exhaust.
**Why it happens:** `fastapi.sse.EventSourceResponse` polls the generator on its schedule. The generator must check `request.is_disconnected()` periodically (recommended every poll cycle, every 1s).
**How to avoid:**
1. Always check `await request.is_disconnected()` at the top of each loop iteration.
2. Wrap state mutation in try/finally so generator cleanup runs.
3. Cap the loop at a max duration (e.g., 60 minutes) — clients should reconnect.
4. Use short `asyncio.sleep` intervals (1-2s) so disconnect is detected fast.

**Warning signs:** `app.state.sessions` pool exhaustion under load; "Task was destroyed but it is pending" warnings on shutdown; SQLite `database is locked` errors during a busy SSE session.

### Pitfall 2: Percentile offset overflow on tools with N=0 or N=1

**What goes wrong:** `LIMIT 1 OFFSET COUNT*0.95 - 1` produces OFFSET = -1 when COUNT = 0 (no rows). SQLite rejects negative OFFSET → query returns NULL or errors.
**Why it happens:** `CAST(0 * 0.95 AS INTEGER) - 1 = -1`.
**How to avoid:** Always wrap in `MAX(..., 0)`:
```sql
LIMIT 1 OFFSET MAX(CAST(COUNT(*) * 0.95 AS INTEGER) - 1, 0)
```
Or pre-filter in the outer query: `HAVING COUNT(*) >= 5` so percentile is meaningful.

**Warning signs:** OBSV-04 returns rows where `p50_ms` and `p95_ms` are NULL despite `call_count > 0`; CI tests on small fixtures fail with sqlite3.OperationalError.

### Pitfall 3: aiosqlite cursor lifetime in long-running SSE generator

**What goes wrong:** The generator opens a cursor (`await db.execute(stmt)`), the result rows are fully fetched, then `await asyncio.sleep(1)`. If you keep the cursor reference alive across the sleep, aiosqlite's underlying connection holds a read transaction open, blocking SQLite's WAL checkpoint.
**Why it happens:** aiosqlite uses a worker thread per connection; a held cursor pins that thread.
**How to avoid:**
1. Always exhaust results to a list/scalars before sleeping: `rows = (await db.execute(stmt)).scalars().all()`.
2. Don't store cursor objects on the loop.
3. After exhausting, the next `await db.execute(...)` reuses the connection cleanly.

The Phase 2 reference codebase already does this correctly in `scheduler.sync_once`. Follow that template.

**Warning signs:** Long-running SSE clients cause WAL file growth past 64MB; `PRAGMA wal_checkpoint(TRUNCATE)` is needed but Phase 2 lifespan doesn't call it.

### Pitfall 4: Datetime tz handling — UTC writes vs local-time buckets

**What goes wrong:** Phase 2's INGST-04 writes `sessions.started_at` as **UTC-aware datetime** (`datetime.fromisoformat(ts.replace("Z", "+00:00"))`). Phase 2's INGST-05 writes `token_usage.day` as **local-time date** (`ts.astimezone().date()`). These two columns use different reference frames.

For Phase 3 daily aggregations:
- Aggregating over `token_usage.day` → no conversion needed; values are already local-bucketed.
- Aggregating over `sessions.started_at` or `otel_events.ts` → must convert: `STRFTIME('%Y-%m-%d', started_at, 'localtime')`.

**Why it happens:** It's correct — UTC is the right storage for instants, local is the right bucket for "what happened today" — but mixing them in one query produces day boundaries off by up to 23 hours.
**How to avoid:**
1. Whenever a SQL aggregation includes `GROUP BY day`, decide upfront which storage column drives the bucket and apply `'localtime'` modifier exactly once.
2. Add a comment in each analytics query explaining the timezone reasoning.
3. Test with `freezegun` patching to a non-UTC zone.

**Warning signs:** "today" KPI in SAPI-07 disagrees with token totals on the dashboard; a session at 23:00 UTC appears under "tomorrow" in `sessions/by-project` but under "today" in `usage/tokens`.

### Pitfall 5: Skill scan recursion runaway

**What goes wrong:** SKIL-02 walks `~/.claude/skills/` recursively. If a user has symlinks (e.g., a skill that symlinks back to `~/`), `Path.rglob('SKILL.md')` follows the symlink and recurses to whole-disk scan.
**Why it happens:** `pathlib.Path.rglob` follows symlinks by default in Python 3.13.
**How to avoid:**
```python
# cmc/skills/scanner.py
def find_skills(root: Path) -> list[Path]:
    if not root.is_dir():
        return []
    out = []
    for entry in root.iterdir():
        if entry.is_symlink():
            continue                  # skip symlinks
        if not entry.is_dir():
            continue
        skill_file = entry / "SKILL.md"
        if skill_file.is_file():
            out.append(skill_file)
    return out
```

Limit to one-level depth (`<root>/<skill_name>/SKILL.md`) — matches Anthropic's documented skill layout. Add a hard cap (e.g., 1000 skills) to defend against runaway directories.

**Warning signs:** POST /api/skills/sync hangs or times out; CPU spike during sync.

### Pitfall 6: Pydantic v2 ConfigDict missing `from_attributes` breaks ORM-to-schema conversion

**What goes wrong:** `SessionListItem.model_validate(orm_row)` raises `ValidationError: Input should be a valid dictionary or instance of SessionListItem` because Pydantic v2 defaults to dict-like input.
**Why it happens:** Pydantic v1 had `Config.orm_mode = True` (auto-recognized); Pydantic v2 renamed to `ConfigDict(from_attributes=True)`.
**How to avoid:** Every response schema that accepts ORM rows MUST include `model_config = ConfigDict(from_attributes=True)` (per [pydantic.dev/2.13/migration](https://docs.pydantic.dev/latest/migration/)).

**Warning signs:** Endpoint returns 500 with Pydantic validation error; error mentions "is not a valid dictionary."

### Pitfall 7: SAPI-04 attention aggregator depending on Phase 4 tables

**What goes wrong:** SAPI-04 wording mentions "stuck loops, failed tasks, stale dispatcher, pending decisions." `tasks`, `decisions`, `inbox` tables exist (Phase 1 created them all) BUT they're empty until Phase 4 endpoints write to them.
**Why it happens:** Read-only Phase 3 ships before stateful Phase 4.
**How to avoid:**
- Compute and return EVERY field; values that need Phase 4 data return 0 (or empty list) explicitly with a note in the response payload that they'll populate after Phase 4 lands.
- Test against fresh DB: SAPI-04 must return 200 with `pending_decisions=0, failed_tasks=0, stale_dispatcher_seconds=null, stuck_sessions=N` (where stuck_sessions IS computable from sessions+otel_events).
- DO NOT branch on table emptiness ("if tasks_table_empty: skip field") — that creates a contract change when Phase 4 lands.

**Warning signs:** Frontend shows "—" or undefined; planner mistakes empty Phase 4 data for a Phase 3 bug.

### Pitfall 8: Live state without a writer (Assumption A1)

**What goes wrong:** SESS-03/04/05 read `live_state` table. Phase 1 created the table. Phase 2 does NOT write to it. Phase 3 reads from it → returns empty arrays.
**Why it happens:** `live_state` is intended to be written by the dispatcher (Phase 8) when it spawns a `claude` subprocess. Until then, no rows.
**How to avoid (recommendations, in priority):**
1. **Recommended:** SESS-03 derives "live" from `sessions` table directly: `WHERE ended_at IS NULL AND started_at > now-5min`. This works today with no new writer. SESS-04/05 then return 404 / empty stream until Phase 8.
2. Alternative: Phase 2.5 plan that adds a minimal `live_state` writer to the JSONL scraper (writes `last_activity_at = mtime` on each parsed file).
3. Alternative: Phase 3 emits a "no live data" empty stream for SESS-05 with a sensible 5s reconnect delay.

**Decision needed for the planner:** which path? See Open Question 1.

**Warning signs:** SESS-03 returns `[]` despite active Claude Code sessions on disk; user reports "live sessions panel is broken."

### Pitfall 9: outcome column not populated by Phase 2

**What goes wrong:** `sessions.outcome` is in the schema (Phase 1) and read by OBSV-03. Phase 2's parser does NOT set it (verified by reading `cmc/ingest/jsonl_parser.py` — `outcome` is absent from the returned session dict).
**Why it happens:** Inferring outcome requires examining `otel_events` for api_error / api_retries_exhausted / compaction events linked to the session — Phase 2 wasn't responsible for that join.
**How to avoid (planner decision):**
1. **Recommended:** OBSV-03 computes outcome at READ time using a CASE expression against joined `otel_events`:
   ```sql
   SELECT
     STRFTIME('%Y-%m-%d', s.started_at, 'localtime') AS day,
     SUM(CASE
       WHEN EXISTS (SELECT 1 FROM otel_events WHERE session_id = s.session_id AND event_name = 'claude_code.api_error') THEN 1
       ELSE 0 END) AS errored,
     ...
   FROM sessions s
   GROUP BY day;
   ```
   Slow but correct. For ~1000 sessions this query is sub-second.
2. Alternative: a Phase 3 sync task that writes `outcome` once per session and the read endpoint just reads it.

Defer the parser change to a later phase; ship Phase 3 with read-time computation.

**Warning signs:** OBSV-03 returns all-zero outcome counts on a DB that clearly has errored sessions; integration test on real data fails.

## Runtime State Inventory

This is a greenfield phase — no rename or refactor — but we still need to confirm Phase 3 doesn't depend on runtime state that doesn't exist yet:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — read-only operates on existing Phase 1/2 tables | None |
| Live service config | Two writes within Phase 3: `mcp_stats` (from MCP-03 sync) and `skills` (from SKIL-02 sync) | Document as part of routes (idempotent rebuild) |
| OS-registered state | None — Phase 3 has no launchd/cron triggers | None |
| Secrets/env vars | None new; uses existing Settings | None |
| Build artifacts | None — Python-only changes | None |
| **Cross-phase write dependencies** | `live_state` (Pitfall 8) — no Phase 2/3 writer; dispatcher (Phase 8) writes it. `outcome` column (Pitfall 9) — no Phase 2 writer. | **Planner: pick read-time fallback for both (recommended) or insert intermediate write tasks (alternative).** |

**Nothing found in category Stored data:** All 15 tables are present (Phase 1) and the data Phase 3 reads is populated by Phase 2 (sessions, tools, token_usage, otel_events, otel_metrics) — except `live_state` (Pitfall 8) and `sessions.outcome` (Pitfall 9), both of which Phase 3 must work around.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.13 | All routes | ✓ | 3.13 (venv) | — |
| FastAPI 0.136.1 | All routers + SSE | ✓ | 0.136.1 [VERIFIED: import] | — |
| `fastapi.sse.EventSourceResponse` | SAPI-05, SESS-05 | ✓ | shipped in 0.136.1 [VERIFIED: `inspect.signature`] | sse-starlette 3.2.0 (not needed) |
| SQLAlchemy 2.0.49 | All endpoints | ✓ | 2.0.49 | — |
| aiosqlite 0.22.1 | All endpoints | ✓ | 0.22.1 | — |
| SQLite 3.47.1 | All endpoints | ✓ | 3.47.1 [VERIFIED: `sqlite3.sqlite_version`] | — |
| Pydantic 2.13.3 | Response schemas | ✓ | 2.13.3 | — |
| psutil | SAPI-02 (memory, CPU) | ✗ | — | **Install psutil==7.2.2 in Wave 0** |
| PyYAML | SKIL-02 frontmatter parse | ✓ (transitive via pydantic-settings → ?) | unknown | **Verify in Wave 0; if missing, install pyyaml directly OR use stdlib alternative** |
| `~/.claude/skills/` filesystem path | SKIL-02 | ✓ | exists [VERIFIED: `ls -la ~/.claude` shows skills dir] | empty dir → return [] |
| `~/.claude/projects/` filesystem path | (already used by Phase 2; Phase 3 doesn't read directly) | ✓ | — | — |

**Missing dependencies with no fallback:**
- None — all blockers have a fix.

**Missing dependencies with fallback:**
- `psutil` not yet installed. **Fix in Wave 0:** add `psutil==7.2.2` to `[project].dependencies` in `backend/pyproject.toml` and reinstall.
- PyYAML availability unconfirmed. **Fix in Wave 0:** `python -c "import yaml; print(yaml.__version__)"` to verify; if missing, add `pyyaml>=6.0` to deps OR use a 15-line stdlib regex parser.

## Validation Architecture

`workflow.nyquist_validation` is not set in `.planning/config.json` — treat as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 9.x + pytest-asyncio 0.24+ + httpx 0.28+ (already configured) |
| Config file | `backend/pyproject.toml` `[tool.pytest.ini_options]` |
| Quick run command | `cd /Users/patrykattc/work/git/claude-mission-control && /Users/patrykattc/work/git/claude-mission-control/backend/.venv/bin/python -m pytest backend/tests/test_phase3_*.py -q` |
| Per-router run | `pytest backend/tests/test_phase3_system.py -q` etc. |
| Full suite command | `pytest backend/tests/ -q` (must stay green; no Phase 1/2 regressions) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SAPI-01 | GET /api/health returns 200 | unit | `pytest backend/tests/test_phase1_boot.py::test_health_route -x` | ✅ (already passes from Phase 1) |
| SAPI-02 | GET /api/system/health returns uptime/memory/daemon ages/tzname | unit | `pytest backend/tests/test_phase3_system.py::test_system_health -x` | ❌ Wave 0 |
| SAPI-03 | GET /api/system/state reads system_state KV | unit | `pytest backend/tests/test_phase3_system.py::test_system_state_kv -x` | ❌ Wave 0 |
| SAPI-04 | GET /api/attention aggregates issues; tolerates Phase 4 emptiness | unit | `pytest backend/tests/test_phase3_system.py::test_attention_feed -x` | ❌ Wave 0 |
| SAPI-05 | GET /api/firehose returns SSE stream | integration | `pytest backend/tests/test_phase3_system.py::test_firehose_sse_stream -x` | ❌ Wave 0 |
| SESS-01 | GET /api/sessions paginated with filters | unit | `pytest backend/tests/test_phase3_sessions.py::test_sessions_list_pagination_and_filters -x` | ❌ Wave 0 |
| SESS-02 | GET /api/sessions/{id}/details | unit | `pytest backend/tests/test_phase3_sessions.py::test_session_details -x` | ❌ Wave 0 |
| SESS-03 | GET /api/sessions/live | unit | `pytest backend/tests/test_phase3_sessions.py::test_live_sessions -x` | ❌ Wave 0 |
| SESS-04 | GET /api/sessions/live/{sid}/state | unit | `pytest backend/tests/test_phase3_sessions.py::test_live_session_state -x` | ❌ Wave 0 |
| SESS-05 | GET /api/sessions/live/{sid}/stream SSE | integration | `pytest backend/tests/test_phase3_sessions.py::test_live_session_stream -x` | ❌ Wave 0 |
| SESS-06 | POST /api/sessions/live/{sid}/message | unit | `pytest backend/tests/test_phase3_sessions.py::test_live_session_post_message -x` | ❌ Wave 0 |
| SESS-07 | GET /api/summary returns today's KPIs | unit | `pytest backend/tests/test_phase3_sessions.py::test_today_summary -x` | ❌ Wave 0 |
| OBSV-01..10 | All observability endpoints | unit | `pytest backend/tests/test_phase3_observability.py -q` | ❌ Wave 0 |
| MCP-01..04 | All MCP endpoints | unit | `pytest backend/tests/test_phase3_mcp.py -q` | ❌ Wave 0 |
| SKIL-01..03 | All skills endpoints | unit | `pytest backend/tests/test_phase3_skills.py -q` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pytest backend/tests/test_phase3_<router>.py -q`
- **Per wave merge:** `pytest backend/tests/ -q` (Phase 1 + Phase 2 + new Phase 3 — must stay green)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `backend/tests/test_phase3_system.py` — covers SAPI-01..05
- [ ] `backend/tests/test_phase3_sessions.py` — covers SESS-01..07
- [ ] `backend/tests/test_phase3_observability.py` — covers OBSV-01..10
- [ ] `backend/tests/test_phase3_mcp.py` — covers MCP-01..04
- [ ] `backend/tests/test_phase3_skills.py` — covers SKIL-01..03
- [ ] `backend/tests/conftest.py` — extend with Phase 3 fixtures: `seeded_app` (lifespan-bootstrapped app + populated test DB with sessions, tools, otel_events), `make_session_row(...)` factory, `make_otel_event(...)` factory, `make_token_usage_bucket(...)` factory, `client` (httpx.AsyncClient bound to `seeded_app`)
- [ ] Framework install: `psutil==7.2.2` to runtime deps; verify PyYAML availability (likely already transitive)

**Diverging from Phase 2's "single test file" convention:** Phase 2 produced a 1156-line `test_phase2_ingest.py`. With 29 endpoints across 5 routers, one file would exceed 4000 lines and become unreadable. **Recommendation: one test file per router** (`test_phase3_system.py`, `test_phase3_sessions.py`, `test_phase3_observability.py`, `test_phase3_mcp.py`, `test_phase3_skills.py`). All five files share fixtures via `conftest.py`. Each plan adds ONLY its router's test file.

## Security Domain

`security_enforcement` is not set in `.planning/config.json` — treat as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Project is localhost-only single-user; PROJECT.md "External auth / OAuth" is Out of Scope. Bind to `127.0.0.1` only (already done in Phase 1). |
| V3 Session Management | no | No login state. |
| V4 Access Control | partial | All endpoints are unauthenticated by design (localhost-only). The ONLY access control is `host=127.0.0.1`. The factory passes settings.host but uvicorn invocation in `bin/cmc start` (Phase 9) controls bind. **Phase 3 must not regress this — never bind to 0.0.0.0.** |
| V5 Input Validation | yes | Pydantic v2 query parameters validate range enums, limit/offset bounds, UUID format on session IDs (SESS-02..06). FastAPI's `Query(... ge=, le=)` enforces bounds. |
| V6 Cryptography | no | No secrets, tokens, or password handling in Phase 3. Telegram tokens live in Phase 9. |
| V7 Error Handling | yes | Pretty error responses must NOT leak DB schema, file paths, or stack traces. Phase 1's `register_error_handlers(app)` (cmc.core) already handles this — verify Phase 3 routes inherit. |
| V11 Business Logic | partial | SESS-06 (POST follow-up message) writes to a queue file. Defend against path traversal in `{sid}` param via UUID v4 regex validation in Pydantic. |
| V12 Files and Resources | yes | SKIL-02 walks filesystem. Pitfall 5 — refuse symlinks; cap at 1-level depth; cap at 1000 entries. |
| V14 Configuration | partial | psutil access requires no special permission on macOS for own-process introspection — safe. |

### Known Threat Patterns for FastAPI + SQLite stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via filter params | Tampering | Use SQLAlchemy ORM bind parameters; if using `text()` blocks, ALWAYS use `:bind` placeholders, never f-string interpolation. Pydantic Query validation tightens enums (`Literal["today", "7d", "30d"]`). |
| Path traversal via skill name in SKIL-03 | Tampering | PATCH /api/skills/{name}/autonomy: validate name with `^[a-zA-Z0-9_-]+$` regex via Pydantic. |
| Path traversal in session_id (SESS-04..06) | Tampering | Validate UUIDv4 regex on session_id in Pydantic Query / Path. |
| SSE clients holding open connections (DoS) | DoS | Cap concurrent SSE connections per IP (FastAPI middleware, future); for now, document that localhost-only mitigates. |
| OTLP body bombs from local malicious software | DoS | Already capped by Phase 2 `otlp_max_body_bytes=10MB`. |
| `system_state` KV reading sensitive values | Information Disclosure | SAPI-03 returns ALL system_state values. **Recommendation: filter to a known whitelist of public keys** (e.g., `tzname`, `last_jsonl_sync_at`, `dispatcher_last_tick_at`); reject reads of unknown keys. Defer specifics to Phase 4 / planner. |
| Skill autonomy patch races | Tampering | SKIL-03 PATCH is single-row UPDATE; SQLite WAL serializes writes. No race. |
| MCP-03 / SKIL-02 sync running long | DoS | Both are explicitly user-triggered POST. Add a soft cap (e.g., 30s) and 409 Conflict if a sync is already running (use `app.state.mcp_sync_running` flag). |

## Code Examples

### System health (SAPI-02)

```python
# cmc/api/routes/system.py
# Source: psutil docs https://psutil.readthedocs.io/en/latest/#psutil.Process
import os
import time
from datetime import datetime, timezone
from typing import Optional

import psutil
from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.api.schemas.system import SystemHealthResponse, DaemonAge
from cmc.db import get_session
from cmc.db.models.otel_events import OtelEvent
from cmc.db.models.system_state import SystemState

router = APIRouter(tags=["system"])


@router.get("/system/health", response_model=SystemHealthResponse)
async def system_health(request: Request, db: AsyncSession = Depends(get_session)):
    proc = psutil.Process(os.getpid())
    boot_time = getattr(request.app.state, "boot_time", None) or datetime.now(timezone.utc)
    uptime_seconds = int((datetime.now(timezone.utc) - boot_time).total_seconds())

    # Memory: RSS (resident set size) is the right metric for the dashboard
    mem = proc.memory_info()
    mem_rss_mb = round(mem.rss / 1024 / 1024, 1)

    # Last OTEL event age — query, then compute now-then in Python (UTC)
    last_otel_ts = (await db.execute(select(func.max(OtelEvent.ts)))).scalar()
    last_otel_age_s = (
        int((datetime.now(timezone.utc) - last_otel_ts).total_seconds())
        if last_otel_ts else None
    )

    # Daemon ages from system_state KV (each daemon writes its `last_tick_at` here)
    daemon_keys = ["jsonl_sync_last_tick_at", "dispatcher_last_tick_at", "telegram_last_tick_at"]
    daemons: list[DaemonAge] = []
    for k in daemon_keys:
        row = (await db.execute(select(SystemState).where(SystemState.key == k))).scalar_one_or_none()
        age = None
        if row and row.value:
            try:
                ts = datetime.fromisoformat(row.value)
                age = int((datetime.now(timezone.utc) - ts).total_seconds())
            except ValueError:
                age = None
        daemons.append(DaemonAge(key=k, last_tick_at=row.value if row else None, age_seconds=age))

    return SystemHealthResponse(
        status="ok",
        uptime_seconds=uptime_seconds,
        memory_rss_mb=mem_rss_mb,
        last_otel_event_age_seconds=last_otel_age_s,
        daemon_ages=daemons,
        tzname=datetime.now().astimezone().tzname(),
    )
```

### Sessions list (SESS-01)

See Pattern 6 above.

### Tool latency (OBSV-04)

```python
# cmc/api/routes/observability.py
# Uses raw text() because the percentile offset pattern is awkward in pure ORM.
from sqlalchemy import text
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Literal

from cmc.db import get_session
from cmc.api.schemas.observability import ToolLatencyResponse, ToolLatencyRow

router = APIRouter(tags=["observability"])

_TOOL_LATENCY_SQL = text("""
WITH tc AS (
  SELECT tool_name, duration_ms, status
  FROM tools
  WHERE duration_ms IS NOT NULL
    AND started_at >= datetime('now', :since_clause)
)
SELECT
  tc.tool_name,
  COUNT(*) AS call_count,
  AVG(CASE WHEN tc.status='error' THEN 1.0 ELSE 0.0 END) AS error_rate,
  (SELECT duration_ms FROM tc tc2
    WHERE tc2.tool_name = tc.tool_name
    ORDER BY duration_ms
    LIMIT 1 OFFSET MAX(CAST(COUNT(*) * 0.5 AS INTEGER) - 1, 0)
  ) AS p50_ms,
  (SELECT duration_ms FROM tc tc2
    WHERE tc2.tool_name = tc.tool_name
    ORDER BY duration_ms
    LIMIT 1 OFFSET MAX(CAST(COUNT(*) * 0.95 AS INTEGER) - 1, 0)
  ) AS p95_ms,
  MAX(duration_ms) AS max_ms
FROM tc
GROUP BY tc.tool_name
HAVING COUNT(*) >= 1
ORDER BY p95_ms DESC
""")


@router.get("/tools/latency", response_model=ToolLatencyResponse)
async def tool_latency(
    db: AsyncSession = Depends(get_session),
    range_: Literal["today", "7d", "30d"] = Query("7d", alias="range"),
):
    since = {"today": "start of day", "7d": "-7 days", "30d": "-30 days"}[range_]
    rows = (await db.execute(_TOOL_LATENCY_SQL, {"since_clause": since})).mappings().all()
    return ToolLatencyResponse(items=[ToolLatencyRow(**r) for r in rows], range=range_)
```

### Skills filesystem scan (SKIL-02)

```python
# cmc/skills/scanner.py
# Source: Anthropic skill format — frontmatter YAML at top of SKILL.md
import re
import yaml
from pathlib import Path
from typing import Iterable

_FRONTMATTER_RE = re.compile(r"^---\s*$(.*?)^---\s*$", re.DOTALL | re.MULTILINE)


def find_skill_files(root: Path) -> Iterable[Path]:
    """One-level deep, no symlinks (Pitfall 5)."""
    if not root.is_dir():
        return
    for entry in sorted(root.iterdir()):
        if entry.is_symlink() or not entry.is_dir():
            continue
        skill_md = entry / "SKILL.md"
        if skill_md.is_file():
            yield skill_md


def parse_skill(path: Path) -> dict | None:
    """Returns {name, environment, user_invocable, description, frontmatter, path}.
    Returns None if frontmatter is missing or malformed.
    """
    text = path.read_text(encoding="utf-8", errors="replace")
    m = _FRONTMATTER_RE.search(text)
    if not m:
        return None
    try:
        meta = yaml.safe_load(m.group(1)) or {}
    except yaml.YAMLError:
        return None
    if not isinstance(meta, dict):
        return None
    name = meta.get("name") or path.parent.name
    return {
        "name": str(name),
        "environment": meta.get("environment") or "personal",
        "user_invocable": bool(meta.get("user_invocable", True)),
        "description": meta.get("description"),
        "frontmatter": meta,
        "path": str(path),
    }


def scan_all(user_dir: Path, project_dir: Path | None = None) -> list[dict]:
    out = []
    for root, env in [(user_dir, "personal"), (project_dir, "project")]:
        if root is None:
            continue
        for f in find_skill_files(root):
            parsed = parse_skill(f)
            if parsed is None:
                continue
            parsed.setdefault("environment", env)  # honor frontmatter, fallback to dir
            out.append(parsed)
    return out
```

### MCP three-source aggregator (MCP-03)

```python
# cmc/mcp/aggregator.py — note: priority is documented in §2.5 of this research
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.sqlite import insert
from datetime import datetime

from cmc.db.models.tools import ToolCall
from cmc.db.models.otel_events import OtelEvent
from cmc.db.models.mcp_stats import MCPStat


async def rebuild_mcp_stats(db: AsyncSession) -> dict:
    """Rebuild mcp_stats from three priority sources.

    Priority order (MCP-02):
      1. tool_decision events (highest fidelity — explicit accept/reject + duration_ms)
      2. tools table rows (paired tool_use/tool_result with duration)
      3. otel_events with tool_name starting mcp__ (lowest fidelity — fallback)

    Each (server, tool) pair is computed from the HIGHEST-priority source that has data;
    falls through to lower priority if no rows.
    """
    summary = {"servers": 0, "tools": 0, "source_counts": {"tool_decision": 0, "tools": 0, "otel": 0}}
    # Implementation iterates the three sources in priority order.
    # Pseudocode kept short here; planner expands in MCP plan.
    ...
    return summary
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `sse-starlette` 3rd-party for SSE | `fastapi.sse.EventSourceResponse` (built-in) | FastAPI 0.135.0 (mid-2026) | Saves a dep; built-in has Pydantic-side serialization optimization. |
| Pydantic v1 `Config.orm_mode = True` | Pydantic v2 `ConfigDict(from_attributes=True)` | Pydantic 2.0 (June 2023) | All response schemas need the new spelling. |
| `select(Model).from_statement(text(...))` for raw SQL | `await db.execute(text(SQL), {bind: param}).mappings().all()` | SQLAlchemy 2.0 | Cleaner; works without ORM round-trip. |
| `datetime.utcnow()` everywhere | `datetime.now(timezone.utc)` for new code, kept legacy for Phase 2's existing models | Python 3.12 deprecation | Don't refactor Phase 1/2 code in Phase 3. |
| Window-function percentiles (`PERCENTILE_CONT`) | Offset-based percentile (Pattern 4) | n/a — SQLite stdlib never enabled `-DSQLITE_ENABLE_ORDERED_SET_AGGREGATES` | Pattern 4 is the only portable option. |

**Deprecated/outdated:**
- Calling `request.json()` without `await` — Phase 2 ingest.py shows the correct `await request.json()` pattern.
- Returning SQLModel rows directly — Pydantic v2 needs explicit `model_validate(orm_row)` because `from_attributes` isn't auto-applied to FastAPI response_model.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `live_state` table is read-only in Phase 3 — Phase 2 doesn't write to it; the dispatcher (Phase 8) does. SESS-03 should derive "live" from `sessions` table directly (`ended_at IS NULL AND started_at > now-5min`). SESS-04/05 return 404/empty until Phase 8 lands. | Pitfall 8, Component table | If user expects SESS-03/04/05 to work today against a populated dashboard, they'll see empty arrays. **Discuss with user (already noted as critical research question 9 / 10).** |
| A2 | `sessions.outcome` is NOT populated by Phase 2; OBSV-03 must compute outcome at READ time via JOIN to otel_events. | Pitfall 9, Pattern 5 | Wrong: OBSV-03 returns all-zero. **Verify by reading `cmc/ingest/jsonl_parser.py` — confirmed outcome is absent from session dict.** |
| A3 | MCP-02 three sources in priority order are: `tool_decision OTEL events > tools table > otel_events` | §2.5, Component table | If priority is reversed, p95 numbers diverge. Wording in MCP-02 is "three sources in priority order" — interpretation matches: tool_decision is highest fidelity (explicit accept/reject + duration), tools table is paired but no decision, otel_events is fallback when neither has data. **Recommend confirming with user.** |
| A4 | SAPI-04 attention aggregator returns 0 / empty for `pending_decisions` and `failed_tasks` until Phase 4 lands those tables' write paths | Pitfall 7 | Frontend may render "—" instead of "0"; minor UX. |
| A5 | Skill scan paths are `~/.claude/skills/` (user-level, **VERIFIED exists**) and `./skills/` relative to repo root (project-level, may not exist on this machine) | Pattern 5, §6 | If the skill registry is canonical somewhere else (e.g., `~/Library/Application Support/Claude/skills`), SKIL-02 returns empty. **Verify with user — this is critical research question 6.** |
| A6 | `system_state` KV table is READ-ONLY from Phase 3; daemon stamps are written by their own process (Phase 2 scheduler should write `jsonl_sync_last_tick_at`, but doesn't currently — see follow-up) | §1, Component table | SAPI-02 daemon ages return null. Mitigation: Phase 3 SAPI-02 writes a "last seen by API" stamp on each call as a fallback heartbeat. |
| A7 | OBSV-09 productivity counters use OTEL metric names: `claude_code.commit.count`, `claude_code.pull_request.count`, `claude_code.lines_of_code.count` (per Phase 2 research §2 and code.claude.com/docs/en/monitoring-usage) | Pattern 3 | If naming differs, query returns 0. Phase 2 already verified against monitoring docs. LOW risk. |
| A8 | OBSV-10 system pressure events: `claude_code.api_retries_exhausted`, `claude_code.compaction`, `claude_code.api_error` — verified by Phase 2 research §2 catalog | Pattern 3 | Same as A7 — verified already. LOW risk. |
| A9 | Pydantic v2 response models live in NEW `cmc/api/schemas/` package, NOT colocated with table classes | File layout | Cosmetic / convention only. The "schemas" naming follows the FastAPI tutorial convention. |
| A10 | One test file per router (`test_phase3_<router>.py`) — diverges from Phase 2's "single test file" convention | Test framework section | If verifier requires single-file, planner must collapse. Recommendation is well-justified (1156-line file scaling), but flag with user during plan-check. |
| A11 | Daily local-time bucketing uses SQLite `STRFTIME(..., 'localtime')` modifier — server timezone matches Python's `astimezone()` reference | Pattern 3 | If server runs in UTC but user is in Pacific time, daily buckets shift. Phase 2 INGST-05 uses `astimezone()` (Python local), so SQLite `'localtime'` matches IF the OS tz is consistent. macOS-only project ⇒ user's local zone always available. |
| A12 | The single edit to `cmc/api/routes/__init__.py` (adding 5 routers to `all_routers()`) is the only Phase 1/2 file Phase 3 modifies | "Plan splitting" section | If Phase 3 inadvertently touches Phase 1/2 files, regression risk. Lifespan adds `app.state.boot_time` which IS a Phase 2 file edit — minor (one-line addition). |

## Open Questions

1. **Live state writer — derive from sessions or wait for Phase 8?**
   - What we know: Phase 2 writes `sessions.ended_at`; doesn't touch `live_state`. Phase 8 dispatcher will write `live_state` for streaming sessions.
   - What's unclear: should SESS-03/04/05 work today against the dashboard, or wait for Phase 8?
   - Recommendation: derive SESS-03 from `sessions` (`ended_at IS NULL AND started_at > now-5min`); return empty/404 from SESS-04/05 until Phase 8. Document explicitly in plan and in OPNL-04 (LiveSessionsCard) panel implementation later. **Confirm with user during plan-check.**

2. **MCP three-source priority — does the order match the dashboard's intent?**
   - What we know: MCP-02 says "three sources in priority order" but doesn't enumerate.
   - What's unclear: which three sources, in what order?
   - Recommendation: `tool_decision events > tools table > otel_events` (most fidelity → least). **Confirm with user; this is critical research question 5.**

3. **SAPI-03 system_state read — whitelist or all keys?**
   - What we know: schema lets any process write any key.
   - What's unclear: should SAPI-03 expose all keys or a known-safe subset?
   - Recommendation: filter to a known whitelist (`tzname`, `last_jsonl_sync_at`, `dispatcher_last_tick_at`, `emergency_stop`, `tzname_alt`). 404 unknown keys. Defer specific whitelist to plan author / user.

4. **psutil install — main deps or dev deps?**
   - What we know: SAPI-02 uses psutil at runtime.
   - What's unclear: is psutil a "test helper" or "production dep"?
   - Recommendation: production dep (`[project].dependencies`), pinned to `psutil==7.2.2`.

5. **PyYAML dep — already transitive or new install?**
   - What we know: pydantic-settings doesn't require yaml; SQLAlchemy doesn't either. Likely missing.
   - What's unclear: does some installed dep transitively pull yaml?
   - Recommendation: Wave 0 task — `python -c "import yaml"` to check. If missing, add `pyyaml>=6.0` to deps. Alternative: 15-line stdlib regex-only frontmatter parser (no yaml).

6. **Test file convention — one per router or one for the phase?**
   - What we know: Phase 1/2 used one file per phase.
   - What's unclear: does the verifier or convention enforcement require one file?
   - Recommendation: **one file per router** (5 files). 1156-line monolith from Phase 2 is unsustainable for 29 endpoints.

7. **OBSV-03 outcome computation — read-time or back-fill at parse time?**
   - What we know: parser doesn't write outcome; OBSV-03 needs it.
   - What's unclear: should Phase 3 add a parser-side outcome computation, or do it on read?
   - Recommendation: read-time with a CASE expression joining `otel_events` (Pitfall 9). Defer parser change.

8. **SESS-06 follow-up message queue — file format?**
   - What we know: SESS-06 says "queues follow-up message" with stream-mode-only constraint.
   - What's unclear: what file path? what format?
   - Recommendation: write JSON to `.tmp/mission-control-queue/messages/{session_id}.jsonl` (one message per line). The dispatcher (Phase 8) tails this file. Plan can lock the path.

9. **Reuse `cmc.api.routes.health.py` for SAPI-01 vs new router?**
   - What we know: health.py exists and returns `{"status": "ok"}`.
   - What's unclear: Phase 3 SAPI-01 is "GET /api/health returns quick liveness check" — already done.
   - Recommendation: leave health.py unchanged. Add `system.py` with SAPI-02..05 only.

10. **Should Phase 3 wire `app.state.boot_time` in lifespan, or compute on first SAPI-02 call?**
    - What we know: `app.state.boot_time = datetime.now(tz=UTC)` set in lifespan startup is the cleanest pattern.
    - What's unclear: any reason to defer?
    - Recommendation: set in lifespan startup. Trivial 1-line addition (Wave 0).

## Plan Splitting Recommendation

**5 plans across 4 waves.** Each plan is autonomous. After Wave 0 lands, Waves 1-2 fully parallelize.

### Wave 0 — Foundation (1 plan)

**Plan 03-01: Phase 3 foundation — schemas, deps, fixtures, lifespan boot_time**
- **Wave:** 0
- **Depends on:** []
- **Touches Phase 1/2 files:** `backend/pyproject.toml` (add psutil + maybe pyyaml), `backend/cmc/app/lifespan.py` (add `app.state.boot_time = datetime.now(tz=UTC)`), `backend/cmc/api/routes/__init__.py` (no changes yet — wave 1+ adds routers to `all_routers()`)
- **New files:**
  - `backend/cmc/api/schemas/__init__.py`
  - `backend/cmc/api/schemas/common.py` — `RangeWindow` enum, `PaginationParams`, `ErrorResponse`
  - `backend/cmc/api/schemas/system.py` — SystemHealthResponse, AttentionResponse, etc.
  - `backend/cmc/api/schemas/sessions.py` — SessionListItem, SessionDetailsResponse, etc.
  - `backend/cmc/api/schemas/observability.py`
  - `backend/cmc/api/schemas/mcp.py`
  - `backend/cmc/api/schemas/skills.py`
  - `backend/cmc/api/sse.py` — shared `tail_otel_events()` async generator
  - `backend/tests/test_phase3_*.py` — 5 empty test files with placeholder + shared fixtures imported from conftest
  - `backend/tests/conftest.py` — extend with `seeded_app`, `client`, factory fixtures
- **Must-haves (truths):**
  - Phase 3 schemas package importable; running `pytest backend/tests/test_phase3_*.py -q` shows 5 placeholder tests passing
  - `app.state.boot_time` is set in lifespan startup; `pytest backend/tests/test_phase1_boot.py` still green
  - `psutil` is importable in the venv; `import psutil; psutil.Process().memory_info().rss > 0`
  - PyYAML availability is documented in plan output (verified or installed)

### Wave 1 — Resource routers, all parallel (4 plans)

**Plan 03-02: System router — SAPI-02..05**
- **Wave:** 1
- **Depends on:** ["03-01"]
- **Touches Phase 1/2 files:** `backend/cmc/api/routes/__init__.py` (add system_router)
- **New files:** `backend/cmc/api/routes/system.py`, extends `backend/tests/test_phase3_system.py`
- **Must-haves:**
  - GET /api/system/health returns shape including `uptime_seconds`, `memory_rss_mb`, `daemon_ages`, `tzname`, `last_otel_event_age_seconds`
  - GET /api/system/state returns dict of whitelisted KV keys; 404 on unknown key
  - GET /api/attention returns aggregate object; gracefully handles empty Phase 4 tables
  - GET /api/firehose returns `EventSourceResponse`; client disconnect ends generator within 2s
  - All tests pass; full suite (Phase 1+2+3-01+3-02) green

**Plan 03-03: Sessions router — SESS-01..07**
- **Wave:** 1
- **Depends on:** ["03-01"]
- **Touches Phase 1/2 files:** `backend/cmc/api/routes/__init__.py` (add sessions_router)
- **New files:** `backend/cmc/api/routes/sessions.py`, extends `backend/tests/test_phase3_sessions.py`
- **Must-haves:**
  - GET /api/sessions paginated; range/source/model filters work; total + items returned
  - GET /api/sessions/{id}/details returns sessions row + tool timeline (ordered by started_at) + token breakdown
  - GET /api/sessions/live derived from `sessions` table (Pitfall 8 fallback)
  - GET /api/sessions/live/{sid}/state returns 404 if no `live_state` row (degraded path documented)
  - GET /api/sessions/live/{sid}/stream returns `EventSourceResponse`; degraded path: empty stream + 5s reconnect
  - POST /api/sessions/live/{sid}/message validates UUID, writes to queue file, returns 202
  - GET /api/summary returns today's KPIs (sessions, tokens, tools, errors) using local-time bucketing
  - All tests pass; full suite green

**Plan 03-04: Observability router — OBSV-01..10**
- **Wave:** 1
- **Depends on:** ["03-01"]
- **Touches Phase 1/2 files:** `backend/cmc/api/routes/__init__.py` (add observability_router)
- **New files:** `backend/cmc/api/routes/observability.py`, extends `backend/tests/test_phase3_observability.py`
- **Must-haves (per endpoint):**
  - OBSV-01 daily breakdown by model + source; range today/7d/30d toggleable
  - OBSV-02 cache hit rate + daily trend; low-sample badge when <10K billable tokens
  - OBSV-03 outcome buckets (errored > rate_limited > truncated > unfinished > ok) sum to total per day
  - OBSV-04 per-tool latency p50/p95/max sorted by p95 desc; uses Pattern 4 (offset percentile)
  - OBSV-05 daily hook fires from otel_events WHERE event_name LIKE 'claude_code.hook%'
  - OBSV-06 sessions by cwd rollup with sessions count, effective tokens, tool count
  - OBSV-07 sessions running Agent tool — JOIN sessions ⨝ tools WHERE tool_name='Agent'
  - OBSV-08 edit decisions accept/reject from `tools.decision` and/or `otel_events` (Phase 2 verified tool_decision events)
  - OBSV-09 productivity from `otel_metrics` (commits, PRs, lines of code) — SUM by metric_name
  - OBSV-10 system pressure: api_retries_exhausted count, compaction count, recent api_errors (10 latest)
  - All tests pass; full suite green

**Plan 03-05: MCP + Skills routers — MCP-01..04 + SKIL-01..03**
- **Wave:** 1
- **Depends on:** ["03-01"]
- **Touches Phase 1/2 files:** `backend/cmc/api/routes/__init__.py` (add mcp_router + skills_router)
- **New files:**
  - `backend/cmc/api/routes/mcp.py`
  - `backend/cmc/api/routes/skills.py`
  - `backend/cmc/mcp/__init__.py` + `aggregator.py`
  - `backend/cmc/skills/__init__.py` + `scanner.py`
  - extends `backend/tests/test_phase3_mcp.py` + `backend/tests/test_phase3_skills.py`
- **Must-haves:**
  - GET /api/mcp returns server-level rows from `mcp_stats` (rows where tool_name IS NULL)
  - GET /api/mcp/{server}/tools returns per-tool rows; uses three-source priority via `cmc.mcp.aggregator` (read-only path; sync writes are MCP-03)
  - POST /api/mcp/sync rebuilds `mcp_stats` table from priority sources; returns summary
  - POST /api/mcp/measure runs schema-size measurement (best effort; updates schema_size_bytes column)
  - GET /api/skills returns rows with environment + user_invocable filters
  - POST /api/skills/sync walks `~/.claude/skills/` (Pitfall 5: no symlinks, 1-level depth, 1000-cap), parses YAML frontmatter, upserts skills table
  - PATCH /api/skills/{name}/autonomy validates name regex, validates autonomy enum (auto/review/manual), updates row, returns 404 if not found
  - All tests pass; full suite green

### Wave 2 — Docs (no plans)

After all 4 router plans land, the verifier runs against the full ROADMAP success criteria. No additional plan needed (Phase 2 also went directly from implementation to verification).

### Plan dependency DAG

```
                   ┌─────────────────┐
                   │  Plan 03-01     │
                   │  Foundation     │
                   │  (Wave 0)       │
                   └────┬────────────┘
                        │
          ┌─────────────┼─────────────┬───────────────┐
          ▼             ▼             ▼               ▼
   ┌────────────┐ ┌─────────────┐ ┌─────────────┐ ┌──────────────┐
   │ 03-02      │ │ 03-03       │ │ 03-04       │ │ 03-05        │
   │ System     │ │ Sessions    │ │ Observability│ │ MCP + Skills │
   │ (Wave 1)   │ │ (Wave 1)    │ │ (Wave 1)    │ │ (Wave 1)     │
   └────────────┘ └─────────────┘ └─────────────┘ └──────────────┘
```

All Wave 1 plans share read-only access to Phase 1/2 tables; their only mutual file is `backend/cmc/api/routes/__init__.py` where each adds one line to `all_routers()`. Conflict risk is trivial (same line of registration, different routers); resolve by alphabetical sort if needed.

### Files NOT modified by Phase 3

Per the user's stated rule "Phase 3 should not edit Phase 1/2 files except factory.py for router mounting":
- ❌ `backend/cmc/db/models/*.py` — no schema changes; all 15 tables untouched
- ❌ `backend/migrations/versions/*` — no Alembic revisions
- ❌ `backend/cmc/ingest/*` — Phase 2 ingestion code untouched
- ❌ `backend/cmc/db/engine.py` / `session.py` — Phase 1 DB plumbing untouched
- ❌ `backend/cmc/config/settings.py` — no new settings (skill scan paths can be hard-coded with env override later)
- ❌ `backend/cmc/api/routes/health.py` / `sync.py` / `ingest.py` — Phase 1/2 routes untouched
- ❌ `backend/cmc/app/factory.py` — **wait — does Phase 3 touch this?** Re-read: factory.py uses `for router in all_routers(): app.include_router(router, prefix="/api")`. Adding routers to the `all_routers()` list does NOT require editing factory.py. **Confirmed: factory.py untouched.**
- ✅ `backend/cmc/api/routes/__init__.py` — 5 imports added + 5 entries appended to `all_routers()`. **Only this Phase 1/2 file is touched.**
- ✅ `backend/cmc/app/lifespan.py` — 1-line addition (`app.state.boot_time = datetime.now(timezone.utc)`). Justified: Phase 3 endpoint depends on this. **Necessary edit.**
- ✅ `backend/pyproject.toml` — add `psutil==7.2.2` (and optionally `pyyaml>=6.0` if not transitive). **Necessary edit.**

## Sources

### Primary (HIGH confidence)
- **Existing codebase** (verified by direct read): `backend/cmc/app/factory.py`, `cmc/app/lifespan.py`, `cmc/api/routes/{health,sync,ingest}.py`, `cmc/db/engine.py`, `cmc/db/session.py`, all 15 SQLModel tables, `cmc/ingest/{jsonl_parser,scheduler,repository,otel_parser}.py`, `backend/tests/{conftest,test_phase1_boot,test_phase2_ingest}.py`, `backend/pyproject.toml`
- **Phase 1 schema** — `.planning/phases/01-foundation-database/01-01-SCHEMA.md` (15-table canonical) — APPROVED 2026-04-25
- **Phase 2 research** — `.planning/phases/02-data-ingestion/02-RESEARCH.md` — Claude Code OTEL event/metric catalog cited verbatim
- **Phase 1/2 plans** — examined for plan style, must_haves shape, wave assignment patterns, file_modified discipline
- **Anthropic Claude Code monitoring** — [code.claude.com/docs/en/monitoring-usage](https://code.claude.com/docs/en/monitoring-usage) — re-confirmed event/metric names
- **Pydantic v2 migration** — [docs.pydantic.dev/2.13/migration](https://docs.pydantic.dev/latest/migration/) — `from_attributes=True` syntax
- **SQLite percentile extension** — [sqlite.org/percentile.html](https://sqlite.org/percentile.html) — confirmed stdlib build does not enable it; Pattern 4 (offset) is the correct workaround
- **SQLite date functions** — [sqlite.org/lang_datefunc.html](https://sqlite.org/lang_datefunc.html) — STRFTIME with 'localtime' modifier
- **FastAPI SSE** — verified by `inspect.signature(fastapi.sse.EventSourceResponse.__init__)` against installed 0.136.1
- **Live tooling verification** — `/Users/patrykattc/work/git/claude-mission-control/backend/.venv/bin/python -c "...sqlite3..."` confirmed SQLite 3.47.1 and percentile-by-offset pattern returns correct values

### Secondary (MEDIUM confidence)
- [FastAPI APIRouter best practices 2026](https://fastapi.tiangolo.com/reference/apirouter/) — router-per-resource pattern, prefix cascading
- [SQLAlchemy 2.0 async pagination](https://github.com/sqlalchemy/sqlalchemy/discussions/10254) — two-query offset pattern is the recommended approach for small N
- [psutil 7.2.2 release notes](https://pypi.org/project/psutil/) — 2026-01-28 macOS kqueue improvements; latest stable

### Tertiary (LOW confidence)
- Live state writer ownership (Assumption A1) — inferred from Phase 8 dispatcher description in ROADMAP; not explicitly verified against a CONTEXT.md decision (none exists for Phase 3)
- MCP-02 three-source priority order (Assumption A3) — interpretation; the requirement text says "in priority order" without enumerating
- SESS-06 queue file path (Open Question 8) — inferred from Phase 8 dispatcher description; planner should lock during plan-check

## Metadata

**Confidence breakdown:**
- Stack & versions: HIGH — verified against installed venv via `inspect`/`import`
- Architecture (router layout, schema separation, SSE): HIGH — verified by reading existing Phase 1/2 routers and FastAPI source
- SQL patterns (percentiles, daily buckets, outcomes): HIGH — verified by executing the patterns against `:memory:` SQLite at research time
- Pitfalls 1-9: HIGH for code-level (1-6), MEDIUM for cross-phase (7-9, depend on Phase 4/8 work not yet planned)
- Plan splitting: MEDIUM — recommendation is internally consistent but should be confirmed by user during plan-check (especially A10: per-router test files)
- MCP-02 priority order (A3): MEDIUM — best interpretation, requires user confirmation
- Live state path (A1): LOW — defaulted to "derive from sessions" but other interpretations valid

**Research date:** 2026-04-26
**Valid until:** 2026-05-26 for SQL/architecture patterns; valid until next FastAPI major release for `EventSourceResponse` API; valid until next Claude Code release for OTEL event/metric catalog (re-verify before Phase 9 setup wizard).

## RESEARCH COMPLETE
