"""Phase 3 MCP-router tests (MCP-*).

Phase 3 per-router convention: every MCP-* test lives in this file.
See test_phase3_system.py module docstring for the full convention.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import insert, text


def test_mcp_schemas_importable() -> None:
    """Wave-0 smoke: MCP response DTOs are importable from cmc.api.schemas.mcp."""
    from cmc.api.schemas.mcp import (  # noqa: F401
        McpMeasureResponse,
        McpServerListResponse,
        McpServerRow,
        McpSyncResponse,
        McpToolRow,
        McpToolsResponse,
    )


# ---- Helpers -------------------------------------------------------------


async def _seed_priority_sources(app) -> None:
    """Seed the three priority sources used by MCP-03 sync.

    Source 1 (highest): one tool_decision otel event for github/merge_pr
        (duration_ms=500, is_error=false).
    Source 2 (middle):  three ToolCall rows for github/list_repos
        (duration_ms in {100, 200, 300}, status=ok).
    Source 3 (lowest):  two attrs-only otel events for context7/query_docs
        (no duration data — falls through to source 3).

    A parent session row is required because tools.session_id has an FK
    constraint (ON DELETE CASCADE). otel_events.session_id is a soft FK
    (ON DELETE SET NULL) so we leave them session-less for simplicity.
    """
    from cmc.db.models.otel_events import OtelEvent
    from cmc.db.models.sessions import Session
    from cmc.db.models.tools import ToolCall

    sessionmaker = app.state.sessions
    async with sessionmaker() as db:
        # Parent session for ToolCall FK.
        from tests.conftest import make_session_row

        sess = make_session_row(session_id="sess-mcp-1")
        await db.execute(insert(Session.__table__).values(**sess))

        base_ts = datetime(2026, 4, 26, 12, 0, 0, tzinfo=UTC)

        # Source 2: three github/list_repos ToolCalls with duration.
        for i, dur in enumerate([100, 200, 300]):
            await db.execute(
                insert(ToolCall.__table__).values(
                    tool_use_id=f"tu-list-{i}",
                    session_id="sess-mcp-1",
                    tool_name="mcp__github__list_repos",
                    started_at=base_ts + timedelta(seconds=i),
                    ended_at=base_ts + timedelta(seconds=i, milliseconds=dur),
                    duration_ms=dur,
                    status="ok",
                    mcp_server_name="github",
                    mcp_tool_name="list_repos",
                )
            )

        # Source 1: one tool_decision otel event for github/merge_pr.
        await db.execute(
            insert(OtelEvent.__table__).values(
                ts=base_ts + timedelta(seconds=10),
                event_name="claude_code.tool_decision",
                session_id=None,
                body={
                    "mcp_server_name": "github",
                    "mcp_tool_name": "merge_pr",
                    "duration_ms": 500,
                    "is_error": False,
                },
                attrs_mcp_server=None,
                attrs_mcp_tool=None,
                received_at=base_ts + timedelta(seconds=10),
            )
        )

        # Source 3: two attrs-only otel events for context7/query_docs.
        for i in range(2):
            await db.execute(
                insert(OtelEvent.__table__).values(
                    ts=base_ts + timedelta(seconds=20 + i),
                    event_name="claude_code.tool_result",
                    session_id=None,
                    body={"some": "blob"},
                    attrs_mcp_server="context7",
                    attrs_mcp_tool="query_docs",
                    received_at=base_ts + timedelta(seconds=20 + i),
                )
            )

        await db.commit()


# ---- MCP-03: sync endpoint ----------------------------------------------


async def test_mcp_sync_rebuilds_from_three_priority_sources(seeded_app) -> None:
    """MCP-03: POST /api/mcp/sync aggregates per-(server, tool) from priority
    sources and writes per-tool + per-server rows to mcp_stats."""
    import httpx

    app, cm = seeded_app
    async with cm:
        await _seed_priority_sources(app)

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as ac:
            resp = await ac.post("/api/mcp/sync")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["status"] == "ok"
        assert body["servers"] == 2
        assert body["tools"] == 3
        assert body["source_counts"]["tool_decision"] == 1
        assert body["source_counts"]["tools"] == 1
        assert body["source_counts"]["otel"] == 1

        # Verify mcp_stats has 5 rows: 3 per-tool + 2 per-server.
        sessionmaker = app.state.sessions
        async with sessionmaker() as db:
            count = (await db.execute(text("SELECT COUNT(*) FROM mcp_stats"))).scalar_one()
            assert count == 5
            tool_rows = (await db.execute(
                text("SELECT COUNT(*) FROM mcp_stats WHERE tool_name IS NOT NULL")
            )).scalar_one()
            assert tool_rows == 3
            server_rows = (await db.execute(
                text("SELECT COUNT(*) FROM mcp_stats WHERE tool_name IS NULL")
            )).scalar_one()
            assert server_rows == 2


# ---- MCP-01: GET /api/mcp -----------------------------------------------


async def test_mcp_list_servers_returns_server_level_rows(seeded_app) -> None:
    """MCP-01: GET /api/mcp returns server-level rows sorted by call_count desc."""
    import httpx

    app, cm = seeded_app
    async with cm:
        await _seed_priority_sources(app)

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as ac:
            await ac.post("/api/mcp/sync")
            resp = await ac.get("/api/mcp")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        items = body["items"]
        assert len(items) == 2
        names = [i["server_name"] for i in items]
        assert "github" in names
        assert "context7" in names
        # Sorted by call_count desc; github has 4 calls (3 list + 1 merge),
        # context7 has 2 calls.
        assert items[0]["server_name"] == "github"
        assert items[0]["call_count"] >= items[1]["call_count"]


# ---- MCP-02: GET /api/mcp/{server}/tools -------------------------------


async def test_mcp_server_tools_priority_routing(seeded_app) -> None:
    """MCP-02: per-server tool list reflects three-source priority routing."""
    import httpx

    app, cm = seeded_app
    async with cm:
        await _seed_priority_sources(app)

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as ac:
            await ac.post("/api/mcp/sync")

            resp_github = await ac.get("/api/mcp/github/tools")
            assert resp_github.status_code == 200, resp_github.text
            gh_body = resp_github.json()
            assert gh_body["server_name"] == "github"
            tools = {t["tool_name"]: t for t in gh_body["items"]}
            assert "list_repos" in tools
            assert "merge_pr" in tools
            assert tools["list_repos"]["source_priority"] == "tools"
            assert tools["merge_pr"]["source_priority"] == "tool_decision"

            resp_ctx = await ac.get("/api/mcp/context7/tools")
            assert resp_ctx.status_code == 200, resp_ctx.text
            ctx_body = resp_ctx.json()
            assert len(ctx_body["items"]) == 1
            assert ctx_body["items"][0]["tool_name"] == "query_docs"
            assert ctx_body["items"][0]["source_priority"] == "otel"

            # Unknown server -> 200 with empty list.
            resp_unknown = await ac.get("/api/mcp/unknown/tools")
            assert resp_unknown.status_code == 200
            assert resp_unknown.json()["items"] == []

            # Path-traversal attempt: the literal `..` sequence in a server
            # segment is rejected by the explicit ".." guard (defense in
            # depth on top of the regex). Percent-encoded slashes typically
            # get split by the ASGI router into a different path entirely,
            # so we test the real attack surface: a single segment that
            # contains the dotdot traversal.
            resp_bad = await ac.get("/api/mcp/bad..name/tools")
            assert resp_bad.status_code == 400
            assert "invalid server name" in resp_bad.json().get("error", "")
            # And a non-alphanum char that the regex catches:
            resp_bad2 = await ac.get("/api/mcp/has@symbol/tools")
            assert resp_bad2.status_code == 400


# ---- MCP-03: single-flight guard ----------------------------------------


async def test_mcp_sync_returns_409_when_already_running(seeded_app) -> None:
    """MCP-03: single-flight guard returns 409 when sync is already in flight."""
    import httpx

    app, cm = seeded_app
    async with cm:
        # Manually set the flag to simulate an in-flight sync.
        app.state.mcp_sync_running = True
        try:
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(
                transport=transport, base_url="http://testserver"
            ) as ac:
                resp = await ac.post("/api/mcp/sync")

            assert resp.status_code == 409
            # cmc.core.errors.register_error_handlers rewrites HTTPException
            # to {"error": detail} (factory-level handler) — assert on `error`.
            assert "already running" in resp.json()["error"]
        finally:
            app.state.mcp_sync_running = False


# ---- MCP-04: measure ----------------------------------------------------


async def test_mcp_measure_writes_schema_size(seeded_app) -> None:
    """MCP-04: POST /api/mcp/measure writes schema_size_bytes for each server."""
    import httpx

    app, cm = seeded_app
    async with cm:
        await _seed_priority_sources(app)

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as ac:
            await ac.post("/api/mcp/sync")
            resp = await ac.post("/api/mcp/measure")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["status"] == "ok"
        assert body["servers_measured"] >= 1
        assert "duration_ms" in body

        # Verify a server-level row got a schema_size_bytes value (>= 0).
        sessionmaker = app.state.sessions
        async with sessionmaker() as db:
            row = (await db.execute(
                text(
                    "SELECT schema_size_bytes FROM mcp_stats "
                    "WHERE server_name = 'context7' AND tool_name IS NULL"
                )
            )).scalar_one()
            assert row is not None
            assert int(row) >= 0


# ---- Aggregator unit test: priority order locked ------------------------


async def test_aggregator_prefers_tool_decision_over_tools(seeded_app) -> None:
    """Direct aggregator unit test: when both source 1 (tool_decision) and
    source 2 (tools) have data for the same (server, tool), the higher
    priority source 1 wins (source_priority = 'tool_decision')."""
    from cmc.db.models.otel_events import OtelEvent
    from cmc.db.models.sessions import Session
    from cmc.db.models.tools import ToolCall
    from cmc.mcp.aggregator import rebuild_mcp_stats
    from tests.conftest import make_session_row

    app, cm = seeded_app
    async with cm:
        sessionmaker = app.state.sessions
        # Seed identical (server="dual", tool="X") in both sources.
        async with sessionmaker() as db:
            sess = make_session_row(session_id="sess-dual-1")
            await db.execute(insert(Session.__table__).values(**sess))

            base_ts = datetime(2026, 4, 26, 13, 0, 0, tzinfo=UTC)

            # Source 2: ToolCall row for dual/X.
            await db.execute(
                insert(ToolCall.__table__).values(
                    tool_use_id="tu-dual-1",
                    session_id="sess-dual-1",
                    tool_name="mcp__dual__X",
                    started_at=base_ts,
                    ended_at=base_ts + timedelta(milliseconds=999),
                    duration_ms=999,
                    status="ok",
                    mcp_server_name="dual",
                    mcp_tool_name="X",
                )
            )

            # Source 1: tool_decision otel event for dual/X.
            await db.execute(
                insert(OtelEvent.__table__).values(
                    ts=base_ts + timedelta(seconds=1),
                    event_name="claude_code.tool_decision",
                    session_id=None,
                    body={
                        "mcp_server_name": "dual",
                        "mcp_tool_name": "X",
                        "duration_ms": 111,
                        "is_error": False,
                    },
                    attrs_mcp_server=None,
                    attrs_mcp_tool=None,
                    received_at=base_ts + timedelta(seconds=1),
                )
            )
            await db.commit()

        # Run aggregator directly.
        async with sessionmaker() as db:
            summary = await rebuild_mcp_stats(db)

        assert summary["servers"] == 1
        assert summary["tools"] == 1

        # Verify the per-tool row's source_priority == "tool_decision".
        async with sessionmaker() as db:
            row = (await db.execute(
                text(
                    "SELECT source_priority FROM mcp_stats "
                    "WHERE server_name='dual' AND tool_name='X'"
                )
            )).scalar_one()
            assert row == "tool_decision"
