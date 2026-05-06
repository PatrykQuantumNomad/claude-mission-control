---
phase: 20-cost-forecast-per-project-card
plan: 02
type: execute
wave: 2
# why_this_split: ANLY-06 backend — net-new cmc/cost/ package + forecast.py module + GET /api/cost/forecast endpoint + CostForecastResponse schema. Depends on Plan 01 only by file-ownership of cost.py (sequential edit), not by data dependency. Two tasks: (1) pure-stdlib forecast module + unit tests (TDD-friendly, closed-form math); (2) endpoint wiring + integration tests. Frontend in Plan 03 consumes the endpoint; e2e in Plan 04.
depends_on: ["20-01"]
files_modified:
  - backend/cmc/cost/__init__.py
  - backend/cmc/cost/forecast.py
  - backend/cmc/api/schemas/cost.py
  - backend/cmc/api/routes/cost.py
  - backend/tests/test_cost_forecast.py
  - backend/tests/test_cost_router.py
autonomous: true
requirements: [ANLY-06]
must_haves:
  truths:
    - "GET /api/cost/forecast returns 200 with CostForecastResponse: {rates_as_of: date|null, days_elapsed: int, days_in_month: int, baseline_days: int (=14), month_to_date_usd: Decimal, projected_month_total_usd: Decimal | null, insufficient_data: bool, partial_month_bias: bool} — Decimal fields serialized as JSON strings."
    - "When `today.day - 1 < 7` (calendar day 1..7 of the month), `insufficient_data=true` AND `partial_month_bias=true` AND `projected_month_total_usd=null`. UI renders an explanatory message, not a number. (D-01 — `days_elapsed` semantics: `days_elapsed = today.day - 1`, per 20-RESEARCH.md Open Question #3 + Assumption A2.)"
    - "When `days_elapsed >= 7` (calendar day 8 onward), `insufficient_data=false` AND `partial_month_bias=false` AND `projected_month_total_usd` is a non-null Decimal computed from a Decimal-only OLS fit over the last 14 COMPLETE days of `token_usage` (today excluded). (D-02 — exclude today from baseline, per 20-RESEARCH.md Open Question #5 + Assumption A3.)"
    - "Forecast value is NOT clamped to MTD floor; raw OLS extrapolation may go below MTD if 14d trend is sharply declining. The bias banner is the operator's signal. (D-03 — no clamp, per 20-RESEARCH.md Open Question #4 + Assumption A4.)"
    - "OLS uses pure stdlib `decimal.Decimal` — no numpy, no scipy. Inherits the Decimal context from `cmc.pricing` (`prec=28`, `ROUND_HALF_EVEN`); the new module MUST NOT call `getcontext()` again."
    - "Days-in-month uses `calendar.monthrange(year, month)[1]` — handles leap years and all month-length variants natively. NO hand-rolled branches."
    - "All datetime arithmetic uses `cmc.core.time.now_utc` — never `datetime.utcnow` (POLI-06 ban inherited)."
    - "Per Pitfall 2 / Open Question #2: degenerate baseline (constant Y series → zero numerator → slope=Decimal(0), projection = mean * days_in_month) does NOT crash and does NOT emit a separate flag. The `partial_month_bias` flag covers user-facing volatility messaging; no separate `degenerate_baseline` field on the response."
    - "No dollar values are stored in the database — forecast is computed at request time via existing `compute_cost` over `token_usage` rollups joined to currently-effective rates (v1.1 read-time invariant preserved)."
    - "Response shape carries `rates_as_of` (max effective_from across rates touched in the 14d baseline window), mirroring the existing CostSummaryResponse / CostBreakdownResponse pattern."
  artifacts:
    - path: "backend/cmc/cost/__init__.py"
      provides: "New cost package marker; minimal re-exports of forecast helpers"
      min_lines: 1
    - path: "backend/cmc/cost/forecast.py"
      provides: "Decimal-only OLS + days_elapsed_in_month + days_in_month helpers; pure-Python, no DB access. Top-level docstring cites Decimal context inheritance from cmc.pricing."
      contains: "def decimal_ols"
      contains_also: "from decimal import Decimal"
      min_lines: 80
    - path: "backend/cmc/api/schemas/cost.py"
      provides: "Net-new CostForecastResponse Pydantic model"
      contains: "class CostForecastResponse"
    - path: "backend/cmc/api/routes/cost.py"
      provides: "Net-new GET /api/cost/forecast endpoint slotted alongside cost_summary, cost_breakdown, pricing_freshness"
      contains: "/cost/forecast"
      contains_also: "response_model=CostForecastResponse"
    - path: "backend/tests/test_cost_forecast.py"
      provides: "Unit tests for cmc.cost.forecast — Decimal OLS arithmetic, days_elapsed boundary, days_in_month leap-year, zero-variance + degenerate cases"
      contains: "test_decimal_ols_known_series"
      contains_also: "test_days_elapsed_boundary"
      min_lines: 100
    - path: "backend/tests/test_cost_router.py"
      provides: "Integration tests for /api/cost/forecast — Decimal-as-JSON-string, insufficient_data flag at day 1, both flags clear at day 8, projected_month_total_usd is null when insufficient_data"
      contains: "test_forecast_returns_decimal_strings"
      contains_also: "test_forecast_insufficient_data_threshold"
  key_links:
    - from: "backend/cmc/api/routes/cost.py (cost_forecast handler)"
      to: "backend/cmc/cost/forecast.py (decimal_ols, days_elapsed_in_month, days_in_month)"
      via: "from cmc.cost.forecast import decimal_ols, days_elapsed_in_month, days_in_month"
      pattern: "from cmc\\.cost\\.forecast import"
    - from: "backend/cmc/api/routes/cost.py (cost_forecast handler)"
      to: "backend/cmc/pricing.py (compute_cost, load_rates)"
      via: "import + per-row cost computation over 14d token_usage rollup"
      pattern: "compute_cost"
    - from: "backend/cmc/api/schemas/cost.py (CostForecastResponse)"
      to: "Pydantic v2 default Decimal-as-JSON-string serialization"
      via: "Decimal fields with no custom serializer"
      pattern: "Decimal"
---

<objective>
Ship ANLY-06 — the monthly cost forecast endpoint. Land a net-new `cmc/cost/` package with `forecast.py` (pure-stdlib Decimal OLS + calendar helpers) and a new `GET /api/cost/forecast` route on the existing `cost_router`. The forecast is read-time-computed over the existing `token_usage` daily rollup; no schema changes, no migrations, no $ stored.

Purpose: ROADMAP success criteria #1 and #2 — "User loads the cost dashboard and sees a monthly forecast figure derived from a 14d rolling baseline via stdlib Decimal-only OLS in `cmc/cost/forecast.py`; backend returns `insufficient_data` when `days_elapsed < 7`. During the first week of any month the forecast card shows a partial-month bias banner; banner clears once `days_elapsed >= 7`." This plan ships the BACKEND for both — the UI banner is wired in Plan 03.

Output:
- `backend/cmc/cost/__init__.py` (NEW) — minimal package marker. Optionally re-export `forecast` symbols for ergonomic access (`from cmc.cost import decimal_ols`).
- `backend/cmc/cost/forecast.py` (NEW) — pure-Python module:
  - `decimal_ols(xs: list[Decimal], ys: list[Decimal]) -> tuple[Decimal, Decimal]` returning `(slope, intercept)`. Closed-form least squares. Defensive: returns `(Decimal(0), mean(ys))` if `denominator == 0` (zero-variance Y or single-point input — guard against `decimal.DivisionByZero`).
  - `days_elapsed_in_month(today: date) -> int` returning `today.day - 1`. (Day 1 of month → 0; day 7 → 6 → `< 7` → insufficient_data; day 8 → 7 → `>= 7` → forecast unlocks.)
  - `days_in_month(today: date) -> int` returning `calendar.monthrange(today.year, today.month)[1]`. Stdlib handles leap years natively.
  - `project_month_total(slope: Decimal, intercept: Decimal, days_in_month_count: int) -> Decimal` — closed-form trapezoidal sum: `days_in_month * (intercept + slope * (days_in_month - 1) / Decimal(2))`. (Matches RESEARCH §"OLS Closed-Form (sketch)".)
  - Module docstring: cites `cmc.pricing` for the global Decimal context (prec=28, ROUND_HALF_EVEN); states the module MUST NOT call `getcontext()` again; cites Open Question #5 / Assumption A3 (today excluded) and Open Question #3 / Assumption A2 (`days_elapsed = today.day - 1`).
- `backend/cmc/api/schemas/cost.py` — EXTENDED with `CostForecastResponse(BaseModel)`:
  ```python
  class CostForecastResponse(BaseModel):
      rates_as_of: date | None
      days_elapsed: int            # 0..30; today.day - 1
      days_in_month: int           # 28..31
      baseline_days: int           # always 14 in v1; surfaced for transparency
      month_to_date_usd: Decimal   # always present, JSON string
      projected_month_total_usd: Decimal | None  # null when insufficient_data
      insufficient_data: bool
      partial_month_bias: bool
  ```
  No degenerate_baseline field (per D-04 / Open Q#2 — bias banner is sufficient signaling).
- `backend/cmc/api/routes/cost.py` — EXTENDED with `@router.get("/cost/forecast", response_model=CostForecastResponse)`. Handler steps (commented inline so the executor doesn't have to re-derive):
  1. `today = now_utc().date()`
  2. `days_in_month_count = days_in_month(today)`
  3. `days_elapsed_count = days_elapsed_in_month(today)`
  4. `insufficient = days_elapsed_count < 7`; `partial_bias = insufficient` (same threshold per D-05; see RESEARCH §"Bias-Banner + insufficient_data Semantics")
  5. Compute `month_to_date_usd`: SUM Decimal-cost across rows where `token_usage.day BETWEEN month_start AND today`, joined to currently-effective rates via `compute_cost`.
  6. If `insufficient`: return early with `projected_month_total_usd=None`.
  7. Else: fetch the last 14 COMPLETE days of `token_usage` (today excluded — `day BETWEEN today - 14 days AND today - 1 day`); per-day, sum Decimal cost across all models in that row; build `ys: list[Decimal]` (length 14), `xs = [Decimal(i) for i in range(14)]`.
  8. `(slope, intercept) = decimal_ols(xs, ys)`; `projected = project_month_total(slope, intercept, days_in_month_count)`.
  9. Return `CostForecastResponse(...)`.
  10. NO clamp on negative projection (per D-03 / Open Q#4).
- `backend/tests/test_cost_forecast.py` (NEW) — unit tests for the module:
  - `test_decimal_ols_known_series`: `xs=[0..13]`, `ys=[Decimal(i*2 + 1) for i in range(14)]` → assert `slope == Decimal(2)`, `intercept == Decimal(1)`.
  - `test_decimal_ols_zero_variance`: `ys = [Decimal('0.5')]*14` → assert `slope == Decimal(0)`, `intercept == Decimal('0.5')`. Does NOT raise.
  - `test_decimal_ols_negative_slope`: `ys=[Decimal(13-i) for i in range(14)]` → `slope == Decimal(-1)`.
  - `test_days_elapsed_boundary`: parametric over (day=1, expected=0), (day=7, expected=6), (day=8, expected=7), (day=28, expected=27), (day=31, expected=30).
  - `test_days_in_month_leap_year`: assert `days_in_month(date(2024, 2, 1)) == 29`; `days_in_month(date(2025, 2, 1)) == 28`; `days_in_month(date(2024, 1, 1)) == 31`; `days_in_month(date(2024, 4, 1)) == 30`.
  - `test_project_month_total_known`: `slope=Decimal(0)`, `intercept=Decimal(10)`, `days=30` → `300`. With `slope=Decimal(1)`, `intercept=Decimal(0)`, `days=10` → `45` (sum 0..9).
- `backend/tests/test_cost_router.py` (EXTENDED) — 3 new integration tests:
  - `test_forecast_returns_decimal_strings`: GET `/api/cost/forecast`; assert `isinstance(payload['month_to_date_usd'], str)` AND (when not insufficient) `isinstance(payload['projected_month_total_usd'], str)`. (Anti-Pattern guard inherited from `test_cost_summary_returns_decimal_strings`.)
  - `test_forecast_insufficient_data_threshold`: use `pytest_freezer` (per `TESTING.md:332-333`) or `monkeypatch` of `cmc.cost.forecast.now_utc`. Freeze date to `2026-01-03` → assert `insufficient_data=true`, `partial_month_bias=true`, `projected_month_total_usd is None`. Freeze to `2026-01-08` → assert all three flip.
  - `test_forecast_excludes_today_from_baseline`: seed identical rollups for days `[today-14..today-1]` and a wildly different row for `today`. Assert the slope reflects ONLY the 14 historical days, not today's outlier. (Locks D-02 / Open Q#5 — exclusion of today.)

This plan is gated by Plan 20-01's completion (file ownership of `backend/cmc/api/routes/cost.py`); the SQL refactor and the new endpoint can NOT both be edited in parallel without conflict.
</objective>

<execution_context>
@/Users/patrykattc/work/git/claude-mission-control/.claude/get-shit-done/workflows/execute-plan.md
@/Users/patrykattc/work/git/claude-mission-control/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/20-cost-forecast-per-project-card/20-RESEARCH.md
@.planning/phases/20-cost-forecast-per-project-card/20-01-cost-breakdown-project-key-refactor-PLAN.md

# Existing files this plan touches or imports from (read before editing)
@backend/cmc/api/routes/cost.py
@backend/cmc/api/schemas/cost.py
@backend/cmc/pricing.py
@backend/cmc/core/time.py
@backend/tests/test_cost_router.py

<interfaces>
<!-- Key types and contracts the executor needs. Use these directly — no codebase exploration. -->

From backend/cmc/pricing.py (Decimal context — INHERITED, do not re-set):
```python
# Module-level (set at import time):
getcontext().prec = 28
getcontext().rounding = ROUND_HALF_EVEN

def compute_cost(
    model: str,
    input: int,
    output: int,
    cache_read: int,
    cache_create_5m: int,
    cache_create_1h: int,
    rates: dict[str, dict[str, Decimal]],
) -> Decimal:
    """Returns Decimal(0) on lookup miss + bumps unpriced_tokens counter."""

async def load_rates(db: AsyncSession) -> dict[str, dict[str, Decimal]]:
    """Returns currently-effective rates per model, keyed by model name.
    Each value dict has keys: input_per_mtok, output_per_mtok,
    cache_read_per_mtok, cache_create_5m_per_mtok, cache_create_1h_per_mtok,
    effective_from (date or datetime)."""
```

From backend/cmc/core/time.py:
```python
def now_utc() -> datetime:
    """Returns datetime.now(UTC).replace(tzinfo=None) — naive UTC, SQLite-compatible."""
```

From backend/cmc/api/routes/cost.py (existing handler — pattern to mirror for cost_forecast):
```python
@router.get("/cost/summary", response_model=CostSummaryResponse)
async def cost_summary(
    db: AsyncSession = Depends(get_session),
    range_: CostRange = Query("7d", alias="range"),
) -> CostSummaryResponse:
    rates = await load_rates(db)
    since_dt = _range_start(range_)
    rows = (await db.execute(_SUMMARY_SQL, {"since": since_dt.date().isoformat()})).mappings().all()
    # ... compute_cost per row, sum total, collect rates_as_of, build response ...
```

From backend/cmc/api/schemas/cost.py (Decimal-as-JSON-string is Pydantic v2 default):
```python
# Existing precedent — DO NOT pipe through fastapi.encoders.jsonable_encoder.
class CostSummaryResponse(BaseModel):
    range: CostRange
    rates_as_of: date | None
    total_usd: Decimal           # serialized as JSON string ("0.0247")
    by_model: list[CostByModelRow]
```

From backend/cmc/db/models/token_usage.py (timeseries source — daily rollup):
```python
# Columns relevant to forecast:
#   day: DATE (one row per (day, model))
#   model: VARCHAR
#   tokens_input, tokens_output, tokens_cache_read,
#   tokens_cache_create_5m, tokens_cache_create_1h: INTEGER
```

From backend/tests/test_cost_router.py (test_cost_summary_returns_decimal_strings — pattern to mirror):
```python
async def test_cost_summary_returns_decimal_strings(client) -> None:
    """ANLY-04 — Decimal serialized as JSON string, not float."""
    await _seed_default_token_usage(client)
    r = await client.get("/api/cost/summary?range=7d")
    assert r.status_code == 200, r.text
    payload = r.json()
    assert isinstance(payload["total_usd"], str)
    for row in payload["by_model"]:
        assert isinstance(row["cost_usd"], str)
```

OLS closed-form (locked, per 20-RESEARCH.md §"OLS Closed-Form (sketch)"):
```
mx = sum(xs) / n
my = sum(ys) / n
numerator = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
denominator = sum((x - mx) ** 2 for x in xs)
slope = numerator / denominator if denominator != 0 else Decimal(0)
intercept = my - slope * mx
# For projection across all days of the month:
month_total = days_in_month * (intercept + slope * (days_in_month - 1) / Decimal(2))
```
For the fixed `xs = [0, 1, ..., 13]`: `denominator = Decimal('227.5')` (constant; computed once or as a unit-test fixture).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create cmc/cost/ package + forecast.py module + unit tests</name>
  <files>backend/cmc/cost/__init__.py, backend/cmc/cost/forecast.py, backend/tests/test_cost_forecast.py</files>
  <behavior>
    - test_decimal_ols_known_series: xs=[0..13], ys=[1, 3, 5, 7, ..., 27] (i*2 + 1) → slope=Decimal(2), intercept=Decimal(1).
    - test_decimal_ols_zero_variance: ys=[Decimal('0.5')]*14 → slope=Decimal(0), intercept=Decimal('0.5'); does NOT raise decimal.DivisionByZero.
    - test_decimal_ols_negative_slope: ys=[Decimal(13-i) for i in range(14)] → slope=Decimal(-1), intercept=Decimal(13).
    - test_decimal_ols_single_day: xs=[Decimal(0)], ys=[Decimal('5.00')] → slope=Decimal(0), intercept=Decimal('5.00') (denominator==0 guard activates).
    - test_days_elapsed_boundary: parametric — day 1 → 0, day 7 → 6, day 8 → 7, day 28 → 27, day 31 → 30.
    - test_days_in_month_leap_year: Feb 2024 → 29, Feb 2025 → 28, Jan 2024 → 31, Apr 2024 → 30.
    - test_project_month_total_zero_slope: slope=0, intercept=10, days=30 → 300.
    - test_project_month_total_unit_slope: slope=1, intercept=0, days=10 → 45 (= 0+1+2+...+9).
  </behavior>
  <action>
**Step 1a — Create `backend/cmc/cost/__init__.py`:**

Minimal package marker. Optionally re-export forecast helpers:

```python
"""cmc.cost — read-time cost analytics (forecast, future analyses).

This package contains pure-Python utility modules for cost-derived analytics
that compute over the existing token_usage rollup at request time. NO schema
changes, NO $ stored — preserves the v1.1 read-time invariant.
"""
from cmc.cost.forecast import (
    decimal_ols,
    days_elapsed_in_month,
    days_in_month,
    project_month_total,
)

__all__ = [
    "decimal_ols",
    "days_elapsed_in_month",
    "days_in_month",
    "project_month_total",
]
```

**Step 1b — Create `backend/cmc/cost/forecast.py`:**

```python
"""Decimal-only OLS for monthly cost forecast (ANLY-06).

Inherits the Decimal context from cmc.pricing (set at module import time:
prec=28, ROUND_HALF_EVEN). DO NOT call getcontext() again — that risks
per-module drift if cmc.pricing's context settings ever change. The pricing
module is always imported in any process path that reaches this code
(compute_cost is the read-time entry point).

Pure stdlib — NO numpy, NO scipy. Locked by ROADMAP Phase 20 success
criterion #1 ("stdlib Decimal-only OLS").

Semantics (locked decisions per 20-RESEARCH.md):
  - days_elapsed_in_month: today.day - 1. Day 1 → 0, day 7 → 6, day 8 → 7.
    (Open Question #3, Assumption A2 — calendar interpretation, not
    cost-bearing-days interpretation.)
  - The 14d baseline EXCLUDES today (uses [today-14, today-1] complete days).
    (Open Question #5, Assumption A3 — avoids partial-day bias on slope.)
  - Negative projections are NOT clamped to MTD floor. The bias banner is
    the operator's signal during week 1; honest extrapolation is preserved
    after week 2 even if downward.
    (Open Question #4, Assumption A4.)
  - Degenerate baseline (constant Y → zero numerator) returns
    (Decimal(0), mean(ys)) — does NOT raise. No separate flag on the
    response; the bias banner covers user-facing volatility messaging.
    (Open Question #2.)
"""
from __future__ import annotations

import calendar
from datetime import date
from decimal import Decimal


def decimal_ols(xs: list[Decimal], ys: list[Decimal]) -> tuple[Decimal, Decimal]:
    """Pure-Decimal least-squares fit. Returns (slope, intercept).

    Closed form: slope = sum((x-mx)*(y-my)) / sum((x-mx)^2);
                 intercept = my - slope * mx.

    Defensive: if denominator == 0 (zero-variance X — only happens for
    single-point input or all-equal xs, which our 14d baseline never
    produces — OR zero-variance Y if numerator is also zero, falls
    through to slope=0), returns (Decimal(0), mean(ys)) instead of
    raising decimal.DivisionByZero. The mean is the best constant
    prediction.
    """
    n = len(xs)
    if n == 0:
        return (Decimal(0), Decimal(0))
    if n != len(ys):
        raise ValueError(f"xs and ys length mismatch: {n} vs {len(ys)}")

    sum_x = sum(xs, start=Decimal(0))
    sum_y = sum(ys, start=Decimal(0))
    mx = sum_x / Decimal(n)
    my = sum_y / Decimal(n)

    numerator = sum(((x - mx) * (y - my) for x, y in zip(xs, ys, strict=True)),
                    start=Decimal(0))
    denominator = sum(((x - mx) ** 2 for x in xs), start=Decimal(0))

    if denominator == Decimal(0):
        # Zero-variance X (single-point input or all-equal xs). Return
        # flat-line at mean(y).
        return (Decimal(0), my)

    slope = numerator / denominator
    intercept = my - slope * mx
    return (slope, intercept)


def days_elapsed_in_month(today: date) -> int:
    """Number of complete days in the current month before today.

    Day 1 of month → 0 (no days have completed; only today is in progress).
    Day 7 of month → 6 (less than 7; insufficient_data threshold).
    Day 8 of month → 7 (>= 7; forecast unlocks).

    Locked semantics per ROADMAP Phase 20 success criterion #1 +
    20-RESEARCH.md Open Question #3.
    """
    return today.day - 1


def days_in_month(today: date) -> int:
    """Total calendar days in the month containing `today`.

    Uses stdlib calendar.monthrange — handles leap years and all month-length
    variants natively (28/29/30/31).
    """
    return calendar.monthrange(today.year, today.month)[1]


def project_month_total(
    slope: Decimal,
    intercept: Decimal,
    days_in_month_count: int,
) -> Decimal:
    """Trapezoidal sum of the linear projection across all days of the month.

    For predictions y_d = intercept + slope * d for d in [0, days_in_month - 1]:
    sum is days_in_month * (intercept + slope * (days_in_month - 1) / 2).

    Returns the projected month total cost in dollars (Decimal). Can be
    negative if slope is sharply declining and intercept is near zero;
    the response shape preserves that — UI handles presentation.
    """
    if days_in_month_count <= 0:
        return Decimal(0)
    d_minus_1 = Decimal(days_in_month_count - 1)
    return Decimal(days_in_month_count) * (intercept + slope * d_minus_1 / Decimal(2))
```

**Step 1c — Create `backend/tests/test_cost_forecast.py`:**

```python
"""Unit tests for cmc.cost.forecast — pure-Python Decimal OLS + calendar helpers.

ANLY-06 acceptance:
  - OLS closed-form correctness on known series (positive/negative/zero slope).
  - Defensive zero-variance handling (no decimal.DivisionByZero crash).
  - days_elapsed_in_month boundary semantics (locks D-01).
  - days_in_month leap-year correctness (Feb 2024 / Feb 2025).
  - project_month_total trapezoidal-sum closed form.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from cmc.cost.forecast import (
    decimal_ols,
    days_elapsed_in_month,
    days_in_month,
    project_month_total,
)


# ---- decimal_ols ---------------------------------------------------------


def test_decimal_ols_known_series() -> None:
    """y = 2x + 1 over x = [0, 13]: slope must be exactly Decimal(2), intercept Decimal(1)."""
    xs = [Decimal(i) for i in range(14)]
    ys = [Decimal(i * 2 + 1) for i in range(14)]
    slope, intercept = decimal_ols(xs, ys)
    assert slope == Decimal(2), f"expected slope=2, got {slope!r}"
    assert intercept == Decimal(1), f"expected intercept=1, got {intercept!r}"


def test_decimal_ols_zero_variance_y() -> None:
    """Constant y series: slope must be Decimal(0); intercept = mean. No DivisionByZero."""
    xs = [Decimal(i) for i in range(14)]
    ys = [Decimal("0.5")] * 14
    slope, intercept = decimal_ols(xs, ys)
    assert slope == Decimal(0)
    assert intercept == Decimal("0.5")


def test_decimal_ols_negative_slope() -> None:
    """y = 13 - x over x = [0, 13]: slope = -1, intercept = 13."""
    xs = [Decimal(i) for i in range(14)]
    ys = [Decimal(13 - i) for i in range(14)]
    slope, intercept = decimal_ols(xs, ys)
    assert slope == Decimal(-1)
    assert intercept == Decimal(13)


def test_decimal_ols_single_point_no_crash() -> None:
    """Single-point input: denominator==0; defensive guard returns (0, y[0])."""
    slope, intercept = decimal_ols([Decimal(0)], [Decimal("5.00")])
    assert slope == Decimal(0)
    assert intercept == Decimal("5.00")


def test_decimal_ols_empty_returns_zeros() -> None:
    """Empty input: return (0, 0); does not raise."""
    slope, intercept = decimal_ols([], [])
    assert slope == Decimal(0)
    assert intercept == Decimal(0)


def test_decimal_ols_length_mismatch_raises() -> None:
    with pytest.raises(ValueError, match="length mismatch"):
        decimal_ols([Decimal(0), Decimal(1)], [Decimal(0)])


# ---- days_elapsed_in_month ----------------------------------------------


@pytest.mark.parametrize("day,expected", [
    (1, 0),
    (2, 1),
    (7, 6),    # < 7 → insufficient_data
    (8, 7),    # >= 7 → forecast unlocks
    (15, 14),
    (28, 27),
    (29, 28),
    (30, 29),
    (31, 30),
])
def test_days_elapsed_boundary(day: int, expected: int) -> None:
    """D-01 locked: days_elapsed = today.day - 1."""
    assert days_elapsed_in_month(date(2026, 5, day)) == expected


# ---- days_in_month -------------------------------------------------------


@pytest.mark.parametrize("year,month,expected", [
    (2024, 1, 31),
    (2024, 2, 29),   # leap year
    (2025, 2, 28),   # non-leap
    (2024, 4, 30),
    (2024, 12, 31),
    (2000, 2, 29),   # century leap
    (1900, 2, 28),   # century non-leap
])
def test_days_in_month_leap_year(year: int, month: int, expected: int) -> None:
    assert days_in_month(date(year, month, 1)) == expected


# ---- project_month_total -------------------------------------------------


def test_project_month_total_zero_slope() -> None:
    """Flat-line projection: 30 days * 10/day = 300."""
    assert project_month_total(Decimal(0), Decimal(10), 30) == Decimal(300)


def test_project_month_total_unit_slope() -> None:
    """y_d = d for d in [0..9]: sum = 0+1+...+9 = 45."""
    assert project_month_total(Decimal(1), Decimal(0), 10) == Decimal(45)


def test_project_month_total_negative_slope_can_go_below_mtd() -> None:
    """D-03: negative-slope projections are NOT clamped; can be lower than current MTD."""
    # slope=-2, intercept=10, days=30: y_d = 10 - 2d.
    # Sum = 30 * (10 + (-2) * 29 / 2) = 30 * (10 - 29) = 30 * -19 = -570.
    result = project_month_total(Decimal(-2), Decimal(10), 30)
    assert result == Decimal(-570), f"projection should be raw, not clamped: got {result!r}"


def test_project_month_total_zero_days() -> None:
    """Edge case: zero-day month returns Decimal(0). (Defensive — never happens in practice.)"""
    assert project_month_total(Decimal(1), Decimal(1), 0) == Decimal(0)
```

  </action>
  <verify>
    <automated>cd backend && uv run pytest tests/test_cost_forecast.py -v</automated>
    Expected: ~17 tests pass (parametrize expansions count individually).

    cd backend && uv run python -c "from cmc.cost.forecast import decimal_ols, days_elapsed_in_month, days_in_month, project_month_total; print('ok')"
    Expected: prints 'ok'.

    cd backend && uv run python -c "from cmc.cost import decimal_ols; print('package re-export ok')"
    Expected: prints 'package re-export ok'.

    cd backend && grep -nE "getcontext\(\)\.prec|getcontext\(\)\.rounding" backend/cmc/cost/forecast.py
    Expected: 0 matches (forecast module MUST NOT re-set the Decimal context).

    cd backend && grep -nE "datetime\.utcnow|from datetime import .*utcnow" backend/cmc/cost/ backend/tests/test_cost_forecast.py
    Expected: 0 matches (POLI-06 ban).

    cd backend && uv run ruff check --select UP backend/cmc/cost/ backend/tests/test_cost_forecast.py
    Expected: clean.
  </verify>
  <done>
    cmc/cost/ package exists with __init__.py + forecast.py.
    decimal_ols, days_elapsed_in_month, days_in_month, project_month_total all importable + tested.
    All 17 unit tests pass; zero-variance, negative-slope, leap-year edge cases covered.
    Forecast module does NOT call getcontext() (inherits from cmc.pricing).
    Phase 18 BASELINE.md verifier preserved.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add CostForecastResponse schema + GET /api/cost/forecast endpoint + integration tests</name>
  <files>backend/cmc/api/schemas/cost.py, backend/cmc/api/routes/cost.py, backend/tests/test_cost_router.py</files>
  <behavior>
    - test_forecast_returns_decimal_strings: GET /api/cost/forecast (with sufficient seeded data + frozen date past day 7); assert isinstance(payload['month_to_date_usd'], str) AND isinstance(payload['projected_month_total_usd'], str). Anti-Pattern guard inherited from existing test_cost_summary_returns_decimal_strings.
    - test_forecast_insufficient_data_threshold: freeze date to 2026-01-03 (day 3 of month, days_elapsed=2 < 7); GET; assert insufficient_data=true, partial_month_bias=true, projected_month_total_usd is None, month_to_date_usd is a Decimal-string (>= 0).
    - test_forecast_flags_clear_on_day_8: freeze date to 2026-01-08 (days_elapsed=7); seed 14 days of data ending day 7; assert insufficient_data=false, partial_month_bias=false, projected_month_total_usd is not None.
    - test_forecast_excludes_today_from_baseline: seed identical rollups for [today-14..today-1]; seed a wildly different row for today (e.g., 100x cost); assert the slope-derived projection reflects ONLY the 14 historical days. (Locks D-02 / Open Q#5.)
    - test_forecast_baseline_days_is_14_constant: GET; assert payload['baseline_days'] == 14 regardless of date.
  </behavior>
  <action>
**Step 2a — Add CostForecastResponse to `backend/cmc/api/schemas/cost.py`:**

Append after the existing `PricingFreshnessResponse` class:

```python
class CostForecastResponse(BaseModel):
    """ANLY-06 — monthly cost forecast envelope.

    Decimal fields serialize as JSON strings (Pydantic v2 default).
    Never pipe through fastapi.encoders.jsonable_encoder — silent precision
    loss on Decimal -> float conversion.

    Locked semantics (20-RESEARCH.md):
      - days_elapsed = today.day - 1 (D-01).
      - 14d baseline EXCLUDES today (D-02; uses [today-14..today-1]).
      - insufficient_data = days_elapsed < 7 (D-05); projected_month_total_usd
        is None in that case.
      - partial_month_bias uses the same threshold as insufficient_data
        (D-05); both flags flip together. Future-proofed as separate booleans
        in case the policy diverges later.
      - No clamp on negative projections (D-03); UI handles presentation.
      - No degenerate_baseline flag (D-04); zero-variance baseline yields
        slope=0 / projection = mean * days_in_month — bias banner is
        sufficient signaling.
    """
    rates_as_of: date | None
    days_elapsed: int                          # 0..30; today.day - 1
    days_in_month: int                         # 28..31
    baseline_days: int                         # always 14 in v1
    month_to_date_usd: Decimal                 # always present
    projected_month_total_usd: Decimal | None  # null when insufficient_data
    insufficient_data: bool
    partial_month_bias: bool
```

**Step 2b — Add the endpoint to `backend/cmc/api/routes/cost.py`:**

After the existing `cost_breakdown` handler and before `pricing_freshness`, add:

```python
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

# MTD: month_start ≤ day ≤ today (inclusive of today; today's row may
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
    from cmc.core.time import now_utc
    from cmc.cost.forecast import (
        decimal_ols,
        days_elapsed_in_month,
        days_in_month,
        project_month_total,
    )
    from datetime import timedelta

    today = now_utc().date()
    days_elapsed_count = days_elapsed_in_month(today)
    days_in_month_count = days_in_month(today)

    insufficient = days_elapsed_count < 7
    partial_bias = insufficient  # D-05 — same threshold

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

    # Early return when insufficient
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
        {"since_baseline": since_baseline.isoformat(),
         "until_baseline": until_baseline.isoformat()},
    )).mappings().all()

    # Bucket into per-day Decimal cost. Days with no rows → Decimal(0).
    per_day: dict[date, Decimal] = {}
    for r in baseline_rows:
        day_value = r["day"]
        # token_usage.day is stored as ISO string in SQLite via DATE column;
        # SQLAlchemy may return it as a `date` or a `str` depending on the
        # bind. Normalize:
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
```

Imports to add at the top of `cost.py` (verify they're not already present):

```python
from cmc.api.schemas.cost import (
    BreakdownDim,
    CostBreakdownResponse,
    CostBreakdownRow,
    CostByModelRow,
    CostForecastResponse,    # NEW
    CostRange,
    CostSummaryResponse,
    PricingFreshnessResponse,
)
```

(The local imports of `cmc.core.time.now_utc`, `cmc.cost.forecast.*`, and `datetime.timedelta` are kept inside the handler body to avoid changing the file's existing top-level import structure unnecessarily; the executor MAY hoist them to module-level if `ruff` prefers it.)

**Step 2c — Add 5 integration tests to `backend/tests/test_cost_router.py`:**

Mirror `_seed_default_token_usage` (existing helper at L55-71) — extend it as a parameterized factory if the existing form is hard-coded to a small day count. The forecast tests need a configurable seed.

```python
import pytest
from datetime import date, timedelta
from decimal import Decimal


# Helper: seed N days of token_usage rows at a fixed cost-per-day shape.
async def _seed_n_days_token_usage(client, days: list[tuple[date, int]]) -> None:
    """Each tuple is (day, daily_input_tokens). Output/cache fields zero.

    Single 'claude-opus-4-5' model so cost is monotonic in input tokens
    via the existing pricing seed. Use this to construct deterministic
    14d baselines with known slopes.
    """
    sessionmaker = client._transport.app.state.sessions
    async with sessionmaker() as db:
        for day_, tokens in days:
            await db.execute(text("""
                INSERT INTO token_usage (day, model, tokens_input, tokens_output,
                  tokens_cache_read, tokens_cache_create_5m, tokens_cache_create_1h)
                VALUES (:day, 'claude-opus-4-5', :input, 0, 0, 0, 0)
            """), {"day": day_.isoformat(), "input": tokens})
        await db.commit()


@pytest.mark.asyncio
async def test_forecast_returns_decimal_strings(client, freezer) -> None:
    """ANLY-06 / Anti-Pattern guard: Decimal fields serialize as JSON strings."""
    # Freeze to a date past day 7 so we get a non-null projection.
    freezer.move_to("2026-05-15T12:00:00Z")
    today = date(2026, 5, 15)
    # Seed 14 complete days [May 1..May 14] + today (May 15).
    days = [(today - timedelta(days=i), 1_000_000) for i in range(15)]
    await _seed_n_days_token_usage(client, days)

    r = await client.get("/api/cost/forecast")
    assert r.status_code == 200, r.text
    payload = r.json()
    assert isinstance(payload["month_to_date_usd"], str), (
        f"expected str, got {type(payload['month_to_date_usd'])}: "
        f"{payload['month_to_date_usd']!r}"
    )
    assert payload["projected_month_total_usd"] is not None
    assert isinstance(payload["projected_month_total_usd"], str)
    assert payload["baseline_days"] == 14


@pytest.mark.asyncio
async def test_forecast_insufficient_data_threshold(client, freezer) -> None:
    """D-01 / D-05: day 3 of month → insufficient_data=true, partial_bias=true."""
    freezer.move_to("2026-01-03T12:00:00Z")
    # Seed minimal data — even with data, days_elapsed=2 < 7 should suppress.
    await _seed_n_days_token_usage(client, [(date(2026, 1, 1), 1000), (date(2026, 1, 2), 2000)])

    r = await client.get("/api/cost/forecast")
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload["days_elapsed"] == 2, f"expected days_elapsed=2, got {payload['days_elapsed']}"
    assert payload["insufficient_data"] is True
    assert payload["partial_month_bias"] is True
    assert payload["projected_month_total_usd"] is None
    # MTD still reported even when insufficient
    assert isinstance(payload["month_to_date_usd"], str)


@pytest.mark.asyncio
async def test_forecast_flags_clear_on_day_8(client, freezer) -> None:
    """D-01: day 8 → days_elapsed=7 >= 7 → both flags clear."""
    freezer.move_to("2026-05-08T12:00:00Z")
    today = date(2026, 5, 8)
    # Seed 14 days [Apr 24..May 7] (today excluded from baseline).
    days = [(today - timedelta(days=i + 1), 1_000_000) for i in range(14)]
    days.append((today, 500_000))  # today's MTD contribution
    # Also include earlier-month days to round out MTD
    for d in range(1, 8):
        days.append((date(2026, 5, d), 500_000))
    await _seed_n_days_token_usage(client, days)

    r = await client.get("/api/cost/forecast")
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload["days_elapsed"] == 7
    assert payload["insufficient_data"] is False
    assert payload["partial_month_bias"] is False
    assert payload["projected_month_total_usd"] is not None


@pytest.mark.asyncio
async def test_forecast_excludes_today_from_baseline(client, freezer) -> None:
    """D-02: today is NOT included in the 14d baseline used for OLS slope.

    Seed identical [today-14..today-1] (slope should be 0 → flat projection).
    Seed a wildly different value for today. Assert projection reflects
    only the historical days, not today's outlier.
    """
    freezer.move_to("2026-05-20T12:00:00Z")
    today = date(2026, 5, 20)
    flat_input = 1_000_000  # constant baseline
    days = [(today - timedelta(days=i + 1), flat_input) for i in range(14)]
    days.append((today, 999_999_999))  # today's outlier — should not bias slope
    await _seed_n_days_token_usage(client, days)

    r = await client.get("/api/cost/forecast")
    assert r.status_code == 200, r.text
    payload = r.json()
    # With a flat 14d baseline, slope=0; projection = days_in_month * mean_daily_cost.
    # Today's outlier MTD is large, but the projection should reflect the
    # baseline mean × 31, NOT 31 × today's value.
    projected_str = payload["projected_month_total_usd"]
    assert projected_str is not None
    projected = Decimal(projected_str)
    # Compute expected: 31 days * mean(flat_input cost). Cost depends on pricing
    # seed; just assert the projection is FAR below today's outlier × 31
    # (which would be ~31 * 999_999_999 input tokens worth of cost).
    mtd = Decimal(payload["month_to_date_usd"])
    # Outlier today shouldn't lift projection above 100x the prior daily mean.
    # If today were included in the baseline, slope would be enormous and
    # projection would be much larger than mtd by orders of magnitude.
    assert projected < mtd * 100, (
        f"projection {projected!r} appears to include today's outlier; "
        f"D-02 (today excluded) violated"
    )


@pytest.mark.asyncio
async def test_forecast_baseline_days_constant(client, freezer) -> None:
    """v1 invariant: baseline_days is always 14, surfaced for transparency."""
    freezer.move_to("2026-05-15T12:00:00Z")
    r = await client.get("/api/cost/forecast")
    assert r.status_code == 200, r.text
    assert r.json()["baseline_days"] == 14
```

Confirm `pytest_freezer` is available — it's listed in `TESTING.md:332-333`. If for some reason it isn't installed, fall back to `monkeypatch`-ing `cmc.core.time.now_utc` (replace with a callable returning a fixed `datetime`).

  </action>
  <verify>
    <automated>cd backend && uv run pytest tests/test_cost_router.py -v -k "forecast"</automated>
    Expected: 5 new forecast tests pass.

    cd backend && uv run pytest tests/test_cost_router.py -v
    Expected: full file green; existing summary/breakdown/pricing-freshness tests still pass.

    cd backend && uv run pytest --tb=no
    Expected: passed >= 618 (Phase 19 baseline 598 + Plan 20-01's 3 + Task 1's 17 + Task 2's 5 = 623); failed == 0; warnings_datetime_utcnow == 0.

    cd backend && uv run python -c "
    from cmc.api.routes.cost import cost_forecast
    from cmc.api.schemas.cost import CostForecastResponse
    print('endpoint importable:', cost_forecast.__name__)
    print('response model fields:', list(CostForecastResponse.model_fields.keys()))
    "
    Expected:
      endpoint importable: cost_forecast
      response model fields: ['rates_as_of', 'days_elapsed', 'days_in_month', 'baseline_days', 'month_to_date_usd', 'projected_month_total_usd', 'insufficient_data', 'partial_month_bias']

    # Smoke-test response shape via real ASGI:
    cd backend && uv run pytest tests/test_cost_router.py::test_forecast_returns_decimal_strings -v
    Expected: passes; payload has all expected keys, Decimal fields are JSON strings.

    cd backend && uv run ruff check --select UP backend/cmc/cost/ backend/cmc/api/routes/cost.py backend/cmc/api/schemas/cost.py backend/tests/test_cost_forecast.py
    Expected: clean.
  </verify>
  <done>
    GET /api/cost/forecast returns 200 with CostForecastResponse shape (8 fields).
    Decimal fields (month_to_date_usd, projected_month_total_usd) serialize as JSON strings.
    insufficient_data + partial_month_bias both true when days_elapsed < 7; both false on day 8.
    projected_month_total_usd is null when insufficient.
    Today is excluded from the 14d OLS baseline (D-02 — verified by outlier-isolation test).
    baseline_days is always 14.
    Phase 18 BASELINE.md verifier preserved (pytest pass count, 0 datetime.utcnow warnings, ruff UP clean).
  </done>
</task>

</tasks>

<verification>
- `backend/cmc/cost/__init__.py` and `backend/cmc/cost/forecast.py` exist; module is importable as `cmc.cost.forecast`.
- `decimal_ols`, `days_elapsed_in_month`, `days_in_month`, `project_month_total` exported from `cmc.cost`.
- 17 unit tests in `test_cost_forecast.py` pass: closed-form OLS correctness, zero-variance defensive guard, leap-year days-in-month, boundary-day parametric.
- 5 integration tests in `test_cost_router.py::*forecast*` pass.
- `GET /api/cost/forecast` returns shape `{rates_as_of, days_elapsed, days_in_month, baseline_days, month_to_date_usd, projected_month_total_usd, insufficient_data, partial_month_bias}`.
- `month_to_date_usd` and `projected_month_total_usd` (when not None) are JSON strings (Pydantic v2 Decimal default).
- `insufficient_data` flips at the day-7→day-8 boundary; `partial_month_bias` follows the same threshold.
- Today is NOT part of the 14d OLS baseline (D-02 verified by adversarial outlier-on-today test).
- Forecast module does NOT call `getcontext()` — verified by grep gate.
- No `datetime.utcnow` in any new code; POLI-06 enforced.
- Phase 18 BASELINE.md verifier rules preserved: pytest pass count delta = +25 (3 from Plan 20-01 + 17 unit + 5 integration); failed == 0; `warnings_datetime_utcnow == 0`; ruff `--select UP` clean.
</verification>

<success_criteria>
- ROADMAP success criteria #1 and #2 BACKEND portion satisfied: Decimal-only OLS + 14d rolling baseline + insufficient_data guard + bias flag, all read-time, no $ stored.
- ANLY-06 backend ready for frontend consumption in Plan 03.
- Open Questions #2, #3, #4, #5 from RESEARCH.md resolved by documented planner decisions (D-01..D-05) baked into the module docstring + schema docstring.
- New `cmc/cost/` package establishes a precedent for future cost-derived analytics modules (e.g., ANLY-08 confidence band in v1.3).
</success_criteria>

<output>
After completion, create `.planning/phases/20-cost-forecast-per-project-card/20-02-SUMMARY.md` documenting:
- Decisions D-01..D-05 (all five locked in this plan).
- The closed-form Decimal OLS implementation + defensive guard.
- The handler's two-phase computation (MTD always; baseline only when sufficient).
- Pytest counts (file-level + cumulative).
- Phase 18 BASELINE.md compliance.
- Any deviation from this plan and rationale.
</output>
