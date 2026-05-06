"""Phase 13 cost-engine endpoints — read-time Decimal compute, no $ stored.

Endpoints:
  GET /api/cost/summary?range=          -> CostSummaryResponse
  GET /api/cost/breakdown?dim=&range=   -> CostBreakdownResponse
  GET /api/pricing/freshness            -> PricingFreshnessResponse  (no range)

Range enum: 1d | 7d | 14d | 30d (anything else -> 422 from FastAPI Literal validator).
Breakdown dim: model | skill | project.

ANLY-03: cost is computed at read time by JOINing token totals to the pricing table's
effective_from/effective_until window. Adding a new pricing row backdates effective_until
on the prior row, so historical totals self-correct WITHOUT data migration.

NEVER use fastapi.encoders.jsonable_encoder on a Decimal (silent precision loss).

dim=skill is session-scoped attribution in Phase 13 (LOCK-9 in SPIKE.md):
ALL tokens of any session that fired skill X are attributed to skill X.
Two skills fired in the same session WILL show the same cost number — Phase 14
will refine to request-scoped attribution via api_request token JOIN.
"""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.api.schemas.cost import (
    BreakdownDim,
    CostBreakdownResponse,
    CostBreakdownRow,
    CostByModelRow,
    CostForecastResponse,
    CostRange,
    CostSummaryResponse,
    PricingFreshnessResponse,
)
from cmc.core.time import now_utc
from cmc.cost.forecast import (
    days_elapsed_in_month,
    days_in_month,
    decimal_ols,
    project_month_total,
)
from cmc.db import get_session
from cmc.pricing import compute_cost, load_rates, pricing_json_hash

router = APIRouter(tags=["cost"])

_RANGE_TO_DAYS: dict[str, int] = {"1d": 1, "7d": 7, "14d": 14, "30d": 30}


def _range_start(range_: str) -> datetime:
    """Return the inclusive lower bound for the range filter (UTC, naive).

    Matches the convention used by token_usage.day (DATE) and otel_events.ts
    (datetime stored as naive-UTC).
    """
    return datetime.now(UTC).replace(tzinfo=None) - timedelta(days=_RANGE_TO_DAYS[range_])


def _coerce_effective_from(rates: dict[str, dict], model: str) -> date | None:
    """Pull effective_from out of a rates dict and coerce to date if needed."""
    if model not in rates:
        return None
    ef = rates[model].get("effective_from")
    if ef is None:
        return None
    return ef.date() if isinstance(ef, datetime) else ef


# ----- /api/cost/summary -------------------------------------------------

# Aggregates from token_usage (daily rollup). The cache TTL split columns
# (tokens_cache_create_5m / _1h) come from Plan 02 migration + Plan 03 parser.
_SUMMARY_SQL = text("""
    SELECT
      model,
      COALESCE(SUM(tokens_input), 0)            AS tokens_input,
      COALESCE(SUM(tokens_output), 0)           AS tokens_output,
      COALESCE(SUM(tokens_cache_read), 0)       AS tokens_cache_read,
      COALESCE(SUM(tokens_cache_create_5m), 0)  AS tokens_cache_create_5m,
      COALESCE(SUM(tokens_cache_create_1h), 0)  AS tokens_cache_create_1h
    FROM token_usage
    WHERE day >= DATE(:since)
    GROUP BY model
""")


@router.get("/cost/summary", response_model=CostSummaryResponse)
async def cost_summary(
    db: AsyncSession = Depends(get_session),
    range_: CostRange = Query("7d", alias="range"),
) -> CostSummaryResponse:
    rates = await load_rates(db)
    since_dt = _range_start(range_)
    rows = (await db.execute(_SUMMARY_SQL, {"since": since_dt.date().isoformat()})).mappings().all()
    items: list[CostByModelRow] = []
    total = Decimal(0)
    rates_dates: list[date] = []
    for r in rows:
        cost = compute_cost(
            r["model"],
            int(r["tokens_input"] or 0),
            int(r["tokens_output"] or 0),
            int(r["tokens_cache_read"] or 0),
            int(r["tokens_cache_create_5m"] or 0),
            int(r["tokens_cache_create_1h"] or 0),
            rates,
        )
        total += cost
        ef = _coerce_effective_from(rates, r["model"])
        if ef is not None:
            rates_dates.append(ef)
        items.append(CostByModelRow(
            model=r["model"],
            tokens_input=int(r["tokens_input"] or 0),
            tokens_output=int(r["tokens_output"] or 0),
            tokens_cache_read=int(r["tokens_cache_read"] or 0),
            tokens_cache_create_5m=int(r["tokens_cache_create_5m"] or 0),
            tokens_cache_create_1h=int(r["tokens_cache_create_1h"] or 0),
            cost_usd=cost,
        ))
    rates_as_of = max(rates_dates) if rates_dates else None
    return CostSummaryResponse(
        range=range_, rates_as_of=rates_as_of, total_usd=total, by_model=items,
    )


# ----- /api/cost/breakdown -----------------------------------------------

_BREAKDOWN_BY_MODEL_SQL = text("""
    SELECT
      model AS key,
      COALESCE(SUM(tokens_input), 0)            AS tokens_input,
      COALESCE(SUM(tokens_output), 0)           AS tokens_output,
      COALESCE(SUM(tokens_cache_read), 0)       AS tokens_cache_read,
      COALESCE(SUM(tokens_cache_create_5m), 0)  AS tokens_cache_create_5m,
      COALESCE(SUM(tokens_cache_create_1h), 0)  AS tokens_cache_create_1h,
      model                                     AS model
    FROM token_usage
    WHERE day >= DATE(:since)
    GROUP BY model
""")

# By skill: session-scoped attribution per SPIKE.md LOCK-9. ALL tokens of any
# session that fired skill X are attributed to skill X. Phase 14 will refine
# to request-scoped attribution via an api_request token JOIN.
#
# We pick MAX(s.model) as the pricing-key for the row — within a single session
# the model is effectively constant, so MAX is just "pick the one model".
_BREAKDOWN_BY_SKILL_SQL = text("""
    SELECT
      o.attrs_skill_name AS key,
      COALESCE(SUM(s.tokens_input), 0)            AS tokens_input,
      COALESCE(SUM(s.tokens_output), 0)           AS tokens_output,
      COALESCE(SUM(s.tokens_cache_read), 0)       AS tokens_cache_read,
      0                                           AS tokens_cache_create_5m,
      0                                           AS tokens_cache_create_1h,
      MAX(s.model)                                AS model
    FROM otel_events o
    JOIN sessions s ON s.session_id = o.session_id
    WHERE o.event_name = 'skill_activated'
      AND o.attrs_skill_name IS NOT NULL
      AND o.ts >= :since
    GROUP BY o.attrs_skill_name
""")

# By project: project_key rollup (sha1[:12] of realpath(cwd)). Phase 19's
# 0003_project_key migration added sessions.project_key; mirror the
# skills router's _PROJECTS_TOKEN_SQL discipline (skills.py per Phase 19
# Plan 02): WHERE s.project_key != '' EXCLUDES the empty-key sentinel
# rows (legacy sessions whose cwd was missing/None at ingest time).
#
# 20-RESEARCH.md Pitfall 1 — naive cwd→project_key swap without the
# WHERE filter would surface a phantom "" bucket. ROADMAP Phase 20
# success criterion #3 inherits Phase 19's path-leakage prohibition
# (SKLP-08): the response `key` field MUST be project_key, never cwd.
# Structural guard pinned by tests/test_cost_no_path_leakage.py.
_BREAKDOWN_BY_PROJECT_SQL = text("""
    SELECT
      s.project_key                               AS key,
      COALESCE(SUM(s.tokens_input), 0)            AS tokens_input,
      COALESCE(SUM(s.tokens_output), 0)           AS tokens_output,
      COALESCE(SUM(s.tokens_cache_read), 0)       AS tokens_cache_read,
      0                                           AS tokens_cache_create_5m,
      0                                           AS tokens_cache_create_1h,
      MAX(s.model)                                AS model
    FROM sessions s
    WHERE s.started_at >= :since
      AND s.project_key != ''
    GROUP BY s.project_key
""")


@router.get("/cost/breakdown", response_model=CostBreakdownResponse)
async def cost_breakdown(
    db: AsyncSession = Depends(get_session),
    dim: BreakdownDim = Query(..., description="model | skill | project"),
    range_: CostRange = Query("7d", alias="range"),
) -> CostBreakdownResponse:
    rates = await load_rates(db)
    since_dt = _range_start(range_)
    if dim == "model":
        params = {"since": since_dt.date().isoformat()}
        rows = (await db.execute(_BREAKDOWN_BY_MODEL_SQL, params)).mappings().all()
    elif dim == "skill":
        params = {"since": since_dt.isoformat()}
        rows = (await db.execute(_BREAKDOWN_BY_SKILL_SQL, params)).mappings().all()
    else:  # project
        params = {"since": since_dt.isoformat()}
        rows = (await db.execute(_BREAKDOWN_BY_PROJECT_SQL, params)).mappings().all()

    out: list[CostBreakdownRow] = []
    total = Decimal(0)
    rates_dates: list[date] = []
    for r in rows:
        # For model dim, the pricing-key is the row key. For skill/project, MAX(s.model).
        model_for_pricing = r["key"] if dim == "model" else (r["model"] or "<unknown>")
        cost = compute_cost(
            model_for_pricing,
            int(r["tokens_input"] or 0),
            int(r["tokens_output"] or 0),
            int(r["tokens_cache_read"] or 0),
            int(r["tokens_cache_create_5m"] or 0),
            int(r["tokens_cache_create_1h"] or 0),
            rates,
        )
        total += cost
        ef = _coerce_effective_from(rates, model_for_pricing)
        if ef is not None:
            rates_dates.append(ef)
        out.append(CostBreakdownRow(
            key=r["key"] or "<unknown>",
            tokens_input=int(r["tokens_input"] or 0),
            tokens_output=int(r["tokens_output"] or 0),
            tokens_cache_read=int(r["tokens_cache_read"] or 0),
            tokens_cache_create_5m=int(r["tokens_cache_create_5m"] or 0),
            tokens_cache_create_1h=int(r["tokens_cache_create_1h"] or 0),
            cost_usd=cost,
        ))
    rates_as_of = max(rates_dates) if rates_dates else None
    return CostBreakdownResponse(
        range=range_, dim=dim, rates_as_of=rates_as_of,
        total_usd=total, rows=out,
    )


# ----- /api/cost/forecast ------------------------------------------------

# Forecast over the last 14 COMPLETE days of token_usage (today excluded
# per D-02). Read-time computation; no $ stored. Decimal-only OLS lives in
# cmc.cost.forecast; this handler is the SQL+pricing wiring + envelope build.
_FORECAST_BASELINE_SQL = text("""
    SELECT
      day,
      model,
      COALESCE(SUM(tokens_input), 0)            AS tokens_input,
      COALESCE(SUM(tokens_output), 0)           AS tokens_output,
      COALESCE(SUM(tokens_cache_read), 0)       AS tokens_cache_read,
      COALESCE(SUM(tokens_cache_create_5m), 0)  AS tokens_cache_create_5m,
      COALESCE(SUM(tokens_cache_create_1h), 0)  AS tokens_cache_create_1h
    FROM token_usage
    WHERE day >= DATE(:since_baseline)
      AND day <= DATE(:until_baseline)
    GROUP BY day, model
    ORDER BY day ASC
""")

# MTD: month_start <= day <= today (inclusive of today; today's row may
# reflect partial accumulation but MTD legitimately includes that).
_FORECAST_MTD_SQL = text("""
    SELECT
      day,
      model,
      COALESCE(SUM(tokens_input), 0)            AS tokens_input,
      COALESCE(SUM(tokens_output), 0)           AS tokens_output,
      COALESCE(SUM(tokens_cache_read), 0)       AS tokens_cache_read,
      COALESCE(SUM(tokens_cache_create_5m), 0)  AS tokens_cache_create_5m,
      COALESCE(SUM(tokens_cache_create_1h), 0)  AS tokens_cache_create_1h
    FROM token_usage
    WHERE day >= DATE(:month_start)
      AND day <= DATE(:today)
    GROUP BY day, model
""")


@router.get("/cost/forecast", response_model=CostForecastResponse)
async def cost_forecast(
    db: AsyncSession = Depends(get_session),
) -> CostForecastResponse:
    """ANLY-06 — monthly cost forecast (Decimal-only OLS, 14d rolling baseline).

    No query params. Current month derived from server clock via
    cmc.core.time.now_utc.

    Returns:
      - month_to_date_usd: SUM Decimal cost across [month_start, today].
      - projected_month_total_usd: trapezoidal-sum of linear OLS projection
        across all days of the month, OR None when insufficient_data.
      - insufficient_data: True iff days_elapsed < 7.
      - partial_month_bias: same threshold (D-05).

    Locked decisions: D-01 (days_elapsed = today.day - 1), D-02 (14d baseline
    excludes today), D-03 (no negative-slope clamp), D-04 (no degenerate flag),
    D-05 (single threshold for both flags).
    """
    today = now_utc().date()
    days_elapsed_count = days_elapsed_in_month(today)
    days_in_month_count = days_in_month(today)

    insufficient = days_elapsed_count < 7
    # D-05 — same threshold; surfaced as separate field for forward-compat.

    rates = await load_rates(db)

    # ---- MTD (always computed) -----------------------------------------
    month_start = today.replace(day=1)
    mtd_rows = (await db.execute(
        _FORECAST_MTD_SQL,
        {"month_start": month_start.isoformat(), "today": today.isoformat()},
    )).mappings().all()

    mtd_total = Decimal(0)
    rates_dates: list[date] = []
    for r in mtd_rows:
        cost = compute_cost(
            r["model"],
            int(r["tokens_input"] or 0),
            int(r["tokens_output"] or 0),
            int(r["tokens_cache_read"] or 0),
            int(r["tokens_cache_create_5m"] or 0),
            int(r["tokens_cache_create_1h"] or 0),
            rates,
        )
        mtd_total += cost
        ef = _coerce_effective_from(rates, r["model"])
        if ef is not None:
            rates_dates.append(ef)

    # Early return when insufficient.
    if insufficient:
        rates_as_of = max(rates_dates) if rates_dates else None
        return CostForecastResponse(
            rates_as_of=rates_as_of,
            days_elapsed=days_elapsed_count,
            days_in_month=days_in_month_count,
            baseline_days=14,
            month_to_date_usd=mtd_total,
            projected_month_total_usd=None,
            insufficient_data=True,
            partial_month_bias=True,
        )

    # ---- 14d baseline (today excluded — D-02) --------------------------
    until_baseline = today - timedelta(days=1)
    since_baseline = today - timedelta(days=14)
    baseline_rows = (await db.execute(
        _FORECAST_BASELINE_SQL,
        {
            "since_baseline": since_baseline.isoformat(),
            "until_baseline": until_baseline.isoformat(),
        },
    )).mappings().all()

    # Bucket into per-day Decimal cost. Days with no rows -> Decimal(0).
    per_day: dict[date, Decimal] = {}
    for r in baseline_rows:
        day_value = r["day"]
        # token_usage.day is stored as DATE in SQLite; SQLAlchemy may return
        # it as a `date` or a `str` depending on the bind. Normalize:
        if isinstance(day_value, str):
            day_value = date.fromisoformat(day_value)
        cost = compute_cost(
            r["model"],
            int(r["tokens_input"] or 0),
            int(r["tokens_output"] or 0),
            int(r["tokens_cache_read"] or 0),
            int(r["tokens_cache_create_5m"] or 0),
            int(r["tokens_cache_create_1h"] or 0),
            rates,
        )
        per_day[day_value] = per_day.get(day_value, Decimal(0)) + cost
        ef = _coerce_effective_from(rates, r["model"])
        if ef is not None:
            rates_dates.append(ef)

    # Build the 14-day series indexed by day-offset from since_baseline.
    xs: list[Decimal] = [Decimal(i) for i in range(14)]
    ys: list[Decimal] = [
        per_day.get(since_baseline + timedelta(days=i), Decimal(0))
        for i in range(14)
    ]

    slope, intercept = decimal_ols(xs, ys)
    projected = project_month_total(slope, intercept, days_in_month_count)

    rates_as_of = max(rates_dates) if rates_dates else None
    return CostForecastResponse(
        rates_as_of=rates_as_of,
        days_elapsed=days_elapsed_count,
        days_in_month=days_in_month_count,
        baseline_days=14,
        month_to_date_usd=mtd_total,
        projected_month_total_usd=projected,
        insufficient_data=False,
        partial_month_bias=False,
    )


# ----- /api/pricing/freshness --------------------------------------------

@router.get("/pricing/freshness", response_model=PricingFreshnessResponse)
async def pricing_freshness(
    db: AsyncSession = Depends(get_session),
) -> PricingFreshnessResponse:
    """Doctor + settings + Phase 14 mount-time consumption."""
    rates = await load_rates(db)
    rates_dates: list[date] = []
    for r in rates.values():
        ef = r.get("effective_from")
        if ef is None:
            continue
        rates_dates.append(ef.date() if isinstance(ef, datetime) else ef)
    rates_as_of = max(rates_dates) if rates_dates else None
    age_days: int | None = None
    is_stale = False
    if rates_as_of is not None:
        age_days = (date.today() - rates_as_of).days
        is_stale = age_days > 30
    try:
        on_disk = pricing_json_hash()
    except FileNotFoundError:
        on_disk = ""
    return PricingFreshnessResponse(
        rates_as_of=rates_as_of,
        age_days=age_days,
        is_stale=is_stale,
        on_disk_hash=on_disk,
        model_count=len(rates),
    )
