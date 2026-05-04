"""Phase 15 Plan 02 — alert engine dispatcher orchestrator.

ALRT-04 + ALRT-12.

Composes the Plan 01 detector primitives + scope extractors into a single
async entrypoint called once per dispatcher heartbeat tick. The engine is a
PURE-DECISION emitter:

  - It writes `decisions` rows with empty `options=[]` (alerts are sensors,
    not actuators — there is no Yes/No to ack).
  - It writes `notification_log` rows with `kind='alert'` so the existing
    notifier oneshot tick picks them up via its kind→formatter table (Plan 03
    wires the formatter for `alert`).
  - It NEVER imports `cmc.dispatcher.tasks` (ALRT-12 invariant). The
    test_alerts_dispatcher.py::test_no_tasks_import AST audit guards this.

Dedup contract (verbatim copy from notifier.py::_claim_and_send and
hitl.py::create_decision):

  - decisions table: partial-unique on `dedup_key` WHERE `status='pending'`,
    enforced via `sqlite_insert(...).on_conflict_do_nothing(...)`. No new
    constraint, no new state machine.
  - notification_log: UNIQUE(kind, entity_id, chat_id), enforced via the
    same on_conflict_do_nothing. No new constraint.

Stable dedup_key: f"alert:{rule_id}:{scope_key}". No timestamps in the key —
re-firing after auto-resolve is handled by deleting the stale notification_log
row on the firing→clear transition (D-03 / Pitfall 5 fix).

Auto-resolve transition (firing→clear):
  UPDATE decisions SET status='answered', answer='auto-resolved',
    answered_by='alert_engine', answered_at=now WHERE dedup_key=:k AND status='pending';
  DELETE FROM notification_log WHERE kind='alert' AND entity_id=:k AND chat_id=:cid;
The DELETE matters because INSERT ON CONFLICT DO NOTHING for the SECOND firing
would silently skip notification if the first firing's row were still around.

Per-rule exception isolation: ALL exceptions raised by detectors / scope
extractors are caught + logged + skipped per-rule. One bad rule (e.g. orphan
metric, corrupt params_json) MUST NOT poison the cycle. Settings are loaded
once at top-of-call so a missing telegram_chat_id degrades gracefully (decisions
still written, notification_log skipped).

Per Plan 01 D-02: ack precedence is checked HERE (dispatcher), not inside the
detector — keeps detector pure-math. If state.acked_until > now, we stamp
last_value/last_evaluated_at and short-circuit before calling the detector.
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime

from sqlalchemy import delete, select, text
from sqlalchemy import update as _upd
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.alerts.detector import (
    AlertSignal,
    evaluate_anomaly,
    evaluate_threshold,
)
from cmc.alerts.scopes import _SCOPE_EXTRACTORS
from cmc.config import load_settings
from cmc.db.models.alert_rules import AlertRule
from cmc.db.models.alert_state import AlertState
from cmc.db.models.decisions import Decision
from cmc.db.models.notification_log import NotificationLog
from cmc.telegram.messages import format_alert

log = logging.getLogger(__name__)


def _utcnow_naive() -> datetime:
    """Naive UTC — matches cost.py / scopes.py / SQLite-stored datetime convention."""
    return datetime.now(UTC).replace(tzinfo=None)


async def _load_or_create_state(
    db: AsyncSession, rule_id: int, scope_key: str, now: datetime
) -> AlertState:
    state = (
        await db.execute(
            select(AlertState).where(
                AlertState.rule_id == rule_id,
                AlertState.scope_key == scope_key,
            )
        )
    ).scalar_one_or_none()
    if state is not None:
        return state
    # Insert with defaults; refresh after commit so the row has its assigned id.
    state = AlertState(
        rule_id=rule_id,
        scope_key=scope_key,
        state="clear",
        last_value=None,
        last_evaluated_at=now,
        fired_at=None,
        cleared_at=None,
        acked_until=None,
        sample_count=0,
    )
    db.add(state)
    await db.commit()
    await db.refresh(state)
    return state


async def _emit_firing(
    db: AsyncSession,
    rule: AlertRule,
    scope_key: str,
    value: float,
    chat_id: str,
    now: datetime,
) -> None:
    """Insert pending decision + notification_log row (both idempotent on conflict).

    Both inserts use ON CONFLICT DO NOTHING — concurrent ticks racing on the
    same dedup_key resolve to ONE row each, mirroring notifier.py::_claim_and_send
    and hitl.py::create_decision verbatim.

    notification_log insert is skipped when chat_id is empty (Telegram disabled);
    decisions row still written so the engine works even without Telegram.
    """
    rule_id = rule.rule_id
    dedup_key = f"alert:{rule_id}:{scope_key}"
    # Plan 02 D-06 follow-through: the decisions.prompt column stores the
    # EXACT plain-text body the user sees in Telegram, so audit trails
    # match user-visible content. format_alert returns (text, kb) — we
    # only persist the text into prompt; the keyboard is rebuilt at send
    # time from the same scope_key (see notifier._send_pending_alerts).
    prompt = format_alert(rule, scope_key, value)[0]

    # Decision: partial-unique on dedup_key WHERE status='pending'.
    dec_stmt = (
        sqlite_insert(Decision)
        .values(
            session_id=None,
            task_id=None,
            dedup_key=dedup_key,
            prompt=prompt,
            options=[],
            status="pending",
            created_at=now,
        )
        .on_conflict_do_nothing(
            index_elements=["dedup_key"],
            index_where=text("status = 'pending'"),
        )
    )
    await db.execute(dec_stmt)
    await db.commit()

    if not chat_id:
        # Telegram disabled — engine still emits decisions but skips the
        # notification_log row that would feed the notifier oneshot tick.
        return

    # notification_log: UNIQUE(kind, entity_id, chat_id).
    nl_stmt = (
        sqlite_insert(NotificationLog)
        .values(
            kind="alert",
            entity_id=dedup_key,
            chat_id=chat_id,
            sent_at=now,
            status="pending",
        )
        .on_conflict_do_nothing(
            index_elements=["kind", "entity_id", "chat_id"]
        )
    )
    await db.execute(nl_stmt)
    await db.commit()


async def _auto_resolve(
    db: AsyncSession, rule_id: int, scope_key: str, chat_id: str, now: datetime
) -> None:
    """firing→clear transition: mark pending decision answered + delete stale notif row.

    Pitfall 5 fix (D-03): without the notification_log delete, a future re-fire's
    INSERT ON CONFLICT DO NOTHING would silently skip notification because the
    stale `pending` (or `sent`) row still occupies the UNIQUE slot.
    """
    dedup_key = f"alert:{rule_id}:{scope_key}"
    await db.execute(
        _upd(Decision)
        .where(Decision.dedup_key == dedup_key, Decision.status == "pending")
        .values(
            status="answered",
            answer="auto-resolved",
            answered_by="alert_engine",
            answered_at=now,
        )
    )
    if chat_id:
        await db.execute(
            delete(NotificationLog).where(
                NotificationLog.kind == "alert",
                NotificationLog.entity_id == dedup_key,
                NotificationLog.chat_id == chat_id,
            )
        )
    await db.commit()


async def evaluate_alerts(db: AsyncSession) -> int:
    """One alert-engine pass over all enabled rules. Returns rules-evaluated count.

    Algorithm (per plan):

      1. SELECT enabled=True rules ORDER BY rule_id.
      2. For each rule:
         a. Look up extractor in _SCOPE_EXTRACTORS — None: log + skip.
         b. Resolve scopes via `await extractor(db, now)` -> {scope_key: value}.
         c. For each (scope_key, value):
            - Load/create alert_state row.
            - Ack precedence (D-02): if acked_until > now, stamp + skip.
            - Dispatch detector by rule.kind.
            - Persist state mutation per signal.
            - Emit decision + notification_log on FIRING.
            - Auto-resolve + delete notification_log on firing→CLEAR.
         d. COMMIT after each rule (so a later-rule failure doesn't roll back state).

    Exception isolation: per-rule try/except + log; the cycle continues.
    """
    settings = load_settings()
    chat_id = str(settings.telegram_chat_id or "")

    rules = (
        await db.execute(
            select(AlertRule)
            .where(AlertRule.enabled.is_(True))
            .order_by(AlertRule.rule_id)
        )
    ).scalars().all()

    evaluated = 0
    for rule in rules:
        evaluated += 1
        try:
            await _evaluate_rule(db, rule, chat_id)
        except Exception:
            log.exception(
                "alert_engine.rule_failed",
                extra={"rule_id": rule.rule_id, "metric": rule.metric},
            )
            # Roll back any partial transaction state from the failing rule
            # so the next rule starts clean.
            try:
                await db.rollback()
            except Exception:
                log.exception("alert_engine.rollback_failed")

    return evaluated


async def _evaluate_rule(
    db: AsyncSession, rule: AlertRule, chat_id: str
) -> None:
    """Evaluate one rule across all its scopes and persist state + emit/resolve.

    Separated for per-rule exception isolation in evaluate_alerts.
    """
    now = _utcnow_naive()
    extractor = _SCOPE_EXTRACTORS.get(rule.metric)
    if extractor is None:
        log.warning(
            "alert_engine.unknown_metric",
            extra={"rule_id": rule.rule_id, "metric": rule.metric},
        )
        return

    scopes = await extractor(db, now)

    for scope_key, value in scopes.items():
        state = await _load_or_create_state(db, rule.rule_id, scope_key, now)

        # Ack precedence (D-02): dispatcher checks, not detector. Stamp last_value
        # so the UI sees fresh telemetry, but skip detector + emit.
        if state.acked_until is not None and state.acked_until > now:
            state.last_value = value
            state.last_evaluated_at = now
            await db.commit()
            continue

        # Anomaly rules need their EWMA dict lifted onto state.params_json
        # in-memory before the detector reads it (D-03 lifts EWMA dict onto
        # AlertState.params_json — schema-clean since alert_state has no such
        # column natively; the dispatcher carries it as an attribute).
        if rule.kind == "anomaly":
            try:
                # Pull persisted EWMA dict from rule.params_json's mirror on state
                # if previously written; default empty.
                pj = getattr(state, "params_json", None) or {}
                # Use object.__setattr__ to bypass SQLModel strict mode (the column
                # doesn't exist on AlertState; this is a transient in-memory dict).
                object.__setattr__(state, "params_json", pj)
            except Exception:
                object.__setattr__(state, "params_json", {})

        # Dispatch by kind.
        try:
            if rule.kind == "threshold":
                signal = evaluate_threshold(rule, value, state, now=now)
            elif rule.kind == "anomaly":
                signal, ewma = evaluate_anomaly(rule, value, state, now=now)
                # Persist the EWMA recurrence outputs back onto state.
                # sample_count is a real column; ewma_mean/ewma_var live in
                # params_json on the *next* read — but since alert_state has
                # no params_json column, we only persist sample_count here.
                # When v1.2 adds an alert_state.params_json column, this is the
                # one-line change.
                state.sample_count = int(ewma.get("sample_count", 0))
            else:
                log.warning(
                    "alert_engine.unknown_kind",
                    extra={"rule_id": rule.rule_id, "kind": rule.kind},
                )
                continue
        except Exception:
            log.exception(
                "alert_engine.detector_failed",
                extra={
                    "rule_id": rule.rule_id,
                    "scope_key": scope_key,
                    "kind": rule.kind,
                },
            )
            continue

        # Persist state mutation per signal.
        prior_state = state.state

        # min_dwell=0 fast path: detector returns PENDING_FIRE on the FIRST
        # crossing because state.fired_at is None — but the user's intent with
        # min_dwell_seconds=0 is "fire immediately on first crossing". Promote
        # PENDING_FIRE → FIRING here, stamping fired_at synthetically so the
        # FIRING branch's persistence is coherent. This keeps the detector
        # pure-math (it never mutates state) while honoring the "0 dwell" UX.
        if (
            signal == AlertSignal.PENDING_FIRE
            and rule.min_dwell_seconds == 0
            and state.fired_at is None
        ):
            state.fired_at = now
            signal = AlertSignal.FIRING

        if signal == AlertSignal.FIRING:
            if prior_state == "firing":
                # Re-emit after cooldown. Stamp re-emit time.
                state.fired_at = now
            else:
                state.state = "firing"
                state.fired_at = state.fired_at or now
                state.cleared_at = None
            state.last_value = value
            state.last_evaluated_at = now
            await db.commit()
            await _emit_firing(db, rule, scope_key, value, chat_id, now)

        elif signal == AlertSignal.PENDING_FIRE:
            # Stamp the candidate time; no emit. Detector reads fired_at to
            # measure dwell elapsed.
            state.fired_at = state.fired_at or now
            state.last_value = value
            state.last_evaluated_at = now
            await db.commit()

        elif signal == AlertSignal.HOLD:
            state.last_value = value
            state.last_evaluated_at = now
            await db.commit()

        elif signal == AlertSignal.CLEAR:
            if prior_state == "firing":
                # Auto-resolve transition.
                state.state = "clear"
                state.cleared_at = now
                state.fired_at = None
                state.last_value = value
                state.last_evaluated_at = now
                await db.commit()
                await _auto_resolve(
                    db, rule.rule_id, scope_key, chat_id, now
                )
            else:
                # Idle clear — telemetry only.
                state.state = "clear"
                state.last_value = value
                state.last_evaluated_at = now
                # Reset fired_at if we previously stamped a candidate
                # (PENDING_FIRE→CLEAR rollback).
                state.fired_at = None
                await db.commit()

        elif signal == AlertSignal.INSUFFICIENT:
            state.state = "insufficient_data"
            state.last_value = value
            state.last_evaluated_at = now
            await db.commit()

        else:
            # Unknown signal — defensive no-op.
            log.warning(
                "alert_engine.unknown_signal",
                extra={"rule_id": rule.rule_id, "signal": str(signal)},
            )
