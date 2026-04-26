"""Phase 3 MCP-router tests (MCP-*).

Phase 3 per-router convention: every MCP-* test lives in this file.
See test_phase3_system.py module docstring for the full convention.
"""
from __future__ import annotations


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
