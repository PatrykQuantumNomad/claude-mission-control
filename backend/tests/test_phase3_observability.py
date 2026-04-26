"""Phase 3 observability-router tests (OBSV-*).

Phase 3 per-router convention: every OBSV-* test lives in this file.
See test_phase3_system.py module docstring for the full convention.

Plan 03-04 appended OBSV-01..10 endpoint tests below the Wave-0 smoke.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import insert

from tests.conftest import (
    make_otel_event,
    make_session_row,
    make_token_usage_bucket,
    make_tool_call,
)


def test_observability_schemas_importable() -> None:
    """Wave-0 smoke: OBSV response DTOs are importable from cmc.api.schemas.observability."""
    from cmc.api.schemas.observability import (  # noqa: F401
        AgentFanoutResponse,
        AgentFanoutRow,
        ApiErrorEntry,
        CacheResponse,
        CacheTrendRow,
        EditDecisionRow,
        EditDecisionsResponse,
        HookActivityResponse,
        HookActivityRow,
        OutcomeDailyRow,
        OutcomesResponse,
        PressureResponse,
        ProductivityResponse,
        ProjectRollupResponse,
        ProjectRollupRow,
        TokenUsageDailyRow,
        TokenUsageResponse,
        ToolLatencyResponse,
        ToolLatencyRow,
    )


# ---- Plan 03-04 helper utilities ----


async def _seed_rows(app, table_name: str, rows: list[dict]) -> None:
    """Insert raw rows via SQLAlchemy core into the engine bound to the app.

    Uses the registered SQLModel metadata table so it picks up column types
    (JSON columns serialize dicts correctly).

    For `token_usage`, normalizes `day` ISO strings (from
    `make_token_usage_bucket`'s default) to `date` objects because the
    SQLite Date column type requires actual `date` instances.

    For `otel_events` and `tools`, auto-seeds missing parent `sessions` rows
    so FK enforcement (PRAGMA foreign_keys=1 from Phase 1 engine listener)
    doesn't reject the insert. The auto-seeded sessions use `started_at` set
    to `datetime.now(UTC)` minus 5 minutes so they fall inside any reasonable
    test range. Real ingestion always creates the session row before the
    event row, so this matches production semantics.
    """
    from cmc.db.base import SQLModel

    engine = app.state.engine
    table = SQLModel.metadata.tables[table_name]
    if table_name == "token_usage":
        rows = [
            {**r, "day": date.fromisoformat(r["day"]) if isinstance(r.get("day"), str) else r.get("day")}
            for r in rows
        ]

    # Auto-seed parent sessions for any FK-referenced session_id that doesn't
    # yet exist, so tests can focus on the table they care about.
    if table_name in ("otel_events", "tools"):
        sessions_table = SQLModel.metadata.tables["sessions"]
        needed_session_ids = {r.get("session_id") for r in rows if r.get("session_id")}
        if needed_session_ids:
            async with engine.begin() as conn:
                from sqlalchemy import select as sa_select
                existing = (
                    await conn.execute(
                        sa_select(sessions_table.c.session_id).where(
                            sessions_table.c.session_id.in_(needed_session_ids)
                        )
                    )
                ).scalars().all()
                missing = needed_session_ids - set(existing)
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


# ---- Plan 03-04: OBSV-01..05 (Task 1) ----


async def test_obsv_01_usage_tokens_range_filter(client) -> None:
    """OBSV-01: token_usage rows within range bucket; ordering by day DESC, tokens_input DESC."""
    app = client._transport.app  # type: ignore[attr-defined]
    today = datetime.now(timezone.utc).date().isoformat()
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).date().isoformat()
    long_ago = (datetime.now(timezone.utc) - timedelta(days=10)).date().isoformat()
    rows = [
        make_token_usage_bucket(day=today, model="claude-opus-4-7", tokens_input=500),
        make_token_usage_bucket(day=yesterday, model="claude-opus-4-7", tokens_input=1000),
        make_token_usage_bucket(day=long_ago, model="claude-opus-4-7", tokens_input=9999),
    ]
    await _seed_rows(app, "token_usage", rows)

    r = await client.get("/api/usage/tokens", params={"range": "7d"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["range"] == "7d"
    items = body["items"]
    assert len(items) == 2  # today + yesterday only (long_ago excluded)
    # ordering: yesterday (tokens=1000) first since day DESC then tokens_input DESC.
    # yesterday < today by day, so today comes first by day DESC.
    days = [it["day"] for it in items]
    assert days == [today, yesterday]
    for it in items:
        for f in (
            "day",
            "model",
            "source",
            "tokens_input",
            "tokens_output",
            "tokens_cache_read",
            "tokens_cache_create",
            "sessions_count",
        ):
            assert f in it


async def test_obsv_02_usage_cache_low_sample(client) -> None:
    """OBSV-02: hit_rate float in [0,1]; low_sample True when total billable < 10000."""
    app = client._transport.app  # type: ignore[attr-defined]
    today = datetime.now(timezone.utc).date().isoformat()
    # 200 cache_read / (1000 input + 200 cache_read + 100 cache_create) = 200/1300 ~= 0.1538
    rows = [
        make_token_usage_bucket(
            day=today,
            tokens_input=1000,
            tokens_output=500,
            tokens_cache_read=200,
            tokens_cache_create=100,
        ),
    ]
    await _seed_rows(app, "token_usage", rows)

    r = await client.get("/api/usage/cache", params={"range": "7d"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert 0.0 <= body["hit_rate"] <= 1.0
    assert abs(body["hit_rate"] - 200 / 1300) < 0.001
    assert body["low_sample"] is True  # 1300 < 10000
    assert len(body["trend"]) == 1
    day_row = body["trend"][0]
    assert day_row["billable_tokens"] == 1300
    assert day_row["low_sample"] is True


async def test_obsv_03_outcomes_priority_buckets(client) -> None:
    """OBSV-03: read-time outcome priority — errored > rate_limited > truncated > unfinished > ok.

    Five distinct sessions, each landing in exactly one bucket.
    """
    app = client._transport.app  # type: ignore[attr-defined]
    base = datetime.now(timezone.utc) - timedelta(hours=1)
    sessions = [
        make_session_row(session_id="sess-err", started_at=base, ended_at=base),
        make_session_row(session_id="sess-rate", started_at=base, ended_at=base),
        make_session_row(session_id="sess-trunc", started_at=base, ended_at=base),
        make_session_row(session_id="sess-unfin", started_at=base, ended_at=None),
        make_session_row(session_id="sess-ok", started_at=base, ended_at=base),
    ]
    await _seed_rows(app, "sessions", sessions)
    events = [
        make_otel_event(
            ts=base, event_name="claude_code.api_error", session_id="sess-err"
        ),
        make_otel_event(
            ts=base, event_name="claude_code.api_retries_exhausted", session_id="sess-rate"
        ),
        make_otel_event(
            ts=base, event_name="claude_code.compaction", session_id="sess-trunc"
        ),
    ]
    await _seed_rows(app, "otel_events", events)

    r = await client.get("/api/sessions/outcomes", params={"range": "30d"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["range"] == "30d"
    # Sum across all days: each bucket should have exactly 1.
    totals = {"errored": 0, "rate_limited": 0, "truncated": 0, "unfinished": 0, "ok": 0}
    total_sessions = 0
    for it in body["items"]:
        for k in totals:
            totals[k] += it[k]
        total_sessions += it["total"]
    assert totals == {"errored": 1, "rate_limited": 1, "truncated": 1, "unfinished": 1, "ok": 1}
    assert total_sessions == 5


async def test_obsv_04_tool_latency_happy(client) -> None:
    """OBSV-04 happy path: 10 calls 100..1000ms; p50 ~= 500, p95 ~= 1000."""
    app = client._transport.app  # type: ignore[attr-defined]
    base = datetime.now(timezone.utc) - timedelta(hours=1)
    sess_row = make_session_row(session_id="sess-bash", started_at=base)
    await _seed_rows(app, "sessions", [sess_row])
    rows = [
        make_tool_call(
            tool_use_id=f"tu-{i}",
            session_id="sess-bash",
            tool_name="Bash",
            started_at=base + timedelta(seconds=i),
            ended_at=base + timedelta(seconds=i, milliseconds=i * 100 + 100),
            duration_ms=(i + 1) * 100,
            status="ok",
        )
        for i in range(10)
    ]
    await _seed_rows(app, "tools", rows)

    r = await client.get("/api/tools/latency", params={"range": "30d"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["items"]) == 1
    bash = body["items"][0]
    assert bash["tool_name"] == "Bash"
    assert bash["call_count"] == 10
    # Pattern 4 offset: p50 = sorted[max(int(10*0.5)-1, 0)] = sorted[4] = 500
    # p95 = sorted[max(int(10*0.95)-1, 0)] = sorted[8] = 900
    assert bash["p50_ms"] == 500
    assert bash["p95_ms"] == 900
    assert bash["max_ms"] == 1000
    assert bash["error_rate"] == 0.0


async def test_obsv_04_tool_latency_pitfall_2_n_equals_1(client) -> None:
    """OBSV-04 Pitfall 2: N=1 must NOT raise OFFSET=-1 error.

    With 1 row: int(1*0.5)-1 = -1; MAX(...,0) wrapper makes it 0; offset 0 returns sole row.
    p50 == p95 == max == that single duration.
    """
    app = client._transport.app  # type: ignore[attr-defined]
    base = datetime.now(timezone.utc) - timedelta(hours=1)
    await _seed_rows(app, "sessions", [make_session_row(session_id="sess-1", started_at=base)])
    await _seed_rows(
        app,
        "tools",
        [
            make_tool_call(
                tool_use_id="tu-1",
                session_id="sess-1",
                tool_name="Read",
                started_at=base,
                ended_at=base,
                duration_ms=42,
                status="ok",
            ),
        ],
    )
    r = await client.get("/api/tools/latency", params={"range": "30d"})
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert len(items) == 1
    row = items[0]
    assert row["p50_ms"] == 42
    assert row["p95_ms"] == 42
    assert row["max_ms"] == 42
    assert row["call_count"] == 1


async def test_obsv_04_tool_latency_n_zero_excluded(client) -> None:
    """OBSV-04: 0 tool rows -> empty items, no SQL errors."""
    r = await client.get("/api/tools/latency", params={"range": "30d"})
    assert r.status_code == 200, r.text
    assert r.json()["items"] == []
    assert r.json()["range"] == "30d"


async def test_obsv_05_hook_fires_no_pairing(client) -> None:
    """OBSV-05: 3 unpaired pre-events + 1 unrelated event.

    Result: 1 item (pre_tool_use), fires=3, p50=None.
    """
    app = client._transport.app  # type: ignore[attr-defined]
    base = datetime.now(timezone.utc) - timedelta(hours=1)
    events = [
        make_otel_event(
            ts=base + timedelta(seconds=i),
            event_name="claude_code.hook.pre_tool_use",
            session_id="sess-h",
        )
        for i in range(3)
    ]
    events.append(
        make_otel_event(
            ts=base, event_name="claude_code.api_request", session_id="sess-h"
        )
    )
    await _seed_rows(app, "otel_events", events)

    r = await client.get("/api/hooks/activity", params={"range": "30d"})
    assert r.status_code == 200, r.text
    body = r.json()
    items = body["items"]
    assert len(items) == 1
    item = items[0]
    assert item["hook_name"] == "claude_code.hook.pre_tool_use"
    assert item["fires"] == 3
    assert item["paired_duration_ms_p50"] is None
    assert body["total_fires"] == 3


async def test_obsv_05_hook_paired_duration_p50_with_orphan(client) -> None:
    """OBSV-05: 2 paired pre/post + 1 orphan pre.

    Pairs: 100ms, 300ms. Pattern 4 p50 = sorted[max(int(2*0.5)-1, 0)] = sorted[0] = 100.
    fires count includes orphan (3 pre events).
    """
    app = client._transport.app  # type: ignore[attr-defined]
    now = datetime.now(timezone.utc) - timedelta(hours=1)
    events = [
        make_otel_event(
            ts=now - timedelta(seconds=10),
            event_name="claude_code.hook.pre_tool_use",
            session_id="sess-pair",
        ),
        make_otel_event(
            ts=now - timedelta(seconds=10) + timedelta(milliseconds=100),
            event_name="claude_code.hook.post_tool_use",
            session_id="sess-pair",
        ),
        make_otel_event(
            ts=now - timedelta(seconds=8),
            event_name="claude_code.hook.pre_tool_use",
            session_id="sess-pair",
        ),
        make_otel_event(
            ts=now - timedelta(seconds=8) + timedelta(milliseconds=300),
            event_name="claude_code.hook.post_tool_use",
            session_id="sess-pair",
        ),
        make_otel_event(
            ts=now - timedelta(seconds=1),
            event_name="claude_code.hook.pre_tool_use",
            session_id="sess-pair",
        ),
    ]
    await _seed_rows(app, "otel_events", events)

    r = await client.get("/api/hooks/activity", params={"range": "30d"})
    assert r.status_code == 200, r.text
    body = r.json()
    pre_rows = [it for it in body["items"] if it["hook_name"] == "claude_code.hook.pre_tool_use"]
    assert len(pre_rows) >= 1
    total_fires = sum(it["fires"] for it in pre_rows)
    assert total_fires == 3
    # Find the row that has paired_duration_ms_p50; should be 100 (sorted[0]).
    p50_values = [
        it["paired_duration_ms_p50"]
        for it in pre_rows
        if it["paired_duration_ms_p50"] is not None
    ]
    assert p50_values == [100]


async def test_obsv_05_hook_60s_cap(client) -> None:
    """OBSV-05: pair longer than 60_000ms is capped to 60_000ms."""
    app = client._transport.app  # type: ignore[attr-defined]
    now = datetime.now(timezone.utc) - timedelta(hours=1)
    events = [
        make_otel_event(
            ts=now,
            event_name="claude_code.hook.pre_compact",
            session_id="sess-cap",
        ),
        make_otel_event(
            ts=now + timedelta(seconds=120),
            event_name="claude_code.hook.post_compact",
            session_id="sess-cap",
        ),
    ]
    await _seed_rows(app, "otel_events", events)

    r = await client.get("/api/hooks/activity", params={"range": "30d"})
    assert r.status_code == 200, r.text
    body = r.json()
    pre_rows = [
        it for it in body["items"] if it["hook_name"] == "claude_code.hook.pre_compact"
    ]
    assert len(pre_rows) == 1
    assert pre_rows[0]["paired_duration_ms_p50"] == 60_000


async def test_obsv_05_hook_cross_session_no_pairing(client) -> None:
    """OBSV-05: pre in session A and post in session B do NOT pair (FIFO is per-session)."""
    app = client._transport.app  # type: ignore[attr-defined]
    now = datetime.now(timezone.utc) - timedelta(hours=1)
    events = [
        make_otel_event(
            ts=now,
            event_name="claude_code.hook.pre_tool_use",
            session_id="sess-A",
        ),
        make_otel_event(
            ts=now + timedelta(seconds=1),
            event_name="claude_code.hook.post_tool_use",
            session_id="sess-B",
        ),
    ]
    await _seed_rows(app, "otel_events", events)

    r = await client.get("/api/hooks/activity", params={"range": "30d"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total_fires"] == 2
    for it in body["items"]:
        assert it["paired_duration_ms_p50"] is None
