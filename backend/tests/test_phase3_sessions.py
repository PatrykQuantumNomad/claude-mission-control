"""Phase 3 sessions-router tests (SESS-*).

Phase 3 per-router convention: every SESS-* test lives in this file.
See test_phase3_system.py module docstring for the full convention.
"""
from __future__ import annotations


def test_sessions_schemas_importable() -> None:
    """Wave-0 smoke: SESS response DTOs are importable from cmc.api.schemas.sessions."""
    from cmc.api.schemas.sessions import (  # noqa: F401
        FollowUpMessageRequest,
        FollowUpMessageResponse,
        LiveSessionItem,
        LiveSessionState,
        SessionDetailsResponse,
        SessionListItem,
        SessionListResponse,
        TodaySummaryResponse,
        ToolTimelineEntry,
    )
