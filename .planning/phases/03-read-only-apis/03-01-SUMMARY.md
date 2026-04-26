---
phase: 03-read-only-apis
plan: 01
subsystem: backend-foundation
tags: [phase-3, wave-0, schemas, fixtures, sse, scaffolding]
requires:
  - 02-05 (lifespan + sessionmaker on app.state)
  - 02-04 (cmc.ingest.repository + scheduler)
provides:
  - "cmc.api.schemas.* — 6 modules with all DTOs Wave 1 plans need"
  - "cmc.api.sse.tail_otel_events — shared SSE generator (1h cap, disconnect-aware)"
  - "app.state.boot_time set in lifespan startup (SAPI-02 reads this)"
  - "psutil 7.2.2 runtime dep (SAPI-02 memory/process introspection)"
  - "conftest.seeded_app + client + 4 factory helpers for Phase 3 router tests"
  - "5 per-router test scaffold files (one per Wave 1 router)"
affects:
  - "backend/pyproject.toml dep set"
  - "backend/cmc/app/lifespan.py startup ordering (boot_time set BEFORE alembic upgrade)"
tech-stack:
  added:
    - "psutil==7.2.2 (production dep)"
  patterns:
    - "Pydantic v2 ORMBase mixin (model_config = ConfigDict(from_attributes=True))"
    - "SSE generator with request.is_disconnected() + duration cap + cursor-bound batch"
    - "create_app(test_settings)-backed pytest fixture so all routers wire automatically"
key-files:
  created:
    - backend/cmc/api/schemas/__init__.py
    - backend/cmc/api/schemas/common.py
    - backend/cmc/api/schemas/system.py
    - backend/cmc/api/schemas/sessions.py
    - backend/cmc/api/schemas/observability.py
    - backend/cmc/api/schemas/mcp.py
    - backend/cmc/api/schemas/skills.py
    - backend/cmc/api/sse.py
    - backend/tests/test_phase3_system.py
    - backend/tests/test_phase3_sessions.py
    - backend/tests/test_phase3_observability.py
    - backend/tests/test_phase3_mcp.py
    - backend/tests/test_phase3_skills.py
  modified:
    - backend/pyproject.toml
    - backend/cmc/app/lifespan.py
    - backend/tests/conftest.py
decisions:
  - "Schema split: 6 modules (one per router family + common) rather than a single mega-module — enables per-router edits without touching others"
  - "ORMBase mixin pattern: only response schemas built FROM ORM rows inherit it; aggregate / request schemas use plain BaseModel"
  - "PaginationParams (the must_haves frontmatter shorthand 'Pagination' is the same class — action body name is canonical)"
  - "Per-router test files (5) instead of one phase-3 monolith: avoids the Phase-2 1156-line problem; each Wave 1 plan appends to its matching file"
  - "seeded_app uses cmc.app.factory.create_app rather than copying _bootstrap_app verbatim — guarantees all routers wire automatically so /api/health (and Wave 1 routers) work without per-test boilerplate"
  - "SSE helper caps at 60min and starts cursor at MAX(id)-100 on first connect — clients reconnect; history is bounded by cursor, not by SSE generator memory"
metrics:
  duration_min: 14
  tasks_completed: 3
  completed_date: 2026-04-26
---

# Phase 3 Plan 01: Wave 0 Foundation — Summary

Phase 3 read-only-API rails are landed: psutil dep, `app.state.boot_time`,
six Pydantic v2 response-schema modules, the shared `tail_otel_events` SSE
generator, and the `seeded_app`/`client` pytest fixtures plus 4 factory
helpers and five per-router test scaffold files. Wave 1's four router plans
(03-02..03-05) can now consume DTOs, fixtures, and the SSE helper as
already-defined contracts.

## What Landed

### 1. Runtime dep + lifespan boot_time (Task 1a — commit `2269060`)

**psutil==7.2.2** added to `backend/pyproject.toml` `[project].dependencies`
(production dep, NOT dev — SAPI-02 uses it at runtime). Reinstalled into the
backend venv via `uv pip install -e backend --python backend/.venv/bin/python`.
Sanity verified: `import psutil; psutil.Process().memory_info().rss > 0`.

**PyYAML 6.0.3** confirmed already installed transitively — no install needed.

**lifespan boot_time** wired in `backend/cmc/app/lifespan.py:48-49`:
```python
# Phase 3 SAPI-02 reads this for uptime calc; set BEFORE alembic upgrade so
# it's the moment the process started serving.
app.state.boot_time = datetime.now(timezone.utc)
```
Set BEFORE alembic upgrade so uptime measures from the moment the process
started serving (not the moment migrations finished).

### 2. DTO inventory (Task 1a — commit `2269060`)

All schemas use Pydantic v2; `ORMBase` mixin (in `common.py`) enables
`from_attributes=True` for ORM-row -> response-model conversion.

**`cmc/api/schemas/common.py`** (4 exports):
- `RangeWindow` — Enum: today / 7d / 30d / all (used by all OBSV-* range params)
- `PaginationParams` — `limit: int = Field(50, ge=1, le=200)`, `offset: int = Field(0, ge=0)`
- `ErrorResponse` — `{ error: str, detail: Optional[str] }`
- `ORMBase` — `BaseModel` mixin with `model_config = ConfigDict(from_attributes=True)`

**`cmc/api/schemas/system.py`** (6 exports):
- `DaemonAge` — `{ key, last_tick_at?, age_seconds? }` row in SystemHealthResponse.daemon_ages
- `SystemHealthResponse` — SAPI-02; `status: Literal["ok","degraded"]`, uptime_seconds, memory_rss_mb, last_otel_event_age_seconds?, daemon_ages: list[DaemonAge], tzname
- `SystemStateResponse` — SAPI-03; `items: dict[str, Any]` (whitelisted KV)
- `AttentionItem` — `{ kind, severity: Literal["info","warning","error"], count, detail? }`
- `AttentionResponse` — SAPI-04; items + zero-init Phase-4-deferred counters (pending_decisions, failed_tasks, stale_dispatcher_seconds, stuck_sessions)
- `FirehoseEvent` — SAPI-05 SSE data shape; id, ts, event_name, session_id?, attrs_mcp_server?, attrs_mcp_tool?

**`cmc/api/schemas/sessions.py`** (9 exports):
- `SessionListItem(ORMBase)` — SESS-01 row; mirrors Session ORM columns
- `SessionListResponse` — `{ items, total, limit, offset }`
- `ToolTimelineEntry(ORMBase)` — SESS-03 row; tool_use_id, tool_name, started_at, ended_at?, duration_ms?, status, input_summary?, mcp_server_name?, mcp_tool_name?, decision?
- `SessionDetailsResponse` — SESS-02; `{ session: SessionListItem, tools: list[ToolTimelineEntry] }`
- `LiveSessionItem(ORMBase)` — SESS-04 row
- `LiveSessionState(ORMBase)` — SESS-05 snapshot
- `FollowUpMessageRequest` — SESS-06 body; `message: str = Field(min_length=1, max_length=10000)`
- `FollowUpMessageResponse` — `{ queued, session_id, queue_path }`
- `TodaySummaryResponse` — SESS-07; date, sessions_count, token totals, tool_call_count, error_count

**`cmc/api/schemas/observability.py`** (18 exports):
- OBSV-01: `TokenUsageDailyRow`, `TokenUsageResponse`
- OBSV-02: `CacheTrendRow`, `CacheResponse` (low_sample = billable_tokens<10_000)
- OBSV-03: `OutcomeDailyRow`, `OutcomesResponse`
- OBSV-04: `ToolLatencyRow`, `ToolLatencyResponse`
- OBSV-05: `HookActivityRow`, `HookActivityResponse`
- OBSV-06: `ProjectRollupRow`, `ProjectRollupResponse`
- OBSV-07: `AgentFanoutRow`, `AgentFanoutResponse`
- OBSV-08: `EditDecisionRow`, `EditDecisionsResponse`
- OBSV-09: `ProductivityResponse`
- OBSV-10: `ApiErrorEntry`, `PressureResponse`

**`cmc/api/schemas/mcp.py`** (6 exports):
- `McpServerRow(ORMBase)`, `McpServerListResponse` (MCP-01)
- `McpToolRow(ORMBase)`, `McpToolsResponse` (MCP-02)
- `McpSyncResponse` — `{ status: Literal["ok","conflict"], servers, tools, source_counts: dict[str,int], duration_ms }` (MCP-03)
- `McpMeasureResponse` (MCP-04)

**`cmc/api/schemas/skills.py`** (5 exports):
- `SkillRow(ORMBase)`, `SkillListResponse` (SKILL-01)
- `SkillSyncResponse` (SKILL-02)
- `SkillAutonomyPatch` — `{ autonomy: Literal["auto","review","manual"] }` (SKILL-03 body)
- `SkillAutonomyResponse(ORMBase)` (SKILL-03 confirmation)

### 3. Shared SSE helper (Task 1b — commit `8efe38a`)

`cmc/api/sse.py` exports **`tail_otel_events(request, db, *, since_id=None, event_name=None) -> AsyncIterator[dict]`**:

- **`since_id`** — resume from a specific OtelEvent.id; `None`/`0` defaults to `MAX(id) - 100`
  so reconnects don't replay full history.
- **`event_name`** — optional filter (e.g. `claude_code.tool_result`).
- **Cap behavior** — generator returns cleanly when:
  - `await request.is_disconnected()` is true (client closed)
  - `SSE_MAX_DURATION_S = 3600` (1 hour) elapsed — clients reconnect
- **Yield shape** — `{"event": "otel", "id": str(row.id), "data": json.dumps({id, ts, event_name, session_id, attrs_mcp_server, attrs_mcp_tool})}`
- **Constants** — `SSE_POLL_INTERVAL_S=1.0`, `SSE_BATCH_LIMIT=100`.
- **Pitfall coverage** — Pitfall 1 (memory leak from un-disposed generators) via the
  duration cap + disconnect check; Pitfall 3 (cursor lifetime) via batch-then-sleep
  (results are exhausted to a list before the await).

### 4. Per-router test scaffold (Task 1b — commit `8efe38a`)

Five files created under `backend/tests/`:
`test_phase3_system.py`, `test_phase3_sessions.py`, `test_phase3_observability.py`,
`test_phase3_mcp.py`, `test_phase3_skills.py`.

Each file's module docstring declares the per-router convention (every SAPI-* test
lives in `test_phase3_system.py`, every SESS-* in `test_phase3_sessions.py`, etc.).
Wave 1 plans APPEND tests to the matching file — they do NOT create additional
files for the same router.

`test_phase3_system.py` carries the cross-cutting smoke tests:
`test_psutil_importable_and_alive`, `test_tail_otel_events_callable`, plus the
schema-import smoke. Sibling files only carry their own schema-import smoke.

### 5. conftest fixtures (Task 3 — commit `b3bc968`)

Appended to `backend/tests/conftest.py` (existing Phase 1+2 fixtures untouched):

```python
@pytest_asyncio.fixture
async def seeded_app(test_settings) -> tuple[FastAPI, AsyncContextManager]:
    """Returns (app, lifespan_cm). Caller does:
        app, cm = seeded_app
        async with cm:
            ...
    Auto-redirects jsonl_root to a tmp nonexistent path when default
    (~/.claude/projects). Defensively pre-seeds boot_time."""

@pytest_asyncio.fixture
async def client(seeded_app) -> httpx.AsyncClient:
    """ASGITransport-bound httpx.AsyncClient pinned to base_url=http://testserver.
    Lifespan IS entered before the first request — /api/health works."""
```

**Plain helpers (NOT fixtures) — call from any test:**

```python
def make_session_row(session_id="sess-1", started_at=None, ended_at=None,
    cwd="/Users/test/proj", model="claude-opus-4-7", source="claude-code",
    outcome=None, tokens_input=0, tokens_output=0, tokens_cache_read=0,
    tokens_cache_create=0, tool_call_count=0, message_count=0,
    error_message=None) -> dict

def make_otel_event(id=None, ts=None, event_name="claude_code.tool_result",
    session_id=None, body=None, attrs_mcp_server=None,
    attrs_mcp_tool=None) -> dict

def make_token_usage_bucket(day=None, model="claude-opus-4-7",
    source="claude-code", tokens_input=1000, tokens_output=500,
    tokens_cache_read=0, tokens_cache_create=0, sessions_count=1) -> dict

def make_tool_call(tool_use_id="tu-1", session_id="sess-1", tool_name="Bash",
    started_at=None, ended_at=None, duration_ms=None, status="ok",
    error_message=None, input_summary=None, mcp_server_name=None,
    mcp_tool_name=None, decision=None) -> dict
```

All helpers default to `datetime.now(timezone.utc)` for timestamps —
NEVER `datetime.utcnow()` (Pitfall 4).

## Open Questions Answered IN This Plan

- **A1 (deps placement):** `psutil` lives in `[project].dependencies` (runtime), pinned to `==7.2.2`.
- **A3 (boot_time location):** set in lifespan startup, BEFORE alembic upgrade, on `app.state.boot_time`.
- **Q3 (SystemState whitelist):** schema declared `SystemStateResponse.items: dict[str, Any]`; the actual whitelist is enforced in the SAPI-03 router (Wave 1).
- **Q5 (PyYAML availability):** verified 6.0.3 already transitive; no install needed; documented in pyproject.toml comment via this summary.
- **Q6 (test file partitioning):** five per-router files (rationale: Phase 2's 1156-line monolith); convention declared in each file's module docstring.
- **Q7 (SessionListItem.outcome at read time):** `outcome: Optional[str]` (computed by ingestion; no rules in this plan).
- **Q8 (FollowUpMessageResponse.queue_path):** field present in schema; the actual filesystem path convention is decided by the Wave 1 plan implementing SESS-06.
- **Q10 (where boot_time is set):** lifespan startup, not per-request; the 42-seconds-ago defensive pre-seed in `seeded_app` is overwritten by the lifespan immediately on entry.

## Entry Contracts for Wave 1 Plans (03-02..03-05)

**Where to plug routers in:** add a `from cmc.api.routes.<resource> import router as <resource>_router` line to `backend/cmc/api/routes/__init__.py` and append to `all_routers()`. The factory mounts the `/api` prefix automatically.

**Which fixtures to use:**
- HTTP-level test:      `async def test_x(client): r = await client.get("/api/...")`
- Lower-level test:    `async def test_x(seeded_app): app, cm = seeded_app; async with cm: ...`
- DB seeding:           use `make_session_row(...)`, `make_otel_event(...)`, `make_token_usage_bucket(...)`, `make_tool_call(...)`. Construct ORM instances or use raw SQL inserts; both shapes are supported.

**Schema imports cheat sheet:**
- Wave 1 plan 03-02 (system router): `from cmc.api.schemas.system import SystemHealthResponse, SystemStateResponse, AttentionResponse, FirehoseEvent` and `from cmc.api.sse import tail_otel_events`
- Wave 1 plan 03-03 (sessions router): `from cmc.api.schemas.sessions import SessionListResponse, SessionDetailsResponse, LiveSessionItem, LiveSessionState, FollowUpMessageRequest, TodaySummaryResponse`
- Wave 1 plan 03-04 (observability router): `from cmc.api.schemas.observability import TokenUsageResponse, CacheResponse, OutcomesResponse, ToolLatencyResponse, HookActivityResponse, ProjectRollupResponse, AgentFanoutResponse, EditDecisionsResponse, ProductivityResponse, PressureResponse`
- Wave 1 plan 03-05 (mcp + skills routers): `from cmc.api.schemas.mcp import McpServerListResponse, McpToolsResponse, McpSyncResponse, McpMeasureResponse` and `from cmc.api.schemas.skills import SkillListResponse, SkillSyncResponse, SkillAutonomyPatch, SkillAutonomyResponse`

**Composing tests:** new tests append to the matching `test_phase3_<router>.py` file. They MUST NOT create additional files for the same router (per-router convention). They MAY add new module-level helpers to `conftest.py` if shared across plans — but ONLY append; do not modify existing fixtures.

## Verification Results

```
$ /Users/patrykattc/work/git/claude-mission-control/backend/.venv/bin/python -m pytest backend/tests/ --tb=no
70 passed, 5983 warnings in ~80s
```

Breakdown:
- 25 Phase 1 tests (test_phase1_boot.py) — green
- 36 Phase 2 tests (test_phase2_ingest.py) — green
- 7 Wave 0 smoke tests from Task 1b (5 schema imports + psutil + tail_otel_events) — green
- 2 Wave 0 smoke tests from Task 3 (seeded_app shape + client.get /api/health 200) — green

Per-must_have verification:
- ✅ TRUTH-1: `import psutil; psutil.Process().memory_info().rss > 0` succeeds
- ✅ TRUTH-2: `import yaml; yaml.__version__` returns `6.0.3` (transitive, no install)
- ✅ TRUTH-3: `grep -n "boot_time" backend/cmc/app/lifespan.py` finds line 49 (`app.state.boot_time = datetime.now(timezone.utc)`)
- ✅ TRUTH-4: All 7 schema modules importable; common.py exports RangeWindow, PaginationParams (note: must_haves shorthand says "Pagination", action body says "PaginationParams" — action is canonical), ErrorResponse, ORMBase
- ✅ TRUTH-5: All 5 Phase-3 test files exist; `seeded_app` and `client` importable from conftest
- ✅ TRUTH-6: 61/61 pre-existing tests stay green

## Deviations from Plan

None — plan executed exactly as written.

The "Pagination" vs "PaginationParams" naming difference between
`must_haves.truths[3]` and the action body's Step E is a documentation
shorthand inconsistency in the plan, not an executor deviation. The action
body is canonical (it specifies the full class definition), and the schema
module exports `PaginationParams` as written.

## Self-Check: PASSED

Verified all referenced artifacts exist:
- ✅ backend/pyproject.toml (modified) — contains "psutil==7.2.2"
- ✅ backend/cmc/app/lifespan.py (modified) — contains "boot_time"
- ✅ backend/cmc/api/schemas/__init__.py
- ✅ backend/cmc/api/schemas/common.py
- ✅ backend/cmc/api/schemas/system.py
- ✅ backend/cmc/api/schemas/sessions.py
- ✅ backend/cmc/api/schemas/observability.py
- ✅ backend/cmc/api/schemas/mcp.py
- ✅ backend/cmc/api/schemas/skills.py
- ✅ backend/cmc/api/sse.py
- ✅ backend/tests/conftest.py (modified) — contains seeded_app, client, 4 factories
- ✅ backend/tests/test_phase3_system.py
- ✅ backend/tests/test_phase3_sessions.py
- ✅ backend/tests/test_phase3_observability.py
- ✅ backend/tests/test_phase3_mcp.py
- ✅ backend/tests/test_phase3_skills.py

Verified all 3 commits exist in `git log --oneline`:
- ✅ `2269060` — feat(03-01): deps + lifespan boot_time + schema modules (Task 1a)
- ✅ `8efe38a` — feat(03-01): SSE helper + per-router test scaffolds (Task 1b)
- ✅ `b3bc968` — feat(03-01): conftest seeded_app + client fixtures + factory helpers (Task 3)
