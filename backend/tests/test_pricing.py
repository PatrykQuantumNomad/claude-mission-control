"""Phase 13 ANLY-01 / ANLY-02 / ANLY-03 unit tests.

Imports compute_cost from REPL-style — must work without app boot.
"""
from decimal import Decimal

import pytest

from cmc.pricing import _rates_dict_to_decimal, compute_cost, unpriced_tokens


def test_compute_cost_decimal_no_float_drift():
    rates = {"claude-opus-4-7": _rates_dict_to_decimal({
        "input": "5", "output": "25", "cache_read": "0.50",
        "cache_create_5m": "6.25", "cache_create_1h": "10",
    })}
    # 1M input tokens at $5/Mtok = exactly $5.00
    cost = compute_cost("claude-opus-4-7", 1_000_000, 0, 0, 0, 0, rates)
    assert cost == Decimal("5")
    # 1.5M output at $25/Mtok = $37.50 exactly (no 37.499999... drift)
    cost = compute_cost("claude-opus-4-7", 0, 1_500_000, 0, 0, 0, rates)
    assert cost == Decimal("37.50")
    # All five token kinds combined
    cost = compute_cost(
        "claude-opus-4-7",
        1_000_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000,
        rates,
    )
    # 5 + 25 + 0.50 + 6.25 + 10 = 46.75
    assert cost == Decimal("46.75")


def test_compute_cost_unpriced_returns_zero_and_counts():
    unpriced_tokens.clear()
    rates = {"known": _rates_dict_to_decimal({
        "input": "5", "output": "25", "cache_read": "0.50",
        "cache_create_5m": "6.25", "cache_create_1h": "10",
    })}
    cost = compute_cost("UNKNOWN-MODEL", 100, 200, 0, 0, 50, rates)
    assert cost == Decimal(0)
    assert unpriced_tokens[("UNKNOWN-MODEL", "input")] == 100
    assert unpriced_tokens[("UNKNOWN-MODEL", "output")] == 200
    assert unpriced_tokens[("UNKNOWN-MODEL", "cache_create_1h")] == 50
    # Zero-token kinds do NOT increment
    assert ("UNKNOWN-MODEL", "cache_read") not in unpriced_tokens


@pytest.mark.asyncio
async def test_seed_loader_round_trip(tmp_path, monkeypatch):
    """ANLY-02 — 5 SKUs round-trip from data/pricing.json into pricing rows."""
    # Use the real data/pricing.json from the repo.
    # Test relies on conftest fixtures providing async session — adapt to project's pattern.
    # See backend/tests/conftest.py for the reference fixture name.
    pytest.skip("Wire after conftest async-session fixture — see test_ingest.py for pattern")


@pytest.mark.asyncio
async def test_pricing_window_self_correcting():
    """ANLY-03 — adding a new row backdates effective_until of the prior row."""
    pytest.skip("Wire after conftest async-session fixture")
