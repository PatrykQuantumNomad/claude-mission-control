"""Phase 13 ANLY-04 — cost router integration tests.

Mirrors backend/tests/test_observability_router.py fixture pattern: uses the
shared `client` fixture (which runs the lifespan, auto-seeding the 5 SKUs from
data/pricing.json into the pricing table) and seeds token_usage rows directly
through the engine via `_seed_rows`.

NOTE: there is no `seed_pricing` / `seed_token_usage` fixture in conftest;
the lifespan-driven pricing seed makes the former unnecessary, and we seed
token_usage inline per test below (matching the OBSV-* test style).
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import insert

from tests.conftest import make_token_usage_bucket


async def _seed_token_usage(app, rows: list[dict]) -> None:
    """Insert raw token_usage rows via the engine bound to the app.

    Normalizes string `day` (from make_token_usage_bucket's default) to
    `date` objects since SQLite Date columns require real `date` instances.
    """
    from cmc.db.base import SQLModel
    engine = app.state.engine
    table = SQLModel.metadata.tables["token_usage"]
    rows = [
        {
            **r,
            "day": (
                date.fromisoformat(r["day"])
                if isinstance(r.get("day"), str)
                else r.get("day")
            ),
        }
        for r in rows
    ]
    async with engine.begin() as conn:
        for row in rows:
            await conn.execute(insert(table).values(**row))


async def _seed_default_token_usage(client) -> None:
    """Seed a small representative token_usage set covering 3 SKUs in the
    last 7 days. Used by every test that needs non-empty totals.
    """
    app = client._transport.app  # type: ignore[attr-defined]
    today = datetime.now(UTC).date().isoformat()
    yesterday = (datetime.now(UTC) - timedelta(days=1)).date().isoformat()
    rows = [
        make_token_usage_bucket(
            day=today, model="claude-opus-4-7",
            tokens_input=1_000_000, tokens_output=500_000,
            tokens_cache_read=0, tokens_cache_create=0,
        ),
        make_token_usage_bucket(
            day=yesterday, model="claude-sonnet-4-6",
            tokens_input=2_000_000, tokens_output=1_000_000,
            tokens_cache_read=200_000, tokens_cache_create=100_000,
        ),
        make_token_usage_bucket(
            day=today, model="claude-haiku-4-5",
            tokens_input=5_000_000, tokens_output=200_000,
            tokens_cache_read=0, tokens_cache_create=0,
        ),
    ]
    await _seed_token_usage(app, rows)


# ---- Schema importability smoke -----------------------------------------


def test_cost_schemas_importable() -> None:
    """Wave-0 smoke: cost response DTOs are importable."""
    from cmc.api.schemas.cost import (  # noqa: F401
        BreakdownDim,
        CostBreakdownResponse,
        CostBreakdownRow,
        CostByModelRow,
        CostRange,
        CostSummaryResponse,
        PricingFreshnessResponse,
    )


# ---- ANLY-04 integration tests ------------------------------------------


async def test_cost_summary_returns_decimal_strings(client) -> None:
    """ANLY-04 — Decimal serialized as JSON string, not float (Anti-Pattern guard)."""
    await _seed_default_token_usage(client)

    r = await client.get("/api/cost/summary?range=7d")
    assert r.status_code == 200, r.text
    payload = r.json()

    assert "rates_as_of" in payload
    assert "total_usd" in payload
    assert "by_model" in payload
    # Decimal must be a JSON string, not a float (research Anti-Pattern):
    assert isinstance(payload["total_usd"], str), (
        f"expected string, got {type(payload['total_usd'])}: {payload['total_usd']!r}"
    )
    for row in payload["by_model"]:
        assert isinstance(row["cost_usd"], str), (
            f"by_model row cost_usd must be string, got {type(row['cost_usd'])}"
        )

    # rates_as_of populated by lifespan-seeded pricing rows (data/pricing.json).
    assert payload["rates_as_of"] == "2026-05-03"
    # 3 distinct models seeded -> 3 by_model rows.
    assert len(payload["by_model"]) == 3
    # Total > 0 since we seeded non-zero tokens against priced SKUs.
    assert Decimal(payload["total_usd"]) > Decimal(0)


async def test_cost_summary_range_invalid_returns_422(client) -> None:
    """Range outside 1d|7d|14d|30d Literal -> FastAPI 422."""
    r = await client.get("/api/cost/summary?range=2y")
    assert r.status_code == 422


async def test_cost_summary_range_2d_returns_422(client) -> None:
    """Specifically '2d' (close-but-not-listed) returns 422 — guards the locked enum."""
    r = await client.get("/api/cost/summary?range=2d")
    assert r.status_code == 422


async def test_breakdown_sums_to_summary(client) -> None:
    """ANLY-04 — /breakdown?dim=model total must EXACTLY equal /summary total.

    Decimal equality (no float drift mid-flight). This is the contract that
    makes the cost-engine read-time computation auditable.
    """
    await _seed_default_token_usage(client)

    r1 = await client.get("/api/cost/summary?range=7d")
    r2 = await client.get("/api/cost/breakdown?dim=model&range=7d")
    assert r1.status_code == 200, r1.text
    assert r2.status_code == 200, r2.text

    t1 = Decimal(r1.json()["total_usd"])
    t2 = Decimal(r2.json()["total_usd"])
    assert t1 == t2, f"summary={t1} breakdown={t2}"


async def test_breakdown_dim_invalid_returns_422(client) -> None:
    r = await client.get("/api/cost/breakdown?dim=zoinks&range=7d")
    assert r.status_code == 422


async def test_breakdown_dim_required_returns_422(client) -> None:
    """`dim` is a required Query parameter — missing -> 422."""
    r = await client.get("/api/cost/breakdown?range=7d")
    assert r.status_code == 422


async def test_pricing_freshness_returns_hash_and_age(client) -> None:
    """ANLY-04 — /pricing/freshness exposes rates_as_of + on-disk hash for doctor."""
    r = await client.get("/api/pricing/freshness")
    assert r.status_code == 200, r.text
    p = r.json()

    assert "rates_as_of" in p
    assert "is_stale" in p
    assert "age_days" in p
    assert isinstance(p["on_disk_hash"], str)
    # Hash is sha256 -> 64 hex chars (or "" only if pricing.json missing).
    assert len(p["on_disk_hash"]) == 64
    # 5 SKUs auto-seeded by lifespan from data/pricing.json.
    assert p["model_count"] == 5
    # Lifespan seed uses published_at from pricing.json (2026-05-03).
    assert p["rates_as_of"] == "2026-05-03"
