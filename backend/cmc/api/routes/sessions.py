"""Sessions router — SESS-01..07.

Design notes:
  - SESS-03 (live) derives from `sessions` table (ended_at IS NULL AND started_at
    > now-5min). When live_state exists, this router prefers it; otherwise it
    falls back gracefully to session timestamps.
  - SESS-04 returns 404 when no live_state row.
  - SESS-05 emits SSE with empty heartbeat / current_message poll based on
    live_state presence.
  - SESS-06 queue path: repo_root() / .tmp/mission-control-queue/messages/{sid}.jsonl
    so the dispatcher can pick it up.
  - SESS-07 today summary uses STRFTIME(..., 'localtime') for the bucket key
    as the single source of truth for the local-day window.
"""

import asyncio
import json
import re
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.api.schemas.sessions import (
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
from cmc.core.paths import repo_root
from cmc.db import get_session
from cmc.db.models.live_state import LiveState
from cmc.db.models.sessions import Session as SessionModel
from cmc.db.models.tools import ToolCall

router = APIRouter(tags=["sessions"])

# UUID format guard for any session_id path param. Path traversal mitigation
# rejects `../` / non-hex characters with 400.
_UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


@router.get("/sessions", response_model=SessionListResponse)
async def list_sessions(
    db: AsyncSession = Depends(get_session),
    range_: Literal["today", "7d", "30d", "all"] = Query("30d", alias="range"),
    source: str | None = None,
    model: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """SESS-01: paginated list of sessions with range/source/model filters.

    Defaults: range=30d, limit=50, offset=0; max limit=200.

    Range buckets:
      - today: started_at >= today midnight LOCAL (STRFTIME with 'localtime').
      - 7d/30d: started_at >= datetime('now', '-7/-30 days') (UTC arithmetic
        is fine for windowing — only bucket math needs 'localtime').
      - all: no time filter.

    `total` reflects the FILTERED count, not the table-wide count.
    """
    base = select(SessionModel)
    if range_ == "today":
        base = base.where(
            SessionModel.started_at >= func.datetime("now", "start of day", "localtime")
        )
    elif range_ == "7d":
        base = base.where(SessionModel.started_at >= func.datetime("now", "-7 days"))
    elif range_ == "30d":
        base = base.where(SessionModel.started_at >= func.datetime("now", "-30 days"))
    if source is not None:
        base = base.where(SessionModel.source == source)
    if model is not None:
        base = base.where(SessionModel.model == model)
    count_stmt = select(func.count()).select_from(base.subquery())
    page_stmt = (
        base.order_by(SessionModel.started_at.desc()).limit(limit).offset(offset)
    )
    total = (await db.execute(count_stmt)).scalar_one()
    rows = (await db.execute(page_stmt)).scalars().all()
    return SessionListResponse(
        items=[SessionListItem.model_validate(r) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/sessions/{session_id}/details", response_model=SessionDetailsResponse)
async def session_details(
    session_id: str,
    db: AsyncSession = Depends(get_session),
):
    """SESS-02: a single session row + tool timeline ordered by started_at ASC.

    Returns 400 for malformed session_id (V11 path-traversal guard) and 404
    when the session is not in the table.
    """
    if not _UUID_RE.match(session_id):
        raise HTTPException(status_code=400, detail="invalid session_id format")
    sess = (
        await db.execute(
            select(SessionModel).where(SessionModel.session_id == session_id)
        )
    ).scalar_one_or_none()
    if sess is None:
        raise HTTPException(status_code=404, detail="session not found")
    tool_rows = (
        await db.execute(
            select(ToolCall)
            .where(ToolCall.session_id == session_id)
            .order_by(ToolCall.started_at.asc())
        )
    ).scalars().all()
    return SessionDetailsResponse(
        session=SessionListItem.model_validate(sess),
        tools=[ToolTimelineEntry.model_validate(t) for t in tool_rows],
    )


@router.get("/sessions/live", response_model=list[LiveSessionItem])
async def live_sessions(db: AsyncSession = Depends(get_session)):
    """SESS-03: sessions active in the last 5 minutes.

    Derive "live" from the sessions table when live_state is absent: a session
    is live if it hasn't ended (ended_at IS NULL) AND started recently
    (started_at > now-5min). When a live_state row exists for the session,
    prefer its last_activity_at + state + current_tool.

    Returns rows sorted by started_at DESC.
    """
    stmt = (
        select(SessionModel, LiveState)
        .join(LiveState, LiveState.session_id == SessionModel.session_id, isouter=True)
        .where(
            SessionModel.ended_at.is_(None),
            SessionModel.started_at > func.datetime("now", "-5 minutes"),
        )
        .order_by(SessionModel.started_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    out: list[LiveSessionItem] = []
    for sess, live in rows:
        out.append(
            LiveSessionItem(
                session_id=sess.session_id,
                started_at=sess.started_at,
                last_activity_at=(live.last_activity_at if live else sess.started_at),
                state=(live.state if live else None),
                current_tool=(live.current_tool if live else None),
                model=sess.model,
            )
        )
    return out


@router.get("/summary", response_model=TodaySummaryResponse)
async def today_summary(db: AsyncSession = Depends(get_session)):
    """SESS-07: today's KPIs in local time.

    Uses STRFTIME(..., 'localtime') as the SINGLE source of truth for the
    today-window bucket key — both the WHERE clauses and the response.date
    field derive from the same call.
    """
    today_q = text(
        """
        SELECT
          STRFTIME('%Y-%m-%d', 'now', 'localtime') AS day,
          COALESCE(COUNT(*), 0)                    AS sessions_count,
          COALESCE(SUM(tokens_input), 0)           AS tokens_input_total,
          COALESCE(SUM(tokens_output), 0)          AS tokens_output_total,
          COALESCE(SUM(tokens_cache_read), 0)      AS tokens_cache_read_total,
          COALESCE(SUM(tokens_cache_create), 0)    AS tokens_cache_create_total,
          COALESCE(SUM(tool_call_count), 0)        AS tool_call_count
        FROM sessions
        WHERE STRFTIME('%Y-%m-%d', started_at, 'localtime')
            = STRFTIME('%Y-%m-%d', 'now', 'localtime')
        """
    )
    row = (await db.execute(today_q)).mappings().first() or {}

    err_q = text(
        """
        SELECT COUNT(*) AS c
        FROM otel_events
        WHERE event_name LIKE '%api_error%'
          AND STRFTIME('%Y-%m-%d', ts, 'localtime')
            = STRFTIME('%Y-%m-%d', 'now', 'localtime')
        """
    )
    err_count = (await db.execute(err_q)).scalar_one() or 0

    return TodaySummaryResponse(
        date=row.get("day") or datetime.now().astimezone().strftime("%Y-%m-%d"),
        sessions_count=row.get("sessions_count", 0) or 0,
        tokens_input_total=row.get("tokens_input_total", 0) or 0,
        tokens_output_total=row.get("tokens_output_total", 0) or 0,
        tokens_cache_read_total=row.get("tokens_cache_read_total", 0) or 0,
        tokens_cache_create_total=row.get("tokens_cache_create_total", 0) or 0,
        tool_call_count=row.get("tool_call_count", 0) or 0,
        error_count=err_count,
    )


# ---------- SESS-04: live state read ----------


@router.get("/sessions/live/{session_id}/state", response_model=LiveSessionState)
async def live_session_state(
    session_id: str,
    db: AsyncSession = Depends(get_session),
):
    """SESS-04: snapshot of a session's live_state row.

    Returns 400 for malformed session_id, 404 when no live_state row exists.
    """
    if not _UUID_RE.match(session_id):
        raise HTTPException(status_code=400, detail="invalid session_id format")
    row = (
        await db.execute(
            select(LiveState).where(LiveState.session_id == session_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="no live state for session")
    return LiveSessionState.model_validate(row)


# ---------- SESS-05: live SSE stream ----------


def _format_sse(event: str, data: dict, *, retry: int | None = None) -> bytes:
    """Format an SSE wire-frame.

    Per the SSE spec each frame ends with a blank line (\\n\\n). FastAPI's
    EventSourceResponse helper has its own format helper but is awkward to
    use without `response_class=`; we emit StreamingResponse with manual SSE
    formatting for full control over disconnect detection and the no-row fallback.
    """
    lines: list[str] = []
    if retry is not None:
        lines.append(f"retry: {retry}")
    lines.append(f"event: {event}")
    lines.append("data: " + json.dumps(data, separators=(",", ":")))
    lines.append("")
    lines.append("")
    return "\n".join(lines).encode("utf-8")


@router.get("/sessions/live/{session_id}/stream")
async def live_session_stream(
    session_id: str,
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    """SESS-05: long-lived SSE feed for a session's live_state.

    Behavior:
      - When a live_state row exists: emit `event: live_state` whenever
        updated_at advances; poll every 1s.
      - When NO live_state row: emit
        `event: heartbeat` with a 5000ms retry hint; close after 3 missed
        polls so the client reconnects rather than holding the connection.
      - Always honors `request.is_disconnected()`.
      - Caps generator lifetime at 60min; clients reconnect.

    Validates UUID format before opening the stream (V11).
    """
    if not _UUID_RE.match(session_id):
        raise HTTPException(status_code=400, detail="invalid session_id format")

    POLL_S = 1.0
    MAX_S = 60 * 60  # 1 hour cap; clients reconnect
    MISS_LIMIT = 3   # close after this many consecutive missing-row polls

    async def gen():
        start = datetime.now(UTC)
        last_updated_at: datetime | None = None
        consecutive_misses = 0
        while True:
            if await request.is_disconnected():
                return
            if (datetime.now(UTC) - start).total_seconds() > MAX_S:
                return
            row = (
                await db.execute(
                    select(LiveState).where(LiveState.session_id == session_id)
                )
            ).scalar_one_or_none()
            if row is None:
                # No live_state writer yet: heartbeat + retry hint, then close
                # after MISS_LIMIT polls so the client reconnects.
                consecutive_misses += 1
                yield _format_sse(
                    "heartbeat",
                    {"session_id": session_id, "live_state": None},
                    retry=5000,
                )
                if consecutive_misses >= MISS_LIMIT:
                    return
            else:
                consecutive_misses = 0
                if last_updated_at != row.updated_at:
                    last_updated_at = row.updated_at
                    yield _format_sse(
                        "live_state",
                        {
                            "session_id": row.session_id,
                            "state": row.state,
                            "current_message": row.current_message,
                            "current_tool": row.current_tool,
                            "last_activity_at": (
                                row.last_activity_at.isoformat()
                                if row.last_activity_at else None
                            ),
                            "updated_at": (
                                row.updated_at.isoformat() if row.updated_at else None
                            ),
                        },
                    )
            await asyncio.sleep(POLL_S)

    return StreamingResponse(gen(), media_type="text/event-stream")


# ---------- SESS-06: follow-up message queue ----------


@router.post(
    "/sessions/live/{session_id}/message",
    response_model=FollowUpMessageResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def queue_follow_up(
    session_id: str,
    payload: FollowUpMessageRequest,
    db: AsyncSession = Depends(get_session),
):
    """SESS-06: append a follow-up message to the dispatcher queue.

    Validates UUID format (400), checks the session exists (404) and is
    still live — i.e. ended_at IS NULL (409). Writes one JSON line per
    message to:

        repo_root() / .tmp/mission-control-queue/messages/{session_id}.jsonl

    The path is repo-root-anchored so it is independent of the process cwd
    so relative cwd drift cannot move it. The dispatcher tails this directory.
    The queue dir is gitignored at the repo root (`.tmp/`).
    """
    if not _UUID_RE.match(session_id):
        raise HTTPException(status_code=400, detail="invalid session_id format")
    sess = (
        await db.execute(
            select(SessionModel).where(SessionModel.session_id == session_id)
        )
    ).scalar_one_or_none()
    if sess is None:
        raise HTTPException(status_code=404, detail="session not found")
    if sess.ended_at is not None:
        raise HTTPException(status_code=409, detail="session has ended")

    queue_dir = repo_root() / ".tmp" / "mission-control-queue" / "messages"
    queue_dir.mkdir(parents=True, exist_ok=True)
    queue_file = queue_dir / f"{session_id}.jsonl"

    line = (
        json.dumps(
            {
                "ts": datetime.now(UTC).isoformat(),
                "session_id": session_id,
                "message": payload.message,
            },
            separators=(",", ":"),
        )
        + "\n"
    )
    # Append; never truncate — multiple follow-ups stack in arrival order.
    with queue_file.open("a", encoding="utf-8") as f:
        f.write(line)
    return FollowUpMessageResponse(
        queued=True,
        session_id=session_id,
        queue_path=str(queue_file),
    )
