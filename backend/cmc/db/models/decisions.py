"""decisions table — HITL decision queue.

Per 01-01-SCHEMA.md (table 8). Drives HITL-01..03 / DISP-07 / HPNL-01 / TELE-02.

HITL-02 partial-unique: dedup_key UNIQUE WHERE status='pending' is implemented
via a partial unique INDEX (sqlite supports partial indexes via sqlite_where).
"""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column, ForeignKey, Integer, String, text
from sqlmodel import Field, Index, SQLModel


class Decision(SQLModel, table=True):
    __tablename__ = "decisions"

    id: int | None = Field(default=None, primary_key=True)
    session_id: str | None = Field(
        default=None,
        sa_column=Column(
            String,
            ForeignKey("sessions.session_id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    task_id: int | None = Field(
        default=None,
        sa_column=Column(
            Integer,
            ForeignKey("tasks.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    dedup_key: str  # hash(session_id, prompt) — partial-unique while status='pending'
    prompt: str
    options: list[Any] = Field(
        default_factory=list, sa_column=Column(JSON, nullable=False)
    )
    status: str = Field(default="pending")  # pending / answered
    answer: str | None = None
    answered_at: datetime | None = None
    answered_by: str | None = None  # dashboard / telegram / cli
    created_at: datetime = Field(default_factory=datetime.utcnow)

    __table_args__ = (
        # HITL-02: partial UNIQUE on dedup_key WHERE status='pending'
        Index(
            "uq_decisions_pending_dedup_key",
            "dedup_key",
            unique=True,
            sqlite_where=text("status = 'pending'"),
        ),
        Index("idx_decisions_status_created", "status", "created_at"),
        Index("idx_decisions_session_id", "session_id"),
        Index("idx_decisions_task_id", "task_id"),
    )
