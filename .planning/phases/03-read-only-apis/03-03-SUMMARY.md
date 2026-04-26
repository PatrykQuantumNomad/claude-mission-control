---
phase: 03-read-only-apis
plan: 03
subsystem: api
tags: [fastapi, sqlalchemy, sse, server-sent-events, sessions, jsonl-queue, sqlite]

# Dependency graph
requires:
  - phase: 03-read-only-apis
    provides: "Wave 0 schemas (SessionListResponse, LiveSessionState, FollowUpMessageRequest, etc.) + seeded_app/client conftest fixtures + factory helpers (make_session_row, make_otel_event, make_tool_call) + cmc.api.sse.tail_otel_events helper"
  - phase: 02-data-ingestion
    provides: "sessions/tools/otel_events table writes + Settings.jsonl_root + Phase 2 lifespan boot sync"
  - phase: 01-foundation-database
    provides: "Session/ToolCall/LiveState/OtelEvent/TokenUsage models, repo_root() path anchor, async sessionmaker via app.state.sessions, register_error_handlers (which emits {error:detail})"
provides:
  - "GET /api/sessions: paginated list with range/source/model filters (default 30d, max 200)"
  - "GET /api/sessions/{id}/details: session row + tool timeline ordered ASC"
  - "GET /api/sessions/live: live-sessions index (Pitfall 8 fallback derives from sessions table when live_state row absent)"
  - "GET /api/sessions/live/{sid}/state: snapshot of live_state row, 404 when absent"
  - "GET /api/sessions/live/{sid}/stream: SSE stream (text/event-stream) with live_state events on row change OR heartbeat+retry fallback when no writer"
  - "POST /api/sessions/live/{sid}/message: 202 + JSONL-line write to repo_root() / .tmp/mission-control-queue/messages/{sid}.jsonl (locked entry contract for Phase 8 dispatcher)"
  - "GET /api/summary: today's KPIs in local time (sessions/tokens/tool_calls/errors)"
affects: [phase-04-actions-hitl, phase-05-frontend-shell, phase-06-frontend-cards, phase-08-dispatcher]

# Tech tracking
tech-stack:
  added: []  # No new deps; reused fastapi 0.136.1 + sqlalchemy 2.0 + aiosqlite from earlier phases
  patterns:
    - "Manual SSE framing via StreamingResponse + helper _format_sse() — avoids version-specific quirks of fastapi.sse.EventSourceResponse (which requires response_class=) and the missing sse-starlette package"
    - "UUIDv4 regex (_UUID_RE) on every {session_id} path param — single guard against directory-traversal in queue file writes (V11 mitigation)"
    - "STRFTIME(..., 'localtime') is the SINGLE source of truth for the today-window: both WHERE clauses and the response.date field derive from one call (Pitfall 4 mitigation, no drift between filter and label)"
    - "Pitfall 8 fallback: SESS-03/04/05 prefer live_state when present, gracefully degrade when absent — Phase 8 dispatcher will populate live_state without code change here"
    - "Append-only JSONL queue file under repo_root()-anchored .tmp/ tree; .tmp/ entry in .gitignore so message contents never leak to git"
    - "Direct generator-call pattern for SSE unit tests: stub Request with controlled is_disconnected() instead of httpx.stream (which buffers infinitely on long-lived ASGI streams in test transport)"

key-files:
  created:
    - "backend/cmc/api/routes/sessions.py — 7-endpoint sessions router (~280 LOC)"
  modified:
    - "backend/cmc/api/routes/__init__.py — sessions_router added to all_routers() (additive: preserved sibling Wave 1 routers mcp_router + observability_router)"
    - "backend/tests/test_phase3_sessions.py — 20 tests (1 wave-0 smoke + 19 SESS-01..07 tests)"
    - ".gitignore — appended `.tmp/` rule (BLOCKER 3 mitigation; SESS-06 queue files never enter git history)"

key-decisions:
  - "SESS-03 derives 'live' from sessions table (ended_at IS NULL AND started_at > now-5min) per RESEARCH Pitfall 8 + Open Q1; live_state row is preferred when present"
  - "SESS-04 returns 404 (not 500) when no live_state row exists — graceful degradation pattern"
  - "SESS-05 SSE: 1s poll, 60min cap, 3 missed-poll close; without live_state row emits heartbeat + retry:5000 then closes so client reconnects rather than holding connection"
  - "SESS-06 queue file path locked: repo_root() / .tmp/mission-control-queue/messages/{sid}.jsonl — Phase 8 dispatcher tails this directory (entry contract)"
  - "SESS-06 'live' check is stream-mode (ended_at IS NULL); 409 when session has ended — avoids queueing messages dispatcher can never deliver"
  - "SESS-07 today summary uses single STRFTIME(..., 'localtime') call as bucket-key source of truth (Pitfall 4 timezone consistency)"
  - "Manual SSE framing via StreamingResponse instead of fastapi.sse.EventSourceResponse — the latter requires response_class=EventSourceResponse + yielding ServerSentEvent, which is awkward to combine with the heartbeat-then-close fallback pattern. Manual SSE keeps the generator simple and version-agnostic."

patterns-established:
  - "Per-router test file organization (test_phase3_sessions.py) per Phase 3 wave-0 convention"
  - "_seed(client, [(Model, kwargs)...]) helper for raw INSERT against the seeded_app's sessionmaker — avoids ORM identity-map quirks across phases of a single test"
  - "SSE unit-test pattern: stub Request + direct generator call when ASGITransport buffering blocks streaming verification; integration test covers Content-Type via the self-terminating no-row branch"

# Metrics
duration: ~75 min
completed: 2026-04-26
---

# Phase 3 Plan 03: Sessions Router Summary

**Seven session-shaped endpoints (paginated list, details, live index, live state read, live SSE stream, follow-up message queue, today summary) wired into a single FastAPI router with Pitfall 8 graceful-degradation for the missing Phase 8 dispatcher.**

## Performance

- **Duration:** ~75 min (heavily inflated by an SSE-test debugging detour described under Issues Encountered)
- **Started:** 2026-04-26T12:39:10Z (continuing from Plan 03-01 completion)
- **Completed:** 2026-04-26T13:53Z
- **Tasks:** 2
- **Files modified:** 4 (1 new router, 1 modified router init, 1 new test, 1 .gitignore append)

## Accomplishments

- All 7 endpoints (SESS-01..07) implemented and passing 19 dedicated tests + 1 schema smoke
- Pitfall 8 fallback for SESS-03/04/05: works today against the sessions table; transparently upgrades when Phase 8 dispatcher starts writing live_state
- SESS-06 queue file path locked for Phase 8 dispatcher (entry contract documented in module docstring + plan summary)
- `.tmp/` gitignored so queue files never leak to git history (BLOCKER 3 mitigation verified via `git check-ignore`)
- Pre-existing 61 phase-1+2 tests stay green; 49 sibling Wave 1 phase-3 tests still pass; final result: 81 passing in my target suite (61 + 20)

## Task Commits

1. **Task 1 RED: Write failing tests for SESS-01/02/03/07** — `29d5eef` (test)
2. **Task 1 GREEN: Implement sessions router list/details/live/summary** — `8aa8128` (feat)
3. **Task 2 RED: Failing tests for SESS-04/05/06 + .gitignore .tmp/** — `daac6e7` (test)
4. **Task 2 GREEN: Implement live-state read + SSE stream + follow-up queue** — `670f55b` (feat)

## Endpoints Landed

### GET /api/sessions (SESS-01)

```http
GET /api/sessions?range=30d&source=claude-code&limit=50&offset=0
→ 200
{
  "items": [
    {"session_id": "...", "started_at": "...", "model": "...", "tokens_input": 100, ...}
  ],
  "total": 3,
  "limit": 50,
  "offset": 0
}
```

Range buckets: `today` (STRFTIME local-time midnight), `7d`/`30d` (datetime('now', '-N days')), `all` (no filter). `total` reflects the FILTERED count.

### GET /api/sessions/{sid}/details (SESS-02)

```http
GET /api/sessions/<uuid>/details
→ 200 {"session": {...}, "tools": [{tool_use_id, tool_name, started_at, mcp_server_name?, ...}]}
→ 400 {"error": "invalid session_id format"}   # malformed UUID
→ 404 {"error": "session not found"}
```

Tool timeline ordered by `started_at ASC`.

### GET /api/sessions/live (SESS-03 — Pitfall 8 fallback)

```http
GET /api/sessions/live
→ 200 [{session_id, started_at, last_activity_at, state?, current_tool?, model?}]
```

Filter: `ended_at IS NULL AND started_at > datetime('now', '-5 minutes')`. LEFT JOIN onto `live_state`; when no row, `last_activity_at` falls back to `started_at` and `state`/`current_tool` are `null`.

### GET /api/sessions/live/{sid}/state (SESS-04)

```http
GET /api/sessions/live/<uuid>/state
→ 200 LiveSessionState{session_id, last_activity_at, state, current_message?, current_tool?, pid?, updated_at}
→ 404 {"error": "no live state for session"}    # row absent (Pitfall 8)
→ 400 {"error": "invalid session_id format"}
```

### GET /api/sessions/live/{sid}/stream (SESS-05 — SSE)

```
HTTP/1.1 200 OK
Content-Type: text/event-stream

event: live_state
data: {"session_id":"...","state":"streaming","current_message":"hi","current_tool":"Bash","last_activity_at":"...","updated_at":"..."}

```

Or, when no live_state row exists (Pitfall 8 fallback):

```
event: heartbeat
retry: 5000
data: {"session_id":"...","live_state":null}

(after 3 polls the generator returns; client reconnects in 5s)
```

Caps at 60min (Pitfall 1), polls every 1s, honors `request.is_disconnected()`.

### POST /api/sessions/live/{sid}/message (SESS-06)

```http
POST /api/sessions/live/<uuid>/message
Content-Type: application/json
{"message": "hello there"}

→ 202 {"queued": true, "session_id": "<uuid>", "queue_path": "<repo_root>/.tmp/mission-control-queue/messages/<uuid>.jsonl"}
→ 400 {"error": "invalid session_id format"}
→ 422 (Pydantic) when message is empty or > 10_000 chars
→ 404 {"error": "session not found"}
→ 409 {"error": "session has ended"}    # ended_at IS NOT NULL
```

Each call appends one JSON line: `{"ts": ISO8601, "session_id": sid, "message": text}\n`.

### GET /api/summary (SESS-07)

```http
GET /api/summary
→ 200 {
  "date": "2026-04-26",        # local-day YYYY-MM-DD
  "sessions_count": 2,
  "tokens_input_total": 300, "tokens_output_total": 600,
  "tokens_cache_read_total": 150, "tokens_cache_create_total": 75,
  "tool_call_count": 8,
  "error_count": 1             # otel_events with event_name LIKE '%api_error%'
}
```

Single `STRFTIME('%Y-%m-%d', 'now', 'localtime')` is the source of truth — no drift between WHERE clauses and the response.date label (Pitfall 4).

## Live-State Strategy (Pitfall 8 Fallback)

Phase 2 ingestion does not write `live_state`; Phase 8 dispatcher will. Until then:

| Endpoint | Behavior with live_state row | Behavior without |
|----------|------------------------------|------------------|
| SESS-03 `/sessions/live` | Use `last_activity_at` + `state` + `current_tool` from row | Fall back to `last_activity_at = started_at`, state/current_tool = null |
| SESS-04 `/sessions/live/{sid}/state` | 200 with full snapshot | 404 (graceful) |
| SESS-05 `/sessions/live/{sid}/stream` | Emit `event: live_state` on each `updated_at` change | Emit `event: heartbeat` + `retry: 5000` for 3 polls then close |

Future hook: when Phase 8 dispatcher starts populating `live_state`, all three endpoints automatically upgrade to populated responses with no code change here.

## Queue File Path Contract (Entry for Phase 8)

```
<repo_root>/.tmp/mission-control-queue/messages/<session_id>.jsonl
```

- Path is repo-root-anchored (cwd-independent) via `cmc.core.paths.repo_root()`
- One JSON object per line: `{"ts": ISO8601, "session_id": str, "message": str}`
- Append-only writes; multiple follow-ups per session stack in arrival order
- Directory auto-created with `mkdir(parents=True, exist_ok=True)`
- `.tmp/` is gitignored — verified via `git check-ignore -q .tmp/foo` returncode 0
- Phase 8 dispatcher should `tail` this directory, deliver lines to the live Claude Code session, and (recommended) truncate consumed files

## Today-Summary Local-Time Bucket Strategy (Pitfall 4)

Both the WHERE clause and the response `date` field share a single SQL expression:

```sql
STRFTIME('%Y-%m-%d', 'now', 'localtime')
```

This guarantees no drift between "what the query filtered" and "what label the client sees" across DST transitions or near midnight UTC. The same expression buckets `started_at` (sessions) and `ts` (otel_events).

## Files Created/Modified

- `backend/cmc/api/routes/sessions.py` — APIRouter exporting `router` with 7 endpoints + `_format_sse()` helper + `_UUID_RE` guard
- `backend/cmc/api/routes/__init__.py` — additive import + append to `all_routers()` list (preserves siblings)
- `backend/tests/test_phase3_sessions.py` — 20 tests
- `.gitignore` — appended `.tmp/` rule

## Decisions Made

See key-decisions in frontmatter above. Two notable choices that deviated from the plan's literal text:

1. **Used `StreamingResponse(gen(), media_type="text/event-stream")` instead of `EventSourceResponse(gen())` from `fastapi.sse`.** The plan's import (`from fastapi.sse import EventSourceResponse`) does exist in FastAPI 0.136.1, but its intended usage is `response_class=EventSourceResponse` on the path operation + `yield ServerSentEvent(...)`. Combining that with the conditional heartbeat-then-close fallback (the generator must decide whether to keep yielding based on row presence) is awkward. The plan's `return EventSourceResponse(gen())` pattern is from `sse-starlette` — which is NOT installed. Manual SSE framing via `StreamingResponse` is simpler, version-agnostic, and gives full control over disconnect-detection and the no-row close. Documented in module docstring.

2. **SSE-with-row test calls `live_session_stream` directly with a stub `Request`.** httpx ASGITransport's streaming mode buffered the long-lived SSE generator indefinitely (the test hung after my fixed-format chunk yielded — never delivered to the client). Direct generator invocation with a controlled `is_disconnected()` exercises the production code path and verifies the SSE wire format without flow-control quirks. The companion no-row test still uses `client.stream(...)` end-to-end and verifies Content-Type + heartbeat framing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Tests asserted on `r.json()["detail"]` but app returns `{"error": ...}`**
- **Found during:** Task 2 GREEN — first test run failed with `KeyError: 'detail'` on `test_sess04_live_state_without_row_returns_404`
- **Issue:** The plan's tests assumed FastAPI's default `{"detail": ...}` envelope, but `cmc.core.errors.register_error_handlers` (Phase 1) overrides it to `{"error": exc.detail}`. Body shape didn't match the assertion.
- **Fix:** Updated only the SESS-04 404 test to check `r.json()["error"]` with a comment pointing to `cmc.core.errors`. Other tests already used status-code-only assertions and were unaffected.
- **Files modified:** `backend/tests/test_phase3_sessions.py` (one assertion line)
- **Verification:** All 20 tests pass.
- **Committed in:** `670f55b` (Task 2 GREEN commit; co-located with the implementation that made all 20 tests green)

**2. [Rule 3 - Blocking] SSE-with-row test hung indefinitely under httpx.ASGITransport**
- **Found during:** Task 2 GREEN — `test_sess05_stream_with_row` hung; pytest never returned after ~10 minutes
- **Issue:** `httpx.AsyncClient.stream()` with `ASGITransport` buffered chunks from my long-lived SSE generator. The generator yields once on the first poll, then loops without yielding (waiting for `updated_at` change). The test's `aiter_text()` never received the first chunk because the underlying transport doesn't flush mid-generator.
- **Fix:** Replaced the failing test with a direct generator-call pattern using a stub `Request` whose `is_disconnected()` returns `True` after the first iteration. This exercises the SAME `live_session_stream` function and verifies its SSE wire output (event name, JSON payload contents) without the ASGITransport flow-control quirk. The companion `test_sess05_stream_without_row_emits_heartbeat_and_closes` (which terminates naturally after 3 polls) still uses end-to-end `client.stream()` and verifies the Content-Type header.
- **Files modified:** `backend/tests/test_phase3_sessions.py` (one test rewritten)
- **Verification:** Test passes in 4.16s (entire 20-test file).
- **Committed in:** `670f55b` (Task 2 GREEN commit)

**3. [Rule 3 - Blocking] Plan's `from fastapi.sse import EventSourceResponse` returns the wrong class for the plan's `return EventSourceResponse(gen())` pattern**
- **Found during:** Task 2 GREEN setup — initial check for `sse_starlette` (the actual library whose `EventSourceResponse(generator)` constructor matches the plan) confirmed it is NOT installed.
- **Issue:** FastAPI 0.136.1's own `EventSourceResponse` is a `StreamingResponse` subclass that ONLY sets `media_type = "text/event-stream"`; the actual SSE encoding lives in FastAPI's routing layer and requires `response_class=EventSourceResponse` declared on the path operation + yielding `ServerSentEvent` items from a generator path operation. The plan's `return EventSourceResponse(gen())` pattern (sse-starlette syntax) would have produced a `StreamingResponse` whose body is dicts, not bytes — broken response.
- **Fix:** Used `StreamingResponse(gen(), media_type="text/event-stream")` directly with a `_format_sse()` helper that emits SSE wire-format bytes (`event:`, `retry:`, `data:`, blank line). Same effect as the plan, more reliable. Documented in module docstring.
- **Files modified:** `backend/cmc/api/routes/sessions.py`
- **Verification:** SESS-05 tests pass; Content-Type is `text/event-stream`; `event: heartbeat` + `retry: 5000` framing visible on the wire.
- **Committed in:** `670f55b` (Task 2 GREEN commit)

---

**Total deviations:** 3 auto-fixed (1 Rule 1 bug in test assertion, 2 Rule 3 blocking-issues with test framework / library API)

**Impact on plan:** All three were within plan scope (the contract for endpoints + their wire output was unchanged). No architectural changes required, no Rule 4 questions.

## Issues Encountered

The SSE-with-row test hang (covered above as deviation #2) was the dominant time sink — roughly 30 minutes of debugging. Lesson learned for sibling Wave 1 plans: when verifying long-lived SSE endpoints in tests, prefer direct generator invocation with a controlled `Request` stub for the "with data" case, and reserve `httpx.stream()` for self-terminating branches (heartbeat fallback). The same pattern should appear in Plan 03-04's tail-otel-events tests.

Concurrent parallel agents (Plans 03-02/04/05) shared the working tree and modified `backend/cmc/api/routes/__init__.py` repeatedly. The wave-1 read-before-edit + additive-only protocol worked correctly: my final commit's `__init__.py` preserves `mcp_router` (committed by Plan 03-05) AND `observability_router` (committed by Plan 03-04) alongside my `sessions_router`. No router was lost.

## User Setup Required

None — all changes are server-side Python; no external services or env vars introduced.

## Next Phase Readiness

**For Phase 8 dispatcher (the future writer of `live_state` and reader of the queue):**
- Read entry contract: `<repo_root>/.tmp/mission-control-queue/messages/<sid>.jsonl` — append-only JSONL, one record per follow-up
- When dispatcher starts writing `live_state` rows, SESS-03/04/05 automatically upgrade to populated responses without any code change here (verified by `test_sess03_live_prefers_live_state_row` + `test_sess04_live_state_with_row` + `test_sess05_stream_with_row`)
- Recommended: dispatcher truncates consumed JSONL files (or appends a watermark) so the directory doesn't grow unbounded; that contract belongs to Phase 8 to define

**For Phase 5/6 frontend:**
- LiveSessionsCard polls `GET /api/sessions/live` (cheap; LEFT JOIN is indexed)
- SessionsTable consumes `GET /api/sessions?range=...&source=...&model=...&limit=...&offset=...`
- Session detail drawer hits `GET /api/sessions/{id}/details`
- KpiRow at top-of-dashboard hits `GET /api/summary`
- For the live drawer's "what is the assistant typing" feed, subscribe to `GET /api/sessions/live/{sid}/stream` (EventSource) — handle the `heartbeat` event by waiting 5s before reconnecting (the `retry:` hint does this automatically in browsers)
- Follow-up message form POSTs to `/api/sessions/live/{sid}/message` and renders 202 vs 4xx accordingly

**Phase 3 Wave 1 status:** All 4 wave-1 plans (03-02 system, 03-03 sessions, 03-04 observability, 03-05 mcp/skills) execute in parallel against the same `__init__.py`. After this plan lands, `all_routers()` includes 7 routers (health, sync, mcp, sessions, observability, system?, skills?). Ready for plan-checker → integration-checker pipeline.

## Self-Check: PASSED

**Files claimed created/modified — verification:**
- `backend/cmc/api/routes/sessions.py` — FOUND (280 LOC)
- `backend/cmc/api/routes/__init__.py` — FOUND (modified, preserves all sibling routers)
- `backend/tests/test_phase3_sessions.py` — FOUND (20 tests)
- `.gitignore` — FOUND (`.tmp/` rule appended; `git check-ignore -q .tmp/foo` returns 0)

**Commits claimed — verification:**
- `29d5eef` (test RED Task 1) — FOUND
- `8aa8128` (feat GREEN Task 1) — FOUND
- `daac6e7` (test RED Task 2) — FOUND
- `670f55b` (feat GREEN Task 2) — FOUND

**Test counts — verification:**
- 20 sessions tests pass (4.16s)
- 61 phase 1+2 tests still pass (79s)
- Combined target suite: 81/81 pass

---
*Phase: 03-read-only-apis*
*Completed: 2026-04-26*
