"""Plain-text Telegram formatters. NO MarkdownV2 (Pitfall P3).

Each formatter returns a `(text, reply_markup_dict_or_None)` tuple. The
reply_markup follows Telegram's inline_keyboard contract — a 2D array of
`{text, callback_data}` dicts. callback_data is capped at 64 bytes by
Telegram, hence the verb:arg:arg:arg compact encoding consumed by
cmc.telegram.dash_router.

ALRT-11 invariant: NEVER add a `parse_mode` argument to api.send_message
nor to any reply_markup dict produced here. Phase 9-01 enforces a grep
guard on this module; Plan 03 added the alert formatter under the same
contract.
"""

import hashlib
from typing import Any

from cmc.telegram.callback_verbs import CallbackVerb


def _kb(rows: list[list[tuple[str, str]]]) -> dict[str, Any]:
    """Build inline_keyboard payload from [[(label, callback_data), ...], ...]."""
    return {
        "inline_keyboard": [
            [{"text": label, "callback_data": data} for (label, data) in row]
            for row in rows
        ]
    }


def format_decision(decision_row) -> tuple[str, dict[str, Any]]:
    """Decision prompt + Yes/No/Snooze buttons."""
    text = (
        f"❓ Decision needed (#{decision_row.id})\n\n"
        f"{decision_row.prompt}\n\n"
        f"Session: {decision_row.session_id or 'unknown'}"
    )
    kb = _kb([
        [
            ("✅ Yes", f"answer_decision:{decision_row.id}:yes"),
            ("❌ No", f"answer_decision:{decision_row.id}:no"),
        ],
        [("⏰ Snooze 30m", f"snooze:decision:{decision_row.id}:30m")],
    ])
    return text, kb


def format_failure(task_row) -> tuple[str, dict[str, Any]]:
    """Task-failed notification + Rerun/Snooze buttons."""
    err = (task_row.error_message or "unknown")[:500]
    text = (
        f"💥 Task failed (#{task_row.id})\n\n"
        f"{task_row.title}\n\n"
        f"Error: {err}"
    )
    kb = _kb([
        [("🔄 Rerun", f"rerun_task:{task_row.id}")],
        [("⏰ Snooze 30m", f"snooze:failure:{task_row.id}:30m")],
    ])
    return text, kb


def format_overdue(schedule_row) -> tuple[str, dict[str, Any]]:
    """Overdue-schedule notification + Snooze button."""
    text = (
        f"⏰ Schedule overdue (#{schedule_row.id})\n\n"
        f"{schedule_row.name}\n"
        f"Cron: {schedule_row.cron}"
    )
    kb = _kb([
        [("⏰ Snooze 30m", f"snooze:overdue_schedule:{schedule_row.id}:30m")],
    ])
    return text, kb


def format_inbox(inbox_row) -> tuple[str, dict[str, Any]]:
    """Inbox-prompt notification + Reply/Snooze buttons.

    Inbox rows use `body` for the message text; some callers may pass rows
    with `prompt` instead. Tolerate both via getattr fallback.
    """
    body = getattr(inbox_row, "prompt", None) or getattr(inbox_row, "body", "") or ""
    text = (
        f"📨 Inbox prompt (#{inbox_row.id})\n\n"
        f"{body[:500]}"
    )
    kb = _kb([
        [("💬 Reply", f"reply_inbox:{inbox_row.id}")],
        [("⏰ Snooze 30m", f"snooze:inbox:{inbox_row.id}:30m")],
    ])
    return text, kb


def format_approval(task_row) -> tuple[str, dict[str, Any]]:
    """Approval-requested notification + Approve/Reject buttons."""
    text = (
        f"🔐 Approval requested (#{task_row.id})\n\n"
        f"{task_row.title}\n\n"
        f"Risk: {task_row.risk or 'unknown'}"
    )
    kb = _kb([
        [
            ("✅ Approve", f"approve_task:{task_row.id}"),
            ("🛑 Reject", f"reject_task:{task_row.id}"),
        ],
    ])
    return text, kb


def format_test() -> tuple[str, dict[str, Any] | None]:
    """Wizard hello-world. No buttons — just a sanity check."""
    return "👋 Mission Control connected", None


def format_alert(rule, scope_key: str, value: float) -> tuple[str, dict[str, Any]]:
    """Phase 15 ALRT-08 — plain-text alert composition + single Ack 1h button.

    Args:
        rule: AlertRule ORM row (rule_id / name / metric / threshold_fire).
        scope_key: full scope_key string (e.g. "model:claude-opus-4-7" or
            "<global>" for whole-system rules).
        value: the triggering metric value at fire time.

    Returns:
        (text, reply_markup) — text is plain UTF-8 (NO parse_mode); the
        reply_markup is a single inline_keyboard row with one Ack 1h button.
        callback_data = ``ack_alert:{rule_id}:{scope_hash8}`` where
        scope_hash8 = sha256(scope_key)[:8] — keeps the payload under
        Telegram's 64-byte cap (Plan 03 D-01 / RESEARCH Open Q #3).

    Plan 03 D-03: single Ack 1h button only — Snooze 30m is NOT shipped in
    v1.0 because Ack already suppresses for 1h, which IS the v1.0 snooze
    duration. Adding a second button would duplicate the semantic.
    """
    scope_hash8 = hashlib.sha256(scope_key.encode()).hexdigest()[:8]
    threshold_str = (
        f"{rule.threshold_fire}" if rule.threshold_fire is not None else "n/a"
    )
    text = (
        f"🚨 Alert fired: {rule.name}\n\n"
        f"Metric: {rule.metric}\n"
        f"Scope: {scope_key}\n"
        f"Value: {value:.2f}\n"
        f"Threshold: {threshold_str}"
    )
    # Use .value explicitly so callback_data is a plain str (StrEnum's
    # __str__ already returns the value, but the explicit access reads as
    # a contract — clearer for the next person grepping for the verb).
    callback_data = (
        f"{CallbackVerb.ack_alert.value}:{rule.rule_id}:{scope_hash8}"
    )
    kb = _kb([[("✓ Ack 1h", callback_data)]])
    return text, kb
