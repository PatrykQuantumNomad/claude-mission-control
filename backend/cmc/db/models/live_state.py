"""live_state table — per-session live state for the last-5-minutes filter.

Per 01-01-SCHEMA.md (table 11). Drives SESS-03,04,05 / OPNL-04.
"""

from datetime import datetime

from sqlalchemy import Column, ForeignKey, String
from sqlmodel import Field, Index, SQLModel

from cmc.core.time import now_utc


class LiveState(SQLModel, table=True):
    __tablename__ = "live_state"

    # session_id is BOTH primary key AND foreign key (ON DELETE CASCADE).
    session_id: str = Field(
        sa_column=Column(
            String,
            ForeignKey("sessions.session_id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
    )
    last_activity_at: datetime
    # state enum [NEEDS USER CONFIRMATION] — accepted as-is per APPROVED 2026-04-25.
    state: str = Field(default="idle")
    current_message: str | None = None
    current_tool: str | None = None
    pid: int | None = None
    updated_at: datetime = Field(default_factory=now_utc)

    __table_args__ = (
        Index("idx_live_state_last_activity_desc", "last_activity_at"),
    )
