---
phase: 19-skills-per-project-deltas-badges
plan: 02
type: execute
wave: 2
# why_this_split: Pure SKLP-08 surface — adds new endpoint + DTO + tests. Files modified are disjoint from Plan 03 (deltas/badges extend existing endpoints) so the two run in parallel.
depends_on: ["19-01"]
files_modified:
  - backend/cmc/api/routes/skills.py
  - backend/cmc/api/schemas/skills.py
  - backend/tests/test_skills_router.py
autonomous: true
requirements: [SKLP-08]
must_haves:
  truths:
    - "GET /api/skills/{name}/projects returns 200 with shape { name, range, rows: [SkillProjectRow] } where each row has project_key, count, p50_ms, p95_ms, cost_usd, cost_attribution, low_sample — and NO field named cwd, path, display_path, or any other filesystem-shaped key (ROADMAP success criterion #1)."
    - "Rows are grouped by sessions.project_key (joined via session_id), excluding rows where project_key = '' (the empty sentinel for unknown projects)."
    - "Cost is computed read-time via cmc.pricing.compute_cost — never read from a stored $ column (v1.1 invariant preserved)."
    - "low_sample boolean is true when row.count < MIN_LATENCY_SAMPLES (30) — same threshold as SKIL-06 latency endpoint."
    - "Endpoint validates {name} via the existing _SKILL_NAME_RE regex and rejects unknown skills with 404 (mirrors /skills/{name}/cost behavior)."
    - "Response is empty (rows=[]) for skills with zero activations or unknown skills (after the 404 path)."
    - "Per-project SQL uses datetime('now', '-N days') in UTC — never '-N days', 'localtime' (DST safety inherited from SKIL-04..07 idiom)."
    - "Range parameter accepts only '14d' or '30d' (SkillRange Literal, Pitfall 2 — no '7d' because that's reserved for the Plan 19-03 delta CTE)."
  artifacts:
    - path: "backend/cmc/api/schemas/skills.py"
      provides: "SkillProjectRow + SkillProjectsResponse Pydantic schemas"
      contains: "class SkillProjectRow"
      contains_also: "class SkillProjectsResponse"
    - path: "backend/cmc/api/routes/skills.py"
      provides: "GET /api/skills/{name}/projects endpoint"
      contains: "/skills/{name}/projects"
      contains_also: "response_model=SkillProjectsResponse"
    - path: "backend/tests/test_skills_router.py"
      provides: "4+ new tests for the projects endpoint"
      contains: "test_skill_projects"
  key_links:
    - from: "backend/cmc/api/routes/skills.py"
      to: "backend/cmc/db/models/sessions.py (project_key column)"
      via: "SQL JOIN otel_events ON sessions.session_id, GROUP BY sessions.project_key"
      pattern: "GROUP BY sessions.project_key|GROUP BY s.project_key"
    - from: "backend/cmc/api/routes/skills.py"
      to: "backend/cmc/api/schemas/skills.py"
      via: "from cmc.api.schemas.skills import SkillProjectsResponse, SkillProjectRow"
      pattern: "SkillProjectsResponse|SkillProjectRow"
---

<objective>
Ship SKLP-08: a per-project breakdown endpoint for any skill, returning a sortable rollup of {count, p50_ms, p95_ms, cost_usd} grouped by `sessions.project_key`. NO filesystem path leakage in the response shape.

Purpose: ROADMAP success criterion #1 — "User opens `/skills/<name>` and sees a sortable per-project table (cost / latency / count columns) populated from `GET /api/skills/{name}/projects`, where projects are keyed by `project_key` (sha1[:12] of `realpath(cwd.rstrip('/'))`) — never raw `cwd` — and the response shape leaks no filesystem paths."

Output:
- `backend/cmc/api/schemas/skills.py` — EXTENDED with `SkillProjectRow` and `SkillProjectsResponse` Pydantic models. `SkillProjectRow` fields: `project_key: str`, `count: int`, `p50_ms: int | None`, `p95_ms: int | None`, `cost_usd: Decimal`, `cost_attribution: Literal["session", "approximate"]`, `low_sample: bool`. NO `cwd` field, NO `path` field, NO `display_path` field — explicitly enumerated to make the path-leakage prohibition structurally enforced.
- `backend/cmc/api/routes/skills.py` — EXTENDED with `@router.get("/skills/{name}/projects", response_model=SkillProjectsResponse)`. Reuses `_SKILL_NAME_RE` validation, `_RANGE_TO_DAYS` map, `_range_start` helper, MIN_LATENCY_SAMPLES const, and `cmc.pricing.compute_cost` for read-time cost.
- `backend/tests/test_skills_router.py` — EXTENDED with 4+ tests:
  1. `test_skill_projects_happy_path`: seed multiple sessions across 2 different project_keys + skill_activated events; assert response groups correctly.
  2. `test_skill_projects_empty_for_unknown_skill`: returns 404 (consistent with /cost endpoint).
  3. `test_skill_projects_no_path_leakage`: PARSES the JSON response and asserts no row contains keys named 'cwd', 'path', 'display_path', or any value matching `r'^/'` (filesystem-shape regex). LOAD-BEARING test — this is the structural guard for ROADMAP success criterion #1.
  4. `test_skill_projects_low_sample_flag`: row with count < 30 has low_sample=True; row with count >= 30 has low_sample=False.
  5. `test_skill_projects_excludes_empty_project_key`: a session with project_key='' (legacy/missing-cwd) is excluded from the rollup.
</objective>

<execution_context>
@/Users/patrykattc/.claude/get-shit-done/workflows/execute-plan.md
@/Users/patrykattc/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/19-skills-per-project-deltas-badges/19-RESEARCH.md
@.planning/phases/19-skills-per-project-deltas-badges/19-01-migration-and-project-key-PLAN.md

# Existing files this plan touches (read before editing)
@backend/cmc/api/routes/skills.py
@backend/cmc/api/schemas/skills.py
@backend/tests/test_skills_router.py
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add SkillProjectRow + SkillProjectsResponse schemas with path-leakage discipline</name>
  <files>backend/cmc/api/schemas/skills.py</files>
  <action>
Add to `backend/cmc/api/schemas/skills.py` (after the existing `SkillRunsResponse` definition):

```python
class SkillProjectRow(BaseModel):
    """One row of SkillProjectsResponse — per-project rollup of a skill's runs.

    SKLP-08 invariant: the response shape leaks no filesystem paths.
    The ONLY project-shaped value is project_key (sha1[:12] of
    realpath(cwd)). NEVER add a 'cwd', 'path', 'display_path', or any
    other filesystem-shaped field to this schema. ROADMAP success
    criterion #1 is structural — enforced here AND in the
    no-path-leakage test.
    """
    project_key: str  # 12-char hex; '' is excluded from rollups by the SQL
    count: int
    p50_ms: int | None  # null when no completed runs (duration_ms IS NULL)
    p95_ms: int | None
    cost_usd: Decimal  # serialized as JSON string per Pydantic v2 default
    cost_attribution: Literal["session", "approximate"]
    low_sample: bool  # count < MIN_LATENCY_SAMPLES (30)


class SkillProjectsResponse(BaseModel):
    """SKLP-08 — per-project breakdown for one skill on /skills/{name}."""
    name: str
    range: SkillRange
    rows: list[SkillProjectRow]
```

Imports to verify exist at the top of the file (add if missing): `from decimal import Decimal`, `from typing import Literal`, `from pydantic import BaseModel`. The file already imports `BaseModel` per the existing schemas — only add what's missing.

Append `SkillProjectRow` and `SkillProjectsResponse` to any module-level `__all__` if present.
  </action>
  <verify>
cd backend && uv run python -c "from cmc.api.schemas.skills import SkillProjectsResponse, SkillProjectRow; r = SkillProjectRow(project_key='a'*12, count=5, p50_ms=100, p95_ms=200, cost_usd='0.01', cost_attribution='session', low_sample=True); print(r.model_dump_json())"
Expected: prints valid JSON; cost_usd appears as a string '0.01' (Pydantic v2 Decimal-as-string default).

cd backend && uv run pytest --collect-only tests/test_skills_router.py -q 2>&1 | tail -5
Expected: collection succeeds (no import errors from the schema additions).
  </verify>
  <done>
SkillProjectRow + SkillProjectsResponse exist, importable, and explicitly omit any cwd/path/display_path fields.
Decimal cost_usd serializes as a JSON string (matches existing SkillCostResponse precedent).
  </done>
</task>

<task type="auto">
  <name>Task 2: Add GET /api/skills/{name}/projects endpoint + 4+ tests</name>
  <files>backend/cmc/api/routes/skills.py, backend/tests/test_skills_router.py</files>
  <action>
**Step 2a — Endpoint in `backend/cmc/api/routes/skills.py`:**

Add a new endpoint after the existing `skill_latency` endpoint (around line 746+):

```python
@router.get("/skills/{name}/projects", response_model=SkillProjectsResponse)
async def skill_projects(
    name: str,
    range: SkillRange = "14d",
    db: AsyncSession = Depends(get_db),
) -> SkillProjectsResponse:
    """SKLP-08: per-project breakdown of a skill's runs.

    Joins otel_events.skill_activated -> sessions on session_id, groups
    by sessions.project_key (excluding empty-key legacy rows). Returns
    {count, p50_ms, p95_ms, cost_usd, cost_attribution, low_sample}
    per project. Cost is computed read-time via compute_cost — NEVER
    stored as $ in DB (v1.1 invariant).

    Response shape carries project_key only — NO cwd, NO path, NO
    display_path. ROADMAP success criterion #1.
    """
    if not _SKILL_NAME_RE.match(name):
        raise HTTPException(404, detail="skill not found")

    # Verify the skill exists in the registry (consistent with /cost behavior)
    skill_exists = await db.execute(
        sa.select(sa.func.count()).select_from(Skill).where(Skill.name == name)
    )
    if skill_exists.scalar_one() == 0:
        raise HTTPException(404, detail=f"skill {name!r} not found")

    since = _range_start(range)

    # Per-project aggregation. Window-percentile pattern mirrors SKIL-06
    # latency router (ranked CTE + ROW_NUMBER + COUNT(*) OVER PARTITION BY).
    # Excludes legacy sessions whose project_key='' (Pitfall: empty-sentinel
    # rows would collapse into a phantom "" project bucket).
    rollup_sql = sa.text("""
        WITH skill_runs AS (
            SELECT
                o.session_id,
                CAST(o.attrs_duration_ms AS INTEGER) AS duration_ms
            FROM otel_events o
            WHERE o.event_name = 'skill_activated'
              AND o.attrs_skill_name = :name
              AND o.ts >= :since
        ),
        joined AS (
            SELECT
                s.project_key,
                s.model,
                sr.duration_ms,
                COALESCE(s.tokens_input, 0) + COALESCE(s.tokens_output, 0)
                  + COALESCE(s.tokens_cache_read, 0)
                  + COALESCE(s.tokens_cache_create_5m, 0)
                  + COALESCE(s.tokens_cache_create_1h, 0) AS total_tokens,
                COALESCE(s.tokens_input, 0) AS input_tokens,
                COALESCE(s.tokens_output, 0) AS output_tokens,
                COALESCE(s.tokens_cache_read, 0) AS cache_read_tokens,
                COALESCE(s.tokens_cache_create_5m, 0) AS cache_5m_tokens,
                COALESCE(s.tokens_cache_create_1h, 0) AS cache_1h_tokens
            FROM skill_runs sr
            JOIN sessions s ON s.session_id = sr.session_id
            WHERE s.project_key != ''
        )
        SELECT
            project_key,
            COUNT(*) AS count,
            -- Percentiles via approximate ordering (SQLite lacks PERCENTILE_CONT;
            -- this matches the SKIL-06 idiom — see skills.py:746+ skill_latency).
            -- For now compute via Python after fetching durations per group.
            GROUP_CONCAT(duration_ms) AS durations_csv,
            MAX(model) AS model,
            SUM(total_tokens) AS total_tokens,
            SUM(input_tokens) AS input_tokens,
            SUM(output_tokens) AS output_tokens,
            SUM(cache_read_tokens) AS cache_read_tokens,
            SUM(cache_5m_tokens) AS cache_5m_tokens,
            SUM(cache_1h_tokens) AS cache_1h_tokens
        FROM joined
        GROUP BY project_key
        ORDER BY count DESC
        LIMIT 100
    """)

    # NOTE: If the existing skill_latency endpoint uses a window-function
    # CTE for percentiles (ROW_NUMBER + COUNT(*) OVER PARTITION BY), prefer
    # that pattern over GROUP_CONCAT-then-Python — read skills.py:746-797
    # before finalizing this query and align with whichever idiom already
    # ships. Either approach is correct; alignment matters for reviewer
    # cognitive load.

    result = await db.execute(rollup_sql, {"name": name, "since": since.isoformat()})
    raw_rows = result.mappings().all()

    rows: list[SkillProjectRow] = []
    for r in raw_rows:
        durations = [int(d) for d in (r["durations_csv"] or "").split(",") if d]
        durations.sort()
        n = len(durations)
        p50 = durations[max(int(n * 0.5) - 1, 0)] if n else None
        p95 = durations[max(int(n * 0.95) - 1, 0)] if n else None

        # Cost via compute_cost (read-time, v1.1 invariant). cost_attribution
        # is 'session' when the model is known and pricing exists; otherwise
        # 'approximate' (mirrors SkillCostResponse precedent — read
        # skill_cost endpoint to copy the exact branch).
        from cmc.pricing import compute_cost  # lazy import; heavy module
        cost_usd, attribution = compute_cost(
            model=r["model"],
            input_tokens=r["input_tokens"],
            output_tokens=r["output_tokens"],
            cache_read_tokens=r["cache_read_tokens"],
            cache_create_5m_tokens=r["cache_5m_tokens"],
            cache_create_1h_tokens=r["cache_1h_tokens"],
        )

        rows.append(SkillProjectRow(
            project_key=r["project_key"],
            count=r["count"],
            p50_ms=p50,
            p95_ms=p95,
            cost_usd=cost_usd,
            cost_attribution=attribution,
            low_sample=r["count"] < MIN_LATENCY_SAMPLES,
        ))

    return SkillProjectsResponse(name=name, range=range, rows=rows)
```

CRITICAL: Before finalizing the SQL, READ `backend/cmc/api/routes/skills.py:746-797` (the existing `skill_latency` endpoint). If it uses a window-function percentile CTE (`ROW_NUMBER() OVER (ORDER BY duration_ms)` + `COUNT(*) OVER ()`), copy that pattern instead of the GROUP_CONCAT-then-Python fallback shown above. The compute_cost signature must EXACTLY match how `skill_cost` (line 631+) invokes it — read that endpoint and mirror the kwarg names verbatim.

Imports to add at top of `skills.py` if not already present:
```python
from cmc.api.schemas.skills import SkillProjectRow, SkillProjectsResponse
```

**Step 2b — Tests in `backend/tests/test_skills_router.py`:**

Add 5 tests using the existing fixture pattern in this file. Read the file's existing fixtures (likely `seeded_app` or similar) before writing — match the fixture names verbatim.

```python
async def test_skill_projects_happy_path(seeded_app):
    """SKLP-08: per-project rollup groups runs by sessions.project_key."""
    # Seed: 2 sessions for project A (cwd='/tmp/proj-a'), 3 for project B,
    # all with skill_activated events for 'analyze'.
    # Assert: response.rows has 2 entries; counts are 2 and 3; project_keys
    # are sha1(realpath('/tmp/proj-a'))[:12] and sha1(realpath('/tmp/proj-b'))[:12].

async def test_skill_projects_unknown_skill_404(seeded_app):
    """Unknown skill name returns 404, not empty rows."""
    # GET /api/skills/no-such-skill/projects -> 404.

async def test_skill_projects_no_path_leakage(seeded_app):
    """ROADMAP success criterion #1: response leaks no filesystem paths."""
    # Seed 1 session + skill_activated event with cwd='/tmp/super/secret/path'.
    # GET /api/skills/{name}/projects.
    # For each row in response['rows']:
    #   assert 'cwd' not in row
    #   assert 'path' not in row
    #   assert 'display_path' not in row
    #   for value in row.values():
    #       if isinstance(value, str):
    #           assert not value.startswith('/'), f"{value!r} looks like a filesystem path"
    #           assert '/tmp/super/secret/path' not in value
    # LOAD-BEARING: this is the structural guard.

async def test_skill_projects_low_sample_flag(seeded_app):
    """low_sample=True when count < 30; False when count >= 30."""
    # Seed one project with 10 activations (low_sample=True),
    # another with 35 activations (low_sample=False).
    # Assert flags accordingly.

async def test_skill_projects_excludes_empty_project_key(seeded_app):
    """Sessions with project_key='' (legacy/missing-cwd) are excluded."""
    # Insert a session with project_key='' AND a normal session with a key.
    # Both have skill_activated events for the same skill.
    # Assert: response.rows has 1 entry (the keyed one); no '' bucket exists.
```

Use `cmc.core.time.now_utc` for any timestamp seeding (NOT `datetime.utcnow` — POLI-06 ban inherited).
  </action>
  <verify>
cd backend && uv run pytest tests/test_skills_router.py -v -k "projects"
Expected: 5 new tests pass.

cd backend && uv run pytest tests/test_skills_router.py -v
Expected: full skills router test file green (existing tests + new ones).

cd backend && uv run pytest --tb=no
Expected: passed >= 566 + Plan 19-01 tests + Plan 19-02 tests; failed == 0; warnings_datetime_utcnow == 0.

git grep -nE 'datetime\.utcnow|from datetime import .*utcnow' -- backend/cmc/api/routes/skills.py backend/cmc/api/schemas/skills.py backend/tests/test_skills_router.py
Expected: 0 matches in any line ADDED by this plan (existing matches if any are pre-existing and out of scope, but skills.py was already swept in Phase 18).

# Smoke-test the endpoint manually-style via pytest client:
cd backend && uv run python -c "
from fastapi.testclient import TestClient
# (Assumes test fixture infrastructure; just validates importability)
from cmc.api.routes.skills import skill_projects
print('endpoint importable:', skill_projects.__name__)
"
Expected: prints 'endpoint importable: skill_projects'.
  </verify>
  <done>
Endpoint registered, 200-OK on happy path, 404 on unknown skill.
no_path_leakage test passes — response shape carries only the enumerated keys.
low_sample flag correct at the 30-count threshold.
Empty project_key sessions excluded from the rollup.
Phase 18 BASELINE.md verifier preserved: pytest >= 566+, failed == 0, datetime.utcnow warnings == 0.
  </done>
</task>

</tasks>

<verification>
- All 5 new test_skill_projects_* tests pass.
- The no-path-leakage test programmatically asserts the absence of cwd/path/display_path keys AND the absence of any string values starting with `/` — load-bearing for ROADMAP success criterion #1.
- The endpoint validates name via _SKILL_NAME_RE, returns 404 for unknown skills, and returns empty rows[] for zero-activation skills.
- Cost is computed via cmc.pricing.compute_cost (read-time, no $ stored).
- Empty project_key rows are filtered by the SQL WHERE clause.
- Phase 18 BASELINE.md verifier rules preserved (pytest >= 566, failed == 0, datetime.utcnow warnings == 0).
</verification>

<success_criteria>
- ROADMAP success criterion #1 satisfied (per-project endpoint live, project_key-only response shape, no path leakage).
- SKLP-08 requirement: backend portion shipped; frontend wires up in Plan 19-04.
</success_criteria>

<output>
After completion, create `.planning/phases/19-skills-per-project-deltas-badges/19-02-SUMMARY.md`.
</output>
