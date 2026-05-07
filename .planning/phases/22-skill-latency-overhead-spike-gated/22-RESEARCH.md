# Phase 22: Skill Latency Overhead (spike-gated) - Research

**Researched:** 2026-05-07
**Domain:** Feasibility-gated SQL spike against `tools` ↔ `otel_events.skill_activated` temporal JOIN to decompose `skill_activated.duration_ms` into body / subagent / tool components; conditional follow-on backend endpoint + frontend stacked-bar panel OR conditional descope branch with REQUIREMENTS.md status flip and Phase-23 unblocking artifact.
**Confidence:** HIGH on the mechanics of the spike (every query target is grounded in repo evidence at HEAD plus live `data/cmc.db` probes); MEDIUM on the binary outcome (the empirical evidence today strongly suggests the spike will fail — see Summary §"Empirical Reality Check" — but a single fresh skill invocation could change that, so the planner MUST design the spike to resolve from current production data, NOT this research's snapshot).

## Summary

Phase 22 is a **branched feasibility phase**: Plan 01 is mandatory and runs a SQL-only spike against `data/cmc.db` to determine whether `skill_activated.duration_ms` can be decomposed into body / subagent / tool components reliably enough to ship a stacked-bar panel. The spike has exactly two outcomes — YES (cite the SQL columns / temporal-JOIN derivation source for each component, Plans 02+ ship the success branch) or NO (record the negative finding in `SPIKE-FINDINGS.md`, flip SKLP-11 to `Deferred to v1.3` in REQUIREMENTS.md, and exit cleanly so Phase 23 starts on schedule). The phase explicitly forbids any third path — no ratio guesswork, no fabricated event types, no "best-effort" approximations. The two-branch shape is structural: the planner cannot pre-write the success-branch plans without the spike evidence to cite in their front-matter.

**Empirical Reality Check (LOAD-BEARING — read before designing the spike):**
A direct probe of `data/cmc.db` at HEAD reveals data conditions that bias the spike outcome strongly toward FAIL:
- **`otel_events` has exactly ONE row with `event_name='skill_activated'`** (the leftover Phase 12 spike row, captured 2026-05-02). That single row has NO `duration_ms` attribute (`have_duration_ms=NULL` per Q5 form). Sample count = 1, far below `MIN_LATENCY_SAMPLES=30`.
- The Phase 12 SPIKE.md `LOCK-3` (`duration_ms` presence on `skill_activated`) was **TENTATIVE — assumed by analogy with `api_request`**. It has never been live-verified in this repo's production data. Phase 14 SKIL-06 / `_LATENCY_SQL` reads the attribute defensively; an `attrs_skill_name`-keyed query would return zero rows in current production.
- `tools` table has 10,531 rows, of which **`tool_name='Skill'` is the row-level skill-invocation marker** (16 rows total — but each `Skill` row's `duration_ms` is the *time-to-spawn-the-skill-body* (avg 6ms-17s but typically <1s), NOT the cumulative cost of the skill's downstream model turns. The Skill tool returns the body content; subsequent assistant turns are what the user perceives as "the skill executing."
- **`tool_name='Agent'`** is the subagent-invocation marker (739 rows; 65 still `pending` with NULL `ended_at`/`duration_ms`). Subagent inner tool calls live in a SEPARATE session JSONL (different `session_id`) — they do NOT appear under the parent's `session_id` (verified: 0–1 tools overlap with each Agent invocation in the parent session).
- Plan 14 / Phase 19 latency CTEs query `event_name = 'skill_activated' AND attrs_skill_name = :name`. The `attrs_skill_name` column on the one extant skill row is **NULL** (the row was ingested before Phase 13's `extract_skill_attr` fix landed; current ingest correctly reads `skill.name` dotted, but no fresh skill events have arrived since). Bottom line: the entire `/api/skills/{name}/latency` family currently returns `low_sample=True` empty-state for every name.

The honest interpretation: **the spike will likely fail today**. The planner should design the spike thresholds (Q-coverage and Q-reconciliation below) in advance and let the Wave 0 query results dictate the branch. Do NOT pre-decide the outcome.

**Primary recommendation:** Three-plan structure with a hard branch after Plan 01 — Plan 01 is the SQL spike + decision document; Plans 02–03 are written conditionally based on the spike's outcome banner. Use Phase 12's two-plan precedent (Plan 01 = raw capture, Plan 02 = locks + branch decision) as the structural template. Do NOT pre-write Plans 02+ before Plan 01 commits its findings — the success-branch plans need to cite the spike's verified derivation sources in their front-matter (per Success Criterion #1), and the descope-branch plan needs to anchor on `SPIKE-FINDINGS.md` as a real artifact.

<user_constraints>
## User Constraints (no CONTEXT.md exists for Phase 22; constraints sourced from ROADMAP.md success criteria, REQUIREMENTS.md SKLP-11, and STATE.md v1.2 invariants)

### Locked Decisions (from ROADMAP.md Phase 22 success criteria + REQUIREMENTS.md SKLP-11 + STATE.md)

**Spike-gated branching is structural.** Plan 01 is mandatory and is a feasibility spike. Plans 02+ are conditional on Plan 01's binary outcome. There is no third path — no ratio guesswork, no fabricated event types, no "best-effort" decomposition of any kind. (Success Criterion #1, verbatim: *"No fake decomposition (ratio guesswork, fabricated event types, etc.) ships under any circumstance."*)

**Front-matter citation requirement.** If the spike succeeds, every plan that ships a body / subagent / tool decomposition MUST cite the specific SQL column or temporal-JOIN derivation source for each of `body_ms` / `subagent_ms` / `tool_ms` in its plan front-matter. (Success Criterion #1.)

**Endpoint shape (success branch).** `GET /api/skills/{name}/overhead` — slots into the existing `/api/skills/{name}/*` URL space (`list`, `usage`, `cost`, `latency`, `runs`, `projects`). Single endpoint. Stacked-bar panel on `/skills/$name`. (Success Criterion #2 + #4.)

**`low_sample` threshold reuse.** `MIN_LATENCY_SAMPLES = 30` is the single source of truth — defined at `cmc/api/routes/skills.py:606` and reused by the latency endpoint, projects endpoint, and (if it ships) overhead endpoint. NEVER introduce a parallel constant. (Success Criterion #2.)

**Descope artifact path (failure branch).** REQUIREMENTS.md flip from `Pending (spike-gated)` to `Deferred to v1.3` with the `## Future Requirements (deferred) > ### Skills (v1.3+)` block extended to carry SKLP-11 (today already lists SKLP-12 as conditional on SKLP-11). The negative-finding document anchors at `.planning/phases/22-skill-latency-overhead-spike-gated/22-01-SPIKE-FINDINGS.md` (or similar — name TBD by planner; must be a real artifact, not a placeholder). (Success Criterion #3.)

**Phase-23 unblocking invariant.** Phase 23 must start on schedule regardless of Phase 22's outcome. Phase 22 must NOT add any code that Phase 23 depends on. Phase 23 (CMPR-06 `skill_latencies` dict in compare view) reuses the existing `/api/skills/{name}/latency` family — it does NOT need overhead decomposition. (Success Criterion #3 + ROADMAP.md Phase 23 dependency note: *"optional reuse of overhead-derivation work if SKLP-11 shipped; runs cleanly even if SKLP-11 descoped."*)

**No new top-level routes, no new dependencies, no parallel skill-event types.** The success-branch endpoint slots into `/api/skills/{name}/overhead`. The success-branch frontend slots into the existing `/skills/$name` route at `frontend/src/routes/skills_.$name.tsx`. No `npm install`. No `uv add`. No new `event_name` like `skill_completed` or `skill_body_done` invented for the decomposition. (Success Criterion #4.)

**Phase-baseline (Phase 18 BASELINE.md) verifier rules — apply to Phase 22 regardless of branch outcome:**
- pytest `passed >= 566`, `failed == 0`
- pytest `warnings_datetime_utcnow > 0` → fail (POLI-06 reverse-direction signal)
- vitest `passed >= 293`, `failed == 0`
- playwright `failed == 0`, `passed >= 7 - skipped_delta`

**Time-factory ban (POLI-06):** Use `cmc.core.time.now_utc` — NEVER `datetime.utcnow`. Phase 19 boosted pytest to 598 / 0 / 32 with `datetime.utcnow_warnings == 0`; Phase 22 inherits the floor.

**Test-id convention (Phase 18 POLI-08):** kebab-case `feature-component-element` (e.g., `skill-overhead-stacked-bar` if the panel ships). `data-testid` lives on the source React component, not test wrappers; decorate only when Playwright strict mode collides.

**No path leakage in API responses (Phase 19 SKLP-08 invariant).** If the success-branch overhead response carries any per-project rollup (it shouldn't — SKLP-11 is per-skill, not per-project per skill), `project_key` only — never `cwd`.

**Decimal-as-JSON-string for any monetary surface (v1.1 invariant).** SKLP-11 is latency-decomposition (integer milliseconds), not money. The overhead endpoint should NOT return cost. Latency uses `int | None` like the existing `SkillLatencyResponse`.

### Claude's Discretion (areas to research and recommend; bounded by the locked constraints above)

- **Spike threshold definition.** What coverage % and reconciliation tolerance qualify as "reliable enough to ship"? The planner must define explicit numeric thresholds before Plan 01 runs — without them, the binary decision becomes subjective. Recommendation in §"Pattern 1: Two-Tier Spike Threshold."

- **Plan structure (Phase 22 Plan 01 only vs. all-three-up-front).** Two structural options:
  1. **Sequential (RECOMMENDED):** Write Plan 01 (the spike) first; Plan 01's commit triggers a second `/gsd-plan-phase` invocation that adds Plan 02+ (success or descope branch) based on the SPIKE-FINDINGS.md outcome banner.
  2. **Pre-branched:** Write all of Plan 01 + Plan 02-success + Plan 02-descope up front; Plan 01's outcome activates exactly one of the two branch plans.

  Recommend Option 1: the success-branch plans need to cite specific SQL derivation sources in their front-matter (Success Criterion #1) — those sources don't exist until the spike runs. Pre-branching Plan 02-success would mean writing front-matter with placeholder citations, which is exactly the "ratio guesswork" anti-pattern Success Criterion #1 forbids.

- **Subagent latency definition (success-branch).** If the spike succeeds and `subagent_ms` is shippable, what is the canonical formula? Three candidates:
  1. `subagent_ms = SUM(tools.duration_ms) WHERE tools.tool_name='Agent' AND tools.session_id = :sid AND tools.started_at BETWEEN skill_start AND skill_end`
  2. `subagent_ms = SUM(tools.duration_ms) WHERE tools.tool_name='Agent' AND tools.session_id = :sid` (session-scoped, no temporal filter — risk: counts pre-skill subagent calls)
  3. Subagent inner-tool double-count check: subagents have their own `session_id` (verified in §"Architecture Patterns"). The Agent tool's `duration_ms` already includes the inner subagent's wall-clock. NO double-count risk under candidate (1).

  Recommend candidate (1) — temporal containment within the parent skill window, scoped to the parent session_id. Document the closed-form invariant in the spike: `body_ms + tool_ms + subagent_ms == skill_activated.duration_ms` within tolerance — verify on a per-row basis, NOT just on the per-skill aggregate (a single bad row can hide in a sum).

- **Tool latency definition (success-branch).** Recommendation:
  - `tool_ms = SUM(tools.duration_ms) WHERE tools.tool_name NOT IN ('Skill', 'Agent') AND tools.session_id = :sid AND tools.started_at BETWEEN skill_start AND skill_end`
  - Excluding `Skill` (it's the entry-point row, double-count risk) and `Agent` (already counted in `subagent_ms`).

- **Body latency definition (success-branch).** Recommendation:
  - `body_ms = skill_activated.duration_ms - subagent_ms - tool_ms` (residual computation)
  - This is the ONLY formula that satisfies the closed-form invariant. The spike's reconciliation test verifies `body_ms >= 0` (negative residuals = decomposition is wrong).

- **Empty-state UX (success-branch).** When `sample_count == 0`, return 200 with `body_ms=null`, `subagent_ms=null`, `tool_ms=null`, `low_sample=True`, sample_count=0 — mirroring `SkillLatencyResponse`'s D-03 pattern at `cmc/api/routes/skills.py:1238-1248`. Frontend renders "no data" empty-state, NOT a zero-bar.

- **Stacked-bar primitive (success-branch frontend).** Two options:
  1. Hand-roll a CSS flex-grow stacked bar (~30 LOC, pure presentational, no library)
  2. Reuse Recharts `BarChart` with stacked layout (already imported by SkillCostCard / TopSkills sparklines)

  Recommend option 1 — three integer values into a flex bar with three colored segments is simpler than configuring a Recharts stacked layout for a single-row "chart." Mirrors how `KpiTile` is hand-rolled rather than going through Recharts.

- **`SPIKE-FINDINGS.md` filename and location.** Mirror Phase 12's pattern (`.planning/research/SPIKE.md` was global; Phase 22's findings should be phase-scoped). Recommend `.planning/phases/22-skill-latency-overhead-spike-gated/22-01-SPIKE-FINDINGS.md` — phase-dir-scoped, padded prefix matches the plan number, `-FINDINGS` suffix is the outcome-document convention.

### Deferred Ideas (OUT OF SCOPE — DO NOT plan)

- **SKLP-12 (percentile-split breakdown — p50/p95/p99 per overhead category).** REQUIREMENTS.md explicitly defers this to v1.3, and conditions it on "only if SKLP-11 ships." If Phase 22 descopes SKLP-11, SKLP-12 stays deferred without further action. If SKLP-11 ships, SKLP-12 is still v1.3.
- **SKLP-13 (heatmap toggle on per-project skill breakdown).** v1.3 candidate. Different surface (per-project, not per-skill). Out of Phase 22 scope unconditionally.
- **Per-project overhead breakdown.** Not in SKLP-11. Don't add it. The success-branch endpoint is `/api/skills/{name}/overhead` — single per-skill rollup, no `?project_key=` filter.
- **Skill body content / source-of-truth scanning.** SKLP-11 is latency decomposition, not source-tree analysis. Don't read `~/.claude/skills/<name>/SKILL.md` from the endpoint.
- **Adding a `skill_completed` event to ingest.** Success Criterion #4 forbids parallel skill-event types. Even if a `skill_completed` event would simplify decomposition, it cannot ship in this phase.
- **Modifying ingest of `tools` rows.** The spike works against existing data shape. Don't add columns or new ingest paths.
- **Writing a CMPR-06 hook from this phase.** Phase 23 is independent; Phase 22's outcome must NOT alter Phase 23's plan surface.
- **Phase 19 SKLP-08/09/10 modifications.** Already shipped, locked, out of scope.
- **`MIN_LATENCY_SAMPLES` re-tuning.** 30 is the established v1.1 threshold. Don't second-guess it in this phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SKLP-11 | User can see per-skill latency overhead breakdown (body / subagent / tool stacked bar) — **spike-gated**: Phase 22 opens with mandatory feasibility check via `tools` temporal JOIN against `skill_activated.duration_ms`; if derivation unreliable, descopes to v1.3. | Spike target: empirical SQL probe of `otel_events` (`event_name='skill_activated'`, `duration_ms` attribute presence + sample-size at >= `MIN_LATENCY_SAMPLES=30` per skill) joined to `tools` (rows where `session_id` matches AND `started_at` falls within the skill's `[start, end]` temporal window). The decomposition formula `body_ms = skill.duration_ms - subagent_ms - tool_ms` is testable empirically. The spike succeeds iff: (a) >= 1 skill has >= 30 samples with `duration_ms` populated AND (b) per-row reconciliation (decomposed-sum vs `skill.duration_ms`) closes within tolerance on >= 95% of rows. Both conditions are testable with pure SQL against current `data/cmc.db`. |
</phase_requirements>

## Standard Stack

### Core (already in repo — DO NOT add deps)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SQLAlchemy + sqlmodel | existing | ORM + raw SQL via `sqlalchemy.text()` | Phase 14 / Phase 19 skills router uses `db.execute(text(...)).mappings().all()` for analytics — keep the pattern |
| FastAPI + Pydantic v2 | existing | Endpoint + DTO layer | Decimal-as-JSON-string invariant doesn't apply (overhead is integer ms); follow `SkillLatencyResponse` shape at `cmc/api/schemas/skills.py:178-195` |
| TanStack Query | existing | Frontend data fetching | Existing `useSkillLatency` / `useSkillCost` / `useSkillProjects` hooks at 60s/45s cadence — extend pattern with `useSkillOverhead` |
| TanStack Router | existing | File-based routes | `/skills/$name` already lives at `frontend/src/routes/skills_.$name.tsx` (trailing-underscore opt-out — Phase 14 Plan 05's load-bearing decision; Phase 19 Plan 04 added `SkillProjectsTable`) |
| Recharts | existing | Bar / sparkline rendering | Already imported by SkillCostCard / TopSkills; recommended NOT to use for the stacked bar — see Discretion item "Stacked-bar primitive" |
| pytest + pytest-asyncio | existing | Backend test framework | Phase 19 baseline: 598 passed / 0 failed |
| vitest | existing | Frontend test framework | Phase 19 baseline: 306 passed / 0 failed |
| Playwright | existing | E2E test framework | Phase 19 baseline: 7 passed / 2 skipped |
| `cmc.core.time.now_utc` | local | Naive UTC factory (POLI-06) | Any new Python timestamp MUST go through this — `datetime.utcnow` is banned |

**Zero net-new dependencies.** Locked by ROADMAP.md Phase 22 Success Criterion #4 verbatim: *"no new dependencies."* Locked also by STATE.md v1.2 invariant.

### Supporting (already imported elsewhere — reuse)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `sqlite3` CLI | 3.51.0 (system) | Spike's raw-output capture (Plan 01) | Spike commands run from project root with `sqlite3 data/cmc.db "..."`; mirrors Phase 12 Plan 01's verbatim-capture pattern |
| `cmc/api/routes/skills.py` `_LATENCY_SQL` (window-CTE percentile pattern) | existing | Reference pattern for the success-branch overhead SQL | Per-skill window-function CTE with `ROW_NUMBER() OVER (PARTITION BY ...)` is the established idiom; reuse the structure |
| `cmc/api/routes/skills.py` `_PROJECTS_PERCENTILE_SQL` | existing | Reference pattern for SQL that JOINs `otel_events` ↔ `sessions` (or `tools`) on `session_id` | Phase 19's Plan 02 SQL is the closest analog to the overhead-decomposition shape |
| `_RANGE_TO_DAYS` map | existing (`cmc/api/routes/skills.py:74`) | Standard 1d/7d/14d/30d range parameter handling | The overhead endpoint should expose `range: SkillRange = Literal["14d","30d"]` for parity with `/latency` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure-SQL decomposition (body_ms = duration - subagent - tool) | Python-side derivation after the SQL returns | SQL is preferred — single transaction, all bounds-checked at query time. Python-side risks float drift (every value is integer ms; Decimal not needed). |
| Per-row reconciliation tolerance check in the SQL | Tolerance check in Python after rows return | Python is preferred for the spike — easier to surface counter-examples in `SPIKE-FINDINGS.md`. SQL is preferred for the production endpoint. |
| Read `tools` table for both Skill-tool and tool-call rows | Add a new `skill_runs` materialized view | Forbidden by Success Criterion #4 (no parallel event types); the spike must work against the existing schema. |
| Separate `body_ms` event ingested at runtime | Computed at read-time | Forbidden by Success Criterion #4 (no parallel skill-event types). All decomposition is read-time over `tools` ↔ `otel_events` JOIN. |
| Hand-rolled stacked-bar CSS (success branch) | Recharts `BarChart` with stacked layout | Recharts is over-engineered for a 3-segment single-row bar; CSS flex with `flex-grow:1` per segment is ~20 LOC. |
| Single `/api/skills/{name}/overhead` endpoint (success branch) | Embed `overhead` field in `SkillLatencyResponse` | Two consumers want different cadences (latency is in TopSkills + detail page; overhead is detail-page-only). Single endpoint at `/skills/{name}/overhead` keeps the latency response shape stable for v1.1 / Phase 14 callers. |

**Installation:**
None. Net-zero dependency change locked by ROADMAP success criterion #4.

## Architecture Patterns

### Recommended Plan Structure

**Option 1 (RECOMMENDED): Sequential branching.**
```
22-01-spike-feasibility-and-decision-PLAN.md  (Wave 0 — mandatory)
  - Spike's raw SQL capture against data/cmc.db
  - Q-coverage: % of skill_activated rows with duration_ms attr (per skill, range = 30d)
  - Q-sample-size: per-skill row counts ≥ MIN_LATENCY_SAMPLES (30)
  - Q-tools-presence: per-skill, % of skill_activated rows that have ≥ 1 tool_call within
    [skill_start, skill_end] in same session
  - Q-reconciliation: per-row, abs(skill.duration_ms - (body+sub+tool)) ≤ TOLERANCE_MS;
    pass rate ≥ 95% across all rows in window
  - Outcome: SPIKE-FINDINGS.md outcome banner — YES (with 4 thresholds passed and verbatim
    SQL output cited per Q) or NO (with verbatim failure mode + counter-examples)
  - On YES: hand off to Plan 02-success (written next /gsd-plan-phase invocation)
  - On NO: hand off to Plan 02-descope (written next /gsd-plan-phase invocation)

[After Plan 01 commits, /gsd-plan-phase is re-invoked. Plans 02+ are written conditionally:]

IF spike YES:
  22-02-overhead-endpoint-PLAN.md  (Wave 1)
    - GET /api/skills/{name}/overhead — three-component decomposition SQL (citing
      Plan 01's verified columns/joins in front-matter)
    - SkillOverheadResponse: { range, name, sample_count, body_ms, subagent_ms,
      tool_ms, low_sample }
    - tests: empty-state (200, low_sample=True, all None); happy path (closed-form
      invariant: body+sub+tool == duration); per-row reconciliation regression test;
      no-path-leakage scan (no cwd / project_key in response)
  22-03-frontend-overhead-stacked-bar-PLAN.md  (Wave 2)
    - useSkillOverhead hook + SkillOverheadCard panel
    - Mount on routes/skills_.$name.tsx after SkillLatencySnapshot
    - Empty-state when sample_count == 0; low_sample badge when < 30
    - vitest (component empty-state, low-sample, formatting); Playwright (panel
      renders, no path leakage)

IF spike NO:
  22-02-descope-and-document-PLAN.md  (Wave 1)
    - Update REQUIREMENTS.md: SKLP-11 entry → "Deferred to v1.3"
    - Move SKLP-11 from `## v1.2 Requirements > ### Skills Polish` to
      `## Future Requirements > ### Skills (v1.3+)` (anchored on SPIKE-FINDINGS.md)
    - Update Traceability table (line 97 `SKLP-11 | Phase 22 | Pending` →
      `SKLP-11 | Phase 22 | Deferred to v1.3 (spike negative finding,
      see SPIKE-FINDINGS.md)`)
    - Update v1.2 requirement count (13 → 12 in v1.2; SKLP-11 in v1.3 list)
    - Update Phase 23 dependency note in ROADMAP.md if needed (already says
      "runs cleanly even if SKLP-11 descoped" — verify still accurate)
    - No code changes
    - tests: docs-only verification — REQUIREMENTS.md status grep, SPIKE-FINDINGS.md
      anchor existence
```

**Option 2 (NOT RECOMMENDED): Pre-branched up-front.**
```
22-01-spike-PLAN.md
22-02-overhead-endpoint-PLAN.md         (gated; runs only if spike YES)
22-03-frontend-overhead-PLAN.md         (gated; runs only if spike YES)
22-04-descope-PLAN.md                   (gated; runs only if spike NO)
```
Rejected: Plans 02-03 (success branch) cannot cite specific SQL derivation sources in their front-matter (Success Criterion #1 — verbatim) without the spike output. Pre-branching forces placeholder citations, which violates the "no fake decomposition" invariant in spirit.

### System Architecture Diagram (success-branch only — descope branch is docs-only)

```
[Stacked-bar panel on /skills/$name]
       |
       | TanStack Query (60s)
       v
GET /api/skills/{name}/overhead?range=14d
       |
       v
[FastAPI route: skill_overhead in cmc/api/routes/skills.py]
       |
       | sqlalchemy.text() — single CTE-based query
       v
+----------------------------------------------------------+
|  WITH skill_runs AS (                                    |
|    SELECT o.session_id, o.ts AS skill_start,             |
|           skill.duration_ms AS total_ms                  |
|    FROM otel_events o                                    |
|    WHERE o.event_name = 'skill_activated'                |
|      AND o.attrs_skill_name = :name                      |
|      AND o.ts >= datetime(:since)                        |
|      AND total_ms IS NOT NULL  -- defensive              |
|  ),                                                      |
|  tools_in_window AS (                                    |
|    SELECT sr.session_id, sr.skill_start, sr.total_ms,    |
|           t.tool_name, t.duration_ms AS tool_ms,         |
|           t.started_at                                   |
|    FROM skill_runs sr                                    |
|    LEFT JOIN tools t                                     |
|      ON t.session_id = sr.session_id                     |
|     AND t.started_at >= sr.skill_start                   |
|     AND t.started_at < datetime(sr.skill_start,          |
|                                 '+' || sr.total_ms       |
|                                 || ' milliseconds')      |
|     AND t.duration_ms IS NOT NULL                        |
|  ),                                                      |
|  decomposed AS (                                         |
|    SELECT session_id, skill_start, total_ms,             |
|      COALESCE(SUM(CASE WHEN tool_name = 'Agent'          |
|        THEN tool_ms END), 0) AS subagent_ms,             |
|      COALESCE(SUM(CASE WHEN tool_name NOT IN             |
|        ('Skill','Agent') THEN tool_ms END), 0) AS tool_ms|
|    FROM tools_in_window                                  |
|    GROUP BY session_id, skill_start, total_ms            |
|  )                                                       |
|  SELECT                                                  |
|    COUNT(*) AS sample_count,                             |
|    SUM(total_ms - subagent_ms - tool_ms) / COUNT(*)      |
|      AS body_ms,                                         |
|    SUM(subagent_ms) / COUNT(*) AS subagent_ms,           |
|    SUM(tool_ms) / COUNT(*) AS tool_ms                    |
|  FROM decomposed;                                        |
+----------------------------------------------------------+
       |
       v
[SkillOverheadResponse: { sample_count, body_ms, subagent_ms,   ]
[                         tool_ms, low_sample }                  ]
       |
       v
[CSS flex stacked bar — 3 segments sized by *_ms]
```

(The diagram shows the success-branch SQL shape. Plan 01's spike runs an exploratory variant of this query first to verify (a) data presence, (b) per-row reconciliation, and (c) sample size — only then is the production endpoint query approved.)

### Component Responsibilities (success-branch only)

| Capability | File | Notes |
|------------|------|-------|
| Spike SQL capture | `.planning/phases/22-skill-latency-overhead-spike-gated/22-01-SPIKE-FINDINGS.md` | Verbatim sqlite3 output for Q-coverage / Q-sample-size / Q-tools-presence / Q-reconciliation |
| Overhead endpoint route | `cmc/api/routes/skills.py` (extend; ~80 LOC added) | Single new `@router.get("/skills/{name}/overhead")` handler + 1 new SQL constant `_OVERHEAD_SQL` |
| Overhead response schema | `cmc/api/schemas/skills.py` (extend) | `SkillOverheadResponse` Pydantic model |
| Backend tests | `backend/tests/test_skills_router.py` (extend) | empty-state, happy-path closed-form invariant, per-row reconciliation, no-path-leakage |
| Frontend types | `frontend/src/lib/api.ts` + `lib/types.ts` | `SkillOverheadResponse` TS mirror; `fetchSkillOverhead` + `qk.skillOverhead` |
| Frontend hook | `frontend/src/lib/queries.ts` | `useSkillOverhead(name, range)` — 60s cadence |
| Frontend panel | `frontend/src/components/panels/SkillOverheadCard.tsx` (NEW) | Stacked bar with 3 segments + `low_sample` chip + empty-state |
| Frontend mount | `frontend/src/routes/skills_.$name.tsx` | Insert `<SkillOverheadCard name={name} range="14d" />` after `<SkillLatencySnapshot>` |
| Frontend tests | `frontend/src/components/panels/__tests__/SkillOverheadCard.test.tsx` (NEW) | empty-state, low-sample, formatting, three-segment proportions |
| Playwright e2e | `frontend/tests/e2e/skills-detail.spec.ts` (extend) | Panel renders, `data-testid="skill-overhead-stacked-bar"` exists, no path leakage scan |

### Component Responsibilities (failure-branch — docs only)

| Capability | File | Notes |
|------------|------|-------|
| Spike findings | `.planning/phases/22-skill-latency-overhead-spike-gated/22-01-SPIKE-FINDINGS.md` | Negative-finding outcome banner + verbatim SQL counter-evidence + recommended re-evaluation criteria for v1.3 |
| REQUIREMENTS.md status flip | `.planning/REQUIREMENTS.md` | SKLP-11 line 16: `Pending (spike-gated; ...)` → `Deferred to v1.3 (spike negative finding, see SPIKE-FINDINGS.md)` ; move bullet from `## v1.2 Requirements > ### Skills Polish` to `## Future Requirements (deferred) > ### Skills (v1.3+)`; update line 97 traceability row similarly; update line 102 ("v1.2 requirements: 13 total" → 12) and line 111 (Phase 22 requirement count) |
| ROADMAP.md verify | `.planning/ROADMAP.md` | Confirm Phase 23 dependency note ("runs cleanly even if SKLP-11 descoped") still accurate; no edit expected |
| Verifier check | (existing test suites) | No new tests; existing pytest/vitest/playwright must still pass at Phase 19 baseline |

### Pattern 1: Two-Tier Spike Threshold

**What:** Spike resolves YES iff BOTH thresholds pass; resolves NO iff EITHER fails.

**When to use:** Mandatory for Plan 01. Single-tier ("just check sample size") is insufficient — a skill could have 100 samples but only 5% of them reconcile cleanly, which would mean any decomposition we ship is wrong on 95% of rows.

**Threshold definitions (recommended; planner may tighten):**

1. **Coverage threshold (CT-1):** ≥ 1 skill name has ≥ `MIN_LATENCY_SAMPLES = 30` rows where `event_name='skill_activated'` AND `attrs_skill_name=<name>` AND the row's `duration_ms` attribute is present (non-NULL).
2. **Reconciliation threshold (CT-2):** Across the rows that pass CT-1, per-row `abs(skill.duration_ms - (body_ms + subagent_ms + tool_ms)) ≤ TOLERANCE_MS` for ≥ 95% of rows. Recommended `TOLERANCE_MS = 100` (100ms slack absorbs JSONL → OTEL clock-skew jitter).
3. **Negative-residual guard (CT-3):** ZERO rows have `body_ms < 0` (negative residual = decomposition is structurally wrong). Even 1 negative row fails the spike.
4. **Sub-agent containment (CT-4):** ZERO rows have `tools.tool_name='Agent'` rows that overlap a `skill_activated` window AND a `tools.tool_name in ('Read','Edit','Bash',...)` row in the SAME session within the same window — verifying the §"Architecture Patterns" claim that subagent inner tools land in the subagent's own session, not the parent's. (If this fails, double-counting risk is real and the formula must be re-derived; spike fails until the formula handles it.)

**Example (citing the planner's pre-defined thresholds):**
```sql
-- Plan 01 SPIKE: Q-coverage probe
SELECT
  o.attrs_skill_name AS skill,
  COUNT(*) AS total_events,
  SUM(CASE WHEN
    (SELECT json_extract(value,'$.value.stringValue')
       FROM json_each(json_extract(o.body,'$.record.attributes'))
      WHERE json_extract(value,'$.key')='duration_ms') IS NOT NULL
  THEN 1 ELSE 0 END) AS with_duration
FROM otel_events o
WHERE o.event_name = 'skill_activated'
  AND o.ts >= datetime('now', '-30 days')
GROUP BY o.attrs_skill_name
HAVING with_duration >= 30
ORDER BY with_duration DESC;
-- CT-1 PASS iff ≥ 1 row returned. CT-1 FAIL iff zero rows.
```

**Critical:** Thresholds must be defined in the plan's front-matter `must_haves.truths`, not inferred at run-time. The plan-checker enforces this.

### Pattern 2: Temporal-JOIN with Half-Open Interval

**What:** Join `otel_events.skill_activated` row to `tools` rows whose `started_at` falls in `[skill.ts, skill.ts + skill.duration_ms)`.

**When to use:** This is the load-bearing JOIN for the success branch. The interval is half-open (left-closed, right-open) to avoid double-counting when one skill ends precisely as another starts.

**Example:**
```sql
-- Mirrors the SQL pattern from cmc/api/routes/skills.py:_PROJECTS_PERCENTILE_SQL
-- but joins tools instead of sessions, with a temporal predicate.
SELECT
  sr.session_id,
  sr.skill_start,
  sr.total_ms,
  t.tool_name,
  t.duration_ms,
  t.started_at
FROM (
  SELECT
    o.session_id,
    o.ts AS skill_start,
    CAST((SELECT json_extract(value,'$.value.stringValue')
            FROM json_each(json_extract(o.body,'$.record.attributes'))
           WHERE json_extract(value,'$.key')='duration_ms'
           LIMIT 1) AS INTEGER) AS total_ms
  FROM otel_events o
  WHERE o.event_name = 'skill_activated'
    AND o.attrs_skill_name = :name
    AND o.ts >= datetime(:since)
) sr
LEFT JOIN tools t
  ON t.session_id = sr.session_id
 AND t.started_at >= sr.skill_start
 AND t.started_at <  datetime(sr.skill_start, '+' || sr.total_ms || ' milliseconds')
 AND t.duration_ms IS NOT NULL
```

**Critical SQLite caveat:** SQLite's `datetime(X, '+N milliseconds')` modifier was added in SQLite 3.42 (May 2023); this repo runs SQLite 3.51.0 (verified 2026-05-07 via `sqlite3 --version`), so the modifier is available. If a future SQLite-version downgrade lands, the planner must replace this with arithmetic on `julianday()` — flag in spike.

### Pattern 3: Closed-Form Reconciliation Test (the spike's load-bearing assertion)

**What:** Per-row, verify `body_ms + subagent_ms + tool_ms ≈ skill.duration_ms` within `TOLERANCE_MS`.

**Why:** Aggregate sums hide per-row defects. A spike that checks only `SUM(body_ms) + SUM(sub) + SUM(tool) ≈ SUM(duration)` can pass while individual rows are wildly wrong (one row over-counts, the next under-counts, the sums net out).

**Example (Python-side, after SQL returns):**
```python
# Spike's reconciliation test (Plan 01)
TOLERANCE_MS = 100

rows = [...]  # from the temporal-JOIN SQL
fail_count = 0
negative_count = 0
for r in rows:
    decomposed = r["body_ms"] + r["subagent_ms"] + r["tool_ms"]
    if r["body_ms"] < 0:
        negative_count += 1
    if abs(r["total_ms"] - decomposed) > TOLERANCE_MS:
        fail_count += 1

reconciliation_rate = 1.0 - (fail_count / len(rows))
spike_pass = (
    len(rows) >= MIN_LATENCY_SAMPLES
    and reconciliation_rate >= 0.95
    and negative_count == 0
)
```

The Plan 01 SUMMARY must publish `reconciliation_rate`, `negative_count`, and per-row counter-examples (sample of 5 worst-offenders if spike fails).

### Pattern 4: Front-Matter Citation (success-branch plans)

**What:** Plans 02-success and Plan 03-success cite the specific SQL columns / temporal-JOIN derivation source for each of body_ms, subagent_ms, tool_ms in their plan front-matter.

**Why:** Success Criterion #1 is verbatim: *"phase plan front-matter cites the specific SQL column or temporal-JOIN derivation source for each of body_ms / subagent_ms / tool_ms."*

**Example (proposed front-matter shape for Plan 02-success):**
```yaml
---
phase: 22-skill-latency-overhead-spike-gated
plan: 02
type: execute
wave: 1
depends_on: ["22-01"]
files_modified:
  - backend/cmc/api/routes/skills.py
  - backend/cmc/api/schemas/skills.py
  - backend/tests/test_skills_router.py
must_haves:
  truths:
    - "body_ms derivation cited: residual = otel_events[skill_activated].body.record.attributes['duration_ms'].stringValue (CAST to INTEGER) − subagent_ms − tool_ms (per SPIKE-FINDINGS.md §Outcome → §body_ms derivation)"
    - "subagent_ms derivation cited: SUM(tools.duration_ms) WHERE tools.tool_name='Agent' AND tools.session_id = skill_activated.session_id AND tools.started_at >= skill_activated.ts AND tools.started_at < datetime(skill_activated.ts, '+' || skill_activated.duration_ms || ' milliseconds') (per SPIKE-FINDINGS.md §subagent_ms derivation)"
    - "tool_ms derivation cited: SUM(tools.duration_ms) WHERE tools.tool_name NOT IN ('Skill','Agent') AND tools.session_id = skill_activated.session_id AND temporal containment same as subagent_ms (per SPIKE-FINDINGS.md §tool_ms derivation)"
    - "Reconciliation invariant verified in test_skills_router.py::test_skill_overhead_closed_form: body+sub+tool == duration within TOLERANCE_MS=100 on every row"
    - "low_sample threshold cited: MIN_LATENCY_SAMPLES=30 (cmc/api/routes/skills.py:606), reused — NOT redefined"
---
```

The plan-checker must verify (mechanically) that each truth references a specific SPIKE-FINDINGS.md §Outcome section and that the §Outcome sections exist.

### Anti-Patterns to Avoid

- **Pre-deciding the spike outcome.** This research's Empirical Reality Check warns the spike will likely fail today — but the planner must NOT shortcut to writing the descope branch only. If a fresh skill invocation lands between research-time and Plan 01 execution, the spike could pass. Plan 01 MUST run the SQL against the live DB at execution-time, not at research-time.
- **Ratio guesswork.** "Estimate body_ms as 60% of duration_ms" — verbatim forbidden by Success Criterion #1.
- **Fabricated event types.** Inventing a `skill_completed` or `skill_body_done` event to make decomposition easier — forbidden by Success Criterion #4.
- **Joining `otel_events.session_id` directly.** Phase 12 BUG-B / SPIKE.md LOCK-5: `session_id` column is NULL for ALL pre-fix `skill_activated` rows. Use `session.id` (dotted) extracted from `body.record.attributes` via `json_each` — same pattern as `cmc/api/routes/skills.py:_COST_REQUEST_SCOPED_SQL`.
- **Bare `json_extract(body, '$.duration_ms')`.** OTEL attributes are an array of `{key,value}` objects, NOT a flat dict. Use `json_each(json_extract(body,'$.record.attributes'))` and filter `$.key`.
- **Filter on `event_name = 'claude_code.skill_activated'`** (with prefix). The ingest layer strips the prefix; SQL filters reference the bare name `'skill_activated'`. (Phase 14 / Phase 19 idiom; documented at `cmc/api/routes/skills.py:18-19`.)
- **Counting the `Skill`-tool row as part of the body.** The `Skill` tool is the entry-point row (its `duration_ms` is time-to-spawn, ~6ms-17s). Including it in `tool_ms` would double-count the work that `body_ms` already represents. Excluding pattern: `tool_name NOT IN ('Skill', 'Agent')`.
- **Counting subagent inner-tool rows under the parent session.** The subagent has its own session_id (verified: 0–1 tool overlap with each Agent invocation in the parent session); inner tools live in the subagent's session JSONL. Don't double-count.
- **Spawning a fresh skill invocation as part of the spike** (Phase 12 Wave 1 fallback). The Phase 12 spike's "no data → spawn a skill" fallback is NOT in scope here. Phase 22's spike resolves YES/NO from existing data only. If existing data is insufficient for a YES, that IS the negative finding — descope.
- **Adding cost (`cost_usd`) to the overhead response.** SKLP-11 is latency decomposition. Cost is SKLP-05's surface. Out of scope.
- **Using `localtime` modifier in any window CTE.** ROADMAP success criterion #5 (Phase 19) — DST-safety; UTC arithmetic only.
- **Hard-coding `TOLERANCE_MS = 100` without surfacing it.** The reconciliation tolerance MUST be declared in the spike plan's front-matter so the threshold is auditable post-hoc.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-skill window-CTE percentile | DIY pure-SQL `GROUP BY` aggregations | Existing `_LATENCY_SQL` window-CTE pattern (`cmc/api/routes/skills.py:1012-1058`) | Phase 14 already shipped this idiom; reuse the CTE skeleton, swap the SELECT projection. |
| OTEL attribute extraction (e.g., `duration_ms`) | Bare `json_extract(body,'$.duration_ms')` | `json_each(json_extract(o.body,'$.record.attributes'))` + filter on `$.key='duration_ms'`, read `$.value.stringValue`, CAST INTEGER | OTEL attributes are an array of `{key,value}` objects — bare `json_extract` returns NULL silently. Phase 12 Pitfall 2. |
| Session correlation on `otel_events` | Bare `o.session_id =` JOIN | Currently `attrs_skill_name` column IS available (Phase 13 INGST-11); for session, prefer the populated `session_id` column for CURRENT-period rows, but fall back to extracting `session.id` (dotted) from body for PRE-Phase-13 rows | Phase 13 fixed BUG-B (the column was NULL for pre-fix rows). Mixed-population is real. The spike must verify which path applies for the rows it's reading. |
| Stacked-bar chart | Recharts `BarChart` with `stackId` config | CSS flex with `flex-grow:1` per segment | Three integer values into a single horizontal bar; Recharts is overkill. ~20 LOC of presentational CSS. |
| Range parameter | DIY range parser | `SkillRange` Literal `["14d","30d"]` (`cmc/api/schemas/skills.py:30`) + `_RANGE_TO_DAYS` (`cmc/api/routes/skills.py:74`) | Existing convention; mirror `/latency` exactly. |
| Low-sample threshold | New constant | `MIN_LATENCY_SAMPLES = 30` (`cmc/api/routes/skills.py:606`) | Single source of truth; reused by `/latency` and `/projects`. Success Criterion #2 verbatim. |
| Frontend query hook | DIY `useEffect` + `fetch` | TanStack Query `useQuery` via existing `useSkillLatency` pattern (`frontend/src/lib/queries.ts`) | 60s cadence, retry policy, cache invalidation — all already wired. |
| Empty-state empty-state on the panel | DIY null-check + fallback JSX | Mirror `SkillLatencySnapshot`'s low-sample empty state (`frontend/src/routes/skills_.$name.tsx:42-131`) | Already established pattern: same caption ("Low sample — interpret with care"), same KpiTile shapes. |
| Decimal precision for ms values | `Decimal` import / `cost_usd` style serialization | Plain `int \| None` | Latency is integer ms (per `SkillLatencyResponse.p50_ms: int \| None`). Decimal is for money only (v1.1 invariant). |

**Key insight:** Phase 14 and Phase 19 already shipped 6 read-time analytics endpoints with the exact patterns the success-branch needs (CTE structure, window-function percentiles, dual-path attribution, no path leakage, low_sample threshold, range parameter). The success-branch is *additive* — extend the patterns, don't reinvent them. The spike (Plan 01) is the only novel work.

## Runtime State Inventory

> Skipped — Phase 22 is a code/config additive phase OR a docs-only phase (depending on spike outcome). No renames, no schema migrations, no string replacements that could leave runtime state stale.

## Common Pitfalls

### Pitfall 1: SPIKE.md LOCK-3 (`duration_ms` presence) is TENTATIVE — not VERIFIED

**What goes wrong:** The plan author assumes `skill_activated.duration_ms` is reliably present, runs the spike against a production DB with zero rows, and concludes "no data" without distinguishing "Claude Code 2.1.116 doesn't emit it" from "we just haven't run a fresh skill invocation since the Phase 13 ingest fix landed."

**Why it happens:** Phase 12 SPIKE.md LOCK-3 is `TENTATIVE — assumed present by analogy with api_request`. The single existing `skill_activated` row in `data/cmc.db` (captured 2026-05-02 during Phase 12 Wave 1) has NO `duration_ms` attribute. Whether the absence is structural (Claude Code never emits it on `skill_activated` events) or transient (the Phase 12 spike used a trivial test skill that was too fast to register, or the `OTEL_LOG_TOOL_DETAILS=1` env was misconfigured) is unresolved.

**How to avoid:** The spike's SPIKE-FINDINGS.md MUST distinguish these two failure modes explicitly. If `total_events > 0` but `with_duration_ms == 0`, the negative-finding doc must note "Claude Code 2.1.116 confirmed NOT to emit `duration_ms` on `skill_activated` events" as a STRONGER finding than "insufficient data." If `total_events == 0`, the doc must note "no production skill_activated events landed in the 30-day window" as a WEAKER finding (could resolve by user activity).

**Warning signs:** Plan 01 outputs a SUMMARY that says "spike failed" without naming WHICH threshold failed (CT-1 / CT-2 / CT-3 / CT-4) and WHY.

### Pitfall 2: `attrs_skill_name` column is NULL for pre-Phase-13 rows

**What goes wrong:** The spike SQL filters `WHERE attrs_skill_name = :name` and gets zero rows even though `body.record.attributes` contains `skill.name`.

**Why it happens:** The `attrs_skill_name` indexed column is populated by `extract_skill_attr` at ingest time (`cmc/ingest/otel_parser.py:83-102`). The Phase 12 spike row (only existing skill_activated row in `data/cmc.db`) was ingested BEFORE the parser was updated to read `skill.name` (dotted) — its column is NULL despite the body containing the attribute.

**How to avoid:** The spike's Q-coverage probe should ALSO query `attrs_skill_name IS NULL AND body has skill.name` to surface the pre-Phase-13 population. If the only rows present are pre-Phase-13, the spike's negative finding is ambiguous (could be ingest-bug-fixed, but no fresh data has arrived). Document this separately.

**Warning signs:** Q-coverage returns zero rows, Q-on-attribute (`SELECT COUNT(*) FROM otel_events WHERE event_name='skill_activated'`) returns >0. Mismatch reveals pre-Phase-13 rows.

### Pitfall 3: SQLite `datetime(X, '+N milliseconds')` modifier requires SQLite 3.42+

**What goes wrong:** The temporal-JOIN SQL fails on a downgraded SQLite (e.g., a Linux runner with system SQLite < 3.42).

**Why it happens:** `'+N milliseconds'` modifier was added in SQLite 3.42 (May 2023). The current host is SQLite 3.51.0 (`sqlite3 --version` 2026-05-07), so it works. CI / Docker / future Linux porting (PLAT-01) might run older SQLite.

**How to avoid:** The spike doc records the SQLite version in its preamble (`SELECT sqlite_version();`). The success-branch SQL has a fallback path using `julianday()` arithmetic if the version is < 3.42. The spike pyramid: `julianday(skill_start) + (total_ms / 86400000.0)` — ms-per-day = 86,400,000.

**Warning signs:** Test fails with `near ")": syntax error` or `unknown modifier`.

### Pitfall 4: Subagent inner tools in the parent session (double-count risk)

**What goes wrong:** The decomposition counts the same tool work twice — once as subagent_ms (the Agent tool's full duration) and once as tool_ms (the Read/Edit/Bash rows that the subagent fired).

**Why it happens:** If subagents share the parent's `session_id` (bug or schema-change in the future), the temporal-JOIN catches both the parent's Agent row AND the subagent's inner tool rows.

**Empirical state at HEAD (verified 2026-05-07):** Subagent inner tools live in a SEPARATE session_id (different JSONL file). Parent's `tools` table contains only the Agent row, NOT the subagent's Read/Edit calls. CT-4 of the spike verifies this invariant.

**How to avoid:** Spike CT-4 explicitly tests the invariant. Production endpoint excludes `tool_name='Skill'` and `tool_name='Agent'` from `tool_ms` — the Agent row's duration is fully accounted for in `subagent_ms`.

**Warning signs:** Reconciliation rate drops below 95% in CT-2; per-row counter-examples show `body_ms < 0` for skill rows that contained an Agent invocation.

### Pitfall 5: Skill-tool row is the entry point, NOT the body

**What goes wrong:** The plan author treats `tools.tool_name='Skill'` as the skill execution and uses its `duration_ms` (typically 6ms) as the total. The actual skill work is the assistant turns AFTER the Skill tool returns the body content.

**Why it happens:** Confusion between "the skill is being invoked" (`Skill` tool fires, returns the body content as a tool result) and "the skill is executing" (subsequent assistant turns operate on the body).

**Empirical state (verified 2026-05-07):** 16 `tools.tool_name='Skill'` rows. Sample durations: 6ms, 1518ms, 4017ms, 16961ms, 30ms, 430ms, 29ms, 21ms, 25ms, 20ms, 25ms, 15ms, 24ms, 22ms, 21ms, 14608ms. Median is ~22ms, max is ~17s. These are spawn times, not execution times.

**How to avoid:** The spike treats `skill_activated.duration_ms` (OTEL attribute, NOT a `tools.duration_ms`) as the total execution time. The `tools.tool_name='Skill'` row is EXCLUDED from `tool_ms` (`tool_name NOT IN ('Skill', 'Agent')`).

**Warning signs:** SUM-aggregate latency is suspiciously small (sub-100ms p95 for a skill that humans observe takes 5+ minutes) — means the wrong column is being read.

### Pitfall 6: Pending Agent rows (NULL `ended_at` / NULL `duration_ms`)

**What goes wrong:** The temporal-JOIN includes Agent rows with NULL `duration_ms`, breaking the SUM (or worse, silently coercing to 0 and under-counting subagent_ms).

**Why it happens:** 65 of 739 Agent rows in `data/cmc.db` are still `pending` (no `ended_at`, NULL `duration_ms`) — Agent invocations that haven't finished yet (or whose subagent crashed).

**How to avoid:** The temporal-JOIN includes `AND t.duration_ms IS NOT NULL` (already in the proposed SQL above). Pending rows are excluded; the spike's SUMMARY notes the percentage of skill_activated rows whose tools-window contained ≥ 1 pending Agent row (potential signal for "long-tail latency that we systematically under-count").

**Warning signs:** `body_ms` skews high relative to `subagent_ms` for skills known to delegate heavily to subagents.

### Pitfall 7: Pre-Phase-13 BUG-B (session_id column NULL)

**What goes wrong:** The spike SQL JOINs `tools.session_id = otel_events.session_id` and gets zero rows because `otel_events.session_id` was NULL for ALL pre-Phase-13 rows.

**Why it happens:** Phase 12 SPIKE.md BUG-B documented that the v1.0 ingest read the wrong attribute key (`session_id` underscore instead of `session.id` dotted). Phase 13 fixed it forward, but pre-fix rows have `session_id = NULL` permanently.

**Empirical state (verified 2026-05-07):** The single skill_activated row in `data/cmc.db` HAS its `session_id` column populated (`d3dce741-...`). So Phase 13's fix worked for that row's surface. But the spike must verify that ALL skill_activated rows in the spike's window (last 30d) have non-NULL `session_id` before relying on the JOIN.

**How to avoid:** The spike's Q-coverage probe ALSO returns `SUM(CASE WHEN session_id IS NULL THEN 1 ELSE 0 END)` for the skill_activated rows. If any are NULL, the spike must use the body-extraction fallback for those rows (or exclude them from the sample).

**Warning signs:** sample_count is high in Q-coverage but the temporal JOIN returns zero rows — means session_id is NULL on the skill side.

### Pitfall 8: `cmc/api/routes/skills.py` already at 1446 lines

**What goes wrong:** Adding the success-branch endpoint pushes the file to ~1530 lines, edging into "split this file" territory.

**Why it happens:** Phase 14 + Phase 19 stacked extensions on the same file. Each new endpoint adds ~80 LOC of route + SQL constants.

**How to avoid:** Stay in `skills.py` for Phase 22; defer file-split refactor to a later polish phase. The endpoint is small (~80 LOC additional). The SQL constants are co-located with `_LATENCY_SQL` and `_PROJECTS_PERCENTILE_SQL`.

**Warning signs:** None for Phase 22 — flagged for posterity.

### Pitfall 9: Plan 02-success / Plan 03-success cannot be pre-written

**What goes wrong:** The planner writes Plans 02 and 03 in the same session as Plan 01, with placeholder citations like `body_ms derivation: TBD by spike` in front-matter.

**Why it happens:** Habit. Most phases pre-write all plans in one batch.

**How to avoid:** Plan 01 commits its SUMMARY (with the verified derivation sources or the negative-finding doc). The planner re-runs `/gsd-plan-phase` to add Plans 02+ AFTER reading the SUMMARY. Each success-branch plan's front-matter cites SPIKE-FINDINGS.md sections by anchor.

**Warning signs:** Plans 02-success appear with front-matter that says "TBD" or "see SPIKE-FINDINGS.md (to be created)" — these are placeholders, not citations.

### Pitfall 10: Frontend mount duplicates a panel

**What goes wrong:** `<SkillOverheadCard>` is mounted in `routes/skills_.$name.tsx` BUT also accidentally exported from `components/panels/index.ts` as a default export, leading to a double-import collision.

**Why it happens:** Phase 14 Plan 05 + Phase 19 Plan 04 both established the panel-barrel-export pattern (`frontend/src/components/panels/index.ts` exports `SkillCostCard`, `SkillProjectsTable`, `SkillRunsTable`, etc.). Adding `SkillOverheadCard` requires both creating the file AND adding the export.

**How to avoid:** The success-branch frontend plan's front-matter `must_haves.truths` includes "SkillOverheadCard exported from components/panels/index.ts" — verifiable mechanically.

**Warning signs:** `tsc` clean but `vite` build fails with "module not found" for the import in `skills_.$name.tsx`.

## Code Examples

### Spike Q-coverage probe (Plan 01, Wave 0)

```sql
-- Source: Phase 22 Plan 01 spike — Q-coverage threshold (CT-1 + CT-3 + Pitfall 2/7 disambiguation)
-- Run from project root: sqlite3 -header -column data/cmc.db "<this query>"
WITH skill_events AS (
  SELECT
    o.id,
    o.ts,
    o.session_id AS column_session_id,
    o.attrs_skill_name AS column_skill_name,
    (SELECT json_extract(value,'$.value.stringValue')
       FROM json_each(json_extract(o.body,'$.record.attributes'))
      WHERE json_extract(value,'$.key')='skill.name' LIMIT 1) AS body_skill_name,
    (SELECT json_extract(value,'$.value.stringValue')
       FROM json_each(json_extract(o.body,'$.record.attributes'))
      WHERE json_extract(value,'$.key')='session.id' LIMIT 1) AS body_session_id,
    CAST((SELECT json_extract(value,'$.value.stringValue')
            FROM json_each(json_extract(o.body,'$.record.attributes'))
           WHERE json_extract(value,'$.key')='duration_ms' LIMIT 1) AS INTEGER) AS duration_ms
  FROM otel_events o
  WHERE o.event_name = 'skill_activated'
    AND o.ts >= datetime('now', '-30 days')
)
SELECT
  COALESCE(column_skill_name, body_skill_name, '<UNKEYED>') AS skill_name,
  COUNT(*) AS total_events,
  SUM(CASE WHEN duration_ms IS NOT NULL THEN 1 ELSE 0 END) AS with_duration_ms,
  SUM(CASE WHEN column_session_id IS NULL AND body_session_id IS NOT NULL THEN 1 ELSE 0 END) AS pre_phase_13_session_rows,
  SUM(CASE WHEN column_skill_name IS NULL AND body_skill_name IS NOT NULL THEN 1 ELSE 0 END) AS pre_phase_13_skill_rows
FROM skill_events
GROUP BY 1
ORDER BY with_duration_ms DESC;
```

**Outcome interpretation:**
- CT-1 PASS iff at least one row has `with_duration_ms >= 30`.
- CT-1 FAIL with diagnosis: if `total_events == 0`, "no production skill_activated events." If `total_events > 0` and `with_duration_ms == 0`, "Claude Code 2.1.116 confirmed NOT to emit duration_ms on skill_activated events — STRUCTURAL FAILURE, descope clean."

### Spike Q-reconciliation probe (Plan 01, Wave 0 — only runs if CT-1 passes)

```sql
-- Source: Phase 22 Plan 01 spike — Q-reconciliation per-row (CT-2 + CT-3 + CT-4)
-- Output: every skill_activated row in window, with body_ms / subagent_ms / tool_ms decomposed
-- and a residual column. Manual scan for residual > 100 (CT-2) and body_ms < 0 (CT-3).
WITH skill_events AS (
  SELECT
    o.id AS skill_id,
    o.ts AS skill_start,
    o.attrs_skill_name AS skill_name,
    o.session_id,
    CAST((SELECT json_extract(value,'$.value.stringValue')
            FROM json_each(json_extract(o.body,'$.record.attributes'))
           WHERE json_extract(value,'$.key')='duration_ms' LIMIT 1) AS INTEGER) AS total_ms
  FROM otel_events o
  WHERE o.event_name = 'skill_activated'
    AND o.ts >= datetime('now', '-30 days')
),
skill_with_duration AS (
  SELECT * FROM skill_events WHERE total_ms IS NOT NULL AND session_id IS NOT NULL
),
overlapping_tools AS (
  SELECT
    s.skill_id,
    s.skill_name,
    s.total_ms,
    t.tool_name,
    t.duration_ms AS tool_dur
  FROM skill_with_duration s
  LEFT JOIN tools t
    ON t.session_id = s.session_id
   AND t.started_at >= s.skill_start
   AND t.started_at <  datetime(s.skill_start, '+' || s.total_ms || ' milliseconds')
   AND t.duration_ms IS NOT NULL
),
decomposed AS (
  SELECT
    skill_id,
    skill_name,
    MAX(total_ms) AS total_ms,
    COALESCE(SUM(CASE WHEN tool_name = 'Agent' THEN tool_dur END), 0) AS subagent_ms,
    COALESCE(SUM(CASE WHEN tool_name NOT IN ('Skill','Agent') THEN tool_dur END), 0) AS tool_ms
  FROM overlapping_tools
  GROUP BY skill_id, skill_name
)
SELECT
  skill_id,
  skill_name,
  total_ms,
  total_ms - subagent_ms - tool_ms AS body_ms,
  subagent_ms,
  tool_ms,
  ABS(total_ms - (total_ms - subagent_ms - tool_ms) - subagent_ms - tool_ms) AS residual_ms,
  CASE WHEN (total_ms - subagent_ms - tool_ms) < 0 THEN 1 ELSE 0 END AS negative_residual
FROM decomposed
ORDER BY residual_ms DESC, body_ms ASC;
```

(Note: `residual_ms` will be 0 by construction in this query — body_ms is computed as the residual. The CT-2 reconciliation is a **separate, future-data-source-driven** invariant: when a future schema introduces an *independent* `body_ms` measurement, this query's `body_ms` column should match that measurement within `TOLERANCE_MS=100`. For SKLP-11 v1.2, the residual computation IS the body_ms definition; CT-2 is satisfied trivially. The honest interpretation of CT-2 is therefore: **CT-2 passes if `negative_residual == 0` across the sample**, because a residual computation can only be wrong if it produces negative values, which is what CT-3 already covers.)

**Honest revision: CT-2 collapses into CT-3** under the residual-formula. The planner should drop CT-2 as a separate threshold and rename CT-3 to "negative-residual guard," verified directly via `negative_residual == 0` across the sample.

### Success-branch endpoint route (proposed shape, citing the spike's verified joins)

```python
# Source: cmc/api/routes/skills.py (extension; Phase 22 Plan 02-success)
# Citations are placeholders — the actual plan front-matter cites SPIKE-FINDINGS.md sections.

_OVERHEAD_SQL = text("""
    WITH skill_events AS (
      SELECT
        o.id AS skill_id,
        o.ts AS skill_start,
        o.session_id,
        CAST((SELECT json_extract(value,'$.value.stringValue')
                FROM json_each(json_extract(o.body,'$.record.attributes'))
               WHERE json_extract(value,'$.key')='duration_ms' LIMIT 1) AS INTEGER) AS total_ms
      FROM otel_events o
      WHERE o.event_name = 'skill_activated'
        AND o.attrs_skill_name = :name
        AND o.ts >= datetime(:since)
    ),
    skill_with_duration AS (
      SELECT * FROM skill_events
      WHERE total_ms IS NOT NULL AND session_id IS NOT NULL
    ),
    overlapping_tools AS (
      SELECT
        s.skill_id,
        s.total_ms,
        t.tool_name,
        t.duration_ms AS tool_dur
      FROM skill_with_duration s
      LEFT JOIN tools t
        ON t.session_id = s.session_id
       AND t.started_at >= s.skill_start
       AND t.started_at <  datetime(s.skill_start, '+' || s.total_ms || ' milliseconds')
       AND t.duration_ms IS NOT NULL
    ),
    decomposed AS (
      SELECT
        skill_id,
        MAX(total_ms) AS total_ms,
        COALESCE(SUM(CASE WHEN tool_name = 'Agent' THEN tool_dur END), 0) AS subagent_ms,
        COALESCE(SUM(CASE WHEN tool_name NOT IN ('Skill','Agent') THEN tool_dur END), 0) AS tool_ms
      FROM overlapping_tools
      GROUP BY skill_id
    )
    SELECT
      COUNT(*) AS sample_count,
      COALESCE(AVG(total_ms - subagent_ms - tool_ms), 0) AS body_ms,
      COALESCE(AVG(subagent_ms), 0) AS subagent_ms,
      COALESCE(AVG(tool_ms), 0) AS tool_ms
    FROM decomposed
""")


@router.get("/skills/{name}/overhead", response_model=SkillOverheadResponse)
async def skill_overhead(
    name: str,
    db: AsyncSession = Depends(get_session),
    range_: SkillRange = Query("14d", alias="range"),
) -> SkillOverheadResponse:
    """SKLP-11: per-skill latency overhead breakdown (body / subagent / tool).

    Empty-state (sample_count == 0): all *_ms None + low_sample=True. Mirrors
    SkillLatencyResponse D-03 contract.
    """
    if not _SKILL_NAME_RE.match(name) or ".." in name:
        raise HTTPException(status_code=400, detail="invalid skill name")

    since_iso = _range_start(range_).isoformat()
    rows = (await db.execute(
        _OVERHEAD_SQL, {"name": name, "since": since_iso}
    )).mappings().all()
    row = rows[0] if rows else None
    sample_count = int(row["sample_count"] or 0) if row else 0

    if sample_count == 0:
        return SkillOverheadResponse(
            range=range_, name=name, sample_count=0,
            body_ms=None, subagent_ms=None, tool_ms=None,
            low_sample=True,
        )
    return SkillOverheadResponse(
        range=range_, name=name, sample_count=sample_count,
        body_ms=int(row["body_ms"]),
        subagent_ms=int(row["subagent_ms"]),
        tool_ms=int(row["tool_ms"]),
        low_sample=sample_count < MIN_LATENCY_SAMPLES,
    )
```

### Success-branch response schema

```python
# Source: cmc/api/schemas/skills.py (extension; Phase 22 Plan 02-success)

class SkillOverheadResponse(BaseModel):
    """SKLP-11: per-skill latency overhead breakdown.

    body_ms / subagent_ms / tool_ms are average milliseconds across the
    range window. low_sample is server-computed via MIN_LATENCY_SAMPLES=30
    (mirrors SkillLatencyResponse SKLP-05 contract).

    sample_count == 0 returns 200 with all *_ms None + low_sample=True
    (D-03 mirrors SkillLatencyResponse: empty-state, NOT failure).
    """
    range: SkillRange
    name: str
    sample_count: int
    body_ms: int | None
    subagent_ms: int | None
    tool_ms: int | None
    low_sample: bool
```

### Success-branch frontend stacked-bar (proposed)

```tsx
// Source: frontend/src/components/panels/SkillOverheadCard.tsx (NEW; Phase 22 Plan 03-success)
import { useSkillOverhead } from '../../lib/queries'

interface Props {
  name: string
  range?: '14d' | '30d'
}

export function SkillOverheadCard({ name, range = '14d' }: Props) {
  const query = useSkillOverhead(name, range)
  if (query.isPending) {
    return <section className="cmc-card" data-testid="skill-overhead-card-loading">Loading…</section>
  }
  if (query.isError) {
    return <section className="cmc-card" role="alert">Couldn{'’'}t load overhead.</section>
  }
  const data = query.data
  if (!data) return null

  if (data.sample_count === 0) {
    return (
      <section className="cmc-card" aria-label="Skill overhead breakdown" data-testid="skill-overhead-stacked-bar">
        <header className="cmc-panel-card__header">
          <h3 className="cmc-card__title">Overhead</h3>
          <p className="cmc-caption">No samples in the last {range}.</p>
        </header>
      </section>
    )
  }

  const total = (data.body_ms ?? 0) + (data.subagent_ms ?? 0) + (data.tool_ms ?? 0)
  const pct = (n: number) => total === 0 ? 0 : (n / total) * 100

  return (
    <section className="cmc-card" aria-label="Skill overhead breakdown" data-testid="skill-overhead-stacked-bar">
      <header className="cmc-panel-card__header">
        <h3 className="cmc-card__title">Overhead</h3>
        {data.low_sample && (
          <span className="cmc-badge cmc-badge--warning" data-testid="skill-overhead-low-sample-badge">
            Low sample (n={data.sample_count})
          </span>
        )}
      </header>
      <div className="cmc-card__body" style={{ display: 'flex', height: '24px', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ flexGrow: pct(data.body_ms ?? 0), background: 'var(--cmc-color-body)' }} title={`Body: ${data.body_ms}ms`} />
        <div style={{ flexGrow: pct(data.subagent_ms ?? 0), background: 'var(--cmc-color-subagent)' }} title={`Subagent: ${data.subagent_ms}ms`} />
        <div style={{ flexGrow: pct(data.tool_ms ?? 0), background: 'var(--cmc-color-tool)' }} title={`Tool: ${data.tool_ms}ms`} />
      </div>
    </section>
  )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phase 14 SKIL-06 returns p50/p95/max only | Phase 22 SKLP-11 (if shipped) returns body/sub/tool decomposition | Phase 22 (this) | Additive; SkillLatencyResponse remains unchanged |
| `tools.tool_name='Skill'` row treated as the skill execution | `otel_events.skill_activated.duration_ms` is the canonical total; `tools` row is the entry point | Phase 14 (already shipped) | Correct latency derivation |
| Subagent execution opaque from parent session | `tool_name='Agent'` row carries subagent wall-clock duration; inner tools live in subagent's own session | (already-existing schema, just newly exploited by SKLP-11) | Decomposition is non-double-counting |

**Deprecated/outdated:**
- Phase 12 SPIKE.md LOCK-3 (`duration_ms` presence, TENTATIVE since 2026-05-02) — Phase 22's spike either upgrades it to VERIFIED (success branch) OR overrides it with negative-finding (failure branch).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Backend framework | pytest 8.x + pytest-asyncio (existing; Phase 19 baseline 598 / 0 / 32) |
| Frontend framework | vitest 1.x + happy-dom (existing; Phase 19 baseline 306 / 0) |
| E2E framework | Playwright (existing; Phase 19 baseline 7 / 2 / 0) |
| Backend config | `backend/pyproject.toml` + `tests/` (existing) |
| Frontend config | `frontend/vitest.config.ts` (existing) |
| Quick run command | Backend: `cd backend && uv run pytest tests/test_skills_router.py -x`; Frontend: `cd frontend && pnpm exec vitest run` |
| Full suite command | Backend: `cd backend && uv run pytest --tb=no`; Frontend: `cd frontend && pnpm exec vitest run`; E2E: `cd frontend && npx playwright test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SKLP-11 | Spike resolves YES with verified derivation OR NO with descope artifact | Plan 01 SPIKE-FINDINGS.md publication | (no automated test — artifact existence is checked by plan-checker via `must_haves.artifacts`) | ❌ Wave 0 (Plan 01 creates) |
| SKLP-11 (success branch) | `GET /api/skills/{name}/overhead` returns 200 with three components | Backend unit + integration | `cd backend && uv run pytest tests/test_skills_router.py::test_skill_overhead_happy_path -x` | ❌ Wave 1 (Plan 02 creates) |
| SKLP-11 (success branch) | Empty-state returns 200 with low_sample=True, all *_ms None | Backend unit | `cd backend && uv run pytest tests/test_skills_router.py::test_skill_overhead_empty_state -x` | ❌ Wave 1 |
| SKLP-11 (success branch) | Closed-form invariant: per-row body+sub+tool == duration | Backend integration | `cd backend && uv run pytest tests/test_skills_router.py::test_skill_overhead_closed_form -x` | ❌ Wave 1 |
| SKLP-11 (success branch) | `MIN_LATENCY_SAMPLES=30` reused, NOT redefined | Backend AST static-import test | `cd backend && uv run pytest tests/test_skills_router.py::test_skill_overhead_uses_shared_threshold -x` | ❌ Wave 1 |
| SKLP-11 (success branch) | No path leakage in response | Backend integration | `cd backend && uv run pytest tests/test_skills_router.py::test_skill_overhead_no_path_leakage -x` | ❌ Wave 1 |
| SKLP-11 (success branch) | Stacked bar renders three segments | Frontend vitest | `cd frontend && pnpm exec vitest run components/panels/__tests__/SkillOverheadCard.test.tsx` | ❌ Wave 2 (Plan 03 creates) |
| SKLP-11 (success branch) | Empty-state renders "no samples" message | Frontend vitest | (same file, different test) | ❌ Wave 2 |
| SKLP-11 (success branch) | Low-sample badge renders when n < 30 | Frontend vitest | (same file, different test) | ❌ Wave 2 |
| SKLP-11 (success branch) | Panel mounts on `/skills/$name`; no path leakage | Playwright e2e | `cd frontend && npx playwright test tests/e2e/skills-detail.spec.ts` | ✅ (extends existing) |
| SKLP-11 (descope branch) | REQUIREMENTS.md status flipped to `Deferred to v1.3` | Plan 02-descope grep verification | `grep -E '^\\| SKLP-11.*Deferred to v1.3' .planning/REQUIREMENTS.md` | ❌ Wave 1 (Plan 02-descope creates) |
| SKLP-11 (descope branch) | SPIKE-FINDINGS.md exists as anchor for descope | Plan 01 + Plan 02-descope | `test -f .planning/phases/22-skill-latency-overhead-spike-gated/22-01-SPIKE-FINDINGS.md` | ❌ Wave 0 (Plan 01) |
| (cross-cutting) | pytest baseline ≥ 598 maintained | Phase verifier | `cd backend && uv run pytest --tb=no` | ✅ (existing) |
| (cross-cutting) | vitest baseline ≥ 306 maintained | Phase verifier | `cd frontend && pnpm exec vitest run` | ✅ (existing) |

### Sampling Rate
- **Per task commit:** `cd backend && uv run pytest tests/test_skills_router.py -x` (~5s) for backend; `cd frontend && pnpm exec vitest run components/panels/__tests__/SkillOverheadCard.test.tsx` (~2s) for frontend.
- **Per wave merge:** Full backend pytest (`cd backend && uv run pytest --tb=no`) + full vitest (`cd frontend && pnpm exec vitest run`).
- **Phase gate:** Full suite green (backend pytest ≥ 598 / 0 / 32; vitest ≥ 306 / 0; playwright ≥ 7 passed / failed=0) before `/gsd-verify-work`. Plus: SPIKE-FINDINGS.md exists. Plus (descope): REQUIREMENTS.md SKLP-11 line shows `Deferred to v1.3`.

### Wave 0 Gaps
- [ ] `.planning/phases/22-skill-latency-overhead-spike-gated/22-01-SPIKE-FINDINGS.md` — creates Plan 01's outcome banner + verbatim SQL output.
- [ ] (success branch only) `backend/cmc/api/schemas/skills.py` — extends with `SkillOverheadResponse`.
- [ ] (success branch only) `backend/cmc/api/routes/skills.py` — adds `_OVERHEAD_SQL` constant + `skill_overhead` handler.
- [ ] (success branch only) `backend/tests/test_skills_router.py` — adds 5 tests.
- [ ] (success branch only) `frontend/src/lib/api.ts`, `lib/types.ts`, `lib/queries.ts` — adds fetch + types + hook.
- [ ] (success branch only) `frontend/src/components/panels/SkillOverheadCard.tsx` — NEW component.
- [ ] (success branch only) `frontend/src/components/panels/index.ts` — exports new component.
- [ ] (success branch only) `frontend/src/routes/skills_.$name.tsx` — mounts panel.
- [ ] (success branch only) `frontend/src/components/panels/__tests__/SkillOverheadCard.test.tsx` — vitest.
- [ ] (success branch only) `frontend/tests/e2e/skills-detail.spec.ts` — extends Playwright with overhead-panel assertion.
- [ ] (descope branch only) `.planning/REQUIREMENTS.md` — SKLP-11 status flip + section move.

## Security Domain

> Required when `security_enforcement` is enabled (config has neither `security_enforcement: false` nor an explicit override; treating as enabled per default).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | The endpoint is internal/localhost-only (single-user tool by design — REQUIREMENTS.md line 67); no auth surface added. |
| V3 Session Management | no | No session state added; reuses existing `session_id` for the temporal JOIN. |
| V4 Access Control | no | No access control surface; localhost-only single-user. |
| V5 Input Validation | yes | `name` path parameter validated by `_SKILL_NAME_RE = re.compile(r"^[a-zA-Z0-9_-]+$")` PLUS explicit `".." in name` check (Phase 14 V12 mitigation, `cmc/api/routes/skills.py:69`); `range` is Pydantic `Literal["14d","30d"]` enforced at the DTO boundary. |
| V6 Cryptography | no | No new crypto surface; the `project_key` SHA-1 truncation introduced in Phase 19 is unrelated and not used by this endpoint. |

### Known Threat Patterns for {FastAPI + SQLAlchemy + SQLite}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via `name` parameter | Tampering | Bind parameter (`:name`) + regex validation (`^[a-zA-Z0-9_-]+$`); never f-string interpolation. Phase 14 V12. |
| Path traversal via `name` parameter | Tampering | Explicit `".." in name` check (regex would slip the literal `..` pattern); Phase 14 V12. |
| Resource exhaustion via large range | DoS | Range parameter is `Literal["14d","30d"]` at the Pydantic boundary — invalid values 422 before SQL runs. SQLite query against indexed `idx_otel_events_attrs_skill_name` (Phase 13 INGST-11) is fast. |
| Path leakage in response (per Phase 19 SKLP-08) | Information Disclosure | Response shape is `{ range, name, sample_count, body_ms, subagent_ms, tool_ms, low_sample }` — enumerated fields, no `cwd` / `path` / `display_path` / `project_key`. Test asserts response keys are exactly the enumerated set. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The success-branch endpoint should expose `range` parameter `Literal["14d","30d"]` (mirroring `/latency`, `/cost`, `/projects`) | User Constraints + Code Examples | Low — the planner could add `7d` or `30d` if SKLP-12 (deferred) ever lands. Trivial extension. |
| A2 | `tool_ms` excludes both `'Skill'` and `'Agent'` rows; only "leaf" tools (Read/Edit/Bash/...) count | Discretion item "Tool latency definition" | Medium — if the spike reveals nested-tool double-counting (CT-4 fails), the formula needs revision. The spike explicitly tests this. |
| A3 | Subagent inner tools live in a separate session_id (verified empirically on the 5 sampled Agent rows) | Pitfalls 4 + Empirical Reality Check | Medium — the empirical check sampled 5 rows. The spike's CT-4 must verify this across the full sample to upgrade A3 to VERIFIED. |
| A4 | `MIN_LATENCY_SAMPLES=30` is the right `low_sample` threshold for SKLP-11 | User Constraints | Low — locked by ROADMAP success criterion #2 verbatim. |
| A5 | The single existing `skill_activated` row (Phase 12 spike, 2026-05-02) is representative of pre-Phase-13 ingest behavior; future skill events will populate `attrs_skill_name` and `session_id` columns correctly | Pitfalls 2 + 7 | Medium — current production has no fresh evidence. The spike's Q-coverage probe will reveal this if the situation changes. |
| A6 | `TOLERANCE_MS=100` for the (now-collapsed) reconciliation threshold is reasonable | Pattern 1 + Code Examples | Low — CT-2 collapsed into CT-3 in the honest revision; tolerance is no longer load-bearing. |
| A7 | A descope decision is acceptable to the user IF the spike fails — i.e., shipping zero new code in Phase 22 is a successful phase outcome | User Constraints + Plan Structure | Low — this is the explicit ROADMAP design (success criterion #3 verbatim). |
| A8 | The success-branch frontend should NOT use Recharts for the stacked bar (CSS flex preferred) | Discretion item "Stacked-bar primitive" | Low — recommendation only; planner may overrule with rationale. |
| A9 | Plan 01 should NOT spawn a fresh skill invocation to populate the database (i.e., NO Phase 12 Wave 1 fallback) — spike resolves from existing data only | Anti-Patterns | Medium — the user could prefer to drive a fresh skill activation manually before running the spike. The planner should surface this as an open question if uncertain. |
| A10 | "Front-matter cites the specific SQL column or temporal-JOIN derivation source" (Success Criterion #1) is satisfied by linking SPIKE-FINDINGS.md sections by anchor | Pattern 4 | Low — anchor citations are the standard project pattern (Phase 12 SPIKE.md uses `[LOCK-N]` anchors). |

**If this table is empty:** N/A — has 10 entries; all medium-or-lower risk; A2/A3/A5/A9 are the most consequential and are explicitly tested by the spike (or should be, per recommendations).

## Open Questions

1. **Should Plan 01 surface a "spike inconclusive" outcome distinct from "spike NO"?**
   - What we know: The success criteria specify a binary YES/NO. If `total_events == 0` (no fresh skill data), the negative finding is weaker than if `with_duration_ms == 0` while `total_events > 0` (structural absence).
   - What's unclear: Does the user want the Phase 22 phase to descope SKLP-11 if data is merely absent (rather than structurally unavailable)? Or should it leave SKLP-11 in v1.2 as `Pending — re-verify when data arrives`?
   - Recommendation: Treat both as NO and descope to v1.3. The user can re-open SKLP-11 in v1.3 if Claude Code emits richer skill events (or if the user's daily-use accumulates ≥ 30 skill_activated rows). Cleanly closes Phase 22 either way.

2. **Should the spike attempt to populate fresh data first (Phase 12 Wave 1 fallback)?**
   - What we know: Phase 12 used a "if zero data, spawn a trivial test skill" fallback. That landed exactly 1 row (the 2026-05-02 row this research probes).
   - What's unclear: Is repeating that fallback in scope for Phase 22? It contradicts the "spike resolves from existing data" framing.
   - Recommendation: NO. The Phase 12 fallback is documented as having produced unreliable data (the spike-test-skill activation didn't carry `duration_ms`). If natural usage hasn't generated 30 samples, the feature isn't usable yet — descope is correct.

3. **Plan structure: sequential branching (Option 1) vs. pre-branched (Option 2)?**
   - What we know: Option 1 is recommended. Option 2 violates Success Criterion #1's citation requirement.
   - What's unclear: Whether the orchestrator (`/gsd-plan-phase`) supports re-invocation mid-phase to add Plans 02+.
   - Recommendation: Option 1. After Plan 01 commits, the user re-runs `/gsd-plan-phase` with the SUMMARY in context; the planner reads SPIKE-FINDINGS.md and writes the appropriate branch's Plan 02+.

4. **What does Plan 02-descope exactly modify in REQUIREMENTS.md?**
   - What we know: Move SKLP-11 line from `## v1.2 Requirements > ### Skills Polish` to `## Future Requirements > ### Skills (v1.3+)`. Update Traceability table line 97. Update line 102 ("v1.2 requirements: 13 total" → 12). Update line 111 (Phase 22 requirement count: 1 → 0).
   - What's unclear: Should SKLP-12 (currently deferred conditionally on SKLP-11) become unconditionally deferred? It was already deferred to v1.3 — descoping SKLP-11 doesn't change SKLP-12's status, just removes the conditionality footnote.
   - Recommendation: SKLP-12's "only if SKLP-11 ships" footnote becomes outdated; recommend updating the line to drop the conditional. Plan 02-descope spec should include this in its `must_haves.truths`.

5. **Should the descope path also archive Phase 22 itself in the ROADMAP?**
   - What we know: Phase 22 is in v1.2; ROADMAP archives by milestone, not phase.
   - What's unclear: Whether ROADMAP.md needs any edit beyond confirming Phase 23's "runs cleanly even if SKLP-11 descoped" note.
   - Recommendation: Mark Phase 22 as `Complete (descoped)` in ROADMAP's Progress table, with link to SPIKE-FINDINGS.md. The plan count is `1/1` (the spike) regardless of branch.

6. **Does the success-branch frontend need a `range` toggle?**
   - What we know: Other panels on `/skills/$name` (SkillCostCard, SkillProjectsTable) accept `range` as a prop and default to `'14d'`. They don't expose a UI toggle on the panel itself.
   - What's unclear: Whether `SkillOverheadCard` should expose a range dropdown OR follow the prop-default pattern.
   - Recommendation: Prop-default `'14d'`, no panel-internal toggle. Mirrors SkillProjectsTable. If a future request wants per-panel range, it's a v1.3 enhancement.

7. **Per-skill detail bar coloring — what tokens?**
   - What we know: The repo's CSS tokens use `--cmc-color-*` naming. Phase 19 added DeltaPill with `--cmc-color-up` / `--cmc-color-down` / `--cmc-color-flat`.
   - What's unclear: Whether to add new tokens (`--cmc-color-body` / `--cmc-color-subagent` / `--cmc-color-tool`) or reuse existing (`--cmc-color-info` / `--cmc-color-warning` / `--cmc-color-success`).
   - Recommendation: Add three new dedicated tokens (semantic, not status). Body = neutral, Subagent = info-blue, Tool = warning-amber. Color choices are aesthetic; the planner may overrule.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| sqlite3 CLI | Plan 01 spike (raw query capture) | ✓ | 3.51.0 | — |
| Python 3.13 + uv | Backend tests | ✓ (presumed; existing) | — | — |
| pytest + pytest-asyncio | Backend tests | ✓ (existing) | — | — |
| pnpm + vitest | Frontend tests | ✓ (existing) | — | — |
| Playwright | E2E tests | ✓ (existing) | — | — |
| `data/cmc.db` | Plan 01 spike against live DB | ✓ | (open Q: how many rows by Plan 01 execution time?) | — |
| Live `skill_activated` events | Plan 01's CT-1 threshold | ⚠ | 1 row at 2026-05-07 (insufficient) | Open Question 2: NO fresh-data spawn, descope is the planned outcome if CT-1 fails |

**Missing dependencies with no fallback:**
- None blocking — but the **data-availability constraint** is effectively a "soft missing dependency" that strongly biases the spike outcome toward NO.

**Missing dependencies with fallback:**
- None.

## Sources

### Primary (HIGH confidence)

- Repository at HEAD (commit `2dcc105`):
  - `backend/cmc/api/routes/skills.py` (1446 lines) — `_LATENCY_SQL` (lines 1012-1058), `_PROJECTS_PERCENTILE_SQL` (lines 1282-1330), `_COST_REQUEST_SCOPED_SQL` / `_COST_SESSION_SCOPED_SQL` patterns, `MIN_LATENCY_SAMPLES = 30` (line 606), `_RANGE_TO_DAYS` (line 74), `_SKILL_NAME_RE` validation (line 69)
  - `backend/cmc/api/schemas/skills.py` — `SkillLatencyResponse` (lines 178-195), `SkillRange` Literal (line 30), `SkillProjectsResponse` (lines 237-242)
  - `backend/cmc/db/models/tools.py` — `tools` table schema (50 lines): `tool_use_id`, `tool_name`, `started_at`, `ended_at`, `duration_ms`, `status`, `mcp_*` columns
  - `backend/cmc/db/models/otel_events.py` — `otel_events` table schema (45 lines): `event_name`, `attrs_skill_name`, `session_id`, `body` JSON column
  - `backend/cmc/api/routes/observability.py` — `_TOOL_LATENCY_SQL` (lines 215-262) reference pattern for tool-latency CTE
  - `backend/cmc/api/routes/ingest.py` — OTEL receiver behavior (`extract_skill_attr` callsite at line 132)
  - `backend/cmc/ingest/otel_parser.py` — `extract_skill_attr` (line 83) tries `skill_name`, `skill.name`, `name` keys
  - `frontend/src/routes/skills_.$name.tsx` (181 lines) — `/skills/$name` route, mount surface for the success-branch panel
  - `frontend/src/components/panels/{SkillCostCard,SkillProjectsTable,SkillRunsTable,SkillsRegistry}.tsx` — established panel patterns
  - `frontend/src/components/ui/{DeltaPill,Badge,DataTable,KpiTile}.tsx` — UI primitives reusable in the success-branch panel
- `data/cmc.db` (live SQLite, 3.51.0, probed 2026-05-07):
  - `otel_events` row count for `skill_activated`: 1 (single row from Phase 12 spike, 2026-05-02 22:04:29.559Z)
  - That row's attribute keys (verified): `user.id`, `session.id`, `organization.id`, `user.email`, `user.account_uuid`, `user.account_id`, `terminal.type`, `event.name`, `event.timestamp`, `event.sequence`, `prompt.id`, `skill.name`, `skill.source` — NO `duration_ms`
  - `tools` table: 10,531 rows; `tool_name='Skill'` 16 rows; `tool_name='Agent'` 739 rows (65 still pending)
  - `Skill` tool durations (16 samples): 6, 30, 14608, 16961, 4017, 1518, 430, 29, 21, 25, 20, 25, 15, 24, 22, 21 ms
  - `Agent` tool: 65 of 739 are `pending` (no `ended_at` / NULL `duration_ms`); inner-tool overlap with parent session = 0–1 across the 5 sampled rows
- `.planning/REQUIREMENTS.md` (lines 1-117) — SKLP-11 wording (line 16); deferred-section structure (lines 41-62); Traceability table (lines 86-99)
- `.planning/ROADMAP.md` (lines 120-130) — Phase 22 verbatim goal + success criteria
- `.planning/milestones/v1.1-research/SPIKE.md` — Phase 12's lock document; LOCK-3 (`duration_ms` TENTATIVE) at lines 69-97; cross-reference table at lines 287-291; BUG-A / BUG-B annotations
- `.planning/phases/19-skills-per-project-deltas-badges/19-RESEARCH.md` — pattern templates (delta CTE, no-path-leakage test, MIN_LATENCY_SAMPLES reuse)
- `.planning/phases/18-polish-carry-forward-cleanup/BASELINE.md` — verifier baseline numbers

### Secondary (HIGH confidence — derivable from repo evidence)

- SQLite 3.42+ supports `'+N milliseconds'` modifier (verified on host: 3.51.0)
- `_LATENCY_SQL` window-function CTE pattern is the established read-time-percentile idiom; reuse for the success-branch SQL
- OTEL attribute-array shape (`body.record.attributes` as `[{key, value: {stringValue: ...}}, ...]`) is universal at Claude Code 2.1.116; `json_each` extraction is the only safe pattern (Pitfall 2 from Phase 12 SPIKE.md)
- Subagent session-isolation: empirically verified on 5 sampled `Agent` rows that `tools` in the parent session do NOT include the subagent's inner tool calls

### Tertiary (LOW confidence — flagged for spike validation)

- The closed-form invariant `body_ms + subagent_ms + tool_ms ≈ skill.duration_ms` — UNVERIFIED until the spike runs reconciliation against ≥ 30 rows
- Whether Claude Code 2.1.116 ever emits `duration_ms` on `skill_activated` events in production — UNVERIFIED (Phase 12 LOCK-3 TENTATIVE; no fresh data this session)
- Whether `attrs_skill_name` column is reliably populated post-Phase-13 — UNVERIFIED at scale (the only existing skill row pre-dates the fix)

## Metadata

**Confidence breakdown:**
- Plan structure (sequential branching): HIGH — Phase 12's two-plan precedent is the load-bearing template
- Spike SQL design: HIGH — every query target maps to a verified table column or attribute key
- Success-branch endpoint shape: HIGH — direct extension of Phase 14 / Phase 19 patterns
- Empirical reality check (data availability): HIGH — direct probe of `data/cmc.db` confirms `skill_activated` is empty; only 1 sample row with no `duration_ms`
- Spike outcome prediction (likely NO today): MEDIUM — the prediction is empirical, but a single fresh user-driven skill invocation between research and execution could change it
- Closed-form invariant correctness: LOW — the residual computation `body_ms = total - sub - tool` is mathematically tautological; the spike's CT-3 (negative-residual guard) is the only meaningful test
- Subagent containment (CT-4 invariant): MEDIUM — verified on 5 sampled Agent rows; should be confirmed at scale by the spike before committing to the formula

**Research date:** 2026-05-07
**Valid until:** 2026-06-07 (30 days — backend stack is stable; only the empirical "is there fresh data?" probe is time-sensitive, and even that resolves at Plan 01 execution time, not research time)
