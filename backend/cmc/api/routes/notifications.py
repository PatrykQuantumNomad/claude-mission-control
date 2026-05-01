"""TELE-04 backend support: list + snooze notification_log rows.

Three endpoints under /api/notifications:
  GET    /notifications                       — list (kind filter, limit cap 500)
  PATCH  /notifications/{notification_id}/snooze
                                              — set snoozed_until = now + duration
  GET    /notifications/_resolve/{kind}/{entity_id}?chat_id=...
                                              — handler lookup helper

The /_resolve indirection exists because Telegram callback_data is capped at
64 bytes — the notifier doesn't have room to embed the integer notif_id in
the callback. Instead, the snooze button encodes (kind, entity_id) and the
handler GETs /_resolve to find the matching notif_id, then PATCHes /snooze.
The (kind, entity_id, chat_id) triple maps to a unique row via the
notification_log UNIQUE constraint.

Duration whitelist (Q7 = single 30m for v1; the table is wider so tests can
exercise alternates without code change):
  15m / 30m / 1h / 4h
"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.db import get_session
from cmc.db.models.notification_log import NotificationLog

router = APIRouter(prefix="/notifications", tags=["notifications"])

_DURATION_TABLE = {"15m": 15, "30m": 30, "1h": 60, "4h": 240}


def _row_to_dict(r: NotificationLog) -> dict:
    return {
        "id": r.id,
        "kind": r.kind,
        "entity_id": r.entity_id,
        "chat_id": r.chat_id,
        "message_id": r.message_id,
        "sent_at": r.sent_at.isoformat() if r.sent_at else None,
        "snoozed_until": r.snoozed_until.isoformat() if r.snoozed_until else None,
        "status": r.status,
    }


@router.get("")
async def list_notifications(
    kind: str | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """List recent notification_log rows ordered by sent_at DESC.

    Optional `kind` filter narrows to a single notification kind
    (decision / approval / failure / overdue_schedule / inbox).
    """
    q = select(NotificationLog).order_by(desc(NotificationLog.sent_at)).limit(limit)
    if kind:
        q = q.where(NotificationLog.kind == kind)
    rows = (await db.execute(q)).scalars().all()
    return {"notifications": [_row_to_dict(r) for r in rows]}


@router.patch("/{notification_id}/snooze")
async def snooze_notification(
    notification_id: int,
    duration: str = Query("30m"),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """Set snoozed_until = now + duration, status='snoozed'."""
    if duration not in _DURATION_TABLE:
        raise HTTPException(
            status_code=400,
            detail=f"duration must be one of {list(_DURATION_TABLE)}",
        )
    row = (
        await db.execute(
            select(NotificationLog).where(NotificationLog.id == notification_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="notification not found")
    until = datetime.now(UTC) + timedelta(minutes=_DURATION_TABLE[duration])
    row.snoozed_until = until
    row.status = "snoozed"
    await db.commit()
    return {
        "id": row.id,
        "snoozed_until": until.isoformat(),
        "status": "snoozed",
    }


@router.get("/_resolve/{kind}/{entity_id}")
async def resolve_notification(
    kind: str,
    entity_id: str,
    chat_id: str | None = Query(None),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """Handler lookup helper for snooze callbacks.

    Given (kind, entity_id, chat_id) returns the most-recent matching
    notification_log row's id so the handler can PATCH /snooze without
    overflowing Telegram's 64-byte callback_data cap.
    """
    q = select(NotificationLog).where(
        (NotificationLog.kind == kind) & (NotificationLog.entity_id == entity_id)
    )
    if chat_id:
        q = q.where(NotificationLog.chat_id == chat_id)
    q = q.order_by(desc(NotificationLog.sent_at)).limit(1)
    row = (await db.execute(q)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="no matching notification")
    return {"id": row.id, "kind": row.kind, "entity_id": row.entity_id}
