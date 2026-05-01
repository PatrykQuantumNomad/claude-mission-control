"""Plain-text Telegram formatters. NO MarkdownV2 (Pitfall P3).

Each formatter returns a `(text, reply_markup_dict_or_None)` tuple. The
reply_markup follows Telegram's inline_keyboard contract — a 2D array of
`{text, callback_data}` dicts. callback_data is capped at 64 bytes by
Telegram, hence the verb:arg:arg:arg compact encoding consumed by
cmc.telegram.dash_router.
"""

from typing import Any


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
