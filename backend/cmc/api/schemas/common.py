"""Shared response-model primitives reused across API router schemas.

Pydantic v2 needs `from_attributes=True` for ORM rows (the v1 `orm_mode` is
gone). The ORMBase mixin enables ORM-row -> response-model
conversion via `model_validate(orm_row)`. Plain BaseModel is used when input is
NOT an ORM row (e.g. aggregated dicts, request bodies).
"""

from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer


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


class RangeWindow(StrEnum):
    """Standard time-window selector accepted by aggregate endpoints (OBSV-*)."""

    today = "today"
    d7 = "7d"
    d30 = "30d"
    all = "all"


class PaginationParams(BaseModel):
    """Standard pagination params: 1..200 limit (default 50), 0+ offset."""

    limit: int = Field(50, ge=1, le=200)
    offset: int = Field(0, ge=0)


class ErrorResponse(BaseModel):
    """Standard error envelope: short machine-readable code + optional human detail."""

    error: str
    detail: str | None = None


class ORMBase(BaseModel):
    """Mixin enabling ORM-row -> response-model conversion.

    Use as the parent class for any response schema that will be constructed
    via `Schema.model_validate(orm_row)`. Plain BaseModel does NOT pull
    attributes off ORM instances by default in Pydantic v2.
    """

    model_config = ConfigDict(from_attributes=True)
