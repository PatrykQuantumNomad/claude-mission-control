"""POLI-03: round-trip every CallbackVerb member through decode_callback + route.

The 8 telegram callback verbs in cmc.telegram.callback_verbs.CallbackVerb form
a StrEnum registry. dash_router.decode_callback parses Telegram callback_data
and returns (verb, args); dash_router.route maps (verb, args) to a tuple
(method, path, body). This test parametrizes over `list(CallbackVerb)` so a
NEW verb added to the enum auto-includes itself in coverage — but only if the
contributor also adds a VERB_FIXTURES entry. Missing fixture entries fail
explicitly with the message printed below.

Per-verb representative payloads — kept as a dict keyed by enum member (NOT
by string literal) so a renamed verb auto-detects the keyer. Pitfall 3:
verbs take 0-3 args, so the fixture carries the per-verb arg shape.
"""

from __future__ import annotations

import pytest

from cmc.telegram import dash_router
from cmc.telegram.callback_verbs import CallbackVerb

# Each entry: callback_data string + expected (method, path_prefix).
# path_prefix matches the START of the routed path; route() may append
# query strings or body-derived suffixes.
VERB_FIXTURES: dict[CallbackVerb, tuple[str, tuple[str, str]]] = {
    CallbackVerb.approve_task: (
        "approve_task:42",
        ("POST", "/api/tasks/42/approve"),
    ),
    CallbackVerb.reject_task: (
        "reject_task:42",
        ("POST", "/api/tasks/42/reject"),
    ),
    CallbackVerb.rerun_task: (
        "rerun_task:9",
        ("POST", "/api/tasks/9/rerun"),
    ),
    CallbackVerb.answer_decision: (
        "answer_decision:7:yes",
        ("POST", "/api/decisions/7/answer"),
    ),
    CallbackVerb.reply_inbox: (
        "reply_inbox:12",
        ("NOOP", "/api/inbox/12"),
    ),
    CallbackVerb.snooze: (
        "snooze:overdue_schedule:7:30m",
        ("RESOLVE_THEN_PATCH", "/api/notifications/_resolve/overdue_schedule/7"),
    ),
    CallbackVerb.estop: (
        "estop",
        ("POST", "/api/system/emergency-stop"),
    ),
    CallbackVerb.ack_alert: (
        "ack_alert:42:abcdef12",
        ("POST", "/api/alerts/_ack"),
    ),
}


@pytest.mark.parametrize("verb", list(CallbackVerb), ids=lambda v: v.value)
def test_callback_verb_round_trip(verb: CallbackVerb) -> None:
    """POLI-03: every CallbackVerb member round-trips encode → decode → route.

    A new enum member added to CallbackVerb must also gain an entry in
    VERB_FIXTURES — otherwise this test KeyError-fails and surfaces the gap
    before merge.
    """
    assert verb in VERB_FIXTURES, (
        f"POLI-03: missing VERB_FIXTURES entry for {verb!r}. "
        "When you add a new CallbackVerb member, also add a representative "
        "callback_data + expected (method, path_prefix) tuple to "
        "test_callback_verbs_round_trip.py::VERB_FIXTURES."
    )
    callback_data, (expected_method, expected_path_prefix) = VERB_FIXTURES[verb]

    decoded_verb, args = dash_router.decode_callback(callback_data)
    assert decoded_verb == verb, (
        f"POLI-03: decode_callback returned {decoded_verb!r}, expected {verb!r} "
        f"for callback_data={callback_data!r}"
    )

    method, path, _body = dash_router.route(decoded_verb, args)
    assert method == expected_method, (
        f"POLI-03: route() returned method={method!r}, expected {expected_method!r}"
    )
    assert path.startswith(expected_path_prefix), (
        f"POLI-03: route() returned path={path!r}, "
        f"expected prefix {expected_path_prefix!r}"
    )


def test_callback_verb_fixture_coverage_complete() -> None:
    """POLI-03 acceptance gate: every enum member has a VERB_FIXTURES entry.

    Defense-in-depth on top of the per-verb parametrize — surfaces the
    coverage gap as a single named test failure rather than as 8
    parametrize-shape failures.
    """
    missing = [v for v in CallbackVerb if v not in VERB_FIXTURES]
    assert not missing, (
        f"POLI-03: {len(missing)} CallbackVerb members lack VERB_FIXTURES entries: "
        f"{[v.value for v in missing]}"
    )
