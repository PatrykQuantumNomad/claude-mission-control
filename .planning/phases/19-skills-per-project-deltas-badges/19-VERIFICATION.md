---
phase: 19-skills-per-project-deltas-badges
verified: 2026-05-06T09:30:00Z
status: passed
human_approved_at: 2026-05-06T10:30:00Z
human_approval_notes: "Operator approved after two hotfixes (dad754a, da592ff) addressed in-browser regressions: limit-cap 422 + cache-key collision on /skills/usage; spurious 404 on /skills/{name}/projects for events-only skills. Visual items 1–4 confirmed."
score: 5/5
overrides_applied: 0
human_verification:
  - test: "Open /skills/<name> in a browser (requires dev DB with at least one skill seeded). Confirm: SkillProjectsTable panel renders with sortable columns (Project/Runs/p50/p95/Cost); clicking column headers changes sort order; project keys shown are 12-char hex strings, never filesystem paths."
    expected: "Sortable table appears below SkillCostCard showing per-project breakdown; project_key column shows hex like 'a3f8d92b1c4e'; no /Users/ or /home/ paths visible anywhere in the panel."
    why_human: "Table sorting and visual rendering of project_key hex values cannot be verified programmatically against a live database. Playwright spec skips when dev DB has no skills (steady-state skip)."
  - test: "On /skills/<name>, observe the SkillCostCard 'Total cost' KpiTile. Confirm a DeltaPill (↑/↓/·) renders next to the dollar amount, and the pill format shows an arrow, absolute delta, and percent in parens."
    expected: "A delta pill is visible, e.g. '↑ $0.12 (+24%)' or '· $0.00 (—)' — the flat-zero pill renders even when there is no prior period activity."
    why_human: "DeltaPill visibility within SkillCostCard is guarded by the PanelCard data-branch; Playwright assertion is conditional on dev DB state (skill-cost-card-delta-pill count-based check)."
  - test: "On /skills (skills list), check that TopSkills panel rows show: (a) a DeltaPill next to the run count for each skill; (b) 'new this week' and/or 'dormant' badges next to any qualifying skill names."
    expected: "Delta pills visible on TopSkills rows; if any skill was first activated within 7 days it shows a blue 'new this week' badge; if any skill has not been activated in >30 days and is >14 days old it shows a yellow 'dormant' badge."
    why_human: "Badge visibility depends on real activation timestamps in the dev DB. No Playwright spec covers TopSkills badges directly (vitest unit tests cover the rendering logic)."
  - test: "On /skills (skills list / SkillsRegistry panel), confirm the same 'new this week' / 'dormant' badges appear next to any skills that qualify — consistent with what TopSkills shows for the same skills."
    expected: "Badge state is consistent between TopSkills and SkillsRegistry for the same skill name."
    why_human: "SkillsRegistry merges badge data from useSkillUsage at render time; visual consistency check cannot be automated without seeded DB state."
---

# Phase 19: Skills Per-Project, Deltas & Badges — Verification Report

**Phase Goal:** User can drill into any skill on `/skills/$name` and see *where* it runs (per-project breakdown), *how its trajectory is changing* (period-over-period deltas), and *whether it's freshly active or going dormant* (badges) — backed by a normalized `project_key` that prevents cwd cardinality blowup and path leakage.
**Verified:** 2026-05-06T09:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User opens `/skills/<name>` and sees a sortable per-project table populated from `GET /api/skills/{name}/projects`, keyed by `project_key` (sha1[:12] of realpath(cwd)), with no filesystem paths in the response | ✓ VERIFIED (backend) / ? HUMAN (rendering) | `@router.get("/skills/{name}/projects")` at skills.py:1362; `SkillProjectRow` has no cwd/path/display_path fields; `test_skill_projects_no_path_leakage` programmatically scans every key+value; `SkillProjectsTable.tsx` mounts at skills_.$name.tsx:172; 5 sortable columns; path-leakage vitest guard passes |
| 2 | Migration `0003_project_key` lands: `sessions.project_key VARCHAR(12) NOT NULL DEFAULT ''`, backfilled via Python loop, indexed as `idx_sessions_project_key`; available for Phase 20 ANLY-07 | ✓ VERIFIED | `backend/migrations/versions/0003_project_key.py` exists; column is `VARCHAR(12) NOT NULL DEFAULT ''`; Python-loop backfill reads `SELECT session_id, cwd FROM sessions`, calls `os.path.realpath` + sha1[:12]; index `idx_sessions_project_key` created; `test_0003_upgrade_from_0002` and `test_0003_downgrade_to_0002` pass |
| 3 | TopSkills, SkillCostCard, and per-skill detail page each render a 7d-vs-prev-7d delta pill (↑/↓ with absolute delta + percent) derived via prev-period CTE | ✓ VERIFIED (backend + frontend code) / ? HUMAN (visual rendering) | `DeltaPill.tsx` is a substantive 75-line component; `TopSkills.tsx:100-104` wires `data-testid="top-skills-delta-pill"` with `Number(r.usage_delta.delta)`; `SkillCostCard.tsx:80-85` wires `data-testid="skill-cost-card-delta-pill"` with `data.cost_delta.delta`; 7 DeltaPill vitest tests pass; `_USAGE_DELTA_BADGE_SQL_PORTABLE` computes curr/prev counts; `_compute_cost_delta` computes cost deltas |
| 4 | Skills with `first_activated_at` within last 7 days get "new this week" badge; skills with `last_activated_at` older than 30 days get "dormant" badge — with cold-start suppression for skills <14 days old | ✓ VERIFIED (backend + frontend code) / ? HUMAN (visual rendering) | `_derive_badges()` at skills.py:154-183; `_BADGE_NEW_DAYS=7`, `_BADGE_DORMANT_DAYS=30`, `_BADGE_COLDSTART_DAYS=14`; cold-start guard: `days_since_first >= _BADGE_COLDSTART_DAYS` before dormant; `TopSkills.tsx:50-62` renders badges with testids; `SkillsRegistry.tsx:62-69` merges from useSkillUsage and renders badges; 5 badge unit tests all pass |
| 5 | DST day-boundary windowing is correct: badge thresholds use `datetime('now', '-N days')` (UTC), not local-time arithmetic, verified by a unit test crossing the spring-forward boundary | ✓ VERIFIED | `test_dormant_badge_dst_spring_forward` at test_skills_router.py:1583 tests `_derive_badges` with synthetic UTC timestamps straddling US 2026-03-08 spring-forward; asserts `"dormant" in badges`; structural grep guard asserts no `'localtime'` modifier on `-7 days`, `-14 days`, or `-30 days` windows; `_USAGE_DELTA_BADGE_SQL_PORTABLE` uses bare `datetime('now', '-7 days')` / `'-14 days'` (lines 393, 401-402); backend pytest: 598 passed / 0 failed |

**Score:** 5/5 truths structurally verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/cmc/core/project_key.py` | `compute_project_key(cwd)` helper | ✓ VERIFIED | 37 lines; sha1[:12] of realpath; returns '' for None/empty; re-exported via `cmc.core` |
| `backend/migrations/versions/0003_project_key.py` | Alembic migration for project_key | ✓ VERIFIED | upgrade/downgrade; batch_alter_table; Python-loop backfill; idx_sessions_project_key index |
| `backend/tests/test_core_project_key.py` | 11 unit tests for helper | ✓ VERIFIED | exists; all pass (included in 598 total) |
| `backend/cmc/db/models/sessions.py` | `project_key` field | ✓ VERIFIED | `Field(default="", max_length=12, nullable=False, index=True)` at line 27 |
| `backend/cmc/ingest/scheduler.py` | compute_project_key wiring on insert | ✓ VERIFIED | imports at line 30; sets `sess["project_key"]` at line 122 |
| `backend/cmc/ingest/repository.py` | project_key in `_SESSION_MUTABLE_COLS` | ✓ VERIFIED | `"project_key"` in tuple at line 61 |
| `backend/cmc/api/schemas/skills.py` | `DeltaPill`, `SkillProjectRow`, `SkillProjectsResponse` schemas | ✓ VERIFIED | `class DeltaPill` at line 36; `class SkillProjectRow` at line 217; `class SkillProjectsResponse` at line 237; no cwd/path/display_path fields on SkillProjectRow |
| `backend/cmc/api/routes/skills.py` | `/skills/{name}/projects` endpoint + delta helpers | ✓ VERIFIED | `@router.get("/skills/{name}/projects")` at line 1362; `_build_delta_pill`, `_derive_badges`, `_compute_cost_delta` helpers; `_USAGE_DELTA_BADGE_SQL_PORTABLE`; four cost-delta SQL fragments; module constants `_DELTA_WINDOW_DAYS=7`, `_BADGE_*_DAYS` |
| `backend/tests/test_skills_router.py` | 7 projects tests + 12 delta/badge tests + DST test | ✓ VERIFIED | `test_skill_projects_*` (7 tests, lines 1079-1323); `test_usage_delta_*`, `test_*_badge_*`, `test_cost_delta_*` (12 tests, lines 1326-1765); `test_dormant_badge_dst_spring_forward` (load-bearing, line 1583) |
| `frontend/src/components/ui/DeltaPill.tsx` | DeltaPill presentation primitive | ✓ VERIFIED | 75 lines; renders ↑/↓/· glyph + abs + pct; '—' for null pct; currency/integer formats; aria-label complete |
| `frontend/src/components/panels/SkillProjectsTable.tsx` | Sortable per-project table panel | ✓ VERIFIED | 127 lines; 5 sortable columns (project_key/count/p50/p95/cost); `data-testid="skills-detail-projects-table"` on wrapping section; uses `useSkillProjects` hook; path-leakage guard in vitest test |
| `frontend/src/routes/skills_.$name.tsx` | SkillProjectsTable mounted on detail page | ✓ VERIFIED | `import { SkillProjectsTable }` at line 35; `<SkillProjectsTable name={name} range="14d" />` at line 172 |
| `frontend/src/components/panels/TopSkills.tsx` | DeltaPill + badges wired | ✓ VERIFIED | `import DeltaPill` at line 18; `data-testid="top-skills-delta-pill"` at line 103; `RowBadges` component rendering 'new_this_week'/'dormant' badges with testids |
| `frontend/src/components/panels/SkillCostCard.tsx` | DeltaPill in Total cost KpiTile | ✓ VERIFIED | `import DeltaPill` at line 32; DeltaPill with `data-testid="skill-cost-card-delta-pill"` at line 84 |
| `frontend/src/components/panels/SkillsRegistry.tsx` | SKLP-10 badges via useSkillUsage merge | ✓ VERIFIED | `useSkillUsage('14d', 200)` merged by skill_name; badge rendering with testids `skills-registry-new-badge`/`skills-registry-dormant-badge` |
| `frontend/src/lib/api.ts` | TS types: DeltaPill, SkillProjectRow, SkillProjectsResponse + fetch | ✓ VERIFIED | `interface DeltaPill` at line 497; `interface SkillProjectRow` at line 541 (no cwd/path fields); `fetchJson<SkillProjectsResponse>` at line 1087 with correct endpoint URL |
| `frontend/src/lib/queries.ts` | `useSkillProjects` hook + query key | ✓ VERIFIED | `qk.skillProjects` at line 105; `useSkillProjects` at line 311 |
| `frontend/tests/e2e/skills-detail.spec.ts` | Playwright path-leakage e2e guard | ✓ VERIFIED | exists; tests `skills-detail-projects-table` testid visibility; path-leakage regex assertion; steady-state skip when no skills in dev DB |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `scheduler.py` | `compute_project_key` | `from cmc.core.project_key import compute_project_key` | ✓ WIRED | line 30 import; `sess["project_key"] = compute_project_key(...)` at line 122 |
| `repository.py` | `project_key` on re-sync | `_SESSION_MUTABLE_COLS` tuple | ✓ WIRED | `"project_key"` at line 61 |
| `skills.py route` | `SkillProjectRow` response | `@router.get` + `response_model=SkillProjectsResponse` | ✓ WIRED | line 1362; SQL filters `s.project_key != ''`; returns `SkillProjectsResponse` |
| `skills.py route` | delta pill on `/skills/usage` | `_USAGE_DELTA_BADGE_SQL_PORTABLE` + `_build_delta_pill` | ✓ WIRED | delta_rows merged at line 521; `usage_delta=_build_delta_pill(...)` at line 547 |
| `skills.py route` | delta pill on `/skills/{name}/cost` | `_compute_cost_delta` + `_build_delta_pill` | ✓ WIRED | `cost_delta = await _compute_cost_delta(...)` at line 1141; emitted on both empty and populated branches |
| `skills.py route` | badges on `/skills/usage` | `_derive_badges` + `_USAGE_DELTA_BADGE_SQL_PORTABLE` | ✓ WIRED | `badges=_derive_badges(first_at, last_at, days_since_first, now)` at line 548 |
| `SkillProjectsTable.tsx` | `GET /api/skills/{name}/projects` | `useSkillProjects(name, range)` → `api.skillProjects` → `fetchJson(...)` | ✓ WIRED | hook at queries.ts:311; API call at api.ts:1087 with correct URL |
| `TopSkills.tsx` | `usage_delta.delta` | `Number(r.usage_delta.delta)` → `<DeltaPill>` | ✓ WIRED | line 101; data-testid present |
| `SkillCostCard.tsx` | `cost_delta.delta` | `Number(data.cost_delta.delta)` → `<DeltaPill>` | ✓ WIRED | line 81; data-testid present |
| `SkillsRegistry.tsx` | badges | `useSkillUsage(14d, 200)` → `badgeByName` Map → `badges.includes(...)` | ✓ WIRED | merge by skill_name at lines 45-49; badge render at lines 62-69 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `SkillProjectsTable.tsx` | `data.rows` | `useSkillProjects` → `fetchJson('/api/skills/{name}/projects')` → `_PROJECTS_PERCENTILE_SQL` + `_PROJECTS_TOKEN_SQL` (DB queries) | Yes — SQL JOINs `otel_events` + `sessions`, GROUPs BY `project_key` | ✓ FLOWING |
| `TopSkills.tsx` DeltaPill | `r.usage_delta` | `useSkillUsage` → `/api/skills/usage` → `_USAGE_DELTA_BADGE_SQL_PORTABLE` (DB query) | Yes — SQL counts `skill_activated` events in curr/prev 7d windows | ✓ FLOWING |
| `SkillCostCard.tsx` DeltaPill | `data.cost_delta` | `useSkillCost` → `/api/skills/{name}/cost` → `_COST_DELTA_CURR_*_SQL` (DB queries) | Yes — SQL sums tokens for curr/prev 7d via dual-path attribution; `compute_cost` at read time | ✓ FLOWING |
| `SkillsRegistry.tsx` badges | `badgeByName.get(r.name)` | `useSkillUsage(14d, 200)` → `/api/skills/usage` → `_derive_badges(first_at, last_at, ...)` | Yes — badges derived from MIN/MAX(ts) over full event history; merged at render by skill_name | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend pytest passes >= 566 (baseline), 0 failures | `cd backend && uv run pytest --tb=no` | **598 passed, 0 failed, 32 warnings** | ✓ PASS |
| `warnings_datetime_utcnow == 0` (POLI-06 baseline) | counted from pytest run | **0** | ✓ PASS |
| Frontend vitest passes >= 293 (baseline), 0 failures | `cd frontend && pnpm exec vitest run` | **306 passed (68 files), 0 failed** | ✓ PASS |
| Playwright passes >= 7, 0 failures, skipped <= 2 | `cd frontend && npx playwright test` | **7 passed, 2 skipped (alerts + skills-detail steady-state), 0 failed** | ✓ PASS |
| No `datetime.utcnow` in new/modified files | `grep -r datetime.utcnow` on touched files | **0 matches** | ✓ PASS |
| No `'localtime'` modifier on badge/delta SQL windows | structural grep in DST test | **0 matches** on -7/-14/-30 day windows | ✓ PASS |
| DST spring-forward test passes | `pytest -k test_dormant_badge_dst_spring_forward` | Included in 598 passing | ✓ PASS |
| Path-leakage test passes | `pytest -k test_skill_projects_no_path_leakage` | Included in 598 passing | ✓ PASS |
| Frontend tsc clean | tsc --noEmit | 0 errors (per Plan 19-04 SUMMARY) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SKLP-08 | 19-02, 19-04 | Per-project breakdown: `GET /api/skills/{name}/projects` returning project_key-keyed rows; SkillProjectsTable on /skills/$name | ✓ SATISFIED | Endpoint exists at skills.py:1362; SkillProjectRow schema has no cwd/path fields; table mounts at skills_.$name.tsx:172; path-leakage test load-bearing |
| SKLP-09 | 19-03, 19-04 | 7d-vs-prev-7d delta pills on TopSkills, SkillCostCard, per-skill detail via `DeltaPill` primitive | ✓ SATISFIED | `_USAGE_DELTA_BADGE_SQL_PORTABLE` + `_compute_cost_delta`; DeltaPill.tsx; wired in TopSkills, SkillCostCard, (per-skill inherits via SkillCostCard) |
| SKLP-10 | 19-03, 19-04 | new/dormant badges with cold-start suppression; DST-safe UTC windowing | ✓ SATISFIED | `_derive_badges` cold-start gate at line 179-180; `_BADGE_COLDSTART_DAYS=14`; DST test `test_dormant_badge_dst_spring_forward`; badges rendered in TopSkills + SkillsRegistry |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/cmc/api/routes/skills.py` | 444, 752, 773 | `'localtime'` modifier in sparkline/trend SQLs (`_USAGE_TOP_SQL`, `_COST_TREND_*`) | Info | Pre-existing day-bucketing for display only; unrelated to badge/delta thresholds; DST test confirms these do NOT affect badge classification inputs |

No blockers. The `'localtime'` in sparkline SQL is a pre-existing pattern for calendar day bucketing (chart x-axis), not threshold arithmetic.

### Human Verification Required

#### 1. SkillProjectsTable renders and is sortable with real dev-DB data

**Test:** With a running dev instance and at least one skill in the DB, navigate to `/skills/<skill-name>`. Look for the "Per-project breakdown" panel below SkillCostCard.
**Expected:** A sortable table appears with columns: Project (12-char hex), Runs, p50, p95, Cost. Clicking column headers changes sort order. No `/Users/`, `/home/`, or other filesystem-path strings appear anywhere in the panel text.
**Why human:** Playwright skills-detail.spec.ts skips when dev DB has no skills (steady-state skip). Table sorting interaction cannot be exercised without a running server.

#### 2. DeltaPill visible on SkillCostCard for a skill with history

**Test:** On the same `/skills/<name>` detail page, observe the "Total cost" tile inside SkillCostCard.
**Expected:** A delta pill renders inline next to the dollar amount (e.g. `↑ $0.12 (+24%)` if cost grew, or `· $0.00 (—)` if no prior period). The pill is always present (flat-zero emitted on empty-data case).
**Why human:** Playwright assertion is count-based (conditional on data presence); flat-zero pill rendering requires manual inspection.

#### 3. new/dormant badges visible on TopSkills panel

**Test:** On `/skills`, examine the TopSkills panel rows. If any skill was first activated within 7 days, it should show a blue "new this week" badge. If any skill was last activated >30 days ago AND the skill is >14 days old, it should show a yellow "dormant" badge.
**Expected:** Badges visible on qualifying skills; no false "dormant" badge on a skill that was freshly installed (<14 days old).
**Why human:** Badge visibility depends on real activation timestamps in dev DB; no Playwright spec covers TopSkills badges directly.

#### 4. SkillsRegistry badge consistency with TopSkills

**Test:** On `/skills`, compare badge state between TopSkills and SkillsRegistry for the same skill.
**Expected:** A skill showing "dormant" in TopSkills also shows "dormant" in SkillsRegistry (and vice versa for "new this week"). The merge is by skill_name.
**Why human:** Cross-panel consistency requires visual inspection against live data.

### Gaps Summary

No automated gaps found. All 5 ROADMAP success criteria are verifiably satisfied at the code level:

1. `GET /api/skills/{name}/projects` exists, returns `SkillProjectRow[]` with `project_key` only (no path leakage), structural+runtime tests pass; `SkillProjectsTable` mounts on `/skills/$name` route.
2. Migration `0003_project_key` lands `VARCHAR(12) NOT NULL DEFAULT ''` with index `idx_sessions_project_key` and Python-loop backfill; column is in `_SESSION_MUTABLE_COLS` for re-sync propagation.
3. `DeltaPill` primitive wired on TopSkills (usage delta), SkillCostCard (cost delta), and per-skill detail page (inherits via SkillCostCard); all three have `data-testid` anchors and 7+12 unit tests.
4. `_derive_badges` implements cold-start suppression (`days_since_first >= 14` guard); badges rendered in TopSkills and SkillsRegistry via `useSkillUsage` merge.
5. `test_dormant_badge_dst_spring_forward` is load-bearing: tests Python helper on UTC timestamps straddling 2026-03-08 spring-forward + structural grep asserting no `'localtime'` on N-day windows.

**Human verification is the only blocker** — visual rendering of DeltaPills, sortable table, and badges requires a running dev instance with seeded skill data. The Playwright skills-detail.spec.ts steady-state-skips on empty dev DB (documented as expected in frontend/tests/e2e/README.md and the BASELINE rule for Phase 19+ which allows `skipped <= 2`).

---

_Verified: 2026-05-06T09:30:00Z_
_Verifier: Claude (gsd-verifier)_
