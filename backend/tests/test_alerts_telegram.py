"""Phase 15 Plan 03 — Telegram delivery + ack feedback loop.

Coverage:
  - Task 1: callback_verbs.CallbackVerb StrEnum (8 members) +
            dash_router routing for ack_alert + regression on existing 7 verbs.
  - Task 2: format_alert plain-text composer + ack flow integration.
  - Task 3: notifier _FORMATTER alert kind + _send_pending_alerts sweep.

Pitfalls covered:
  - Plan 03 D-02: every existing verb must route via the StrEnum, no string
    literals left in dash_router.py (regression-tested).
  - Plan 03 D-01: ack_alert callback_data ≤ 64 bytes via sha256[:8] hash.
  - ALRT-11: NO parse_mode= anywhere in format_alert output.
  - Plan 03 wiring decision Option A: notifier sweeps notification_log rows
    of kind='alert' status='pending' (Plan 02 inserts them).
"""
from __future__ import annotations

import re

import pytest

# --------------------------------------------------------------------------
# Task 1 — callback_verbs StrEnum + dash_router refactor + ack_alert verb.
# --------------------------------------------------------------------------


def test_callback_verb_enum_complete() -> None:
    """ALRT-08 + Plan 03 D-02: enum locks the 8-member contract.

    Adding a 9th verb should require a deliberate enum update — this test
    ensures Phase 17 / future plans cannot silently drift.
    """
    from cmc.telegram.callback_verbs import CallbackVerb

    expected = {
        "approve_task",
        "reject_task",
        "rerun_task",
        "answer_decision",
        "reply_inbox",
        "snooze",
        "estop",
        "ack_alert",
    }
    actual = {v.value for v in CallbackVerb}
    assert actual == expected
    # Member count lock — additions to enum must update the test.
    assert len(list(CallbackVerb)) == 8


def test_dash_router_routes_ack_alert() -> None:
    """ack_alert verb returns POST /api/alerts/_ack with the parsed body."""
    from cmc.telegram import dash_router

    method, path, body = dash_router.route("ack_alert", ["42", "a1b2c3d4"])
    assert method == "POST"
    assert path == "/api/alerts/_ack"
    assert body == {"rule_id": 42, "scope_hash": "a1b2c3d4"}


def test_dash_router_ack_alert_bad_rule_id_raises() -> None:
    """Non-integer rule_id raises CallbackParseError (typed-input boundary)."""
    from cmc.telegram import dash_router

    with pytest.raises(dash_router.CallbackParseError):
        dash_router.route("ack_alert", ["not-an-int", "a1b2c3d4"])


def test_dash_router_ack_alert_wrong_arg_count() -> None:
    """ack_alert with 1 arg falls into the 'unknown verb' branch."""
    from cmc.telegram import dash_router

    with pytest.raises(dash_router.CallbackParseError):
        dash_router.route("ack_alert", ["42"])


def test_dash_router_existing_verbs_still_route() -> None:
    """Regression: refactoring to StrEnum members must NOT change routing."""
    from cmc.telegram import dash_router

    # approve_task
    assert dash_router.route("approve_task", ["1"]) == (
        "POST",
        "/api/tasks/1/approve",
        {},
    )
    # reject_task
    assert dash_router.route("reject_task", ["1"]) == (
        "POST",
        "/api/tasks/1/reject",
        {},
    )
    # rerun_task
    assert dash_router.route("rerun_task", ["1"]) == (
        "POST",
        "/api/tasks/1/rerun",
        {},
    )
    # answer_decision
    assert dash_router.route("answer_decision", ["7", "yes"]) == (
        "POST",
        "/api/decisions/7/answer",
        {"answer": "yes", "answered_by": "telegram"},
    )
    # reply_inbox
    assert dash_router.route("reply_inbox", ["3"]) == (
        "NOOP",
        "/api/inbox/3",
        {},
    )
    # snooze
    assert dash_router.route("snooze", ["overdue_schedule", "5", "30m"]) == (
        "RESOLVE_THEN_PATCH",
        "/api/notifications/_resolve/overdue_schedule/5",
        {"duration": "30m"},
    )
    # estop
    assert dash_router.route("estop", []) == (
        "POST",
        "/api/system/emergency-stop",
        {"reason": "telegram"},
    )


def test_callback_data_under_64_bytes() -> None:
    """Worst-case ack_alert callback_data must fit Telegram's 64-byte cap."""
    from cmc.telegram.callback_verbs import CallbackVerb

    # Max INT32 rule_id + 8-char hash + 2 colons + verb string.
    payload = f"{CallbackVerb.ack_alert.value}:{2147483647}:abcdef12"
    assert len(payload.encode("utf-8")) <= 64
    # Sanity: spell out the encoded length for the docstring contract.
    assert len(payload) == len("ack_alert:2147483647:abcdef12")


def test_dash_router_no_string_literal_verb_checks() -> None:
    """Plan 03 D-02: every existing verb must route via CallbackVerb members.

    Reads dash_router.py source and asserts there are no lines like
    ``if verb == "literal_string"`` — they were ALL replaced by enum members.
    """
    import inspect

    from cmc.telegram import dash_router

    src = inspect.getsource(dash_router)
    # Guard: literal-string verb check pattern.
    matches = re.findall(r'if\s+verb\s*==\s*["\']\w+["\']', src)
    assert matches == [], (
        "Plan 03 D-02 — found string-literal verb checks in dash_router.py: "
        f"{matches!r}. Replace them with CallbackVerb member comparisons."
    )
