"""Shared response-model primitives reused across all Phase 3 router schemas.

Per RESEARCH §Pattern 1 + Pitfall 6: Pydantic v2 needs `from_attributes=True`
(the v1 `orm_mode` is gone). The ORMBase mixin enables ORM-row -> response-model
conversion via `model_validate(orm_row)`. Plain BaseModel is used when input is
NOT an ORM row (e.g. aggregated dicts, request bodies).
"""
from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class RangeWindow(str, Enum):
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
    detail: Optional[str] = None


class ORMBase(BaseModel):
    """Mixin enabling ORM-row -> response-model conversion.

    Use as the parent class for any response schema that will be constructed
    via `Schema.model_validate(orm_row)`. Plain BaseModel does NOT pull
    attributes off ORM instances by default in Pydantic v2.
    """

    model_config = ConfigDict(from_attributes=True)
