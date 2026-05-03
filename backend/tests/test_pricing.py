"""Phase 13 ANLY-01 / ANLY-02 / ANLY-03 unit tests.

Imports compute_cost from REPL-style — must work without app boot.

The two async tests at the bottom (`test_seed_loader_round_trip`,
`test_pricing_window_self_correcting`) were left as `pytest.skip` stubs by
Plan 01 because conftest didn't yet have a shared async-session fixture.
Plan 06 wires them via the new `db_session` fixture in conftest, which
yields an AsyncSession bound to a lifespan-booted app — so the 5 SKUs are
already seeded by the time the test runs (idempotency contract).
"""
from datetime import datetime
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
async def test_seed_loader_round_trip(db_session):
    """ANLY-02 — load_seed reads data/pricing.json and inserts 5 rows; idempotent.

    The conftest `db_session` fixture yields a session against a lifespan-booted
    app — pricing is ALREADY seeded by the time we get here. We assert the
    post-seed state, then call load_seed AGAIN to prove idempotency
    (on_conflict_do_nothing absorbs the re-run; row count stays at 5).
    """
    from sqlalchemy import func, select

    from cmc.db.models.pricing import PricingRow
    from cmc.pricing import load_seed

    # Lifespan already ran the seed — verify the 5 distinct SKUs are present.
    rows = (await db_session.execute(select(PricingRow))).scalars().all()
    assert len(rows) == 5, (
        f"Phase 13 lifespan seed should have inserted 5 rows; got {len(rows)}"
    )
    distinct_models = {r.model for r in rows}
    assert distinct_models == {
        "claude-opus-4-7",
        "claude-opus-4-7[1m]",
        "claude-sonnet-4-6",
        "claude-sonnet-4-6[1m]",
        "claude-haiku-4-5",
    }

    # Each row stamped the data/pricing.json hash for Plan 05's drift check.
    assert all(r.seed_hash and len(r.seed_hash) == 64 for r in rows)

    # Idempotency: re-run load_seed; UNIQUE(model, effective_from) +
    # on_conflict_do_nothing absorbs the re-run. models_seeded MUST be 0
    # and the total row count MUST stay at 5.
    summary = await load_seed(db_session)
    assert summary.get("error") is None
    assert summary["models_seeded"] == 0, (
        f"idempotency violation: load_seed re-inserted {summary['models_seeded']} rows"
    )
    n_after = (
        await db_session.execute(select(func.count()).select_from(PricingRow))
    ).scalar()
    assert n_after == 5


@pytest.mark.asyncio
async def test_pricing_window_self_correcting(db_session):
    """ANLY-03 — adding a NEWER row backdates effective_until of the prior currently-effective row.

    This is the core ANLY-03 contract: closed-open temporal intervals enable
    historical totals to self-correct when rates change. We simulate the
    "rate change" by inserting a future-dated row directly, then exercising
    the same close_stmt UPDATE clause that load_seed uses.
    """
    from decimal import Decimal as _Decimal

    from sqlalchemy import select, update

    from cmc.db.models.pricing import PricingRow

    # Pick the lifespan-seeded claude-opus-4-7 row as the baseline.
    [original] = (
        await db_session.execute(
            select(PricingRow).where(PricingRow.model == "claude-opus-4-7")
        )
    ).scalars().all()
    assert original.effective_until is None, (
        "lifespan-seeded row should be currently-effective (effective_until IS NULL)"
    )
    assert original.effective_from < datetime(2026, 7, 1)

    # Manually insert a "future" row at 2026-07-01 simulating an Anthropic rate change.
    later = datetime(2026, 7, 1)
    db_session.add(PricingRow(
        model="claude-opus-4-7",
        input_per_mtok=_Decimal("6"),
        output_per_mtok=_Decimal("30"),
        cache_read_per_mtok=_Decimal("0.6"),
        cache_create_5m_per_mtok=_Decimal("7.5"),
        cache_create_1h_per_mtok=_Decimal("12"),
        effective_from=later,
        effective_until=None,
        source_url="manual-test",
        loaded_at=datetime.utcnow(),
        seed_hash="0" * 64,
    ))
    await db_session.commit()

    # Now exercise the close_stmt UPDATE clause that load_seed uses to
    # backdate effective_until on the prior currently-effective row.
    close_stmt = (
        update(PricingRow)
        .where(
            PricingRow.model == "claude-opus-4-7",
            PricingRow.effective_until.is_(None),
            PricingRow.effective_from < later,
        )
        .values(effective_until=later)
    )
    result = await db_session.execute(close_stmt)
    await db_session.commit()
    assert result.rowcount == 1, (
        "expected exactly the original (lifespan-seeded) row to be closed"
    )

    # Verify the temporal interval shape: original row now [effective_from, later);
    # new row is [later, NULL) (still currently-effective).
    rows = (
        await db_session.execute(
            select(PricingRow)
            .where(PricingRow.model == "claude-opus-4-7")
            .order_by(PricingRow.effective_from)
        )
    ).scalars().all()
    assert len(rows) == 2
    assert rows[0].effective_until == later
    assert rows[1].effective_from == later
    assert rows[1].effective_until is None
