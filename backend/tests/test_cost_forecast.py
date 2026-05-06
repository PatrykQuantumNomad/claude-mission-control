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
    days_elapsed_in_month,
    days_in_month,
    decimal_ols,
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
