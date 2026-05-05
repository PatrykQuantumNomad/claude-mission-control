"""otel_metrics table — append-only metric points from OTEL /v1/metrics.

Per 01-01-SCHEMA.md (table 5). Drives OBSV-09,10 / OPNL-13,14.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field, Index, SQLModel

from cmc.core.time import now_utc


class OtelMetric(SQLModel, table=True):
    __tablename__ = "otel_metrics"

    id: int | None = Field(default=None, primary_key=True)
    ts: datetime
    metric_name: str
    value: float
    kind: str  # counter / gauge / histogram
    unit: str | None = None
    attrs: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    received_at: datetime = Field(default_factory=now_utc)

    __table_args__ = (
        Index("idx_otel_metrics_name_ts", "metric_name", "ts"),
        Index("idx_otel_metrics_ts_desc", "ts"),
    )
