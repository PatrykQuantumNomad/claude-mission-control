"""cmc.cost — read-time cost analytics (forecast, future analyses).

This package contains pure-Python utility modules for cost-derived analytics
that compute over the existing token_usage rollup at request time. NO schema
changes, NO $ stored — preserves the v1.1 read-time invariant.
"""
from cmc.cost.forecast import (
    days_elapsed_in_month,
    days_in_month,
    decimal_ols,
    project_month_total,
)

__all__ = [
    "days_elapsed_in_month",
    "days_in_month",
    "decimal_ols",
    "project_month_total",
]
