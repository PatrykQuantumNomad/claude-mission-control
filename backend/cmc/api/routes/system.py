"""System router — SAPI-02..05.

SAPI-01 (/api/health) stays in cmc.api.routes.health (per RESEARCH §1 Open Q9).
This module owns:
  - GET /system/health    -> SAPI-02
  - GET /system/state     -> SAPI-03
  - GET /attention        -> SAPI-04
  - GET /firehose         -> SAPI-05

All paths are mounted under /api by factory.py via all_routers().

Security note (T-03-02-01): SAPI-03 enforces a whitelist on the system_state
KV table so internal keys (dispatcher PIDs, etc.) never leak through this
public read endpoint. Adding a new public key requires editing
`_SYSTEM_STATE_WHITELIST` here AND a code review.

SSE note (FastAPI 0.136.1): the firehose endpoint is an `async def` with
`response_class=EventSourceResponse` — FastAPI's routing layer encodes each
yielded `ServerSentEvent` into the SSE wire format and inserts keep-alive
comments every 15s. The plan referenced an sse_starlette-style return-the-
generator pattern; the modern FastAPI pattern is "BE the generator". Per
Pitfall 1: tail_otel_events checks request.is_disconnected() each loop and
caps the stream at 60min so generators never leak.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import AsyncIterator, Optional

import psutil
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.sse import EventSourceResponse, ServerSentEvent
from sqlalchemy import func, select, update
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.api.schemas.system import (
    AttentionItem,
    AttentionResponse,
    DaemonAge,
    EmergencyResumeResponse,
    EmergencyStopResponse,
    SystemHealthResponse,
    SystemStateResponse,
)
from cmc.api.sse import tail_otel_events
from cmc.core.process import emergency_stop_all
from cmc.db import get_session
from cmc.db.models.otel_events import OtelEvent
from cmc.db.models.sessions import Session as SessionModel
from cmc.db.models.system_state import SystemState
from cmc.db.models.tasks import Task

router = APIRouter(tags=["system"])

# SAPI-03 whitelist (per RESEARCH Open Q3 + Security Domain Information
# Disclosure mitigation T-03-02-01). Adding new public keys requires explicit
# code change + review.
_SYSTEM_STATE_WHITELIST = frozenset({
    "tzname",
    "last_jsonl_sync_at",
    "jsonl_sync_last_tick_at",
    "dispatcher_last_tick_at",
    "telegram_last_tick_at",
    "emergency_stop",
})

# Daemon keys surfaced as `daemon_ages` in SAPI-02. Order is deterministic so
# the response shape is stable for the dashboard SystemHealthStrip.
_DAEMON_KEYS: tuple[str, ...] = (
    "jsonl_sync_last_tick_at",
    "dispatcher_last_tick_at",
    "telegram_last_tick_at",
)

# Sessions running this long without ended_at are flagged as "stuck" by SAPI-04.
_STUCK_SESSION_HOURS = 3

# Dispatcher tick stale threshold (only surface as AttentionItem above this).
_STALE_DISPATCHER_SECONDS = 600


def _coerce_value(row: SystemState):
    """Return the user-visible value for a system_state row.

    Prefers value_json when set (object/array), else falls back to the plain
    `value` string. Keeps the response shape consistent with how downstream
    phases (4, 5) write the column.
    """
    if row.value_json is not None:
        return row.value_json
    return row.value


def _parse_ts_or_none(raw: Optional[str]) -> Optional[datetime]:
    """Parse an ISO-8601 timestamp string -> tz-aware UTC datetime.

    Returns None on parse failure or empty input. Per Pitfall 4: treat naive
    timestamps as UTC (matches Phase 2 INGST-04 which writes UTC ISO strings).
    """
    if not raw:
        return None
    try:
        ts = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts


@router.get("/system/health", response_model=SystemHealthResponse)
async def system_health(
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> SystemHealthResponse:
    """SAPI-02: aggregate liveness snapshot (uptime, memory, daemon ages, tz).

    `status` is hard-coded to "ok" until a degradation heuristic lands in a
    later phase (kept here so the response_model stays stable).
    """
    now_utc = datetime.now(timezone.utc)

    # Uptime: difference between now and lifespan-set boot_time (Plan 03-01).
    # Defensive fallback to ~0 if state was somehow unset (should never trigger).
    boot_time = getattr(request.app.state, "boot_time", now_utc)
    uptime_seconds = max(0, int((now_utc - boot_time).total_seconds()))

    # Memory RSS in MB. RSS is the right metric for "how much real memory is
    # this process holding"; do NOT call cpu_percent (interval blocks the loop).
    rss_bytes = psutil.Process(os.getpid()).memory_info().rss
    memory_rss_mb = round(rss_bytes / 1024 / 1024, 1)

    # Last otel event age. Empty table -> None.
    last_ts_row = await db.execute(select(func.max(OtelEvent.ts)))
    last_otel_ts = last_ts_row.scalar_one_or_none()
    last_otel_event_age_seconds: Optional[int]
    if last_otel_ts is None:
        last_otel_event_age_seconds = None
    else:
        # Pitfall 4: SQLite returns tz-naive datetimes by default; treat as UTC.
        if last_otel_ts.tzinfo is None:
            last_otel_ts = last_otel_ts.replace(tzinfo=timezone.utc)
        last_otel_event_age_seconds = max(
            0, int((now_utc - last_otel_ts).total_seconds())
        )

    # Daemon ages: one query per key (3 queries — bounded). Missing or
    # unparseable rows -> age_seconds=None (frontend renders "—").
    daemon_ages: list[DaemonAge] = []
    for key in _DAEMON_KEYS:
        row = (
            await db.execute(select(SystemState).where(SystemState.key == key))
        ).scalar_one_or_none()
        if row is None:
            daemon_ages.append(DaemonAge(key=key, last_tick_at=None, age_seconds=None))
            continue
        ts = _parse_ts_or_none(row.value)
        if ts is None:
            daemon_ages.append(
                DaemonAge(key=key, last_tick_at=row.value, age_seconds=None)
            )
            continue
        age = max(0, int((now_utc - ts).total_seconds()))
        daemon_ages.append(
            DaemonAge(key=key, last_tick_at=row.value, age_seconds=age)
        )

    # Local tzname (e.g. "PDT", "PST", "UTC"). Falls back to "UTC" on systems
    # where astimezone().tzname() returns None (rare).
    tzname = datetime.now().astimezone().tzname() or "UTC"

    return SystemHealthResponse(
        status="ok",
        uptime_seconds=uptime_seconds,
        memory_rss_mb=memory_rss_mb,
        last_otel_event_age_seconds=last_otel_event_age_seconds,
        daemon_ages=daemon_ages,
        tzname=tzname,
    )


@router.get("/system/state", response_model=SystemStateResponse)
async def system_state(
    key: Optional[str] = Query(
        None, description="If provided, return only this key's value"
    ),
    db: AsyncSession = Depends(get_session),
) -> SystemStateResponse:
    """SAPI-03: whitelisted KV state snapshot.

    Information Disclosure mitigation (T-03-02-01): non-whitelisted keys MUST
    NOT appear in response; per-key requests for non-whitelisted keys return
    404 (does not confirm or deny existence).
    """
    if key is not None:
        if key not in _SYSTEM_STATE_WHITELIST:
            # Same 404 as "exists but not in DB" so the response doesn't
            # confirm or deny existence of internal keys.
            raise HTTPException(status_code=404, detail="key not found")
        row = (
            await db.execute(select(SystemState).where(SystemState.key == key))
        ).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="key not found")
        return SystemStateResponse(items={key: _coerce_value(row)})

    # No key filter: return ALL whitelisted keys present in DB. Keys absent
    # from the DB are simply absent from the response (caller must not
    # assume any key is present).
    rows = (
        await db.execute(
            select(SystemState).where(SystemState.key.in_(_SYSTEM_STATE_WHITELIST))
        )
    ).scalars().all()
    return SystemStateResponse(items={r.key: _coerce_value(r) for r in rows})


@router.get("/attention", response_model=AttentionResponse)
async def attention(db: AsyncSession = Depends(get_session)) -> AttentionResponse:
    """SAPI-04: aggregate attention snapshot.

    Per Pitfall 7: pending_decisions and failed_tasks are returned as 0 even
    when Phase 4 tables are empty — the contract MUST stay stable so the
    frontend doesn't need to branch on schema presence. When Phase 4 lands the
    `tasks`/`decisions` tables, edit this function to populate the counters
    (do NOT introduce schema branching).
    """
    # Phase-4-deferred fields (Pitfall 7): explicit 0, not omitted.
    pending_decisions = 0
    failed_tasks = 0

    # Stuck sessions: started >3h ago and never ended.
    # Use func.datetime("now", "-3 hours") which is SQLite-native and matches
    # how started_at is stored (UTC ISO string from Phase 2).
    stuck_q = (
        select(func.count())
        .select_from(SessionModel)
        .where(
            SessionModel.ended_at.is_(None),
            SessionModel.started_at < func.datetime("now", f"-{_STUCK_SESSION_HOURS} hours"),
        )
    )
    stuck_sessions = (await db.execute(stuck_q)).scalar_one()

    # Stale dispatcher: derive from system_state.dispatcher_last_tick_at age.
    stale_dispatcher_seconds: Optional[int] = None
    row = (
        await db.execute(
            select(SystemState).where(SystemState.key == "dispatcher_last_tick_at")
        )
    ).scalar_one_or_none()
    if row is not None:
        ts = _parse_ts_or_none(row.value)
        if ts is not None:
            stale_dispatcher_seconds = max(
                0, int((datetime.now(timezone.utc) - ts).total_seconds())
            )

    items: list[AttentionItem] = []
    if stuck_sessions > 0:
        items.append(
            AttentionItem(
                kind="stuck_sessions",
                severity="warning",
                count=stuck_sessions,
                detail=(
                    f"{stuck_sessions} session(s) running >{_STUCK_SESSION_HOURS}h "
                    f"with no end timestamp"
                ),
            )
        )
    if (
        stale_dispatcher_seconds is not None
        and stale_dispatcher_seconds > _STALE_DISPATCHER_SECONDS
    ):
        items.append(
            AttentionItem(
                kind="stale_dispatcher",
                severity="error",
                count=1,
                detail=f"dispatcher last tick {stale_dispatcher_seconds}s ago",
            )
        )

    return AttentionResponse(
        items=items,
        pending_decisions=pending_decisions,
        failed_tasks=failed_tasks,
        stale_dispatcher_seconds=stale_dispatcher_seconds,
        stuck_sessions=stuck_sessions,
    )


async def _resolve_since_id(
    since: Optional[str] = Query(
        None, description="ISO timestamp; default = tail (MAX(id)-100)"
    ),
    db: AsyncSession = Depends(get_session),
) -> Optional[int]:
    """Validate `?since=` ISO timestamp -> starting OtelEvent.id.

    Lives as a separate FastAPI dependency so HTTPException(400) raised here
    is converted into a real 400 response by the request-handling pipeline.
    Raising HTTPException from inside the SSE generator instead would be
    swallowed by the SSE producer (FastAPI 0.136.1's routing.py wraps the
    generator in an inner task group that re-raises into ExceptionGroup).
    """
    if not since:
        return None
    try:
        ts = datetime.fromisoformat(since)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail="invalid `since` ISO timestamp",
        ) from exc
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    max_id_row = await db.execute(
        select(func.max(OtelEvent.id)).where(OtelEvent.ts < ts)
    )
    return max_id_row.scalar_one_or_none() or 0


@router.get("/firehose", response_class=EventSourceResponse)
async def firehose(
    request: Request,
    event_name: Optional[str] = Query(
        None, description="server-side event_name filter"
    ),
    since_id: Optional[int] = Depends(_resolve_since_id),
    db: AsyncSession = Depends(get_session),
) -> AsyncIterator[ServerSentEvent]:
    """SAPI-05: SSE stream of recent OTEL events.

    FastAPI 0.136.1 SSE pattern: this path operation IS an async generator.
    Yielded `ServerSentEvent` objects are encoded by the routing layer into
    the SSE wire format (`event: ...\\ndata: ...\\n\\n`) with keep-alive
    pings inserted every 15s on idle.

    Per Pitfall 1 + Pitfall 3 (handled inside `tail_otel_events`):
      - request.is_disconnected() polled each iteration so the generator
        exits within ~1s of client close.
      - Stream auto-caps at 60min so generators never leak.
      - Per-iteration query results are exhausted to a list before sleep
        (no held cursors).

    The `db` AsyncSession dependency is held for the lifetime of the
    response (FastAPI scopes deps to the response). `tail_otel_events`
    reuses this connection for each batched fetch.

    Tampering mitigation (T-03-02-02 / V5): bogus `?since=` returns 400 via
    the `_resolve_since_id` dependency BEFORE the SSE generator is entered.
    """
    # Adapt the helper's sse_starlette-style dict output ({event, id, data})
    # into FastAPI 0.136.1 ServerSentEvent objects. The `data` field from
    # the helper is already a JSON string, so we use raw_data to skip a
    # second JSON-encode pass.
    async for chunk in tail_otel_events(
        request, db, since_id=since_id, event_name=event_name
    ):
        yield ServerSentEvent(
            event=chunk.get("event"),
            id=chunk.get("id"),
            raw_data=chunk.get("data"),
        )


# ---- Phase 4 ESTOP-01..04 (Plan 04-05) ----


@router.post(
    "/system/emergency-stop",
    response_model=EmergencyStopResponse,
)
async def emergency_stop(
    db: AsyncSession = Depends(get_session),
) -> EmergencyStopResponse:
    """ESTOP-01..03: flip flag, SIGTERM dispatcher children, fail running tasks.

    Order is critical (Pitfall 8):
      1. Set system_state.emergency_stop='1' so the dispatcher honors DISP-02
         on its NEXT iteration.
      2. Scan .tmp/mission-control-queue/pids/ + SIGTERM only PIDs whose ps
         command line contains 'claude' AND ' -p' (ESTOP-02 mitigation).
      3. UPDATE tasks SET status='failed' WHERE status='running'.

    Steps 2+3 are intentionally serial after step 1 so the dispatcher cannot
    re-flip 'failed' back to 'running' between them (the dispatcher's own
    early-return on the flag prevents this in practice; serial ordering keeps
    the invariant even if the dispatcher's polling cadence drifts).
    """
    now = datetime.now(timezone.utc)

    # 1. Flip the flag (KV upsert).
    await db.execute(
        sqlite_insert(SystemState)
        .values(key="emergency_stop", value="1", updated_at=now)
        .on_conflict_do_update(
            index_elements=["key"],
            set_={"value": "1", "updated_at": now},
        )
    )
    await db.commit()

    # 2. Scan + SIGTERM. Synchronous (subprocess.run); cheap; no need to
    #    push to a thread.
    summary = emergency_stop_all()

    # 3. Mark running tasks as failed.
    result = await db.execute(
        update(Task)
        .where(Task.status == "running")
        .values(
            status="failed",
            ended_at=now,
            error_message="emergency stop",
        )
    )
    failed_count = result.rowcount or 0
    await db.commit()

    return EmergencyStopResponse(
        emergency_stop=True,
        terminated_pids=summary["terminated"],
        skipped_pids=summary["skipped"],
        missing_pids=summary["missing"],
        failed_running_tasks=failed_count,
    )


@router.post(
    "/system/emergency-resume",
    response_model=EmergencyResumeResponse,
)
async def emergency_resume(
    db: AsyncSession = Depends(get_session),
) -> EmergencyResumeResponse:
    """ESTOP-04: clear the emergency_stop flag (set value='0').

    Per RESEARCH A3 / Open Q3: do NOT delete the row. Update to '0' so SAPI-03
    consumers see an explicit value rather than 'absent' which is ambiguous.
    """
    now = datetime.now(timezone.utc)
    await db.execute(
        sqlite_insert(SystemState)
        .values(key="emergency_stop", value="0", updated_at=now)
        .on_conflict_do_update(
            index_elements=["key"],
            set_={"value": "0", "updated_at": now},
        )
    )
    await db.commit()
    return EmergencyResumeResponse(emergency_stop=False)
