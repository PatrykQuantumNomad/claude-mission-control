"""Phase 3 skills-router tests (SKILL-*).

Phase 3 per-router convention: every SKILL-* test lives in this file.
See test_phase3_system.py module docstring for the full convention.
"""
from __future__ import annotations


def test_skills_schemas_importable() -> None:
    """Wave-0 smoke: SKILL response DTOs are importable from cmc.api.schemas.skills."""
    from cmc.api.schemas.skills import (  # noqa: F401
        SkillAutonomyPatch,
        SkillAutonomyResponse,
        SkillListResponse,
        SkillRow,
        SkillSyncResponse,
    )
