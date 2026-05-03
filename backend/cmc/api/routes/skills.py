"""Skills router — SKIL-01..07.

Endpoints (Phase 0/1 — catalog):
    GET   /api/skills                  -> SkillListResponse        (SKIL-01)
    POST  /api/skills/sync             -> SkillSyncResponse        (SKIL-02)
    PATCH /api/skills/{name}/autonomy  -> SkillAutonomyResponse    (SKIL-03)

Endpoints (Phase 14 — read-time-computed analytics):
    GET   /api/skills/usage            -> SkillUsageResponse       (SKIL-04)
    GET   /api/skills/{name}/cost      -> SkillCostResponse        (SKIL-05)
    GET   /api/skills/{name}/latency   -> SkillLatencyResponse     (SKIL-06)
    GET   /api/skills/{name}/runs      -> SkillRunsResponse        (SKIL-07)

D-01 deviation: SKIL-04 lives at /api/skills/usage to preserve the existing
/api/skills catalog endpoint consumed by SkillsRegistry.tsx.

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
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select, text
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.api.schemas.skills import (
    SkillAutonomyPatch,
    SkillAutonomyResponse,
    SkillListResponse,
    SkillRange,
    SkillRow,
    SkillRunRow,
    SkillRunsResponse,
    SkillSparklineRow,
    SkillSyncResponse,
    SkillUsageResponse,
    SkillUsageRow,
)
from cmc.core.paths import repo_root
from cmc.db import get_session
from cmc.db.models.skills import Skill
from cmc.skills.scanner import scan_all

router = APIRouter(tags=["skills"])

_SKILL_NAME_RE = re.compile(r"^[a-zA-Z0-9_-]+$")

# Phase 14 — range -> days. Copied (not imported) from cost.py:46 so router
# files stay independent. SkillRange narrows to 14d|30d, but the dict carries
# all four for parity with cost.py and forward compat.
_RANGE_TO_DAYS: dict[str, int] = {"1d": 1, "7d": 7, "14d": 14, "30d": 30}


def _range_start(range_: str) -> datetime:
    """Return the inclusive lower bound for the range filter (UTC, naive).

    Mirrors cost.py:48 — same convention used by token_usage.day (DATE) and
    otel_events.ts (datetime stored as naive-UTC).
    """
    return datetime.now(UTC).replace(tzinfo=None) - timedelta(days=_RANGE_TO_DAYS[range_])


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


# ===== Phase 14 — read-time analytics endpoints (SKIL-04, SKIL-07) =========
#
# Pitfall 1 (RESEARCH §"Common Pitfalls"): event_name is stored BARE post
# prefix-strip — SQL filters use 'skill_activated', NOT 'claude_code.skill_activated'.

# SKIL-04: top-N skills with per-day sparkline. Per RESEARCH lines 504-531.
# Two-CTE pattern: per_day groups by (skill, day); totals applies LIMIT :limit
# then LEFT JOIN per_day expands the sparkline rows.
_USAGE_TOP_SQL = text("""
    WITH per_day AS (
      SELECT
        attrs_skill_name AS skill_name,
        STRFTIME('%Y-%m-%d', ts, 'localtime') AS day,
        COUNT(*) AS invocations
      FROM otel_events
      WHERE event_name = 'skill_activated'
        AND attrs_skill_name IS NOT NULL
        AND ts >= datetime(:since)
      GROUP BY skill_name, day
    ),
    totals AS (
      SELECT skill_name, SUM(invocations) AS total
      FROM per_day
      GROUP BY skill_name
      ORDER BY total DESC
      LIMIT :limit
    )
    SELECT
      t.skill_name,
      t.total,
      p.day,
      p.invocations
    FROM totals t
    LEFT JOIN per_day p ON p.skill_name = t.skill_name
    ORDER BY t.total DESC, p.day ASC
""")

# SKIL-07: recent invocations of a single skill, ts DESC, cwd LEFT-JOINed.
# request_id extracted via json_each + stringValue (Pitfall 3); LEFT JOIN
# sessions (orphan events keep cwd='<unknown>' via COALESCE).
_RUNS_SQL = text("""
    SELECT
      o.ts,
      o.session_id,
      COALESCE(s.cwd, '<unknown>') AS cwd,
      (SELECT json_extract(value, '$.value.stringValue')
         FROM json_each(json_extract(o.body, '$.record.attributes'))
        WHERE json_extract(value, '$.key') = 'request_id'
        LIMIT 1) AS request_id
    FROM otel_events o
    LEFT JOIN sessions s ON s.session_id = o.session_id
    WHERE o.event_name = 'skill_activated'
      AND o.attrs_skill_name = :name
    ORDER BY o.ts DESC
    LIMIT :limit
""")


@router.get("/skills/usage", response_model=SkillUsageResponse)
async def skills_usage(
    db: AsyncSession = Depends(get_session),
    range_: SkillRange = Query("14d", alias="range"),
    limit: int = Query(10, ge=1, le=50),
) -> SkillUsageResponse:
    """SKIL-04: top-N skills by invocation count + per-day sparkline buckets.

    D-01 deviation: this lives at /api/skills/usage (not /api/skills?range=)
    to preserve the existing /api/skills catalog endpoint consumed by
    SkillsRegistry.tsx.

    Empty range returns 200 with rows=[], NOT 404.
    Range Literal validation produces 422 on mismatch (e.g. ?range=2d).
    """
    since_dt = _range_start(range_)
    rows = (await db.execute(
        _USAGE_TOP_SQL, {"since": since_dt.isoformat(), "limit": limit}
    )).mappings().all()

    # Group flat rows -> {skill_name: SkillUsageRow(total, sparkline=[...])}
    # The SQL ORDER BY (t.total DESC, p.day ASC) means rows arrive in the
    # order we want to emit, so a dict preserves it (Py3.7+ insertion order).
    groups: dict[str, SkillUsageRow] = {}
    for r in rows:
        name = r["skill_name"]
        if name not in groups:
            groups[name] = SkillUsageRow(
                skill_name=name,
                total=int(r["total"] or 0),
                sparkline=[],
            )
        # day/invocations may be None when the LEFT JOIN found no per_day
        # buckets — defensive guard, though the inner CTE GROUPs ensure
        # every totals row has at least one matching per_day row.
        if r["day"] is not None:
            groups[name].sparkline.append(SkillSparklineRow(
                day=r["day"],
                invocations=int(r["invocations"] or 0),
            ))

    return SkillUsageResponse(range=range_, rows=list(groups.values()))


@router.get("/skills/{name}/runs", response_model=SkillRunsResponse)
async def skill_runs(
    name: str,
    db: AsyncSession = Depends(get_session),
    limit: int = Query(20, ge=1, le=200),
) -> SkillRunsResponse:
    """SKIL-07: recent invocations of `name` ordered ts DESC.

    Validation:
      - name must match `^[a-zA-Z0-9_-]+$` AND not contain `..` (V12).
      - limit clamped 1..200 (200 is a safety cap; runs is a tail so a
        generous limit is fine).

    Returns ts/session_id/cwd/request_id rows. cwd LEFT-JOINs the sessions
    table; orphan events surface cwd='<unknown>'.
    """
    if not _SKILL_NAME_RE.match(name) or ".." in name:
        raise HTTPException(status_code=400, detail="invalid skill name")

    rows = (await db.execute(
        _RUNS_SQL, {"name": name, "limit": limit}
    )).mappings().all()

    out: list[SkillRunRow] = []
    for r in rows:
        ts = r["ts"]
        # SQLite returns ts as either str or datetime depending on column adapter
        # path; coerce to datetime for the response model.
        if isinstance(ts, str):
            ts = datetime.fromisoformat(ts)
        out.append(SkillRunRow(
            ts=ts,
            session_id=r["session_id"],
            cwd=r["cwd"] or "<unknown>",
            request_id=r["request_id"],
        ))
    return SkillRunsResponse(name=name, rows=out)
