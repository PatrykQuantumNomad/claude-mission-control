"""mcp_stats table — MCP per-server / per-tool aggregates rebuilt by MCP-03.

Per 01-01-SCHEMA.md (table 12). Drives MCP-01..04 / OPNL-15 / SKLP-01.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, Index, SQLModel


class MCPStat(SQLModel, table=True):
    __tablename__ = "mcp_stats"

    id: Optional[int] = Field(default=None, primary_key=True)
    server_name: str
    # NULL = server-level row (MCP-01); non-NULL = per-tool (MCP-02).
    tool_name: Optional[str] = None
    call_count: int = Field(default=0)
    error_count: int = Field(default=0)
    latency_p50_ms: Optional[float] = None
    latency_p95_ms: Optional[float] = None
    latency_max_ms: Optional[float] = None
    schema_size_bytes: Optional[int] = None
    # provenance per MCP-02: "tool_decision" / "tools" / "otel"
    source_priority: str
    computed_at: datetime = Field(default_factory=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("server_name", "tool_name", name="uq_mcp_stats_server_tool"),
        Index("idx_mcp_stats_server", "server_name"),
    )
