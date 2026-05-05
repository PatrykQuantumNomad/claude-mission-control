---
phase: 18-polish-carry-forward-cleanup
verified: 2026-05-05T21:30:00Z
status: passed
score: 4/4
overrides_applied: 0
re_verification: false
---

# Phase 18: Polish & Carry-Forward Cleanup — Verification Report

**Phase Goal:** Discharge accumulated v1.1 carried debt so every subsequent v1.2 phase runs against a green CI baseline with no false-signal noise from time-of-day flakes, deprecated stdlib calls, or Playwright strict-mode collisions.
**Verified:** 2026-05-05T21:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `Field(default_factory=datetime.utcnow)` gone; all 22 sites call `cmc/core/time.py now_utc()`; `ruff check --select UP` clean | VERIFIED | `git grep -nE 'datetime\.utcnow' -- backend/` returns 0 matches. `ruff check --select UP` (venv ruff 0.15.12) returns "All checks passed!". `now_utc()` confirmed at 19 Field default_factory sites + 2 inline call sites. |
| 2 | `SchedulesCard.test.tsx > stale row` deterministic under TZ=UTC and TZ=America/New_York using `vi.spyOn(Date, 'now')`, not `vi.useFakeTimers` | VERIFIED | `vi.spyOn(Date, 'now').mockReturnValue(NOW_MS)` at line 87. `vi.useFakeTimers` absent. 8/8 tests pass under TZ=UTC and 8/8 under TZ=America/New_York (both verified by direct run). |
| 3 | `schedule-composer.spec.ts` passes Playwright strict-mode via `getByTestId`; convention documented in e2e README; `alerts.spec.ts` passes with 0 failures (1 steady-state skip preserved) | VERIFIED | `data-testid="schedule-composer-name"` on source `<input>` in ScheduleComposer.tsx:191. `schedule-composer.spec.ts:58` uses `page.getByTestId('schedule-composer-name')`. `frontend/tests/e2e/README.md` exists with `feature-component-element` convention. `alerts.spec.ts` passes with 0 new strict-mode violations (BASELINE.md records 7 passed / 1 skipped / 0 failed). |
| 4 | All three suites green at phase close; `BASELINE.md` exists with verifier rules for downstream phases | VERIFIED | pytest: 566 passed / 0 failed / 32 warnings (confirmed by re-running: `566 passed, 32 warnings in 172.73s`). vitest: 293 passed / 0 failed (re-run: `293 passed`). Playwright: 7 passed / 1 skipped / 0 failed (BASELINE.md). `BASELINE.md` at `.planning/phases/18-polish-carry-forward-cleanup/BASELINE.md` with 3 verifier-rule subsections and numeric frontmatter. |

**Score:** 4/4 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/cmc/core/time.py` | `now_utc()` returning naive UTC datetime | VERIFIED | Exists. `now_utc()` returns `datetime.now(UTC).replace(tzinfo=None)`. `UTCDatetime` Annotated type colocated. Unit tests in `test_core_time.py`. |
| `backend/cmc/api/schemas/common.py` | Re-exports `UTCDatetime` from `cmc.core.time` | VERIFIED | `from cmc.core.time import UTCDatetime  # noqa: F401` at line 17. `test_utc_datetime_reexport_path` confirms identity equality. |
| `backend/tests/test_core_time.py` | Unit tests for `now_utc()` contract | VERIFIED | 5 tests covering naive-return, UTC-value, factory-pattern, serializer roundtrip, re-export identity. |
| `frontend/src/components/panels/__tests__/SchedulesCard.test.tsx` | Uses `vi.spyOn(Date, 'now')`, not `vi.useFakeTimers` | VERIFIED | `vi.spyOn(Date, 'now').mockReturnValue(NOW_MS)` in `beforeEach`. `vi.useFakeTimers` not present. Fixed 48h threshold fixture uses `NOW_MS`-relative offsets. |
| `frontend/src/components/panels/ScheduleComposer.tsx` | `data-testid="schedule-composer-name"` on the Name input | VERIFIED | Attribute present at line 191. Confirmed `grep -c` returns 1. |
| `frontend/tests/e2e/schedule-composer.spec.ts` | Uses `getByTestId('schedule-composer-name')` | VERIFIED | `page.getByTestId('schedule-composer-name').fill(name)` at line 58. |
| `frontend/tests/e2e/README.md` | Documents `feature-component-element` convention | VERIFIED | Exists (~150 lines). Sections: Selector Hierarchy, When to Add data-testid, Naming Convention, Where the Attribute Lives, Running the Suite, Known Steady-State Skips, Strict Mode. |
| `.planning/phases/18-polish-carry-forward-cleanup/BASELINE.md` | Verifier baseline with pass counts and rules | VERIFIED | Exists with YAML frontmatter (12 numeric fields). 3 verifier-rule subsections (pytest, vitest, playwright). |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| 19 model files (`db/models/*.py`) | `cmc/core/time.py` | `from cmc.core.time import now_utc` + `Field(default_factory=now_utc)` | WIRED | All 17 model files + `pricing.py` confirmed importing `now_utc` and using it as `default_factory`. |
| `cmc/api/schemas/common.py` | `cmc/core/time.py` | `from cmc.core.time import UTCDatetime` re-export | WIRED | Re-export present; 8 schema files (alerts, sessions, skills, etc.) import `UTCDatetime` from `common`. |
| `SchedulesCard.tsx:182` | `SchedulesCard.test.tsx:87` | `Date.now()` call spied via `vi.spyOn(Date, 'now')` | WIRED | `isStale()` calls `Date.now()` at line 182; test mocks at line 87 with `NOW_MS`. |
| `schedule-composer.spec.ts:58` | `ScheduleComposer.tsx:191` | `page.getByTestId('schedule-composer-name')` resolves to `data-testid="schedule-composer-name"` | WIRED | Source attribute confirmed; spec uses `getByTestId`; production build rebuilt per SUMMARY deviations. |

---

## Data-Flow Trace (Level 4)

Not applicable for this phase — no dynamic-data-rendering components were introduced. Phase 18 delivered a time helper, a test migration, a selector fix, and a documentation artifact. No new API routes or data-fetching components.

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `now_utc()` returns naive datetime with tzinfo=None | `python -c "from cmc.core.time import now_utc; r=now_utc(); print(r.tzinfo)"` | `None` | PASS |
| `UTCDatetime` re-export from `common.py` resolves correctly | `python -c "from cmc.api.schemas.common import UTCDatetime; print('OK')"` | `OK` | PASS |
| `git grep -nE 'datetime\.utcnow' -- backend/` returns 0 matches | `git grep -nE 'datetime\.utcnow' -- backend/` | (empty output) | PASS |
| `ruff check --select UP` passes clean | `cd backend && .venv/bin/ruff check --select UP .` | `All checks passed!` | PASS |
| Vitest full suite | `cd frontend && pnpm exec vitest run` | 293 passed (66 files) | PASS |
| SchedulesCard 8 tests TZ=UTC | `TZ=UTC pnpm exec vitest run "SchedulesCard"` | 8 passed | PASS |
| SchedulesCard 8 tests TZ=America/New_York | `TZ=America/New_York pnpm exec vitest run "SchedulesCard"` | 8 passed | PASS |
| pytest full suite | `cd backend && .venv/bin/pytest --tb=no` | 566 passed, 32 warnings, 0 failed | PASS |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|------------|------------|-------------|--------|----------|
| POLI-06 | 18-01, 18-02 | Eliminate `datetime.utcnow` deprecation warnings; centralize in `cmc/core/time.py` | SATISFIED | 22 call sites migrated; `git grep` returns 0; `ruff --select UP` clean; 0 deprecation warnings in pytest. |
| POLI-07 | 18-03 | `SchedulesCard > stale row` deterministic across TZ and clock-boundary conditions | SATISFIED | `vi.spyOn(Date, 'now')` mechanism locked; 8/8 tests pass TZ=UTC and TZ=America/New_York. |
| POLI-08 | 18-04 | Playwright strict-mode clean; `data-testid` convention documented | SATISFIED | 0 strict-mode violations; `schedule-composer-name` testid on source component; `e2e/README.md` exists with convention. |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/cmc/dispatcher/alerts.py` | 73 | `_utcnow_naive()` local helper duplicates `now_utc()` logic | Info | Uses `datetime.now(UTC).replace(tzinfo=None)` (NOT deprecated `datetime.utcnow`) — no POLI-06 violation. Redundant vs the centralized helper but not a blocker; could be refactored to import `now_utc` in a future cleanup. |
| `backend/cmc/api/routes/alerts.py` | 77 | `_utcnow_naive()` local helper duplicates `now_utc()` logic | Info | Same as above. Pre-existing from Phase 15; not in scope of the 22-site sweep (these did not use the deprecated call). |
| `backend/tests/test_doctor.py` | 20 | `_utcnow_iso()` local helper | Info | Uses `datetime.now(UTC).replace(tzinfo=None)` — no deprecated call, test-helper only. |

None of the above are blockers or warnings. The POLI-06 gate is `git grep -nE 'datetime\.utcnow'` returning 0, which passes. The local helpers are stylistic redundancies, not API violations.

---

## Human Verification Required

None. All must-have truths are verifiable programmatically and have been confirmed by direct code inspection and test execution.

---

## Gaps Summary

No gaps. All 4 ROADMAP success criteria are verified against the actual codebase:

1. **POLI-06** — `datetime.utcnow` is gone. 0 call sites remain. `ruff check --select UP` clean. `now_utc()` in `cmc/core/time.py` confirmed returning `datetime.now(UTC).replace(tzinfo=None)`. All 19 `Field(default_factory=)` sites and 2 inline sites use `now_utc`.

2. **POLI-07** — `SchedulesCard.test.tsx > stale row` test uses `vi.spyOn(Date, 'now').mockReturnValue(NOW_MS)` (not `vi.useFakeTimers`). Both TZ=UTC and TZ=America/New_York produce 8/8 passing tests.

3. **POLI-08** — `schedule-composer.spec.ts` uses `page.getByTestId('schedule-composer-name')` (no longer the ambiguous `getByLabel('Name')`). `data-testid="schedule-composer-name"` lives on the source component `ScheduleComposer.tsx:191`. `alerts.spec.ts` has 0 strict-mode violations (the "firehose Filter skill name" collision was latent — no active selector in `alerts.spec.ts` touches that input; confirmed by reading the full spec). `frontend/tests/e2e/README.md` documents `feature-component-element` convention with 5 examples.

4. **SC4** — All three suites are green: pytest 566/0, vitest 293/0, playwright 7/0 (1 steady-state skip in `alerts.spec.ts` documented and expected). `BASELINE.md` exists with numeric frontmatter and verifier rules for Phase 19+.

---

_Verified: 2026-05-05T21:30:00Z_
_Verifier: Claude (gsd-verifier)_
