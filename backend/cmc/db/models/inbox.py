"""inbox table — agent-to-user inbox.

Per 01-01-SCHEMA.md (table 9). Drives HITL-04..07 / DISP-08 / HPNL-02 / TELE-02.

NOTE: class name is `InboxMessage` per the Plan 05 entry contract aggregator.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Column, ForeignKey, Integer, String
from sqlmodel import Field, Index, SQLModel


class InboxMessage(SQLModel, table=True):
    __tablename__ = "inbox"

    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: Optional[str] = Field(
        default=None,
        sa_column=Column(
            String,
            ForeignKey("sessions.session_id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    task_id: Optional[int] = Field(
        default=None,
        sa_column=Column(
            Integer,
            ForeignKey("tasks.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    subject: Optional[str] = None
    body: str
    read: bool = Field(default=False)
    read_at: Optional[datetime] = None
    reply: Optional[str] = None
    replied_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    __table_args__ = (
        Index("idx_inbox_read_created", "read", "created_at"),
        Index("idx_inbox_session_id", "session_id"),
        Index("idx_inbox_task_id", "task_id"),
    )
