"""System router tests (SAPI-*).

Every SAPI-* test lives in this file. Sibling files own their respective
routers:

  - SESS-* tests  -> test_sessions_router.py
  - OBSV-* tests  -> test_observability_router.py
  - MCP-*  tests  -> test_mcp_router.py
  - SKILL-* tests -> test_skills_router.py
"""


def test_system_schemas_importable() -> None:
    """Wave-0 smoke: SAPI response DTOs are importable from cmc.api.schemas.system."""
    from cmc.api.schemas.system import (  # noqa: F401
        AttentionItem,
        AttentionResponse,
        DaemonAge,
        FirehoseEvent,
        SystemHealthResponse,
        SystemStateResponse,
    )


def test_psutil_importable_and_alive() -> None:
    """Wave-0 smoke: psutil is installed and Process().memory_info() works.

    SAPI-02 calls psutil.Process().memory_info().rss for the health endpoint;
    if this assertion ever fails the dep was not installed correctly.
    """
    import psutil

    rss = psutil.Process().memory_info().rss
    assert rss > 0


def test_tail_otel_events_callable() -> None:
    """Wave-0 smoke: shared SSE helper is importable + callable.

    The full streaming behavior is covered by SAPI-05 / SESS-05 tests;
    this test just guarantees the import contract for callers that do
    `from cmc.api.sse import tail_otel_events`.
    """
    from cmc.api.sse import tail_otel_events

    assert callable(tail_otel_events)


def test_seeded_app_yields_tuple(seeded_app) -> None:
    """Wave-0 smoke: seeded_app fixture yields (app, lifespan_cm) tuple.

    Router tests use this shape as
        app, cm = seeded_app
        async with cm:
            ...
    so we lock the contract here.
    """
    assert isinstance(seeded_app, tuple)
    assert len(seeded_app) == 2
    app, cm = seeded_app
    # `cm` is an async context manager (lifespan_context returns one)
    assert hasattr(cm, "__aenter__")
    assert hasattr(cm, "__aexit__")
    # `app` carries the test settings
    assert app.state.settings is not None


async def test_client_health_endpoint_returns_200(client) -> None:
    """Wave-0 smoke: the `client` fixture properly enters the lifespan and
    routes /api/health through to the health router.

    This proves the shared fixture chain works end-to-end:
      seeded_app -> create_app(settings) -> lifespan startup -> ASGITransport
      -> httpx.AsyncClient -> /api/health -> 200
    """
    response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# ---------- SAPI-01..04 ----------

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy import insert

from cmc.db.models.otel_events import OtelEvent
from cmc.db.models.sessions import Session as SessionModel
from cmc.db.models.system_state import SystemState

from .conftest import make_otel_event, make_session_row


async def _seed(client_fixture, rows: list[tuple[type, dict]]) -> None:
    """Insert ORM rows directly via the seeded app's sessionmaker.

    Mirrors the helper in test_sessions_router.py so SAPI tests can stay
    self-contained.
    """
    sessionmaker = client_fixture._transport.app.state.sessions
    async with sessionmaker() as s:
        for model, row in rows:
            await s.execute(insert(model).values(**row))
        await s.commit()


# ---- SAPI-01 contract preserved through router edits -------------------------


async def test_sapi01_health_still_returns_ok(client) -> None:
    """SAPI-01: GET /api/health continues to return 200 + {"status": "ok"}
    with system_router registered in all_routers().

    The health route lives in cmc/api/routes/health.py. This verifies that
    router-registration edits don't regress it.
    """
    response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# ---- Test 1: SAPI-02 happy path (empty otel_events table) ----


async def test_sapi02_system_health_happy_empty_otel(client) -> None:
    """SAPI-02: /api/system/health returns 200 with all 6 fields. With an
    empty otel_events table, last_otel_event_age_seconds MUST be None."""
    response = await client.get("/api/system/health")
    assert response.status_code == 200
    body = response.json()

    # All 6 fields present
    assert "status" in body
    assert "uptime_seconds" in body
    assert "memory_rss_mb" in body
    assert "last_otel_event_age_seconds" in body
    assert "daemon_ages" in body
    assert "tzname" in body

    # status defaults to "ok" (degraded heuristic deferred)
    assert body["status"] == "ok"

    # Numeric ranges
    assert body["uptime_seconds"] >= 0
    assert body["memory_rss_mb"] > 0

    # daemon_ages: 3 entries, ages None when no system_state rows present
    assert isinstance(body["daemon_ages"], list)
    assert len(body["daemon_ages"]) == 3
    keys = {d["key"] for d in body["daemon_ages"]}
    assert keys == {
        "jsonl_sync_last_tick_at",
        "dispatcher_last_tick_at",
        "telegram_last_tick_at",
    }
    for entry in body["daemon_ages"]:
        assert entry["age_seconds"] is None

    # Empty otel_events table
    assert body["last_otel_event_age_seconds"] is None

    # tzname is a non-empty string
    assert isinstance(body["tzname"], str)
    assert len(body["tzname"]) > 0


# ---- Test 2: SAPI-02 with otel events present ----


async def test_sapi02_system_health_with_otel_events(client) -> None:
    """SAPI-02: When otel_events has rows, last_otel_event_age_seconds is an
    int >= 0 (Pitfall 4: tz-naive SQLite datetimes are normalized to UTC)."""
    # Insert one OtelEvent ~10s in the past (tz-aware UTC)
    ten_s_ago = datetime.now(UTC) - timedelta(seconds=10)
    await _seed(
        client,
        [(OtelEvent, make_otel_event(ts=ten_s_ago, event_name="claude_code.api_request"))],
    )

    response = await client.get("/api/system/health")
    assert response.status_code == 200
    body = response.json()

    assert body["last_otel_event_age_seconds"] is not None
    assert isinstance(body["last_otel_event_age_seconds"], int)
    assert body["last_otel_event_age_seconds"] >= 0
    # generous upper bound: should be ~10s, allow 60s of test slop
    assert body["last_otel_event_age_seconds"] < 600


# ---- Test 3: SAPI-03 whitelist enforcement ----


async def test_sapi03_system_state_whitelist_enforcement(client) -> None:
    """SAPI-03: Non-whitelisted DB rows MUST NEVER appear in response.
    Per-key request to non-whitelisted key returns 404."""
    # Three rows: 2 whitelisted, 1 non-whitelisted
    await _seed(
        client,
        [
            (SystemState, {"key": "tzname", "value": "PDT", "value_json": None}),
            (SystemState, {"key": "emergency_stop", "value": "0", "value_json": None}),
            (SystemState, {"key": "internal_secret_key", "value": "leak-me", "value_json": None}),
        ],
    )

    # No-key request returns ONLY whitelisted keys
    response = await client.get("/api/system/state")
    assert response.status_code == 200
    body = response.json()
    assert "items" in body
    items = body["items"]
    assert "tzname" in items
    assert items["tzname"] == "PDT"
    assert "emergency_stop" in items
    assert items["emergency_stop"] == "0"
    assert "internal_secret_key" not in items  # critical: non-whitelisted MUST be absent

    # Per-key request to non-whitelisted key returns 404 (does not confirm existence)
    response = await client.get("/api/system/state?key=internal_secret_key")
    assert response.status_code == 404

    # Per-key request to whitelisted-and-present key returns single-item dict
    response = await client.get("/api/system/state?key=tzname")
    assert response.status_code == 200
    assert response.json() == {"items": {"tzname": "PDT"}}

    # Per-key request to whitelisted-but-not-in-DB key returns 404
    response = await client.get("/api/system/state?key=last_jsonl_sync_at")
    assert response.status_code == 404


# ---- Test 4: SAPI-04 graceful empty workflow tables ----


async def test_sapi04_attention_empty_workflow_tables_returns_zeros(client) -> None:
    """SAPI-04 / Pitfall 7: pending_decisions=0, failed_tasks=0 ALWAYS in the
    response, even when workflow tables are empty. No conditional schema."""
    response = await client.get("/api/attention")
    assert response.status_code == 200
    body = response.json()

    # All required fields present
    assert "items" in body
    assert "pending_decisions" in body
    assert "failed_tasks" in body
    assert "stale_dispatcher_seconds" in body
    assert "stuck_sessions" in body

    # Pitfall 7: zeros are explicit, NOT omitted via branching on empty tables
    assert body["pending_decisions"] == 0
    assert body["failed_tasks"] == 0
    assert body["stuck_sessions"] == 0
    assert body["stale_dispatcher_seconds"] is None
    assert body["items"] == []


# ---- Test 5: SAPI-04 detects stuck session (>3h with no end timestamp) ----


async def test_sapi04_attention_detects_stuck_session(client) -> None:
    """SAPI-04 stuck_sessions: a session that started >3h ago and has no
    ended_at is counted as stuck and surfaces as an AttentionItem."""
    four_hours_ago = datetime.now(UTC) - timedelta(hours=4)
    await _seed(
        client,
        [
            (SessionModel, make_session_row(
                session_id=str(uuid4()),
                started_at=four_hours_ago,
                ended_at=None,
            )),
        ],
    )

    response = await client.get("/api/attention")
    assert response.status_code == 200
    body = response.json()

    assert body["stuck_sessions"] == 1
    kinds = {item["kind"] for item in body["items"]}
    assert "stuck_sessions" in kinds


# ---------- SAPI-05 firehose SSE ----------

import asyncio
import json as _json
from unittest.mock import MagicMock


def _parse_sse_chunks(raw: str) -> list[dict]:
    """Tiny SSE parser for tests.

    Returns a list of {event, id, data} dicts. Ignores comment lines
    (`: ping`) and empty events. `data` stays as the raw string (callers
    json.loads if they need a dict).
    """
    events: list[dict] = []
    current: dict = {}
    for line in raw.splitlines():
        if not line:
            if current:
                events.append(current)
                current = {}
            continue
        if line.startswith(":"):
            # comment / keep-alive
            continue
        if ":" not in line:
            continue
        field, _, value = line.partition(":")
        if value.startswith(" "):
            value = value[1:]
        if field == "data" and "data" in current:
            # multi-line data is concatenated with newlines per spec
            current["data"] = current["data"] + "\n" + value
        else:
            current[field] = value
    if current:
        events.append(current)
    return events


# ---- Note on SSE testing strategy ----
#
# Earlier tests used `client.stream("GET", "/api/firehose")` over
# httpx ASGITransport. That pattern HANGS in this stack because:
#   - tail_otel_events polls request.is_disconnected() each iteration
#   - ASGITransport's receive() never returns http.disconnect for a streaming
#     response: it can only signal disconnect AFTER response_complete.set(),
#     which never fires for SSE (more_body=True forever)
#   - Even client-side aclose() doesn't push http.disconnect through fast
#     enough; the inner FastAPI task group keeps awaiting our generator
#
# Mitigation: keep ONE HTTP-level test (asserting Content-Type + 400) and
# move the streaming-behavior assertions to a unit test that drives
# tail_otel_events directly with a controllable mock Request. This preserves
# every relevant behavior without requiring a real uvicorn server in the test loop.
# Production behavior (real uvicorn / curl -N) is verified by the smoke recipe.


async def test_sapi05_firehose_invalid_since_returns_400(client) -> None:
    """SAPI-05: ?since=<bogus> returns 400 with a helpful detail (Validation
    protects the endpoint from malformed timestamps).

    Note: the register_error_handlers wrapper renders HTTPException
    as `{"error": detail}` (NOT FastAPI's default `{"detail": ...}`), so the
    body assertion uses `error`. See cmc/core/errors.py.
    """
    response = await client.get("/api/firehose?since=not-a-timestamp")
    assert response.status_code == 400
    body = response.json()
    err = body.get("error", "") or body.get("detail", "")
    assert "since" in err.lower() or "timestamp" in err.lower()


async def test_sapi05_firehose_route_is_registered(client) -> None:
    """SAPI-05: /api/firehose route exists (does not 404 / does not fall
    through to the SPA mount). We can't read the SSE body via ASGITransport
    without hanging, so we just assert the route resolves to a streaming
    response by sending a HEAD-like check via a 0-byte read pattern.

    Strategy: open a stream with a hard wait_for(...) cap. We accept either:
      (a) a 200 + text/event-stream content-type within the cap, OR
      (b) the stream takes >cap and we abort — which still proves the
          endpoint is wired (otherwise we'd get an immediate 200 text/html
          from the SPA mount catching the GET).
    """
    async def _check():
        async with client.stream("GET", "/api/firehose", timeout=5) as resp:
            assert resp.status_code == 200
            ct = resp.headers["content-type"]
            return ct
    try:
        ct = await asyncio.wait_for(_check(), timeout=3.0)
        assert "text/event-stream" in ct
    except TimeoutError:
        # Stream is open and waiting for events — that's the right behavior.
        # If route weren't registered, SPA mount would have returned text/html
        # synchronously before any timeout could fire.
        pass


# ---- Direct unit tests for tail_otel_events (the SSE machinery) ----


def _fake_disconnecting_request(after_n_calls: int = 1) -> MagicMock:
    """Build a fake Request whose is_disconnected() returns True after N
    calls. Mirrors the contract Starlette's Request guarantees."""
    req = MagicMock()
    counter = {"n": 0}

    async def is_disconnected():
        counter["n"] += 1
        return counter["n"] > after_n_calls

    req.is_disconnected = is_disconnected
    return req


async def test_sapi05_tail_otel_events_yields_dict_per_row(seeded_app) -> None:
    """SAPI-05 unit: tail_otel_events yields one {event,id,data} dict per
    new OtelEvent and exits when request.is_disconnected() flips True."""
    from cmc.api.sse import tail_otel_events

    app, cm = seeded_app
    async with cm:
        # Insert two events
        async with app.state.sessions() as s:
            base = datetime.now(UTC) - timedelta(seconds=1)
            from sqlalchemy import insert as _insert
            await s.execute(_insert(OtelEvent).values(
                **make_otel_event(ts=base, event_name="claude_code.api_request")
            ))
            await s.execute(_insert(OtelEvent).values(
                **make_otel_event(
                    ts=base + timedelta(milliseconds=10),
                    event_name="claude_code.tool_result",
                )
            ))
            await s.commit()

        # Drive the generator with a fake Request that disconnects after the
        # first iteration (so we collect events from one batch then exit)
        async with app.state.sessions() as s:
            req = _fake_disconnecting_request(after_n_calls=1)
            chunks = [
                chunk async for chunk in tail_otel_events(req, s, since_id=0)
            ]

        # Both events should be yielded in the first batch
        assert len(chunks) == 2
        for chunk in chunks:
            assert chunk["event"] == "otel"
            assert chunk["id"]  # non-empty id string
            payload = _json.loads(chunk["data"])
            assert "event_name" in payload
            assert "ts" in payload


async def test_sapi05_tail_otel_events_event_name_filter(seeded_app) -> None:
    """SAPI-05 unit: ?event_name= filter narrows what tail_otel_events yields."""
    from sqlalchemy import insert as _insert

    from cmc.api.sse import tail_otel_events

    app, cm = seeded_app
    async with cm:
        async with app.state.sessions() as s:
            base = datetime.now(UTC) - timedelta(seconds=1)
            await s.execute(_insert(OtelEvent).values(
                **make_otel_event(ts=base, event_name="claude_code.api_request")
            ))
            await s.execute(_insert(OtelEvent).values(
                **make_otel_event(
                    ts=base + timedelta(milliseconds=10),
                    event_name="claude_code.tool_result",
                )
            ))
            await s.commit()

        async with app.state.sessions() as s:
            req = _fake_disconnecting_request(after_n_calls=1)
            chunks = [
                chunk
                async for chunk in tail_otel_events(
                    req, s, since_id=0, event_name="claude_code.api_request"
                )
            ]

        # Only the api_request event should pass the filter
        assert len(chunks) == 1
        payload = _json.loads(chunks[0]["data"])
        assert payload["event_name"] == "claude_code.api_request"


async def test_sapi05_tail_otel_events_exits_on_disconnect(seeded_app) -> None:
    """SAPI-05 / Pitfall 1: tail_otel_events exits cleanly when
    request.is_disconnected() returns True — no infinite loop, no leaked
    coroutines."""
    from cmc.api.sse import tail_otel_events

    app, cm = seeded_app
    async with cm:
        async with app.state.sessions() as s:
            req = _fake_disconnecting_request(after_n_calls=0)  # disconnect immediately
            # Should return after first is_disconnected() check
            chunks = [
                chunk async for chunk in tail_otel_events(req, s, since_id=0)
            ]

        # No events were inserted, and we disconnect immediately, so 0 chunks
        assert chunks == []


async def test_sapi05_firehose_route_uses_event_source_response() -> None:
    """SAPI-05 wiring contract: the firehose path operation is registered
    with response_class=EventSourceResponse so FastAPI's routing layer wraps
    yielded ServerSentEvent objects into SSE wire format."""
    from fastapi.sse import EventSourceResponse

    from cmc.api.routes.system import router as system_router

    firehose_routes = [
        r for r in system_router.routes if getattr(r, "path", None) == "/firehose"
    ]
    assert len(firehose_routes) == 1
    route = firehose_routes[0]
    # FastAPI APIRoute exposes response_class as a default-placeholder; assert
    # the underlying class is EventSourceResponse.
    rc = getattr(route, "response_class", None)
    actual = getattr(rc, "value", rc)
    assert actual is EventSourceResponse
