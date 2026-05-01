"""Schedules router — SCHD-01..06.

Six endpoints under /api covering full CRUD on schedules + a runs view +
an NL->cron parser:

  GET    /schedules                      — SCHD-01 list (limit, offset)
  POST   /schedules                      — SCHD-02 create (cron-validated, 201)
  PATCH  /schedules/{schedule_id}        — SCHD-03 partial update + recompute
  DELETE /schedules/{schedule_id}        — SCHD-04 delete (204)
  GET    /schedules/{schedule_id}/runs   — SCHD-05 last N materialized tasks
  POST   /schedules/parse-nl             — SCHD-06 NL -> cron via Claude Haiku

Cron validation + next_run computation
  cmc.schedules.cron.validate_cron is the single source of truth for cron
  validity (5-field croniter is_valid). cmc.schedules.cron.next_run computes
  the next firing relative to a tz-aware datetime.now(timezone.utc) — a naive
  base would silently use local time (Pitfall 3) and is rejected at the cron
  module boundary.

Recompute matrix (SCHD-03: clear AND recompute)
  next_run_at is recomputed (or cleared) on PATCH iff EITHER `cron` OR
  `enabled` changes:
    enabled=True,  cron change -> next_run_at = next_run(new_cron, now)
    enabled=True,  no cron change, no enabled change -> untouched
    enabled flips True->False                       -> next_run_at = NULL
    enabled flips False->True                       -> next_run_at recomputed
  POST /schedules also follows the same rule on first insert: next_run_at is
  populated when enabled=True, NULL otherwise.

503-graceful NL fallback (SCHD-06)
  cmc.schedules.nlcron.nl_to_cron returns None for BOTH "ANTHROPIC_API_KEY
  missing" AND "model returned invalid cron". A SINGLE 503 response covers
  both cases with the identical user-facing message
  (`natural-language schedules unavailable`). Distinguishing the two would
  leak environment configuration to localhost callers.

Error contract — the app HTTPException handler emits {error: detail}, NOT
the FastAPI default {detail: ...}.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.api.schemas.schedules import (
    NLCronRequest,
    NLCronResponse,
    ScheduleCreate,
    ScheduleListItem,
    ScheduleListResponse,
    ScheduleRunsResponse,
    ScheduleUpdate,
)
from cmc.api.schemas.tasks import TaskListItem
from cmc.db import get_session
from cmc.db.models.schedules import Schedule
from cmc.db.models.tasks import Task
from cmc.schedules.cron import next_run, validate_cron
from cmc.schedules.nlcron import nl_to_cron

router = APIRouter(tags=["schedules"])


# ---------- SCHD-01: GET /api/schedules ----------


@router.get("/schedules", response_model=ScheduleListResponse)
async def list_schedules(
    db: AsyncSession = Depends(get_session),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> ScheduleListResponse:
    """SCHD-01: paginated schedule list ordered created_at DESC.

    `total` is the table-wide count (no filters in v1).
    """
    q = (
        select(Schedule)
        .order_by(Schedule.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    c = select(func.count(Schedule.id))
    rows = (await db.execute(q)).scalars().all()
    total = (await db.execute(c)).scalar_one()
    return ScheduleListResponse(
        items=[ScheduleListItem.model_validate(r) for r in rows],
        total=total,
    )


# ---------- SCHD-02: POST /api/schedules ----------


@router.post("/schedules", response_model=ScheduleListItem, status_code=201)
async def create_schedule(
    payload: ScheduleCreate,
    db: AsyncSession = Depends(get_session),
) -> ScheduleListItem:
    """SCHD-02: create a schedule.

    Cron is validated via cmc.schedules.cron.validate_cron (croniter is_valid).
    422 with `error='invalid cron expression'` on failure. next_run_at is
    populated when enabled=True (computed against now-UTC) or NULL when
    enabled=False. Duplicate name -> 409 (UNIQUE uq_schedules_name).
    """
    if not validate_cron(payload.cron):
        raise HTTPException(status_code=422, detail="invalid cron expression")

    now = datetime.now(UTC)
    cron = payload.cron.strip()
    nxt: datetime | None = next_run(cron, now) if payload.enabled else None
    s = Schedule(
        name=payload.name,
        cron=cron,
        enabled=payload.enabled,
        next_run_at=nxt,
        task_template=payload.task_template,
        skill=payload.skill,
        created_at=now,
        updated_at=now,
    )
    db.add(s)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=409, detail="schedule name already exists"
        ) from None
    await db.refresh(s)
    return ScheduleListItem.model_validate(s)


# ---------- SCHD-03: PATCH /api/schedules/{id} ----------


@router.patch("/schedules/{schedule_id}", response_model=ScheduleListItem)
async def patch_schedule(
    schedule_id: int,
    payload: ScheduleUpdate,
    db: AsyncSession = Depends(get_session),
) -> ScheduleListItem:
    """SCHD-03: partial update with cron-recompute invariant.

    Clear-and-recompute invariant: when EITHER `cron` OR `enabled` changes,
    next_run_at is set to next_run(...) if the row ends up enabled, or cleared
    to NULL otherwise. Other field-only PATCHes leave next_run_at alone.
    updated_at always refreshes.

    422 on invalid cron — DB row is NOT modified. 409 on UNIQUE name conflict.
    """
    row = (
        await db.execute(select(Schedule).where(Schedule.id == schedule_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="schedule not found")

    updates = payload.model_dump(exclude_unset=True)

    # Validate + normalize cron BEFORE mutating the row.
    if "cron" in updates and updates["cron"] is not None:
        if not validate_cron(updates["cron"]):
            raise HTTPException(
                status_code=422, detail="invalid cron expression"
            )
        updates["cron"] = updates["cron"].strip()

    cron_changed = "cron" in updates and updates["cron"] != row.cron
    enabled_changed = (
        "enabled" in updates and updates["enabled"] != row.enabled
    )

    for k, v in updates.items():
        setattr(row, k, v)

    if cron_changed or enabled_changed:
        if row.enabled:
            row.next_run_at = next_run(row.cron, datetime.now(UTC))
        else:
            row.next_run_at = None

    row.updated_at = datetime.now(UTC)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=409, detail="schedule name already exists"
        ) from None
    await db.refresh(row)
    return ScheduleListItem.model_validate(row)


# ---------- SCHD-04: DELETE /api/schedules/{id} ----------


@router.delete("/schedules/{schedule_id}", status_code=204)
async def delete_schedule(
    schedule_id: int,
    db: AsyncSession = Depends(get_session),
) -> Response:
    """SCHD-04: delete by id. 204 No Content on success, 404 on missing.

    The Task.schedule_id FK is `ON DELETE SET NULL` so deleting a schedule does
    NOT cascade-delete its historical task runs — they remain
    visible in /api/tasks with schedule_id NULL'd out.
    """
    row = (
        await db.execute(select(Schedule).where(Schedule.id == schedule_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="schedule not found")
    await db.delete(row)
    await db.commit()
    return Response(status_code=204)


# ---------- SCHD-05: GET /api/schedules/{id}/runs ----------


@router.get(
    "/schedules/{schedule_id}/runs", response_model=ScheduleRunsResponse
)
async def list_schedule_runs(
    schedule_id: int,
    db: AsyncSession = Depends(get_session),
    limit: int = Query(20, ge=1, le=200),
) -> ScheduleRunsResponse:
    """SCHD-05: last N tasks materialized from this schedule, created_at DESC.

    Returns 404 (rather than empty list) when the schedule does not exist —
    the caller should distinguish "no schedule" from "schedule with zero runs".
    `total` is the FILTERED count (tasks with schedule_id == this id), not
    the table-wide tasks count.
    """
    sched = (
        await db.execute(select(Schedule).where(Schedule.id == schedule_id))
    ).scalar_one_or_none()
    if sched is None:
        raise HTTPException(status_code=404, detail="schedule not found")

    rows = (
        await db.execute(
            select(Task)
            .where(Task.schedule_id == schedule_id)
            .order_by(Task.created_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    total = (
        await db.execute(
            select(func.count(Task.id)).where(Task.schedule_id == schedule_id)
        )
    ).scalar_one()
    return ScheduleRunsResponse(
        items=[TaskListItem.model_validate(r) for r in rows],
        total=total,
    )


# ---------- SCHD-06: POST /api/schedules/parse-nl ----------


@router.post("/schedules/parse-nl", response_model=NLCronResponse)
async def parse_nl_cron(payload: NLCronRequest) -> NLCronResponse:
    """SCHD-06: convert NL description to cron via Claude Haiku 4.5.

    Single 503 covers both failure modes (missing API key OR invalid model
    output) — distinguishing them would leak env config to localhost callers
    (Security V11). The cron returned has already been croniter-validated
    inside cmc.schedules.nlcron.nl_to_cron, so callers can persist it directly.
    """
    cron_str = await nl_to_cron(payload.description)
    if cron_str is None:
        raise HTTPException(
            status_code=503,
            detail="natural-language schedules unavailable",
        )
    return NLCronResponse(cron=cron_str, description=payload.description)
