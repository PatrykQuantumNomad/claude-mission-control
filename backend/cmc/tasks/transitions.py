"""Pure-function task status state machine.

Single source of truth for legal status transitions. Used by TASK-03 PATCH;
TASK-05 (approve) and TASK-06 (rerun) bypass this matrix because their
target state is fixed and they validate the source state explicitly.

Matrix:
  pending           -> {running, awaiting_approval, failed, done}
  awaiting_approval -> {pending, failed}
  running           -> {done, failed}
  done              -> {}                # terminal
  failed            -> {pending}         # rerun resets
"""

_ALLOWED_TRANSITIONS: dict[str, frozenset[str]] = {
    "pending":            frozenset({"running", "awaiting_approval", "failed", "done"}),
    "awaiting_approval":  frozenset({"pending", "failed"}),
    "running":            frozenset({"done", "failed"}),
    "done":               frozenset(),
    "failed":             frozenset({"pending"}),
}


def validate_transition(old: str, new: str) -> bool:
    """Return True iff `new` is a legal next status from `old`."""
    return new in _ALLOWED_TRANSITIONS.get(old, frozenset())
