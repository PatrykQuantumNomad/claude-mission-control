"""Thin croniter wrappers — RESEARCH Pattern 3 + Pitfall 3.

Two functions:
  validate_cron(expr) -> bool : 5-field cron validity check
  next_run(expr, base) -> datetime : next firing after base (tz-aware UTC)
"""

from datetime import datetime

from croniter import croniter


def validate_cron(expr: str) -> bool:
    """Return True iff `expr` is a valid 5-field cron expression.

    Strips surrounding whitespace before validating (per RESEARCH
    Anti-Patterns: don't validate raw quoted strings).
    """
    if not isinstance(expr, str):
        return False
    return croniter.is_valid(expr.strip())


def next_run(expr: str, base: datetime) -> datetime:
    """Return the next firing datetime after `base`. base MUST be tz-aware.

    Pitfall 3: a naive base silently uses local time; reject naive inputs.
    """
    if base.tzinfo is None:
        raise ValueError("base must be tz-aware")
    it = croniter(expr.strip(), base)
    return it.get_next(datetime)
