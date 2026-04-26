"""Three-source MCP aggregator (MCP-03 sync target).

Priority order (locked per Plan 03-05 + RESEARCH §2.5 Open Q2/A3):
    1. tool_decision otel_events  — highest fidelity (decision + duration)
    2. tools table rows           — paired tool_use/tool_result with duration
    3. otel_events with attrs_mcp_* — lowest fidelity (no duration)

Aggregation strategy:
    - For each (server, tool) pair, the HIGHEST-priority source that has
      data wins. Lower-priority sources only fill (server, tool) pairs the
      higher source did not produce.
    - Server-level rows (tool_name IS NULL) are computed by re-running the
      same priority-ordered queries but grouped by server_name only — NOT
      by taking max() of per-tool p95s, which would bias high (per checker
      WARNING 4 in 03-05-PLAN-CHECKER.md). Server-level p50/p95/max are
      true percentiles across ALL of a server's calls.

Latency percentiles (SQLite 3.47+ window functions):
    - Rank durations within each partition with ROW_NUMBER() OVER (...).
    - Compute the partition cardinality with COUNT(*) OVER (...).
    - Pick the row at rank ceil(N * 0.5) for p50, ceil(N * 0.95) for p95.
      We use MAX(CAST(N * frac AS INTEGER), 1) so single-row partitions
      yield rank 1 (the only row) instead of rank 0 (no row).
    - Plan 03-05 originally specified a correlated-subquery LIMIT 1 OFFSET
      pattern that mixed COUNT() across the inner/outer query — SQLite
      rejects that with "misuse of aggregate function COUNT()". Fixed to
      window-function form here (Rule 1 - Bug auto-fix; Plan SQL was broken
      against SQLite). Numerically equivalent for N >= 2; for N == 1 both
      forms return the single value.
"""
from __future__ import annotations

import time

from sqlalchemy import text
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.db.models.mcp_stats import MCPStat


# ---- Per-(server, tool) source SQL ---------------------------------------
#
# Pattern: a CTE that flattens the rows of interest, then a second CTE that
# attaches ROW_NUMBER + COUNT window functions partitioned by (server, tool),
# then a top-level GROUP BY that picks the percentile rank with MAX(CASE ...).

_SRC1_SQL = text("""
    WITH td AS (
      SELECT
        json_extract(body, '$.mcp_server_name')   AS server_name,
        json_extract(body, '$.mcp_tool_name')     AS tool_name,
        CAST(json_extract(body, '$.duration_ms') AS INTEGER) AS duration_ms,
        CASE
          WHEN json_extract(body, '$.is_error') IN (1, 'true', 'True') THEN 1
          ELSE 0
        END AS is_error
      FROM otel_events
      WHERE event_name = 'claude_code.tool_decision'
        AND json_extract(body, '$.mcp_server_name') IS NOT NULL
        AND json_extract(body, '$.mcp_tool_name')   IS NOT NULL
        AND json_extract(body, '$.duration_ms')     IS NOT NULL
    ),
    ranked AS (
      SELECT
        server_name, tool_name, duration_ms, is_error,
        ROW_NUMBER() OVER (PARTITION BY server_name, tool_name ORDER BY duration_ms) AS rn,
        COUNT(*)     OVER (PARTITION BY server_name, tool_name)                       AS cnt
      FROM td
    )
    SELECT
      server_name,
      tool_name,
      COUNT(*)      AS call_count,
      SUM(is_error) AS error_count,
      MAX(CASE WHEN rn = MAX(CAST(cnt * 0.5  AS INTEGER), 1) THEN duration_ms END) AS p50_ms,
      MAX(CASE WHEN rn = MAX(CAST(cnt * 0.95 AS INTEGER), 1) THEN duration_ms END) AS p95_ms,
      MAX(duration_ms) AS max_ms
    FROM ranked
    GROUP BY server_name, tool_name
""")

_SRC2_SQL = text("""
    WITH tt AS (
      SELECT
        mcp_server_name AS server_name,
        mcp_tool_name   AS tool_name,
        duration_ms,
        CASE WHEN status = 'error' THEN 1 ELSE 0 END AS is_error
      FROM tools
      WHERE mcp_server_name IS NOT NULL
        AND mcp_tool_name   IS NOT NULL
        AND duration_ms     IS NOT NULL
    ),
    ranked AS (
      SELECT
        server_name, tool_name, duration_ms, is_error,
        ROW_NUMBER() OVER (PARTITION BY server_name, tool_name ORDER BY duration_ms) AS rn,
        COUNT(*)     OVER (PARTITION BY server_name, tool_name)                       AS cnt
      FROM tt
    )
    SELECT
      server_name,
      tool_name,
      COUNT(*)      AS call_count,
      SUM(is_error) AS error_count,
      MAX(CASE WHEN rn = MAX(CAST(cnt * 0.5  AS INTEGER), 1) THEN duration_ms END) AS p50_ms,
      MAX(CASE WHEN rn = MAX(CAST(cnt * 0.95 AS INTEGER), 1) THEN duration_ms END) AS p95_ms,
      MAX(duration_ms) AS max_ms
    FROM ranked
    GROUP BY server_name, tool_name
""")

_SRC3_SQL = text("""
    SELECT
      attrs_mcp_server AS server_name,
      attrs_mcp_tool   AS tool_name,
      COUNT(*)         AS call_count,
      0                AS error_count,
      NULL             AS p50_ms,
      NULL             AS p95_ms,
      NULL             AS max_ms
    FROM otel_events
    WHERE attrs_mcp_server IS NOT NULL
      AND attrs_mcp_tool   IS NOT NULL
    GROUP BY attrs_mcp_server, attrs_mcp_tool
""")


# ---- Per-server (tool_name IS NULL) source SQL ---------------------------

_SRV1_SQL = text("""
    WITH td AS (
      SELECT
        json_extract(body, '$.mcp_server_name') AS server_name,
        CAST(json_extract(body, '$.duration_ms') AS INTEGER) AS duration_ms,
        CASE
          WHEN json_extract(body, '$.is_error') IN (1, 'true', 'True') THEN 1
          ELSE 0
        END AS is_error
      FROM otel_events
      WHERE event_name = 'claude_code.tool_decision'
        AND json_extract(body, '$.mcp_server_name') IS NOT NULL
        AND json_extract(body, '$.duration_ms')     IS NOT NULL
    ),
    ranked AS (
      SELECT
        server_name, duration_ms, is_error,
        ROW_NUMBER() OVER (PARTITION BY server_name ORDER BY duration_ms) AS rn,
        COUNT(*)     OVER (PARTITION BY server_name)                       AS cnt
      FROM td
    )
    SELECT
      server_name,
      COUNT(*)      AS call_count,
      SUM(is_error) AS error_count,
      MAX(CASE WHEN rn = MAX(CAST(cnt * 0.5  AS INTEGER), 1) THEN duration_ms END) AS p50_ms,
      MAX(CASE WHEN rn = MAX(CAST(cnt * 0.95 AS INTEGER), 1) THEN duration_ms END) AS p95_ms,
      MAX(duration_ms) AS max_ms
    FROM ranked
    GROUP BY server_name
""")

_SRV2_SQL = text("""
    WITH tt AS (
      SELECT
        mcp_server_name AS server_name,
        duration_ms,
        CASE WHEN status = 'error' THEN 1 ELSE 0 END AS is_error
      FROM tools
      WHERE mcp_server_name IS NOT NULL
        AND duration_ms     IS NOT NULL
    ),
    ranked AS (
      SELECT
        server_name, duration_ms, is_error,
        ROW_NUMBER() OVER (PARTITION BY server_name ORDER BY duration_ms) AS rn,
        COUNT(*)     OVER (PARTITION BY server_name)                       AS cnt
      FROM tt
    )
    SELECT
      server_name,
      COUNT(*)      AS call_count,
      SUM(is_error) AS error_count,
      MAX(CASE WHEN rn = MAX(CAST(cnt * 0.5  AS INTEGER), 1) THEN duration_ms END) AS p50_ms,
      MAX(CASE WHEN rn = MAX(CAST(cnt * 0.95 AS INTEGER), 1) THEN duration_ms END) AS p95_ms,
      MAX(duration_ms) AS max_ms
    FROM ranked
    GROUP BY server_name
""")

_SRV3_SQL = text("""
    SELECT
      attrs_mcp_server AS server_name,
      COUNT(*)         AS call_count,
      0                AS error_count,
      NULL             AS p50_ms,
      NULL             AS p95_ms,
      NULL             AS max_ms
    FROM otel_events
    WHERE attrs_mcp_server IS NOT NULL
    GROUP BY attrs_mcp_server
""")


async def rebuild_mcp_stats(db: AsyncSession) -> dict:
    """Rebuild mcp_stats from the three priority sources.

    Wipes mcp_stats then rewrites it. Returns a summary dict matching the
    McpSyncResponse shape (minus `status`):

        {
          "servers": int,
          "tools":   int,
          "source_counts": {"tool_decision": int, "tools": int, "otel": int},
          "duration_ms":   int,
        }

    Source priority is preserved: a (server, tool) pair populated by source 1
    will NOT be overwritten by source 2 or source 3.
    """
    start = time.perf_counter()

    merged: dict[tuple[str, str], dict] = {}
    source_counts = {"tool_decision": 0, "tools": 0, "otel": 0}

    for sql, src_label, src_key in [
        (_SRC1_SQL, "tool_decision", "tool_decision"),
        (_SRC2_SQL, "tools",         "tools"),
        (_SRC3_SQL, "otel",          "otel"),
    ]:
        rows = (await db.execute(sql)).mappings().all()
        for r in rows:
            key = (r["server_name"], r["tool_name"])
            if key in merged:
                # Higher-priority source already populated this pair.
                continue
            merged[key] = {
                "call_count": int(r["call_count"]),
                "error_count": int(r["error_count"] or 0),
                "p50_ms": float(r["p50_ms"]) if r["p50_ms"] is not None else None,
                "p95_ms": float(r["p95_ms"]) if r["p95_ms"] is not None else None,
                "max_ms": float(r["max_ms"]) if r["max_ms"] is not None else None,
                "source": src_label,
            }
            source_counts[src_key] += 1

    # Wipe existing rows; we rebuild the whole table on each sync.
    await db.execute(text("DELETE FROM mcp_stats"))

    # Insert per-tool rows.
    servers: set[str] = set()
    for (server, tool), v in merged.items():
        servers.add(server)
        await db.execute(
            sqlite_insert(MCPStat).values(
                server_name=server,
                tool_name=tool,
                call_count=v["call_count"],
                error_count=v["error_count"],
                latency_p50_ms=v["p50_ms"],
                latency_p95_ms=v["p95_ms"],
                latency_max_ms=v["max_ms"],
                schema_size_bytes=None,
                source_priority=v["source"],
            )
        )

    # Per-server (tool_name IS NULL) rows: re-run priority-ordered server
    # queries grouped by server_name only — NOT max(per-tool p95). Per
    # checker WARNING 4: server-level latency must be a true percentile
    # across ALL of a server's calls, not the max of per-tool p95s.
    server_merged: dict[str, dict] = {}
    for sql, src_label in [
        (_SRV1_SQL, "tool_decision"),
        (_SRV2_SQL, "tools"),
        (_SRV3_SQL, "otel"),
    ]:
        srv_rows = (await db.execute(sql)).mappings().all()
        for r in srv_rows:
            s = r["server_name"]
            if s in server_merged:
                continue
            server_merged[s] = {
                "call_count": int(r["call_count"]),
                "error_count": int(r["error_count"] or 0),
                "p50_ms": float(r["p50_ms"]) if r["p50_ms"] is not None else None,
                "p95_ms": float(r["p95_ms"]) if r["p95_ms"] is not None else None,
                "max_ms": float(r["max_ms"]) if r["max_ms"] is not None else None,
                "source": src_label,
            }

    for server in sorted(servers):
        # call_count + error_count: SUM across per-tool merged rows for this
        # server. Each (server, tool) pair was deduplicated by priority above
        # (a tool_decision row and its corresponding tools-table row both
        # describe the SAME tool call → counted once via priority winner).
        # Different tools under the same server are independent rows → sum
        # gives the true per-server call count across ALL of a server's
        # calls (per must-have).
        tool_rows = [v for (s, _t), v in merged.items() if s == server]
        call_count = sum(t["call_count"] for t in tool_rows)
        error_count = sum(t["error_count"] for t in tool_rows)

        # Latency p50/p95/max: from the highest-priority SRV query result
        # that has data for this server. SRV1/SRV2 are GROUP BY server_name
        # with window-function percentiles — true percentiles across ALL
        # rows the source observed for this server (single SQL pass per
        # source, NOT max-of-per-tool — per checker WARNING 4). When a
        # server only appears via source 3 (attrs_mcp_*), there's no
        # duration data so latency stays NULL.
        if server in server_merged:
            m = server_merged[server]
            p50, p95, mx = m["p50_ms"], m["p95_ms"], m["max_ms"]
        else:
            p50 = p95 = mx = None
        await db.execute(
            sqlite_insert(MCPStat).values(
                server_name=server,
                tool_name=None,
                call_count=call_count,
                error_count=error_count,
                latency_p50_ms=p50,
                latency_p95_ms=p95,
                latency_max_ms=mx,
                schema_size_bytes=None,
                source_priority="aggregate",
            )
        )

    await db.commit()

    return {
        "servers": len(servers),
        "tools": len(merged),
        "source_counts": source_counts,
        "duration_ms": int((time.perf_counter() - start) * 1000),
    }
