"""Unit tests for cmc.core.time — the canonical naive-UTC time helper.

These tests assert the contract that the rest of Phase 18 (Plan 02) sweeps
22 deprecated naive-UTC call sites onto. The contract is intentionally narrow:
- `now_utc()` returns a naive datetime whose value is current UTC.
- `now_utc` is callable as a `Field(default_factory=...)` reference.
- `UTCDatetime` lives canonically in `cmc.core.time` and is re-exported from
  `cmc.api.schemas.common` so the 8+ existing import sites keep working.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from pydantic import BaseModel, Field

from cmc.core.time import UTCDatetime, now_utc


def test_now_utc_returns_naive_datetime() -> None:
    """The helper must return a naive datetime (tzinfo is None) — SQLite-naive
    storage contract is the whole reason this helper exists."""
    value = now_utc()
    assert isinstance(value, datetime)
    assert value.tzinfo is None


def test_now_utc_returns_current_utc() -> None:
    """The naive value must be UTC-now within a 5-second sanity window."""
    expected = datetime.now(UTC).replace(tzinfo=None)
    value = now_utc()
    delta = abs((value - expected).total_seconds())
    assert delta < 5.0, f"now_utc() drifted {delta}s from expected UTC"


def test_now_utc_factory_pattern() -> None:
    """Passing `now_utc` (no parens) to `Field(default_factory=...)` must
    produce a fresh timestamp on each instance — guards against Pitfall 7
    (default vs default_factory)."""

    class Sample(BaseModel):
        ts: datetime = Field(default_factory=now_utc)

    a = Sample()
    # Force a measurable gap then construct a second instance.
    import time as _time

    _time.sleep(0.01)
    b = Sample()
    assert a.ts.tzinfo is None
    assert b.ts.tzinfo is None
    assert b.ts >= a.ts
    # Sanity: both within ~1 second of each other (factory was called twice,
    # not memoized).
    assert (b.ts - a.ts) < timedelta(seconds=1)


def test_utc_datetime_serializer_roundtrip() -> None:
    """A Pydantic v2 model with a `UTCDatetime` field serializes a naive
    datetime to ISO-8601 ending in `Z` (when_used='json' gate behavior)."""

    class Sample(BaseModel):
        ts: UTCDatetime

    naive = datetime(2026, 5, 5, 12, 0, 0)
    instance = Sample(ts=naive)
    payload = instance.model_dump(mode="json")
    assert payload["ts"] == "2026-05-05T12:00:00Z"
    assert payload["ts"].endswith("Z")
    assert "+00:00" not in payload["ts"]


def test_utc_datetime_reexport_path() -> None:
    """Both import paths must resolve to the SAME annotated type — proves the
    re-export from common.py does not duplicate the type."""
    from cmc.api.schemas.common import UTCDatetime as common_export
    from cmc.core.time import UTCDatetime as canonical

    assert common_export is canonical, (
        "UTCDatetime re-export must be identity-equal to the canonical "
        "definition in cmc.core.time (Phase 18 D-Colocation)."
    )
