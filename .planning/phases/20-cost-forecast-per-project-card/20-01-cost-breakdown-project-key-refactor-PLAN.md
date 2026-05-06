---
phase: 20-cost-forecast-per-project-card
plan: 01
type: execute
wave: 1
# why_this_split: Pure ANLY-07 backend SQL refactor. Tightly scoped: one SQL block + one Python coercion line + 3 new tests. Lands first so the structural path-leakage guard is in place before the forecast endpoint (Plan 02) is added to the same file. Wave 1 (no deps) — Wave 2 plans serialize on cost.py because of file ownership.
depends_on: []
files_modified:
  - backend/cmc/api/routes/cost.py
  - backend/tests/test_cost_router.py
  - backend/tests/test_cost_no_path_leakage.py
autonomous: true
requirements: [ANLY-07]
must_haves:
  truths:
    - "GET /api/cost/breakdown?dim=project&range=7d|30d returns rows whose `key` field is a 12-char hex project_key (sha1[:12] of realpath(cwd)) — NEVER a raw filesystem path, NEVER a `/`-prefixed string, NEVER the literal '<unknown>'."
    - "Sessions whose project_key='' (Phase 19 empty-key sentinel — legacy/missing-cwd) are EXCLUDED from the per-project breakdown rollup; they do not surface as a phantom '' bucket and do not surface as '<unknown>'."
    - "The path-leakage prohibition is enforced TWICE for /api/cost/breakdown?dim=project — once by the SQL (`WHERE s.project_key != ''` + `GROUP BY s.project_key`) and once by a programmatic key+value scan in `test_cost_no_path_leakage.py` (no key named cwd/path/display_path; no value matching `^/[A-Za-z]`)."
    - "dim=model and dim=skill rows are UNCHANGED by this plan — only the project SQL is refactored. The dim=model `test_breakdown_sums_to_summary` regression test still passes."
    - "Response shape (CostBreakdownResponse with rows: list[CostBreakdownRow], rates_as_of, total_usd, range, dim) is structurally UNCHANGED — only the semantics of the `key` field for dim=project shift from raw-cwd to 12-char hex."
    - "Total cost across the per-project breakdown (excluding empty-key rows) equals the cost summed across dim=model when both queries run over the same time window (multi-model approximation accepted per Pitfall 6 in 20-RESEARCH.md — single-model project rollup is exact)."
  artifacts:
    - path: "backend/cmc/api/routes/cost.py"
      provides: "_BREAKDOWN_BY_PROJECT_SQL refactored from cwd to project_key; comment block updated to cite Phase 19 SKLP-08 invariant + 20-RESEARCH.md Pitfall 1"
      contains: "GROUP BY s.project_key"
      contains_also: "s.project_key != ''"
    - path: "backend/tests/test_cost_router.py"
      provides: "Extended with test_breakdown_project_groups_by_project_key + test_breakdown_project_excludes_empty_key tests"
      contains: "test_breakdown_project_groups_by_project_key"
      contains_also: "test_breakdown_project_excludes_empty_key"
    - path: "backend/tests/test_cost_no_path_leakage.py"
      provides: "Net-new structural test mirroring test_skill_projects_no_path_leakage (Phase 19); programmatic key+value scan asserting no `cwd`/`path`/`display_path` keys and no `/`-prefixed values"
      contains: "test_cost_breakdown_project_no_path_leakage"
      min_lines: 40
  key_links:
    - from: "backend/cmc/api/routes/cost.py (_BREAKDOWN_BY_PROJECT_SQL)"
      to: "backend/cmc/db/models/sessions.py (project_key column added in migration 0003_project_key)"
      via: "SQL GROUP BY s.project_key + WHERE s.project_key != ''"
      pattern: "GROUP BY s\\.project_key"
    - from: "backend/tests/test_cost_no_path_leakage.py"
      to: "GET /api/cost/breakdown?dim=project response shape"
      via: "httpx.AsyncClient + programmatic key+value regex scan"
      pattern: "test_cost_breakdown_project_no_path_leakage"
---

<objective>
Refactor `_BREAKDOWN_BY_PROJECT_SQL` in `backend/cmc/api/routes/cost.py` to group by `sessions.project_key` (Phase 19 column) instead of raw `s.cwd`, and add a structural path-leakage test mirroring Phase 19's `test_skill_projects_no_path_leakage`. ROADMAP success criterion #3 demands the per-project card is "populated from the existing /api/cost/breakdown?dim=project endpoint" — but the existing SQL leaks raw filesystem paths in the `key` field. This plan closes that gap on the backend side BEFORE the frontend in Plan 03 ever renders the response.

Purpose: Make ANLY-07 shippable end-to-end with zero raw `cwd` strings reaching the wire. The path-leakage prohibition (locked in Phase 19 SKLP-08, applied to skills router but NOT cost router) extends to all per-project responses across the cost API. This plan extends the structural invariant.

Output:
- `backend/cmc/api/routes/cost.py` — `_BREAKDOWN_BY_PROJECT_SQL` SQL block (currently L166-178) refactored:
  - `COALESCE(s.cwd, '<unknown>') AS key` → `s.project_key AS key`
  - Add `WHERE s.started_at >= :since AND s.project_key != ''` (the existing WHERE keeps `started_at >= :since`, add the project_key filter)
  - `GROUP BY COALESCE(s.cwd, '<unknown>')` → `GROUP BY s.project_key`
  - Update the SQL block's leading comment from "By project: cwd rollup..." to cite the Phase 19 SKLP-08 invariant + the LITERAL `WHERE s.project_key != ''` filter rationale (Pitfall 1 from 20-RESEARCH.md). NO change to `cost_breakdown` handler logic; the response shape is structurally unchanged. NO change to `_BREAKDOWN_BY_MODEL_SQL` or `_BREAKDOWN_BY_SKILL_SQL`.
- `backend/tests/test_cost_router.py` — EXTENDED with:
  - `test_breakdown_project_groups_by_project_key`: seeds 2 sessions for project A (cwd='/tmp/proj-a'), 3 sessions for project B (cwd='/tmp/proj-b'), each with token totals; GETs `/api/cost/breakdown?dim=project&range=7d`; asserts `len(rows) == 2`, asserts each `row['key']` matches `r'^[0-9a-f]{12}$'` (12-char hex regex), asserts the keys equal `compute_project_key('/tmp/proj-a')` and `compute_project_key('/tmp/proj-b')`.
  - `test_breakdown_project_excludes_empty_key`: seeds 1 session with `project_key=''` AND 1 session with a normal key, both inside the range; asserts the response has `len(rows) == 1` and no row's key equals `''`.
- `backend/tests/test_cost_no_path_leakage.py` — NEW file; pattern verbatim from Phase 19's `test_skill_projects_no_path_leakage` (read `backend/tests/test_skills_router.py` for the test name's exact body). Body:
  - Seed one session with `cwd='/tmp/super/secret/leakage/path'` (longer-than-realpath canonical, ensures the path string is recognizable in any leaked field).
  - GET `/api/cost/breakdown?dim=project&range=7d`.
  - For each row in `payload['rows']`: assert `'cwd' not in row.keys()`, `'path' not in row.keys()`, `'display_path' not in row.keys()`. Then iterate every value in the row; for any string value, assert `not value.startswith('/')` AND assert the seeded path substring `'/tmp/super/secret'` is not anywhere in the value.
  - LOAD-BEARING: this is the structural guard for ROADMAP success criterion #3 — the same dual guard pattern Phase 19 SKLP-08 used (schema-by-enumeration is not available here because `CostBreakdownRow.key` is a generic string, so the structural test bears all the weight).
</objective>

<execution_context>
@/Users/patrykattc/work/git/claude-mission-control/.claude/get-shit-done/workflows/execute-plan.md
@/Users/patrykattc/work/git/claude-mission-control/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/20-cost-forecast-per-project-card/20-RESEARCH.md
@.planning/phases/19-skills-per-project-deltas-badges/19-02-skills-projects-endpoint-PLAN.md
@.planning/phases/19-skills-per-project-deltas-badges/19-02-SUMMARY.md

# Existing files this plan touches (read before editing)
@backend/cmc/api/routes/cost.py
@backend/cmc/api/schemas/cost.py
@backend/tests/test_cost_router.py
@backend/cmc/core/project_key.py
@backend/cmc/db/models/sessions.py
@backend/tests/test_skills_router.py

<interfaces>
<!-- Key types and invariants the executor needs. Use these directly — no codebase exploration needed. -->

From backend/cmc/api/routes/cost.py (current state, will be modified):
```python
# CURRENT (L166-178) — to be refactored:
_BREAKDOWN_BY_PROJECT_SQL = text("""
    SELECT
      COALESCE(s.cwd, '<unknown>')                AS key,
      COALESCE(SUM(s.tokens_input), 0)            AS tokens_input,
      COALESCE(SUM(s.tokens_output), 0)           AS tokens_output,
      COALESCE(SUM(s.tokens_cache_read), 0)       AS tokens_cache_read,
      0                                           AS tokens_cache_create_5m,
      0                                           AS tokens_cache_create_1h,
      MAX(s.model)                                AS model
    FROM sessions s
    WHERE s.started_at >= :since
    GROUP BY COALESCE(s.cwd, '<unknown>')
""")
```

From backend/cmc/core/project_key.py (Phase 19 helper — IMPORT, do not redefine):
```python
def compute_project_key(cwd: str | None) -> str:
    """sha1[:12] of realpath(cwd.rstrip('/')); '' for None or empty."""
```

From backend/cmc/api/schemas/cost.py (UNCHANGED — response shape is generic):
```python
class CostBreakdownRow(BaseModel):
    """Generic row used for skill/project breakdowns where the row key is dimension-specific."""
    key: str = Field(description="Model name, skill name, or project hash, depending on `dim`")
    tokens_input: int = 0
    tokens_output: int = 0
    tokens_cache_read: int = 0
    tokens_cache_create_5m: int = 0
    tokens_cache_create_1h: int = 0
    cost_usd: Decimal

class CostBreakdownResponse(BaseModel):
    range: CostRange
    dim: BreakdownDim
    rates_as_of: date | None
    total_usd: Decimal
    rows: list[CostBreakdownRow]
```

From backend/cmc/api/routes/skills.py (Phase 19 _PROJECTS_TOKEN_SQL — pattern to mirror, L1337-1359 per RESEARCH):
```sql
WITH skill_sessions AS (
  SELECT DISTINCT s.session_id, s.project_key, s.model, ...
  FROM otel_events o
  JOIN sessions s ON s.session_id = o.session_id
  WHERE ... AND s.project_key != ''
)
SELECT project_key, ..., MAX(model) AS model
FROM skill_sessions
GROUP BY project_key
```

From backend/tests/test_skills_router.py (Phase 19 test_skill_projects_no_path_leakage — pattern to mirror verbatim):
The test seeds a session with a recognizable cwd, hits the endpoint, and for every row:
- asserts no key named cwd/path/display_path/cwd_path
- iterates every string value: asserts not startswith('/'), asserts the seeded substring is not present
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Refactor _BREAKDOWN_BY_PROJECT_SQL to group by project_key + add 2 router tests</name>
  <files>backend/cmc/api/routes/cost.py, backend/tests/test_cost_router.py</files>
  <behavior>
    - Test 1 (test_breakdown_project_groups_by_project_key): Seed 2 sessions for cwd='/tmp/proj-a' and 3 sessions for cwd='/tmp/proj-b' (all within range), each with token totals; GET /api/cost/breakdown?dim=project&range=7d; assert len(rows) == 2; assert each row['key'] matches r'^[0-9a-f]{12}$'; assert keys equal compute_project_key('/tmp/proj-a') and compute_project_key('/tmp/proj-b'); assert no row['key'] is '/tmp/proj-a' or any path-shaped value.
    - Test 2 (test_breakdown_project_excludes_empty_key): Seed 1 session with project_key='' AND 1 session with a normal cwd (and thus a 12-char project_key); both within the range. Assert len(rows) == 1; assert no row's key is the empty string.
    - Existing dim=model test (test_breakdown_sums_to_summary at test_cost_router.py:134-149) MUST still pass — this plan doesn't touch dim=model SQL.
  </behavior>
  <action>
**Step 1a — Refactor the SQL in `backend/cmc/api/routes/cost.py`:**

Locate `_BREAKDOWN_BY_PROJECT_SQL` (currently L166-178). Replace the SQL string and update its leading comment block. The new block:

```python
# By project: project_key rollup (sha1[:12] of realpath(cwd)). Phase 19's
# 0003_project_key migration added sessions.project_key; mirror the
# skills router's _PROJECTS_TOKEN_SQL discipline (skills.py per Phase 19
# Plan 02): WHERE s.project_key != '' EXCLUDES the empty-key sentinel
# rows (legacy sessions whose cwd was missing/None at ingest time).
#
# 20-RESEARCH.md Pitfall 1 — naive cwd→project_key swap without the
# WHERE filter would surface a phantom "" bucket. ROADMAP Phase 20
# success criterion #3 inherits Phase 19's path-leakage prohibition:
# the response `key` field MUST be project_key, never cwd. Structural
# guard pinned by tests/test_cost_no_path_leakage.py.
_BREAKDOWN_BY_PROJECT_SQL = text("""
    SELECT
      s.project_key                               AS key,
      COALESCE(SUM(s.tokens_input), 0)            AS tokens_input,
      COALESCE(SUM(s.tokens_output), 0)           AS tokens_output,
      COALESCE(SUM(s.tokens_cache_read), 0)       AS tokens_cache_read,
      0                                           AS tokens_cache_create_5m,
      0                                           AS tokens_cache_create_1h,
      MAX(s.model)                                AS model
    FROM sessions s
    WHERE s.started_at >= :since
      AND s.project_key != ''
    GROUP BY s.project_key
""")
```

NOTE: the `cost_breakdown` handler (L181+) also has a defensive `r["key"] or "<unknown>"` coercion when constructing `CostBreakdownRow` (L219). For dim=project this can never happen with the new SQL (project_key NOT NULL DEFAULT '' + WHERE != '' filter), but the coercion is shared across model/skill/project — DO NOT remove it. The `<unknown>` literal still applies to `dim=model` (where model can be NULL on legacy rows) and `dim=skill` (where attrs_skill_name can be NULL but is filtered by `IS NOT NULL` in the SQL anyway). Leave the handler untouched.

**Step 1b — Add 2 tests in `backend/tests/test_cost_router.py`:**

Read the existing seed pattern at `backend/tests/test_cost_router.py:55-71` (`_seed_default_token_usage`) and the existing session-seeding fixtures in `backend/tests/conftest.py` (`make_session_row`, `client` fixture). Mirror the seeding style — use `cmc.core.time.now_utc` (POLI-06 ban inherited; never `datetime.utcnow`).

```python
import pytest
import re

from cmc.core.project_key import compute_project_key
from cmc.core.time import now_utc

# ... existing test imports ...


_HEX12_RE = re.compile(r"^[0-9a-f]{12}$")


@pytest.mark.asyncio
async def test_breakdown_project_groups_by_project_key(client) -> None:
    """ANLY-07: dim=project rows are keyed by 12-char hex project_key, not raw cwd."""
    sessionmaker = client._transport.app.state.sessions
    started = now_utc()
    cwd_a = "/tmp/proj-a"
    cwd_b = "/tmp/proj-b"
    pk_a = compute_project_key(cwd_a)
    pk_b = compute_project_key(cwd_b)
    assert _HEX12_RE.match(pk_a), f"helper produced non-hex key: {pk_a!r}"
    assert _HEX12_RE.match(pk_b)

    async with sessionmaker() as db:
        # 2 sessions for project A
        for i in range(2):
            db.add(Session(**make_session_row(
                session_id=f"sess-a-{i}", cwd=cwd_a, project_key=pk_a,
                started_at=started, model="claude-opus-4-5",
                tokens_input=1000, tokens_output=500, tokens_cache_read=0,
            )))
        # 3 sessions for project B
        for i in range(3):
            db.add(Session(**make_session_row(
                session_id=f"sess-b-{i}", cwd=cwd_b, project_key=pk_b,
                started_at=started, model="claude-opus-4-5",
                tokens_input=2000, tokens_output=1000, tokens_cache_read=0,
            )))
        await db.commit()

    r = await client.get("/api/cost/breakdown?dim=project&range=7d")
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload["dim"] == "project"
    rows = payload["rows"]
    assert len(rows) == 2, f"expected 2 project keys, got {len(rows)}: {rows!r}"

    keys = {row["key"] for row in rows}
    assert keys == {pk_a, pk_b}, f"keys mismatch: {keys!r} != {{{pk_a!r}, {pk_b!r}}}"
    for row in rows:
        assert _HEX12_RE.match(row["key"]), f"key {row['key']!r} is not 12-char hex"
        assert not row["key"].startswith("/"), f"key {row['key']!r} looks like a path"
        assert "/tmp/" not in row["key"], f"key {row['key']!r} contains seeded path substring"


@pytest.mark.asyncio
async def test_breakdown_project_excludes_empty_key(client) -> None:
    """ANLY-07: sessions with project_key='' are excluded (no phantom bucket)."""
    sessionmaker = client._transport.app.state.sessions
    started = now_utc()
    cwd_known = "/tmp/known"
    pk_known = compute_project_key(cwd_known)

    async with sessionmaker() as db:
        # one keyed
        db.add(Session(**make_session_row(
            session_id="sess-keyed", cwd=cwd_known, project_key=pk_known,
            started_at=started, model="claude-opus-4-5",
            tokens_input=1000, tokens_output=500, tokens_cache_read=0,
        )))
        # one with empty-key sentinel (legacy / cwd-missing)
        db.add(Session(**make_session_row(
            session_id="sess-empty", cwd=None, project_key="",
            started_at=started, model="claude-opus-4-5",
            tokens_input=99999, tokens_output=99999, tokens_cache_read=0,
        )))
        await db.commit()

    r = await client.get("/api/cost/breakdown?dim=project&range=7d")
    assert r.status_code == 200, r.text
    payload = r.json()
    rows = payload["rows"]
    assert len(rows) == 1, f"expected only the keyed row, got {len(rows)}: {rows!r}"
    assert rows[0]["key"] == pk_known
    for row in rows:
        assert row["key"] != "", "empty project_key surfaced as a row"
```

CRITICAL: Read `backend/tests/conftest.py` to confirm the exact `make_session_row` signature and the import path for the `Session` ORM model used by the existing `test_cost_router.py` tests. The existing `_seed_default_token_usage` helper seeds `token_usage` rows (not `sessions`); the new tests need session-row seeding. Mirror the patterns used by existing tests in `test_skills_router.py::test_skill_projects_*` for session seeding (Plan 19-02 ships ~5 such tests).

  </action>
  <verify>
    <automated>cd backend && uv run pytest tests/test_cost_router.py -v -k "breakdown_project"</automated>
    Expected: 2 new tests pass + existing dim=project test still passes.

    cd backend && uv run pytest tests/test_cost_router.py -v
    Expected: full file green; existing dim=model `test_breakdown_sums_to_summary` regression test still passes.

    cd backend && grep -nE "COALESCE\(s\.cwd" backend/cmc/api/routes/cost.py
    Expected: 0 matches (raw cwd usage in cost.py SQL is gone).

    cd backend && grep -nE "GROUP BY s\.project_key" backend/cmc/api/routes/cost.py
    Expected: 1 match (the refactored block).

    cd backend && uv run pytest --tb=no
    Expected: passed >= 600 (Phase 19 baseline 598 + this plan's 2 new); failed == 0; warnings_datetime_utcnow == 0 (POLI-06 floor preserved).
  </verify>
  <done>
    _BREAKDOWN_BY_PROJECT_SQL groups by s.project_key with WHERE s.project_key != '' filter.
    `s.cwd` is no longer referenced in cost.py SQL.
    2 new tests pass; existing dim=project / dim=model / dim=skill tests still pass.
    Phase 18 BASELINE.md verifier preserved (pytest pass count + 0 datetime.utcnow warnings).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add structural path-leakage test for /api/cost/breakdown?dim=project</name>
  <files>backend/tests/test_cost_no_path_leakage.py</files>
  <behavior>
    - Test test_cost_breakdown_project_no_path_leakage: Seed one session with cwd='/tmp/super/secret/leakage/path' and a 12-char project_key; GET /api/cost/breakdown?dim=project&range=7d; for each row, assert no key is named cwd/path/display_path/cwd_path; iterate every string value, assert not value.startswith('/'), assert '/tmp/super/secret' substring is absent.
    - Adversarial-mutation verification: Run `git stash`-able mutation that swaps the SQL back to `COALESCE(s.cwd, '<unknown>') AS key` and rerun the test — it MUST FAIL (RED). Restore the refactored SQL — test passes (GREEN). This makes the structural guard load-bearing.
  </behavior>
  <action>
Create new file `backend/tests/test_cost_no_path_leakage.py`. Mirror `backend/tests/test_skills_router.py::test_skill_projects_no_path_leakage` verbatim — read that test before writing.

```python
"""Structural path-leakage guard for /api/cost/breakdown?dim=project.

LOAD-BEARING for ROADMAP Phase 20 success criterion #3 (per-project card
populated from /api/cost/breakdown?dim=project) — the response shape MUST
NOT carry raw filesystem paths.

Mirrors backend/tests/test_skills_router.py::test_skill_projects_no_path_leakage
(Phase 19 Plan 02). The two tests together pin the path-leakage invariant
across both per-project endpoints in the API surface.

Adversarial-mutation verified: swapping cost.py's _BREAKDOWN_BY_PROJECT_SQL
back to COALESCE(s.cwd, '<unknown>') AS key MUST fail this test (RED).
"""
from __future__ import annotations

import pytest

from cmc.core.project_key import compute_project_key
from cmc.core.time import now_utc
from cmc.db.models.sessions import Session
from .conftest import make_session_row


# Recognizable seed path — a substring of this string MUST NOT appear in
# any field of the response. The path is intentionally long & specific
# (multiple distinctive segments) so any partial leak is caught.
_LEAKY_CWD = "/tmp/super/secret/leakage/path"


@pytest.mark.asyncio
async def test_cost_breakdown_project_no_path_leakage(client) -> None:
    """ANLY-07 structural guard: /api/cost/breakdown?dim=project leaks no paths."""
    sessionmaker = client._transport.app.state.sessions
    pk = compute_project_key(_LEAKY_CWD)

    async with sessionmaker() as db:
        db.add(Session(**make_session_row(
            session_id="sess-leakage-guard",
            cwd=_LEAKY_CWD,
            project_key=pk,
            started_at=now_utc(),
            model="claude-opus-4-5",
            tokens_input=1000,
            tokens_output=500,
            tokens_cache_read=0,
        )))
        await db.commit()

    r = await client.get("/api/cost/breakdown?dim=project&range=7d")
    assert r.status_code == 200, r.text
    payload = r.json()

    rows = payload["rows"]
    assert len(rows) >= 1, "expected at least one project row from seeded session"

    # Iterate every row + every key/value. Catch:
    #   1. Any key named cwd/path/display_path/cwd_path
    #   2. Any value that starts with '/' (filesystem-shape regex)
    #   3. Any value containing the seeded path substring
    BANNED_KEYS = {"cwd", "path", "display_path", "cwd_path"}
    SEED_FRAGMENTS = ("/tmp/super", "/secret/leakage", "leakage/path")

    for row in rows:
        leaked_keys = BANNED_KEYS.intersection(row.keys())
        assert not leaked_keys, f"row leaked path-shaped keys: {leaked_keys}; row={row!r}"

        for k, v in row.items():
            if isinstance(v, str):
                assert not v.startswith("/"), (
                    f"row[{k!r}]={v!r} starts with '/' — looks like a filesystem path"
                )
                for frag in SEED_FRAGMENTS:
                    assert frag not in v, (
                        f"row[{k!r}]={v!r} contains seeded path fragment {frag!r}"
                    )

    # Confirm the keyed row IS present — i.e. we're not vacuously passing
    # because the response is empty.
    keys_seen = {row["key"] for row in rows}
    assert pk in keys_seen, f"seeded project key {pk!r} missing from rows; got {keys_seen!r}"
```

This test must run inside the same `client` fixture infrastructure as the existing `test_cost_router.py` (real ASGI + httpx + tmp_db_path with migrations). Confirm the fixture is auto-discovered by pytest from conftest.py.

  </action>
  <verify>
    <automated>cd backend && uv run pytest tests/test_cost_no_path_leakage.py -v</automated>
    Expected: 1 test passes.

    # Adversarial-mutation verification (manual; perform once, do NOT commit the mutation):
    # 1. Edit cost.py _BREAKDOWN_BY_PROJECT_SQL: swap `s.project_key AS key` back to `COALESCE(s.cwd, '<unknown>') AS key`
    #    and `GROUP BY s.project_key` back to `GROUP BY COALESCE(s.cwd, '<unknown>')`.
    # 2. Run: cd backend && uv run pytest tests/test_cost_no_path_leakage.py -v
    # 3. Expected: TEST FAILS (RED) — the leaked /tmp/super/secret path is detected.
    # 4. git checkout backend/cmc/api/routes/cost.py to restore.
    # 5. Run again: TEST PASSES (GREEN). Confirms guard is load-bearing.

    cd backend && uv run pytest --tb=no
    Expected: passed >= 601 (Phase 19 baseline 598 + Task 1's 2 new + Task 2's 1 new); failed == 0; warnings_datetime_utcnow == 0.
  </verify>
  <done>
    test_cost_no_path_leakage.py exists with 1 passing test that programmatically scans both keys and values of /api/cost/breakdown?dim=project rows for path-shape leakage.
    Adversarial-mutation verification done at least once locally — guard fails on a deliberate cwd-restoration mutation.
    Phase 18 BASELINE.md verifier preserved.
  </done>
</task>

</tasks>

<verification>
- `_BREAKDOWN_BY_PROJECT_SQL` groups by `s.project_key`, excludes `s.project_key = ''` rows, no longer references `s.cwd`.
- 2 new tests in `test_cost_router.py` (`test_breakdown_project_groups_by_project_key`, `test_breakdown_project_excludes_empty_key`) + 1 new test in `test_cost_no_path_leakage.py` all pass.
- Existing `test_cost_router.py` tests (especially `test_breakdown_sums_to_summary` for dim=model and any existing dim=skill assertions) all pass — this refactor is scoped to dim=project SQL only.
- The path-leakage test programmatically scans both keys (no cwd/path/display_path) AND values (no `/`-prefixed strings, no seeded-path substring) — adversarial-mutation verified.
- `git grep "COALESCE(s\.cwd"` returns 0 matches across `backend/cmc/api/routes/cost.py`.
- Phase 18 BASELINE.md verifier preserved: backend pytest pass count grows by exactly 3 (test_breakdown_project_groups_by_project_key + test_breakdown_project_excludes_empty_key + test_cost_breakdown_project_no_path_leakage); failed == 0; `warnings_datetime_utcnow` remains 0 (POLI-06 floor); ruff check --select UP passes clean.
- pyright (basic mode, on `cmc/` core paths) passes — `cmc.core.project_key` import added to test files only, which are excluded from pyright per `pyproject.toml`.
</verification>

<success_criteria>
- ROADMAP success criterion #3 backend portion satisfied: `/api/cost/breakdown?dim=project` returns 12-char hex `key` values; no raw filesystem paths leak through any field.
- Phase 19 SKLP-08 path-leakage discipline now extends to the cost router (was previously enforced only in the skills router).
- ANLY-07 backend is unblocked; Plan 03 (frontend) can render the response without re-applying client-side path stripping.
- Plan 02 (forecast endpoint, same wave bucket but Wave 2 due to cost.py file ownership) starts from a clean cost.py with no `cwd`-leaking SQL.
</success_criteria>

<output>
After completion, create `.planning/phases/20-cost-forecast-per-project-card/20-01-SUMMARY.md` documenting:
- The 3-line SQL diff (cwd → project_key + WHERE filter + GROUP BY).
- The 2 new router tests + 1 new structural test.
- Adversarial-mutation verification result.
- Phase 18 BASELINE.md compliance (new pytest pass count, 0 datetime.utcnow warnings).
- Any deviation from this plan and its rationale.
</output>
