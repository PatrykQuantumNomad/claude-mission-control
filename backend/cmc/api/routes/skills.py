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
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select, text
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.api.schemas.skills import (
    DeltaPill,
    SkillAutonomyPatch,
    SkillAutonomyResponse,
    SkillCostResponse,
    SkillLatencyResponse,
    SkillListResponse,
    SkillProjectRow,
    SkillProjectsResponse,
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
from cmc.core.time import now_utc
from cmc.db import get_session
from cmc.db.models.skills import Skill
from cmc.pricing import compute_cost, load_rates
from cmc.skills.scanner import scan_all

router = APIRouter(tags=["skills"])

_SKILL_NAME_RE = re.compile(r"^[a-zA-Z0-9_-]+$")

# Phase 14 — range -> days. Copied (not imported) from cost.py:46 so router
# files stay independent. SkillRange narrows to 14d|30d, but the dict carries
# all four for parity with cost.py and forward compat.
_RANGE_TO_DAYS: dict[str, int] = {"1d": 1, "7d": 7, "14d": 14, "30d": 30}

# Phase 19 — SKLP-09: 7d-vs-prev-7d delta window. Hardcoded per ROADMAP success
# criterion #3; the user-facing range toggle (14d/30d) on the primary chart is
# independent of this delta window. If a future requirement wants 30d-vs-prev-30d,
# change this constant — but Phase 19 ships 7d. NEVER bind to ?range= (Pitfall 2:
# SkillRange is Literal["14d", "30d"] — it never narrows to 7d).
_DELTA_WINDOW_DAYS = 7

# Phase 19 — SKLP-10: badge thresholds (in days). All UTC arithmetic via SQLite
# datetime('now', '-N days') — DST-safe (ROADMAP success criterion #5). NEVER
# add the 'localtime' modifier to badge SQL.
_BADGE_NEW_DAYS = 7        # first_activated_at within last 7d -> 'new_this_week'
_BADGE_DORMANT_DAYS = 30   # last_activated_at older than 30d -> 'dormant'
_BADGE_COLDSTART_DAYS = 14 # skill must be >= 14d old to be eligible for 'dormant'


def _range_start(range_: str) -> datetime:
    """Return the inclusive lower bound for the range filter (UTC, naive).

    Mirrors cost.py:48 — same convention used by token_usage.day (DATE) and
    otel_events.ts (datetime stored as naive-UTC).
    """
    return datetime.now(UTC).replace(tzinfo=None) - timedelta(days=_RANGE_TO_DAYS[range_])


def _build_delta_pill(curr: Decimal | int, prev: Decimal | int) -> DeltaPill:
    """SKLP-09: build the DeltaPill DTO from raw curr/prev values.

    Server is the source of truth for direction + delta_pct (RESEARCH §"Pattern 3");
    the frontend never re-derives sign or percentage. Decimal arithmetic preserves
    cost precision; the int path coerces transparently via str().

    delta_pct == None when prev == 0 — avoids div-by-zero / +inf rendering;
    the UI surfaces '—' instead of fabricating a percentage.
    """
    curr_d = Decimal(str(curr))
    prev_d = Decimal(str(prev))
    delta = curr_d - prev_d
    delta_pct: float | None = None if prev_d == 0 else float(delta) / float(prev_d)
    direction: Literal["up", "down", "flat"]
    if delta > 0:
        direction = "up"
    elif delta < 0:
        direction = "down"
    else:
        direction = "flat"
    return DeltaPill(
        curr=curr_d,
        prev=prev_d,
        delta=delta,
        delta_pct=delta_pct,
        direction=direction,
    )


def _coerce_db_datetime(value: object) -> datetime | None:
    """Best-effort coercion of a SQLite-returned timestamp to a naive UTC datetime.

    SQLite returns either a `str` ISO-8601 form or a `datetime` depending on the
    column adapter path; both flow through here. Returns None when the input is
    None/empty.
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        # SQLAlchemy hands back naive UTC for our schema; preserve as-is.
        return value
    if isinstance(value, str):
        if not value:
            return None
        # SQLite "YYYY-MM-DD HH:MM:SS[.SSS]" form — fromisoformat handles both
        # T-separator and space-separator since Python 3.11.
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None


def _derive_badges(
    first_at: datetime | None,
    last_at: datetime | None,
    days_since_first: int | None,
    now: datetime,
) -> list[Literal["new_this_week", "dormant"]]:
    """SKLP-10: badge classification with cold-start suppression.

    All inputs are UTC-naive datetimes (or None when no activations exist).
    `now` is sourced from cmc.core.time.now_utc() at call sites — NEVER
    the deprecated stdlib naive-UTC factory (POLI-06 ban). The DST-safety
    property is that `now`, `first_at`, and `last_at` are all UTC-anchored,
    so (now - first_at).days is invariant under local-time DST transitions.

    Cold-start suppression: a skill <14d old NEVER gets 'dormant' (avoids
    the false-positive case where a skill activated yesterday and not since
    crosses the 30d threshold trivially via reversed test seeding — the
    days_since_first guard is the structural defence).
    """
    badges: list[Literal["new_this_week", "dormant"]] = []
    if first_at is not None and (now - first_at).days < _BADGE_NEW_DAYS:
        badges.append("new_this_week")
    if (
        last_at is not None
        and (now - last_at).days >= _BADGE_DORMANT_DAYS
        and days_since_first is not None
        and days_since_first >= _BADGE_COLDSTART_DAYS
    ):
        badges.append("dormant")
    return badges


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

# SKLP-09 / SKLP-10 (Phase 19): per-skill curr/prev count + first/last activation.
# Single query with three CTEs:
#   curr — count of skill_activated events in last 7d, per skill.
#   prev — count in 14d-to-7d-ago window (the prev-period mirror), per skill.
#   activations — MIN(ts), MAX(ts), and days_since_first per skill (for badges).
# All three windows use SQLite datetime('now', '-N days') in UTC (DST-safe per
# ROADMAP success criterion #5; NEVER 'localtime'). Returns one row per skill
# that has activations across either window OR a known first_at.
_USAGE_DELTA_BADGE_SQL = text("""
    WITH curr AS (
      SELECT attrs_skill_name AS skill_name, COUNT(*) AS curr_count
      FROM otel_events
      WHERE event_name = 'skill_activated'
        AND attrs_skill_name IS NOT NULL
        AND ts >= datetime('now', '-7 days')
      GROUP BY attrs_skill_name
    ),
    prev AS (
      SELECT attrs_skill_name AS skill_name, COUNT(*) AS prev_count
      FROM otel_events
      WHERE event_name = 'skill_activated'
        AND attrs_skill_name IS NOT NULL
        AND ts >= datetime('now', '-14 days')
        AND ts <  datetime('now', '-7 days')
      GROUP BY attrs_skill_name
    ),
    activations AS (
      SELECT
        attrs_skill_name AS skill_name,
        MIN(ts) AS first_at,
        MAX(ts) AS last_at,
        CAST((julianday('now') - julianday(MIN(ts))) AS INTEGER) AS days_since_first
      FROM otel_events
      WHERE event_name = 'skill_activated'
        AND attrs_skill_name IS NOT NULL
      GROUP BY attrs_skill_name
    )
    SELECT
      COALESCE(c.skill_name, p.skill_name, a.skill_name) AS skill_name,
      COALESCE(c.curr_count, 0) AS curr_count,
      COALESCE(p.prev_count, 0) AS prev_count,
      a.first_at,
      a.last_at,
      a.days_since_first
    FROM curr c
    FULL OUTER JOIN prev p ON p.skill_name = c.skill_name
    LEFT JOIN activations a
      ON a.skill_name = COALESCE(c.skill_name, p.skill_name)
""")

# SQLite < 3.39 lacks FULL OUTER JOIN. Replacement: two LEFT JOINs UNIONed —
# (curr LEFT JOIN prev) UNION (prev LEFT JOIN curr WHERE curr is NULL). The
# pragma_compile_options check is too costly per request, so this fallback
# always runs in the actual handler; the FULL OUTER form above is preserved
# only as a doc-shape reference. The union variant is what we use:
_USAGE_DELTA_BADGE_SQL_PORTABLE = text("""
    WITH curr AS (
      SELECT attrs_skill_name AS skill_name, COUNT(*) AS curr_count
      FROM otel_events
      WHERE event_name = 'skill_activated'
        AND attrs_skill_name IS NOT NULL
        AND ts >= datetime('now', '-7 days')
      GROUP BY attrs_skill_name
    ),
    prev AS (
      SELECT attrs_skill_name AS skill_name, COUNT(*) AS prev_count
      FROM otel_events
      WHERE event_name = 'skill_activated'
        AND attrs_skill_name IS NOT NULL
        AND ts >= datetime('now', '-14 days')
        AND ts <  datetime('now', '-7 days')
      GROUP BY attrs_skill_name
    ),
    activations AS (
      SELECT
        attrs_skill_name AS skill_name,
        MIN(ts) AS first_at,
        MAX(ts) AS last_at,
        CAST((julianday('now') - julianday(MIN(ts))) AS INTEGER) AS days_since_first
      FROM otel_events
      WHERE event_name = 'skill_activated'
        AND attrs_skill_name IS NOT NULL
      GROUP BY attrs_skill_name
    ),
    skills_seen AS (
      SELECT skill_name FROM curr
      UNION
      SELECT skill_name FROM prev
      UNION
      SELECT skill_name FROM activations
    )
    SELECT
      s.skill_name AS skill_name,
      COALESCE(c.curr_count, 0) AS curr_count,
      COALESCE(p.prev_count, 0) AS prev_count,
      a.first_at AS first_at,
      a.last_at AS last_at,
      a.days_since_first AS days_since_first
    FROM skills_seen s
    LEFT JOIN curr c ON c.skill_name = s.skill_name
    LEFT JOIN prev p ON p.skill_name = s.skill_name
    LEFT JOIN activations a ON a.skill_name = s.skill_name
""")


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
    limit: int = Query(10, ge=1, le=200),
) -> SkillUsageResponse:
    """SKIL-04 + SKLP-09 + SKLP-10: top-N skills with sparkline, delta pill, badges.

    D-01 deviation: this lives at /api/skills/usage (not /api/skills?range=)
    to preserve the existing /api/skills catalog endpoint consumed by
    SkillsRegistry.tsx.

    Empty range returns 200 with rows=[], NOT 404.
    Range Literal validation produces 422 on mismatch (e.g. ?range=2d).

    Phase 19 additions:
      - usage_delta: 7d-vs-prev-7d invocation count delta (DeltaPill;
        independent of the user-facing 14d/30d range — Pitfall 2). Always
        emitted, even when prev/curr are 0 (DeltaPill with delta_pct=None).
      - badges: 'new_this_week' (first activation within last 7d UTC) and/or
        'dormant' (last activation older than 30d UTC AND skill is >= 14d old —
        cold-start suppression). All thresholds use SQLite datetime('now',
        '-N days') in UTC (DST-safe per ROADMAP success criterion #5).
    """
    since_dt = _range_start(range_)
    rows = (await db.execute(
        _USAGE_TOP_SQL, {"since": since_dt.isoformat(), "limit": limit}
    )).mappings().all()

    # Run the SKLP-09/10 companion query once — it is range-INDEPENDENT
    # (always 7d-vs-prev-7d for delta + lifetime MIN/MAX for badges).
    delta_rows = (await db.execute(_USAGE_DELTA_BADGE_SQL_PORTABLE)).mappings().all()
    delta_by_name: dict[str, dict] = {dr["skill_name"]: dict(dr) for dr in delta_rows}

    now = now_utc()

    # Group flat rows -> {skill_name: SkillUsageRow(total, sparkline=[...])}
    # The SQL ORDER BY (t.total DESC, p.day ASC) means rows arrive in the
    # order we want to emit, so a dict preserves it (Py3.7+ insertion order).
    groups: dict[str, SkillUsageRow] = {}
    for r in rows:
        name = r["skill_name"]
        if name not in groups:
            db_meta = delta_by_name.get(name, {})
            curr_count = int(db_meta.get("curr_count") or 0)
            prev_count = int(db_meta.get("prev_count") or 0)
            first_at = _coerce_db_datetime(db_meta.get("first_at"))
            last_at = _coerce_db_datetime(db_meta.get("last_at"))
            days_since_first = (
                int(db_meta["days_since_first"])
                if db_meta.get("days_since_first") is not None
                else None
            )
            groups[name] = SkillUsageRow(
                skill_name=name,
                total=int(r["total"] or 0),
                sparkline=[],
                usage_delta=_build_delta_pill(curr_count, prev_count),
                badges=_derive_badges(first_at, last_at, days_since_first, now),
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


# ===== Phase 14 — SKIL-05 (cost) + SKIL-06 (latency) ======================
#
# SKLP-05: low-sample badge threshold. Server-side source of truth (D-04 +
# Pitfall 6 — frontend re-asserts in the panel for defense-in-depth, but
# the server MUST emit low_sample: bool on every response).
MIN_LATENCY_SAMPLES = 30


# ---- SKIL-05 (cost) ------------------------------------------------------
#
# DUAL-PATH per D-02 (defensive against TENTATIVE LOCK-9 request_id presence):
#
#   Path R (request-scoped): self-JOIN otel_events (skill_activated) ↔
#     otel_events (api_request) on (session_id, request_id) extracted via
#     json_each. Tokens read from api_request stringValue and CAST INTEGER.
#   Path S (session-scoped fallback): SUM sessions.tokens_* for sessions
#     that fired this skill. Mirrors cost.py:147 _BREAKDOWN_BY_SKILL_SQL
#     but filtered to a single :name.
#
# Decision rule: if Path R yields any matched tokens (sum > 0) -> Path R +
# cost_attribution='request'. Else -> Path S + cost_attribution='session'.

# Path R — request-scoped totals (single skill).
_COST_REQUEST_SCOPED_SQL = text("""
    WITH skill_events AS (
      SELECT
        o.session_id,
        o.attrs_skill_name AS skill_name,
        (SELECT json_extract(value, '$.value.stringValue')
           FROM json_each(json_extract(o.body, '$.record.attributes'))
          WHERE json_extract(value, '$.key') = 'request_id'
          LIMIT 1) AS request_id
      FROM otel_events o
      WHERE o.event_name = 'skill_activated'
        AND o.attrs_skill_name = :name
        AND o.ts >= datetime(:since)
    ),
    api_req_events AS (
      SELECT
        o.session_id,
        (SELECT json_extract(value, '$.value.stringValue')
           FROM json_each(json_extract(o.body, '$.record.attributes'))
          WHERE json_extract(value, '$.key') = 'request_id'
          LIMIT 1) AS request_id,
        CAST((SELECT json_extract(value, '$.value.stringValue')
              FROM json_each(json_extract(o.body, '$.record.attributes'))
             WHERE json_extract(value, '$.key') = 'input_tokens'
             LIMIT 1) AS INTEGER) AS input_tokens,
        CAST((SELECT json_extract(value, '$.value.stringValue')
              FROM json_each(json_extract(o.body, '$.record.attributes'))
             WHERE json_extract(value, '$.key') = 'output_tokens'
             LIMIT 1) AS INTEGER) AS output_tokens,
        CAST((SELECT json_extract(value, '$.value.stringValue')
              FROM json_each(json_extract(o.body, '$.record.attributes'))
             WHERE json_extract(value, '$.key') = 'cache_read_tokens'
             LIMIT 1) AS INTEGER) AS cache_read,
        CAST((SELECT json_extract(value, '$.value.stringValue')
              FROM json_each(json_extract(o.body, '$.record.attributes'))
             WHERE json_extract(value, '$.key') = 'cache_creation_tokens'
             LIMIT 1) AS INTEGER) AS cache_create,
        (SELECT json_extract(value, '$.value.stringValue')
           FROM json_each(json_extract(o.body, '$.record.attributes'))
          WHERE json_extract(value, '$.key') = 'model'
          LIMIT 1) AS model
      FROM otel_events o
      WHERE o.event_name = 'api_request'
        AND o.ts >= datetime(:since)
    )
    SELECT
      COALESCE(SUM(r.input_tokens), 0)  AS tokens_input,
      COALESCE(SUM(r.output_tokens), 0) AS tokens_output,
      COALESCE(SUM(r.cache_read), 0)    AS tokens_cache_read,
      0 AS tokens_cache_create_5m,
      COALESCE(SUM(r.cache_create), 0)  AS tokens_cache_create_1h,
      MAX(r.model) AS model
    FROM skill_events s
    LEFT JOIN api_req_events r
      ON r.session_id = s.session_id
     AND r.request_id IS NOT NULL
     AND r.request_id = s.request_id
""")

# Path S — session-scoped totals (single skill). Mirrors cost.py:147 but
# filters to one skill name. MAX(s.model) used as pricing-key (model is
# effectively constant per session).
_COST_SESSION_SCOPED_SQL = text("""
    SELECT
      COALESCE(SUM(s.tokens_input), 0)     AS tokens_input,
      COALESCE(SUM(s.tokens_output), 0)    AS tokens_output,
      COALESCE(SUM(s.tokens_cache_read), 0) AS tokens_cache_read,
      0                                    AS tokens_cache_create_5m,
      0                                    AS tokens_cache_create_1h,
      MAX(s.model)                         AS model
    FROM otel_events o
    JOIN sessions s ON s.session_id = o.session_id
    WHERE o.event_name = 'skill_activated'
      AND o.attrs_skill_name = :name
      AND o.ts >= datetime(:since)
""")

# Trend (per-day) — TWO variants. Per plan/RESEARCH critical note: trend MUST
# derive from the SELECTED branch (whichever Path R or Path S won the main
# request-vs-session test) so the Decimal sum invariant
# `sum(trend.daily_cost) == cost_usd` holds. Running an independent dual-path
# test per bucket would let different days land on different branches.
_COST_TREND_REQUEST_SCOPED_SQL = text("""
    WITH skill_events AS (
      SELECT
        o.ts AS skill_ts,
        o.session_id,
        (SELECT json_extract(value, '$.value.stringValue')
           FROM json_each(json_extract(o.body, '$.record.attributes'))
          WHERE json_extract(value, '$.key') = 'request_id'
          LIMIT 1) AS request_id
      FROM otel_events o
      WHERE o.event_name = 'skill_activated'
        AND o.attrs_skill_name = :name
        AND o.ts >= datetime(:since)
    ),
    api_req_events AS (
      SELECT
        o.session_id,
        (SELECT json_extract(value, '$.value.stringValue')
           FROM json_each(json_extract(o.body, '$.record.attributes'))
          WHERE json_extract(value, '$.key') = 'request_id'
          LIMIT 1) AS request_id,
        CAST((SELECT json_extract(value, '$.value.stringValue')
              FROM json_each(json_extract(o.body, '$.record.attributes'))
             WHERE json_extract(value, '$.key') = 'input_tokens'
             LIMIT 1) AS INTEGER) AS input_tokens,
        CAST((SELECT json_extract(value, '$.value.stringValue')
              FROM json_each(json_extract(o.body, '$.record.attributes'))
             WHERE json_extract(value, '$.key') = 'output_tokens'
             LIMIT 1) AS INTEGER) AS output_tokens,
        CAST((SELECT json_extract(value, '$.value.stringValue')
              FROM json_each(json_extract(o.body, '$.record.attributes'))
             WHERE json_extract(value, '$.key') = 'cache_read_tokens'
             LIMIT 1) AS INTEGER) AS cache_read,
        CAST((SELECT json_extract(value, '$.value.stringValue')
              FROM json_each(json_extract(o.body, '$.record.attributes'))
             WHERE json_extract(value, '$.key') = 'cache_creation_tokens'
             LIMIT 1) AS INTEGER) AS cache_create,
        (SELECT json_extract(value, '$.value.stringValue')
           FROM json_each(json_extract(o.body, '$.record.attributes'))
          WHERE json_extract(value, '$.key') = 'model'
          LIMIT 1) AS model
      FROM otel_events o
      WHERE o.event_name = 'api_request'
        AND o.ts >= datetime(:since)
    )
    SELECT
      STRFTIME('%Y-%m-%d', s.skill_ts, 'localtime') AS day,
      COALESCE(SUM(r.input_tokens), 0)  AS tokens_input,
      COALESCE(SUM(r.output_tokens), 0) AS tokens_output,
      COALESCE(SUM(r.cache_read), 0)    AS tokens_cache_read,
      0 AS tokens_cache_create_5m,
      COALESCE(SUM(r.cache_create), 0)  AS tokens_cache_create_1h,
      MAX(r.model) AS model
    FROM skill_events s
    LEFT JOIN api_req_events r
      ON r.session_id = s.session_id
     AND r.request_id IS NOT NULL
     AND r.request_id = s.request_id
    GROUP BY day
    ORDER BY day ASC
""")

# Session-scoped trend — group sessions.tokens_* by skill_event day-bucket.
# Each skill_activated day is one bucket; per-session token sums are attributed
# fully to the day on which the matching skill_activated row landed.
_COST_TREND_SESSION_SCOPED_SQL = text("""
    SELECT
      STRFTIME('%Y-%m-%d', o.ts, 'localtime') AS day,
      COALESCE(SUM(s.tokens_input), 0)     AS tokens_input,
      COALESCE(SUM(s.tokens_output), 0)    AS tokens_output,
      COALESCE(SUM(s.tokens_cache_read), 0) AS tokens_cache_read,
      0                                    AS tokens_cache_create_5m,
      0                                    AS tokens_cache_create_1h,
      MAX(s.model)                         AS model
    FROM otel_events o
    JOIN sessions s ON s.session_id = o.session_id
    WHERE o.event_name = 'skill_activated'
      AND o.attrs_skill_name = :name
      AND o.ts >= datetime(:since)
    GROUP BY day
    ORDER BY day ASC
""")


# ---- SKLP-09 (Phase 19): cost delta CTEs (curr 7d vs prev 7d) -------------
#
# Mirrors the dual-path pattern of _COST_REQUEST_SCOPED_SQL / _COST_SESSION_SCOPED_SQL
# but with explicit windows: curr = [now - 7d, now); prev = [now - 14d, now - 7d).
# All windows use SQLite datetime('now', '-N days') in UTC — DST-safe (ROADMAP
# success criterion #5; NEVER 'localtime'). Window bounds are LITERAL (no :since
# bind) so the 7d delta horizon is a structural property of the SQL, not a
# caller decision — Pitfall 2 (do NOT bind to ?range=).
#
# Path R curr (request-scoped, [now-7d, now)).
_COST_DELTA_CURR_REQUEST_SQL = text("""
    WITH skill_events AS (
      SELECT
        o.session_id,
        (SELECT json_extract(value, '$.value.stringValue')
           FROM json_each(json_extract(o.body, '$.record.attributes'))
          WHERE json_extract(value, '$.key') = 'request_id'
          LIMIT 1) AS request_id
      FROM otel_events o
      WHERE o.event_name = 'skill_activated'
        AND o.attrs_skill_name = :name
        AND o.ts >= datetime('now', '-7 days')
    ),
    api_req_events AS (
      SELECT
        o.session_id,
        (SELECT json_extract(value, '$.value.stringValue')
           FROM json_each(json_extract(o.body, '$.record.attributes'))
          WHERE json_extract(value, '$.key') = 'request_id'
          LIMIT 1) AS request_id,
        CAST((SELECT json_extract(value, '$.value.stringValue')
              FROM json_each(json_extract(o.body, '$.record.attributes'))
             WHERE json_extract(value, '$.key') = 'input_tokens'
             LIMIT 1) AS INTEGER) AS input_tokens,
        CAST((SELECT json_extract(value, '$.value.stringValue')
              FROM json_each(json_extract(o.body, '$.record.attributes'))
             WHERE json_extract(value, '$.key') = 'output_tokens'
             LIMIT 1) AS INTEGER) AS output_tokens,
        CAST((SELECT json_extract(value, '$.value.stringValue')
              FROM json_each(json_extract(o.body, '$.record.attributes'))
             WHERE json_extract(value, '$.key') = 'cache_read_tokens'
             LIMIT 1) AS INTEGER) AS cache_read,
        CAST((SELECT json_extract(value, '$.value.stringValue')
              FROM json_each(json_extract(o.body, '$.record.attributes'))
             WHERE json_extract(value, '$.key') = 'cache_creation_tokens'
             LIMIT 1) AS INTEGER) AS cache_create,
        (SELECT json_extract(value, '$.value.stringValue')
           FROM json_each(json_extract(o.body, '$.record.attributes'))
          WHERE json_extract(value, '$.key') = 'model'
          LIMIT 1) AS model
      FROM otel_events o
      WHERE o.event_name = 'api_request'
        AND o.ts >= datetime('now', '-7 days')
    )
    SELECT
      COALESCE(SUM(r.input_tokens), 0)  AS tokens_input,
      COALESCE(SUM(r.output_tokens), 0) AS tokens_output,
      COALESCE(SUM(r.cache_read), 0)    AS tokens_cache_read,
      0 AS tokens_cache_create_5m,
      COALESCE(SUM(r.cache_create), 0)  AS tokens_cache_create_1h,
      MAX(r.model) AS model
    FROM skill_events s
    LEFT JOIN api_req_events r
      ON r.session_id = s.session_id
     AND r.request_id IS NOT NULL
     AND r.request_id = s.request_id
""")

# Path R prev (request-scoped, [now-14d, now-7d)).
_COST_DELTA_PREV_REQUEST_SQL = text("""
    WITH skill_events AS (
      SELECT
        o.session_id,
        (SELECT json_extract(value, '$.value.stringValue')
           FROM json_each(json_extract(o.body, '$.record.attributes'))
          WHERE json_extract(value, '$.key') = 'request_id'
          LIMIT 1) AS request_id
      FROM otel_events o
      WHERE o.event_name = 'skill_activated'
        AND o.attrs_skill_name = :name
        AND o.ts >= datetime('now', '-14 days')
        AND o.ts <  datetime('now', '-7 days')
    ),
    api_req_events AS (
      SELECT
        o.session_id,
        (SELECT json_extract(value, '$.value.stringValue')
           FROM json_each(json_extract(o.body, '$.record.attributes'))
          WHERE json_extract(value, '$.key') = 'request_id'
          LIMIT 1) AS request_id,
        CAST((SELECT json_extract(value, '$.value.stringValue')
              FROM json_each(json_extract(o.body, '$.record.attributes'))
             WHERE json_extract(value, '$.key') = 'input_tokens'
             LIMIT 1) AS INTEGER) AS input_tokens,
        CAST((SELECT json_extract(value, '$.value.stringValue')
              FROM json_each(json_extract(o.body, '$.record.attributes'))
             WHERE json_extract(value, '$.key') = 'output_tokens'
             LIMIT 1) AS INTEGER) AS output_tokens,
        CAST((SELECT json_extract(value, '$.value.stringValue')
              FROM json_each(json_extract(o.body, '$.record.attributes'))
             WHERE json_extract(value, '$.key') = 'cache_read_tokens'
             LIMIT 1) AS INTEGER) AS cache_read,
        CAST((SELECT json_extract(value, '$.value.stringValue')
              FROM json_each(json_extract(o.body, '$.record.attributes'))
             WHERE json_extract(value, '$.key') = 'cache_creation_tokens'
             LIMIT 1) AS INTEGER) AS cache_create,
        (SELECT json_extract(value, '$.value.stringValue')
           FROM json_each(json_extract(o.body, '$.record.attributes'))
          WHERE json_extract(value, '$.key') = 'model'
          LIMIT 1) AS model
      FROM otel_events o
      WHERE o.event_name = 'api_request'
        AND o.ts >= datetime('now', '-14 days')
        AND o.ts <  datetime('now', '-7 days')
    )
    SELECT
      COALESCE(SUM(r.input_tokens), 0)  AS tokens_input,
      COALESCE(SUM(r.output_tokens), 0) AS tokens_output,
      COALESCE(SUM(r.cache_read), 0)    AS tokens_cache_read,
      0 AS tokens_cache_create_5m,
      COALESCE(SUM(r.cache_create), 0)  AS tokens_cache_create_1h,
      MAX(r.model) AS model
    FROM skill_events s
    LEFT JOIN api_req_events r
      ON r.session_id = s.session_id
     AND r.request_id IS NOT NULL
     AND r.request_id = s.request_id
""")

# Path S curr (session-scoped, [now-7d, now)).
_COST_DELTA_CURR_SESSION_SQL = text("""
    SELECT
      COALESCE(SUM(s.tokens_input), 0)     AS tokens_input,
      COALESCE(SUM(s.tokens_output), 0)    AS tokens_output,
      COALESCE(SUM(s.tokens_cache_read), 0) AS tokens_cache_read,
      0                                    AS tokens_cache_create_5m,
      0                                    AS tokens_cache_create_1h,
      MAX(s.model)                         AS model
    FROM otel_events o
    JOIN sessions s ON s.session_id = o.session_id
    WHERE o.event_name = 'skill_activated'
      AND o.attrs_skill_name = :name
      AND o.ts >= datetime('now', '-7 days')
""")

# Path S prev (session-scoped, [now-14d, now-7d)).
_COST_DELTA_PREV_SESSION_SQL = text("""
    SELECT
      COALESCE(SUM(s.tokens_input), 0)     AS tokens_input,
      COALESCE(SUM(s.tokens_output), 0)    AS tokens_output,
      COALESCE(SUM(s.tokens_cache_read), 0) AS tokens_cache_read,
      0                                    AS tokens_cache_create_5m,
      0                                    AS tokens_cache_create_1h,
      MAX(s.model)                         AS model
    FROM otel_events o
    JOIN sessions s ON s.session_id = o.session_id
    WHERE o.event_name = 'skill_activated'
      AND o.attrs_skill_name = :name
      AND o.ts >= datetime('now', '-14 days')
      AND o.ts <  datetime('now', '-7 days')
""")


async def _compute_cost_delta(
    db: AsyncSession,
    *,
    name: str,
    attribution: Literal["request", "session"],
    rates: dict,
) -> DeltaPill:
    """SKLP-09: 7d-vs-prev-7d cost delta for one skill.

    Pulls curr (last 7d) and prev (14d-to-7d-ago) token sums via the dual-path
    SQL above, computes Decimal cost via cmc.pricing.compute_cost (the same
    read-time path the top-line cost number uses), and returns a DeltaPill.

    The branch (request vs. session) MIRRORS the main handler's choice — keeps
    the delta's source consistent with cost_usd. Empty period -> Decimal(0)
    on that side, naturally producing direction='flat' or 'up'/'down' as
    appropriate, with delta_pct=None when prev=0.

    All windows use SQLite datetime('now', '-N days') in UTC (DST-safe per
    ROADMAP success criterion #5; the curr/prev SQL fragments NEVER use the
    'localtime' modifier).
    """
    if attribution == "request":
        curr_sql = _COST_DELTA_CURR_REQUEST_SQL
        prev_sql = _COST_DELTA_PREV_REQUEST_SQL
    else:
        curr_sql = _COST_DELTA_CURR_SESSION_SQL
        prev_sql = _COST_DELTA_PREV_SESSION_SQL

    curr_rows = (await db.execute(curr_sql, {"name": name})).mappings().all()
    prev_rows = (await db.execute(prev_sql, {"name": name})).mappings().all()
    curr_row = curr_rows[0] if curr_rows else None
    prev_row = prev_rows[0] if prev_rows else None

    def _row_to_cost(row: dict | None) -> Decimal:
        if row is None:
            return Decimal(0)
        model = row["model"] or "<unknown>"
        return compute_cost(
            model,
            int(row["tokens_input"] or 0),
            int(row["tokens_output"] or 0),
            int(row["tokens_cache_read"] or 0),
            int(row["tokens_cache_create_5m"] or 0),
            int(row["tokens_cache_create_1h"] or 0),
            rates,
        )

    curr_cost = _row_to_cost(curr_row)
    prev_cost = _row_to_cost(prev_row)
    return _build_delta_pill(curr_cost, prev_cost)


# ---- SKIL-06 (latency) ---------------------------------------------------
#
# Window-CTE percentile pattern adapted from observability._TOOL_LATENCY_SQL.
# duration_ms extracted from body.record.attributes via json_each + stringValue
# + CAST INTEGER (Pitfall 3). WHERE duration_ms IS NOT NULL filters absent
# values per D-03 (LOCK-3 TENTATIVE).
_LATENCY_SQL = text("""
    WITH events AS (
      SELECT
        o.attrs_skill_name AS skill_name,
        CAST(
          (SELECT json_extract(value, '$.value.stringValue')
             FROM json_each(json_extract(o.body, '$.record.attributes'))
            WHERE json_extract(value, '$.key') = 'duration_ms'
            LIMIT 1)
          AS INTEGER
        ) AS duration_ms
      FROM otel_events o
      WHERE o.event_name = 'skill_activated'
        AND o.attrs_skill_name = :name
        AND o.ts >= datetime(:since)
    ),
    ranked AS (
      SELECT skill_name, duration_ms,
        ROW_NUMBER() OVER (PARTITION BY skill_name ORDER BY duration_ms) AS rnk,
        COUNT(*) OVER (PARTITION BY skill_name) AS n
      FROM events
      WHERE duration_ms IS NOT NULL
    ),
    agg AS (
      SELECT
        skill_name,
        COUNT(*) AS sample_count,
        MAX(duration_ms) AS max_ms
      FROM events
      WHERE duration_ms IS NOT NULL
      GROUP BY skill_name
    ),
    p50 AS (
      SELECT skill_name, duration_ms AS p50_ms
      FROM ranked
      WHERE rnk = MAX(CAST(n * 0.5 AS INTEGER), 1)
    ),
    p95 AS (
      SELECT skill_name, duration_ms AS p95_ms
      FROM ranked
      WHERE rnk = MAX(CAST(n * 0.95 AS INTEGER), 1)
    )
    SELECT a.skill_name, a.sample_count, a.max_ms, p50.p50_ms, p95.p95_ms
    FROM agg a
    LEFT JOIN p50 ON p50.skill_name = a.skill_name
    LEFT JOIN p95 ON p95.skill_name = a.skill_name
""")

# Error count: skill_activated events whose status attribute is in
# {'error','failure','cancel'} per SPIKE.md LOCK-8.
_ERROR_COUNT_SQL = text("""
    SELECT COUNT(*) AS n
    FROM otel_events o
    WHERE o.event_name = 'skill_activated'
      AND o.attrs_skill_name = :name
      AND o.ts >= datetime(:since)
      AND (SELECT json_extract(value, '$.value.stringValue')
             FROM json_each(json_extract(o.body, '$.record.attributes'))
            WHERE json_extract(value, '$.key') = 'status'
            LIMIT 1) IN ('error', 'failure', 'cancel')
""")


def _coerce_effective_from(rates: dict, model: str) -> date | None:
    """Pull effective_from out of a rates dict and coerce to date if needed."""
    if model not in rates:
        return None
    ef = rates[model].get("effective_from")
    if ef is None:
        return None
    return ef.date() if isinstance(ef, datetime) else ef


@router.get("/skills/{name}/cost", response_model=SkillCostResponse)
async def skill_cost(
    name: str,
    db: AsyncSession = Depends(get_session),
    range_: SkillRange = Query("14d", alias="range"),
) -> SkillCostResponse:
    """SKIL-05: per-skill cost with dual-path attribution (D-02).

    Tries request-scoped JOIN first (skill_activated.request_id ↔
    api_request.request_id within the same session). If that yields any
    matched tokens, returns Path R numbers + cost_attribution='request'.
    Else falls back to session-scoped attribution (Path S) +
    cost_attribution='session'. The 14-day trend SQL derives from the
    SELECTED branch so the Decimal sum invariant
    `sum(trend.daily_cost) == cost_usd` holds.
    """
    if not _SKILL_NAME_RE.match(name) or ".." in name:
        raise HTTPException(status_code=400, detail="invalid skill name")

    since_dt = _range_start(range_)
    since_iso = since_dt.isoformat()

    # Try Path R first.
    r_rows = (await db.execute(
        _COST_REQUEST_SCOPED_SQL, {"name": name, "since": since_iso}
    )).mappings().all()
    r_row = r_rows[0] if r_rows else None
    r_total = (
        int(r_row["tokens_input"] or 0) + int(r_row["tokens_output"] or 0)
        + int(r_row["tokens_cache_read"] or 0)
        + int(r_row["tokens_cache_create_5m"] or 0)
        + int(r_row["tokens_cache_create_1h"] or 0)
    ) if r_row else 0

    if r_total > 0:
        attribution = "request"
        chosen_row = r_row
        trend_sql = _COST_TREND_REQUEST_SCOPED_SQL
    else:
        # Path S fallback. NOTE: even when this branch wins, the response
        # tokens come from sessions.tokens_* — same skill firing twice in
        # one session WILL show identical numbers (Phase 13 LOCK-9 baseline).
        attribution = "session"
        s_rows = (await db.execute(
            _COST_SESSION_SCOPED_SQL, {"name": name, "since": since_iso}
        )).mappings().all()
        chosen_row = s_rows[0] if s_rows else None
        trend_sql = _COST_TREND_SESSION_SCOPED_SQL

    rates = await load_rates(db)

    # SKLP-09: per-period cost delta (independent of ?range=). Compute curr/prev
    # using whichever attribution path won the main test — request-scoped if it
    # found tokens, else session-scoped — so the delta is consistent with the
    # top-line cost_usd's source. Always emitted, including in the empty case.
    rates_for_delta = await load_rates(db)
    cost_delta = await _compute_cost_delta(
        db, name=name, attribution=attribution, rates=rates_for_delta,
    )

    # Empty case: no skill_activated events at all -> return zeros + empty trend.
    if chosen_row is None or all((chosen_row[k] or 0) == 0 for k in (
        "tokens_input", "tokens_output", "tokens_cache_read",
        "tokens_cache_create_5m", "tokens_cache_create_1h",
    )):
        return SkillCostResponse(
            range=range_,
            name=name,
            rates_as_of=None,
            cost_usd=Decimal(0),
            cost_attribution=attribution,
            trend=[],
            cost_delta=cost_delta,
        )

    model_for_pricing = chosen_row["model"] or "<unknown>"
    cost = compute_cost(
        model_for_pricing,
        int(chosen_row["tokens_input"] or 0),
        int(chosen_row["tokens_output"] or 0),
        int(chosen_row["tokens_cache_read"] or 0),
        int(chosen_row["tokens_cache_create_5m"] or 0),
        int(chosen_row["tokens_cache_create_1h"] or 0),
        rates,
    )

    # Trend — sum the per-day buckets from the SELECTED branch.
    trend_rows = (await db.execute(
        trend_sql, {"name": name, "since": since_iso}
    )).mappings().all()
    trend: list[SkillSparklineRow] = []
    for tr in trend_rows:
        bucket_model = tr["model"] or model_for_pricing
        bucket_cost = compute_cost(
            bucket_model,
            int(tr["tokens_input"] or 0),
            int(tr["tokens_output"] or 0),
            int(tr["tokens_cache_read"] or 0),
            int(tr["tokens_cache_create_5m"] or 0),
            int(tr["tokens_cache_create_1h"] or 0),
            rates,
        )
        trend.append(SkillSparklineRow(
            day=tr["day"],
            invocations=0,  # cost trend's purpose is sparkline cost, not invocations
            cost_usd=bucket_cost,
        ))

    rates_as_of = _coerce_effective_from(rates, model_for_pricing)

    return SkillCostResponse(
        range=range_,
        name=name,
        rates_as_of=rates_as_of,
        tokens_input=int(chosen_row["tokens_input"] or 0),
        tokens_output=int(chosen_row["tokens_output"] or 0),
        tokens_cache_read=int(chosen_row["tokens_cache_read"] or 0),
        tokens_cache_create_5m=int(chosen_row["tokens_cache_create_5m"] or 0),
        tokens_cache_create_1h=int(chosen_row["tokens_cache_create_1h"] or 0),
        cost_usd=cost,
        cost_attribution=attribution,
        trend=trend,
        cost_delta=cost_delta,
    )


@router.get("/skills/{name}/latency", response_model=SkillLatencyResponse)
async def skill_latency(
    name: str,
    db: AsyncSession = Depends(get_session),
    range_: SkillRange = Query("14d", alias="range"),
) -> SkillLatencyResponse:
    """SKIL-06: per-skill p50/p95/max latency + error rate + low_sample.

    sample_count=0 returns 200 with all percentiles None + low_sample=True
    (D-03 — LOCK-3 TENTATIVE duration_ms presence is empty-state, NOT failure).
    """
    if not _SKILL_NAME_RE.match(name) or ".." in name:
        raise HTTPException(status_code=400, detail="invalid skill name")

    since_dt = _range_start(range_)
    since_iso = since_dt.isoformat()

    rows = (await db.execute(
        _LATENCY_SQL, {"name": name, "since": since_iso}
    )).mappings().all()
    err_rows = (await db.execute(
        _ERROR_COUNT_SQL, {"name": name, "since": since_iso}
    )).mappings().all()
    error_count = int(err_rows[0]["n"]) if err_rows else 0

    if not rows:
        # No skill_activated events with non-NULL duration_ms in the window.
        return SkillLatencyResponse(
            range=range_,
            name=name,
            sample_count=0,
            p50_ms=None,
            p95_ms=None,
            max_ms=None,
            error_count=error_count,
            error_rate=0.0,
            low_sample=True,
        )

    row = rows[0]
    sample_count = int(row["sample_count"] or 0)
    error_rate = (error_count / sample_count) if sample_count > 0 else 0.0
    return SkillLatencyResponse(
        range=range_,
        name=name,
        sample_count=sample_count,
        p50_ms=int(row["p50_ms"]) if row["p50_ms"] is not None else None,
        p95_ms=int(row["p95_ms"]) if row["p95_ms"] is not None else None,
        max_ms=int(row["max_ms"]) if row["max_ms"] is not None else None,
        error_count=error_count,
        error_rate=error_rate,
        low_sample=sample_count < MIN_LATENCY_SAMPLES,
    )


# ===== Phase 19 — SKLP-08 (per-project breakdown) =========================
#
# Per-project rollup of one skill's runs. Joins otel_events.skill_activated
# -> sessions on session_id, GROUPs by sessions.project_key, EXCLUDES the
# empty-key sentinel (legacy/missing-cwd rows).
#
# Response shape carries project_key only — NO cwd, NO path, NO display_path.
# This is the structural side of ROADMAP success criterion #1; the matching
# `test_skill_projects_no_path_leakage` test asserts it at runtime.
#
# Percentile pattern mirrors _LATENCY_SQL (window-function CTE), but the
# PARTITION key is project_key instead of skill_name. Token sums are
# session-scoped (mirrors _COST_SESSION_SCOPED_SQL) — there's no
# request-scoped path here because the rollup is across many sessions per
# project; per-request token correlation would multiply the SQL cost
# without buying meaningfully different numbers at the project granularity.
_PROJECTS_PERCENTILE_SQL = text("""
    WITH events AS (
      SELECT
        s.project_key AS project_key,
        CAST(
          (SELECT json_extract(value, '$.value.stringValue')
             FROM json_each(json_extract(o.body, '$.record.attributes'))
            WHERE json_extract(value, '$.key') = 'duration_ms'
            LIMIT 1)
          AS INTEGER
        ) AS duration_ms
      FROM otel_events o
      JOIN sessions s ON s.session_id = o.session_id
      WHERE o.event_name = 'skill_activated'
        AND o.attrs_skill_name = :name
        AND o.ts >= datetime(:since)
        AND s.project_key != ''
    ),
    ranked AS (
      SELECT project_key, duration_ms,
        ROW_NUMBER() OVER (PARTITION BY project_key ORDER BY duration_ms) AS rnk,
        COUNT(*) OVER (PARTITION BY project_key) AS n
      FROM events
      WHERE duration_ms IS NOT NULL
    ),
    agg AS (
      SELECT
        project_key,
        COUNT(*) AS count
      FROM events
      GROUP BY project_key
    ),
    p50 AS (
      SELECT project_key, duration_ms AS p50_ms
      FROM ranked
      WHERE rnk = MAX(CAST(n * 0.5 AS INTEGER), 1)
    ),
    p95 AS (
      SELECT project_key, duration_ms AS p95_ms
      FROM ranked
      WHERE rnk = MAX(CAST(n * 0.95 AS INTEGER), 1)
    )
    SELECT a.project_key, a.count, p50.p50_ms, p95.p95_ms
    FROM agg a
    LEFT JOIN p50 ON p50.project_key = a.project_key
    LEFT JOIN p95 ON p95.project_key = a.project_key
    ORDER BY a.count DESC
    LIMIT 100
""")

# Per-project session-scoped token totals + a representative model for pricing.
# Tokens are summed over the DISTINCT sessions that fired this skill in the
# window (same SUM as Path S in skill_cost, but GROUP BY project_key).
# Pitfall: a session firing the same skill N times still contributes ONCE to
# the per-project token sum — the inner DISTINCT subquery enforces this.
_PROJECTS_TOKEN_SQL = text("""
    WITH skill_sessions AS (
      SELECT DISTINCT s.session_id, s.project_key, s.model,
                      s.tokens_input, s.tokens_output, s.tokens_cache_read,
                      s.tokens_cache_create_5m, s.tokens_cache_create_1h
      FROM otel_events o
      JOIN sessions s ON s.session_id = o.session_id
      WHERE o.event_name = 'skill_activated'
        AND o.attrs_skill_name = :name
        AND o.ts >= datetime(:since)
        AND s.project_key != ''
    )
    SELECT
      project_key,
      COALESCE(SUM(tokens_input), 0)            AS tokens_input,
      COALESCE(SUM(tokens_output), 0)           AS tokens_output,
      COALESCE(SUM(tokens_cache_read), 0)       AS tokens_cache_read,
      COALESCE(SUM(tokens_cache_create_5m), 0)  AS tokens_cache_create_5m,
      COALESCE(SUM(tokens_cache_create_1h), 0)  AS tokens_cache_create_1h,
      MAX(model)                                AS model
    FROM skill_sessions
    GROUP BY project_key
""")


@router.get("/skills/{name}/projects", response_model=SkillProjectsResponse)
async def skill_projects(
    name: str,
    db: AsyncSession = Depends(get_session),
    range_: SkillRange = Query("14d", alias="range"),
) -> SkillProjectsResponse:
    """SKLP-08: per-project breakdown of a skill's runs.

    Joins otel_events.skill_activated -> sessions on session_id, groups
    by sessions.project_key (excluding the empty-string sentinel for
    legacy/missing-cwd rows). Returns {count, p50_ms, p95_ms, cost_usd,
    cost_attribution, low_sample} per project.

    Cost is computed read-time via cmc.pricing.compute_cost — NEVER
    stored as $ in DB (v1.1 invariant).

    Response shape carries project_key only — NO cwd, NO path, NO
    display_path. ROADMAP success criterion #1; structurally enforced
    by the SkillProjectRow schema AND the test_skill_projects_no_path_leakage
    runtime assertion.

    Validation:
      - name must match `^[a-zA-Z0-9_-]+$` AND not contain `..` (V12) -> 400
      - skill must exist in the registry -> else 404 (consistent with the
        plan's must_have: "rejects unknown skills with 404")
      - range Literal "14d"|"30d" -> 422 on mismatch (7d reserved for the
        Plan 19-03 delta CTE, NOT exposed here)

    Empty-rows case (skill exists, no events / all events on empty
    project_key sessions): returns 200 with rows=[].
    """
    if not _SKILL_NAME_RE.match(name) or ".." in name:
        raise HTTPException(status_code=400, detail="invalid skill name")

    # Skill registry existence check — unknown skill is 404, NOT empty rows.
    skill_exists = (await db.execute(
        select(Skill).where(Skill.name == name)
    )).scalar_one_or_none()
    if skill_exists is None:
        raise HTTPException(status_code=404, detail=f"skill {name!r} not found")

    since_iso = _range_start(range_).isoformat()

    perc_rows = (await db.execute(
        _PROJECTS_PERCENTILE_SQL, {"name": name, "since": since_iso}
    )).mappings().all()
    if not perc_rows:
        return SkillProjectsResponse(range=range_, name=name, rows=[])

    tok_rows = (await db.execute(
        _PROJECTS_TOKEN_SQL, {"name": name, "since": since_iso}
    )).mappings().all()
    tok_by_pk: dict[str, dict] = {r["project_key"]: dict(r) for r in tok_rows}

    rates = await load_rates(db)

    rows: list[SkillProjectRow] = []
    for r in perc_rows:
        pk = r["project_key"]
        count = int(r["count"] or 0)
        tok = tok_by_pk.get(pk, {})
        model_for_pricing = tok.get("model") or "<unknown>"
        cost = compute_cost(
            model_for_pricing,
            int(tok.get("tokens_input") or 0),
            int(tok.get("tokens_output") or 0),
            int(tok.get("tokens_cache_read") or 0),
            int(tok.get("tokens_cache_create_5m") or 0),
            int(tok.get("tokens_cache_create_1h") or 0),
            rates,
        )
        # cost_attribution: "session" when pricing was applied (model in rates);
        # "approximate" when the model is missing/unpriced — compute_cost
        # returns Decimal(0) AND increments cmc.pricing.unpriced_tokens.
        attribution: str = "session" if model_for_pricing in rates else "approximate"
        rows.append(SkillProjectRow(
            project_key=pk,
            count=count,
            p50_ms=int(r["p50_ms"]) if r["p50_ms"] is not None else None,
            p95_ms=int(r["p95_ms"]) if r["p95_ms"] is not None else None,
            cost_usd=cost,
            cost_attribution=attribution,
            low_sample=count < MIN_LATENCY_SAMPLES,
        ))

    return SkillProjectsResponse(range=range_, name=name, rows=rows)
