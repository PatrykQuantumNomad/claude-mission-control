"""Response schemas for MCP-* (MCP server/tool catalog) routes.

DTOs supplied here for Wave 1 plan 03-05's MCP router to consume:
  - GET  /api/mcp/servers          -> McpServerListResponse  (MCP-01)
  - GET  /api/mcp/servers/{n}/tools -> McpToolsResponse      (MCP-02)
  - POST /api/mcp/sync              -> McpSyncResponse        (MCP-03)
  - POST /api/mcp/measure           -> McpMeasureResponse     (MCP-04)

`source_priority` reflects the materializer's chosen authority for each row
(tool_decision > tools > otel — see RESEARCH §MCP catalog stack).
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel

from cmc.api.schemas.common import ORMBase


class McpServerRow(ORMBase):
    """One MCP server in the catalog with rolled-up call/latency stats."""

    server_name: str
    call_count: int
    error_count: int
    latency_p50_ms: Optional[float] = None
    latency_p95_ms: Optional[float] = None
    latency_max_ms: Optional[float] = None
    source_priority: str
    computed_at: datetime


class McpServerListResponse(BaseModel):
    items: list[McpServerRow]


class McpToolRow(ORMBase):
    """One MCP tool under a parent server with rolled-up call/latency stats."""

    server_name: str
    tool_name: str
    call_count: int
    error_count: int
    latency_p50_ms: Optional[float] = None
    latency_p95_ms: Optional[float] = None
    latency_max_ms: Optional[float] = None
    source_priority: str
    schema_size_bytes: Optional[int] = None


class McpToolsResponse(BaseModel):
    server_name: str
    items: list[McpToolRow]


class McpSyncResponse(BaseModel):
    """MCP-03: catalog rebuild summary.

    `source_counts` is keyed by source name (`tool_decision`, `tools`, `otel`)
    and counts how many rows the materializer attributed to each authority on
    this run.
    """

    status: Literal["ok", "conflict"]
    servers: int
    tools: int
    source_counts: dict[str, int]
    duration_ms: int


class McpMeasureResponse(BaseModel):
    """MCP-04: latency-recompute summary."""

    status: str
    servers_measured: int
    duration_ms: int
