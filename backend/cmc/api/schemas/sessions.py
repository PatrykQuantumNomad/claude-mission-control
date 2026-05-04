"""Response schemas for SESS-* (sessions) routes.

DTOs supplied here:
  - SessionListResponse:    GET /api/sessions          (SESS-01)
  - SessionDetailsResponse: GET /api/sessions/{id}     (SESS-02 + SESS-03 timeline)
  - LiveSessionItem/State:  GET /api/sessions/live*    (SESS-04, SESS-05)
  - FollowUpMessageRequest: POST /api/sessions/{id}/follow-up (SESS-06)
  - TodaySummaryResponse:   GET /api/sessions/today    (SESS-07)
"""

from pydantic import BaseModel, Field

from cmc.api.schemas.common import ORMBase, UTCDatetime


class SessionListItem(ORMBase):
    """Row in SESS-01 list response. Mirrors Session ORM columns directly so
    `SessionListItem.model_validate(session_row)` works (ORMBase enables this)."""

    session_id: str
    started_at: UTCDatetime
    ended_at: UTCDatetime | None = None
    cwd: str | None = None
    model: str | None = None
    source: str | None = None
    outcome: str | None = None
    tokens_input: int
    tokens_output: int
    tokens_cache_read: int
    tokens_cache_create: int
    tool_call_count: int
    message_count: int


class SessionListResponse(BaseModel):
    """SESS-01: paginated list of sessions."""

    items: list[SessionListItem]
    total: int
    limit: int
    offset: int


class ToolTimelineEntry(ORMBase):
    """SESS-03 timeline row — one tool call invocation snapshot."""

    tool_use_id: str
    tool_name: str
    started_at: UTCDatetime
    ended_at: UTCDatetime | None = None
    duration_ms: int | None = None
    status: str
    input_summary: str | None = None
    mcp_server_name: str | None = None
    mcp_tool_name: str | None = None
    decision: str | None = None


class SessionDetailsResponse(BaseModel):
    """SESS-02: a single session with its tool timeline (SESS-03)."""

    session: SessionListItem
    tools: list[ToolTimelineEntry]


class LiveSessionItem(ORMBase):
    """SESS-04: live-sessions index row."""

    session_id: str
    started_at: UTCDatetime
    last_activity_at: UTCDatetime | None = None
    state: str | None = None
    current_tool: str | None = None
    model: str | None = None


class LiveSessionState(ORMBase):
    """SESS-05: live-session state snapshot for SSE handshake / poll."""

    session_id: str
    last_activity_at: UTCDatetime
    state: str
    current_message: str | None = None
    current_tool: str | None = None
    pid: int | None = None
    updated_at: UTCDatetime


class FollowUpMessageRequest(BaseModel):
    """SESS-06: queue body. 1..10000 char message; longer messages are rejected
    at the schema layer to keep queue files bounded."""

    message: str = Field(min_length=1, max_length=10000)


class FollowUpMessageResponse(BaseModel):
    """SESS-06: queue confirmation."""

    queued: bool
    session_id: str
    queue_path: str


class TodaySummaryResponse(BaseModel):
    """SESS-07: today's at-a-glance totals (local-day window)."""

    date: str  # YYYY-MM-DD in local tz
    sessions_count: int
    tokens_input_total: int
    tokens_output_total: int
    tokens_cache_read_total: int
    tokens_cache_create_total: int
    tool_call_count: int
    error_count: int
