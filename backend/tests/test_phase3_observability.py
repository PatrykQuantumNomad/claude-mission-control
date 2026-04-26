"""Phase 3 observability-router tests (OBSV-*).

Phase 3 per-router convention: every OBSV-* test lives in this file.
See test_phase3_system.py module docstring for the full convention.
"""
from __future__ import annotations


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
