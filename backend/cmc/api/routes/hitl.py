"""HITL router — HITL-01..07 (decisions + inbox).

Combined into a single router because both resources share the queue-writer
dependency from cmc.core.queue and the same trust boundary (localhost-only,
Pydantic-validated bodies).

Seven endpoints under /api:
  GET    /decisions                          — HITL-01 list (status filter)
  POST   /decisions                          — HITL-02 create (INSERT OR IGNORE
                                                on partial-unique dedup_key
                                                WHERE status='pending')
  POST   /decisions/{decision_id}/answer     — HITL-03 file-then-DB answer
  GET    /inbox                              — HITL-04 list (unread / max_age_days)
  POST   /inbox                              — HITL-05 create
  POST   /inbox/{inbox_id}/read              — HITL-06 idempotent mark-read
  POST   /inbox/{inbox_id}/reply             — HITL-07 file-then-DB reply

Pitfall 1 — file-then-DB ordering invariant
  HITL-03 and HITL-07 write the JSONL queue line FIRST, then issue the DB
  UPDATE. If the file write raises (FS full, EPERM, etc.), the DB UPDATE
  never happens, so the dispatcher (Phase 8) can safely resend. The reverse
  order is the bug pattern: a successful DB UPDATE followed by a failed file
  write would mark a decision answered with no queue record for downstream
  consumers.

Queue path layout (cmc.core.queue is the single source of truth):
  repo_root() / .tmp/mission-control-queue/decisions/{decision_id}.jsonl
  repo_root() / .tmp/mission-control-queue/inbox/{inbox_id}.jsonl

Pitfall 6 — partial-unique conflict refetch
  When the SQLite ON CONFLICT DO NOTHING path elides the insert, .returning()
  yields no row. The fallback SELECT MUST include `status='pending'` in its
  WHERE clause to land on the live row (the partial-unique scope) — without
  it, an answered row with the same dedup_key would shadow the pending one.

Error contract — the app HTTPException handler emits {error: detail}, NOT
the FastAPI default {detail: ...}. See STATE.md Plan 03-03 note.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select, text
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.api.schemas.hitl import (
    DecisionAnswerRequest,
    DecisionAnswerResponse,
    DecisionCreate,
    DecisionListItem,
    DecisionListResponse,
    InboxCreate,
    InboxListItem,
    InboxListResponse,
    InboxReadResponse,
    InboxReplyRequest,
    InboxReplyResponse,
)
from cmc.core.queue import write_decision_answer, write_inbox_reply
from cmc.db import get_session
from cmc.db.models.decisions import Decision
from cmc.db.models.inbox import InboxMessage

router = APIRouter(tags=["hitl"])


# ---------- Decisions (HITL-01..03) ----------


@router.get("/decisions", response_model=DecisionListResponse)
async def list_decisions(
    db: AsyncSession = Depends(get_session),
    status_: Optional[Literal["pending", "answered"]] = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> DecisionListResponse:
    """HITL-01: paginated decision list, optionally filtered by status."""
    q = select(Decision)
    c = select(func.count(Decision.id))
    if status_ is not None:
        q = q.where(Decision.status == status_)
        c = c.where(Decision.status == status_)
    q = q.order_by(Decision.created_at.desc()).limit(limit).offset(offset)
    rows = (await db.execute(q)).scalars().all()
    total = (await db.execute(c)).scalar_one()
    items = [DecisionListItem.model_validate(r) for r in rows]
    return DecisionListResponse(items=items, total=total)


@router.post(
    "/decisions",
    response_model=DecisionListItem,
    status_code=201,
)
async def create_decision(
    payload: DecisionCreate,
    response: Response,
    db: AsyncSession = Depends(get_session),
) -> DecisionListItem:
    """HITL-02: INSERT OR IGNORE on partial-unique dedup_key WHERE status='pending'.

    Returns:
      - 201 + new row when the insert lands.
      - 200 + the existing pending row when a same-dedup-key pending row already
        exists (the partial-unique conflict). Same dedup_key after answer is OK
        because the partial-unique scope is `status='pending'` only.
    """
    stmt = (
        sqlite_insert(Decision)
        .values(
            session_id=payload.session_id,
            task_id=payload.task_id,
            dedup_key=payload.dedup_key,
            prompt=payload.prompt,
            options=payload.options,
            status="pending",
            created_at=datetime.now(timezone.utc),
        )
        .on_conflict_do_nothing(
            index_elements=["dedup_key"],
            index_where=text("status = 'pending'"),
        )
        .returning(Decision)
    )
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if row is None:
        # Conflict: the partial-unique index suppressed the INSERT.
        # Pitfall 6: MUST scope to status='pending' or an answered row could shadow.
        existing = (
            await db.execute(
                select(Decision).where(
                    Decision.dedup_key == payload.dedup_key,
                    Decision.status == "pending",
                )
            )
        ).scalar_one()
        await db.commit()
        response.status_code = 200
        return DecisionListItem.model_validate(existing)
    await db.commit()
    return DecisionListItem.model_validate(row)


@router.post(
    "/decisions/{decision_id}/answer",
    response_model=DecisionAnswerResponse,
)
async def answer_decision(
    decision_id: int,
    payload: DecisionAnswerRequest,
    db: AsyncSession = Depends(get_session),
) -> DecisionAnswerResponse:
    """HITL-03: append answer to queue file FIRST, then UPDATE the DB row.

    File-then-DB ordering (Pitfall 1): if the queue write raises, the DB row
    stays in `pending` so the dispatcher can resend.
    """
    row = (
        await db.execute(select(Decision).where(Decision.id == decision_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="decision not found")
    if row.status == "answered":
        raise HTTPException(status_code=409, detail="decision already answered")

    # File FIRST — if this raises, no DB update happens.
    queue_path = write_decision_answer(
        decision_id, payload.answer, payload.answered_by
    )

    row.status = "answered"
    row.answer = payload.answer
    row.answered_at = datetime.now(timezone.utc)
    row.answered_by = payload.answered_by
    await db.commit()
    return DecisionAnswerResponse(
        answered=True,
        decision_id=decision_id,
        queue_path=str(queue_path),
    )


# ---------- Inbox (HITL-04..07) ----------


@router.get("/inbox", response_model=InboxListResponse)
async def list_inbox(
    db: AsyncSession = Depends(get_session),
    unread: bool = Query(False),
    max_age_days: Optional[int] = Query(None, ge=1, le=365),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> InboxListResponse:
    """HITL-04: paginated inbox list, optionally filtered by unread + max_age_days."""
    q = select(InboxMessage)
    c = select(func.count(InboxMessage.id))
    if unread:
        q = q.where(InboxMessage.read == False)  # noqa: E712
        c = c.where(InboxMessage.read == False)  # noqa: E712
    if max_age_days is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
        q = q.where(InboxMessage.created_at >= cutoff)
        c = c.where(InboxMessage.created_at >= cutoff)
    q = q.order_by(InboxMessage.created_at.desc()).limit(limit).offset(offset)
    rows = (await db.execute(q)).scalars().all()
    total = (await db.execute(c)).scalar_one()
    items = [InboxListItem.model_validate(r) for r in rows]
    return InboxListResponse(items=items, total=total)


@router.post(
    "/inbox",
    response_model=InboxListItem,
    status_code=201,
)
async def create_inbox(
    payload: InboxCreate,
    db: AsyncSession = Depends(get_session),
) -> InboxListItem:
    """HITL-05: plain INSERT — return 201 + the created row."""
    m = InboxMessage(
        session_id=payload.session_id,
        task_id=payload.task_id,
        subject=payload.subject,
        body=payload.body,
        created_at=datetime.now(timezone.utc),
    )
    db.add(m)
    await db.commit()
    await db.refresh(m)
    return InboxListItem.model_validate(m)


@router.post(
    "/inbox/{inbox_id}/read",
    response_model=InboxReadResponse,
)
async def mark_inbox_read(
    inbox_id: int,
    db: AsyncSession = Depends(get_session),
) -> InboxReadResponse:
    """HITL-06: idempotent mark-read.

    First call stamps `read=True, read_at=now`. Subsequent calls return the
    SAME read_at — no DB write on the second call (idempotency requires
    stable response).
    """
    row = (
        await db.execute(select(InboxMessage).where(InboxMessage.id == inbox_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="inbox message not found")
    if not row.read:
        row.read = True
        row.read_at = datetime.now(timezone.utc)
        await db.commit()
    return InboxReadResponse(id=inbox_id, read=True, read_at=row.read_at)


@router.post(
    "/inbox/{inbox_id}/reply",
    response_model=InboxReplyResponse,
)
async def reply_inbox(
    inbox_id: int,
    payload: InboxReplyRequest,
    db: AsyncSession = Depends(get_session),
) -> InboxReplyResponse:
    """HITL-07: append reply to queue file FIRST, then UPDATE the DB row.

    File-then-DB ordering (Pitfall 1) mirrors HITL-03. Phase 8 dispatcher
    consumes .tmp/mission-control-queue/inbox/{id}.jsonl.
    """
    row = (
        await db.execute(select(InboxMessage).where(InboxMessage.id == inbox_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="inbox message not found")

    # File FIRST.
    queue_path = write_inbox_reply(inbox_id, payload.reply)

    row.reply = payload.reply
    row.replied_at = datetime.now(timezone.utc)
    await db.commit()
    return InboxReplyResponse(
        replied=True,
        inbox_id=inbox_id,
        queue_path=str(queue_path),
    )
