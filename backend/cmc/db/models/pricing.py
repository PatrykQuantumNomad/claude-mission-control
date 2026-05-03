"""pricing table — closed-open temporal rate intervals.

Phase 13 ANLY-03: effective_from/effective_until enables historical totals to
self-correct when new pricing rows are added. Cost engine selects:
  WHERE effective_from <= ts AND (effective_until IS NULL OR effective_until > ts)

Rates stored per million tokens as Decimal (Numeric(10,4) on SQLite).
NEVER store dollars in derived tables — locked anti-feature.
"""
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Column, Numeric, UniqueConstraint
from sqlmodel import Field, Index, SQLModel


class PricingRow(SQLModel, table=True):
    __tablename__ = "pricing"

    id: int | None = Field(default=None, primary_key=True)
    model: str = Field(index=True)
    input_per_mtok:           Decimal = Field(sa_column=Column(Numeric(10, 4), nullable=False))
    output_per_mtok:          Decimal = Field(sa_column=Column(Numeric(10, 4), nullable=False))
    cache_read_per_mtok:      Decimal = Field(sa_column=Column(Numeric(10, 4), nullable=False))
    cache_create_5m_per_mtok: Decimal = Field(sa_column=Column(Numeric(10, 4), nullable=False))
    cache_create_1h_per_mtok: Decimal = Field(sa_column=Column(Numeric(10, 4), nullable=False))
    effective_from: datetime
    effective_until: datetime | None = None
    source_url: str
    loaded_at: datetime = Field(default_factory=datetime.utcnow)
    # SHA-256 of the data/pricing.json contents that produced this row.
    # Read by doctor's pricing-drift check (Plan 05) — compares this column
    # on the highest-effective_from currently-active row against
    # `pricing_json_hash()` of the on-disk file. Mismatch => warn.
    seed_hash: str

    __table_args__ = (
        UniqueConstraint("model", "effective_from", name="uq_pricing_model_effective_from"),
        Index("idx_pricing_model_effective_from", "model", "effective_from"),
    )
