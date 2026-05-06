---
phase: 20-cost-forecast-per-project-card
plan: 01
subsystem: api
tags: [fastapi, sqlalchemy, sqlite, cost-engine, project-key, path-leakage-guard, anly-07]

# Dependency graph
requires:
  - phase: 19-skills-per-project-deltas-badges
    provides: "sessions.project_key column + idx (migration 0003) + cmc.core.project_key.compute_project_key helper + test_skill_projects_no_path_leakage pattern"
  - phase: 18-polish-carry-forward-cleanup
    provides: "cmc.core.time.now_utc (POLI-06 ban on datetime.utcnow); BASELINE.md verifier rules"
provides:
  - "/api/cost/breakdown?dim=project rows keyed by 12-char hex project_key (sha1[:12] of realpath(cwd)); raw cwd never reaches the wire"
  - "WHERE s.project_key != '' filter excludes empty-key sentinel rows (no phantom '' or '<unknown>' bucket)"
  - "Structural path-leakage guard test (test_cost_no_path_leakage.py) — adversarial-mutation verified"
  - "Phase 19 SKLP-08 path-leakage discipline now extends to the cost router (was previously enforced only in skills router)"
affects: [phase-20-plan-02-cost-forecast, phase-20-plan-03-frontend-cost-card, phase-20-plan-04-cost-dashboard-e2e]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-project rollup discipline: GROUP BY s.project_key + WHERE s.project_key != '' (mirrors skills router _PROJECTS_TOKEN_SQL from Phase 19 Plan 02)"
    - "Dual structural guard: schema/SQL contract + programmatic key+value scan in a dedicated test file"
    - "Adversarial-mutation verification protocol for load-bearing structural tests (revert SQL → observe RED → restore → observe GREEN)"

key-files:
  created:
    - "backend/tests/test_cost_no_path_leakage.py"
  modified:
    - "backend/cmc/api/routes/cost.py (_BREAKDOWN_BY_PROJECT_SQL refactored)"
    - "backend/tests/test_cost_router.py (+165 lines: 2 new tests + _seed_session_for_cost helper)"

key-decisions:
  - "WHERE s.project_key != '' filter is mandatory companion to GROUP BY s.project_key — without it, the empty-key sentinel surfaces as a phantom '' bucket (20-RESEARCH.md Pitfall 1)."
  - "Direct engine insert (_seed_session_for_cost) instead of conftest.make_session_row — the conftest helper predates Phase 19's project_key column and does not accept it as a kwarg. Mirrors test_skills_router.py::_seed_session_row from Phase 19 Plan 02."
  - "The shared cost_breakdown handler's `r['key'] or '<unknown>'` coercion is preserved untouched — even though it is now unreachable for dim=project (project_key is NOT NULL DEFAULT '' + WHERE filter), it still serves dim=model for legacy rows with NULL model. Out-of-scope removal."
  - "dim=model and dim=skill SQL UNCHANGED — refactor is scoped strictly to dim=project SQL. test_breakdown_sums_to_summary regression test (dim=model) confirmed still passing."
  - "Adversarial-mutation verification done locally as defined in plan: reverted _BREAKDOWN_BY_PROJECT_SQL to COALESCE(s.cwd, '<unknown>'), confirmed test_cost_breakdown_project_no_path_leakage FAILS with `row['key']='/tmp/super/secret/leakage/path' starts with '/'`, then restored — guard is load-bearing, not vacuous."

patterns-established:
  - "test_cost_no_path_leakage.py: file-per-endpoint structural guard naming convention. Pairs with Phase 19's test_skill_projects_no_path_leakage (which lives inside test_skills_router.py); the cost guard gets its own file because the cost router does not yet have a SkillProjectRow-style schema with enumerated fields, so the structural test bears all the weight."
  - "Banned key set ({cwd, path, display_path, cwd_path}) and seed-fragment set (multiple distinctive segments of the seeded cwd) is the locked sniffer pattern for any future per-project endpoint. Reusable across cost / skills / forecast / latency surfaces."

requirements-completed: [ANLY-07]

# Metrics
duration: ~21min
completed: 2026-05-06
---

# Phase 20 Plan 01: Cost Breakdown Project Key Refactor Summary

**`/api/cost/breakdown?dim=project` now keys rows by 12-char hex project_key (sha1[:12] of realpath(cwd)) with an empty-key WHERE filter, plus a load-bearing structural path-leakage guard mirroring Phase 19's SKLP-08 discipline.**

## Performance

- **Duration:** ~21 min
- **Started:** 2026-05-06T18:26:00Z (approximate, plan exec start)
- **Completed:** 2026-05-06T18:47:00Z
- **Tasks:** 2/2 (both tasks TDD with explicit RED → GREEN gate sequence)
- **Files modified:** 3 (1 source, 1 existing test, 1 new test)

## Accomplishments

- `_BREAKDOWN_BY_PROJECT_SQL` refactored: `COALESCE(s.cwd, '<unknown>') AS key` → `s.project_key AS key`; added `WHERE s.project_key != ''`; `GROUP BY` swapped to match. Comment block updated to cite the Phase 19 SKLP-08 invariant + 20-RESEARCH.md Pitfall 1.
- 2 new tests in `test_cost_router.py`: `test_breakdown_project_groups_by_project_key` (rows are 12-char hex keys, not paths; computes `compute_project_key('/tmp/proj-a')` and asserts equality), `test_breakdown_project_excludes_empty_key` (project_key='' sentinel row is silently dropped).
- Net-new structural guard `test_cost_no_path_leakage.py::test_cost_breakdown_project_no_path_leakage`: programmatic key+value scan asserting no `cwd`/`path`/`display_path`/`cwd_path` keys, no `/`-prefixed values, and no fragment of the seeded `/tmp/super/secret/leakage/path` anywhere in the response. Includes positive shape assertion (12-char hex project_key IS present) so the test cannot vacuously pass on an empty response.
- **Adversarial-mutation verified locally**: temporarily reverted `_BREAKDOWN_BY_PROJECT_SQL` to `COALESCE(s.cwd, '<unknown>') AS key`, ran `pytest tests/test_cost_no_path_leakage.py -v` → confirmed RED with `row['key']='/tmp/super/secret/leakage/path' starts with '/' — looks like a filesystem path`. Restored — confirmed GREEN. Guard is load-bearing.
- Phase 18 BASELINE.md verifier preserved: pytest 598 → **601 passed** (+3 = exactly the count this plan claimed), 0 failed, 32 warnings (unchanged), 0 `datetime.utcnow` warnings.

## Task Commits

Each task was committed atomically (TDD RED + GREEN gates explicit):

1. **Task 1 RED — failing tests for project_key rollup** — `96dbc9e` (test)
   - Added `test_breakdown_project_groups_by_project_key` + `test_breakdown_project_excludes_empty_key` + private `_seed_session_for_cost` helper.
   - Verified failing: `assert 2 == 1` (phantom `<unknown>` bucket) and `'/tmp/proj-a'` raw paths in response.
2. **Task 1 GREEN — refactor _BREAKDOWN_BY_PROJECT_SQL** — `17e162f` (feat)
   - SQL diff: `COALESCE(s.cwd, '<unknown>') AS key` → `s.project_key AS key`; added `AND s.project_key != ''`; swapped GROUP BY to `s.project_key`.
   - Comment block updated to cite Phase 19 SKLP-08 + 20-RESEARCH.md Pitfall 1.
   - 10/10 tests in `test_cost_router.py` pass (8 existing + 2 new).
3. **Task 2 — structural path-leakage guard** — `3b33b2d` (test)
   - Net-new `backend/tests/test_cost_no_path_leakage.py` with 1 test (114 lines).
   - Adversarial-mutation verified before commit.

**Plan metadata:** Final docs commit + STATE/ROADMAP/REQUIREMENTS update lands separately from per-task commits.

_Note: Task 1 used the explicit RED → GREEN cycle (separate commits per gate, per `tdd="true"` semantics). Task 2 single-commit because the test was authored against an already-fixed handler (validating + adversarial-mutation verifying)._

## Files Created/Modified

- **Modified** `backend/cmc/api/routes/cost.py` — `_BREAKDOWN_BY_PROJECT_SQL` block (now ~165-188): 3-line SQL diff (key, WHERE, GROUP BY) + 11-line comment block citing Phase 19 SKLP-08 invariant + 20-RESEARCH.md Pitfall 1. No change to `cost_breakdown` handler logic.
- **Modified** `backend/tests/test_cost_router.py` — added imports (`re`, `compute_project_key`, `now_utc`) + module-level `_HEX12_RE` regex + `_seed_session_for_cost` helper (direct engine insert with explicit `project_key` column) + 2 new async tests (~165 added lines).
- **Created** `backend/tests/test_cost_no_path_leakage.py` — 114 lines: 1 net-new structural test mirroring Phase 19's `test_skill_projects_no_path_leakage` pattern; banned-key set `{cwd, path, display_path, cwd_path}`; banned-fragment set `('/tmp/super', '/secret/leakage', 'leakage/path')`; positive-shape assertion (seeded 12-hex pk is present).

## Decisions Made

See `key-decisions` in frontmatter. Highlights:

- **Helper duplication accepted over conftest extension.** `make_session_row` in conftest predates Phase 19; extending it would touch tests outside this plan's scope. Mirroring `test_skills_router.py::_seed_session_row` (private engine insert) is the locked Phase 19 pattern. If a third caller needs the same shape, a follow-up plan can promote it to a shared helper.
- **`<unknown>` coercion in cost_breakdown handler left untouched.** Now unreachable for dim=project (project_key NOT NULL DEFAULT '' + WHERE filter). Still serves dim=model for legacy rows with NULL model. Out-of-scope removal — would risk regression on dim=model behavior unrelated to this plan's ANLY-07 contract.
- **Banned-fragment set chosen for distinctiveness.** `/tmp/super`, `/secret/leakage`, `leakage/path` — multiple segments so a partial leak (e.g., one component of the path slipping into a derived label field) gets caught. The 12-char hex project_key has zero chance of producing `super` / `secret` / `leakage` substrings by construction (alphabet is `0-9a-f` only), so no false-positive risk.
- **Structural guard lives in its own file**, not inside `test_cost_router.py`. Named `test_cost_no_path_leakage.py` to mirror `test_skill_projects_no_path_leakage` discoverability. Future cost endpoints (forecast, projects-list) can append tests to the same file as the structural guard surface grows.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Removed unused `pytest` import from test_cost_router.py**
- **Found during:** Task 1 RED commit (pre-commit ruff hook failure)
- **Issue:** Plan example included `import pytest` at the top of the new test additions, but no test in the new block uses `pytest.mark.asyncio` (the file already runs with `asyncio_mode=auto` per `pyproject.toml`, so async tests don't need explicit marks). Ruff caught `F401` `pytest imported but unused`.
- **Fix:** Removed `import pytest` line. Tests run unchanged (auto-async-mode makes the explicit mark redundant).
- **Files modified:** `backend/tests/test_cost_router.py`
- **Verification:** Re-ran `git commit` — ruff + pyright passed.
- **Committed in:** `96dbc9e` (Task 1 RED commit, single fix folded into the same commit before push).

**2. [Rule 1 — Plan-shape divergence] Used direct engine insert helper instead of `make_session_row`-via-conftest**
- **Found during:** Task 1 test authoring
- **Issue:** Plan's example test code used `db.add(Session(**make_session_row(..., project_key=pk_a, ...)))`. But `tests/conftest.py::make_session_row` does NOT accept `project_key` as a kwarg (predates Phase 19 — see conftest.py:455-492); calling it that way would raise `TypeError`. The plan also imports `make_session_row` from `.conftest` in Task 2's example, which would fail for the same reason.
- **Fix:** Authored a private `_seed_session_for_cost` helper in `test_cost_router.py` (and an inline `_seed_leaky_session` in the new test file) that performs a direct engine insert via `SQLModel.metadata.tables["sessions"]` — exactly the pattern used by Phase 19's `test_skills_router.py::_seed_session_row`. This was the implicit "CRITICAL: Read backend/tests/conftest.py to confirm" instruction in the plan's action block, resolved as expected (mirror Phase 19 pattern).
- **Files modified:** `backend/tests/test_cost_router.py`, `backend/tests/test_cost_no_path_leakage.py`
- **Verification:** All 11 new test paths exercise the helper; full suite 601 passed.
- **Committed in:** `96dbc9e` (test_cost_router.py helper) + `3b33b2d` (test_cost_no_path_leakage.py helper).

---

**Total deviations:** 2 auto-fixed (1 blocking lint, 1 plan-shape divergence resolved by mirroring Phase 19 pattern as the plan implicitly directed).
**Impact on plan:** Both auto-fixes preserve the plan's contract exactly. No scope creep. The plan's intent — "mirror Phase 19's test_skill_projects_no_path_leakage pattern" — is what carried both decisions.

## Issues Encountered

None blocking. Pre-commit hooks (ruff + pyright) passed on every commit after the deviation-2 fix in commit `96dbc9e`.

## User Setup Required

None — pure backend SQL refactor + tests. No env vars, no migrations, no service config. Migration `0003_project_key` from Phase 19 already ships the `sessions.project_key` column; this plan only changes which column the cost rollup groups on.

## Next Phase Readiness

- **Plan 20-02 (cost forecast endpoint, ANLY-06)** unblocked and starts from a clean `cost.py` with no `cwd`-leaking SQL. Plan 02 will add a NEW `/api/cost/forecast` endpoint to the same file; the wave-2 file ownership serialization is intentional (avoids merge friction on `cost.py`).
- **Plan 20-03 (frontend cost dashboard cards)** can render `dim=project` response without re-applying client-side path stripping or any defensive `value.startsWith('/')` checks — the wire shape is project-key-clean by structural test.
- **Plan 20-04 (Playwright e2e)** can add a Playwright counterpart to `test_cost_breakdown_project_no_path_leakage` using the locked banned-key + banned-fragment regex pattern, mirroring Phase 19 Plan 04's e2e path-leakage assertion on `getByTestId('skills-detail-projects-table').textContent`.

ROADMAP success criterion #3 backend portion satisfied: `/api/cost/breakdown?dim=project` returns 12-char hex `key` values; no raw filesystem paths leak through any field. Phase 19 SKLP-08 path-leakage discipline now extends to the cost router across both per-project endpoints in the API surface (skills + cost).

## Self-Check: PASSED

Verification (file existence + commit hashes):

- `backend/cmc/api/routes/cost.py` exists, `grep "GROUP BY s.project_key"` → 1 match, `grep "COALESCE(s.cwd"` → 0 matches.
- `backend/tests/test_cost_router.py` exists, contains `test_breakdown_project_groups_by_project_key` and `test_breakdown_project_excludes_empty_key`.
- `backend/tests/test_cost_no_path_leakage.py` exists (114 lines), contains `test_cost_breakdown_project_no_path_leakage`.
- Commit `96dbc9e` (Task 1 RED) — verified in git log.
- Commit `17e162f` (Task 1 GREEN) — verified in git log.
- Commit `3b33b2d` (Task 2 path-leakage guard) — verified in git log.
- Full pytest run: 601 passed / 0 failed / 32 warnings / 0 datetime.utcnow warnings (Phase 18 BASELINE preserved).

---
*Phase: 20-cost-forecast-per-project-card*
*Plan: 01*
*Completed: 2026-05-06*
