---
phase: 18-polish-carry-forward-cleanup
baseline_recorded_at: "2026-05-05T21:18:00Z"
backend_pytest_passed: 566
backend_pytest_failed: 0
backend_pytest_warnings_total: 32
backend_pytest_warnings_datetime_utcnow: 0
frontend_vitest_passed: 293
frontend_vitest_failed: 0
frontend_playwright_passed: 7
frontend_playwright_skipped: 1
frontend_playwright_failed: 0
devdb_failed_tasks_total: 1
devdb_failed_tasks_recent_5min: 0
---

# Phase 18 Green-CI Baseline

This is the reference baseline for v1.2 phases (19–23). Verifiers in those phases compare their post-completion test counts against the numbers below.

## Backend (`pytest`)

- Passed: **566**
- Failed: **0**
- Total warnings: **32** (down from ~1429 pre-Phase-18; remaining 32 are aiosqlite default-datetime-adapter notices in `tests/test_dispatcher.py` + `tests/test_alerts_dispatcher.py` — out of POLI-06 scope)
- `datetime.utcnow` deprecation warnings: **0** (POLI-06 verify gate; see Plan 18-02 SUMMARY)
- Runtime: 174.29s (0:02:54)
- Command: `cd backend && uv run pytest --tb=no`
- Source log: `/tmp/phase18-baseline-pytest.log`

### Verifier rule (Phase 19+)

- `passed >= 566` → pass
- `failed > 0` → fail
- `warnings_datetime_utcnow > 0` → fail (regression of POLI-06)
- `total_warnings > 132` → warn (investigate; not a blocker — 100-warning headroom)

## Frontend (`vitest`)

- Passed: **293**
- Failed: **0**
- Test files: **66**
- Runtime: 6.58s
- Command: `cd frontend && pnpm exec vitest run`
- Source log: `/tmp/phase18-baseline-vitest.log`

### Verifier rule (Phase 19+)

- `passed >= 293` → pass
- `failed > 0` → fail

## E2E (`playwright test`)

- Passed: **7**
- Skipped: **1** (`alerts.spec.ts > TEST-05a: /alerts lifecycle — create rule → fire → ack` — Pitfall 6, dev-DB-state-dependent)
- Failed: **0**
- Runtime: 7.0s
- Command: `cd frontend && npx playwright test`
- Source log: `/tmp/phase18-baseline-playwright.log`

### Dev-DB context for this baseline

- `failed_tasks_total`: **1**
- `failed_tasks_recent_5min`: **0** (drives the alerts.spec.ts skip; expect 1 skip when this is 0)
- Captured via async-engine + `cmc.core.time.now_utc` (consistent with the Plan 18-02 sweep — even ad-hoc inspection scripts do not call the deprecated stdlib factory)

### Verifier rule (Phase 19+)

- `failed > 0` → fail
- `passed >= 7 - skipped_delta` → pass (where `skipped_delta` = current-run-skips minus baseline 1)
- `skipped == 1 AND alerts.spec.ts is the only skipped spec` → pass (steady-state)
- `skipped == 0 AND failed == 0` → pass (better-than-baseline; means a recent failed task was present in dev DB)
- `skipped >= 2` → flag for human review

## Lint (`ruff`)

- Project-default `ruff check`: **clean** (`All checks passed!`)
- `ruff check --select UP`: **clean** (POLI-06 GATE 1)
- `git grep -nE 'datetime\.utcnow|from datetime import .*utcnow' -- backend/`: **0 matches** (POLI-06 GATE 2)

## Cross-cutting signals

- Pytest `datetime.utcnow` deprecation-warning delta: ~1429 → **0** (target hit; see Plan 18-02 SUMMARY for pre-sweep counting methodology)
- Net dependency change for Phase 18: **0** commits touched `backend/uv.lock`, `frontend/pnpm-lock.yaml`, `frontend/package.json`, or `backend/pyproject.toml` (verified via `git log HEAD~10..HEAD -- <files>`)

## Resume rules for Phase 19+

Each downstream verifier should:

1. Read this BASELINE.md.
2. Re-run the three suites at phase close.
3. Compare counts using the per-section verifier rules above.
4. If new flakes/skips/failures surface caused by the new phase's code, fix in-phase per `--gaps` workflow.
5. If new flakes are pre-existing, append to STATE.md pending todos AND elevate to next "polish" phase budget.

## Sources

- `/tmp/phase18-baseline-pytest.log`
- `/tmp/phase18-baseline-vitest.log`
- `/tmp/phase18-baseline-playwright.log`
- Plan summaries: `18-01-SUMMARY.md`, `18-02-SUMMARY.md`, `18-03-SUMMARY.md`, `18-04-SUMMARY.md`
