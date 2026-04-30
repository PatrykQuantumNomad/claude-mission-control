"""tools table — paired tool_use/tool_result events.

Per 01-01-SCHEMA.md (table 3). Drives INGST-03 / SESS-02 / OBSV-04,07,08 /
MCP-02 / OPNL-04,08,12.

NOTE: 01-01-SCHEMA.md uses table name `tools` and the row covers a single
"tool call" (paired tool_use + tool_result). Class name is `ToolCall` per the
Plan 05 entry contract (matches __init__.py aggregator).

NOTE: SCHEMA flags `decision` column linkage as [NEEDS USER CONFIRMATION] —
accepted as-is per APPROVED 2026-04-25 (column on this row, not separate
edit_decisions table).
"""

from datetime import datetime

from sqlalchemy import Column, ForeignKey, String, UniqueConstraint
from sqlmodel import Field, Index, SQLModel


class ToolCall(SQLModel, table=True):
    __tablename__ = "tools"

    id: int | None = Field(default=None, primary_key=True)
    tool_use_id: str
    session_id: str = Field(
        sa_column=Column(
            String,
            ForeignKey("sessions.session_id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    tool_name: str
    started_at: datetime
    ended_at: datetime | None = None
    duration_ms: int | None = None  # capped at 600_000 by INGST-03
    status: str  # ok / error / pending
    error_message: str | None = None
    input_summary: str | None = None
    mcp_server_name: str | None = None
    mcp_tool_name: str | None = None
    decision: str | None = None  # accept / reject for edit-class tools (OBSV-08)

    __table_args__ = (
        UniqueConstraint("tool_use_id", name="uq_tools_tool_use_id"),
        Index("idx_tools_session_id", "session_id"),
        Index("idx_tools_name_started_at", "tool_name", "started_at"),
        Index("idx_tools_mcp_server_tool", "mcp_server_name", "mcp_tool_name"),
    )
