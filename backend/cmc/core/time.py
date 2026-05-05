"""Canonical home for naive-UTC time concerns across the backend.

Why this module exists
----------------------
Python 3.12 deprecated the stdlib's naive-UTC factory (the function whose name
the POLI-06 verify gate forbids in source). The recommended replacement is
`datetime.now(UTC)`, but that returns an *aware* datetime — and the SQLAlchemy
schema in this project stores datetimes as naive UTC (SQLite default), so a
naked migration to `datetime.now(UTC)` would change the storage contract and
break every comparison-against-naive-DB-row in the suite.

`now_utc()` is the single helper the rest of the backend should call instead
of the deprecated stdlib factory. It returns the aware UTC value with the
offset stripped, preserving the naive-storage invariant while shedding the
deprecation warning.

Usage notes (read before sweeping)
----------------------------------
- For Pydantic / SQLAlchemy `default_factory=`, pass the function reference
  (`default_factory=now_utc`), NOT a call (`default_factory=now_utc()`). The
  call form would freeze a single timestamp at import time — see Pitfall 7
  in `.planning/phases/18-polish-carry-forward-cleanup/18-RESEARCH.md`.
- For one-shot expressions in business logic, call it: `ts = now_utc()`.

`UTCDatetime` is colocated here (rather than left in `cmc.api.schemas.common`)
so all naive-UTC concerns live in one module. The schemas package re-exports
it for backwards-compat with the 8 existing import sites.
"""

from datetime import UTC, datetime
from typing import Annotated

from pydantic import PlainSerializer


def now_utc() -> datetime:
    """Return the current UTC time as a naive `datetime` (tzinfo is None).

    Replaces the deprecated stdlib naive-UTC factory (Python 3.12+) while
    preserving the project's SQLite-naive storage contract. Pass this function
    as a reference (e.g. `Field(default_factory=now_utc)`) — calling it as a
    default would freeze a single import-time value across all instances.
    """
    return datetime.now(UTC).replace(tzinfo=None)


def _serialize_utc(value: datetime) -> str:
    """Emit ISO-8601 in UTC with `Z` suffix.

    SQLAlchemy stores datetimes as naive UTC. Pydantic v2's default serializer
    drops the offset, so JS `new Date(...)` parses it as local time and renders
    relative timestamps with a TZ-shaped skew. Treating naive values as UTC
    and forcing a `Z` suffix makes round-trips deterministic.
    """
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


UTCDatetime = Annotated[
    datetime,
    PlainSerializer(_serialize_utc, return_type=str, when_used="json"),
]
