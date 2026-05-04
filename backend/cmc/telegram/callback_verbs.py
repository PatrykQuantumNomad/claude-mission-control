"""Phase 15 Plan 03 — central registry of every Telegram callback_data verb.

ALRT-08 ships this module so all 8 verbs (7 pre-existing + ack_alert) live in
ONE place. Per RESEARCH.md Pitfall 8: the extraction MUST be COMPLETE — every
string-literal verb comparison in dash_router.py is replaced by a CallbackVerb
member. Partial extraction (some verbs as enum, others as literals) creates
drift risk and defeats the point of a single source of truth.

Each member's string value MUST keep its full callback_data composition under
Telegram's hard 64-byte cap. Worst case for ack_alert is
``ack_alert:2147483647:abcdef12`` = 28 bytes — well under the cap. Phase 17
POLI-03 will add round-trip tests against this enum.

Why StrEnum (PEP 663):
  - Members compare equal to their str value (so ``verb == CallbackVerb.foo``
    works whether ``verb`` is a raw decoded string OR a CallbackVerb member).
  - ``f"{CallbackVerb.foo}"`` formats as the bare string value (no
    ``CallbackVerb.foo`` prefix), which keeps callback_data composition simple.
  - The enum lives at module-import time so no runtime lookup tax.
"""
from __future__ import annotations

from enum import StrEnum


class CallbackVerb(StrEnum):
    """Every Telegram callback_data verb the dash_router knows.

    Members:
        approve_task    Plan 13 — POST /api/tasks/{id}/approve
        reject_task     Plan 13 — POST /api/tasks/{id}/reject
        rerun_task      Plan 13 — POST /api/tasks/{id}/rerun
        answer_decision Plan 13 — POST /api/decisions/{id}/answer
        reply_inbox     Plan 13 — handler-side reply state (no HTTP)
        snooze          Plan 13 — RESOLVE_THEN_PATCH on notifications router
        estop           Plan 13 — POST /api/system/emergency-stop
        ack_alert       Phase 15 — POST /api/alerts/_ack with sha256[:8] hash
    """

    approve_task = "approve_task"
    reject_task = "reject_task"
    rerun_task = "rerun_task"
    answer_decision = "answer_decision"
    reply_inbox = "reply_inbox"
    snooze = "snooze"
    estop = "estop"
    ack_alert = "ack_alert"  # Phase 15 NEW
