"""Response schemas for SAPI-* (system) routes.

DTOs supplied here for Wave 1 plan 03-02 to consume:
  - SystemHealthResponse: GET /api/system/health (SAPI-02)
  - SystemStateResponse:  GET /api/system/state  (SAPI-03)
  - AttentionResponse:    GET /api/system/attention (SAPI-04)
  - FirehoseEvent:        SSE data payload for /api/system/firehose (SAPI-05)
"""

from typing import Any, Literal

from pydantic import BaseModel


class DaemonAge(BaseModel):
    """Per-daemon age tuple used by SystemHealthResponse.daemon_ages."""

    key: str
    last_tick_at: str | None = None
    age_seconds: int | None = None


class SystemHealthResponse(BaseModel):
    """SAPI-02: aggregate liveness snapshot.

    `status` is "ok" when no degraded conditions; "degraded" when otel ingest
    is stale or a daemon hasn't ticked recently.
    """

    status: Literal["ok", "degraded"]
    uptime_seconds: int
    memory_rss_mb: float
    last_otel_event_age_seconds: int | None = None
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
    detail: str | None = None


class AttentionResponse(BaseModel):
    """SAPI-04: aggregate attention snapshot.

    Per Pitfall 7: Phase-4-deferred fields are present but explicitly zero
    (pending_decisions, failed_tasks, stuck_sessions, stale_dispatcher_seconds)
    so frontend can render the tray shape without conditional schema branches.
    """

    items: list[AttentionItem]
    pending_decisions: int
    failed_tasks: int
    stale_dispatcher_seconds: int | None = None
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
    session_id: str | None = None
    attrs_mcp_server: str | None = None
    attrs_mcp_tool: str | None = None


# ---- Phase 4 ESTOP extension (Plan 04-01) ----


class EmergencyStopResponse(BaseModel):
    """ESTOP-01..03: response from POST /api/system/emergency-stop.

    `emergency_stop` is always True in this response (the flag was just set).
    PID summary mirrors cmc.core.process.StopSummary.
    `failed_running_tasks` is the count of tasks UPDATEd to status='failed'.
    """

    emergency_stop: bool
    terminated_pids: list[int]
    skipped_pids: list[int]
    missing_pids: list[int]
    failed_running_tasks: int


class EmergencyResumeResponse(BaseModel):
    """ESTOP-04: response from POST /api/system/emergency-resume.

    `emergency_stop` is always False in this response (the flag was cleared).
    """

    emergency_stop: bool
