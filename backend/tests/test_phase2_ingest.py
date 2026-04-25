"""Phase 2 — Data Ingestion test suite.

Single test file per phase (Phase 1 convention). Each plan in Phase 2 appends
its INGST-* tests below the marker for that plan.

Sections:
  Plan 02-01 (this file's seed): settings sanity.
  Plan 02-02 (JSONL parser):       INGST-02, INGST-03, INGST-06 tests appended.
  Plan 02-03 (OTLP router):        INGST-07, INGST-08, INGST-09 tests appended.
  Plan 02-04 (scheduler/repo):     INGST-04, INGST-05 tests appended.
  Plan 02-05 (lifespan/manual):    INGST-01, INGST-10 tests appended.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path


# ---- Plan 02-01: settings sanity ----

def test_phase2_settings_fields_present(test_settings):
    """Plan 02-01: confirm the three new settings fields exist with expected defaults.

    Downstream plans rely on these defaults; if a future change drops them,
    this test catches it before the dependent code breaks.
    """
    assert test_settings.session_idle_minutes == 5
    assert test_settings.otlp_max_body_bytes == 10_000_000
    # jsonl_root is a Path; default contains ".claude/projects"
    assert ".claude/projects" in str(test_settings.jsonl_root)


# ---- Plan 02-02: JSONL parser (INGST-02, INGST-03, INGST-06) ----


def test_jsonl_parser_token_usage_extraction(golden_jsonl_session):
    """INGST-02: tokens summed across every assistant message.usage block.

    The fixture has two assistant turns:
      - turn 1: input=10, output=20, cache_read=100, cache_create=50
      - turn 2: input=5,  output=8,  cache_read=0,   cache_create=0
    Expected: 15 / 28 / 100 / 50.
    Message count counts only the 4 valid user+assistant lines (corrupted line skipped).
    Model is the most recent (or first) model name on assistant turns.
    """
    from cmc.ingest.jsonl_parser import parse_session_file

    result = parse_session_file(golden_jsonl_session)
    sess = result["session"]
    assert sess["tokens_input"] == 15
    assert sess["tokens_output"] == 28
    assert sess["tokens_cache_read"] == 100
    assert sess["tokens_cache_create"] == 50
    assert sess["message_count"] == 4
    assert sess["model"] == "claude-opus-4-7"


def test_jsonl_parser_tool_pairing_paired(golden_jsonl_session):
    """INGST-03: tool_use + tool_result pair on tool_use_id; status='ok' when not is_error.

    Fixture: tu_paired (Bash) at t+1s, tool_result at t+3s -> duration_ms == 2000.
    Non-MCP name -> mcp_server_name and mcp_tool_name both None.
    """
    from cmc.ingest.jsonl_parser import parse_session_file

    result = parse_session_file(golden_jsonl_session)
    paired = next(tc for tc in result["tool_calls"] if tc["tool_use_id"] == "tu_paired")
    assert paired["tool_name"] == "Bash"
    assert paired["status"] == "ok"
    assert paired["duration_ms"] == 2000
    assert paired["mcp_server_name"] is None
    assert paired["mcp_tool_name"] is None
    assert paired["ended_at"] is not None


def test_jsonl_parser_unpaired_tool_use_pending(golden_jsonl_session):
    """INGST-03: tool_use without matching tool_result -> status='pending'.

    Fixture: tu_pending (mcp__notebooklm-mcp__notebook_get) at t+5s, no result.
    Expect status='pending', ended_at=None, duration_ms=None.
    Also exercises the MCP split fallback (test_jsonl_parser_mcp_split below
    asserts it directly): server='notebooklm-mcp', tool='notebook_get'.
    """
    from cmc.ingest.jsonl_parser import parse_session_file

    result = parse_session_file(golden_jsonl_session)
    pending = next(tc for tc in result["tool_calls"] if tc["tool_use_id"] == "tu_pending")
    assert pending["tool_name"] == "mcp__notebooklm-mcp__notebook_get"
    assert pending["status"] == "pending"
    assert pending["ended_at"] is None
    assert pending["duration_ms"] is None
    # MCP attributes populated for downstream INGST-08 fallback
    assert pending["mcp_server_name"] == "notebooklm-mcp"
    assert pending["mcp_tool_name"] == "notebook_get"


def test_jsonl_parser_mcp_split():
    """INGST-08 fallback path: split_mcp behaviour.

    Direct unit on the helper to lock its semantics independently of the
    parser pipeline. maxsplit=2 means the third component preserves any
    trailing `__` separators.
    """
    from cmc.ingest.jsonl_parser import split_mcp

    assert split_mcp("Bash") == (None, None)
    assert split_mcp("mcp__myserver__do_thing") == ("myserver", "do_thing")
    assert split_mcp("mcp__weird") == (None, None)  # only one separator
    assert split_mcp("mcp__has__under__scores") == ("has", "under__scores")
    assert split_mcp(None) == (None, None)
    assert split_mcp("") == (None, None)


def test_jsonl_parser_duration_capped_at_ten_minutes(tmp_path):
    """INGST-03: duration_ms is clamped at 600_000 (10 min) even if the
    tool_result arrives 30 min after the tool_use.

    This protects downstream charts from outlier-skewed scales when a tool
    runs unattended (sleep, long compile) — research §3 calls this out.
    """
    from cmc.ingest.jsonl_parser import parse_session_file

    sid = "cap-test-session"
    base = datetime(2026, 4, 25, 12, 0, 0, tzinfo=timezone.utc)

    def iso(t: datetime) -> str:
        return t.isoformat().replace("+00:00", "Z")

    lines = [
        json.dumps({
            "type": "assistant", "uuid": "a1", "sessionId": sid,
            "timestamp": iso(base),
            "message": {
                "role": "assistant", "model": "claude-opus-4-7",
                "usage": {"input_tokens": 1, "output_tokens": 1},
                "content": [
                    {"type": "tool_use", "id": "tu_long", "name": "Bash",
                     "input": {"command": "sleep 1800"}},
                ],
            },
        }),
        json.dumps({
            "type": "user", "uuid": "u1", "sessionId": sid,
            # 30 minutes later -> raw delta 1_800_000 ms; expected clamp to 600_000
            "timestamp": iso(base + timedelta(minutes=30)),
            "message": {
                "role": "user",
                "content": [
                    {"type": "tool_result", "tool_use_id": "tu_long",
                     "is_error": False, "content": "done"},
                ],
            },
        }),
    ]
    f = tmp_path / "cap.jsonl"
    f.write_text("\n".join(lines) + "\n")

    result = parse_session_file(f)
    assert result["tool_calls"][0]["tool_use_id"] == "tu_long"
    assert result["tool_calls"][0]["duration_ms"] == 600_000


def test_jsonl_parser_corrupted_line_skipped(golden_jsonl_session, tmp_path):
    """INGST-06: a corrupted line in the MIDDLE must NOT crash the parser, AND
    the parser must continue past it so subsequent valid lines are still parsed.

    Two assertions:
      1. Using golden_jsonl_session (which contains '{"type": "assist' mid-file),
         tokens_output >= 28 — the +8 from the post-corruption assistant message
         was included, proving parsing continued.
      2. Direct unit on iter_jsonl: 3-line file (valid / corrupt / valid) yields
         exactly 2 dicts (the valid lines), no exception raised.
    """
    from cmc.ingest.jsonl_parser import iter_jsonl, parse_session_file

    # 1. Whole-file integration: corruption did not lose the trailing message.
    result = parse_session_file(golden_jsonl_session)
    assert result["session"]["tokens_output"] >= 28

    # 2. Unit: iter_jsonl skips the corrupted line and yields the surrounding ones.
    f = tmp_path / "mixed.jsonl"
    f.write_text(
        '{"a": 1}\n'
        '{"type": "assist\n'   # truncated, missing closing quote and brace
        '{"b": 2}\n'
    )
    parsed = list(iter_jsonl(f))
    assert len(parsed) == 2
    assert parsed[0] == {"a": 1}
    assert parsed[1] == {"b": 2}


# ---- Plan 02-03: OTLP /v1/logs + /v1/metrics (INGST-07, INGST-08, INGST-09) ----

import pytest
from sqlalchemy import select


@pytest.mark.asyncio
async def test_otlp_logs_persists_records_and_returns_200(test_settings_with_static, otlp_log_payload):
    """INGST-07 happy path: 2 log records => 200 + 2 rows in otel_events."""
    from httpx import ASGITransport, AsyncClient
    from cmc.app import create_app
    from cmc.db.models.otel_events import OtelEvent

    app = create_app(settings=test_settings_with_static)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        async with app.router.lifespan_context(app):
            resp = await client.post("/v1/logs", json=otlp_log_payload)
            assert resp.status_code == 200
            assert resp.json() == {}
            async with app.state.sessions() as s:
                rows = (await s.execute(select(OtelEvent))).scalars().all()
                assert len(rows) == 2
                assert all(r.event_name == "claude_code.tool_result" for r in rows)
                # ts parsed from timeUnixNano (not None)
                assert all(r.ts is not None for r in rows)


@pytest.mark.asyncio
async def test_otlp_logs_returns_200_for_malformed_body(test_settings_with_static):
    """INGST-07 + Pitfall 4: malformed JSON body returns 200 (NEVER 4xx)."""
    from httpx import ASGITransport, AsyncClient
    from cmc.app import create_app
    from cmc.db.models.otel_events import OtelEvent

    app = create_app(settings=test_settings_with_static)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        async with app.router.lifespan_context(app):
            resp = await client.post(
                "/v1/logs", content=b"not json",
                headers={"Content-Type": "application/json"},
            )
            assert resp.status_code == 200
            assert resp.json() == {}
            async with app.state.sessions() as s:
                rows = (await s.execute(select(OtelEvent))).scalars().all()
                assert rows == []


@pytest.mark.asyncio
async def test_otlp_logs_per_record_skip_still_returns_200(test_settings_with_static):
    """INGST-07: a record with garbage shape is skipped; sibling record commits; resp=200."""
    from httpx import ASGITransport, AsyncClient
    from cmc.app import create_app
    from cmc.db.models.otel_events import OtelEvent

    # One bad record (not a dict) + one good record. Bad one must be skipped, good one persisted.
    payload = {
        "resourceLogs": [{
            "resource": {"attributes": []},
            "scopeLogs": [{
                "scope": {"name": "com.anthropic.claude_code.events"},
                "logRecords": [
                    "this-is-not-a-dict",   # must be skipped silently
                    {
                        "timeUnixNano": "1745601281385000000",
                        "attributes": [
                            {"key": "event.name", "value": {"stringValue": "claude_code.api_request"}},
                            {"key": "session_id", "value": {"stringValue": "sess-skip"}},
                        ],
                    },
                ],
            }],
        }],
    }

    app = create_app(settings=test_settings_with_static)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        async with app.router.lifespan_context(app):
            resp = await client.post("/v1/logs", json=payload)
            assert resp.status_code == 200
            assert resp.json() == {}
            async with app.state.sessions() as s:
                rows = (await s.execute(select(OtelEvent))).scalars().all()
                # The bad string record is skipped; the good one persists.
                assert len(rows) == 1
                assert rows[0].event_name == "claude_code.api_request"


@pytest.mark.asyncio
async def test_otlp_logs_extracts_mcp_attrs_via_tool_parameters(test_settings_with_static, otlp_log_payload):
    """INGST-08 — tool_parameters JSON path (preferred over name-split)."""
    from httpx import ASGITransport, AsyncClient
    from cmc.app import create_app
    from cmc.db.models.otel_events import OtelEvent

    app = create_app(settings=test_settings_with_static)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        async with app.router.lifespan_context(app):
            await client.post("/v1/logs", json=otlp_log_payload)
            async with app.state.sessions() as s:
                rows = (
                    await s.execute(
                        select(OtelEvent).where(OtelEvent.attrs_mcp_server.is_not(None))
                    )
                ).scalars().all()
                assert len(rows) == 1
                assert rows[0].attrs_mcp_server == "myserver"
                assert rows[0].attrs_mcp_tool == "do_thing"


@pytest.mark.asyncio
async def test_otlp_logs_mcp_fallback_split_on_tool_name(test_settings_with_static):
    """INGST-08 fallback — when tool_parameters is absent, split tool_name."""
    from httpx import ASGITransport, AsyncClient
    from cmc.app import create_app
    from cmc.db.models.otel_events import OtelEvent

    payload = {
        "resourceLogs": [{
            "resource": {"attributes": []},
            "scopeLogs": [{
                "scope": {"name": "com.anthropic.claude_code.events"},
                "logRecords": [{
                    "timeUnixNano": "1745601281385000000",
                    "attributes": [
                        {"key": "event.name", "value": {"stringValue": "claude_code.tool_result"}},
                        {"key": "session_id", "value": {"stringValue": "sess-fallback"}},
                        # tool_name is mcp__ but no tool_parameters
                        {"key": "tool_name", "value": {"stringValue": "mcp__svc__do_thing"}},
                    ],
                }],
            }],
        }],
    }

    app = create_app(settings=test_settings_with_static)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        async with app.router.lifespan_context(app):
            resp = await client.post("/v1/logs", json=payload)
            assert resp.status_code == 200
            async with app.state.sessions() as s:
                rows = (await s.execute(select(OtelEvent))).scalars().all()
                assert len(rows) == 1
                assert rows[0].attrs_mcp_server == "svc"
                assert rows[0].attrs_mcp_tool == "do_thing"


@pytest.mark.asyncio
async def test_otlp_metrics_persists_three_kinds(test_settings_with_static, otlp_metric_payload):
    """INGST-09 — sum + gauge + histogram persist with correct kind/value."""
    from httpx import ASGITransport, AsyncClient
    from cmc.app import create_app
    from cmc.db.models.otel_metrics import OtelMetric

    app = create_app(settings=test_settings_with_static)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        async with app.router.lifespan_context(app):
            resp = await client.post("/v1/metrics", json=otlp_metric_payload)
            assert resp.status_code == 200
            assert resp.json() == {}
            async with app.state.sessions() as s:
                rows = (await s.execute(select(OtelMetric))).scalars().all()
                assert len(rows) == 3
                by_name = {r.metric_name: r for r in rows}
                # sum -> kind=counter, value from asInt parsed via int->float
                assert by_name["claude_code.token.usage"].kind == "counter"
                assert by_name["claude_code.token.usage"].value == 47855.0
                assert by_name["claude_code.token.usage"].unit == "tokens"
                # gauge -> kind=gauge, asInt parsed
                assert by_name["claude_code.session.count"].kind == "gauge"
                assert by_name["claude_code.session.count"].value == 3.0
                # histogram -> kind=histogram, value is the sum
                assert by_name["tool.duration"].kind == "histogram"
                assert by_name["tool.duration"].value == 8542.3
                assert by_name["tool.duration"].unit == "ms"


@pytest.mark.asyncio
async def test_otlp_logs_body_cap_returns_413(test_settings_with_static):
    """INGST-07 body-cap: oversize Content-Length header returns 413 (the ONLY non-200)."""
    from httpx import ASGITransport, AsyncClient
    from cmc.app import create_app

    app = create_app(settings=test_settings_with_static)
    transport = ASGITransport(app=app)
    oversize = test_settings_with_static.otlp_max_body_bytes + 1
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        async with app.router.lifespan_context(app):
            resp = await client.post(
                "/v1/logs", content=b"x",
                headers={"Content-Length": str(oversize), "Content-Type": "application/json"},
            )
            assert resp.status_code == 413
