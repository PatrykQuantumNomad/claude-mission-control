"""Phase 6 Plan 01 backend extension tests — ACTV-01 + ACTV-05.

Two new GET routes added to cmc.api.routes.observability:
  - GET /api/activity/heatmap?range={today|7d|30d} (ACTV-01)
  - GET /api/sessions/failures?range={today|7d|30d} (ACTV-05)

Pattern matches test_phase3_observability.py: uses the conftest seeded_app +
client fixture and the make_session_row / make_otel_event factory helpers.
The local _seed_rows helper is duplicated from test_phase3_observability.py
(self-contained module so future Phase-6 plans can extend it without coupling
back to the Phase-3 file).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import insert

from tests.conftest import make_otel_event, make_session_row


async def _seed_rows(app, table_name: str, rows: list[dict]) -> None:
    """Mirror of test_phase3_observability._seed_rows minus the token_usage
    branch (Phase 6 routes don't touch token_usage).

    Auto-seeds parent sessions for any FK-referenced session_id when seeding
    otel_events so PRAGMA foreign_keys=1 doesn't reject the insert.
    """
    from cmc.db.base import SQLModel

    engine = app.state.engine
    table = SQLModel.metadata.tables[table_name]

    if table_name == "otel_events":
        sessions_table = SQLModel.metadata.tables["sessions"]
        needed = {r.get("session_id") for r in rows if r.get("session_id")}
        if needed:
            async with engine.begin() as conn:
                from sqlalchemy import select as sa_select

                existing = (
                    await conn.execute(
                        sa_select(sessions_table.c.session_id).where(
                            sessions_table.c.session_id.in_(needed)
                        )
                    )
                ).scalars().all()
                missing = needed - set(existing)
                base_ts = datetime.now(timezone.utc) - timedelta(minutes=5)
                for sid in missing:
                    await conn.execute(
                        insert(sessions_table).values(
                            **make_session_row(session_id=sid, started_at=base_ts)
                        )
                    )

    async with engine.begin() as conn:
        for row in rows:
            await conn.execute(insert(table).values(**row))


# ---------------------------------------------------------------------------
# ACTV-01 — /api/activity/heatmap
# ---------------------------------------------------------------------------


async def test_actv_01_heatmap_empty_db(client) -> None:
    """ACTV-01: zero sessions -> empty items, range echoed back."""
    r = await client.get("/api/activity/heatmap", params={"range": "30d"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body == {"items": [], "range": "30d"}


async def test_actv_01_heatmap_groups_and_orders_ascending(client) -> None:
    """ACTV-01: 3 sessions across 2 days -> 2 rows, day ASC, sessions counted."""
    app = client._transport.app  # type: ignore[attr-defined]
    base = datetime.now(timezone.utc) - timedelta(hours=1)
    yesterday = base - timedelta(days=1)
    rows = [
        make_session_row(session_id="s-today-1", started_at=base, tokens_input=100, tokens_output=50),
        make_session_row(session_id="s-today-2", started_at=base, tokens_input=200, tokens_output=80),
        make_session_row(session_id="s-yest-1", started_at=yesterday, tokens_input=10, tokens_output=5),
    ]
    await _seed_rows(app, "sessions", rows)

    r = await client.get("/api/activity/heatmap", params={"range": "7d"})
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert len(items) == 2
    # ascending order
    assert items[0]["day"] < items[1]["day"]
    # the day with 2 sessions has sessions=2
    counts_by_day = {it["day"]: it["sessions"] for it in items}
    assert max(counts_by_day.values()) == 2
    assert min(counts_by_day.values()) == 1


async def test_actv_01_heatmap_invalid_range_422(client) -> None:
    """ACTV-01: FastAPI Literal validation rejects non-allowed range value."""
    r = await client.get("/api/activity/heatmap", params={"range": "99d"})
    assert r.status_code == 422


async def test_actv_01_heatmap_tokens_effective_is_full_sum(client) -> None:
    """ACTV-01: tokens_effective = input + output + cache_read + cache_create."""
    app = client._transport.app  # type: ignore[attr-defined]
    base = datetime.now(timezone.utc) - timedelta(hours=1)
    await _seed_rows(
        app,
        "sessions",
        [
            make_session_row(
                session_id="s-tok",
                started_at=base,
                tokens_input=10,
                tokens_output=20,
                tokens_cache_read=30,
                tokens_cache_create=40,
            ),
        ],
    )
    r = await client.get("/api/activity/heatmap", params={"range": "30d"})
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["tokens_effective"] == 100  # 10 + 20 + 30 + 40
    assert items[0]["sessions"] == 1


# ---------------------------------------------------------------------------
# ACTV-05 — /api/sessions/failures
# ---------------------------------------------------------------------------


async def test_actv_05_failures_empty(client) -> None:
    """ACTV-05: no sessions -> empty items, range echoed."""
    r = await client.get("/api/sessions/failures", params={"range": "30d"})
    assert r.status_code == 200, r.text
    assert r.json() == {"items": [], "range": "30d"}


async def test_actv_05_failures_filters_to_errored_and_rate_limited(client) -> None:
    """ACTV-05: only errored + rate_limited sessions surface; healthy session skipped."""
    app = client._transport.app  # type: ignore[attr-defined]
    base = datetime.now(timezone.utc) - timedelta(minutes=30)
    earlier = base - timedelta(minutes=10)
    sessions = [
        make_session_row(session_id="s-err", started_at=base),
        make_session_row(session_id="s-rate", started_at=earlier),
        make_session_row(session_id="s-ok", started_at=base),
    ]
    await _seed_rows(app, "sessions", sessions)
    events = [
        make_otel_event(ts=base, event_name="claude_code.api_error", session_id="s-err",
                        body={"message": "rate boom"}),
        make_otel_event(ts=earlier, event_name="claude_code.api_retries_exhausted",
                        session_id="s-rate"),
    ]
    await _seed_rows(app, "otel_events", events)

    r = await client.get("/api/sessions/failures", params={"range": "30d"})
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert len(items) == 2
    # ordered by started_at DESC (s-err is newer than s-rate)
    sids = [it["session_id"] for it in items]
    assert sids == ["s-err", "s-rate"]
    outcomes = {it["session_id"]: it["outcome"] for it in items}
    assert outcomes == {"s-err": "errored", "s-rate": "rate_limited"}


async def test_actv_05_failures_populates_last_error_message(client) -> None:
    """ACTV-05: errored session with api_error event -> message populated."""
    app = client._transport.app  # type: ignore[attr-defined]
    base = datetime.now(timezone.utc) - timedelta(minutes=10)
    await _seed_rows(app, "sessions", [make_session_row(session_id="s-err", started_at=base)])
    await _seed_rows(
        app,
        "otel_events",
        [
            # older message
            make_otel_event(
                ts=base - timedelta(seconds=30),
                event_name="claude_code.api_error",
                session_id="s-err",
                body={"message": "old failure"},
            ),
            # newer message — the route should pick this one (latest first)
            make_otel_event(
                ts=base,
                event_name="claude_code.api_error",
                session_id="s-err",
                body={"message": "newer failure"},
            ),
        ],
    )

    r = await client.get("/api/sessions/failures", params={"range": "30d"})
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["session_id"] == "s-err"
    assert items[0]["last_error_message"] == "newer failure"


async def test_actv_05_failures_rate_limited_without_api_error_has_null_message(client) -> None:
    """ACTV-05: rate_limited session WITHOUT an api_error event -> last_error_message=None."""
    app = client._transport.app  # type: ignore[attr-defined]
    base = datetime.now(timezone.utc) - timedelta(minutes=10)
    await _seed_rows(app, "sessions", [make_session_row(session_id="s-rate", started_at=base)])
    await _seed_rows(
        app,
        "otel_events",
        [
            make_otel_event(
                ts=base,
                event_name="claude_code.api_retries_exhausted",
                session_id="s-rate",
            ),
        ],
    )

    r = await client.get("/api/sessions/failures", params={"range": "30d"})
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["session_id"] == "s-rate"
    assert items[0]["outcome"] == "rate_limited"
    assert items[0]["last_error_message"] is None


async def test_actv_05_failures_invalid_range_422(client) -> None:
    """ACTV-05: invalid range rejected by FastAPI Literal validation."""
    r = await client.get("/api/sessions/failures", params={"range": "1y"})
    assert r.status_code == 422
