"""TELE-02 + TELE-04: 30s notifier loop.

Pitfall P6: dedup uses INSERT ON CONFLICT DO NOTHING (atomic) — never
SELECT-then-INSERT (races would double-send).
Pitfall P3: messages.py only produces plain text; api.send_message has
no parse_mode arg.
Pitfall P5: stamp_tick wrapped in try/finally so SAPI-04 sees liveness.
"""

import logging
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any

import httpx
from sqlalchemy import and_, delete, or_, select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.config import Settings
from cmc.db.models.alert_rules import AlertRule
from cmc.db.models.alert_state import AlertState
from cmc.db.models.decisions import Decision
from cmc.db.models.notification_log import NotificationLog
from cmc.db.models.schedules import Schedule
from cmc.db.models.system_state import SystemState
from cmc.db.models.tasks import Task
from cmc.telegram import api, messages

log = logging.getLogger(__name__)

OVERDUE_GRACE_MINUTES = 5
DECISION_LOOKBACK_HOURS = 24

# HTTP-symmetric inbox discovery mirrors handler.py.
LOCAL_API = "http://127.0.0.1:8765"


async def stamp_tick(sessions) -> None:
    """Upsert system_state.telegram_last_tick_at = now isoformat (Pitfall P5)."""
    now = datetime.now(UTC)
    async with sessions() as db:
        await db.execute(
            sqlite_insert(SystemState)
            .values(
                key="telegram_last_tick_at",
                value=now.isoformat(),
                updated_at=now,
            )
            .on_conflict_do_update(
                index_elements=["key"],
                set_={"value": now.isoformat(), "updated_at": now},
            )
        )
        await db.commit()


async def cleanup_rerun_failures(db: AsyncSession) -> int:
    """Delete kind=failure rows for tasks that have left 'failed' state (rerun started).

    Without this, a SECOND failure for the same task id collides with the
    existing UNIQUE row and gets dropped -> no re-notify.
    Notifier-side housekeeping (NOT in tasks router) so the design lives next to
    the code that observes the staleness.
    """
    rows = (
        await db.execute(
            select(NotificationLog.id, NotificationLog.entity_id)
            .where(NotificationLog.kind == "failure")
            .where(NotificationLog.status == "sent")
        )
    ).all()
    stale: list[int] = []
    for nid, entity_id in rows:
        try:
            tid = int(entity_id)
        except (TypeError, ValueError):
            continue
        task = (
            await db.execute(select(Task).where(Task.id == tid))
        ).scalar_one_or_none()
        # Only delete if task currently NOT in failed state (rerun started or done).
        if task and task.status in ("running", "pending", "done"):
            stale.append(nid)
    if stale:
        await db.execute(
            delete(NotificationLog).where(NotificationLog.id.in_(stale))
        )
        await db.commit()
    return len(stale)


async def _fetch_unread_inbox(
    http_client: httpx.AsyncClient | None,
) -> list[Any]:
    """GET /api/inbox?unread=true. Replaces the direct InboxMessage SELECT for
    HTTP symmetry — the notifier becomes a pure HTTP consumer of inbox state,
    mirroring the dispatcher's "API state via API, never direct DB" pattern.

    Returns a list of attribute-accessible objects (SimpleNamespace) shaped
    like InboxListItem dicts, consumable by _FORMATTER['inbox']
    (messages.format_inbox uses getattr/.id/.body/etc).

    Empty list on HTTP failure (server down, network blip, non-2xx) —
    graceful degrade keeps notifier failures from blocking other candidates.
    """
    if http_client is None:
        # Notifier must always have a client for HTTP discovery in production
        # (run_one_cycle constructs one when caller doesn't pass it). Returning
        # [] preserves graceful degradation.
        return []
    try:
        r = await http_client.get(
            f"{LOCAL_API}/api/inbox",
            params={"unread": "true", "limit": 200},
        )
        r.raise_for_status()
        items = r.json().get("items", [])
        # Wrap dicts in SimpleNamespace so _FORMATTER['inbox'] can attribute-
        # access them (format_inbox uses .id / .body / getattr fallbacks).
        from types import SimpleNamespace
        return [SimpleNamespace(**item) for item in items]
    except Exception as exc:
        log.warning(
            "notifier.inbox_fetch_failed",
            extra={"err": str(exc)},
        )
        return []


async def _gather_candidates(
    db: AsyncSession,
    now: datetime,
    http_client: httpx.AsyncClient | None = None,
) -> dict[str, list[Any]]:
    """Returns {kind: [rows]} dict. No filtering against notification_log yet.

    Inbox kind is fetched via HTTP (GET /api/inbox?unread=true) instead of a
    direct ORM SELECT. http_client is passed through from run_one_cycle.
    """
    decisions = (
        await db.execute(
            select(Decision)
            .where(Decision.status == "pending")
            .where(
                Decision.created_at
                >= now - timedelta(hours=DECISION_LOOKBACK_HOURS)
            )
        )
    ).scalars().all()

    approvals = (
        await db.execute(select(Task).where(Task.status == "awaiting_approval"))
    ).scalars().all()

    failures = (
        await db.execute(select(Task).where(Task.status == "failed"))
    ).scalars().all()

    overdue = (
        await db.execute(
            select(Schedule)
            .where(Schedule.enabled == True)  # noqa: E712
            .where(
                Schedule.next_run_at
                < now - timedelta(minutes=OVERDUE_GRACE_MINUTES)
            )
        )
    ).scalars().all()

    # Inbox via HTTP, not direct ORM SELECT. Mirrors the dispatcher pattern of
    # "API state via API". Graceful degrade on server-down is handled by
    # _fetch_unread_inbox.
    inbox = await _fetch_unread_inbox(http_client)

    return {
        "decision": list(decisions),
        "approval": list(approvals),
        "failure": list(failures),
        "overdue_schedule": list(overdue),
        "inbox": list(inbox),
    }


async def _filter_blocked(
    db: AsyncSession,
    kind: str,
    entity_ids: list[str],
    chat_id: str,
    now: datetime,
) -> set[str]:
    """Return entity_ids that already have an ACTIVE notif row (blocks re-send).

    Active = status='sent' (always blocks) OR (status='snoozed' AND
    snoozed_until > now). A snoozed-and-expired row does NOT block — that lets
    re-notification fire after the snooze window closes.
    """
    if not entity_ids:
        return set()
    rows = (
        await db.execute(
            select(NotificationLog.entity_id)
            .where(NotificationLog.kind == kind)
            .where(NotificationLog.chat_id == chat_id)
            .where(NotificationLog.entity_id.in_(entity_ids))
            .where(
                or_(
                    NotificationLog.status == "sent",
                    and_(
                        NotificationLog.status == "snoozed",
                        NotificationLog.snoozed_until > now,
                    ),
                )
            )
        )
    ).scalars().all()
    return {str(r) for r in rows}


def _alert_formatter_adapter(candidate) -> tuple[str, dict[str, Any] | None]:
    """Adapter: SimpleNamespace(rule, scope_key, last_value) → format_alert.

    The _FORMATTER table contract is `(candidate) -> tuple[str, dict|None]`.
    Plan 03's format_alert takes (rule, scope_key, value), so we synthesize a
    namespace in `_send_pending_alerts` and unwrap here. Defaults `last_value`
    to 0.0 if the AlertState row carries None (e.g. fresh row, unusual but
    not impossible — keep formatter total over the input domain).
    """
    return messages.format_alert(
        candidate.rule, candidate.scope_key, candidate.last_value or 0.0
    )


_FORMATTER = {
    "decision": messages.format_decision,
    "approval": messages.format_approval,
    "failure": messages.format_failure,
    "overdue_schedule": messages.format_overdue,
    "inbox": messages.format_inbox,
    "alert": _alert_formatter_adapter,        # Phase 15 Plan 03 (ALRT-08)
}


def _parse_alert_dedup_key(entity_id: str) -> tuple[int, str] | None:
    """Parse 'alert:{rule_id}:{scope_key}' → (rule_id, scope_key) or None.

    scope_key may itself contain ':' (e.g. 'model:claude-opus-4-7'), so we
    split with maxsplit=2. Defensive: returns None on malformed input so the
    sweep's per-row try-block can mark the row failed without crashing the
    cycle (Plan 02's verbatim "per-row exception isolation" pattern).
    """
    parts = entity_id.split(":", 2)
    if len(parts) < 3 or parts[0] != "alert":
        return None
    try:
        rule_id = int(parts[1])
    except ValueError:
        return None
    return rule_id, parts[2]


async def _claim_and_send(
    db: AsyncSession,
    kind: str,
    candidate,
    chat_id: str,
    token: str,
    now: datetime,
    http_client: httpx.AsyncClient | None,
) -> bool:
    """Atomic INSERT-OR-IGNORE → send → status writeback. Returns True if sent.

    Pitfall P6: rowcount==0 means another concurrent tick won the slot
    (shouldn't happen in a single-process oneshot, but the contract is the
    same so we honor it).
    """
    entity_id = str(candidate.id)
    stmt = (
        sqlite_insert(NotificationLog)
        .values(
            kind=kind,
            entity_id=entity_id,
            chat_id=chat_id,
            sent_at=now,
            status="pending",
        )
        .on_conflict_do_nothing(
            index_elements=["kind", "entity_id", "chat_id"]
        )
    )
    result = await db.execute(stmt)
    await db.commit()
    if (result.rowcount or 0) == 0:
        return False  # raced; another tick won the slot
    # We own the slot. Format + send.
    text, kb = _FORMATTER[kind](candidate)
    try:
        sent = await api.send_message(
            token, chat_id, text, reply_markup=kb, client=http_client
        )
    except Exception as exc:
        log.error(
            "notifier.send_failed",
            extra={"kind": kind, "entity_id": entity_id, "err": str(exc)},
        )
        await db.execute(
            NotificationLog.__table__.update()
            .where(
                (NotificationLog.kind == kind)
                & (NotificationLog.entity_id == entity_id)
                & (NotificationLog.chat_id == chat_id)
            )
            .values(status="failed")
        )
        await db.commit()
        return False
    await db.execute(
        NotificationLog.__table__.update()
        .where(
            (NotificationLog.kind == kind)
            & (NotificationLog.entity_id == entity_id)
            & (NotificationLog.chat_id == chat_id)
        )
        .values(
            status="sent",
            message_id=str(sent.get("message_id") or ""),
        )
    )
    await db.commit()
    return True


async def _send_pending_alerts(
    sessions,
    settings: Settings,
    token: str,
    http_client: httpx.AsyncClient | None,
) -> int:
    """Phase 15 Plan 03 (ALRT-08) — sweep notification_log kind='alert' status='pending'.

    Wiring decision Option A (per Plan 03 docstring):
      Plan 02's evaluate_alerts INSERTs the notification_log row at FIRING
      time with status='pending' (the row IS the dedup claim — Pitfall 7).
      The notifier just picks it up here. We do NOT re-insert; we own only
      the format + send + status writeback.

    Reconstruction: dedup_key = 'alert:{rule_id}:{scope_key}'. Parse with
    maxsplit=2 because scope_key itself can contain ':' (e.g. 'model:foo').
    Load the matching AlertRule + AlertState — if either is missing (orphan
    row from a deleted rule), mark the notification_log row 'failed' so the
    sweep doesn't loop on it forever.

    Each row is processed in its OWN session (mirrors notifier convention —
    other per-kind sweeps commit per-row inside the calling run_one_cycle's
    `async with sessions() as db`, but the alert sweep takes ownership of
    the session lifecycle to keep its lookups (rule + state load, then row
    update) inside one transactional context per row).

    Returns the count of successful sends (status='sent' rows).
    """
    chat_id = str(settings.telegram_chat_id or "")
    if not chat_id:
        # Plan 02 already skips the notification_log insert when chat_id is
        # empty, so there's nothing to sweep — but defensive in case a row
        # was inserted from a different code path.
        return 0

    sent_count = 0
    async with sessions() as db:
        rows = (
            await db.execute(
                select(NotificationLog).where(
                    NotificationLog.kind == "alert",
                    NotificationLog.chat_id == chat_id,
                    NotificationLog.status == "pending",
                )
            )
        ).scalars().all()

    for nl in rows:
        async with sessions() as db:
            # Re-fetch under this session so we can mutate + commit cleanly.
            row = (
                await db.execute(
                    select(NotificationLog).where(NotificationLog.id == nl.id)
                )
            ).scalar_one_or_none()
            if row is None or row.status != "pending":
                # Concurrently swept by another tick (oneshot is single-process,
                # but the contract is the same as other _claim_and_send paths).
                continue

            parsed = _parse_alert_dedup_key(row.entity_id)
            if parsed is None:
                log.warning(
                    "notifier.alert_unparseable_dedup_key",
                    extra={"entity_id": row.entity_id},
                )
                row.status = "failed"
                await db.commit()
                continue
            rule_id, scope_key = parsed

            rule = (
                await db.execute(
                    select(AlertRule).where(AlertRule.rule_id == rule_id)
                )
            ).scalar_one_or_none()
            state = (
                await db.execute(
                    select(AlertState).where(
                        AlertState.rule_id == rule_id,
                        AlertState.scope_key == scope_key,
                    )
                )
            ).scalar_one_or_none()

            if rule is None or state is None:
                # Orphan row — rule or state was deleted between Plan 02's
                # insert + this sweep. Mark failed so the sweep moves on and
                # the loop survives.
                log.warning(
                    "notifier.alert_orphan",
                    extra={
                        "rule_id": rule_id,
                        "scope_key": scope_key,
                        "rule_present": rule is not None,
                        "state_present": state is not None,
                    },
                )
                row.status = "failed"
                await db.commit()
                continue

            candidate = SimpleNamespace(
                rule=rule, scope_key=scope_key, last_value=state.last_value
            )
            text, kb = _FORMATTER["alert"](candidate)

            try:
                resp = await api.send_message(
                    token, chat_id, text, reply_markup=kb, client=http_client
                )
            except Exception as exc:
                log.error(
                    "notifier.alert_send_failed",
                    extra={"entity_id": row.entity_id, "err": str(exc)},
                )
                row.status = "failed"
                await db.commit()
                continue

            row.status = "sent"
            row.message_id = str(resp.get("message_id") or "")
            await db.commit()
            sent_count += 1

    return sent_count


async def run_one_cycle(
    sessions,
    settings: Settings,
    *,
    http_client: httpx.AsyncClient | None = None,
) -> int:
    """One launchd-driven notifier tick. Returns count of notifications sent.

    Pitfall P5: stamp_tick runs BEFORE the no-op early return so liveness
    is observable even when telegram is disabled.
    """
    # Pitfall P5: stamp tick first so SAPI-04 sees liveness even on early return.
    await stamp_tick(sessions)

    if not settings.telegram_bot_token or not settings.telegram_chat_id:
        log.info(
            "notifier.disabled — telegram_bot_token or telegram_chat_id unset"
        )
        return 0

    token = settings.telegram_bot_token
    chat_id = settings.telegram_chat_id

    sent_count = 0
    now = datetime.now(UTC)
    async with sessions() as db:
        # Rerun cleanup BEFORE candidate scan so a second failure can notify.
        await cleanup_rerun_failures(db)

        candidates = await _gather_candidates(db, now, http_client=http_client)
        for kind in (
            "decision",
            "approval",
            "failure",
            "overdue_schedule",
            "inbox",
        ):
            rows = candidates[kind]
            if not rows:
                continue
            blocked = await _filter_blocked(
                db, kind, [str(r.id) for r in rows], chat_id, now
            )
            for r in rows:
                if str(r.id) in blocked:
                    continue
                ok = await _claim_and_send(
                    db, kind, r, chat_id, token, now, http_client
                )
                if ok:
                    sent_count += 1

    # Phase 15 Plan 03 — alert kind sweep.
    # Plan 02's evaluate_alerts already INSERTs notification_log rows with
    # status='pending' (the row IS the dedup claim — Pitfall 7). Here we just
    # pick them up + format + send + writeback. _send_pending_alerts owns its
    # own session lifecycle per-row to keep its rule + state lookups inside
    # one transactional context, mirroring the per-rule isolation in
    # cmc/dispatcher/alerts.py.
    sent_count += await _send_pending_alerts(
        sessions, settings, token, http_client
    )

    log.info("notifier.cycle_complete", extra={"sent": sent_count})
    return sent_count
