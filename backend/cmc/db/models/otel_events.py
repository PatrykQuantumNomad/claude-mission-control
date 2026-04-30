"""otel_events table — append-only event log from OTEL /v1/logs.

Per 01-01-SCHEMA.md (table 4). Drives SAPI-05 / OBSV-05,08,10 / ACTV-03,05.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column, ForeignKey, String
from sqlmodel import Field, Index, SQLModel


class OtelEvent(SQLModel, table=True):
    __tablename__ = "otel_events"

    id: int | None = Field(default=None, primary_key=True)
    ts: datetime
    event_name: str
    # Soft FK: events may arrive before sessions row exists; ON DELETE SET NULL.
    session_id: str | None = Field(
        default=None,
        sa_column=Column(
            String,
            ForeignKey("sessions.session_id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    body: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    attrs_mcp_server: str | None = None
    attrs_mcp_tool: str | None = None
    received_at: datetime = Field(default_factory=datetime.utcnow)

    __table_args__ = (
        Index("idx_otel_events_ts_desc", "ts"),
        Index("idx_otel_events_event_name_ts", "event_name", "ts"),
        Index("idx_otel_events_session_id_ts", "session_id", "ts"),
        Index("idx_otel_events_attrs_mcp", "attrs_mcp_server", "attrs_mcp_tool"),
    )
