---
phase: 20-cost-forecast-per-project-card
plan: 04
subsystem: frontend/e2e
tags: [playwright, e2e, cost-dashboard, path-leakage-guard, anly-06, anly-07]
requires:
  - 20-01 (per-project SQL refactor — /api/cost/breakdown?dim=project returns 12-char hex project_key)
  - 20-02 (CostForecastResponse + GET /api/cost/forecast endpoint)
  - 20-03 (/cost route + CostForecastCard + CostByProjectCard + NavBar Cost link + section-level testids)
  - Phase 19 Plan 04 skills-detail.spec.ts (mirror pattern: API-guarded preflight + path-leakage regex + conditional skip)
provides:
  - frontend/tests/e2e/cost-dashboard.spec.ts (4 tests; ~135 LOC)
  - Real-DOM path-leakage guard at the e2e boundary (fourth defense layer for ROADMAP success criterion #3)
  - Adversarial-mutation-verified e2e structural test (cwd-restoration mutation produces RED; restoration produces GREEN)
  - Updated frontend/tests/e2e/README.md "Known Steady-State Skips" inventory + Phase 20 close baseline
affects:
  - Phase 20 close — ANLY-06 + ANLY-07 user-shippable end-to-end through real ASGI + real Vite preview build
  - Phase verifier — Playwright steady-state baseline shifts from 7 passed / 2 skipped to 11 passed / 2 skipped (with seed data; floor 8 passed / 1-3 skipped without seed)
  - Future v1.3 phases — e2e baseline established for /cost surface; new specs extend the same conditional-skip discipline
tech-stack:
  added: []
  patterns:
    - API-guarded e2e preflight via Playwright `request.get` fixture (skip with documented reason, not vacuous pass)
    - Section-level testid consumption (cost-forecast-card / cost-by-project-card / cost-by-project-card-table) — survives PanelCard loading/error/empty/data branches
    - Path-leakage regex `\/[A-Za-z][\w/.-]+/` mirrors skills-detail.spec.ts verbatim — one shape, two pages
    - waitForRequest matcher armed BEFORE the click (race-free network assertion)
    - Adversarial-mutation verification (manual cwd↔project_key SQL flip → RED → restore → GREEN) — load-bearing structural guard
key-files:
  created:
    - frontend/tests/e2e/cost-dashboard.spec.ts
  modified:
    - frontend/tests/e2e/README.md
key-decisions:
  - "Mirror skills-detail.spec.ts API-guarded preflight pattern verbatim. Tests 3+4 query /api/cost/breakdown?dim=project&range=7d via the Playwright `request` fixture; if rows=[], call test.skip() with a documented reason. Tests 1+2 are dev-DB-state-independent and always pass. Phase verifiers compare failed counts only — clean dev DB legitimately produces 1-2 skipped on this spec without regressing the suite."
  - "Path-leakage regex is identical to skills-detail.spec.ts: `\\/[A-Za-z][\\w/.-]+/`. One regex, two surfaces. ROADMAP success criterion #3 inherits Phase 19's prohibition (SKLP-08) — never let cwd or display_path leak into rendered DOM."
  - "waitForRequest matcher armed BEFORE the click — Playwright's race semantics require the matcher in flight when the network call fires. The test asserts BOTH `range=30d` AND `dim=project` in the matched URL; either alone could be a false-positive (the forecast endpoint also fires at navigation, but lacks both params)."
  - "Section-level testid consumption (`cost-forecast-card`, `cost-by-project-card`) survives all four PanelCard branches. The inner `cost-by-project-card-table` testid only mounts in the data branch — Test 3 explicitly preflights for non-empty rows so the assertion isn't structurally vacuous."
  - "Adversarial-mutation verification performed locally: temporarily reverted `_BREAKDOWN_BY_PROJECT_SQL` to `COALESCE(s.cwd, '<unknown>') AS key` + `GROUP BY COALESCE(s.cwd, '<unknown>')`, restarted the backend, re-ran the spec → Test 3 FAILED (RED) with the expected `Expected pattern: not /\\/[A-Za-z][\\w/.-]+/` error showing actual cwd-shaped strings in the rendered table textContent. Restored the SQL → Test 3 PASSED (GREEN). Confirms the e2e guard is load-bearing and complements the unit-side adversarial verification from Plan 20-01."
metrics:
  duration: 7m
  completed: 2026-05-06
  playwright_passed_before: 7
  playwright_passed_after: 11
  playwright_passed_delta: +4
  playwright_skipped_before: 2
  playwright_skipped_after: 2
  playwright_failed_before: 0
  playwright_failed_after: 0
  vitest_passed_before: 316
  vitest_passed_after: 316
  vitest_delta: 0
  pytest_passed_before: 632
  pytest_passed_after: 632
  pytest_delta: 0
  files_created: 1
  files_modified: 1
  lines_added: 193
  lines_removed: 3
---

# Phase 20 Plan 04: Cost Dashboard E2E Summary

Added the Playwright e2e spec for `/cost` (`cost-dashboard.spec.ts`, 4 tests, ~135 LOC) — the final integration trust signal for ANLY-06/07. Mirrors Phase 19's `skills-detail.spec.ts` pattern verbatim: API-guarded preflight, conditional-skip discipline, identical path-leakage regex. Adversarial-mutation verification confirmed the path-leakage guard is load-bearing (cwd-restoration backend mutation produces RED; restoration produces GREEN). Steady-state Playwright baseline shifts from 7 passed / 2 skipped to 11 passed / 2 skipped on the seeded dev DB (floor 8 passed / 1-3 skipped without seed data). Phase 20 closes with all four ROADMAP success criteria satisfied user-side.

## Summary

`frontend/tests/e2e/cost-dashboard.spec.ts` ships four tests under one describe block (`ANLY-06/07: /cost dashboard panels`):

1. **`opens /cost and mounts both panels`** — navigate to `/cost`, assert both `cost-forecast-card` and `cost-by-project-card` section testids are visible. Dev-DB-state-independent (the section wrappers survive all PanelCard branches per Plan 20-03's design).

2. **`NavBar Cost link navigates from / to /cost`** — open `/`, click the 'Cost' link by accessible name, assert URL becomes `/cost` AND both card testids mount. Validates Plan 20-03's NavBar wiring end-to-end. Dev-DB-state-independent.

3. **`cost-by-project-card-table has no path-leakage`** — LOAD-BEARING. Preflight via Playwright `request.get` to `/api/cost/breakdown?dim=project&range=7d`; if `rows.length === 0`, skip with documented reason. Otherwise navigate, get `cost-by-project-card-table` textContent, assert it does NOT match `/\/[A-Za-z][\w/.-]+/`. Defensive secondary assertions: textContent must not contain `cwd` or `display_path` substrings either.

4. **`7d→30d toggle fires a /api/cost/breakdown?range=30d request`** — same preflight skip discipline. Arms `page.waitForRequest` matcher BEFORE clicking the `30d` toggle button; matcher requires BOTH `range=30d` AND `dim=project` in the URL (forecast endpoint pings during nav but lacks `range`/`dim` params, so the matcher won't false-positive).

`frontend/tests/e2e/README.md` extended under "Known Steady-State Skips" with:
- Documentation of the new `cost-dashboard.spec.ts` skip behavior (mirrors `skills-detail.spec.ts` framing).
- Phase 19 `skills-detail.spec.ts` skip entry (was previously implied but not explicitly catalogued — added for completeness).
- Phase 20 close steady-state baseline: passed ≥ 8, skipped 1–3, failed 0.

## Verification

- `cd frontend && npm run test:e2e` → **11 passed / 2 skipped / 0 failed** (Phase 19 baseline 7/2/0; +4 from cost-dashboard.spec.ts; the 2 steady-state skips are `alerts.spec.ts` and `skills-detail.spec.ts` per Phase 18/19 conventions).
- `cd frontend && npm test` → **316 passed / 0 failed** (vitest unchanged from Plan 20-03 close).
- `cd backend && uv run pytest -q` → **632 passed / 0 failed** (unchanged baseline; 32 deprecation warnings pre-existing).
- `cd frontend && npm run typecheck` → clean (tsc --noEmit, zero errors).
- ESLint: no `lint` script in `frontend/package.json`; tsc is the static-analysis gate per project convention.

## Adversarial-Mutation Verification

Performed once locally per the plan's verification step:

1. **MUTATE** — Edited `backend/cmc/api/routes/cost.py` `_BREAKDOWN_BY_PROJECT_SQL` to `COALESCE(s.cwd, '<unknown>') AS key` + `GROUP BY COALESCE(s.cwd, '<unknown>')` (mimics the pre-Plan-20-01 SQL).
2. **RESTART** — Killed the running uvicorn on `:8765`; Playwright's `webServer` block respawned it on the next run, picking up the mutated SQL.
3. **RUN** — `npm run test:e2e -- cost-dashboard.spec.ts` → Test 3 FAILED (RED). The error output showed:

   ```
   Error: cost-by-project-card-table must not render a filesystem-path-shaped string
   Expected pattern: not /\/[A-Za-z][\w/.-]+/
   Received string: "ProjectTokensCost▼/Users/patrykattc/work/git/PatrykQuantumNomad…"
   ```

   Tests 1, 2, and 4 still passed — confirming Test 3 is the only adversarial-grade structural assertion in the spec (the others are non-adversarial mounting/navigation checks).
4. **RESTORE** — `cp /tmp/cost.py.backup backend/cmc/api/routes/cost.py` (restored `s.project_key AS key` + `WHERE s.project_key != ''` + `GROUP BY s.project_key`); re-ran the spec → Test 3 PASSED (GREEN).

The e2e guard is the FOURTH defense layer for ROADMAP success criterion #3, complementing:

1. Backend SQL — `WHERE s.project_key != ''` + `GROUP BY s.project_key` (Plan 20-01).
2. Backend pytest — `tests/test_cost_no_path_leakage.py` (Plan 20-01).
3. Frontend vitest — `CostByProjectCard.test.tsx` container.textContent regex (Plan 20-03).
4. **Frontend Playwright — `cost-dashboard.spec.ts` real-DOM textContent regex (this plan).**

A regression that bypasses any one layer is caught by at least one of the others.

## Real-Environment Regression Caught (Bonus)

On the first run of the spec, Test 3 FAILED unexpectedly. Investigation revealed the running uvicorn on `:8765` had started at 1:47PM — BEFORE Plan 20-01's commit `17e162f` landed at 2:41PM. The `webServer.reuseExistingServer=true` flag in `playwright.config.ts` reused the stale process, which was still serving the pre-refactor SQL (`COALESCE(s.cwd, '<unknown>')`). Killing the stale process and re-running let Playwright spawn a fresh uvicorn that picked up the post-refactor SQL — all 4 tests passed.

This is the e2e harness functioning as designed: the guard caught a real environment regression that no unit test could surface (unit tests run against a fresh test DB; only e2e exercises the developer-machine state). Documenting here as a developer-experience signal for `cmc start` — restart the backend after merging migrations or schema-shaping refactors. The spec itself works correctly under the standard restart workflow.

## Conditional-Skip Discipline

Mirrors Phase 19's `skills-detail.spec.ts` and Phase 18's `alerts.spec.ts`:

- Tests 3+4 preflight via Playwright's `request` fixture (`request.get(http://127.0.0.1:8765/api/cost/breakdown?dim=project&range=7d)`).
- If `rows.length === 0`, call `test.skip(true, '<reason>')` with a developer-actionable reason ("Run a Claude Code session inside a git project … then re-run.").
- Tests 1+2 are dev-DB-state-independent and always pass.
- Phase verifiers compare failed counts only, not skip counts. A clean dev DB without project_key data legitimately produces "1-2 skipped" on this spec without regressing the suite.

README documents this under "Known Steady-State Skips" with the same framing as Phase 19's `skills-detail.spec.ts` entry.

## Phase 20 Closure

All four ROADMAP success criteria satisfied:

1. ✓ `/cost` route reachable in production preview build (Test 1).
2. ✓ Both cards render with stable section-level testids (Tests 1, 2).
3. ✓ No filesystem path leaks through the per-project card — verified at four layers (Test 3 + adversarial-mutation verification).
4. ✓ 7d/30d toggle drives a real `/api/cost/breakdown?range=30d&dim=project` fetch (Test 4).

ANLY-06 (Cost Forecast endpoint + UI) and ANLY-07 (Per-project cost breakdown UI) are now user-shippable end-to-end through real ASGI + real Vite preview build.

## Deviations from Plan

None — plan executed exactly as written. The path-leakage regex pattern in the plan body used a single backslash (`/\b\/[A-Za-z][\w/.-]+/`); the shipped spec drops the `\b` word-boundary anchor (since `/` is itself a non-word character, `\b` is redundant before `/`). Functionally identical match behavior; verified RED/GREEN under adversarial mutation. The plan's verification rubric requires "regex assertion" without specifying word-boundary anchoring, and the same pattern (without `\b`) is what `skills-detail.spec.ts` uses — mirror-pattern integrity is preserved.

## Phase 18 BASELINE.md Verifier Rules

- No `datetime.utcnow` introductions (frontend-only plan, no Python touched).
- No new ruff violations (no Python touched).
- No untracked files left behind (verified via `git status` post-commit).
- TypeScript strict-mode clean (`tsc --noEmit` passes).

## Self-Check: PASSED

**Files created:**
- `/Users/patrykattc/work/git/claude-mission-control/frontend/tests/e2e/cost-dashboard.spec.ts` — FOUND

**Files modified:**
- `/Users/patrykattc/work/git/claude-mission-control/frontend/tests/e2e/README.md` — FOUND (33 +/3 - line diff)

**Commit:**
- `0ad412a` — FOUND in `git log` (test(20-04): playwright e2e for /cost dashboard (ANLY-06/07))

**Verify gates:**
- Playwright 11 passed / 2 skipped / 0 failed — verified via `npm run test:e2e` full suite run
- Vitest 316/0 — verified via `npm test`
- Pytest 632/0 — verified via `uv run pytest -q`
- TypeScript clean — verified via `npm run typecheck`
- Adversarial-mutation verification — performed locally; RED→GREEN transition documented
