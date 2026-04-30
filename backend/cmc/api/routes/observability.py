"""Observability router — OBSV-01..10.

All daily aggregates use STRFTIME(..., 'localtime') (RESEARCH Pattern 3 +
Pitfall 4) to match the local-time day buckets the JSONL parser writes.

Percentile aggregations use Pattern 4 (offset-based) with Pitfall 2
mitigation (MAX(..., 0) wrapper).

Decisions locked by Plan 03-04:
  - OBSV-03 computes outcome at READ time (Pitfall 9 fallback). Phase 2 doesn't
    populate sessions.outcome; we derive via CASE on otel_events EXISTS.
  - OBSV-04 percentile via Pattern 4 (LIMIT 1 OFFSET MAX(CAST(COUNT*P AS INT)-1, 0))
    — gracefully handles N=0 / N=1 without OFFSET=-1 errors.
  - OBSV-05 paired_duration_ms_p50 computed by Python FIFO pairing per session_id,
    each pair capped at 60_000 ms; cleaner than nested SQL window functions and
    well within the read budget for Phase 3.
  - OBSV-08 reads BOTH tools.decision and otel_events tool_decision events
    (whichever Phase 2 ingestor wrote first wins; we sum both sources by tool_name).
  - OBSV-09 productivity uses claude_code.commit.count, claude_code.pull_request.count,
    and claude_code.lines_of_code.count (with attrs.type='added'/'removed').
  - OBSV-10 pressure consumes claude_code.api_retries_exhausted, claude_code.compaction,
    claude_code.api_error events.
"""

import re
from collections import defaultdict, deque
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.api.schemas.common import RangeWindow
from cmc.api.schemas.observability import (
    AgentFanoutResponse,
    AgentFanoutRow,
    ApiErrorEntry,
    CacheResponse,
    CacheTrendRow,
    EditDecisionRow,
    EditDecisionsResponse,
    FailureRow,
    FailuresResponse,
    HeatmapDayRow,
    HeatmapResponse,
    HookActivityResponse,
    HookActivityRow,
    OutcomeDailyRow,
    OutcomesResponse,
    PressureResponse,
    ProductivityResponse,
    ProjectRollupResponse,
    ProjectRollupRow,
    TokenUsageDailyRow,
    TokenUsageResponse,
    ToolLatencyResponse,
    ToolLatencyRow,
)
from cmc.db import get_session

router = APIRouter(tags=["observability"])

_RANGE_TO_SINCE = {
    "today": "start of day",
    "7d": "-7 days",
    "30d": "-30 days",
}


# ---- OBSV-01: token usage daily breakdown -----------------------------------

_TOKENS_SQL = text("""
    SELECT
      STRFTIME('%Y-%m-%d', day) AS day,
      model,
      source,
      COALESCE(SUM(tokens_input), 0)        AS tokens_input,
      COALESCE(SUM(tokens_output), 0)       AS tokens_output,
      COALESCE(SUM(tokens_cache_read), 0)   AS tokens_cache_read,
      COALESCE(SUM(tokens_cache_create), 0) AS tokens_cache_create,
      COALESCE(SUM(sessions_count), 0)      AS sessions_count
    FROM token_usage
    WHERE day >= DATE('now', :since_clause, 'localtime')
    GROUP BY day, model, source
    ORDER BY day DESC, tokens_input DESC
""")


@router.get("/usage/tokens", response_model=TokenUsageResponse)
async def usage_tokens(
    db: AsyncSession = Depends(get_session),
    range_: Literal["today", "7d", "30d"] = Query("7d", alias="range"),
):
    since = _RANGE_TO_SINCE[range_]
    rows = (await db.execute(_TOKENS_SQL, {"since_clause": since})).mappings().all()
    return TokenUsageResponse(
        items=[TokenUsageDailyRow(**r) for r in rows],
        range=RangeWindow(range_),
    )


# ---- OBSV-02: cache hit-rate trend ------------------------------------------

_CACHE_TREND_SQL = text("""
    SELECT
      STRFTIME('%Y-%m-%d', day) AS day,
      COALESCE(SUM(tokens_cache_read), 0) AS cache_read,
      COALESCE(SUM(tokens_input), 0)      AS input,
      COALESCE(SUM(tokens_cache_create), 0) AS cache_create
    FROM token_usage
    WHERE day >= DATE('now', :since_clause, 'localtime')
    GROUP BY day
    ORDER BY day DESC
""")


@router.get("/usage/cache", response_model=CacheResponse)
async def usage_cache(
    db: AsyncSession = Depends(get_session),
    range_: Literal["today", "7d", "30d"] = Query("7d", alias="range"),
):
    since = _RANGE_TO_SINCE[range_]
    rows = (await db.execute(_CACHE_TREND_SQL, {"since_clause": since})).mappings().all()
    trend: list[CacheTrendRow] = []
    tot_read = 0
    tot_input = 0
    tot_create = 0
    for r in rows:
        billable = (r["input"] or 0) + (r["cache_read"] or 0) + (r["cache_create"] or 0)
        hr = (r["cache_read"] or 0) / billable if billable else 0.0
        trend.append(
            CacheTrendRow(
                day=r["day"],
                hit_rate=round(hr, 4),
                billable_tokens=billable,
                low_sample=billable < 10_000,
            )
        )
        tot_read += r["cache_read"] or 0
        tot_input += r["input"] or 0
        tot_create += r["cache_create"] or 0
    tot_billable = tot_input + tot_read + tot_create
    overall_hr = round((tot_read / tot_billable) if tot_billable else 0.0, 4)
    return CacheResponse(
        hit_rate=overall_hr,
        trend=trend,
        range=RangeWindow(range_),
        low_sample=tot_billable < 10_000,
    )


# ---- OBSV-03: outcome breakdown (Pitfall 9 read-time CASE) ------------------

_OUTCOMES_SQL = text("""
    WITH classified AS (
      SELECT
        s.session_id,
        STRFTIME('%Y-%m-%d', s.started_at, 'localtime') AS day,
        CASE
          WHEN EXISTS (SELECT 1 FROM otel_events e WHERE e.session_id = s.session_id
                       AND e.event_name = 'claude_code.api_error') THEN 'errored'
          WHEN EXISTS (SELECT 1 FROM otel_events e WHERE e.session_id = s.session_id
                       AND e.event_name = 'claude_code.api_retries_exhausted') THEN 'rate_limited'
          WHEN EXISTS (SELECT 1 FROM otel_events e WHERE e.session_id = s.session_id
                       AND e.event_name = 'claude_code.compaction') THEN 'truncated'
          WHEN s.ended_at IS NULL THEN 'unfinished'
          ELSE 'ok'
        END AS outcome
      FROM sessions s
      WHERE s.started_at >= datetime('now', :since_clause)
    )
    SELECT
      day,
      SUM(outcome = 'errored')      AS errored,
      SUM(outcome = 'rate_limited') AS rate_limited,
      SUM(outcome = 'truncated')    AS truncated,
      SUM(outcome = 'unfinished')   AS unfinished,
      SUM(outcome = 'ok')           AS ok,
      COUNT(*)                      AS total
    FROM classified
    GROUP BY day
    ORDER BY day DESC
""")


@router.get("/sessions/outcomes", response_model=OutcomesResponse)
async def sessions_outcomes(
    db: AsyncSession = Depends(get_session),
    range_: Literal["today", "7d", "30d"] = Query("7d", alias="range"),
):
    since = _RANGE_TO_SINCE[range_]
    rows = (await db.execute(_OUTCOMES_SQL, {"since_clause": since})).mappings().all()
    items = [
        OutcomeDailyRow(
            day=r["day"],
            errored=int(r["errored"] or 0),
            rate_limited=int(r["rate_limited"] or 0),
            truncated=int(r["truncated"] or 0),
            unfinished=int(r["unfinished"] or 0),
            ok=int(r["ok"] or 0),
            total=int(r["total"] or 0),
        )
        for r in rows
    ]
    return OutcomesResponse(items=items, range=RangeWindow(range_))


# ---- OBSV-04: tool latency (Pattern 4 + Pitfall 2 wrapper) ------------------

# Pattern 4 percentile via window function: rank rows per tool by duration_ms
# ASC (1-indexed), pre-compute the per-tool count, then pick row at the
# Pitfall-2-wrapped offset position (1-indexed: max(int(N*p), 1) so N=1 yields
# rank=1 instead of rank=0). SQLite 3.47 supports window functions natively.
_TOOL_LATENCY_SQL = text("""
    WITH tc AS (
      SELECT tool_name, duration_ms, status
      FROM tools
      WHERE duration_ms IS NOT NULL
        AND started_at >= datetime('now', :since_clause)
    ),
    ranked AS (
      SELECT
        tool_name,
        duration_ms,
        status,
        ROW_NUMBER() OVER (PARTITION BY tool_name ORDER BY duration_ms) AS rnk,
        COUNT(*)    OVER (PARTITION BY tool_name)                       AS n
      FROM tc
    ),
    agg AS (
      SELECT
        tool_name,
        COUNT(*) AS call_count,
        AVG(CASE WHEN status='error' THEN 1.0 ELSE 0.0 END) AS error_rate,
        MAX(duration_ms) AS max_ms
      FROM tc
      GROUP BY tool_name
      HAVING COUNT(*) >= 1
    ),
    p50 AS (
      SELECT tool_name, duration_ms AS p50_ms
      FROM ranked
      WHERE rnk = MAX(CAST(n * 0.5 AS INTEGER), 1)
    ),
    p95 AS (
      SELECT tool_name, duration_ms AS p95_ms
      FROM ranked
      WHERE rnk = MAX(CAST(n * 0.95 AS INTEGER), 1)
    )
    SELECT
      agg.tool_name,
      agg.call_count,
      agg.error_rate,
      agg.max_ms,
      p50.p50_ms,
      p95.p95_ms
    FROM agg
    LEFT JOIN p50 ON p50.tool_name = agg.tool_name
    LEFT JOIN p95 ON p95.tool_name = agg.tool_name
    ORDER BY p95.p95_ms DESC
""")


@router.get("/tools/latency", response_model=ToolLatencyResponse)
async def tool_latency(
    db: AsyncSession = Depends(get_session),
    range_: Literal["today", "7d", "30d"] = Query("7d", alias="range"),
):
    since = _RANGE_TO_SINCE[range_]
    rows = (await db.execute(_TOOL_LATENCY_SQL, {"since_clause": since})).mappings().all()
    items = [
        ToolLatencyRow(
            tool_name=r["tool_name"],
            call_count=int(r["call_count"]),
            p50_ms=int(r["p50_ms"]) if r["p50_ms"] is not None else None,
            p95_ms=int(r["p95_ms"]) if r["p95_ms"] is not None else None,
            max_ms=int(r["max_ms"]) if r["max_ms"] is not None else None,
            error_rate=float(r["error_rate"] or 0.0),
        )
        for r in rows
    ]
    return ToolLatencyResponse(items=items, range=RangeWindow(range_))


# ---- OBSV-05: hook activity (fires + paired_duration_ms_p50) ----------------

_HOOK_FIRES_SQL = text("""
    SELECT
      STRFTIME('%Y-%m-%d', ts, 'localtime') AS day,
      event_name AS hook_name,
      COUNT(*) AS fires
    FROM otel_events
    WHERE event_name LIKE 'claude_code.hook%'
      AND ts >= datetime('now', :since_clause)
    GROUP BY day, event_name
    ORDER BY day DESC, fires DESC
""")

# Pull all hook events in window ordered by (session_id, ts) so the Python
# pairing pass can FIFO-match pre→post within each session.
_HOOK_EVENTS_SQL = text("""
    SELECT
      STRFTIME('%Y-%m-%d', ts, 'localtime') AS day,
      ts,
      event_name,
      session_id
    FROM otel_events
    WHERE event_name LIKE 'claude_code.hook%'
      AND ts >= datetime('now', :since_clause)
    ORDER BY session_id ASC, ts ASC
""")

_HOOK_PAIR_CAP_MS = 60_000


def _classify_hook(event_name: str) -> tuple[str, str] | None:
    """Return (kind, key) where kind in {'pre','post'} and key is the suffix
    shared by the pair (e.g. 'tool_use'). Returns None if not a paired hook event.

    Canonical Claude Code hook OTEL names:
      - claude_code.hook.pre_<key>  (e.g. pre_tool_use, pre_compact)
      - claude_code.hook.post_<key> (e.g. post_tool_use, post_compact)
    """
    PRE = "claude_code.hook.pre_"
    POST = "claude_code.hook.post_"
    if event_name.startswith(PRE):
        return ("pre", event_name[len(PRE):])
    if event_name.startswith(POST):
        return ("post", event_name[len(POST):])
    return None


def _percentile(sorted_values: list[int], p: float) -> int | None:
    """Pattern 4 offset percentile (Pitfall 2 wrapper): max(int(N*p) - 1, 0)."""
    if not sorted_values:
        return None
    idx = max(int(len(sorted_values) * p) - 1, 0)
    return sorted_values[idx]


def _parse_ts(value) -> datetime | None:
    """Parse a ts value from SQLite — may be string or datetime depending on
    column type. Returns timezone-aware UTC datetime, or None on parse error.
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        try:
            dt = datetime.fromisoformat(str(value))
        except (ValueError, TypeError):
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt


@router.get("/hooks/activity", response_model=HookActivityResponse)
async def hooks_activity(
    db: AsyncSession = Depends(get_session),
    range_: Literal["today", "7d", "30d"] = Query("7d", alias="range"),
):
    since = _RANGE_TO_SINCE[range_]
    fires_rows = (await db.execute(_HOOK_FIRES_SQL, {"since_clause": since})).mappings().all()
    ev_rows = (await db.execute(_HOOK_EVENTS_SQL, {"since_clause": since})).mappings().all()

    # FIFO pairing per (session_id, pairing_key). Output keyed by
    # (day_of_pre_event, canonical_pre_event_name) so it joins with fires_rows.
    per_session_queues: dict[tuple[str, str], deque] = defaultdict(deque)
    durations: dict[tuple[str, str], list[int]] = defaultdict(list)
    for r in ev_rows:
        sid = r["session_id"]
        if sid is None:
            continue  # cross-session pairing not allowed; skip orphan-session events
        cls = _classify_hook(r["event_name"])
        if cls is None:
            continue
        kind, pair_key = cls
        q_key = (sid, pair_key)
        if kind == "pre":
            per_session_queues[q_key].append((r["day"], r["ts"]))
            continue
        # post: pop the matching pre from this session's FIFO queue.
        if not per_session_queues[q_key]:
            continue  # orphan post — drop
        pre_day, pre_ts = per_session_queues[q_key].popleft()
        pre_dt = _parse_ts(pre_ts)
        post_dt = _parse_ts(r["ts"])
        if pre_dt is None or post_dt is None:
            continue
        ms = int((post_dt - pre_dt).total_seconds() * 1000)
        if ms < 0:
            continue
        ms = min(ms, _HOOK_PAIR_CAP_MS)
        bucket_key = (pre_day, f"claude_code.hook.pre_{pair_key}")
        durations[bucket_key].append(ms)

    p50_by_key: dict[tuple[str, str], int | None] = {}
    for k, vs in durations.items():
        vs.sort()
        p50_by_key[k] = _percentile(vs, 0.5)

    items: list[HookActivityRow] = []
    for r in fires_rows:
        key = (r["day"], r["hook_name"])
        items.append(
            HookActivityRow(
                day=r["day"],
                hook_name=r["hook_name"],
                fires=int(r["fires"]),
                paired_duration_ms_p50=p50_by_key.get(key),
            )
        )
    total = sum(it.fires for it in items)
    return HookActivityResponse(items=items, range=RangeWindow(range_), total_fires=total)


# ---- OBSV-06: sessions by project (cwd rollup) ------------------------------

# Two separate text() constants — one with the WHERE filter, one without
# (range="all"). Avoids fragile string.replace() on a text() object.
_BY_PROJECT_SQL_RANGE = text("""
    SELECT
      COALESCE(cwd, '(unknown)') AS cwd,
      COUNT(*)                                                              AS sessions,
      COALESCE(SUM(tokens_input + tokens_output + tokens_cache_create), 0)  AS tokens_effective,
      COALESCE(SUM(tool_call_count), 0)                                     AS tool_calls
    FROM sessions
    WHERE started_at >= datetime('now', :since_clause)
    GROUP BY cwd
    ORDER BY sessions DESC
""")

_BY_PROJECT_SQL_ALL = text("""
    SELECT
      COALESCE(cwd, '(unknown)') AS cwd,
      COUNT(*)                                                              AS sessions,
      COALESCE(SUM(tokens_input + tokens_output + tokens_cache_create), 0)  AS tokens_effective,
      COALESCE(SUM(tool_call_count), 0)                                     AS tool_calls
    FROM sessions
    GROUP BY cwd
    ORDER BY sessions DESC
""")

# Strip /Users/<username>/ prefix to ~/ for compact display in the UI.
_HOME_RE = re.compile(r"^/Users/[^/]+/")


@router.get("/sessions/by-project", response_model=ProjectRollupResponse)
async def sessions_by_project(
    db: AsyncSession = Depends(get_session),
    range_: Literal["today", "7d", "30d", "all"] = Query("30d", alias="range"),
):
    if range_ == "all":
        rows = (await db.execute(_BY_PROJECT_SQL_ALL)).mappings().all()
    else:
        since = _RANGE_TO_SINCE[range_]
        rows = (await db.execute(_BY_PROJECT_SQL_RANGE, {"since_clause": since})).mappings().all()
    total_sessions = sum(int(r["sessions"]) for r in rows) or 1
    items = [
        ProjectRollupRow(
            cwd=r["cwd"],
            display_path=_HOME_RE.sub("~/", r["cwd"]),
            sessions=int(r["sessions"]),
            tokens_effective=int(r["tokens_effective"]),
            tool_calls=int(r["tool_calls"]),
            pct_of_total=round(int(r["sessions"]) / total_sessions, 4),
        )
        for r in rows
    ]
    return ProjectRollupResponse(items=items, range=RangeWindow(range_))


# ---- OBSV-07: agent fanout --------------------------------------------------

_AGENT_FANOUT_SQL = text("""
    SELECT
      t.session_id,
      COUNT(*) AS agent_calls,
      s.cwd, s.started_at
    FROM tools t
    JOIN sessions s ON s.session_id = t.session_id
    WHERE t.tool_name = 'Agent'
      AND s.started_at >= datetime('now', :since_clause)
    GROUP BY t.session_id
    ORDER BY agent_calls DESC
    LIMIT 100
""")


@router.get("/tools/agent-fanout", response_model=AgentFanoutResponse)
async def agent_fanout(
    db: AsyncSession = Depends(get_session),
    range_: Literal["today", "7d", "30d"] = Query("7d", alias="range"),
):
    since = _RANGE_TO_SINCE[range_]
    rows = (await db.execute(_AGENT_FANOUT_SQL, {"since_clause": since})).mappings().all()
    items: list[AgentFanoutRow] = []
    for r in rows:
        cwd = r["cwd"] or ""
        title = (
            cwd.rstrip("/").rsplit("/", 1)[-1] if cwd else (r["session_id"][:8] + "…")
        )
        items.append(
            AgentFanoutRow(
                session_id=r["session_id"],
                title=title or None,
                agent_calls=int(r["agent_calls"]),
                started_at=r["started_at"],
            )
        )
    return AgentFanoutResponse(items=items, range=RangeWindow(range_))


# ---- OBSV-08: edit decisions (dual-source: tools.decision + otel_events) ---

_EDIT_TOOL_NAMES = ("Edit", "MultiEdit", "Write", "NotebookEdit")

_EDIT_DECISIONS_SQL = text("""
    SELECT
      tool_name,
      SUM(CASE WHEN decision = 'accept' THEN 1 ELSE 0 END) AS accepted,
      SUM(CASE WHEN decision = 'reject' THEN 1 ELSE 0 END) AS rejected
    FROM tools
    WHERE tool_name IN ('Edit', 'MultiEdit', 'Write', 'NotebookEdit')
      AND decision IN ('accept', 'reject')
      AND started_at >= datetime('now', :since_clause)
    GROUP BY tool_name
""")

_EDIT_DECISIONS_OTEL_SQL = text("""
    SELECT
      json_extract(body, '$.tool_name') AS tool_name,
      SUM(CASE WHEN json_extract(body, '$.decision') = 'accept' THEN 1 ELSE 0 END) AS accepted,
      SUM(CASE WHEN json_extract(body, '$.decision') = 'reject' THEN 1 ELSE 0 END) AS rejected
    FROM otel_events
    WHERE event_name = 'claude_code.tool_decision'
      AND json_extract(body, '$.tool_name') IN ('Edit', 'MultiEdit', 'Write', 'NotebookEdit')
      AND ts >= datetime('now', :since_clause)
    GROUP BY tool_name
""")


@router.get("/tools/edit-decisions", response_model=EditDecisionsResponse)
async def edit_decisions(
    db: AsyncSession = Depends(get_session),
    range_: Literal["today", "7d", "30d"] = Query("7d", alias="range"),
):
    """Read decisions from BOTH tools.decision and otel_events tool_decision.

    Phase 2's parser may write either path depending on which signal arrives
    first; we sum both sources by tool_name. low_sample = (acc+rej) < 10.
    """
    since = _RANGE_TO_SINCE[range_]
    tool_rows = (
        (await db.execute(_EDIT_DECISIONS_SQL, {"since_clause": since}))
        .mappings()
        .all()
    )
    otel_rows = (
        (await db.execute(_EDIT_DECISIONS_OTEL_SQL, {"since_clause": since}))
        .mappings()
        .all()
    )
    merged: dict[str, dict[str, int]] = {
        n: {"accepted": 0, "rejected": 0} for n in _EDIT_TOOL_NAMES
    }
    for r in tool_rows:
        merged[r["tool_name"]]["accepted"] += int(r["accepted"] or 0)
        merged[r["tool_name"]]["rejected"] += int(r["rejected"] or 0)
    for r in otel_rows:
        tn = r["tool_name"]
        if tn in merged:
            merged[tn]["accepted"] += int(r["accepted"] or 0)
            merged[tn]["rejected"] += int(r["rejected"] or 0)
    items: list[EditDecisionRow] = []
    for tn, d in merged.items():
        total = d["accepted"] + d["rejected"]
        items.append(
            EditDecisionRow(
                tool_name=tn,
                accepted=d["accepted"],
                rejected=d["rejected"],
                accept_rate=round(d["accepted"] / total, 4) if total else 0.0,
                low_sample=total < 10,
            )
        )
    return EditDecisionsResponse(items=items, range=RangeWindow(range_))


# ---- OBSV-09: developer productivity (git-derived metrics) -----------------

_PRODUCTIVITY_SQL = text("""
    SELECT
      metric_name,
      json_extract(attrs, '$.type') AS attr_type,
      SUM(value) AS total
    FROM otel_metrics
    WHERE metric_name IN (
        'claude_code.commit.count',
        'claude_code.pull_request.count',
        'claude_code.lines_of_code.count'
      )
      AND ts >= datetime('now', :since_clause)
    GROUP BY metric_name, attr_type
""")


@router.get("/activity/productivity", response_model=ProductivityResponse)
async def productivity(
    db: AsyncSession = Depends(get_session),
    range_: Literal["today", "7d", "30d"] = Query("7d", alias="range"),
):
    since = _RANGE_TO_SINCE[range_]
    rows = (await db.execute(_PRODUCTIVITY_SQL, {"since_clause": since})).mappings().all()
    commits = pull_requests = lines_added = lines_removed = 0
    for r in rows:
        total = int(r["total"] or 0)
        if r["metric_name"] == "claude_code.commit.count":
            commits += total
        elif r["metric_name"] == "claude_code.pull_request.count":
            pull_requests += total
        elif r["metric_name"] == "claude_code.lines_of_code.count":
            if r["attr_type"] == "added":
                lines_added += total
            elif r["attr_type"] == "removed":
                lines_removed += total
    return ProductivityResponse(
        commits=commits,
        pull_requests=pull_requests,
        lines_added=lines_added,
        lines_removed=lines_removed,
        range=RangeWindow(range_),
    )


# ---- OBSV-10: system pressure (errors, retries, compaction) ----------------

_PRESSURE_COUNTS_SQL = text("""
    SELECT
      event_name,
      COUNT(*) AS c
    FROM otel_events
    WHERE event_name IN (
        'claude_code.api_retries_exhausted',
        'claude_code.compaction',
        'claude_code.api_error'
      )
    GROUP BY event_name
""")

_RECENT_ERRORS_SQL = text("""
    SELECT
      ts, session_id,
      COALESCE(json_extract(body, '$.message'), event_name) AS message
    FROM otel_events
    WHERE event_name = 'claude_code.api_error'
    ORDER BY ts DESC
    LIMIT 10
""")


@router.get("/system/pressure", response_model=PressureResponse)
async def system_pressure(db: AsyncSession = Depends(get_session)):
    counts = (await db.execute(_PRESSURE_COUNTS_SQL)).mappings().all()
    c_map = {r["event_name"]: int(r["c"]) for r in counts}
    err_rows = (await db.execute(_RECENT_ERRORS_SQL)).mappings().all()
    recent = [
        ApiErrorEntry(
            ts=r["ts"],
            session_id=r["session_id"],
            message=str(r["message"] or ""),
        )
        for r in err_rows
    ]
    return PressureResponse(
        api_retries_exhausted=c_map.get("claude_code.api_retries_exhausted", 0),
        compaction_count=c_map.get("claude_code.compaction", 0),
        recent_api_errors=recent,
    )


# ---- Phase 6 Plan 01 — ACTV-01: 30-day session-activity heatmap ------------

_HEATMAP_SQL = text("""
    SELECT
      STRFTIME('%Y-%m-%d', started_at, 'localtime') AS day,
      COUNT(*) AS sessions,
      COALESCE(SUM(COALESCE(tokens_input, 0) + COALESCE(tokens_output, 0)
                   + COALESCE(tokens_cache_read, 0) + COALESCE(tokens_cache_create, 0)), 0)
        AS tokens_effective
    FROM sessions
    WHERE started_at >= datetime('now', :since_clause)
    GROUP BY day
    ORDER BY day ASC
""")


@router.get("/activity/heatmap", response_model=HeatmapResponse)
async def activity_heatmap(
    db: AsyncSession = Depends(get_session),
    range_: Literal["today", "7d", "30d"] = Query("30d", alias="range"),
) -> HeatmapResponse:
    """ACTV-01: per-day session activity rollup for the heatmap card."""
    since = _RANGE_TO_SINCE[range_]
    rows = (await db.execute(_HEATMAP_SQL, {"since_clause": since})).mappings().all()
    items = [
        HeatmapDayRow(
            day=r["day"],
            sessions=int(r["sessions"]),
            tokens_effective=int(r["tokens_effective"]),
        )
        for r in rows
    ]
    return HeatmapResponse(items=items, range=range_)


# ---- Phase 6 Plan 01 — ACTV-05: unified failures ---------------------------

# Outcome is computed inline matching OBSV-03's read-time CASE so we don't
# depend on Phase 2 ingest populating sessions.outcome (Pitfall 9 fallback).
# The outer query joins to a subquery that pulls the latest api_error message
# per session.
_FAILURES_SQL = text("""
    WITH classified AS (
      SELECT
        s.session_id,
        s.started_at,
        CASE
          WHEN EXISTS (SELECT 1 FROM otel_events e WHERE e.session_id = s.session_id
                       AND e.event_name = 'claude_code.api_error') THEN 'errored'
          WHEN EXISTS (SELECT 1 FROM otel_events e WHERE e.session_id = s.session_id
                       AND e.event_name = 'claude_code.api_retries_exhausted') THEN 'rate_limited'
          ELSE NULL
        END AS outcome
      FROM sessions s
      WHERE s.started_at >= datetime('now', :since_clause)
    )
    SELECT
      c.session_id,
      c.started_at,
      c.outcome,
      (SELECT json_extract(e.body, '$.message')
         FROM otel_events e
         WHERE e.session_id = c.session_id
           AND e.event_name = 'claude_code.api_error'
         ORDER BY e.ts DESC
         LIMIT 1) AS last_error_message
    FROM classified c
    WHERE c.outcome IS NOT NULL
    ORDER BY c.started_at DESC
""")


def _coerce_started_at(value) -> datetime:
    """Normalize started_at to a tz-aware UTC datetime.

    SQLite strips tzinfo on round-trip when the column type uses Python's
    `datetime` adapter; the route promises a tz-aware ISO string in the
    response, so re-attach UTC when missing.
    """
    if isinstance(value, datetime):
        dt = value
    else:
        dt = datetime.fromisoformat(str(value))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt


@router.get("/sessions/failures", response_model=FailuresResponse)
async def sessions_failures(
    db: AsyncSession = Depends(get_session),
    range_: Literal["today", "7d", "30d"] = Query("30d", alias="range"),
) -> FailuresResponse:
    """ACTV-05: failed sessions in the window with most-recent api_error message."""
    since = _RANGE_TO_SINCE[range_]
    rows = (await db.execute(_FAILURES_SQL, {"since_clause": since})).mappings().all()
    items = [
        FailureRow(
            session_id=r["session_id"],
            started_at=_coerce_started_at(r["started_at"]),
            outcome=r["outcome"],
            last_error_message=r["last_error_message"],
        )
        for r in rows
    ]
    return FailuresResponse(items=items, range=range_)
