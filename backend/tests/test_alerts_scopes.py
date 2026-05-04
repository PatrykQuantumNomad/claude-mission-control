"""Phase 15 Plan 01 Task 3 — scope-extractor vocabulary lock + SQL tests.

D-01: v1.0 ships exactly 3 metrics:
  - cost_usd_24h               -> scope_key 'model:<model>'
  - skill_p95_latency_ms       -> scope_key 'skill:<name>'
  - dispatcher_failed_tasks_5m -> scope_key '<global>'

Plan 02's CRUD validator imports `is_known_metric()` to reject unknown metrics
at AlertRuleCreate (-> 422). Plan 01 ships the gate; Plan 02 wires it.

Tests use the standard `client` fixture (Phase 13 P06 — runs lifespan, seeds
pricing.json into pricing table). Inline `_seed_*` helpers mirror the pattern
in test_skills_router.py.
"""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import insert

# ---- Vocabulary lock smoke tests ------------------------------------------

def test_scopes_known_metrics_lock():
    """v1.0 contract: _SCOPE_EXTRACTORS keys are exactly the 3 documented metrics.

    Adding a 4th metric in v1.2 must update this test. Removing a v1.0 metric
    breaks the contract (Plan 02 CRUD + Plan 04 frontend constants depend on
    the exact set).
    """
    from cmc.alerts.scopes import _SCOPE_EXTRACTORS

    assert set(_SCOPE_EXTRACTORS.keys()) == {
        "cost_usd_24h",
        "skill_p95_latency_ms",
        "dispatcher_failed_tasks_5m",
    }


def test_scopes_is_known_metric():
    """is_known_metric() exact-match boolean — what Plan 02 CRUD validator uses."""
    from cmc.alerts.scopes import is_known_metric

    assert is_known_metric("cost_usd_24h") is True
    assert is_known_metric("skill_p95_latency_ms") is True
    assert is_known_metric("dispatcher_failed_tasks_5m") is True
    assert is_known_metric("foo") is False
    assert is_known_metric("") is False
    # Defense against accidental case drift
    assert is_known_metric("Cost_USD_24h") is False


# ---- Inline DB seeding helpers (mirror test_skills_router.py pattern) ----

async def _seed_token_usage_row(
    app, *,
    day: date,
    model: str,
    tokens_input: int = 0,
    tokens_output: int = 0,
    tokens_cache_read: int = 0,
    tokens_cache_create_5m: int = 0,
    tokens_cache_create_1h: int = 0,
    source: str = "claude-code",
) -> None:
    """Insert one token_usage row via the engine."""
    from cmc.db.base import SQLModel
    engine = app.state.engine
    table = SQLModel.metadata.tables["token_usage"]
    async with engine.begin() as conn:
        await conn.execute(insert(table).values(
            day=day,
            model=model,
            source=source,
            tokens_input=tokens_input,
            tokens_output=tokens_output,
            tokens_cache_read=tokens_cache_read,
            tokens_cache_create=0,
            tokens_cache_create_5m=tokens_cache_create_5m,
            tokens_cache_create_1h=tokens_cache_create_1h,
            sessions_count=1,
            updated_at=datetime.now(UTC),
        ))


async def _seed_otel_event(
    app, *,
    event_name: str,
    attrs_skill_name: str | None = None,
    body: dict | None = None,
    session_id: str | None = None,
    ts: datetime | None = None,
) -> None:
    """Insert one otel_events row via the engine."""
    from cmc.db.base import SQLModel
    engine = app.state.engine
    table = SQLModel.metadata.tables["otel_events"]
    if ts is None:
        ts = datetime.now(UTC) - timedelta(seconds=1)
    async with engine.begin() as conn:
        await conn.execute(insert(table).values(
            ts=ts,
            event_name=event_name,
            session_id=session_id,
            body=body or {},
            attrs_mcp_server=None,
            attrs_mcp_tool=None,
            attrs_skill_name=attrs_skill_name,
            received_at=ts,
        ))


async def _seed_failed_task(
    app, *,
    title: str = "failed-task",
    ended_at: datetime | None = None,
) -> None:
    """Insert one failed task row via the engine. tasks.status='failed'."""
    from cmc.db.base import SQLModel
    engine = app.state.engine
    table = SQLModel.metadata.tables["tasks"]
    if ended_at is None:
        ended_at = datetime.now(UTC) - timedelta(seconds=10)
    async with engine.begin() as conn:
        await conn.execute(insert(table).values(
            title=title,
            description="",
            status="failed",
            priority=3,
            approval="auto",
            dry_run=False,
            execution_mode="classic",
            created_at=datetime.now(UTC) - timedelta(minutes=1),
            ended_at=ended_at,
        ))


def _make_skill_body(*, duration_ms: int) -> dict:
    """Build a synthetic skill_activated body.record.attributes payload."""
    return {
        "record": {
            "attributes": [
                {"key": "duration_ms", "value": {"stringValue": str(duration_ms)}},
            ]
        }
    }


# ---- cost_usd_24h tests ---------------------------------------------------

async def test_extract_cost_usd_24h_empty_db_returns_empty(client) -> None:
    """No token_usage rows in last 24h -> empty dict."""
    from cmc.alerts.scopes import extract_cost_usd_24h

    app = client._transport.app  # type: ignore[attr-defined]
    now = datetime.now(UTC).replace(tzinfo=None)
    async with app.state.sessions() as db:
        result = await extract_cost_usd_24h(db, now)
    assert result == {}


async def test_extract_cost_usd_24h_groups_by_model(client) -> None:
    """Two models within last 24h -> 2 entries with 'model:<name>' keys + float values.

    Values must match compute_cost output exactly (Decimal -> float at insert).
    """
    from decimal import Decimal

    from cmc.alerts.scopes import extract_cost_usd_24h

    from cmc.pricing import compute_cost, load_rates

    app = client._transport.app  # type: ignore[attr-defined]
    today = datetime.now(UTC).date()
    # Seed two SKUs with non-zero usage
    await _seed_token_usage_row(
        app, day=today, model="claude-opus-4-7",
        tokens_input=1_000_000, tokens_output=500_000,
    )
    await _seed_token_usage_row(
        app, day=today, model="claude-sonnet-4-6",
        tokens_input=2_000_000, tokens_output=1_000_000,
    )

    now = datetime.now(UTC).replace(tzinfo=None)
    async with app.state.sessions() as db:
        result = await extract_cost_usd_24h(db, now)
        rates = await load_rates(db)

    assert set(result.keys()) == {
        "model:claude-opus-4-7",
        "model:claude-sonnet-4-6",
    }
    # Values match compute_cost exactly (within Decimal->float precision)
    expected_opus = float(compute_cost(
        "claude-opus-4-7", 1_000_000, 500_000, 0, 0, 0, rates,
    ))
    expected_sonnet = float(compute_cost(
        "claude-sonnet-4-6", 2_000_000, 1_000_000, 0, 0, 0, rates,
    ))
    assert result["model:claude-opus-4-7"] == expected_opus
    assert result["model:claude-sonnet-4-6"] == expected_sonnet
    # Values are positive floats (assuming pricing > 0 per data/pricing.json)
    assert all(isinstance(v, float) and v > 0 for v in result.values())
    # Decimal isn't sneaking through
    assert all(not isinstance(v, Decimal) for v in result.values())


# ---- skill_p95_latency_ms tests -------------------------------------------

async def test_extract_skill_p95_latency_ms_empty(client) -> None:
    """No skill_activated events -> empty dict."""
    from cmc.alerts.scopes import extract_skill_p95_latency_ms

    app = client._transport.app  # type: ignore[attr-defined]
    now = datetime.now(UTC).replace(tzinfo=None)
    async with app.state.sessions() as db:
        result = await extract_skill_p95_latency_ms(db, now)
    assert result == {}


async def test_extract_skill_p95_latency_ms_per_skill(client) -> None:
    """Seed 5 skill_activated events for one skill at varying duration_ms ->
    {'skill:<name>': p95}. p95 is the SQLite window-CTE rank approximation."""
    from cmc.alerts.scopes import extract_skill_p95_latency_ms

    app = client._transport.app  # type: ignore[attr-defined]
    base_ts = datetime.now(UTC) - timedelta(hours=1)
    durations = [100, 200, 300, 400, 1000]
    for i, d in enumerate(durations):
        await _seed_otel_event(
            app,
            event_name="skill_activated",
            attrs_skill_name="analyze",
            body=_make_skill_body(duration_ms=d),
            ts=base_ts + timedelta(seconds=i),
        )

    now = datetime.now(UTC).replace(tzinfo=None)
    async with app.state.sessions() as db:
        result = await extract_skill_p95_latency_ms(db, now)

    assert set(result.keys()) == {"skill:analyze"}
    # p95 of [100,200,300,400,1000] via SQLite rnk = MAX(CAST(n*0.95 AS INT), 1)
    # n=5, n*0.95=4.75, CAST INT=4 -> rnk=4 -> 4th-smallest = 400.
    assert result["skill:analyze"] == 400.0


# ---- dispatcher_failed_tasks_5m tests -------------------------------------

async def test_extract_dispatcher_failed_tasks_5m_zero(client) -> None:
    """No failed tasks in last 5m -> {'<global>': 0.0} (global ALWAYS reports)."""
    from cmc.alerts.scopes import extract_dispatcher_failed_tasks_5m

    app = client._transport.app  # type: ignore[attr-defined]
    now = datetime.now(UTC).replace(tzinfo=None)
    async with app.state.sessions() as db:
        result = await extract_dispatcher_failed_tasks_5m(db, now)
    assert result == {"<global>": 0.0}


async def test_extract_dispatcher_failed_tasks_5m_count(client) -> None:
    """3 failed tasks within last 5m + 1 outside -> {'<global>': 3.0}."""
    from cmc.alerts.scopes import extract_dispatcher_failed_tasks_5m

    app = client._transport.app  # type: ignore[attr-defined]
    now_naive = datetime.now(UTC).replace(tzinfo=None)
    # 3 failures inside window
    await _seed_failed_task(app, title="t1", ended_at=now_naive - timedelta(minutes=1))
    await _seed_failed_task(app, title="t2", ended_at=now_naive - timedelta(minutes=2))
    await _seed_failed_task(app, title="t3", ended_at=now_naive - timedelta(minutes=4))
    # 1 failure outside window (>5 min ago)
    await _seed_failed_task(app, title="t-old", ended_at=now_naive - timedelta(minutes=10))

    async with app.state.sessions() as db:
        result = await extract_dispatcher_failed_tasks_5m(db, now_naive)

    assert result == {"<global>": 3.0}
