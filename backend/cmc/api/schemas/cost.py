"""Phase 13 cost-engine response models.

ANLY-04: read-time-computed dollar figures, never stored as $ in DB.

Pydantic v2 serializes Decimal as JSON string by default — that's the right
behavior for money. Do NOT pipe these through fastapi.encoders.jsonable_encoder
(research Anti-Pattern: jsonable_encoder converts Decimal -> float silently).

Range param: 1d | 7d | 14d | 30d (CONTEXT.md locked enum). Anything else -> 422.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CostRange = Literal["1d", "7d", "14d", "30d"]
BreakdownDim = Literal["model", "skill", "project"]


class CostByModelRow(BaseModel):
    model: str
    tokens_input: int = 0
    tokens_output: int = 0
    tokens_cache_read: int = 0
    tokens_cache_create_5m: int = 0
    tokens_cache_create_1h: int = 0
    cost_usd: Decimal              # serialized as JSON string ("0.0247")


class CostBreakdownRow(BaseModel):
    """Generic row used for skill/project breakdowns where the row key is dimension-specific."""
    key: str = Field(description="Model name, skill name, or project hash, depending on `dim`")
    tokens_input: int = 0
    tokens_output: int = 0
    tokens_cache_read: int = 0
    tokens_cache_create_5m: int = 0
    tokens_cache_create_1h: int = 0
    cost_usd: Decimal


class CostSummaryResponse(BaseModel):
    range: CostRange
    rates_as_of: date | None     # max effective_from across rates touched (None if pricing empty)
    total_usd: Decimal
    by_model: list[CostByModelRow]


class CostBreakdownResponse(BaseModel):
    range: CostRange
    dim: BreakdownDim
    rates_as_of: date | None
    total_usd: Decimal
    rows: list[CostBreakdownRow]


class PricingFreshnessResponse(BaseModel):
    """For /api/pricing/freshness — surfaced by doctor + settings + Phase 14 mount-time fetch."""
    # Disable Pydantic's protected_namespaces so `model_count` doesn't trigger a
    # spurious "conflict with protected namespace 'model_'" UserWarning. The
    # `model_count` field is unrelated to Pydantic's reserved `model_*` API.
    model_config = ConfigDict(protected_namespaces=())

    rates_as_of: date | None
    age_days: int | None
    is_stale: bool             # True if rates_as_of < now - 30 days
    on_disk_hash: str          # sha256 of data/pricing.json
    model_count: int           # how many distinct models have currently-effective rates
