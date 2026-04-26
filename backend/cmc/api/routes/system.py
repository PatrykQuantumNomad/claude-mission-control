"""System router — SAPI-02..05.

SAPI-01 (/api/health) stays in cmc.api.routes.health (per RESEARCH §1 Open Q9).
This module owns:
  - GET /system/health    -> SAPI-02
  - GET /system/state     -> SAPI-03
  - GET /attention        -> SAPI-04
  - GET /firehose         -> SAPI-05  (added in Task 2 of this plan)

All paths are mounted under /api by factory.py via all_routers().

Security note (T-03-02-01): SAPI-03 enforces a whitelist on the system_state
KV table so internal keys (dispatcher PIDs, etc.) never leak through this
public read endpoint. Adding a new public key requires editing
`_SYSTEM_STATE_WHITELIST` here AND a code review.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Optional

import psutil
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.api.schemas.system import (
    AttentionItem,
    AttentionResponse,
    DaemonAge,
    SystemHealthResponse,
    SystemStateResponse,
)
from cmc.db import get_session
from cmc.db.models.otel_events import OtelEvent
from cmc.db.models.sessions import Session as SessionModel
from cmc.db.models.system_state import SystemState

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
