"""Tasks router — TASK-01..07.

Seven endpoints in two URL families:

  /api/tasks*                                  — task CRUD (TASK-01..06)
  /api/dispatcher/trigger                      — dispatcher one-shot (TASK-07)

  GET    /tasks                                — TASK-01 list (status + quadrant filter)
  POST   /tasks                                — TASK-02 create (201)
  PATCH  /tasks/{task_id}                      — TASK-03 partial update + transition guard
  DELETE /tasks/{task_id}                      — TASK-04 delete (204)
  POST   /tasks/{task_id}/approve              — TASK-05 awaiting_approval -> pending
  POST   /tasks/{task_id}/rerun                — TASK-06 failed -> pending (clears run state)
  POST   /dispatcher/trigger                   — TASK-07 spawn detached one-shot dispatcher

Status transition validation
  TASK-03 delegates legal-target validation to the pure-function state machine
  in cmc.tasks.transitions (Wave 0 — Plan 04-01). The matrix is the single
  source of truth; router code never inlines its own allow-list. TASK-05
  (approve) and TASK-06 (rerun) bypass the matrix because their target state
  is fixed (always 'pending') and they validate the SOURCE state explicitly:
  TASK-05 requires 'awaiting_approval', TASK-06 requires 'failed'.

Subprocess detachment (TASK-07)
  cmc.tasks.spawn.spawn_dispatcher_oneshot uses subprocess.Popen with
  start_new_session=True (RESEARCH Pattern 6 + Pitfalls 2 + 10) so that
  Ctrl+C on the FastAPI server does NOT propagate to the dispatcher. argv
  comes from Settings.dispatcher_oneshot_cmd (list[str], NEVER shell=True —
  T-04-03-01 mitigation: no command injection surface).

  The trigger endpoint takes NO body in v1; TaskTriggerRequest was deliberately
  omitted from cmc.api.schemas.tasks to avoid the FastAPI 422-on-missing-{}
  anti-pattern. Handler signature is `request: Request` only.

Error contract — the app HTTPException handler emits {error: detail}, NOT
the FastAPI default {detail: ...}. See STATE.md Plan 03-03 note.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.api.schemas.tasks import (
    TaskApproveResponse,
    TaskCreate,
    TaskListItem,
    TaskListResponse,
    TaskRerunResponse,
    TaskTriggerResponse,
    TaskUpdate,
)
from cmc.db import get_session
from cmc.db.models.tasks import Task
from cmc.tasks.spawn import spawn_dispatcher_oneshot
from cmc.tasks.transitions import validate_transition

router = APIRouter(tags=["tasks"])


# ---------- TASK-01: GET /api/tasks ----------


@router.get("/tasks", response_model=TaskListResponse)
async def list_tasks(
    db: AsyncSession = Depends(get_session),
    status_: Optional[str] = Query(None, alias="status"),
    quadrant: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> TaskListResponse:
    """TASK-01: paginated task list, optional status + quadrant filters.

    Order: priority ASC (1=high first), then created_at DESC. `total` reflects
    the FILTERED count, not the table-wide count (mirrors HITL-01 / SESS-01).
    """
    q = select(Task)
    c = select(func.count(Task.id))
    if status_ is not None:
        q = q.where(Task.status == status_)
        c = c.where(Task.status == status_)
    if quadrant is not None:
        q = q.where(Task.quadrant == quadrant)
        c = c.where(Task.quadrant == quadrant)
    q = (
        q.order_by(Task.priority.asc(), Task.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = (await db.execute(q)).scalars().all()
    total = (await db.execute(c)).scalar_one()
    return TaskListResponse(
        items=[TaskListItem.model_validate(r) for r in rows],
        total=total,
    )


# ---------- TASK-02: POST /api/tasks ----------


@router.post("/tasks", response_model=TaskListItem, status_code=201)
async def create_task(
    payload: TaskCreate,
    db: AsyncSession = Depends(get_session),
) -> TaskListItem:
    """TASK-02: create a new task. Server defaults: status='pending',
    created_at=now(UTC). All other defaults come from TaskCreate (priority=3,
    approval='auto', execution_mode='interactive', dry_run=False, etc.).
    """
    t = Task(
        **payload.model_dump(),
        created_at=datetime.now(timezone.utc),
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return TaskListItem.model_validate(t)


# ---------- TASK-03: PATCH /api/tasks/{id} ----------


@router.patch("/tasks/{task_id}", response_model=TaskListItem)
async def patch_task(
    task_id: int,
    payload: TaskUpdate,
    db: AsyncSession = Depends(get_session),
) -> TaskListItem:
    """TASK-03: partial update. If `status` is supplied AND differs from the
    current value, the transition is validated against cmc.tasks.transitions.
    Illegal transitions return 400; the row is NOT updated.

    Only fields explicitly set in the request body are touched
    (model_dump(exclude_unset=True)).
    """
    row = (
        await db.execute(select(Task).where(Task.id == task_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="task not found")

    updates = payload.model_dump(exclude_unset=True)
    new_status = updates.get("status")
    if new_status is not None and new_status != row.status:
        if not validate_transition(row.status, new_status):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"invalid status transition: {row.status!r} -> {new_status!r}"
                ),
            )

    for k, v in updates.items():
        setattr(row, k, v)
    await db.commit()
    await db.refresh(row)
    return TaskListItem.model_validate(row)


# ---------- TASK-04: DELETE /api/tasks/{id} ----------


@router.delete("/tasks/{task_id}", status_code=204)
async def delete_task(
    task_id: int,
    db: AsyncSession = Depends(get_session),
) -> Response:
    """TASK-04: delete by id. Returns 204 No Content on success, 404 if missing.

    204 chosen over 200+{ok:true} for REST idiom (no body needed; the operation
    is unambiguously the delete).
    """
    row = (
        await db.execute(select(Task).where(Task.id == task_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="task not found")
    await db.delete(row)
    await db.commit()
    return Response(status_code=204)


# ---------- TASK-05: POST /api/tasks/{id}/approve ----------


@router.post("/tasks/{task_id}/approve", response_model=TaskApproveResponse)
async def approve_task(
    task_id: int,
    db: AsyncSession = Depends(get_session),
) -> TaskApproveResponse:
    """TASK-05: flip awaiting_approval -> pending and stamp approved_at.

    400 when the source state is not 'awaiting_approval' — the dashboard
    should never offer the approve button outside that state, but the server
    enforces the invariant defensively.
    """
    row = (
        await db.execute(select(Task).where(Task.id == task_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="task not found")
    if row.status != "awaiting_approval":
        raise HTTPException(status_code=400, detail="task is not awaiting approval")

    now = datetime.now(timezone.utc)
    row.status = "pending"
    row.approved_at = now
    await db.commit()
    return TaskApproveResponse(id=task_id, status="pending", approved_at=now)


# ---------- TASK-06: POST /api/tasks/{id}/rerun ----------


@router.post("/tasks/{task_id}/rerun", response_model=TaskRerunResponse)
async def rerun_task(
    task_id: int,
    db: AsyncSession = Depends(get_session),
) -> TaskRerunResponse:
    """TASK-06: reset failed -> pending and clear run-state columns.

    Cleared on rerun: started_at, ended_at, error_message. `pid` and
    `stdout_path` are intentionally NOT cleared here — the dispatcher (Phase 8)
    will overwrite them on the next run; preserving the previous values gives
    operators a chance to inspect the failed run's logs even after the rerun
    button is clicked.
    """
    row = (
        await db.execute(select(Task).where(Task.id == task_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="task not found")
    if row.status != "failed":
        raise HTTPException(status_code=400, detail="task is not in failed state")

    row.status = "pending"
    row.started_at = None
    row.ended_at = None
    row.error_message = None
    await db.commit()
    return TaskRerunResponse(id=task_id, status="pending")


# ---------- TASK-07: POST /api/dispatcher/trigger ----------


@router.post(
    "/dispatcher/trigger",
    response_model=TaskTriggerResponse,
    status_code=202,
)
async def trigger_dispatcher(request: Request) -> TaskTriggerResponse:
    """TASK-07: spawn a detached one-shot dispatcher run, return its PID.

    No body — the action is parameterless in v1. (TaskTriggerRequest was
    deliberately omitted from Wave 0 — see schemas/tasks.py docstring.)

    202 Accepted because the dispatcher runs ASYNC of this response: by the
    time the JSON returns, the subprocess is already detached (start_new_session=True)
    and FastAPI is no longer the parent for signal-disposition purposes.
    """
    settings = request.app.state.settings
    pid = spawn_dispatcher_oneshot(settings)
    return TaskTriggerResponse(triggered=True, pid=pid)
