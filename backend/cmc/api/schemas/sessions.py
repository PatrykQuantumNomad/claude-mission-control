"""Response schemas for SESS-* (sessions) routes.

DTOs supplied here:
  - SessionListResponse:    GET /api/sessions          (SESS-01)
  - SessionDetailsResponse: GET /api/sessions/{id}     (SESS-02 + SESS-03 timeline)
  - LiveSessionItem/State:  GET /api/sessions/live*    (SESS-04, SESS-05)
  - FollowUpMessageRequest: POST /api/sessions/{id}/follow-up (SESS-06)
  - TodaySummaryResponse:   GET /api/sessions/today    (SESS-07)
  - SessionCompareResponse: GET /api/sessions/compare  (CMPR-01..04)
"""

from decimal import Decimal

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


# ---- CMPR-01..04 (Phase 16): /api/sessions/compare ----------------------


class SessionCompareSide(BaseModel):
    """One side of the compare payload — paired session metrics + skill set
    + read-time-computed cost.

    Plain BaseModel (NOT ORMBase) because the handler builds this from a
    composition of: a Session ORM row + computed cost (Decimal) + skills
    list (read-time SQL) + tool_counts dict (read-time SQL or {} when
    over_cap) — not a single ORM row.

    `cost_usd` is `Decimal` so Pydantic v2 emits a JSON string (Phase 13/14
    lock — frontend MUST template-literal display, NEVER `Number(...)`).
    Every datetime field uses `UTCDatetime` so the project-wide PlainSerializer
    forces a `Z` suffix on JSON output (Phase 15 hotfix e3e7838).
    """

    session_id: str
    started_at: UTCDatetime
    ended_at: UTCDatetime | None = None
    duration_ms: int | None = None
    cwd: str | None = None
    model: str | None = None
    source: str | None = None
    outcome: str | None = None  # read-time classified: errored/rate_limited/truncated/unfinished/ok
    tokens_input: int
    tokens_output: int
    tokens_cache_read: int
    tokens_cache_create_5m: int
    tokens_cache_create_1h: int
    tool_call_count: int
    message_count: int
    cost_usd: Decimal  # serialized as JSON string by Pydantic v2 default
    skills_used: list[str]  # DISTINCT attrs_skill_name for skill_activated events, sorted ASC
    # Phase 23 (CMPR-06): per-skill p95 latency (ms) for this side.
    # Keys are skill names; values are integer milliseconds.
    skill_latencies: dict[str, int] = Field(default_factory=dict)
    over_cap: bool  # True iff tool_call_count > 500 (CMPR-04)
    tool_counts: dict[str, int]  # {} when over_cap; else {tool_name: count}


class SkillSetDiff(BaseModel):
    """Set diff between two sessions' skill sets.

    shared = a ∩ b, only_a = a - b, only_b = b - a (sorted ASC).
    """

    shared: list[str]
    only_a: list[str]
    only_b: list[str]


class SessionCompareResponse(BaseModel):
    """CMPR-01: paired session metrics + skill-set diff in a single payload.

    `rates_as_of` is the max effective_from across the two models touched
    (single top-level field per Phase 16 decisions §4). `over_cap` is True
    iff either side exceeded the 500-tool-call cap; clients use this to
    branch render the "summary metrics only" fallback (CMPR-04).
    """

    a: SessionCompareSide
    b: SessionCompareSide
    skill_diff: SkillSetDiff
    rates_as_of: UTCDatetime | None = None
    over_cap: bool
    cap: int = 500
    # Phase 23 (CMPR-06): low-sample gating for per-skill latency deltas.
    # MUST be top-level (not nested under sides).
    low_sample_a: bool = False
    low_sample_b: bool = False
