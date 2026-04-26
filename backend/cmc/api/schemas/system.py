"""Response schemas for SAPI-* (system) routes.

DTOs supplied here for Wave 1 plan 03-02 to consume:
  - SystemHealthResponse: GET /api/system/health (SAPI-02)
  - SystemStateResponse:  GET /api/system/state  (SAPI-03)
  - AttentionResponse:    GET /api/system/attention (SAPI-04)
  - FirehoseEvent:        SSE data payload for /api/system/firehose (SAPI-05)
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel


class DaemonAge(BaseModel):
    """Per-daemon age tuple used by SystemHealthResponse.daemon_ages."""

    key: str
    last_tick_at: Optional[str] = None
    age_seconds: Optional[int] = None


class SystemHealthResponse(BaseModel):
    """SAPI-02: aggregate liveness snapshot.

    `status` is "ok" when no degraded conditions; "degraded" when otel ingest
    is stale or a daemon hasn't ticked recently.
    """

    status: Literal["ok", "degraded"]
    uptime_seconds: int
    memory_rss_mb: float
    last_otel_event_age_seconds: Optional[int] = None
    daemon_ages: list[DaemonAge]
    tzname: str


class SystemStateResponse(BaseModel):
    """SAPI-03: whitelisted KV state snapshot. Missing keys are absent — caller
    should not assume any particular key is present."""

    items: dict[str, Any]


class AttentionItem(BaseModel):
    """One attention-tray entry surfaced by SAPI-04."""

    kind: str
    severity: Literal["info", "warning", "error"]
    count: int
    detail: Optional[str] = None


class AttentionResponse(BaseModel):
    """SAPI-04: aggregate attention snapshot.

    Per Pitfall 7: Phase-4-deferred fields are present but explicitly zero
    (pending_decisions, failed_tasks, stuck_sessions, stale_dispatcher_seconds)
    so frontend can render the tray shape without conditional schema branches.
    """

    items: list[AttentionItem]
    pending_decisions: int
    failed_tasks: int
    stale_dispatcher_seconds: Optional[int] = None
    stuck_sessions: int


class FirehoseEvent(BaseModel):
    """SAPI-05: SSE message data payload for the /api/system/firehose stream.

    `id`, `ts`, `event_name`, `session_id`, and the two MCP attribute columns
    are projected from the OtelEvent table; downstream UI uses `id` for cursor
    state and `event_name` for filtering.
    """

    id: int
    ts: str  # ISO 8601 UTC
    event_name: str
    session_id: Optional[str] = None
    attrs_mcp_server: Optional[str] = None
    attrs_mcp_tool: Optional[str] = None
