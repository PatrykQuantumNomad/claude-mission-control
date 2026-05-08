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
from datetime import UTC, date, datetime
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
    SessionCompareResponse,
    SessionCompareSide,
    SessionDetailsResponse,
    SessionListItem,
    SessionListResponse,
    SkillSetDiff,
    TodaySummaryResponse,
    ToolTimelineEntry,
)
from cmc.core.paths import repo_root
from cmc.db import get_session
from cmc.db.models.live_state import LiveState
from cmc.db.models.sessions import Session as SessionModel
from cmc.db.models.tools import ToolCall
from cmc.pricing import compute_cost, load_rates

router = APIRouter(tags=["sessions"])

# UUID format guard for any session_id path param. Path traversal mitigation
# rejects `../` / non-hex characters with 400.
_UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)

# CMPR-04: per-side tool-call cap. Above this, the over_cap render branch
# kicks in: tool_counts={} on that side, summary KPIs still present.
SESSION_COMPARE_CAP = 500


# Phase 16 Plan 01 (CMPR-01..04) — single-round-trip compare query templates.
#
# Skill-set per side: DISTINCT attrs_skill_name. Filter MUST use BARE
# 'skill_activated' (post-prefix-strip — Pitfall 2 in 16-RESEARCH); the
# attrs_skill_name IS NOT NULL guard drops legacy rows from before LOCK-2
# (Pitfall 6).
#
# Phase 23 (CMPR-06): combined rollup that returns:
#  - distinct skill_name values used in the session
#  - per-skill p95 latency derived from OTEL JSON `duration_ms`
#  - a session-wide duration sample_count (for low-sample gating)
#
# Query budget (CMPR-04): this REPLACES the Phase-16 skill-set SQL above; it
# does not add an extra per-side statement.
_COMPARE_SKILLS_LATENCIES_SQL = text("""
    WITH skill_events AS (
      SELECT
        o.attrs_skill_name AS skill_name,
        CAST(
          (SELECT json_extract(value, '$.value.stringValue')
             FROM json_each(json_extract(o.body, '$.record.attributes'))
            WHERE json_extract(value, '$.key') = 'duration_ms'
            LIMIT 1)
          AS INTEGER
        ) AS duration_ms
      FROM otel_events o
      WHERE o.session_id = :sid
        AND o.event_name = 'skill_activated'
        AND o.attrs_skill_name IS NOT NULL
    ),
    skills_seen AS (
      SELECT DISTINCT skill_name
      FROM skill_events
    ),
    ranked AS (
      SELECT
        skill_name,
        duration_ms,
        ROW_NUMBER() OVER (PARTITION BY skill_name ORDER BY duration_ms) AS rnk,
        COUNT(*) OVER (PARTITION BY skill_name) AS n
      FROM skill_events
      WHERE duration_ms IS NOT NULL
    ),
    per_skill_p95 AS (
      SELECT
        skill_name,
        duration_ms AS p95_ms
      FROM ranked
      WHERE rnk = MAX(CAST(n * 0.95 AS INTEGER), 1)
    ),
    total_samples AS (
      SELECT COUNT(*) AS duration_sample_count
      FROM skill_events
      WHERE duration_ms IS NOT NULL
    )
    SELECT
      s.skill_name,
      p.p95_ms AS p95_ms,
      t.duration_sample_count AS duration_sample_count
    FROM skills_seen s
    LEFT JOIN per_skill_p95 p ON p.skill_name = s.skill_name
    CROSS JOIN total_samples t
    ORDER BY s.skill_name ASC
""")

# Outcome read-time classification — adapted from observability._OUTCOMES_SQL.
# These outcome event_names KEEP the 'claude_code.' prefix (NOT skill events
# — the prefix-strip is skill-event-specific per ingest router, Pitfall 2).
_COMPARE_OUTCOME_SQL = text("""
    SELECT CASE
        WHEN EXISTS (SELECT 1 FROM otel_events e
                     WHERE e.session_id = :sid
                       AND e.event_name = 'claude_code.api_error') THEN 'errored'
        WHEN EXISTS (SELECT 1 FROM otel_events e
                     WHERE e.session_id = :sid
                       AND e.event_name = 'claude_code.api_retries_exhausted') THEN 'rate_limited'
        WHEN EXISTS (SELECT 1 FROM otel_events e
                     WHERE e.session_id = :sid
                       AND e.event_name = 'claude_code.compaction') THEN 'truncated'
        WHEN (SELECT ended_at FROM sessions WHERE session_id = :sid) IS NULL THEN 'unfinished'
        ELSE 'ok'
    END AS outcome
""")

# Per-side {tool_name: count}. Skipped on over-cap path to keep the heavy
# branch cheap; the denormalized sessions.tool_call_count is the cap source
# of truth (Pitfall 11).
_COMPARE_TOOL_COUNTS_SQL = text("""
    SELECT tool_name, COUNT(*) AS n
    FROM tools
    WHERE session_id = :sid
    GROUP BY tool_name
    ORDER BY n DESC
""")


def _coerce_effective_from(rates: dict, model: str | None) -> date | None:
    """Pull effective_from from a rates dict and coerce to date if needed.

    Cloned from cost.py:57 / skills.py:621 — same convention. Returns None
    when the model isn't in the rates table (unpriced SKU).
    """
    if model is None or model not in rates:
        return None
    ef = rates[model].get("effective_from")
    if ef is None:
        return None
    return ef.date() if isinstance(ef, datetime) else ef


async def _build_compare_side(
    sess: SessionModel,
    rates: dict,
    db: AsyncSession,
) -> tuple[SessionCompareSide, int]:
    """Compose one SessionCompareSide from a Session ORM row + read-time SQL.

    over_cap uses the denormalized sessions.tool_call_count column (Pitfall 11
    — NEVER COUNT(tools.*)). On over-cap, tool_counts is set to {} and the
    GROUP BY query is skipped entirely (cheap fallback path per CMPR-04).
    """
    over_cap = sess.tool_call_count > SESSION_COMPARE_CAP

    # duration_ms via Python subtraction — started_at/ended_at are stored
    # naive UTC (Phase 1 schema). No SQL window function needed.
    if sess.ended_at is not None:
        duration_ms = int((sess.ended_at - sess.started_at).total_seconds() * 1000)
    else:
        duration_ms = None

    # Cost via cmc.pricing — Decimal math. Unknown SKU returns Decimal(0)
    # AND bumps cmc.pricing.unpriced_tokens counter (doctor surfaces).
    cost = compute_cost(
        sess.model or "<unknown>",
        sess.tokens_input,
        sess.tokens_output,
        sess.tokens_cache_read,
        sess.tokens_cache_create_5m,
        sess.tokens_cache_create_1h,
        rates,
    )

    # Skills + per-skill p95 latency (CMPR-06): single rollup statement
    # that REPLACES the Phase-16 skill-set SQL to preserve CMPR-04 budget.
    skill_rows = (await db.execute(
        _COMPARE_SKILLS_LATENCIES_SQL, {"sid": sess.session_id}
    )).mappings().all()
    skills_used = [r["skill_name"] for r in skill_rows]
    skill_latencies: dict[str, int] = {
        r["skill_name"]: int(r["p95_ms"])
        for r in skill_rows
        if r.get("p95_ms") is not None
    }
    # duration_sample_count repeats across all rows via CROSS JOIN. If the
    # session has no duration_ms-bearing skill_activated events, the count is 0.
    duration_sample_count = (
        int(skill_rows[0]["duration_sample_count"]) if skill_rows else 0
    )

    # Outcome: CASE on otel_events EXISTS — single column scalar.
    outcome = (
        await db.execute(_COMPARE_OUTCOME_SQL, {"sid": sess.session_id})
    ).scalar_one_or_none()

    # Tool counts: skipped on over-cap path.
    if over_cap:
        tool_counts: dict[str, int] = {}
    else:
        tc_rows = (
            await db.execute(_COMPARE_TOOL_COUNTS_SQL, {"sid": sess.session_id})
        ).mappings().all()
        tool_counts = {r["tool_name"]: int(r["n"]) for r in tc_rows}

    side = SessionCompareSide(
        session_id=sess.session_id,
        started_at=sess.started_at,
        ended_at=sess.ended_at,
        duration_ms=duration_ms,
        cwd=sess.cwd,
        model=sess.model,
        source=sess.source,
        outcome=outcome,
        tokens_input=sess.tokens_input,
        tokens_output=sess.tokens_output,
        tokens_cache_read=sess.tokens_cache_read,
        tokens_cache_create_5m=sess.tokens_cache_create_5m,
        tokens_cache_create_1h=sess.tokens_cache_create_1h,
        tool_call_count=sess.tool_call_count,
        message_count=sess.message_count,
        cost_usd=cost,
        skills_used=skills_used,
        skill_latencies=skill_latencies,
        over_cap=over_cap,
        tool_counts=tool_counts,
    )
    return side, duration_sample_count


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


@router.get("/sessions/compare", response_model=SessionCompareResponse)
async def compare_sessions(
    a: str = Query(..., description="Session A id"),
    b: str = Query(..., description="Session B id"),
    db: AsyncSession = Depends(get_session),
) -> SessionCompareResponse:
    """CMPR-01..04: paired session metrics + skill-set diff in a single payload.

    Read-time-computed cost via cmc.pricing (Decimal-string in JSON). Skill
    set: DISTINCT attrs_skill_name from otel_events where
    event_name='skill_activated' AND attrs_skill_name IS NOT NULL. Outcome:
    read-time-classified the same way OBSV-03 does it. The 500-tool-call cap
    (CMPR-04) is checked against the denormalized sessions.tool_call_count
    column (Pitfall 11 — NOT COUNT(tools.*)). Over-cap path: HTTP 200 with
    over_cap=true + tool_counts={} on that side; summary KPIs still present.

    Error contract:
      - 400 'invalid session_id format' on either UUID malformed
      - 400 'cannot compare a session with itself' on a == b (decisions §7)
      - 404 'session not found' on either row missing
      - 200 with over_cap=true on either side over the cap
    """
    # 1. UUID format guard (mirror sessions.py session_details:111)
    if not _UUID_RE.match(a) or not _UUID_RE.match(b):
        raise HTTPException(status_code=400, detail="invalid session_id format")

    # 2. Self-compare rejection (decisions §7 — degenerate UX)
    if a == b:
        raise HTTPException(
            status_code=400, detail="cannot compare a session with itself"
        )

    # 3. Load both session rows (404 on either miss)
    sess_a = (
        await db.execute(select(SessionModel).where(SessionModel.session_id == a))
    ).scalar_one_or_none()
    if sess_a is None:
        raise HTTPException(status_code=404, detail="session not found")
    sess_b = (
        await db.execute(select(SessionModel).where(SessionModel.session_id == b))
    ).scalar_one_or_none()
    if sess_b is None:
        raise HTTPException(status_code=404, detail="session not found")

    # 4. Single rates dict shared across both sides (one load_rates per request)
    rates = await load_rates(db)

    # 5. Build each side via the shared helper
    side_a, duration_samples_a = await _build_compare_side(sess_a, rates, db)
    side_b, duration_samples_b = await _build_compare_side(sess_b, rates, db)

    # 6. Skill-set diff (sorted lists of strings)
    set_a = set(side_a.skills_used)
    set_b = set(side_b.skills_used)
    skill_diff = SkillSetDiff(
        shared=sorted(set_a & set_b),
        only_a=sorted(set_a - set_b),
        only_b=sorted(set_b - set_a),
    )

    # 7. rates_as_of = max effective_from across the two models touched
    #    (None when both models are unpriced or unknown). Single top-level
    #    field per Phase 16 decisions §4.
    as_of_a = _coerce_effective_from(rates, sess_a.model)
    as_of_b = _coerce_effective_from(rates, sess_b.model)
    candidates: list[date] = [d for d in (as_of_a, as_of_b) if d is not None]
    rates_as_of: datetime | None = None
    if candidates:
        # UTCDatetime serializer expects datetime; promote date -> midnight UTC.
        chosen = max(candidates)
        rates_as_of = datetime(chosen.year, chosen.month, chosen.day, tzinfo=UTC)

    return SessionCompareResponse(
        a=side_a,
        b=side_b,
        skill_diff=skill_diff,
        rates_as_of=rates_as_of,
        over_cap=side_a.over_cap or side_b.over_cap,
        cap=SESSION_COMPARE_CAP,
        low_sample_a=duration_samples_a < 30,
        low_sample_b=duration_samples_b < 30,
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
