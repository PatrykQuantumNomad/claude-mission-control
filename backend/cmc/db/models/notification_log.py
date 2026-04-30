"""notification_log table — Telegram notification deduplication ledger.

Per 01-01-SCHEMA.md (table 15). Drives TELE-02..06.

TELE-04: UNIQUE(kind, entity_id, chat_id) prevents the 30s notifier loop from
re-sending the same notification for the same entity within a window.
"""

from datetime import datetime

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, Index, SQLModel


class NotificationLog(SQLModel, table=True):
    __tablename__ = "notification_log"

    id: int | None = Field(default=None, primary_key=True)
    kind: str  # decision / approval / failure / overdue_schedule / inbox
    entity_id: str  # stringified id of the referenced entity
    sent_at: datetime = Field(default_factory=datetime.utcnow)
    chat_id: str | None = None
    message_id: str | None = None
    snoozed_until: datetime | None = None
    status: str = Field(default="sent")  # sent / failed / snoozed

    __table_args__ = (
        # TELE-04 dedup constraint
        UniqueConstraint(
            "kind",
            "entity_id",
            "chat_id",
            name="uq_notification_log_kind_entity_chat",
        ),
        Index("idx_notification_log_sent_at_desc", "sent_at"),
        Index("idx_notification_log_snoozed_until", "snoozed_until"),
    )
