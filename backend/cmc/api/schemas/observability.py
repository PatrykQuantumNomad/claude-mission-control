"""Response schemas for OBSV-* (observability) routes.

All aggregate endpoints accept a `range` query param of type `RangeWindow` and
echo it back in their response so the UI can verify what window was actually
computed (RangeWindow.today defaults to local-day).
"""

from datetime import datetime

from pydantic import BaseModel

from cmc.api.schemas.common import RangeWindow

# ---- OBSV-01: tokens / day --------------------------------------------------

class TokenUsageDailyRow(BaseModel):
    """One (day, model, source) bucket from token_usage_daily."""

    day: str  # YYYY-MM-DD
    model: str
    source: str
    tokens_input: int
    tokens_output: int
    tokens_cache_read: int
    tokens_cache_create: int
    sessions_count: int


class TokenUsageResponse(BaseModel):
    items: list[TokenUsageDailyRow]
    range: RangeWindow


# ---- OBSV-02: cache hit-rate trend ------------------------------------------

class CacheTrendRow(BaseModel):
    """One day in the cache hit-rate trend.

    `low_sample` is True when billable_tokens < 10_000 — the UI dims the row
    to communicate that the hit_rate isn't statistically meaningful yet.
    """

    day: str  # YYYY-MM-DD
    hit_rate: float
    billable_tokens: int
    low_sample: bool


class CacheResponse(BaseModel):
    hit_rate: float
    trend: list[CacheTrendRow]
    range: RangeWindow
    low_sample: bool


# ---- OBSV-03: outcome breakdown ---------------------------------------------

class OutcomeDailyRow(BaseModel):
    day: str
    errored: int
    rate_limited: int
    truncated: int
    unfinished: int
    ok: int
    total: int


class OutcomesResponse(BaseModel):
    items: list[OutcomeDailyRow]
    range: RangeWindow


# ---- OBSV-04: tool latency table --------------------------------------------

class ToolLatencyRow(BaseModel):
    tool_name: str
    call_count: int
    p50_ms: int | None = None
    p95_ms: int | None = None
    max_ms: int | None = None
    error_rate: float


class ToolLatencyResponse(BaseModel):
    items: list[ToolLatencyRow]
    range: RangeWindow


# ---- OBSV-05: hook activity --------------------------------------------------

class HookActivityRow(BaseModel):
    day: str
    hook_name: str
    fires: int
    paired_duration_ms_p50: int | None = None


class HookActivityResponse(BaseModel):
    items: list[HookActivityRow]
    range: RangeWindow
    total_fires: int


# ---- OBSV-06: project rollup -------------------------------------------------

class ProjectRollupRow(BaseModel):
    cwd: str
    display_path: str
    sessions: int
    tokens_effective: int
    tool_calls: int
    pct_of_total: float


class ProjectRollupResponse(BaseModel):
    items: list[ProjectRollupRow]
    range: RangeWindow


# ---- OBSV-07: agent fanout ---------------------------------------------------

class AgentFanoutRow(BaseModel):
    session_id: str
    title: str | None = None
    agent_calls: int
    started_at: datetime


class AgentFanoutResponse(BaseModel):
    items: list[AgentFanoutRow]
    range: RangeWindow


# ---- OBSV-08: edit-decision rates --------------------------------------------

class EditDecisionRow(BaseModel):
    tool_name: str
    accepted: int
    rejected: int
    accept_rate: float
    low_sample: bool


class EditDecisionsResponse(BaseModel):
    items: list[EditDecisionRow]
    range: RangeWindow


# ---- OBSV-09: developer productivity (git-derived) --------------------------

class ProductivityResponse(BaseModel):
    commits: int
    pull_requests: int
    lines_added: int
    lines_removed: int
    range: RangeWindow


# ---- OBSV-10: pressure indicators (errors, retries, compaction) -------------

class ApiErrorEntry(BaseModel):
    ts: datetime
    session_id: str | None = None
    message: str


class PressureResponse(BaseModel):
    api_retries_exhausted: int
    compaction_count: int
    recent_api_errors: list[ApiErrorEntry]


# ---- ACTV-01 heatmap + ACTV-05 unified failures -----------------------------


class HeatmapDayRow(BaseModel):
    """ACTV-01: one day in the 30-day session-activity heatmap.

    `tokens_effective` matches the OBSV-06 by-project columnsum
    (input + output + cache_read + cache_create) so the panel can claim
    consistent token semantics across cards.
    """

    day: str  # YYYY-MM-DD (local-time bucket)
    sessions: int
    tokens_effective: int


class HeatmapResponse(BaseModel):
    items: list[HeatmapDayRow]
    range: str  # echoed back so the UI can verify what window was computed


class FailureRow(BaseModel):
    """ACTV-05 row: one failed session with its most-recent api_error message.

    `outcome` is one of {'errored', 'rate_limited'}. `last_error_message` is
    None when an api_error event hasn't been ingested yet for this session
    (the row may have been classified as rate_limited via api_retries_exhausted
    rather than api_error).
    """

    session_id: str
    started_at: datetime
    outcome: str  # 'errored' | 'rate_limited'
    last_error_message: str | None = None


class FailuresResponse(BaseModel):
    items: list[FailureRow]
    range: str
