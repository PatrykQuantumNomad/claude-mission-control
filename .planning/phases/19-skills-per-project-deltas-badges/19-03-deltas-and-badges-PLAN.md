---
phase: 19-skills-per-project-deltas-badges
plan: 03
type: execute
wave: 3
# why_this_split: SKLP-09 (delta CTE) + SKLP-10 (badges) co-located because they share the badge-suppression cold-start logic and the DST spring-forward unit test. Same file set as 19-02 (skills router + schemas + test_skills_router.py) — sequenced after 19-02 to avoid file-merge conflicts; the research-recommended Wave 1b parallel is impossible without splitting the skills router across two files, which would worsen reviewer cognitive load.
depends_on: ["19-01", "19-02"]
files_modified:
  - backend/cmc/api/schemas/skills.py
  - backend/cmc/api/routes/skills.py
  - backend/tests/test_skills_router.py
autonomous: true
requirements: [SKLP-09, SKLP-10]
must_haves:
  truths:
    - "GET /api/skills/usage response includes a per-row usage_delta: DeltaPill object derived from a 7d-vs-prev-7d CTE in the same query."
    - "GET /api/skills/{name}/cost response includes a cost_delta: DeltaPill object derived from a 7d-vs-prev-7d CTE in the same query."
    - "DeltaPill schema fields: curr (numeric), prev (numeric), delta (numeric), delta_pct (float | None), direction (Literal['up'|'down'|'flat']). delta_pct is None when prev == 0 (no division by zero)."
    - "SkillUsageRow includes badges: list[Literal['new_this_week', 'dormant']] derived from MIN(ts) / MAX(ts) over otel_events.skill_activated."
    - "Badge classification: 'new_this_week' iff first_activated_at >= datetime('now', '-7 days') (UTC); 'dormant' iff last_activated_at < datetime('now', '-30 days') AND days_since_first >= 14 (cold-start suppression)."
    - "All badge SQL uses datetime('now', '-N days') in UTC — NEVER 'localtime' modifier (DST safety, ROADMAP success criterion #5)."
    - "DeltaPill direction: 'up' if delta > 0; 'down' if delta < 0; 'flat' if delta == 0."
    - "_DELTA_WINDOW_DAYS constant defined once (= 7) and referenced from all delta CTE bindings — no magic 7 literals scattered through SQL."
    - "DST spring-forward unit test exists in test_skills_router.py and verifies that a skill_activated event timestamped 31 days before a frozen-now-after-spring-forward is classified 'dormant' regardless of which side of the DST boundary the wall clock crosses."
  artifacts:
    - path: "backend/cmc/api/schemas/skills.py"
      provides: "DeltaPill schema; SkillUsageRow extended with badges + usage_delta; SkillCostResponse extended with cost_delta"
      contains: "class DeltaPill"
      contains_also: "badges: list"
    - path: "backend/cmc/api/routes/skills.py"
      provides: "_DELTA_WINDOW_DAYS const + prev-period CTE in skills_usage and skill_cost; badge derivation in skills_usage"
      contains: "_DELTA_WINDOW_DAYS"
      contains_also: "datetime('now', '-7 days')"
    - path: "backend/tests/test_skills_router.py"
      provides: "Delta math tests + badge boundary tests + cold-start suppression test + DST spring-forward test"
      contains: "test_dormant_badge_dst_spring_forward"
      contains_also: "test_usage_delta"
  key_links:
    - from: "backend/cmc/api/routes/skills.py"
      to: "backend/cmc/api/schemas/skills.py (DeltaPill)"
      via: "constructed in skills_usage and skill_cost handlers"
      pattern: "DeltaPill\\("
    - from: "backend/cmc/api/routes/skills.py"
      to: "SQLite datetime('now', '-N days') (UTC arithmetic)"
      via: "raw SQL bind in CTE"
      pattern: "datetime\\('now', '-7 days'\\)|datetime\\('now', '-14 days'\\)|datetime\\('now', '-30 days'\\)"
---

<objective>
Ship SKLP-09 (period-over-period delta pills) and SKLP-10 (new/dormant badges) as additive extensions to the existing `/api/skills/usage` and `/api/skills/{name}/cost` endpoints. Includes the load-bearing DST spring-forward unit test that ROADMAP success criterion #5 calls out explicitly.

Purpose: ROADMAP success criteria #3, #4, #5 — "TopSkills panel, SkillCostCard, and per-skill detail page each render a 7d-vs-prev-7d delta pill"; "skills with first_activated_at within 7 days display 'new this week'; skills with last_activated_at older than 30 days display 'dormant'; cold-start suppression for skills <14 days old"; "DST day-boundary windowing is correct: badge thresholds use SQLite datetime('now', '-N days') (UTC), not local-time arithmetic, verified by a unit test crossing the spring-forward boundary."

Output:
- `backend/cmc/api/schemas/skills.py` — EXTENDED with `DeltaPill` schema; `SkillUsageRow` gains `usage_delta: DeltaPill` + `badges: list[Literal["new_this_week", "dormant"]]`; `SkillCostResponse` gains `cost_delta: DeltaPill`.
- `backend/cmc/api/routes/skills.py` — EXTENDED:
  - Add `_DELTA_WINDOW_DAYS = 7` module constant.
  - `skills_usage` handler: rewrite the SQL to add `curr` / `prev` CTEs (7d-vs-prev-7d window) AND a `badges` CTE deriving from `MIN(ts)` / `MAX(ts)` over `skill_activated` with cold-start suppression.
  - `skill_cost` handler: extend SQL with `curr_cost` / `prev_cost` CTEs (mirror the dual-path attribution pattern for both windows).
  - Both handlers compute `direction` and `delta_pct` server-side (RESEARCH.md Pattern 3 — server is source of truth).
- `backend/tests/test_skills_router.py` — EXTENDED with 7+ tests (delta math, badge boundaries, cold-start suppression, DST spring-forward).
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
  <name>Task 1: DeltaPill schema + extend SkillUsageRow/SkillCostResponse + badge field</name>
  <files>backend/cmc/api/schemas/skills.py</files>
  <action>
Add the `DeltaPill` schema (place near the top, after `SkillRange`):

```python
class DeltaPill(BaseModel):
    """SKLP-09 — server-computed period-over-period delta.

    Curr/prev/delta as Decimal so the same shape works for both integer
    counts (usage) and Decimal cost (money). Pydantic v2 serializes
    Decimal as a JSON string; the frontend treats both numeric and
    string serializations as opaque "render this number" payloads.

    delta_pct == None when prev == 0 (avoid div-by-zero / infinity);
    UI renders '—' instead of fabricating a +0% / +inf%.

    direction is the rendered arrow:
      'up'   when delta > 0 (more activations / more cost)
      'down' when delta < 0
      'flat' when delta == 0
    Color/sign treatment is the frontend's responsibility — backend
    just declares the sign.
    """
    curr: Decimal
    prev: Decimal
    delta: Decimal
    delta_pct: float | None
    direction: Literal["up", "down", "flat"]
```

Extend `SkillUsageRow`:
```python
class SkillUsageRow(BaseModel):
    name: str
    autonomy: AutonomyMode
    invocations: int
    sparkline: list[SkillSparklineRow]
    # NEW (SKLP-09):
    usage_delta: DeltaPill
    # NEW (SKLP-10):
    badges: list[Literal["new_this_week", "dormant"]] = Field(default_factory=list)
```

Extend `SkillCostResponse`:
```python
class SkillCostResponse(BaseModel):
    # ... existing fields preserved ...
    # NEW (SKLP-09):
    cost_delta: DeltaPill
```

If the file does not already import `Literal` or `Field`, add the imports (`from typing import Literal`, `from pydantic import BaseModel, Field`). Do NOT introduce new top-level type aliases for `Literal["up", "down", "flat"]` — inline it in the DeltaPill class for readability.
  </action>
  <verify>
cd backend && uv run python -c "
from cmc.api.schemas.skills import DeltaPill, SkillUsageRow
d = DeltaPill(curr='10', prev='5', delta='5', delta_pct=1.0, direction='up')
print(d.model_dump_json())
"
Expected: prints valid JSON; curr/prev/delta as JSON strings; direction='up'.

cd backend && uv run pytest --collect-only tests/test_skills_router.py -q 2>&1 | tail -5
Expected: collection succeeds.
  </verify>
  <done>
DeltaPill exists with all 5 fields; SkillUsageRow has usage_delta + badges; SkillCostResponse has cost_delta.
delta_pct accepts None.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire delta CTE + badge derivation into skills_usage and skill_cost handlers</name>
  <files>backend/cmc/api/routes/skills.py</files>
  <action>
**Step 2a — Module constants:**

Add at the top of the file near `_RANGE_TO_DAYS`:
```python
# SKLP-09: 7d-vs-prev-7d delta window. Hardcoded per ROADMAP success
# criterion #3; the user-facing range toggle (14d/30d) on the primary
# chart is independent of this delta window. If a future requirement
# wants 30d-vs-prev-30d, change this constant — but Phase 19 ships 7d.
_DELTA_WINDOW_DAYS = 7

# SKLP-10: badge thresholds (in days). All UTC-arithmetic via SQLite
# datetime('now', '-N days') — DST-safe (ROADMAP success criterion #5).
_BADGE_NEW_DAYS = 7        # first_activated_at within last 7d -> 'new_this_week'
_BADGE_DORMANT_DAYS = 30   # last_activated_at older than 30d -> 'dormant'
_BADGE_COLDSTART_DAYS = 14 # skill must be >= 14d old to be eligible for 'dormant'
```

**Step 2b — Delta + badge computation helpers:**

Add a small helper to derive direction + delta_pct (used in both handlers):

```python
def _build_delta_pill(curr: Decimal | int, prev: Decimal | int) -> DeltaPill:
    """SKLP-09: build the DeltaPill DTO from raw curr/prev values."""
    curr_d = Decimal(str(curr))
    prev_d = Decimal(str(prev))
    delta = curr_d - prev_d
    if prev_d == 0:
        delta_pct = None
    else:
        delta_pct = float(delta) / float(prev_d)
    if delta > 0:
        direction: Literal["up", "down", "flat"] = "up"
    elif delta < 0:
        direction = "down"
    else:
        direction = "flat"
    return DeltaPill(
        curr=curr_d, prev=prev_d, delta=delta,
        delta_pct=delta_pct, direction=direction,
    )
```

**Step 2c — Extend `skills_usage` handler:**

The existing handler (line 280+) returns top-N skills with sparkline. Augment its SQL to ALSO compute:
1. `curr_count` (count of skill_activated events in last 7d, per skill).
2. `prev_count` (count in 14d-to-7d-ago window, per skill).
3. `first_activated_at` (MIN ts), `last_activated_at` (MAX ts) per skill.
4. Boolean flags for badges, derived in SQL.

Use a CTE structure like:
```sql
WITH curr AS (
    SELECT attrs_skill_name AS skill_name, COUNT(*) AS curr_count
    FROM otel_events
    WHERE event_name = 'skill_activated'
      AND ts >= datetime('now', '-7 days')
    GROUP BY attrs_skill_name
),
prev AS (
    SELECT attrs_skill_name AS skill_name, COUNT(*) AS prev_count
    FROM otel_events
    WHERE event_name = 'skill_activated'
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
-- main SELECT then joins these to the existing top-N sparkline rollup
```

CRITICAL implementation note: the existing `skills_usage` SQL likely has a more complex top-N + sparkline shape. READ the existing handler before editing. The cleanest implementation is:
- Keep the existing primary query that returns the top-N rows + sparkline.
- After fetching, run TWO additional small queries (or a single query with the three CTEs above) that return per-skill `{curr_count, prev_count, first_at, last_at, days_since_first}` keyed by skill_name.
- In Python, merge: for each top-N row, build `usage_delta = _build_delta_pill(curr_count, prev_count)` and compute `badges` via the cold-start-aware Python predicate (mirrors the pattern below).

Badge derivation (Python after the SQL):
```python
def _derive_badges(first_at, last_at, days_since_first, now: datetime) -> list[str]:
    """SKLP-10: badge classification with cold-start suppression."""
    badges: list[str] = []
    if first_at and (now - first_at).days < _BADGE_NEW_DAYS:
        badges.append("new_this_week")
    if (
        last_at
        and (now - last_at).days >= _BADGE_DORMANT_DAYS
        and days_since_first >= _BADGE_COLDSTART_DAYS
    ):
        badges.append("dormant")
    return badges
```

Use `cmc.core.time.now_utc()` to get the `now` parameter (NEVER `datetime.utcnow` — POLI-06 ban).

ALTERNATIVE: do the badge classification entirely in SQL using `CASE WHEN first_at >= datetime('now', '-7 days')`. Either approach is acceptable; the Python form is shown for readability but RESEARCH.md "Badge derivation SQL (SKLP-10)" gives a pure-SQL alternative. Prefer the SQL form if it composes cleanly with the rest of the rollup; fall back to Python if mixing CASE columns and GROUP_CONCAT becomes unwieldy. Document the choice in a comment.

**Step 2d — Extend `skill_cost` handler:**

Mirror the same pattern. The existing `skill_cost` handler (line 631+) has a dual-path cost CTE (skill_events + api_req_events). Add `curr_cost` and `prev_cost` CTEs that constrain the same dual-path logic to the 7d window and the 14d-to-7d-ago window respectively. After fetching, build `cost_delta = _build_delta_pill(curr_cost, prev_cost)`.

DO NOT bind `_DELTA_WINDOW_DAYS` to the user-facing `range` parameter (Pitfall 2: SkillRange is `Literal["14d", "30d"]` — it never narrows to 7d). Delta is always 7d-vs-prev-7d regardless of what the user picked for `range`.
  </action>
  <verify>
cd backend && uv run pytest tests/test_skills_router.py -v
Expected: all existing tests still green (extending the response shape is additive — old tests don't depend on the new fields). New badge/delta tests added in Task 3 below.

cd backend && uv run python -c "
from cmc.api.routes.skills import _build_delta_pill, _DELTA_WINDOW_DAYS, _BADGE_NEW_DAYS, _BADGE_DORMANT_DAYS, _BADGE_COLDSTART_DAYS
print(_DELTA_WINDOW_DAYS, _BADGE_NEW_DAYS, _BADGE_DORMANT_DAYS, _BADGE_COLDSTART_DAYS)
p = _build_delta_pill(10, 5)
print(p.direction, p.delta_pct)
p2 = _build_delta_pill(0, 0)
print(p2.direction, p2.delta_pct)
"
Expected: prints '7 7 30 14', then 'up 1.0', then 'flat None'.

git grep -nE \"datetime\\('now', '-[0-9]+ days', 'localtime'\\)\" -- backend/cmc/api/routes/skills.py
Expected: 0 matches (DST safety GATE — no localtime modifier).

git grep -nE 'datetime\.utcnow|from datetime import .*utcnow' -- backend/cmc/api/routes/skills.py
Expected: 0 matches (POLI-06 GATE).
  </verify>
  <done>
_DELTA_WINDOW_DAYS, _BADGE_* constants exported.
_build_delta_pill returns DeltaPill with correct direction + delta_pct (None on prev=0).
skills_usage and skill_cost responses include the new fields without breaking existing tests.
No 'localtime' modifier in any datetime SQL — DST safety.
  </done>
</task>

<task type="auto">
  <name>Task 3: Delta math + badge boundary + DST spring-forward unit tests</name>
  <files>backend/tests/test_skills_router.py</files>
  <action>
Add the following test functions to `backend/tests/test_skills_router.py`. Use the existing seeded_app fixture (read the file's existing fixtures first — match names verbatim). All timestamp seeding goes through `cmc.core.time.now_utc()` or hardcoded `datetime(...)` constants — NEVER `datetime.utcnow`.

```python
async def test_usage_delta_basic_positive_growth(seeded_app):
    """SKLP-09: 10 activations in current 7d, 5 in prev 7d -> direction='up', delta_pct=1.0."""
    # Seed: 10 skill_activated events with ts in last 7d, 5 events with ts in 14d-to-7d-ago.
    # GET /api/skills/usage.
    # Find the row for the seeded skill name.
    # Assert: row['usage_delta']['curr'] == '10', prev=='5', delta=='5', direction=='up',
    #         delta_pct == 1.0.

async def test_usage_delta_zero_prev_returns_null_pct(seeded_app):
    """delta_pct is None when prev == 0 (no division by zero)."""
    # Seed: 5 events in last 7d, 0 in prev 7d.
    # Assert: row['usage_delta']['delta_pct'] is None; direction='up'.

async def test_usage_delta_flat_when_no_change(seeded_app):
    """delta == 0 -> direction='flat'."""
    # Seed: 5 events in current AND 5 in prev.
    # Assert: direction == 'flat'; delta_pct == 0.0.

async def test_new_this_week_badge_within_7_days(seeded_app):
    """SKLP-10: skill first activated 3 days ago shows 'new_this_week'."""
    # Seed: 1 skill_activated event timestamped 3 days before now (UTC).
    # Assert: row['badges'] contains 'new_this_week', does NOT contain 'dormant'.

async def test_no_new_badge_after_8_days(seeded_app):
    """Skill first activated 8 days ago does NOT show 'new_this_week'."""
    # Seed: 1 skill_activated event 8 days ago.
    # Assert: 'new_this_week' not in badges.

async def test_dormant_badge_after_30_days(seeded_app):
    """Skill last activated 31 days ago, first activated 60 days ago -> 'dormant'."""
    # Seed: skill_activated events at -60d and -31d (so days_since_first=60, last=-31).
    # Assert: 'dormant' in badges.

async def test_no_dormant_badge_when_skill_under_14_days_old(seeded_app):
    """SKLP-10 cold-start: skill <14 days old never shows 'dormant', even if last_activated > 30d ago.

    (Edge: this combination is normally impossible, but the suppression rule
    is the structural guard. Test by seeding a skill whose first AND last
    activation are both 5 days ago — first==last, days_since_first=5 — to
    confirm the cold-start gate fires.)
    """
    # Seed: 1 skill_activated event 5 days ago.
    # Assert: 'dormant' not in badges (days_since_first < 14 -> suppressed).

async def test_dormant_badge_dst_spring_forward(seeded_app, monkeypatch):
    """SKLP-10 DST safety (ROADMAP success criterion #5).

    US 2026 spring-forward is March 8, 02:00 -> 03:00 local. A skill_activated
    event at 2026-02-06T01:30:00Z is 31 days before 2026-03-09T02:00:00Z UTC,
    which straddles the spring-forward in any US timezone. Because our SQL
    uses datetime('now', '-30 days') in UTC, the classification must be
    'dormant' regardless of local-time arithmetic drift.

    Test strategy:
    1. Seed two skill_activated events: ts=2026-02-06T01:30:00Z (oldest)
       and ts=2026-02-06T02:00:00Z (most recent — both 31d before frozen-now).
       Also seed an anchor event at ts=2025-12-01T00:00:00Z to ensure
       days_since_first >= 14 at frozen-now.
    2. Freeze SQLite's clock at 2026-03-09T02:00:00Z. SQLite respects the
       SQLITE_DEFAULT_DATETIME_FUNC env var or accepts a query-level override
       via "WITH RECURSIVE clock(now) AS (VALUES('2026-03-09T02:00:00Z'))..."
       — but the simplest approach is to monkeypatch cmc.core.time.now_utc
       AND seed ALL timestamps RELATIVE to a fixed-now constant the test
       owns. Then the SQL's bare datetime('now', ...) computes against the
       real wall clock, but the seeded event timestamps are anchored to
       a known offset.
    3. Practical approach: seed events at offsets relative to the REAL
       current UTC time such that they straddle the local-DST window
       (e.g., seed at -31 days, real wall-clock-now), and assert the badge
       fires. This tests the UTC arithmetic correctness; explicit DST-day
       freezing is an integration concern.
    4. ALTERNATIVELY: test against a checked-in fixture where the SQLite
       clock is overridden via "SELECT datetime('2026-03-09 02:00:00')" in
       a setup statement, and the event timestamps are hardcoded
       2026-02-06 dates. This is the most rigorous form.

    Choose the implementation form that fits the existing test infrastructure
    in this file — match the seeded_app fixture's pattern. The acceptance
    criterion is: assert that the test fails if someone changes the SQL
    from datetime('now', '-30 days') to datetime('now', '-30 days', 'localtime').
    Verify by temporarily applying that change and running the test — it
    should produce a different classification near the DST boundary.
    """
    # See docstring for implementation strategy.
    # Final assertion: 'dormant' in badges AT the spring-forward boundary,
    # under both real and frozen UTC clocks.
    ...

async def test_cost_delta_basic(seeded_app):
    """SKLP-09 cost-side delta on /api/skills/{name}/cost.

    Seed sessions with token usage in current 7d AND prev 7d windows;
    compute_cost is deterministic given known model + token counts.
    Assert: response['cost_delta'] has direction matching the cost movement;
    curr/prev are JSON strings (Decimal serialization); delta_pct is float.
    """
```

The DST test is the load-bearing one for ROADMAP success criterion #5. If the chosen implementation strategy is hard to lock down deterministically, document a clear simpler-but-still-correct version: seed events at known UTC offsets, assert the badge classification matches the expected UTC-arithmetic result. The test must FAIL if `datetime('now', '-30 days')` is changed to `datetime('now', '-30 days', 'localtime')` — that is the structural guard.

Add a docstring at the top of the test_skills_router.py block clearly labeling: `# SKLP-09 / SKLP-10 tests (Plan 19-03).` for navigation.
  </action>
  <verify>
cd backend && uv run pytest tests/test_skills_router.py -v -k "delta or badge or dst or dormant"
Expected: all 9+ tests pass.

cd backend && uv run pytest tests/test_skills_router.py -v
Expected: full file green.

cd backend && uv run pytest --tb=no
Expected: passed >= 566 + Plan 19-01 tests + Plan 19-02 tests + Plan 19-03 tests; failed == 0; warnings_datetime_utcnow == 0.

# Adversarial DST check: temporarily corrupt the SQL to use 'localtime', re-run, confirm test fails:
cd backend && python -c "
import re, pathlib
src = pathlib.Path('cmc/api/routes/skills.py').read_text()
mut = src.replace(\"datetime('now', '-30 days')\", \"datetime('now', '-30 days', 'localtime')\", 1)
print('MUTATION_APPLIED' if mut != src else 'NO_MATCH')
"
# Then manually apply the mutation, run the DST test, confirm RED. Restore. Confirm GREEN.
# (This is a verification step — don't commit the mutated file.)

git grep -nE \"datetime\\('now', '-[0-9]+ days', 'localtime'\\)\" -- backend/
Expected: 0 matches (DST safety GATE).

git grep -nE 'datetime\.utcnow|from datetime import .*utcnow' -- backend/cmc/api/routes/skills.py backend/tests/test_skills_router.py
Expected: 0 matches.
  </verify>
  <done>
9+ delta/badge/DST tests pass.
Adversarial mutation (replacing UTC SQL with 'localtime') causes the DST test to fail — proving the structural guard works.
Phase 18 BASELINE.md verifier preserved: pytest >= 566, failed == 0, warnings_datetime_utcnow == 0.
  </done>
</task>

</tasks>

<verification>
- DeltaPill schema with curr/prev/delta/delta_pct/direction; delta_pct=None on prev=0.
- _DELTA_WINDOW_DAYS=7, _BADGE_NEW_DAYS=7, _BADGE_DORMANT_DAYS=30, _BADGE_COLDSTART_DAYS=14 — single source of truth.
- skills_usage response carries usage_delta + badges per row.
- skill_cost response carries cost_delta.
- All badge/delta SQL uses datetime('now', '-N days') in UTC — verified by grep.
- DST spring-forward test exists and is load-bearing (would fail if SQL switched to 'localtime' modifier).
- Phase 18 BASELINE.md verifier rules preserved.
</verification>

<success_criteria>
- ROADMAP success criteria #3, #4, #5 all satisfied (deltas everywhere, badges with cold-start, DST-safe windowing).
- SKLP-09 + SKLP-10 backend portions shipped; frontend wires up in Plan 19-04.
</success_criteria>

<output>
After completion, create `.planning/phases/19-skills-per-project-deltas-badges/19-03-SUMMARY.md`.
</output>
