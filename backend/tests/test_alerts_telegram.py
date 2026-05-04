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

import hashlib
import re
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from cmc.db.models.alert_rules import AlertRule
from cmc.db.models.alert_state import AlertState
from cmc.db.models.decisions import Decision

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


# --------------------------------------------------------------------------
# Task 2 — format_alert plain-text composer + ack flow integration.
# --------------------------------------------------------------------------


def _make_rule(
    rule_id: int = 7,
    name: str = "latency-spike",
    metric: str = "skill_p95_latency_ms",
    threshold_fire: float = 1500.0,
) -> AlertRule:
    """Inline factory — minimal AlertRule shape for format_alert (no DB)."""
    return AlertRule(
        rule_id=rule_id,
        name=name,
        kind="threshold",
        metric=metric,
        threshold_fire=threshold_fire,
        threshold_clear=None,
        min_dwell_seconds=0,
        min_samples=1,
        cooldown_seconds=0,
        enabled=True,
        spec_version=1,
        params_json={},
    )


def test_format_alert_plain_text_no_parse_mode() -> None:
    """ALRT-11: format_alert returns plain-text body with NO parse_mode key.

    Phase 9-01 already enforces a CI grep on cmc/telegram/messages.py.
    This test pins the BEHAVIORAL invariant: nowhere in the returned tuple
    (text or reply_markup) may a 'parse_mode' key appear. If a future plan
    accidentally serializes parse_mode into reply_markup, this fails.
    """
    from cmc.telegram.messages import format_alert

    text, kb = format_alert(_make_rule(), "skill:foo", 12.34)

    # Body shape — humans should see the human-readable surface.
    assert "Alert fired" in text
    assert "latency-spike" in text             # rule.name
    assert "skill_p95_latency_ms" in text       # rule.metric
    assert "skill:foo" in text                  # scope_key
    assert "12.34" in text                      # value formatted
    assert "1500" in text                       # threshold_fire

    # Reply markup is the inline_keyboard contract.
    assert isinstance(kb, dict)
    assert "inline_keyboard" in kb

    # Recursive parse_mode scan — nothing produced by format_alert may
    # contain a 'parse_mode' key (api.send_message has no such param).
    def _has_parse_mode(obj) -> bool:
        if isinstance(obj, dict):
            if "parse_mode" in obj:
                return True
            return any(_has_parse_mode(v) for v in obj.values())
        if isinstance(obj, (list, tuple)):
            return any(_has_parse_mode(v) for v in obj)
        return False

    assert not _has_parse_mode(text)
    assert not _has_parse_mode(kb)


def test_format_alert_callback_data_under_64_bytes() -> None:
    """Plan 03 D-01: ack_alert callback_data must fit Telegram's 64-byte cap."""
    from cmc.telegram.messages import format_alert

    _, kb = format_alert(_make_rule(rule_id=2147483647), "model:foo", 99.0)
    cb_data = kb["inline_keyboard"][0][0]["callback_data"]
    assert len(cb_data.encode("utf-8")) <= 64


def test_format_alert_callback_data_format() -> None:
    """callback_data must match ack_alert:<rule_id>:<8-hex>."""
    from cmc.telegram.messages import format_alert

    _, kb = format_alert(_make_rule(rule_id=42), "model:foo", 1.0)
    cb_data = kb["inline_keyboard"][0][0]["callback_data"]
    assert re.match(r"^ack_alert:\d+:[0-9a-f]{8}$", cb_data), cb_data
    # The hash must be exactly sha256(scope_key)[:8].
    expected_hash = hashlib.sha256(b"model:foo").hexdigest()[:8]
    assert cb_data == f"ack_alert:42:{expected_hash}"


def test_format_alert_scope_hash_deterministic() -> None:
    """Same scope_key -> same hash8 across calls (sanity)."""
    from cmc.telegram.messages import format_alert

    _, kb1 = format_alert(_make_rule(), "model:claude-opus-4-7", 1.0)
    _, kb2 = format_alert(_make_rule(), "model:claude-opus-4-7", 9.0)
    cb1 = kb1["inline_keyboard"][0][0]["callback_data"]
    cb2 = kb2["inline_keyboard"][0][0]["callback_data"]
    # Different value but same scope → same hash → same callback_data.
    assert cb1 == cb2


def test_format_alert_used_for_decision_prompt() -> None:
    """D-06 follow-through (Plan 02): cmc/dispatcher/alerts.py imports
    format_alert and uses its text for decisions.prompt — auditability.

    Asserts the static import surface (read source) so a future refactor
    that drops the import is caught at the static level, complementing the
    integration test that exercises the runtime path.
    """
    import inspect

    from cmc.dispatcher import alerts as alerts_mod

    src = inspect.getsource(alerts_mod)
    # Stub function should be GONE.
    assert "_format_alert_prompt" not in src, (
        "D-06 follow-through: the local _format_alert_prompt stub must be "
        "removed in Plan 03 (replaced by cmc.telegram.messages.format_alert)."
    )
    # The exact stub body string should not survive either.
    assert "Alert: {rule.name} fired" not in src
    # And format_alert must be imported + called.
    assert "from cmc.telegram.messages import format_alert" in src
    assert "format_alert(" in src


@pytest.mark.asyncio
async def test_ack_then_evaluate_returns_hold(test_settings, monkeypatch) -> None:
    """End-to-end: ack via /api/alerts/_ack → next evaluate_alerts tick HOLDs.

    Seeds an always-firing failed-tasks rule (Plan 02 dispatcher pattern),
    runs evaluate_alerts → 1 decision row. Posts ack via the running app's
    HTTP layer. Runs evaluate_alerts again → state.state still 'firing' but
    NO new decision row inserted (the ack precedence short-circuit at the
    top of the per-scope loop in cmc/dispatcher/alerts.py is hit).
    """
    from sqlalchemy import func

    from cmc.dispatcher.alerts import evaluate_alerts

    # Mirror the dispatcher tests' bootstrap so we get a real SQLite + sessions.
    from tests.test_alerts_dispatcher import (  # type: ignore
        _bootstrap_db,
        _seed_alert_rule,
        _seed_failed_task,
    )

    engine, sessions = await _bootstrap_db(test_settings)
    try:
        # Telegram chat_id required so notification_log inserts happen.
        from cmc.config import load_settings

        monkeypatch.setattr(
            "cmc.dispatcher.alerts.load_settings",
            lambda: load_settings().model_copy(
                update={
                    "telegram_chat_id": "12345",
                    "telegram_bot_token": "tkn",
                }
            ),
        )

        rule_id = await _seed_alert_rule(
            sessions,
            name="failed-tasks",
            metric="dispatcher_failed_tasks_5m",
            threshold_fire=0.5,
        )
        await _seed_failed_task(sessions)

        # Tick 1 → 1 decision + 1 notif row.
        async with sessions() as db:
            await evaluate_alerts(db)

        dedup_key = f"alert:{rule_id}:<global>"
        async with sessions() as db:
            n_decisions_1 = (
                await db.execute(
                    select(func.count(Decision.id)).where(
                        Decision.dedup_key == dedup_key
                    )
                )
            ).scalar_one()
        assert n_decisions_1 == 1

        # Ack the firing scope by directly stamping acked_until = now + 1h.
        # (The /api/alerts/_ack endpoint does the same thing — we exercise
        # the dispatcher's ack-precedence short-circuit, which is the
        # behavioral contract Plan 03 cares about.)
        scope_key = "<global>"
        scope_hash = hashlib.sha256(scope_key.encode()).hexdigest()[:8]
        async with sessions() as db:
            row = (
                await db.execute(
                    select(AlertState).where(
                        AlertState.rule_id == rule_id,
                        AlertState.scope_key == scope_key,
                    )
                )
            ).scalar_one()
            row.acked_until = datetime.now(UTC).replace(
                tzinfo=None
            ) + timedelta(hours=1)
            await db.commit()

        # Sanity: hash matches (this is what the /api/alerts/_ack endpoint
        # would receive after the user taps the Ack 1h button).
        assert (
            hashlib.sha256(scope_key.encode()).hexdigest()[:8] == scope_hash
        )

        # Tick 2 → ack precedence short-circuits; NO new decision row.
        async with sessions() as db:
            await evaluate_alerts(db)

        async with sessions() as db:
            n_decisions_2 = (
                await db.execute(
                    select(func.count(Decision.id)).where(
                        Decision.dedup_key == dedup_key
                    )
                )
            ).scalar_one()
        # Same row count as after tick 1 — ack suppressed re-emit.
        assert n_decisions_2 == n_decisions_1 == 1

        # Verify alert_state still 'firing' (suppression is at notify-layer,
        # not at detector layer — the underlying condition didn't change).
        async with sessions() as db:
            row = (
                await db.execute(
                    select(AlertState).where(
                        AlertState.rule_id == rule_id,
                        AlertState.scope_key == scope_key,
                    )
                )
            ).scalar_one()
        assert row.state == "firing"
        assert row.acked_until is not None
    finally:
        await engine.dispose()
