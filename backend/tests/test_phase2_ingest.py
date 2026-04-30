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

import json
from datetime import UTC, datetime, timedelta

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
    base = datetime(2026, 4, 25, 12, 0, 0, tzinfo=UTC)

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
async def test_otlp_logs_persists_records_and_returns_200(
    test_settings_with_static,
    otlp_log_payload,
):
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
                            {
                                "key": "event.name",
                                "value": {"stringValue": "claude_code.api_request"},
                            },
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
async def test_otlp_logs_extracts_mcp_attrs_via_tool_parameters(
    test_settings_with_static,
    otlp_log_payload,
):
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


# ---- Plan 02-03 raw_routers wiring ----


def test_raw_routers_function_exposed():
    """Plan 02-03: cmc.api.routes.raw_routers() returns ≥1 router (the ingest router)."""
    from cmc.api.routes import raw_routers
    routers = raw_routers()
    assert len(routers) >= 1


def test_raw_routers_registers_otlp_paths_at_root(test_settings):
    """Plan 02-03: /v1/logs and /v1/metrics are registered at root (no /api prefix)."""
    from cmc.app import create_app
    app = create_app(settings=test_settings)
    paths = {getattr(r, "path", None) for r in app.routes}
    assert "/v1/logs" in paths
    assert "/v1/metrics" in paths
    # MUST NOT be under /api/
    assert "/api/v1/logs" not in paths
    assert "/api/v1/metrics" not in paths


@pytest.mark.asyncio
async def test_otlp_get_returns_405_proves_router_mounted(test_settings, tmp_path):
    """Plan 02-03: GET /v1/logs returns 405 (POST-only) — proves the router is
    actually mounted (NOT 404, which would mean unregistered).

    Disables the SPA mount via a non-existent static_dir, because when the SPA
    mount IS active a GET to /v1/logs falls through the POST-only handler and
    is served by the SPA's index.html fallback (200) — expected behavior in
    production, but it masks the 405 we want to assert here.
    """
    from httpx import ASGITransport, AsyncClient

    from cmc.app import create_app

    settings = test_settings.model_copy(update={"static_dir": tmp_path / "no-spa"})
    app = create_app(settings=settings)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        async with app.router.lifespan_context(app):
            resp = await client.get("/v1/logs")
            assert resp.status_code == 405, (
                f"Expected 405 (Method Not Allowed) proving /v1/logs is mounted; "
                f"got {resp.status_code} — would be 404 if router isn't registered."
            )


# ---- Plan 02-04: repository (INGST-04 idempotence + INGST-05 Option B) ----

from datetime import date


async def _bootstrap_app(test_settings):
    """Helper: build a FastAPI app with lifespan-initialized engine + sessionmaker.

    Returns (app, lifespan_cm) — caller wraps `async with lifespan_cm:` to start.

    Plan 02-05: the lifespan now runs a boot-time sync_once over `jsonl_root`.
    To keep callers hermetic (they don't want their tests reading the real
    `~/.claude/projects/`), this helper ALWAYS overrides jsonl_root to a
    nonexistent path — sync_once will hit its "missing dir" early-return path
    and the test starts with an empty DB. Tests that need real ingestion
    should override jsonl_root explicitly via the dedicated fixtures
    (e.g. settings_with_jsonl_root).
    """
    from fastapi import FastAPI

    from cmc.app.lifespan import lifespan

    # Only override if the caller hasn't already pointed jsonl_root at a
    # test-scoped path. Detect the default (`~/.claude/projects`) and replace
    # it with a tmp-path-scoped nonexistent dir so sync_once early-returns.
    if str(test_settings.jsonl_root).endswith(".claude/projects"):
        test_settings = test_settings.model_copy(update={
            "jsonl_root": test_settings.db_path.parent / "no-jsonl-here",
        })

    app = FastAPI()
    app.state.settings = test_settings
    return app, lifespan(app)


@pytest.mark.asyncio
async def test_upsert_session_idempotent(test_settings):
    """INGST-04: upsert with same session_id updates in-place; no duplicates.

    First call inserts; second call with new totals updates the SAME row. Final
    state: 1 row with the second call's totals (no inflation, no duplicates).
    """
    from cmc.db.models.sessions import Session as SessionModel
    from cmc.ingest.repository import upsert_session

    app, cm = await _bootstrap_app(test_settings)
    async with cm, app.state.sessions() as db:
        now = datetime.now(UTC)
        await upsert_session(
            db, session_id="s1",
            started_at=now, synced_at=now, jsonl_mtime=now,
            jsonl_path="/tmp/x.jsonl", source="claude-code",
            tokens_input=10, tokens_output=20,
            tokens_cache_read=0, tokens_cache_create=0,
            tool_call_count=0, message_count=1,
        )
        await upsert_session(
            db, session_id="s1",
            started_at=now, synced_at=now, jsonl_mtime=now,
            jsonl_path="/tmp/x.jsonl", source="claude-code",
            tokens_input=15, tokens_output=25,
            tokens_cache_read=0, tokens_cache_create=0,
            tool_call_count=1, message_count=2,
        )
        await db.commit()
        rows = (await db.execute(select(SessionModel))).scalars().all()
        assert len(rows) == 1
        assert rows[0].tokens_input == 15
        assert rows[0].tokens_output == 25
        assert rows[0].tool_call_count == 1
        assert rows[0].message_count == 2


@pytest.mark.asyncio
async def test_upsert_tools_pending_to_ok_transition(test_settings):
    """INGST-04: a tool_use that re-appears with a tool_result transitions
    pending -> ok in-place — no duplicate row keyed on tool_use_id.

    Uses a fresh AsyncSession per assertion phase so the identity-map cache
    (expire_on_commit=False) doesn't return a stale ORM instance after upsert.
    The scheduler in Plan 02-04 mirrors this pattern: each file gets its own
    sessionmaker() context, so cache freshness is naturally bounded per cycle.
    """
    from cmc.db.models.tools import ToolCall
    from cmc.ingest.repository import upsert_session, upsert_tools

    app, cm = await _bootstrap_app(test_settings)
    async with cm:
        now = datetime.now(UTC)
        # Phase 1: insert parent + pending tool
        async with app.state.sessions() as db:
            await upsert_session(
                db, session_id="sess-x",
                started_at=now, synced_at=now, jsonl_mtime=now,
                jsonl_path="/tmp/y.jsonl", source="claude-code",
                tokens_input=0, tokens_output=0,
                tokens_cache_read=0, tokens_cache_create=0,
                tool_call_count=0, message_count=0,
            )
            await upsert_tools(db, "sess-x", [{
                "tool_use_id": "t1", "tool_name": "Bash",
                "started_at": now, "ended_at": None, "duration_ms": None,
                "status": "pending",
                "mcp_server_name": None, "mcp_tool_name": None,
                "input_summary": "ls",
            }])
            await db.commit()

        # Verify pending state in a FRESH session (no identity-map cache).
        async with app.state.sessions() as db:
            rows = (await db.execute(select(ToolCall))).scalars().all()
            assert len(rows) == 1
            assert rows[0].status == "pending"
            assert rows[0].duration_ms is None

        # Phase 2: re-parse with tool_result → status='ok'.
        later = now + timedelta(seconds=5)
        async with app.state.sessions() as db:
            await upsert_tools(db, "sess-x", [{
                "tool_use_id": "t1", "tool_name": "Bash",
                "started_at": now, "ended_at": later, "duration_ms": 5000,
                "status": "ok",
                "mcp_server_name": None, "mcp_tool_name": None,
                "input_summary": "ls",
            }])
            await db.commit()

        # Verify transition in a FRESH session.
        async with app.state.sessions() as db:
            rows = (await db.execute(select(ToolCall))).scalars().all()
            assert len(rows) == 1, "no duplicate row created on transition"
            assert rows[0].status == "ok"
            assert rows[0].duration_ms == 5000
            assert rows[0].ended_at is not None


@pytest.mark.asyncio
async def test_accumulate_token_usage_creates_bucket(test_settings):
    """INGST-05 simple: accumulate_token_usage with prev_totals=None creates
    a fresh row with the new bucket totals.
    """
    from cmc.db.models.token_usage import TokenUsage
    from cmc.ingest.repository import accumulate_token_usage

    app, cm = await _bootstrap_app(test_settings)
    async with cm, app.state.sessions() as db:
        await accumulate_token_usage(
            db, session_id="sess-x",
            previous_totals=None,
            new_buckets=[{
                "day": date(2026, 4, 25), "model": "opus", "source": "claude-code",
                "tokens_input": 10, "tokens_output": 20,
                "tokens_cache_read": 100, "tokens_cache_create": 50,
            }],
            primary_day=None, primary_model=None,
        )
        await db.commit()
        rows = (await db.execute(select(TokenUsage))).scalars().all()
        assert len(rows) == 1
        assert rows[0].tokens_input == 10
        assert rows[0].tokens_output == 20
        assert rows[0].tokens_cache_read == 100
        assert rows[0].tokens_cache_create == 50
        assert rows[0].sessions_count == 1


@pytest.mark.asyncio
async def test_accumulate_token_usage_option_b_no_double_count(test_settings):
    """INGST-05 Option B: re-accumulating the same session does NOT inflate the
    bucket — the previous contribution is subtracted, then the new one is added.

    Scenario:
      - First parse: session contributes (10, 20) on day=2026-04-25 model=opus.
      - Re-parse with corrected totals (15, 25) on the same day+model.
      - Final bucket totals must equal (15, 25), NOT (25, 45).
    """
    from cmc.db.models.token_usage import TokenUsage
    from cmc.ingest.repository import accumulate_token_usage

    app, cm = await _bootstrap_app(test_settings)
    async with cm, app.state.sessions() as db:
        day = date(2026, 4, 25)
        # First parse — fresh session
        await accumulate_token_usage(
            db, session_id="sess-x",
            previous_totals=None,
            new_buckets=[{
                "day": day, "model": "opus", "source": "claude-code",
                "tokens_input": 10, "tokens_output": 20,
                "tokens_cache_read": 0, "tokens_cache_create": 0,
            }],
            primary_day=None, primary_model=None,
        )
        await db.commit()

        # Re-parse — pass previous totals so Option B subtracts them.
        await accumulate_token_usage(
            db, session_id="sess-x",
            previous_totals={
                "tokens_input": 10, "tokens_output": 20,
                "tokens_cache_read": 0, "tokens_cache_create": 0,
            },
            new_buckets=[{
                "day": day, "model": "opus", "source": "claude-code",
                "tokens_input": 15, "tokens_output": 25,
                "tokens_cache_read": 0, "tokens_cache_create": 0,
            }],
            primary_day=day, primary_model="opus",
        )
        await db.commit()

        rows = (await db.execute(select(TokenUsage))).scalars().all()
        assert len(rows) == 1
        assert rows[0].tokens_input == 15, "Option B: subtract 10 then add 15 = 15 (NOT 25)"
        assert rows[0].tokens_output == 25
        # sessions_count must NOT be incremented on re-parse
        assert rows[0].sessions_count == 1


@pytest.mark.asyncio
async def test_repository_idempotent_full_run(test_settings, golden_jsonl_session):
    """INGST-04 full idempotence: running upsert_session + upsert_tools +
    accumulate_token_usage twice with identical inputs leaves DB state identical.
    """
    from cmc.db.models.sessions import Session as SessionModel
    from cmc.db.models.token_usage import TokenUsage
    from cmc.db.models.tools import ToolCall
    from cmc.ingest.jsonl_parser import parse_session_file
    from cmc.ingest.repository import (
        accumulate_token_usage,
        upsert_session,
        upsert_tools,
    )

    parsed = parse_session_file(golden_jsonl_session)
    sess = dict(parsed["session"])
    sess.pop("_last_message_ts", None)
    sess["jsonl_path"] = str(golden_jsonl_session)
    sess["jsonl_mtime"] = datetime.now(UTC)
    sess["synced_at"] = datetime.now(UTC)
    sess["source"] = "claude-code"
    sess["ended_at"] = None

    app, cm = await _bootstrap_app(test_settings)
    async with cm, app.state.sessions() as db:
        for _ in range(2):
            await upsert_session(db, **sess)
            await upsert_tools(db, sess["session_id"], parsed["tool_calls"])
            # Pass previous_totals=None on BOTH iterations: this proves the
            # raw upsert helpers themselves are idempotent (the Option B
            # subtract path is exercised by the no_double_count test). To
            # avoid inflating sessions_count on the second iteration, we
            # delete the existing token_usage rows first as the scheduler
            # would naturally NOT call accumulate twice with prev=None for
            # the same session.
            if _ == 0:
                await accumulate_token_usage(
                    db, session_id=sess["session_id"],
                    previous_totals=None,
                    new_buckets=parsed["token_usage_buckets"],
                    primary_day=None, primary_model=None,
                )
            else:
                # Second pass: emulate the re-parse Option B path
                await accumulate_token_usage(
                    db, session_id=sess["session_id"],
                    previous_totals={
                        "tokens_input": sess["tokens_input"],
                        "tokens_output": sess["tokens_output"],
                        "tokens_cache_read": sess["tokens_cache_read"],
                        "tokens_cache_create": sess["tokens_cache_create"],
                    },
                    new_buckets=parsed["token_usage_buckets"],
                    primary_day=parsed["token_usage_buckets"][0]["day"],
                    primary_model=parsed["token_usage_buckets"][0]["model"],
                )
            await db.commit()

        sessions = (await db.execute(select(SessionModel))).scalars().all()
        assert len(sessions) == 1
        assert sessions[0].tokens_input == 15  # totals from parser
        tools = (await db.execute(select(ToolCall))).scalars().all()
        assert len(tools) == 2  # paired Bash + pending mcp
        buckets = (await db.execute(select(TokenUsage))).scalars().all()
        # Final bucket sum equals the parser totals — Option B did not inflate.
        assert sum(b.tokens_input for b in buckets) == 15
        assert sum(b.tokens_output for b in buckets) == 28


# ---- Plan 02-04: scheduler (INGST-04 + INGST-05 + INGST-06 e2e + loop hygiene) ----

import asyncio
import os
import time as _time


@pytest.fixture
def settings_with_jsonl_root(test_settings, fake_jsonl_dir):
    """Settings variant with jsonl_root pointed at the hermetic fake_jsonl_dir."""
    return test_settings.model_copy(update={"jsonl_root": fake_jsonl_dir})


@pytest.mark.asyncio
async def test_sync_once_ingests_golden_session(
    settings_with_jsonl_root, golden_jsonl_session,
):
    """INGST-04 + INGST-05 e2e: sync_once parses + upserts the golden fixture
    into all 3 tables (sessions, tools, token_usage)."""
    from cmc.db.models.sessions import Session as SessionModel
    from cmc.db.models.token_usage import TokenUsage
    from cmc.db.models.tools import ToolCall
    from cmc.ingest.scheduler import sync_once

    app, cm = await _bootstrap_app(settings_with_jsonl_root)
    async with cm:
        summary = await sync_once(app.state.sessions, app.state.settings)
        assert summary["files_seen"] == 1
        assert summary["files_updated"] == 1
        assert summary["errors"] == 0
        async with app.state.sessions() as db:
            sessions = (await db.execute(select(SessionModel))).scalars().all()
            assert len(sessions) == 1
            assert sessions[0].tokens_input == 15
            tools = (await db.execute(select(ToolCall))).scalars().all()
            assert len(tools) == 2
            statuses = {t.status for t in tools}
            assert statuses == {"ok", "pending"}
            buckets = (await db.execute(select(TokenUsage))).scalars().all()
            assert sum(b.tokens_input for b in buckets) == 15


@pytest.mark.asyncio
async def test_sync_once_excludes_subagents(settings_with_jsonl_root, golden_jsonl_session):
    """Glob is `*/*.jsonl` (one level) — must NOT scoop up subagent JSONL files
    nested deeper. (Pitfall 5 in research §1.)
    """
    from cmc.db.models.sessions import Session as SessionModel
    from cmc.ingest.scheduler import sync_once

    # Place a subagent JSONL two levels deeper than the parent session.
    proj = golden_jsonl_session.parent  # fake_jsonl_dir/-Users-test-project/
    sub = proj / "subagents"
    sub.mkdir()
    decoy = sub / "agent-1.jsonl"
    decoy.write_text(
        '{"type": "user", "uuid": "u1", "sessionId": "DECOY-DO-NOT-INGEST",'
        ' "timestamp": "2026-04-25T17:00:00Z",'
        ' "message": {"role": "user", "content": "decoy"}}\n'
    )

    app, cm = await _bootstrap_app(settings_with_jsonl_root)
    async with cm:
        summary = await sync_once(app.state.sessions, app.state.settings)
        # Only the parent session got ingested (one level).
        assert summary["files_seen"] == 1
        async with app.state.sessions() as db:
            rows = (await db.execute(select(SessionModel))).scalars().all()
            assert len(rows) == 1
            assert rows[0].session_id != "DECOY-DO-NOT-INGEST"


@pytest.mark.asyncio
async def test_sync_once_ended_at_heuristic_stale_file(
    settings_with_jsonl_root, golden_jsonl_session,
):
    """ended_at decision: file with mtime older than session_idle_minutes →
    ended_at set from parser._last_message_ts. Fresh file → ended_at None.
    """
    from cmc.db.models.sessions import Session as SessionModel
    from cmc.ingest.scheduler import sync_once

    # Make the file STALE: mtime far in the past (well beyond 5 min idle).
    stale_epoch = (datetime.now() - timedelta(hours=2)).timestamp()
    os.utime(golden_jsonl_session, (stale_epoch, stale_epoch))

    app, cm = await _bootstrap_app(settings_with_jsonl_root)
    async with cm:
        await sync_once(app.state.sessions, app.state.settings)
        async with app.state.sessions() as db:
            rows = (await db.execute(select(SessionModel))).scalars().all()
            assert len(rows) == 1
            assert rows[0].ended_at is not None, "stale file → ended_at should be set"


@pytest.mark.asyncio
async def test_sync_once_ended_at_heuristic_fresh_file(
    settings_with_jsonl_root, golden_jsonl_session,
):
    """Fresh-mtime file → ended_at left None ('still live' session)."""
    from cmc.db.models.sessions import Session as SessionModel
    from cmc.ingest.scheduler import sync_once

    # Make the file FRESH: mtime = now.
    now_epoch = datetime.now().timestamp()
    os.utime(golden_jsonl_session, (now_epoch, now_epoch))

    app, cm = await _bootstrap_app(settings_with_jsonl_root)
    async with cm:
        await sync_once(app.state.sessions, app.state.settings)
        async with app.state.sessions() as db:
            rows = (await db.execute(select(SessionModel))).scalars().all()
            assert len(rows) == 1
            assert rows[0].ended_at is None, "fresh file → ended_at None"


@pytest.mark.skipif(not hasattr(_time, "tzset"), reason="tzset not available")
@pytest.mark.asyncio
async def test_sync_once_local_day_bucket_uses_system_tz(
    monkeypatch, settings_with_jsonl_root, fake_jsonl_dir,
):
    """INGST-05 + research §6: 04:00 UTC = previous day in Pacific → bucket
    `day` must be the LOCAL date (2026-04-24), not the UTC date (2026-04-25).
    """
    from cmc.db.models.token_usage import TokenUsage
    from cmc.ingest.scheduler import sync_once

    monkeypatch.setenv("TZ", "America/Los_Angeles")
    _time.tzset()
    try:
        # Plan 02-05: lifespan now runs boot-time sync_once. Build the test
        # file INSIDE the lifespan context (after boot sync ran on the empty
        # dir) so the explicit sync_once below is the FIRST sync that sees it.
        # Otherwise, boot sync would ingest it first and the explicit call
        # would re-process it under Option B with different primary_day/model
        # (depending on synced_at), causing bucket double-write.
        app, cm = await _bootstrap_app(settings_with_jsonl_root)
        async with cm:
            # Build a one-message session whose only assistant timestamp is
            # 2026-04-25T04:00:00Z = 2026-04-24 21:00 PDT.
            proj = fake_jsonl_dir / "tz-test"
            proj.mkdir()
            f = proj / "session-tz.jsonl"
            f.write_text(json.dumps({
                "type": "assistant", "uuid": "a1", "sessionId": "sess-tz",
                "timestamp": "2026-04-25T04:00:00Z", "cwd": "/x",
                "message": {
                    "role": "assistant", "model": "claude-opus-4-7",
                    "usage": {"input_tokens": 7, "output_tokens": 11},
                    "content": [{"type": "text", "text": "ok"}],
                },
            }) + "\n")
            await sync_once(app.state.sessions, app.state.settings)
            async with app.state.sessions() as db:
                rows = (await db.execute(select(TokenUsage))).scalars().all()
                assert len(rows) == 1
                # In Pacific, 04:00 UTC the next day is 21:00 the previous day.
                assert rows[0].day == date(2026, 4, 24), (
                    f"local-day bucketing failed: got {rows[0].day} (UTC date "
                    f"would be 2026-04-25; expected 2026-04-24 PDT)"
                )
                assert rows[0].tokens_input == 7
    finally:
        # Restore TZ for subsequent tests.
        monkeypatch.delenv("TZ", raising=False)
        _time.tzset()


@pytest.mark.asyncio
async def test_sync_once_corrupted_line_does_not_crash(
    settings_with_jsonl_root, golden_jsonl_session,
):
    """INGST-06 e2e: golden_jsonl_session contains a corrupted mid-file line.
    sync_once MUST not raise; valid messages MUST still be ingested.
    """
    from cmc.db.models.sessions import Session as SessionModel
    from cmc.ingest.scheduler import sync_once

    app, cm = await _bootstrap_app(settings_with_jsonl_root)
    async with cm:
        # No exception: corruption is logged at WARNING in iter_jsonl.
        summary = await sync_once(app.state.sessions, app.state.settings)
        assert summary["errors"] == 0
        async with app.state.sessions() as db:
            rows = (await db.execute(select(SessionModel))).scalars().all()
            assert len(rows) == 1
            # Valid messages either side of the corruption were parsed.
            assert rows[0].tokens_output >= 28


@pytest.mark.asyncio
async def test_periodic_sync_loop_runs_multiple_cycles(monkeypatch):
    """Loop scheduling: with interval_s=0.05, expect ≥3 sync_once calls in 0.18s.
    Cancellation must propagate cleanly (no zombie warnings)."""
    from cmc.ingest import scheduler

    call_count = {"n": 0}

    async def fake_sync_once(sm, settings):
        call_count["n"] += 1
        return {"files_seen": 0, "files_updated": 0, "errors": 0, "duration_ms": 0}

    monkeypatch.setattr(scheduler, "sync_once", fake_sync_once)

    task = asyncio.create_task(scheduler.periodic_sync_loop(None, None, interval_s=0.05))
    await asyncio.sleep(0.18)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass  # expected — loop re-raises CancelledError

    assert call_count["n"] >= 3, f"expected ≥3 cycles, got {call_count['n']}"


@pytest.mark.asyncio
async def test_periodic_sync_loop_survives_transient_errors(monkeypatch):
    """Pitfall 7: sync_once raising once must NOT kill the loop. The next cycle
    still runs."""
    from cmc.ingest import scheduler

    call_count = {"n": 0}

    async def flaky_sync_once(sm, settings):
        call_count["n"] += 1
        if call_count["n"] == 2:
            raise RuntimeError("transient DB lock")
        return {"files_seen": 0, "files_updated": 0, "errors": 0, "duration_ms": 0}

    monkeypatch.setattr(scheduler, "sync_once", flaky_sync_once)

    task = asyncio.create_task(scheduler.periodic_sync_loop(None, None, interval_s=0.03))
    await asyncio.sleep(0.15)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

    # We expect at least 3 calls: cycle 1 ok, cycle 2 raises, cycle 3+ continues.
    assert call_count["n"] >= 3, (
        f"loop killed by single transient error — got {call_count['n']} cycles"
    )


# ---- Plan 02-05: lifespan boot sync + periodic task (INGST-01) ----


@pytest.mark.asyncio
async def test_lifespan_runs_initial_sync_and_schedules_loop(
    test_settings, fake_jsonl_dir, golden_jsonl_session,
):
    """INGST-01: lifespan boot runs sync_once AND creates a recurring task.

    Asserts both halves of INGST-01:
      1. Boot-time sync_once populated the sessions table from fake_jsonl_dir.
      2. app.state.sync_task exists and is a non-cancelled asyncio.Task.

    After exiting the lifespan context, the periodic task is cancelled cleanly.
    """
    from fastapi import FastAPI

    from cmc.app.lifespan import lifespan
    from cmc.db.models.sessions import Session as SessionModel

    settings = test_settings.model_copy(update={"jsonl_root": fake_jsonl_dir})
    app = FastAPI()
    app.state.settings = settings
    async with lifespan(app):
        # Boot sync ran: 1 session row from golden_jsonl_session.
        async with app.state.sessions() as db:
            rows = (await db.execute(select(SessionModel))).scalars().all()
            assert len(rows) == 1

        # Periodic task is alive.
        assert isinstance(app.state.sync_task, asyncio.Task)
        assert not app.state.sync_task.done()

    # After exit: task is cancelled cleanly (cancelled() OR done() — both indicate
    # the task is no longer active and was awaited inside the lifespan finally block).
    assert app.state.sync_task.done()
    # No "Task was destroyed but it is pending" warnings would appear here because
    # the lifespan awaited the cancelled task before yielding back.


@pytest.mark.asyncio
async def test_lifespan_boots_when_boot_sync_fails(
    test_settings, fake_jsonl_dir, monkeypatch,
):
    """INGST-01 resilience: if boot-time sync_once raises, lifespan still yields
    and starts the periodic loop. A transient FS error at boot must NOT prevent
    the server from coming up — the loop will retry every 120s anyway.
    """
    from fastapi import FastAPI

    async def _boom(*a, **kw):
        raise RuntimeError("transient FS error")

    # Patch BEFORE importing lifespan so the patched symbol is what lifespan sees.
    monkeypatch.setattr("cmc.app.lifespan.sync_once", _boom)

    from cmc.app.lifespan import lifespan
    settings = test_settings.model_copy(update={"jsonl_root": fake_jsonl_dir})
    app = FastAPI()
    app.state.settings = settings
    async with lifespan(app):
        # Lifespan still yielded successfully despite boot sync raising.
        assert isinstance(app.state.sync_task, asyncio.Task)
        assert not app.state.sync_task.done()


@pytest.mark.asyncio
async def test_lifespan_boots_when_jsonl_root_missing(
    test_settings, tmp_path,
):
    """Lifespan boots cleanly when jsonl_root points at a non-existent directory.

    Already covered indirectly by Plan 02-04's "missing dir → log warning" path
    in sync_once; this is a thin integration check that the lifespan doesn't
    propagate the warning into a boot failure.
    """
    from fastapi import FastAPI

    from cmc.app.lifespan import lifespan
    from cmc.db.models.sessions import Session as SessionModel

    nonexistent = tmp_path / "does-not-exist"
    settings = test_settings.model_copy(update={"jsonl_root": nonexistent})
    app = FastAPI()
    app.state.settings = settings
    async with lifespan(app):
        # No sessions ingested (no jsonl_root) but server still booted.
        async with app.state.sessions() as db:
            rows = (await db.execute(select(SessionModel))).scalars().all()
            assert rows == []
        assert isinstance(app.state.sync_task, asyncio.Task)


# ---- Plan 02-05: POST /api/sync (INGST-10) ----


@pytest.mark.asyncio
async def test_manual_sync_returns_summary_and_persists_data(
    test_settings, fake_jsonl_dir, golden_jsonl_session,
):
    """INGST-10 happy path: POST /api/sync runs a sync cycle and returns
    a summary dict with the documented shape; sessions row count matches
    what sync_once would produce.
    """
    from httpx import ASGITransport, AsyncClient

    from cmc.app import create_app
    from cmc.db.models.sessions import Session as SessionModel

    settings = test_settings.model_copy(update={"jsonl_root": fake_jsonl_dir})
    app = create_app(settings=settings)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        async with app.router.lifespan_context(app):
            resp = await client.post("/api/sync")
            assert resp.status_code == 200
            body = resp.json()
            assert body["status"] == "ok"
            # Documented shape: status + 4 summary fields.
            assert isinstance(body.get("files_seen"), int)
            assert isinstance(body.get("files_updated"), int)
            assert isinstance(body.get("errors"), int)
            assert isinstance(body.get("duration_ms"), int)
            # Boot sync already ingested the golden fixture, so the
            # second sync (this POST) sees no new updates — files_updated == 0
            # but files_seen == 1 (the file is still walked).
            assert body["files_seen"] == 1
            async with app.state.sessions() as db:
                rows = (await db.execute(select(SessionModel))).scalars().all()
                assert len(rows) == 1


@pytest.mark.asyncio
async def test_manual_sync_idempotent_under_repeat(
    test_settings, fake_jsonl_dir, golden_jsonl_session,
):
    """INGST-04 + INGST-05 + INGST-10: POSTing /api/sync twice doesn't
    inflate session counts OR token_usage rollups. The repeat should be a
    no-op because the file mtime hasn't moved and existing.ended_at is set
    (or the session is fresh and the on-disk row is current).
    """
    from httpx import ASGITransport, AsyncClient
    from sqlalchemy import func

    from cmc.app import create_app
    from cmc.db.models.sessions import Session as SessionModel
    from cmc.db.models.token_usage import TokenUsage

    settings = test_settings.model_copy(update={"jsonl_root": fake_jsonl_dir})
    app = create_app(settings=settings)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        async with app.router.lifespan_context(app):
            # Boot sync already ran inside lifespan_context — both POSTs are
            # repeats from the DB's perspective.
            await client.post("/api/sync")
            await client.post("/api/sync")
            async with app.state.sessions() as db:
                sess_count = (
                    await db.execute(select(func.count(SessionModel.session_id)))
                ).scalar_one()
                assert sess_count == 1
                bucket_total = (
                    await db.execute(select(func.sum(TokenUsage.tokens_input)))
                ).scalar_one()
                # Parser totals = 15. Multiple POSTs must not inflate this
                # rollup (Option B subtract-then-add keeps it at 15).
                assert bucket_total == 15


def test_sync_route_registered(test_settings):
    """Plan 02-05: /api/sync exists and lives under the /api prefix.

    Confirms all_routers() picked up the new sync_router AND the factory
    registered it before the SPA mount (Pitfall 8 still satisfied because
    all_routers() iteration runs before the static mount in factory.py).
    """
    from cmc.app import create_app
    app = create_app(settings=test_settings)
    paths = {getattr(r, "path", None) for r in app.routes}
    assert "/api/sync" in paths
    # Must NOT be at root (would mean it landed in raw_routers by mistake).
    assert "/sync" not in paths
