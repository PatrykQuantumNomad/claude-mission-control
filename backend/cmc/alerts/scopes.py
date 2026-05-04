"""Phase 15 Plan 01 Task 3 — scope extractors.

One async callable per supported metric, each returning {scope_key: float}
for the rule's evaluation window. Plan 01 ships 3 v1.0 entries (D-01); v1.2
adds more without detector changes.

Vocabulary (D-01):
  - cost_usd_24h               -> scope_key 'model:<model>'
  - skill_p95_latency_ms       -> scope_key 'skill:<skill_name>'
  - dispatcher_failed_tasks_5m -> scope_key '<global>'

Plan 02's CRUD validator imports `is_known_metric()` to reject unknown metrics
at AlertRuleCreate (-> 422).

SQL conventions mirror cost.py / skills.py:
  - sqlalchemy.text + named bindings (no string interpolation)
  - naive-UTC datetimes for the `since` parameter
  - COALESCE / CAST INTEGER / json_each for JSON-payload extraction
  - tasks.ended_at (NOT finished_at — the column name is `ended_at` per
    backend/cmc/db/models/tasks.py:49).
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.pricing import compute_cost, load_rates

# Type alias — Plan 02's evaluate_alerts loops over _SCOPE_EXTRACTORS and
# awaits each one. The `now` param is naive UTC (matches cost.py:48-54
# convention) so tests can inject deterministic times.
ScopeExtractor = Callable[[AsyncSession, datetime], Awaitable[dict[str, float]]]


# ---- cost_usd_24h ---------------------------------------------------------
#
# Mirrors cost.py::_SUMMARY_SQL shape but pinned to 24h and grouped by model.
# Read-time cost compute via cmc.pricing.compute_cost — Decimal -> float
# conversion happens at the dict-insert point (detector consumes float).
_COST_USD_24H_SQL = text("""
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


async def extract_cost_usd_24h(
    db: AsyncSession, now: datetime
) -> dict[str, float]:
    """Return {'model:<model>': cost_usd} for each model used in last 24h.

    Empty result if no token_usage rows in window. Decimal -> float conversion
    happens here (detector consumes float; values must be JSON-serializable
    via json.dumps in the dispatcher persist path).
    """
    since = now - timedelta(hours=24)
    rows = (
        await db.execute(_COST_USD_24H_SQL, {"since": since.date().isoformat()})
    ).mappings().all()
    if not rows:
        return {}
    rates = await load_rates(db)
    out: dict[str, float] = {}
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
        out[f"model:{r['model']}"] = float(cost)
    return out


# ---- skill_p95_latency_ms -------------------------------------------------
#
# Window-CTE percentile pattern adapted from skills.py::_LATENCY_SQL but
# WITHOUT the per-skill name filter — we want every skill that fired in the
# last 24h with at least one duration_ms sample.
#
# SQLite percentile via rank: rnk = MAX(CAST(n * 0.95 AS INT), 1).
_SKILL_P95_LATENCY_SQL = text("""
    WITH events AS (
      SELECT
        o.attrs_skill_name AS skill_name,
        CAST(
          (SELECT json_extract(value, '$.value.stringValue')
             FROM json_each(json_extract(o.body, '$.record.attributes'))
            WHERE json_extract(value, '$.key') = 'duration_ms'
            LIMIT 1)
          AS INTEGER
        ) AS duration_ms
      FROM otel_events o
      WHERE o.event_name = 'skill_activated'
        AND o.attrs_skill_name IS NOT NULL
        AND o.ts >= datetime(:since)
    ),
    ranked AS (
      SELECT skill_name, duration_ms,
        ROW_NUMBER() OVER (PARTITION BY skill_name ORDER BY duration_ms) AS rnk,
        COUNT(*) OVER (PARTITION BY skill_name) AS n
      FROM events
      WHERE duration_ms IS NOT NULL
    )
    SELECT skill_name, duration_ms AS p95_ms
    FROM ranked
    WHERE rnk = MAX(CAST(n * 0.95 AS INTEGER), 1)
""")


async def extract_skill_p95_latency_ms(
    db: AsyncSession, now: datetime
) -> dict[str, float]:
    """Return {'skill:<name>': p95_ms_float} for every skill with samples in 24h.

    Empty if no skill_activated events with duration_ms in window. Skills
    with NULL duration_ms attribute are filtered (D-03 LOCK-3 TENTATIVE).
    """
    since = now - timedelta(hours=24)
    rows = (
        await db.execute(_SKILL_P95_LATENCY_SQL, {"since": since.isoformat()})
    ).mappings().all()
    return {f"skill:{r['skill_name']}": float(r["p95_ms"]) for r in rows}


# ---- dispatcher_failed_tasks_5m -------------------------------------------
#
# Global counter — single scope_key '<global>' (no per-scope dimension).
# tasks.ended_at is the canonical column (verified backend/cmc/db/models/tasks.py:49).
# COUNT(*) WHERE status='failed' AND ended_at >= now - 5min.
_DISPATCHER_FAILED_5M_SQL = text("""
    SELECT COUNT(*) AS n
    FROM tasks
    WHERE status = 'failed'
      AND ended_at IS NOT NULL
      AND ended_at >= datetime(:since)
""")


async def extract_dispatcher_failed_tasks_5m(
    db: AsyncSession, now: datetime
) -> dict[str, float]:
    """Return {'<global>': failed_count_float}. ALWAYS reports — even on count=0.

    Global metric (no per-scope dimension), so the dict has exactly one entry.
    Float type for detector consistency (compute_cost returns Decimal->float).
    """
    since = now - timedelta(minutes=5)
    row = (
        await db.execute(_DISPATCHER_FAILED_5M_SQL, {"since": since.isoformat()})
    ).mappings().first()
    n = int(row["n"]) if row and row["n"] is not None else 0
    return {"<global>": float(n)}


# ---- Vocabulary lock ------------------------------------------------------

_SCOPE_EXTRACTORS: dict[str, ScopeExtractor] = {
    "cost_usd_24h":              extract_cost_usd_24h,
    "skill_p95_latency_ms":      extract_skill_p95_latency_ms,
    "dispatcher_failed_tasks_5m": extract_dispatcher_failed_tasks_5m,
}


def is_known_metric(metric: str) -> bool:
    """Plan 02's AlertRuleCreate validator imports this to reject unknown metrics.

    Case-sensitive exact-match — defends against 'Cost_USD_24h' typos at the
    API boundary (-> 422).
    """
    return metric in _SCOPE_EXTRACTORS
