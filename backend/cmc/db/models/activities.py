"""activities table — daily aggregate counters for the heatmap.

Per 01-01-SCHEMA.md (table 10). Drives OBSV-09 / ACTV-01 / OPNL-13.

NOTE: SCHEMA flags this table as [NEEDS USER CONFIRMATION] — the production
dashboard may compute the heatmap on the fly from otel_metrics. Materialized
here as a precomputed cache per the approved-as-is decision (2026-04-25).
"""

from datetime import date as _date
from datetime import datetime

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, Index, SQLModel


class Activity(SQLModel, table=True):
    __tablename__ = "activities"

    id: int | None = Field(default=None, primary_key=True)
    day: _date
    # kind enum: {commits, prs, lines_added, lines_removed, sessions, tokens}
    kind: str
    value: float = Field(default=0)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("day", "kind", name="uq_activities_day_kind"),
        Index("idx_activities_day_desc", "day"),
    )
