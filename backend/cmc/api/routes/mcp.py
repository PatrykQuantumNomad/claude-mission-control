"""MCP router — MCP-01..04.

Endpoints:
    GET  /api/mcp                     -> McpServerListResponse  (MCP-01)
    GET  /api/mcp/{server}/tools      -> McpToolsResponse       (MCP-02)
    POST /api/mcp/sync                -> McpSyncResponse        (MCP-03)
    POST /api/mcp/measure             -> McpMeasureResponse     (MCP-04)

Path-traversal mitigation: server name is validated against
`^[a-zA-Z0-9._-]+$` (V11) — rejects `..` and slashes. SQL parameters are
always bound (never f-stringed) per RESEARCH §SQL injection.

Single-flight: POST /api/mcp/sync sets `app.state.mcp_sync_running = True`
in the entry path and clears it in `finally`. Concurrent calls receive
409 (mitigation T-03-05-05).
"""

import re
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.api.schemas.mcp import (
    McpMeasureResponse,
    McpServerListResponse,
    McpServerRow,
    McpSyncResponse,
    McpToolRow,
    McpToolsResponse,
)
from cmc.db import get_session
from cmc.db.models.mcp_stats import MCPStat
from cmc.mcp.aggregator import rebuild_mcp_stats

router = APIRouter(tags=["mcp"])

# Allows letters, digits, dot, dash, underscore. Rejects `..`, `/`, etc.
_SERVER_NAME_RE = re.compile(r"^[a-zA-Z0-9._-]+$")


@router.get("/mcp", response_model=McpServerListResponse)
async def list_servers(db: AsyncSession = Depends(get_session)) -> McpServerListResponse:
    """MCP-01: list MCP servers (server-level rows from mcp_stats)."""
    rows = (await db.execute(
        select(MCPStat)
        .where(MCPStat.tool_name.is_(None))
        .order_by(MCPStat.call_count.desc())
    )).scalars().all()
    return McpServerListResponse(items=[McpServerRow.model_validate(r) for r in rows])


@router.get("/mcp/{server}/tools", response_model=McpToolsResponse)
async def server_tools(
    server: str,
    db: AsyncSession = Depends(get_session),
) -> McpToolsResponse:
    """MCP-02: list tools for a given MCP server.

    200 with empty `items` if the server has no recorded tools (intentional —
    the dashboard shows the server card with "no tools yet" rather than a 404).
    400 if the server name fails the path-traversal regex.
    """
    # Defense in depth: regex blocks slashes and unexpected chars; the
    # explicit ".." check rejects literal traversal sequences that would
    # otherwise pass the regex (the regex allows `.` so `..` slips through
    # unless we forbid it explicitly).
    if not _SERVER_NAME_RE.match(server) or ".." in server:
        raise HTTPException(status_code=400, detail="invalid server name")
    rows = (await db.execute(
        select(MCPStat)
        .where(MCPStat.server_name == server, MCPStat.tool_name.is_not(None))
        .order_by(MCPStat.call_count.desc())
    )).scalars().all()
    return McpToolsResponse(
        server_name=server,
        items=[McpToolRow.model_validate(r) for r in rows],
    )


@router.post("/mcp/sync", response_model=McpSyncResponse)
async def mcp_sync(
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> McpSyncResponse:
    """MCP-03: rebuild mcp_stats from the three priority sources.

    Single-flight: returns 409 if a sync is already in flight (mitigation
    T-03-05-05). The flag lives on `app.state.mcp_sync_running`; tests can
    pre-set it to assert the 409 path.
    """
    if getattr(request.app.state, "mcp_sync_running", False):
        raise HTTPException(status_code=409, detail="mcp sync already running")
    request.app.state.mcp_sync_running = True
    try:
        summary = await rebuild_mcp_stats(db)
        return McpSyncResponse(status="ok", **summary)
    finally:
        request.app.state.mcp_sync_running = False


@router.post("/mcp/measure", response_model=McpMeasureResponse)
async def mcp_measure(db: AsyncSession = Depends(get_session)) -> McpMeasureResponse:
    """MCP-04: best-effort schema-size measurement per server.

    For each distinct server in mcp_stats, sums LENGTH(body) over the most
    recent 100 otel_events with attrs_mcp_server matching the server name,
    and writes the result to mcp_stats.schema_size_bytes on the server-level
    row (tool_name IS NULL).

    "Best effort" because:
      - body sizes only approximate schema cost; some servers won't have
        any attrs_mcp_server events (those rows get schema_size_bytes=0).
      - capped at 100 events per server to bound query cost (Pitfall:
        unbounded SUM(LENGTH(body)) over millions of events would block).
    """
    start = time.perf_counter()
    servers = (await db.execute(
        select(MCPStat.server_name)
        .where(MCPStat.tool_name.is_(None))
        .distinct()
    )).scalars().all()
    measured = 0
    size_q = text("""
        SELECT COALESCE(SUM(LENGTH(body)), 0) AS sz
        FROM (
            SELECT body FROM otel_events
            WHERE attrs_mcp_server = :server
            ORDER BY id DESC
            LIMIT 100
        )
    """)
    update_q = text(
        "UPDATE mcp_stats SET schema_size_bytes = :sz "
        "WHERE server_name = :s AND tool_name IS NULL"
    )
    for server in servers:
        sz = (await db.execute(size_q, {"server": server})).scalar_one() or 0
        await db.execute(update_q, {"sz": int(sz), "s": server})
        measured += 1
    await db.commit()
    duration_ms = int((time.perf_counter() - start) * 1000)
    return McpMeasureResponse(
        status="ok",
        servers_measured=measured,
        duration_ms=duration_ms,
    )
