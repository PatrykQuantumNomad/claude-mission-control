---
phase: 20-cost-forecast-per-project-card
plan: 02
subsystem: backend/cost
tags: [forecast, decimal, ols, anly-06, read-time-cost]
requires:
  - 20-01 (cost.py file ownership; sequential edit with the breakdown refactor)
  - cmc.pricing global Decimal context (prec=28, ROUND_HALF_EVEN)
  - cmc.core.time.now_utc (POLI-06 ban inherited)
  - token_usage daily rollup (Phase 13 ANLY-01..05 foundation)
provides:
  - GET /api/cost/forecast endpoint (CostForecastResponse, 8 fields)
  - cmc.cost package — first cost-derived analytics module
  - cmc.cost.forecast: decimal_ols, days_elapsed_in_month, days_in_month, project_month_total
  - Pure-stdlib Decimal OLS (no numpy/scipy) — closed-form least squares
affects:
  - cost_router (new route alongside summary/breakdown/pricing.freshness)
  - schemas/cost.py (new CostForecastResponse model)
  - test_cost_router.py (+5 integration tests; helper _seed_n_days_token_usage)
tech-stack-added:
  - pytest-freezer (already installed; first use in this plan)
patterns:
  - Pure-stdlib analytics module pattern (decimal-only, no DB access in module)
  - Two-phase route handler: MTD always, baseline only when sufficient
  - Adversarial outlier-isolation test for D-02 (today excluded from baseline)
key-files:
  created:
    - backend/cmc/cost/__init__.py
    - backend/cmc/cost/forecast.py
    - backend/tests/test_cost_forecast.py
  modified:
    - backend/cmc/api/schemas/cost.py
    - backend/cmc/api/routes/cost.py
    - backend/tests/test_cost_router.py
decisions:
  - D-01 days_elapsed = today.day - 1 (calendar interpretation)
  - D-02 14d baseline excludes today (avoids partial-day bias on slope)
  - D-03 No clamp on negative-slope projections
  - D-04 No degenerate_baseline flag (zero-variance → slope=0, mean intercept)
  - D-05 insufficient_data and partial_month_bias share same threshold (< 7)
  - D-Decimal-context-inherit forecast.py inherits cmc.pricing context, never re-sets
  - D-Module-imports route handler hoists forecast/now_utc imports to module level
metrics:
  duration: 23m
  completed: 2026-05-06
  pytest_passed_before: 601
  pytest_passed_after: 632
  pytest_delta: +31
  warnings_total: 32
  warnings_datetime_utcnow: 0
  unit_tests_added: 26
  integration_tests_added: 5
  commits: 4
requirements: [ANLY-06]
---

# Phase 20 Plan 02: Cost Forecast Module and Endpoint Summary

ANLY-06 backend shipped — read-time monthly cost forecast via stdlib Decimal-only OLS over a 14d rolling baseline, exposed at `GET /api/cost/forecast`.

## What Shipped

**New `cmc/cost/` package** (first cost-derived analytics module — establishes precedent for ANLY-08 confidence band in v1.3):

- `cmc/cost/__init__.py` — package marker + ergonomic re-exports.
- `cmc/cost/forecast.py` — pure-Python Decimal OLS:
  - `decimal_ols(xs, ys) -> (slope, intercept)`: closed-form least squares with defensive zero-variance guard (returns `(Decimal(0), mean(ys))` instead of raising `decimal.DivisionByZero`).
  - `days_elapsed_in_month(today)`: `today.day - 1` (D-01).
  - `days_in_month(today)`: `calendar.monthrange` — leap-year correct.
  - `project_month_total(slope, intercept, days_in_month)`: trapezoidal sum `days * (intercept + slope * (days - 1) / 2)`. No clamp on negative projections (D-03).
  - Module docstring cites Decimal context inheritance from `cmc.pricing`; module MUST NOT call `getcontext()` again. Verified by structural grep gate.

**New `CostForecastResponse` schema** (`cmc/api/schemas/cost.py`) — 8 fields:
- `rates_as_of: date | None`
- `days_elapsed: int` (0..30)
- `days_in_month: int` (28..31)
- `baseline_days: int` (always 14 in v1)
- `month_to_date_usd: Decimal` (always present, JSON string)
- `projected_month_total_usd: Decimal | None` (null when insufficient_data)
- `insufficient_data: bool`
- `partial_month_bias: bool`

Decimal fields rely on Pydantic v2 default JSON-string serialization (Anti-Pattern guard inherited from existing `CostSummaryResponse`).

**New `GET /api/cost/forecast` endpoint** (`cmc/api/routes/cost.py`) — slotted between `cost_breakdown` and `pricing_freshness`. Two-phase computation:

1. **MTD** (always): SUM Decimal cost across `[month_start, today]` via `_FORECAST_MTD_SQL` joined to currently-effective rates via `compute_cost`. The response always carries `month_to_date_usd`.
2. **14d baseline** (only when `days_elapsed >= 7`, D-02 today excluded): per-day Decimal cost across `[today-14, today-1]`, padded to length 14, fed into `decimal_ols` → `project_month_total` for the projection.

When `insufficient_data`, the handler returns early with `projected_month_total_usd=None`. Both `insufficient_data` and `partial_month_bias` share the same `< 7` threshold (D-05).

## Decisions Made

- **D-01 (locked) — `days_elapsed = today.day - 1`.** Calendar interpretation, not cost-bearing-days. Day 1 → 0, day 7 → 6 (insufficient), day 8 → 7 (forecast unlocks). Matches 20-RESEARCH.md Open Question #3 / Assumption A2.
- **D-02 (locked) — 14d baseline EXCLUDES today.** Uses `[today-14, today-1]`. Avoids partial-day bias on the OLS slope (today's row reflects in-progress accumulation). Verified by adversarial test `test_forecast_excludes_today_from_baseline`: seeds a 999_999_999-token outlier for today against a flat 14d baseline; assertion fails if projection grows by orders of magnitude.
- **D-03 (locked) — No clamp on negative projections.** Raw OLS extrapolation; honest signal. `partial_month_bias` is the operator's UI banner during week 1; after week 2, sharply-declining trends produce honest-but-low projections (the dashboard handles presentation).
- **D-04 (locked) — No `degenerate_baseline` flag.** Zero-variance Y series (constant cost across 14 days) returns `slope=Decimal(0)`, `intercept=mean(ys)`, `projection = mean * days_in_month`. The `partial_month_bias` flag covers user-facing volatility messaging; a separate field would be redundant.
- **D-05 (locked) — Single threshold for both flags.** `insufficient_data` and `partial_month_bias` both flip at `days_elapsed < 7`. Surfaced as separate booleans for forward-compat in case the policy diverges later.
- **D-Decimal-context-inherit — forecast.py inherits `cmc.pricing` context.** The module MUST NOT call `getcontext()` again. Pricing is always imported in any code path that reaches forecast (`compute_cost` is the read-time entry point). Verified by `grep -nE "getcontext\(\)\.prec|getcontext\(\)\.rounding" cmc/cost/forecast.py` returning zero matches.
- **D-Module-imports — hoist to module-level.** Route handler imports `now_utc`, `cmc.cost.forecast.*`, and `datetime.timedelta` at module top, not inside the function body. Cleaner; passes ruff; matches the existing cost.py import discipline.

## Closed-Form OLS Implementation

```python
mx = sum(xs) / n
my = sum(ys) / n
numerator   = Σ (x - mx) * (y - my)
denominator = Σ (x - mx)²
slope = numerator / denominator if denominator != 0 else Decimal(0)
intercept = my - slope * mx
month_total = days_in_month * (intercept + slope * (days_in_month - 1) / 2)
```

For the locked `xs = [Decimal(0), 1, ..., 13]`, `denominator = Decimal(227.5)` is constant. The defensive guard activates on single-point input (`xs=[Decimal(0)]`, denominator=0) and on zero-variance Y (numerator=0; division also yields slope=0 by extension).

## Test Coverage

**26 unit tests** in `tests/test_cost_forecast.py` (parametrize expansions count individually):

| Function | Cases |
|----------|-------|
| `decimal_ols` | known series (slope=2, intercept=1), zero-variance Y, negative slope, single-point input, empty input, length-mismatch ValueError |
| `days_elapsed_in_month` | 9 parametric cases (day 1, 2, 7, 8, 15, 28, 29, 30, 31) |
| `days_in_month` | 7 parametric cases incl. 2024 leap, 2025 non-leap, 2000 century-leap, 1900 century-non-leap |
| `project_month_total` | zero slope flat 300, unit slope sum-0..9 = 45, negative slope = -570 (no clamp), zero-day month |

**5 integration tests** in `tests/test_cost_router.py` (using `pytest_freezer.freezer` fixture, freezegun-based):

| Test | Locks |
|------|-------|
| `test_forecast_returns_decimal_strings` | Anti-Pattern guard — Decimal fields JSON-serialize as strings, not floats |
| `test_forecast_insufficient_data_threshold` | D-01 / D-05 — day 3 → days_elapsed=2 < 7, both flags true, projected=null |
| `test_forecast_flags_clear_on_day_8` | D-01 boundary — day 8 → days_elapsed=7 ≥ 7, both flags false, projection populated |
| `test_forecast_excludes_today_from_baseline` | D-02 adversarial — 999_999_999 outlier on today must NOT lift projection |
| `test_forecast_baseline_days_constant` | v1 invariant — `baseline_days == 14` always |

## Auto-fixed Issues

**1. [Rule 3 - Blocking] Test seed model name mismatch**
- **Found during:** Task 2 GREEN phase — `test_forecast_excludes_today_from_baseline` failed with `projected == 0` and `mtd == 0`.
- **Issue:** Test helper `_seed_n_days_token_usage` was originally written with `model="claude-opus-4-5"`, which doesn't exist in `data/pricing.json`. The pricing seed has `claude-opus-4-7`, `claude-opus-4-7[1m]`, `claude-sonnet-4-6`, `claude-sonnet-4-6[1m]`, and `claude-haiku-4-5`. Lookup miss → `compute_cost` returned `Decimal(0)` for every row → projections + MTD both zero.
- **Fix:** Switched the helper to `model="claude-opus-4-7"`. All 5 forecast integration tests pass.
- **Files modified:** `backend/tests/test_cost_router.py`
- **Commit:** `2765f07` (folded into the GREEN endpoint commit since the helper was net-new in the same plan).

**2. [Rule 3 - Blocking] Ruff RUF003 ambiguous multiplication-sign character**
- **Found during:** Task 2 RED commit pre-commit hook.
- **Issue:** Inline test comment used `×` (U+00D7 MULTIPLICATION SIGN) for arithmetic exposition. Ruff's `RUF003` flagged it as ambiguous.
- **Fix:** Replaced `×` with ASCII `*` in the comment. No semantic change.
- **Files modified:** `backend/tests/test_cost_router.py`
- **Commit:** Folded into the RED tests commit `54f922b`.

**3. [Rule 3 - Blocking] Ruff I001 import-block reorder in test_cost_forecast.py**
- **Found during:** Task 1 RED commit pre-commit hook.
- **Issue:** `from cmc.cost.forecast import (...)` was placed AFTER a blank line following `import pytest`, which isort/ruff considered an unsorted import group.
- **Fix:** Auto-fixed via `ruff check --select I --fix`. The fixer collapsed the spacing and re-sorted the alphabetic order inside the multi-import block (e.g., `days_elapsed_in_month`, `days_in_month`, `decimal_ols`, `project_month_total`).
- **Files modified:** `backend/tests/test_cost_forecast.py`
- **Commit:** Folded into the RED tests commit `01b25a1`.

## Phase 18 BASELINE.md Compliance

| Metric | Phase 18 Baseline | Plan 20-01 | Plan 20-02 (this plan) | Verdict |
|--------|------------------:|-----------:|-----------------------:|---------|
| pytest passed | ≥ 566 | 601 | 632 | pass (delta +31, expected +31) |
| pytest failed | 0 | 0 | 0 | pass |
| warnings_datetime_utcnow | 0 | 0 | 0 | pass |
| total warnings (ceiling 132) | 32 | 32 | 32 | pass |
| ruff `--select UP` | clean | clean | clean | pass |
| `getcontext()` calls outside `cmc.pricing` | 0 | 0 | 0 | pass |

## Commits (4)

| Hash | Type | Subject |
|------|------|---------|
| `01b25a1` | test | add failing unit tests for cmc.cost.forecast (RED) |
| `10e0757` | feat | add cmc.cost.forecast module — Decimal-only OLS for ANLY-06 (GREEN) |
| `54f922b` | test | add CostForecastResponse schema + 5 failing forecast endpoint tests (RED) |
| `2765f07` | feat | wire GET /api/cost/forecast endpoint — ANLY-06 backend (GREEN) |

Two RED→GREEN gates, one per task. Bisect-friendly: at `01b25a1` and `54f922b` the suite has known-failing tests; at `10e0757` and `2765f07` it's green.

## TDD Gate Compliance

Both Task 1 and Task 2 followed RED → GREEN.
- Task 1 RED commit (`01b25a1`) — failing-on-import (cmc.cost package didn't exist).
- Task 1 GREEN commit (`10e0757`) — 26/26 unit tests pass.
- Task 2 RED commit (`54f922b`) — failing with HTTP 404 / empty body (endpoint not wired).
- Task 2 GREEN commit (`2765f07`) — 5/5 integration tests pass after the model-name fix.

No REFACTOR commit needed — the GREEN code is the minimal correct implementation; nothing to clean up.

## Frontend Handoff (Plan 20-03)

The endpoint contract is locked. Frontend in Plan 03 should:
- Fetch `GET /api/cost/forecast` once on dashboard mount (no query params).
- When `insufficient_data === true`: render the partial-month bias banner with explanatory copy ("Forecast available after day 8"); do NOT render `projected_month_total_usd` (it's null).
- When `insufficient_data === false`: render `projected_month_total_usd` as the projection figure; if `partial_month_bias === true` (which won't happen in v1 since both flags share a threshold, but the UI should still degrade gracefully if the policy ever diverges), keep the banner up.
- Decimal fields arrive as JSON strings — parse with `parseFloat` for display, but keep the raw string for any computation that round-trips back to the backend.

## Self-Check: PASSED

Created files exist:
- `backend/cmc/cost/__init__.py` — FOUND
- `backend/cmc/cost/forecast.py` — FOUND
- `backend/tests/test_cost_forecast.py` — FOUND
- `backend/cmc/api/schemas/cost.py` (modified) — FOUND
- `backend/cmc/api/routes/cost.py` (modified) — FOUND
- `backend/tests/test_cost_router.py` (modified) — FOUND

Commits exist:
- `01b25a1` — FOUND
- `10e0757` — FOUND
- `54f922b` — FOUND
- `2765f07` — FOUND

Verify gates:
- pytest passed: 632 (= 601 + 26 unit + 5 integration) — pass
- pytest failed: 0 — pass
- warnings_datetime_utcnow: 0 — pass
- total warnings: 32 (≤ ceiling 132) — pass
- ruff `--select UP`: clean — pass
- `getcontext()` outside `cmc.pricing`: 0 — pass
- `datetime.utcnow` in plan files: 0 — pass

ROADMAP success criteria #1 + #2 backend portion: SATISFIED.
ANLY-06 backend: ready for Plan 20-03 frontend consumption.
