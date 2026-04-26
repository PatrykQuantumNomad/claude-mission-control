"""MCP aggregator package — rebuilds mcp_stats from three priority sources.

Priority order (locked per Plan 03-05 + RESEARCH §2.5 Open Q2/A3):
    1. tool_decision otel_events  — highest fidelity (decision + duration)
    2. tools table rows           — paired tool_use/tool_result with duration
    3. otel_events with attrs_mcp_* — lowest fidelity (no duration)

Public surface:
    rebuild_mcp_stats(db) -> dict — used by POST /api/mcp/sync (MCP-03)
"""
