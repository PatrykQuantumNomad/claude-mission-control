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
    CostRange,
    CostSummaryResponse,
    PricingFreshnessResponse,
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

# By project: cwd rollup (project_hash isn't in sessions schema; cwd is the
# canonical project key per OBSV-06).
_BREAKDOWN_BY_PROJECT_SQL = text("""
    SELECT
      COALESCE(s.cwd, '<unknown>')                AS key,
      COALESCE(SUM(s.tokens_input), 0)            AS tokens_input,
      COALESCE(SUM(s.tokens_output), 0)           AS tokens_output,
      COALESCE(SUM(s.tokens_cache_read), 0)       AS tokens_cache_read,
      0                                           AS tokens_cache_create_5m,
      0                                           AS tokens_cache_create_1h,
      MAX(s.model)                                AS model
    FROM sessions s
    WHERE s.started_at >= :since
    GROUP BY COALESCE(s.cwd, '<unknown>')
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
