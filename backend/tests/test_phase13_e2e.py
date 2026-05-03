"""Phase 13 end-to-end trace.

Exercises the full path through Plans 01-05 in a single test:

  1. Pricing seed loaded (via lifespan auto-seed; `seed_pricing` fixture
     asserts 5 SKUs are present).
  2. Pre-create a sessions row so otel_events.session_id FK resolves.
  3. POST /v1/logs with a synthetic skill_activated body — populates
     attrs_skill_name + session_id (BUG-B fix) + otel_event_id.
  4. Re-POST same skill_activated body — UNIQUE(session_id, otel_event_id)
     plus on_conflict_do_nothing dedupes (1 row total — INGST-13).
  5. Insert token_usage row matching the model.
  6. GET /api/cost/summary?range=7d — non-zero total_usd, rates_as_of
     populated as the freeze date (2026-05-03), Decimal serialized as JSON
     string (Pydantic v2 contract).
  7. GET /api/cost/breakdown?dim=skill&range=7d — at minimum the 'data:analyze'
     skill row appears (session-scoped attribution per LOCK-9).

Maps to Phase 13 success criteria (ROADMAP):
  #1 -> test_phase13_repl_import_compute_cost
  #2 -> test_phase13_full_trace step 6 (rates loaded, total computed)
  #3 -> test_phase13_full_trace step 6 (rates_as_of populated)
  #4 -> test_phase13_full_trace steps 3-4 (skill_name extraction +
        idempotency)
  #5 -> covered by tests/test_pricing.py::test_pricing_window_self_correcting
        (Plan 01 deferred stub finalized in Plan 06 Task 1)
"""
from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal


async def test_phase13_full_trace(client, db_session, seed_pricing):
    """Single-test trace through Phase 13 deliverables.

    Exercises lifespan -> /v1/logs -> /api/cost/summary -> /api/cost/breakdown
    in one continuous path so a regression in any prior plan surfaces here.
    """
    from sqlalchemy import select

    # --- Step 0: pricing rates seeded by lifespan (5 SKUs) — `seed_pricing`
    # fixture already asserted this; the fixture returns the row count.
    assert seed_pricing == 5

    # --- Step 1: pre-create a session row so the otel_events soft-FK on
    # session_id resolves (otherwise the ingest router's FK-retry path
    # nulls session_id and BUG-B verification below would falsely succeed).
    from cmc.db.models.sessions import Session

    db_session.add(Session(
        session_id="sess-e2e",
        started_at=datetime.now(UTC).replace(tzinfo=None),
        synced_at=datetime.now(UTC).replace(tzinfo=None),
        jsonl_mtime=datetime.now(UTC).replace(tzinfo=None),
        jsonl_path="/tmp/sess-e2e.jsonl",
        model="claude-opus-4-7",
        source="claude-code",
    ))
    await db_session.commit()

    # --- Step 2 & 3: POST a skill_activated body to /v1/logs.
    body = {
        "resourceLogs": [{
            "resource": {"attributes": []},
            "scopeLogs": [{
                "scope": {"name": "com.anthropic.claude_code.events"},
                "logRecords": [{
                    "timeUnixNano": str(
                        int(datetime.now(UTC).timestamp() * 1_000_000_000)
                    ),
                    "attributes": [
                        {"key": "event.name",
                         "value": {"stringValue": "skill_activated"}},
                        # Dotted form — BUG-B (LOCK-5): Claude Code 2.1.116
                        # emits `session.id` not `session_id`.
                        {"key": "session.id",
                         "value": {"stringValue": "sess-e2e"}},
                        {"key": "skill_name",
                         "value": {"stringValue": "data:analyze"}},
                        {"key": "event.sequence",
                         "value": {"intValue": 1}},
                    ],
                }],
            }],
        }],
    }
    r1 = await client.post("/v1/logs", json=body)
    assert r1.status_code == 200, r1.text

    # --- Step 4: idempotent re-post — UNIQUE(session_id, otel_event_id)
    # plus on_conflict_do_nothing absorbs the duplicate (INGST-13).
    r2 = await client.post("/v1/logs", json=body)
    assert r2.status_code == 200

    # Re-fetch via a fresh session — the test-side db_session caches the
    # ORM identity map, but the ingest router commits via its own session.
    app = client._transport.app  # type: ignore[attr-defined]
    from cmc.db.models.otel_events import OtelEvent
    async with app.state.sessions() as fresh:
        otel_rows = (
            await fresh.execute(
                select(OtelEvent).where(OtelEvent.attrs_skill_name == "data:analyze")
            )
        ).scalars().all()
    assert len(otel_rows) == 1, (
        f"INGST-13 dedup broken: {len(otel_rows)} rows after duplicate POST"
    )
    assert otel_rows[0].session_id == "sess-e2e", (
        "BUG-B regression: session.id (dotted) did not populate session_id column"
    )
    assert otel_rows[0].otel_event_id == 1
    assert otel_rows[0].event_name == "skill_activated"

    # --- Step 5: token_usage row to drive cost > 0.
    # 2M input @ $5/Mtok = $10; 1M output @ $25/Mtok = $25; total $35.
    from cmc.db.models.token_usage import TokenUsage
    db_session.add(TokenUsage(
        day=date.today(),
        model="claude-opus-4-7",
        source="claude-code",
        tokens_input=2_000_000,
        tokens_output=1_000_000,
        tokens_cache_read=0,
        tokens_cache_create=0,
        tokens_cache_create_5m=0,
        tokens_cache_create_1h=0,
        sessions_count=1,
    ))
    await db_session.commit()

    # --- Step 6: GET /api/cost/summary?range=7d
    r = await client.get("/api/cost/summary?range=7d")
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload["range"] == "7d"
    assert payload["rates_as_of"] == "2026-05-03", (
        f"rates_as_of regression: expected 2026-05-03 (pricing.json freeze), "
        f"got {payload['rates_as_of']!r}"
    )
    # 2M @ $5/Mtok + 1M @ $25/Mtok = $10 + $25 = $35 (no float drift)
    assert Decimal(payload["total_usd"]) == Decimal("35"), (
        f"compute_cost regression: expected $35, got {payload['total_usd']}"
    )
    # Pydantic v2 string serialization (anti-pattern guard: never float).
    assert isinstance(payload["total_usd"], str)

    # --- Step 7: /api/cost/breakdown?dim=skill — must contain data:analyze
    rb = await client.get("/api/cost/breakdown?dim=skill&range=7d")
    assert rb.status_code == 200, rb.text
    bp = rb.json()
    keys = {row["key"] for row in bp["rows"]}
    assert "data:analyze" in keys, (
        f"skill breakdown missing data:analyze: keys={keys}"
    )


def test_phase13_repl_import_compute_cost():
    """Roadmap success criterion #1: importable from REPL without app boot.

    No fixtures, no async, no DB — just pure-stdlib Decimal math.
    """
    from cmc.pricing import _rates_dict_to_decimal, compute_cost

    rates = {"claude-opus-4-7": _rates_dict_to_decimal({
        "input": "5",
        "output": "25",
        "cache_read": "0.50",
        "cache_create_5m": "6.25",
        "cache_create_1h": "10",
    })}
    cost = compute_cost("claude-opus-4-7", 1_000_000, 0, 0, 0, 0, rates)
    assert cost == Decimal("5"), f"REPL compute_cost drift: got {cost}"
