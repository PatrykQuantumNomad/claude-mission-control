"""token_usage table — daily rollups of token usage by (day, model, source).

Per 01-01-SCHEMA.md (table 2). Drives OBSV-01 / OBSV-02 / OPNL-05,06 / ACTV-02.
"""

from datetime import date as _date
from datetime import datetime

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, Index, SQLModel

from cmc.core.time import now_utc


class TokenUsage(SQLModel, table=True):
    __tablename__ = "token_usage"

    id: int | None = Field(default=None, primary_key=True)
    day: _date
    model: str
    # source enum [NEEDS USER CONFIRMATION] — accepted as-is, stored as free-text.
    source: str
    tokens_input: int = Field(default=0)
    tokens_output: int = Field(default=0)
    tokens_cache_read: int = Field(default=0)
    tokens_cache_create: int = Field(default=0)
    tokens_cache_create_5m: int = Field(default=0)
    tokens_cache_create_1h: int = Field(default=0)
    sessions_count: int = Field(default=0)
    updated_at: datetime = Field(default_factory=now_utc)

    __table_args__ = (
        UniqueConstraint("day", "model", "source", name="uq_token_usage_day_model_source"),
        Index("idx_token_usage_day_desc", "day"),
    )
