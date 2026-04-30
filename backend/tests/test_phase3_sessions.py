"""Phase 3 sessions-router tests (SESS-*).

Phase 3 per-router convention: every SESS-* test lives in this file.
See test_phase3_system.py module docstring for the full convention.
"""

import json
import subprocess
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import insert

from cmc.core.paths import repo_root
from cmc.db.models.live_state import LiveState
from cmc.db.models.otel_events import OtelEvent
from cmc.db.models.sessions import Session as SessionModel
from cmc.db.models.tools import ToolCall

from .conftest import (
    make_otel_event,
    make_session_row,
    make_tool_call,
)

# ---------- Wave 0 smoke (kept) ----------


def test_sessions_schemas_importable() -> None:
    """Wave-0 smoke: SESS response DTOs are importable from cmc.api.schemas.sessions."""
    from cmc.api.schemas.sessions import (  # noqa: F401
        FollowUpMessageRequest,
        FollowUpMessageResponse,
        LiveSessionItem,
        LiveSessionState,
        SessionDetailsResponse,
        SessionListItem,
        SessionListResponse,
        TodaySummaryResponse,
        ToolTimelineEntry,
    )


# ---------- Helpers ----------


async def _seed(client_fixture, rows: list[tuple[type, dict]]) -> None:
    """Insert ORM rows directly via the app's sessionmaker.

    rows is a list of (Model, kwargs_dict) tuples.
    """
    sessionmaker = client_fixture._transport.app.state.sessions
    async with sessionmaker() as s:
        for model, row in rows:
            await s.execute(insert(model).values(**row))
        await s.commit()


def _new_uuid() -> str:
    return str(uuid4())


# ---------- Task 1 tests: SESS-01, SESS-02, SESS-03, SESS-07 ----------


@pytest.mark.asyncio
async def test_sess01_list_pagination_and_filters(client) -> None:
    """SESS-01: pagination + range/source/model filters narrow results."""
    now = datetime.now(UTC)
    # 5 sessions: 3 today (mixed source/model), 2 outside today (40 days old)
    rows: list[tuple[type, dict]] = [
        (SessionModel, make_session_row(
            session_id=_new_uuid(), started_at=now - timedelta(minutes=1),
            source="claude-code", model="claude-opus-4-7",
        )),
        (SessionModel, make_session_row(
            session_id=_new_uuid(), started_at=now - timedelta(minutes=2),
            source="claude-code", model="claude-sonnet-4-5",
        )),
        (SessionModel, make_session_row(
            session_id=_new_uuid(), started_at=now - timedelta(minutes=3),
            source="other-source", model="claude-opus-4-7",
        )),
        (SessionModel, make_session_row(
            session_id=_new_uuid(), started_at=now - timedelta(days=40),
            source="claude-code", model="claude-opus-4-7",
        )),
        (SessionModel, make_session_row(
            session_id=_new_uuid(), started_at=now - timedelta(days=45),
            source="claude-code", model="claude-opus-4-7",
        )),
    ]
    await _seed(client, rows)

    # Default range=30d, limit=50 → expects 3 (the 40d/45d rows are older)
    r = await client.get("/api/sessions")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 3
    assert len(body["items"]) == 3
    # Ordered by started_at DESC
    starts = [item["started_at"] for item in body["items"]]
    assert starts == sorted(starts, reverse=True)

    # range=all → 5
    r = await client.get("/api/sessions?range=all")
    assert r.json()["total"] == 5

    # Pagination: limit=2&offset=0 → 2 items, total=3 (filtered)
    r = await client.get("/api/sessions?limit=2&offset=0")
    body = r.json()
    assert body["total"] == 3
    assert body["limit"] == 2
    assert body["offset"] == 0
    assert len(body["items"]) == 2

    # source filter (within 30d window): 2 sessions are claude-code+today
    r = await client.get("/api/sessions?source=claude-code")
    body = r.json()
    assert body["total"] == 2
    for item in body["items"]:
        assert item["source"] == "claude-code"

    # model filter: 2 within 30d are claude-opus-4-7
    r = await client.get("/api/sessions?model=claude-opus-4-7")
    body = r.json()
    assert body["total"] == 2
    for item in body["items"]:
        assert item["model"] == "claude-opus-4-7"

    # range=today → at least the today rows show up; older ones excluded
    r = await client.get("/api/sessions?range=today")
    body = r.json()
    # All 3 minute-old rows are today; 40/45 day-old are not
    assert body["total"] == 3


@pytest.mark.asyncio
async def test_sess02_session_details_with_tools(client) -> None:
    """SESS-02: details returns session + ordered tool timeline."""
    now = datetime.now(UTC)
    sid = _new_uuid()
    rows: list[tuple[type, dict]] = [
        (SessionModel, make_session_row(session_id=sid, started_at=now - timedelta(minutes=5))),
        (ToolCall, make_tool_call(
            tool_use_id="tu-1", session_id=sid, tool_name="Bash",
            started_at=now - timedelta(minutes=4), ended_at=now - timedelta(minutes=3, seconds=58),
            duration_ms=2000, status="ok",
        )),
        (ToolCall, make_tool_call(
            tool_use_id="tu-2", session_id=sid, tool_name="mcp__myserver__do_thing",
            started_at=now - timedelta(minutes=3), status="pending",
            mcp_server_name="myserver", mcp_tool_name="do_thing",
        )),
    ]
    await _seed(client, rows)

    r = await client.get(f"/api/sessions/{sid}/details")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["session"]["session_id"] == sid
    assert len(body["tools"]) == 2
    # Ordered by started_at ASC
    assert body["tools"][0]["tool_use_id"] == "tu-1"
    assert body["tools"][1]["tool_use_id"] == "tu-2"
    assert body["tools"][1]["mcp_server_name"] == "myserver"
    assert body["tools"][1]["mcp_tool_name"] == "do_thing"


@pytest.mark.asyncio
async def test_sess02_invalid_uuid_returns_400(client) -> None:
    r = await client.get("/api/sessions/not-a-uuid/details")
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_sess02_unknown_session_returns_404(client) -> None:
    r = await client.get(f"/api/sessions/{_new_uuid()}/details")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_sess03_live_fallback_no_live_state(client) -> None:
    """SESS-03: derive live from sessions table when no live_state row exists.

    Pitfall 8 fallback per RESEARCH Open Q1.
    """
    now = datetime.now(UTC)
    live_sid = _new_uuid()
    ended_sid = _new_uuid()
    rows: list[tuple[type, dict]] = [
        (SessionModel, make_session_row(
            session_id=live_sid, started_at=now - timedelta(minutes=1), ended_at=None,
        )),
        (SessionModel, make_session_row(
            session_id=ended_sid, started_at=now - timedelta(minutes=2),
            ended_at=now - timedelta(seconds=30),
        )),
    ]
    await _seed(client, rows)

    r = await client.get("/api/sessions/live")
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body, list)
    assert len(body) == 1
    assert body[0]["session_id"] == live_sid
    # last_activity_at falls back to started_at when no live_state row
    assert body[0]["last_activity_at"] == body[0]["started_at"]
    assert body[0]["state"] is None
    assert body[0]["current_tool"] is None


@pytest.mark.asyncio
async def test_sess03_live_prefers_live_state_row(client) -> None:
    """SESS-03 with live_state row: prefers its last_activity_at + state."""
    now = datetime.now(UTC)
    sid = _new_uuid()
    last_act = now - timedelta(seconds=10)
    rows: list[tuple[type, dict]] = [
        (SessionModel, make_session_row(
            session_id=sid, started_at=now - timedelta(minutes=1), ended_at=None,
        )),
        (LiveState, {
            "session_id": sid,
            "last_activity_at": last_act,
            "state": "streaming",
            "current_message": None,
            "current_tool": "Bash",
            "pid": None,
            "updated_at": last_act,
        }),
    ]
    await _seed(client, rows)

    r = await client.get("/api/sessions/live")
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body) == 1
    item = body[0]
    assert item["state"] == "streaming"
    assert item["current_tool"] == "Bash"
    # last_activity_at is from LiveState, not started_at
    assert item["last_activity_at"] != item["started_at"]


@pytest.mark.asyncio
async def test_sess07_today_summary(client) -> None:
    """SESS-07: today-window aggregation across sessions + otel_events."""
    now = datetime.now(UTC)
    today_sid_a = _new_uuid()
    today_sid_b = _new_uuid()
    yesterday_sid = _new_uuid()
    rows: list[tuple[type, dict]] = [
        (SessionModel, make_session_row(
            session_id=today_sid_a, started_at=now - timedelta(minutes=10),
            tokens_input=100, tokens_output=200, tokens_cache_read=50, tokens_cache_create=25,
            tool_call_count=3,
        )),
        (SessionModel, make_session_row(
            session_id=today_sid_b, started_at=now - timedelta(minutes=20),
            tokens_input=200, tokens_output=400, tokens_cache_read=100, tokens_cache_create=50,
            tool_call_count=5,
        )),
        (SessionModel, make_session_row(
            session_id=yesterday_sid, started_at=now - timedelta(days=1, hours=2),
            tokens_input=999, tokens_output=999, tool_call_count=7,
        )),
        (OtelEvent, make_otel_event(
            ts=now - timedelta(minutes=5),
            event_name="claude_code.api_error",
            session_id=today_sid_a,
            body={"detail": "rate limited"},
        )),
        # Yesterday's error must NOT be counted
        (OtelEvent, make_otel_event(
            ts=now - timedelta(days=1, hours=2),
            event_name="claude_code.api_error",
            session_id=yesterday_sid,
            body={"detail": "old"},
        )),
    ]
    await _seed(client, rows)

    r = await client.get("/api/summary")
    assert r.status_code == 200, r.text
    body = r.json()
    # date is today's local YYYY-MM-DD
    assert body["date"] == datetime.now().astimezone().strftime("%Y-%m-%d")
    assert body["sessions_count"] == 2
    assert body["tokens_input_total"] == 300
    assert body["tokens_output_total"] == 600
    assert body["tokens_cache_read_total"] == 150
    assert body["tokens_cache_create_total"] == 75
    assert body["tool_call_count"] == 8
    assert body["error_count"] == 1


@pytest.mark.asyncio
async def test_sessions_router_registered() -> None:
    """sessions_router is wired into all_routers()."""
    from cmc.api.routes import all_routers
    from cmc.api.routes.sessions import router as sessions_router

    routers = all_routers()
    assert sessions_router in routers


# ---------- Task 2 tests: SESS-04, SESS-05, SESS-06 ----------


@pytest.mark.asyncio
async def test_sess04_live_state_with_row(client) -> None:
    """SESS-04: returns LiveSessionState fields when a live_state row exists."""
    now = datetime.now(UTC)
    sid = _new_uuid()
    last_act = now - timedelta(seconds=5)
    rows: list[tuple[type, dict]] = [
        (SessionModel, make_session_row(session_id=sid, started_at=now - timedelta(minutes=1))),
        (LiveState, {
            "session_id": sid,
            "last_activity_at": last_act,
            "state": "streaming",
            "current_message": "hi",
            "current_tool": "Bash",
            "pid": None,
            "updated_at": now,
        }),
    ]
    await _seed(client, rows)

    r = await client.get(f"/api/sessions/live/{sid}/state")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["session_id"] == sid
    assert body["state"] == "streaming"
    assert body["current_message"] == "hi"
    assert body["current_tool"] == "Bash"


@pytest.mark.asyncio
async def test_sess04_live_state_without_row_returns_404(client) -> None:
    """SESS-04: 404 when no live_state row for the session."""
    sid = _new_uuid()
    await _seed(client, [
        (SessionModel, make_session_row(session_id=sid)),
    ])
    r = await client.get(f"/api/sessions/live/{sid}/state")
    assert r.status_code == 404
    # The app's HTTPException handler emits {"error": detail} (cmc.core.errors).
    assert "no live state" in r.json()["error"].lower()


@pytest.mark.asyncio
async def test_sess04_invalid_uuid_returns_400(client) -> None:
    r = await client.get("/api/sessions/live/not-a-uuid/state")
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_sess05_stream_with_row(client) -> None:
    """SESS-05: when a live_state row exists, the route emits a `live_state` event.

    We call the route handler's underlying generator directly with a stub
    Request whose `is_disconnected()` returns True after the first iteration.
    This exercises production code without depending on httpx ASGITransport's
    streaming-flush behavior (which can buffer a long-running generator).
    The end-to-end Content-Type assertion is covered by the heartbeat-fallback
    test below.
    """
    from cmc.api.routes.sessions import live_session_stream

    now = datetime.now(UTC)
    sid = _new_uuid()
    rows: list[tuple[type, dict]] = [
        (SessionModel, make_session_row(session_id=sid, started_at=now - timedelta(minutes=1))),
        (LiveState, {
            "session_id": sid,
            "last_activity_at": now,
            "state": "streaming",
            "current_message": "hi",
            "current_tool": "Bash",
            "pid": None,
            "updated_at": now,
        }),
    ]
    await _seed(client, rows)

    # Stub Request: is_disconnected() returns False once (so we get one yield),
    # then True (so the generator returns cleanly).
    class _StubRequest:
        def __init__(self):
            self._calls = 0

        async def is_disconnected(self) -> bool:
            self._calls += 1
            return self._calls > 1

    sessionmaker = client._transport.app.state.sessions
    async with sessionmaker() as db:
        # live_session_stream returns a StreamingResponse; we read its body iterator.
        resp = await live_session_stream(sid, _StubRequest(), db=db)
        assert resp.media_type == "text/event-stream"
        chunks = [
            chunk if isinstance(chunk, bytes) else chunk.encode()
            async for chunk in resp.body_iterator
        ]

    joined = b"".join(chunks).decode("utf-8")
    assert "event: live_state" in joined, f"no live_state event in: {joined!r}"
    # JSON-encoded payload must include current_message text.
    assert "hi" in joined
    # State + tool from the row are present.
    assert "streaming" in joined
    assert "Bash" in joined


@pytest.mark.asyncio
async def test_sess05_stream_without_row_emits_heartbeat_and_closes(client) -> None:
    """SESS-05: when no live_state row, emit heartbeat + retry then close."""
    sid = _new_uuid()
    await _seed(client, [
        (SessionModel, make_session_row(session_id=sid)),
    ])

    chunks: list[str] = []
    async with client.stream("GET", f"/api/sessions/live/{sid}/stream",
                             timeout=10.0) as resp:
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        async for raw in resp.aiter_text():
            chunks.append(raw)
            # Stream should close on its own after 3 missing-row polls (~3-4s).
            # Defensive cap: bail out once we have multiple heartbeats already.
            if "".join(chunks).count("event: heartbeat") >= 3:
                break

    joined = "".join(chunks)
    assert "event: heartbeat" in joined
    # Retry hint signals 5s reconnect; appears at least once.
    assert "retry: 5000" in joined


@pytest.mark.asyncio
async def test_sess06_queue_message_happy_path(client) -> None:
    """SESS-06: 202 + JSONL line written to repo_root() queue path."""
    now = datetime.now(UTC)
    sid = _new_uuid()
    await _seed(client, [
        (SessionModel, make_session_row(
            session_id=sid, started_at=now - timedelta(minutes=1), ended_at=None,
        )),
    ])

    # Clean any pre-existing queue file from prior test runs.
    queue_file = repo_root() / ".tmp" / "mission-control-queue" / "messages" / f"{sid}.jsonl"
    if queue_file.exists():
        queue_file.unlink()

    r = await client.post(
        f"/api/sessions/live/{sid}/message",
        json={"message": "hello there"},
    )
    assert r.status_code == 202, r.text
    body = r.json()
    assert body["queued"] is True
    assert body["session_id"] == sid
    assert body["queue_path"].endswith(f".tmp/mission-control-queue/messages/{sid}.jsonl")
    assert queue_file.exists()
    lines = queue_file.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1
    rec = json.loads(lines[0])
    assert rec["session_id"] == sid
    assert rec["message"] == "hello there"
    assert "ts" in rec

    # cleanup
    queue_file.unlink()


@pytest.mark.asyncio
async def test_sess06_invalid_uuid_returns_400(client) -> None:
    r = await client.post(
        "/api/sessions/live/not-a-uuid/message",
        json={"message": "hi"},
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_sess06_empty_message_returns_422(client) -> None:
    sid = _new_uuid()
    await _seed(client, [
        (SessionModel, make_session_row(session_id=sid, ended_at=None)),
    ])
    r = await client.post(
        f"/api/sessions/live/{sid}/message",
        json={"message": ""},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_sess06_unknown_session_returns_404(client) -> None:
    sid = _new_uuid()  # valid UUID format but not in DB
    r = await client.post(
        f"/api/sessions/live/{sid}/message",
        json={"message": "hi"},
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_sess06_ended_session_returns_409(client) -> None:
    now = datetime.now(UTC)
    sid = _new_uuid()
    await _seed(client, [
        (SessionModel, make_session_row(
            session_id=sid, started_at=now - timedelta(minutes=5),
            ended_at=now - timedelta(minutes=1),
        )),
    ])
    r = await client.post(
        f"/api/sessions/live/{sid}/message",
        json={"message": "hi"},
    )
    assert r.status_code == 409


def test_sess06_queue_path_is_gitignored() -> None:
    """SESS-06 queue path is excluded from git via .gitignore."""
    result = subprocess.run(
        ["git", "check-ignore", "-q",
         ".tmp/mission-control-queue/messages/probe.jsonl"],
        cwd=str(repo_root()),
    )
    assert result.returncode == 0, "queue path is NOT gitignored — .gitignore must include .tmp/"
