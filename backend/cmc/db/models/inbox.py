"""inbox table — agent-to-user inbox.

Per 01-01-SCHEMA.md (table 9). Drives HITL-04..07 / DISP-08 / HPNL-02 / TELE-02.

NOTE: class name is `InboxMessage` so it reads clearly at call sites and in the
models package aggregator.
"""

from datetime import datetime

from sqlalchemy import Column, ForeignKey, Integer, String
from sqlmodel import Field, Index, SQLModel


class InboxMessage(SQLModel, table=True):
    __tablename__ = "inbox"

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
    subject: str | None = None
    body: str
    read: bool = Field(default=False)
    read_at: datetime | None = None
    reply: str | None = None
    replied_at: datetime | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    __table_args__ = (
        Index("idx_inbox_read_created", "read", "created_at"),
        Index("idx_inbox_session_id", "session_id"),
        Index("idx_inbox_task_id", "task_id"),
    )
