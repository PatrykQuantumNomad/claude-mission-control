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
    cost-bearing-days interpretation.) — D-01.
  - The 14d baseline EXCLUDES today (uses [today-14, today-1] complete days).
    (Open Question #5, Assumption A3 — avoids partial-day bias on slope.) — D-02.
  - Negative projections are NOT clamped to MTD floor. The bias banner is
    the operator's signal during week 1; honest extrapolation is preserved
    after week 2 even if downward.
    (Open Question #4, Assumption A4.) — D-03.
  - Degenerate baseline (constant Y → zero numerator) returns
    (Decimal(0), mean(ys)) — does NOT raise. No separate flag on the
    response; the bias banner covers user-facing volatility messaging.
    (Open Question #2.) — D-04.
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

    numerator = sum(
        ((x - mx) * (y - my) for x, y in zip(xs, ys, strict=True)),
        start=Decimal(0),
    )
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
    20-RESEARCH.md Open Question #3 (D-01).
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
