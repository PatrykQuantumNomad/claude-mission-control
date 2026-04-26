"""Response schemas for SKILL-* (skills catalog) routes.

DTOs supplied here for Wave 1 plan 03-05's skills router to consume:
  - GET   /api/skills                 -> SkillListResponse        (SKILL-01)
  - POST  /api/skills/sync             -> SkillSyncResponse        (SKILL-02)
  - PATCH /api/skills/{name}/autonomy -> SkillAutonomyResponse    (SKILL-03)

`autonomy` is one of "auto" | "review" | "manual" — the SkillAutonomyPatch
schema enforces this at the request boundary.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel

from cmc.api.schemas.common import ORMBase


class SkillRow(ORMBase):
    """One skill in the catalog (project + user environments combined)."""

    name: str
    environment: str
    user_invocable: bool
    autonomy: str
    description: Optional[str] = None
    path: str
    updated_at: datetime


class SkillListResponse(BaseModel):
    items: list[SkillRow]


class SkillSyncResponse(BaseModel):
    """SKILL-02: scan summary across project + user skills directories."""

    status: str
    found: int
    upserted: int
    unchanged: int
    errors: int
    duration_ms: int


class SkillAutonomyPatch(BaseModel):
    """SKILL-03: autonomy override request body."""

    autonomy: Literal["auto", "review", "manual"]


class SkillAutonomyResponse(ORMBase):
    """SKILL-03: confirmation echoing the new autonomy value + updated_at."""

    name: str
    autonomy: str
    updated_at: datetime
