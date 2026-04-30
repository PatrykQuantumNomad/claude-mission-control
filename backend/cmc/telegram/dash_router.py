"""Telegram callback_data → backend HTTP route mapper. Pure function — no IO.

The handler (Plan 09-03) decodes each callback_query's `data` field via
`decode_callback`, then maps the verb to a backend route via `route()`.
The handler is responsible for the actual HTTP dispatch against
http://127.0.0.1:8765 (or whatever Settings.host:port resolves to).

Verb table (must stay under Telegram's 64-byte callback_data cap):

  approve_task:<id>             -> POST /api/tasks/{id}/approve
  reject_task:<id>              -> POST /api/tasks/{id}/reject
  rerun_task:<id>               -> POST /api/tasks/{id}/rerun
  answer_decision:<id>:<yes|no> -> POST /api/decisions/{id}/answer
    body={"answer": ..., "answered_by": "telegram"}
  reply_inbox:<id>              -> NOOP at routing layer; handler enters reply state
  snooze:<kind>:<entity>:<dur>  -> RESOLVE_THEN_PATCH (handler resolves notif_id first)
  estop                         -> POST /api/system/emergency-stop body={"reason": "telegram"}
"""

from typing import Any


class CallbackParseError(ValueError):
    """Raised when a callback_data string can't be decoded into a known verb+args shape."""


def decode_callback(data: str) -> tuple[str, list[str]]:
    """Split `verb:arg:arg:...` into `(verb, [args...])`.

    Examples:
      `approve_task:42`              -> ('approve_task', ['42'])
      `snooze:overdue_schedule:7:30m` -> ('snooze', ['overdue_schedule', '7', '30m'])
      `estop`                        -> ('estop', [])
    """
    if not data:
        raise CallbackParseError("empty callback_data")
    head, *rest = data.split(":")
    return head, rest


def route(verb: str, args: list[str]) -> tuple[str, str, dict[str, Any]]:
    """Map (verb, args) -> (METHOD, /api/path, body).

    Returns one of three METHOD shapes:
      - "POST"  / "PATCH" — direct HTTP dispatch by handler
      - "NOOP"            — handler enters in-process reply state
      - "RESOLVE_THEN_PATCH" — handler GETs the resolve path first to find
        notif_id, then PATCHes /api/notifications/{notif_id}/snooze with the
        body's `duration` query param. The indirection keeps callback_data
        under Telegram's 64-byte cap.
    """
    if verb == "approve_task" and len(args) == 1:
        return ("POST", f"/api/tasks/{args[0]}/approve", {})
    if verb == "reject_task" and len(args) == 1:
        return ("POST", f"/api/tasks/{args[0]}/reject", {})
    if verb == "rerun_task" and len(args) == 1:
        return ("POST", f"/api/tasks/{args[0]}/rerun", {})
    if verb == "answer_decision" and len(args) == 2:
        return (
            "POST",
            f"/api/decisions/{args[0]}/answer",
            {"answer": args[1], "answered_by": "telegram"},
        )
    if verb == "reply_inbox" and len(args) == 1:
        # handler.py captures the next text message from this user; not a route call
        return ("NOOP", f"/api/inbox/{args[0]}", {})
    if verb == "snooze" and len(args) == 3:
        # handler resolves notif_id from (kind, entity_id, chat_id) before PATCH
        kind, entity_id, duration = args
        return (
            "RESOLVE_THEN_PATCH",
            f"/api/notifications/_resolve/{kind}/{entity_id}",
            {"duration": duration},
        )
    if verb == "estop" and len(args) == 0:
        return ("POST", "/api/system/emergency-stop", {"reason": "telegram"})
    raise CallbackParseError(f"unknown verb {verb!r} with {len(args)} args")
