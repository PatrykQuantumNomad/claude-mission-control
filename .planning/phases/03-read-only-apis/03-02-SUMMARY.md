---
phase: 03-read-only-apis
plan: 02
subsystem: api
tags: [phase-3, wave-1, system-router, sse, fastapi-sse, attention, whitelist, psutil]
requires:
  - 03-01 (cmc.api.schemas.system DTOs + tail_otel_events helper + seeded_app/client fixtures + lifespan boot_time)
  - 02-05 (lifespan + sessionmaker on app.state)
  - 02-04 (cmc.ingest.repository + scheduler — for db.models.sessions)
provides:
  - "GET /api/system/health (SAPI-02): uptime, RSS, otel ingest age, daemon ages, tzname"
  - "GET /api/system/state (SAPI-03): whitelisted KV read; non-whitelisted keys never leak"
  - "GET /api/attention (SAPI-04): aggregate attention with Pitfall-7 zero defaults; stuck-session + stale-dispatcher detection"
  - "GET /api/firehose (SAPI-05): SSE stream of OtelEvent rows via FastAPI 0.136.1 EventSourceResponse pattern"
  - "system_router registered in cmc.api.routes.__init__.all_routers() (sibling Wave 1 routers preserved)"
  - "test pattern: ASGITransport-incompatible SSE behaviors covered by direct unit tests on tail_otel_events"
affects:
  - "Phase 5+ frontend dashboard SystemHealthStrip / AttentionBar / OtelPanel firehose components"
  - "Phase 4 attention router — when Phase 4 lands tasks/decisions tables, edit /attention to populate pending_decisions and failed_tasks counters (DO NOT branch on schema presence)"
tech-stack:
  added:
    - "fastapi.sse.EventSourceResponse + ServerSentEvent (already shipped in fastapi 0.136.1; first runtime use in this plan)"
  patterns:
    - "FastAPI 0.136.1 SSE: path operation IS an async generator with response_class=EventSourceResponse — NOT sse_starlette's return-the-generator pattern"
    - "Pre-stream validation via separate FastAPI Depends() — HTTPException raised inside an SSE generator gets swallowed by the inner task group"
    - "Adapter from tail_otel_events dict output ({event,id,data}) -> ServerSentEvent(raw_data=...) to skip a second JSON encode"
    - "SAPI-03 whitelist enforcement: non-whitelisted-key 404 indistinguishable from 'whitelisted-but-absent' so the response doesn't confirm or deny existence"
    - "Pitfall 7: explicit zero values for Phase-4-deferred fields (pending_decisions, failed_tasks) so the contract stays stable as later phases land tables"
key-files:
  created:
    - backend/cmc/api/routes/system.py
  modified:
    - backend/cmc/api/routes/__init__.py
    - backend/tests/test_phase3_system.py
key-decisions:
  - "FastAPI 0.136.1 SSE pattern: path-op as async generator with response_class=EventSourceResponse (the plan referenced sse_starlette's return-the-generator pattern, which is NOT how fastapi 0.136.1 ships SSE)"
  - "?since= validation lives in a separate _resolve_since_id Depends — raising HTTPException inside the SSE generator gets wrapped in ExceptionGroup by FastAPI's task group and becomes a 500"
  - "SAPI-05 disconnect+stream tests use direct unit tests on tail_otel_events with a mock Request rather than HTTP-level client.stream(), because httpx ASGITransport never delivers http.disconnect to a streaming response (response_complete never fires for SSE)"
  - "SAPI-03 per-key 404 message is 'key not found' regardless of whitelist — does not confirm or deny existence of internal keys (T-03-02-01 mitigation)"
  - "register_error_handlers wraps detail as {\"error\": ...} — the Phase 1 contract (NOT FastAPI default {\"detail\": ...}); SAPI-05 invalid_since test reads either field"
patterns-established:
  - "SSE in this codebase: path operation IS an async generator yielding ServerSentEvent; validation goes in a Depends() before the response starts"
  - "Pitfall-7 attention pattern: read EVERY field, return 0/None for things later phases will populate — never branch on table emptiness"
  - "Whitelist enforcement at the route layer (frozenset constant + explicit IN-clause filter) for KV reads — does not require schema-level filtering"
metrics:
  duration_min: 30
  tasks_completed: 2
  completed_date: 2026-04-26
---

# Phase 3 Plan 02: System Router (SAPI-02..05) Summary

**Four /api/system endpoints landed: health (uptime + RSS + otel age + daemon ages), whitelisted KV state, attention aggregator with Pitfall-7 zero defaults, and a real SSE firehose using FastAPI 0.136.1's EventSourceResponse pattern (NOT sse_starlette's return-the-generator pattern).**

## Performance

- **Duration:** ~30 min (TDD with 4 commits + parallel-agent coordination overhead)
- **Started:** 2026-04-26T08:50Z
- **Completed:** 2026-04-26T09:35Z
- **Tasks:** 2 (Task 1: SAPI-01..04; Task 2: SAPI-05 SSE)
- **Files modified:** 3 (1 created, 2 modified)
- **Tests added:** 12 (6 SAPI-01..04 endpoint tests + 1 invalid-since 400 test + 1 route registration test + 3 SSE unit tests + 1 wiring contract test)

## Accomplishments

- **GET /api/system/health (SAPI-02):** All 6 fields (status, uptime_seconds, memory_rss_mb, last_otel_event_age_seconds, daemon_ages, tzname). Pitfall 4 tz-naive normalization for SQLite datetimes. Memory via psutil RSS (no cpu_percent — interval blocks).
- **GET /api/system/state (SAPI-03):** Whitelist enforcement (T-03-02-01 mitigation). Internal keys never leak; per-key 404 is indistinguishable from "whitelisted but absent".
- **GET /api/attention (SAPI-04):** Pitfall 7 — pending_decisions=0 and failed_tasks=0 ALWAYS in response (not branched on Phase 4 schema presence). Stuck sessions: started >3h ago + ended_at=None. Stale dispatcher: derived from system_state KV.
- **GET /api/firehose (SAPI-05):** SSE stream via FastAPI 0.136.1 EventSourceResponse marker pattern. Reuses cmc.api.sse.tail_otel_events (Pitfall 1+3 already mitigated inside the helper).
- **system_router registered** in cmc.api.routes.__init__.all_routers() preserving sibling Wave 1 entries (mcp, sessions, observability already added by parallel agents).
- **SAPI-01 contract preserved:** `/api/health` continues to return 200 + `{"status": "ok"}` after Wave 1 router-registration edits — verified by test_sapi01_health_still_returns_ok.

## Task Commits

Each task followed TDD (test → feat) and committed atomically:

1. **Task 1 RED — SAPI-01..04 failing tests:** `d4ae95a` (test)
2. **Task 1 GREEN — system router (SAPI-02/03/04) + __init__.py wiring:** `2fd7900` (feat) [+ __init__.py absorbed into the parallel obsv agent's commit `0362b27` — see Coordination Notes below]
3. **Task 2 RED — SAPI-05 SSE failing tests:** `ca320be` (test)
4. **Task 2 GREEN — /api/firehose SSE + auto-fixed test design:** `b038594` (feat)

## Endpoints Landed (Sample Response Shapes)

### GET /api/system/health
```json
{
  "status": "ok",
  "uptime_seconds": 42,
  "memory_rss_mb": 87.3,
  "last_otel_event_age_seconds": 9,
  "daemon_ages": [
    {"key": "jsonl_sync_last_tick_at", "last_tick_at": null, "age_seconds": null},
    {"key": "dispatcher_last_tick_at", "last_tick_at": null, "age_seconds": null},
    {"key": "telegram_last_tick_at", "last_tick_at": null, "age_seconds": null}
  ],
  "tzname": "PDT"
}
```

### GET /api/system/state
```json
{ "items": { "tzname": "PDT", "emergency_stop": "0" } }
```
Or with `?key=tzname`: `{ "items": { "tzname": "PDT" } }`. Internal keys (e.g., `internal_secret_key`) NEVER appear; per-key requests for them return 404.

### GET /api/attention (empty Phase 4 state)
```json
{
  "items": [],
  "pending_decisions": 0,
  "failed_tasks": 0,
  "stale_dispatcher_seconds": null,
  "stuck_sessions": 0
}
```

With a stuck session present:
```json
{
  "items": [{
    "kind": "stuck_sessions",
    "severity": "warning",
    "count": 1,
    "detail": "1 session(s) running >3h with no end timestamp"
  }],
  "pending_decisions": 0,
  "failed_tasks": 0,
  "stale_dispatcher_seconds": null,
  "stuck_sessions": 1
}
```

### GET /api/firehose
```
HTTP/1.1 200 OK
content-type: text/event-stream
cache-control: no-cache
x-accel-buffering: no

event: otel
id: 42
data: {"id":42,"ts":"2026-04-26T09:30:00+00:00","event_name":"claude_code.api_request","session_id":"sess-1","attrs_mcp_server":null,"attrs_mcp_tool":null}

: ping

...
```

## SAPI-03 Whitelist (Locked Here)

Adding a new public KV key requires editing `_SYSTEM_STATE_WHITELIST` in `backend/cmc/api/routes/system.py` AND a code review:

```python
_SYSTEM_STATE_WHITELIST = frozenset({
    "tzname",
    "last_jsonl_sync_at",
    "jsonl_sync_last_tick_at",
    "dispatcher_last_tick_at",
    "telegram_last_tick_at",
    "emergency_stop",
})
```

Threat T-03-02-01 (Information Disclosure) mitigated: per-key 404 is "key not found" regardless of whether the key is unknown vs. simply not in DB — does not confirm or deny existence of internal keys.

## Pitfall 7 Strategy (Locked Here)

`/api/attention` ALWAYS returns `pending_decisions=0` and `failed_tasks=0`, even though the underlying Phase 4 tables don't exist yet. The contract intentionally does NOT branch on schema presence. When Phase 4 lands the tasks/decisions tables, edit this function to populate the counters via real queries — DO NOT introduce conditional schema branches.

## Pattern Reference: How Routers Should Consume tail_otel_events from cmc.api.sse

The shared SSE helper yields `{event, id, data}` dicts in sse_starlette format. To use it from a FastAPI 0.136.1 route, BE the generator and adapt to ServerSentEvent:

```python
from fastapi.sse import EventSourceResponse, ServerSentEvent
from cmc.api.sse import tail_otel_events

@router.get("/firehose", response_class=EventSourceResponse)
async def firehose(request: Request, db: AsyncSession = Depends(get_session)):
    async for chunk in tail_otel_events(request, db, since_id=0, event_name=None):
        yield ServerSentEvent(
            event=chunk.get("event"),
            id=chunk.get("id"),
            raw_data=chunk.get("data"),  # already JSON-encoded
        )
```

The disconnect-detection / 60min cap / per-iteration query patterns ALREADY live inside `tail_otel_events` (Pitfall 1 + 3). Routers do not re-implement them.

## Where the Firehose Disconnect Path Lives

**Production:** `cmc.api.sse.tail_otel_events` polls `await request.is_disconnected()` at the top of each loop iteration. Real uvicorn delivers `http.disconnect` ASGI messages on client close; the helper exits within ~1s of disconnect (poll interval is `SSE_POLL_INTERVAL_S = 1.0`).

**Tests:** Direct unit tests construct a fake Request whose `is_disconnected()` returns True after N calls, drive `tail_otel_events` directly, and assert it terminates. See `test_sapi05_tail_otel_events_exits_on_disconnect` and friends. The HTTP-level disconnect path is NOT tested through ASGITransport because that transport never delivers `http.disconnect` for streaming responses (see Deviations § Auto-fix #2 below).

## Coordination Notes (Wave 1 Parallel Agents)

This plan ran concurrently with 03-03 (sessions), 03-04 (observability), and 03-05 (mcp + skills) in the same git worktree. Coordination patterns observed and applied:

- **Read-before-edit on `__init__.py`:** Each agent reads the current state of `cmc/api/routes/__init__.py` immediately before adding their import + `all_routers()` entry, so sibling additions are preserved.
- **Atomic commit absorption:** When the obsv agent committed `0362b27` (their feat), my disk-only edit to `__init__.py` (system_router import) was already applied. They `git add backend/cmc/api/routes/__init__.py` which staged BOTH their changes AND mine. Result: my system_router import landed inside their commit. My subsequent `git add` of the same file was a no-op. The history is: `0362b27` adds observability_router AND system_router (because system.py existed in the worktree but wasn't yet committed); my `2fd7900` adds only `system.py`. Per Wave 1 coordination doctrine: this is acceptable — the file content is correct and no work was lost.
- **Per-router test files:** Each plan APPENDS to its matching `test_phase3_*.py` file rather than creating a new one (Plan 03-01 convention).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FastAPI 0.136.1 SSE pattern is "BE the generator", not "return EventSourceResponse(generator)"**
- **Found during:** Task 2 (SSE implementation)
- **Issue:** The plan's Step A code referenced the sse_starlette pattern: `return EventSourceResponse(generator)`. FastAPI 0.136.1's `EventSourceResponse` is a marker class (just sets `media_type = "text/event-stream"`); the actual SSE wire-format encoding is performed by FastAPI's routing layer when the path operation is an async generator with `response_class=EventSourceResponse`.
- **Fix:** Path operation rewritten as `async def firehose(...)` with `yield ServerSentEvent(...)` and `response_class=EventSourceResponse` decorator argument. Adapter from helper's dict output to ServerSentEvent.raw_data preserves the data field's pre-encoded JSON.
- **Files modified:** backend/cmc/api/routes/system.py
- **Verification:** test_sapi05_firehose_route_is_registered + test_sapi05_firehose_route_uses_event_source_response confirm wiring; production behavior verified manually via curl pattern documented above.
- **Committed in:** b038594

**2. [Rule 1 - Bug] HTTPException raised inside an SSE generator gets swallowed by FastAPI's inner task group**
- **Found during:** Task 2 (first run of test_sapi05_firehose_invalid_since_returns_400)
- **Issue:** Plan's Step A validated `?since=` inside the firehose generator and raised `HTTPException(status_code=400)`. FastAPI 0.136.1 wraps the SSE generator in an inner anyio task group (`_sse_producer_cm`); exceptions raised inside the generator surface as ExceptionGroup wrappers and the response status code stays 200 (or becomes 500 with empty body), not 400.
- **Fix:** Extracted `?since=` validation into a separate `_resolve_since_id` async dependency invoked via `Depends(...)`. FastAPI's request-handling pipeline runs deps BEFORE entering the streaming context, so `HTTPException(400)` from the dep produces a normal 400 response.
- **Files modified:** backend/cmc/api/routes/system.py
- **Verification:** test_sapi05_firehose_invalid_since_returns_400 returns 400 with body containing "since" / "timestamp" in the error string.
- **Committed in:** b038594

**3. [Rule 1 - Bug] Plan's SSE tests via httpx ASGITransport hang indefinitely; ASGITransport never delivers http.disconnect for streaming responses**
- **Found during:** Task 2 (running the original test_sapi05_firehose_disconnect_does_not_break_subsequent_requests)
- **Issue:** httpx 0.28.1's ASGITransport `receive()` only returns `{"type": "http.disconnect"}` AFTER `response_complete.set()` is called. For SSE streams, `response_complete` is never set during streaming (`more_body=True` for the entire stream). Therefore `request.is_disconnected()` returns False forever during the test and `tail_otel_events` polls indefinitely until the 60min cap, hanging the test process.
- **Fix:** Replaced the 4 plan-spec'd HTTP-level SSE tests with: (a) ONE HTTP-level test asserting Content-Type + route registration with a hard `asyncio.wait_for(..., timeout=3.0)` cap, (b) THREE direct unit tests driving `tail_otel_events` with a mock Request whose `is_disconnected()` returns True after N calls, (c) ONE route-introspection test confirming `response_class=EventSourceResponse`. Behavior coverage equivalent: yields one event per OtelEvent, honors event_name filter, exits on disconnect. Full-stack production behavior is verified via the Phase 3 verifier checkpoint and the SMOKE recipe — not via ASGITransport.
- **Files modified:** backend/tests/test_phase3_system.py
- **Verification:** All 17 tests in test_phase3_system.py pass in 5.91s (no hangs); Phase 1+2 still 61/61.
- **Committed in:** b038594

**4. [Rule 1 - Bug] register_error_handlers wraps HTTPException as `{"error": ...}` not FastAPI default `{"detail": ...}`**
- **Found during:** Task 2 (test_sapi05_firehose_invalid_since_returns_400 first pass)
- **Issue:** The Phase 1 `cmc/core/errors.py:register_error_handlers` overrides the HTTPException handler to return `JSONResponse({"error": exc.detail}, status_code=...)`. The plan's test asserted `response.json()["detail"]` (FastAPI's default key), which is empty under this project.
- **Fix:** Test now reads either `body["error"]` (project convention) or `body["detail"]` (FastAPI default fallback), and asserts the message text contains "since" or "timestamp".
- **Files modified:** backend/tests/test_phase3_system.py
- **Verification:** Test passes, asserts the correct error message regardless of which key is present.
- **Committed in:** b038594

---

**Total deviations:** 4 auto-fixed (4× Rule 1 — bugs in plan's stated patterns vs. actual library behavior of fastapi 0.136.1 / httpx 0.28.1 / project's own error wrapper)
**Impact on plan:** All four were correctness fixes (SSE wouldn't work, validation wouldn't return 400, tests would hang, body assertion was wrong). Behavior delivered matches the plan's success criteria 1:1; only the implementation patterns differ.

## Issues Encountered

- **Heavy parallel-agent activity:** Three other Wave 1 agents (03-03, 03-04, 03-05) edited the same git worktree concurrently. Multiple stale pytest processes from those agents consumed system load while my SSE tests ran, contributing to perceived "hangs" before I diagnosed the underlying ASGITransport/SSE issue (Deviation #3). Workaround: ran my tests with shell `timeout 30/60` wrappers to bound execution time, killed stuck processes from prior runs, and re-ran cleanly.

## Next Phase Readiness

Wave 1 Plan 03-02 closed. Sibling Wave 1 plans:
- 03-03 (sessions): Task 1 GREEN landed (`8aa8128`), Task 2 RED landed (`daac6e7`); SESS-04/05/06 GREEN still pending in their plan
- 03-04 (observability): COMPLETE (commits `0362b27`, `722237a`, `b65ea46` — closing docs commit)
- 03-05 (mcp + skills): MCP done (`3a2c3a0`), skills RED landed (`485a75e`); skills GREEN pending

Once all four Wave 1 plans land, Phase 3 verifier can run end-to-end. SAPI must_haves are unblocked for Phase 5+ frontend.

**Future hook:** When Phase 4 lands the tasks/decisions tables, edit `attention()` in `backend/cmc/api/routes/system.py` to populate `pending_decisions` and `failed_tasks` via real queries against `decisions` (status='pending') and `tasks` (status='failed'). Do NOT introduce schema-presence branching (Pitfall 7). The frontend already handles `count > 0` items in the `items` array — Phase 4 just needs to push real numbers into the existing fields.

---
*Phase: 03-read-only-apis*
*Completed: 2026-04-26*

## Self-Check: PASSED

Files verified:
- backend/cmc/api/routes/system.py (created, contains 4 endpoints + 1 helper Depends)
- backend/cmc/api/routes/__init__.py (modified, system_router import + appended to all_routers())
- backend/tests/test_phase3_system.py (modified, 12 new SAPI tests appended)
- .planning/phases/03-read-only-apis/03-02-SUMMARY.md (created)

Commits verified in git log:
- d4ae95a (test RED Task 1 — SAPI-01..04 failing tests)
- 2fd7900 (feat GREEN Task 1 — system router SAPI-02/03/04)
- ca320be (test RED Task 2 — SAPI-05 SSE failing tests)
- b038594 (feat GREEN Task 2 — /api/firehose SSE + auto-fixes)

Tests verified:
- 17/17 in test_phase3_system.py pass in 5.91s
- Phase 1 + Phase 2: 61/61 still green (no regression)
- Total relevant: 78/78
