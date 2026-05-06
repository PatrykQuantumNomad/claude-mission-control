"""Response schemas for SKILL-* (skills catalog) routes.

DTOs supplied here:
  - GET   /api/skills                 -> SkillListResponse        (SKILL-01)
  - POST  /api/skills/sync             -> SkillSyncResponse        (SKILL-02)
  - PATCH /api/skills/{name}/autonomy -> SkillAutonomyResponse    (SKILL-03)

Phase 14 adds (SKIL-04..07) — all read-time-computed:
  - GET   /api/skills/usage            -> SkillUsageResponse       (SKIL-04)
  - GET   /api/skills/{name}/cost      -> SkillCostResponse        (SKIL-05)
  - GET   /api/skills/{name}/latency   -> SkillLatencyResponse     (SKIL-06)
  - GET   /api/skills/{name}/runs      -> SkillRunsResponse        (SKIL-07)

Decimal-as-JSON-string is locked by Pydantic v2 default — DO NOT pipe
through fastapi.encoders.jsonable_encoder (silent float coercion).

`autonomy` is one of "auto" | "review" | "manual" — the SkillAutonomyPatch
schema enforces this at the request boundary.
"""

from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from cmc.api.schemas.common import ORMBase, UTCDatetime

# Phase 14 range alias — narrower than CostRange (1d/7d not used by skill panels).
SkillRange = Literal["14d", "30d"]


# ---- Phase 19 (SKLP-09) period-over-period delta pill --------------------


class DeltaPill(BaseModel):
    """SKLP-09 — server-computed period-over-period delta.

    Curr/prev/delta as Decimal so the same shape works for both integer
    counts (usage) and Decimal cost (money). Pydantic v2 serializes Decimal
    as a JSON string; the frontend treats both numeric and string
    serializations as opaque "render this number" payloads.

    delta_pct == None when prev == 0 (avoid div-by-zero / infinity); the UI
    renders '—' instead of fabricating a +0% / +inf%.

    direction is the rendered arrow:
      - 'up'   when delta > 0 (more activations / more cost)
      - 'down' when delta < 0
      - 'flat' when delta == 0
    Color/sign treatment is the frontend's responsibility — backend just
    declares the sign.
    """

    curr: Decimal
    prev: Decimal
    delta: Decimal
    delta_pct: float | None
    direction: Literal["up", "down", "flat"]


class SkillRow(ORMBase):
    """One skill in the catalog (project + user environments combined)."""

    name: str
    environment: str
    user_invocable: bool
    autonomy: str
    description: str | None = None
    path: str
    updated_at: UTCDatetime


class SkillListResponse(BaseModel):
    items: list[SkillRow]


class SkillSyncResponse(BaseModel):
    """SKILL-02: scan summary across project + user skills directories."""

    status: str
    found: int
    upserted: int
    unchanged: int
    errors: int
    duration_ms: int


class SkillAutonomyPatch(BaseModel):
    """SKILL-03: autonomy override request body."""

    autonomy: Literal["auto", "review", "manual"]


class SkillAutonomyResponse(ORMBase):
    """SKILL-03: confirmation echoing the new autonomy value + updated_at."""

    name: str
    autonomy: str
    updated_at: UTCDatetime


# ---- Phase 14 (SKIL-04..07) response models ------------------------------


class SkillSparklineRow(BaseModel):
    """One day-bucket point for a sparkline.

    Used by both SkillUsageResponse (invocations only; cost_usd unset) AND
    SkillCostResponse.trend (invocations=0, cost_usd populated). Keeping a
    single shape avoids two near-duplicate types.
    """

    day: str  # YYYY-MM-DD (STRFTIME('%Y-%m-%d', ts, 'localtime'))
    invocations: int
    cost_usd: Decimal | None = None


class SkillUsageRow(BaseModel):
    """One row of SkillUsageResponse — top-N skill + per-day sparkline.

    Phase 19 (SKLP-09 / SKLP-10) extensions:
      - `usage_delta`: 7d-vs-prev-7d invocation count delta (server-computed).
      - `badges`: list of zero or more derived markers — 'new_this_week'
        (first_activated_at within last 7d UTC) and/or 'dormant'
        (last_activated_at older than 30d UTC AND skill is >= 14d old —
        cold-start suppression). All thresholds use SQLite
        datetime('now', '-N days') in UTC, never the 'localtime' modifier
        (DST safety, ROADMAP success criterion #5).
    """

    skill_name: str
    total: int
    sparkline: list[SkillSparklineRow]
    # Phase 19 — SKLP-09 (period-over-period delta):
    usage_delta: DeltaPill
    # Phase 19 — SKLP-10 (new/dormant markers; cold-start-suppressed):
    badges: list[Literal["new_this_week", "dormant"]] = Field(default_factory=list)


class SkillUsageResponse(BaseModel):
    """SKIL-04: top-N skills by invocation count + per-day sparkline.

    Empty range -> rows=[], NOT 404.
    """

    range: SkillRange
    rows: list[SkillUsageRow]


class SkillCostResponse(BaseModel):
    """SKIL-05: per-skill cost with dual-path attribution (D-02).

    `cost_attribution` exposes which JOIN strategy produced the numbers:
      - "request": (session_id, request_id) JOIN to api_request events
      - "session": fallback — SUM(sessions.tokens_*) for sessions that
        fired this skill (Phase 13 LOCK-9 baseline)

    `trend` is a 14-day daily cost bucket; `invocations` on each row is 0
    (the panel renders cost_usd, not invocation count).
    """

    range: SkillRange
    name: str
    rates_as_of: date | None
    tokens_input: int = 0
    tokens_output: int = 0
    tokens_cache_read: int = 0
    tokens_cache_create_5m: int = 0
    tokens_cache_create_1h: int = 0
    cost_usd: Decimal  # Pydantic v2: serialized as JSON string
    cost_attribution: Literal["request", "session"]
    trend: list[SkillSparklineRow]
    # Phase 19 — SKLP-09 (period-over-period cost delta):
    cost_delta: DeltaPill


class SkillLatencyResponse(BaseModel):
    """SKIL-06: per-skill latency percentiles + error rate.

    `low_sample` is server-side computed via MIN_LATENCY_SAMPLES=30
    (SKLP-05 — server is source of truth; frontend re-asserts for
    defense-in-depth). When sample_count == 0, all percentiles are
    None and low_sample=True (empty-state, NOT failure).
    """

    range: SkillRange
    name: str
    sample_count: int
    p50_ms: int | None
    p95_ms: int | None
    max_ms: int | None
    error_count: int
    error_rate: float
    low_sample: bool


class SkillRunRow(BaseModel):
    """One row of SkillRunsResponse — recent invocation."""

    ts: UTCDatetime
    session_id: str | None
    cwd: str
    request_id: str | None


class SkillRunsResponse(BaseModel):
    """SKIL-07: recent skill invocations (ts DESC, cwd LEFT JOINed)."""

    name: str
    rows: list[SkillRunRow]


# ---- Phase 19 (SKLP-08) per-project breakdown ----------------------------


class SkillProjectRow(BaseModel):
    """One row of SkillProjectsResponse — per-project rollup of a skill's runs.

    SKLP-08 invariant: the response shape leaks no filesystem paths.
    The ONLY project-shaped value is project_key (sha1[:12] of
    realpath(cwd)). NEVER add a 'cwd', 'path', 'display_path', or any
    other filesystem-shaped field to this schema. ROADMAP success
    criterion #1 is structural — enforced here AND in the
    no-path-leakage test (test_skills_router.py).
    """

    project_key: str  # 12-char hex; '' is excluded from rollups by the SQL
    count: int
    p50_ms: int | None  # null when no completed runs (duration_ms IS NULL)
    p95_ms: int | None
    cost_usd: Decimal  # serialized as JSON string per Pydantic v2 default
    cost_attribution: Literal["session", "approximate"]
    low_sample: bool  # count < MIN_LATENCY_SAMPLES (30)


class SkillProjectsResponse(BaseModel):
    """SKLP-08 — per-project breakdown for one skill on /skills/{name}."""

    name: str
    range: SkillRange
    rows: list[SkillProjectRow]
