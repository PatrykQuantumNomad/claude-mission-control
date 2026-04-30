"""Skills router — SKIL-01..03.

Endpoints:
    GET   /api/skills                  -> SkillListResponse        (SKIL-01)
    POST  /api/skills/sync             -> SkillSyncResponse        (SKIL-02)
    PATCH /api/skills/{name}/autonomy  -> SkillAutonomyResponse    (SKIL-03)

Path-traversal mitigation: skill name is validated against
`^[a-zA-Z0-9_-]+$` PLUS an explicit ".." check (regex-only would slip the
literal traversal pattern). See V12.

Single-flight: POST /api/skills/sync sets `app.state.skills_sync_running`
in the entry path and clears it in `finally`. Concurrent calls receive 409.

Path roots:
    user_dir    = ~/.claude/skills        (environment="personal" default)
    project_dir = repo_root() / "skills"  (environment="project" default)
The frontmatter `environment` key overrides the per-root default.
"""

import re
import time
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.api.schemas.skills import (
    SkillAutonomyPatch,
    SkillAutonomyResponse,
    SkillListResponse,
    SkillRow,
    SkillSyncResponse,
)
from cmc.core.paths import repo_root
from cmc.db import get_session
from cmc.db.models.skills import Skill
from cmc.skills.scanner import scan_all

router = APIRouter(tags=["skills"])

_SKILL_NAME_RE = re.compile(r"^[a-zA-Z0-9_-]+$")


@router.get("/skills", response_model=SkillListResponse)
async def list_skills(
    db: AsyncSession = Depends(get_session),
    environment: str | None = Query(None),
    user_invocable: bool | None = Query(None),
) -> SkillListResponse:
    """SKIL-01: list skills with optional environment + user_invocable filters."""
    stmt = select(Skill)
    if environment is not None:
        stmt = stmt.where(Skill.environment == environment)
    if user_invocable is not None:
        stmt = stmt.where(Skill.user_invocable == user_invocable)
    stmt = stmt.order_by(Skill.name.asc())
    rows = (await db.execute(stmt)).scalars().all()
    return SkillListResponse(items=[SkillRow.model_validate(r) for r in rows])


@router.post("/skills/sync", response_model=SkillSyncResponse)
async def skills_sync(
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> SkillSyncResponse:
    """SKIL-02: scan skill roots and upsert into the skills table.

    Single-flight via app.state.skills_sync_running flag.

    Per-skill flow:
      - existing = SELECT WHERE name = parsed['name']
      - if not existing: INSERT  → upserted += 1
      - elif anything actually changed: UPDATE → upserted += 1
      - else: unchanged += 1
    Caught exceptions → errors += 1 (non-fatal; we keep going).
    """
    if getattr(request.app.state, "skills_sync_running", False):
        raise HTTPException(status_code=409, detail="skills sync already running")
    request.app.state.skills_sync_running = True
    try:
        start = time.perf_counter()
        user_dir = Path("~/.claude/skills").expanduser()
        project_dir = repo_root() / "skills"
        # scan_all is None-safe on project_dir, but only when the dir
        # doesn't exist at all do we want None. (Pass the path through
        # either way — scan_all's find_skill_files returns nothing when
        # the dir is missing.)
        parsed = scan_all(user_dir, project_dir)

        found = len(parsed)
        upserted = 0
        unchanged = 0
        errors = 0

        for s in parsed:
            try:
                existing = (await db.execute(
                    select(Skill).where(Skill.name == s["name"])
                )).scalar_one_or_none()

                now = datetime.now(UTC)

                if existing is None:
                    await db.execute(sqlite_insert(Skill).values(
                        name=s["name"],
                        environment=s["environment"],
                        user_invocable=s["user_invocable"],
                        autonomy=s.get("autonomy") or "manual",
                        description=s.get("description"),
                        frontmatter=s.get("frontmatter") or {},
                        path=s["path"],
                        updated_at=now,
                    ))
                    upserted += 1
                else:
                    # Compare every field that the scanner can change. We
                    # intentionally do NOT compare `frontmatter` or
                    # `autonomy` here:
                    #   - frontmatter: dict equality is order-sensitive in
                    #     some serializers; safer to treat it as
                    #     side-data the scanner refreshes alongside the
                    #     comparable fields.
                    #   - autonomy: SKIL-03's PATCH is the canonical way
                    #     to update autonomy; resync should NOT override
                    #     a user's manual autonomy choice.
                    changed = (
                        existing.environment != s["environment"]
                        or existing.user_invocable != s["user_invocable"]
                        or existing.path != s["path"]
                        or existing.description != s.get("description")
                    )
                    if changed:
                        existing.environment = s["environment"]
                        existing.user_invocable = s["user_invocable"]
                        existing.description = s.get("description")
                        existing.frontmatter = s.get("frontmatter") or {}
                        existing.path = s["path"]
                        existing.updated_at = now
                        upserted += 1
                    else:
                        unchanged += 1
            except Exception:
                errors += 1

        await db.commit()
        return SkillSyncResponse(
            status="ok",
            found=found,
            upserted=upserted,
            unchanged=unchanged,
            errors=errors,
            duration_ms=int((time.perf_counter() - start) * 1000),
        )
    finally:
        request.app.state.skills_sync_running = False


@router.patch("/skills/{name}/autonomy", response_model=SkillAutonomyResponse)
async def patch_autonomy(
    name: str,
    payload: SkillAutonomyPatch,
    db: AsyncSession = Depends(get_session),
) -> SkillAutonomyResponse:
    """SKIL-03: update a skill's autonomy.

    Validation:
      - name must match `^[a-zA-Z0-9_-]+$` AND not contain `..` (V12).
      - autonomy is enforced by Pydantic Literal["auto","review","manual"]
        on the SkillAutonomyPatch model — invalid values produce 422.
    """
    if not _SKILL_NAME_RE.match(name) or ".." in name:
        raise HTTPException(status_code=400, detail="invalid skill name")
    existing = (await db.execute(
        select(Skill).where(Skill.name == name)
    )).scalar_one_or_none()
    if existing is None:
        raise HTTPException(status_code=404, detail="skill not found")
    existing.autonomy = payload.autonomy
    existing.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(existing)
    return SkillAutonomyResponse.model_validate(existing)
