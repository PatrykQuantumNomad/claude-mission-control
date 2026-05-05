---
phase: 18-polish-carry-forward-cleanup
plan: 03
subsystem: testing
tags: [vitest, react, time-determinism, test-flake, schedules]

# Dependency graph
requires:
  - phase: 17-tpnl-schedules-card
    provides: SchedulesCard component + 48h stale heuristic
  - phase: 18-01-time-helper-and-test
    provides: Phase-18 carry-forward cleanup workstream entry point
provides:
  - Deterministic SchedulesCard test fixture pinned to 2026-05-05T23:55:00Z via vi.spyOn(Date, 'now')
  - Bit-rot-proof makeSchedule factory (last_run_at default = null, not a literal ISO string)
  - TZ-independent stale-row green test under both TZ=UTC and TZ=America/New_York
affects: [phase-18-04-playwright-strict-mode, phase-18-05-baseline-and-phase-close, future-stale-heuristic-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pin clock with vi.spyOn(Date, 'now').mockReturnValue(NOW_MS) when production code reads Date.now() directly — narrowest blast radius, no interference with React-Query/userEvent timer scheduling"
    - "Test factories MUST default to a sentinel ('never run' = null) for time-dependent fields — never a hard-coded ISO string"
    - "Compute fixture timestamps from a literal NOW_MS constant (not Date.now()) so module-load timing is irrelevant"

key-files:
  created:
    - .planning/phases/18-polish-carry-forward-cleanup/18-03-SUMMARY.md
  modified:
    - frontend/src/components/panels/__tests__/SchedulesCard.test.tsx

key-decisions:
  - "Describe-scoped vi.spyOn(Date, 'now') (not file-level): existing beforeEach/afterEach already wrap the describe block, no other tests in the file assert on Date literals or relative-time renders, blast radius minimal"
  - "NOW_MS = 2026-05-05T23:55:00Z: 23:55 UTC lands on 19:55 EDT same date, exercising the boundary instant where TZ-naive comparisons would historically diverge"
  - "Replaced makeSchedule().last_run_at default with null (the schema's 'never run' sentinel) instead of removing it: keeps Partial<ScheduleListItem> type-safe AND removes bit-rot vector"
  - "Did NOT migrate the 9 other component tests using Date.now(): all use Date.now() only for relative timestamps (e.g., '60s ago'), none assert on threshold/boundary behavior, so no flake risk"
  - "Did NOT touch RelativeTime.test.tsx or EmergencyStopBanner.test.tsx: load-bearing useFakeTimers/setSystemTime usage per Pitfall 3"

patterns-established:
  - "Date.now() pinning for boundary tests: const NOW_MS = new Date('ISO').getTime() + vi.spyOn(Date, 'now').mockReturnValue(NOW_MS) in beforeEach, vi.restoreAllMocks() in afterEach"
  - "Factory default sentinel rule: time-dependent fields in test factories default to null/undefined sentinels, NEVER hard-coded ISO strings — callers must opt in to a relative timestamp"

# Metrics
duration: ~3min
completed: 2026-05-05
---

# Phase 18 Plan 03: SchedulesCard Determinism Summary

**Pinned `Date.now()` via `vi.spyOn` in SchedulesCard.test.tsx and rewrote the populated fixture so the 48h stale heuristic is deterministic across TZ=UTC and TZ=America/New_York; vitest 1 fail → 0 fail.**

## Performance

- **Duration:** ~3 min (~221s)
- **Started:** 2026-05-05T20:16:22Z
- **Completed:** 2026-05-05T20:20:03Z
- **Tasks:** 2
- **Files modified:** 1 (in scope) + 1 cross-scope deviation (see below)

## Accomplishments

- `SchedulesCard.test.tsx > stale row` is now deterministic: `vi.spyOn(Date, 'now').mockReturnValue(NOW_MS)` pins the clock to `2026-05-05T23:55:00Z`, and the populated fixture's id:1 (fresh) and id:2 (stale) timestamps are computed relative to that constant.
- Bit-rotted `makeSchedule()` default `last_run_at: '2026-04-27T15:00:00Z'` (Pitfall 1) replaced with `last_run_at: null` — the schema-valid "never run" sentinel — so factory output cannot age past correctness with calendar time.
- Vitest delta: pre-fix 65 files / 292 pass / 1 fail → post-fix 66 files / 293 pass / 0 fail. Boundary verified under TZ=UTC and TZ=America/New_York.
- POLI-07 mechanism lock satisfied: `grep -c 'vi\.spyOn(Date'` = 2, `grep -c 'vi\.useFakeTimers'` = 0.
- Production component `SchedulesCard.tsx` NOT modified.

## Task Commits

1. **Task 1: Rewrite SchedulesCard.test.tsx with vi.spyOn(Date, 'now') and NOW_MS-relative fixtures** — `3457c32` (test)
2. **Task 2: Run full vitest suite to confirm non-regression** — verification-only, no commit (no source artifacts produced)

## Files Created/Modified

- `frontend/src/components/panels/__tests__/SchedulesCard.test.tsx` — Added NOW_MS constant, `vi.spyOn(Date, 'now')` pin in beforeEach, replaced bit-rotted last_run_at default with `null`, rewrote populated.items[0] (id:1) with `NOW_MS - 5min`, rewrote populated.items[1] (id:2) to use NOW_MS reference.

## Decisions Made

- **Describe-scoped clock pin (not file-level).** Read the test file first; no other tests in the file render relative-time text or assert on Date literals. The existing `describe('SchedulesCard')` already had `beforeEach`/`afterEach`, so attaching `vi.spyOn(Date, 'now')` there is the minimal-blast-radius choice. A file-level (`vi.useFakeTimers` / setup-file) pin would have leaked into other suites if the file later grows.
- **NOW_MS = `2026-05-05T23:55:00Z`.** Same calendar date as plan execution (today, 2026-05-05), at the 23:55Z boundary. In `America/New_York` (EDT, -04:00), this is `19:55-04:00` on the same date. In UTC it's `23:55Z` same date. Both zones share the date — but a 5-minute step in either direction would put EDT and UTC on **different** local dates. This is exactly the boundary where the historical `Date.now()` flake would have manifested if the test ran at the wrong wall-clock instant.
- **Factory default = `null`, not deletion.** Removing `last_run_at` entirely from the factory's return object made TS complain (`'undefined' is not assignable to 'string | null'`), because `ScheduleListItem.last_run_at` is non-optional `string | null`. Defaulting to `null` (the "never run" sentinel) is semantically correct AND removes the bit-rot vector. Callers that exercise stale logic must still pass an explicit relative timestamp.
- **No cleanup-sweep migrations.** Audited the 9 other component tests using `Date.now()` (DecisionsCard, AgentFanoutCard, PressurePanel, SkillRunsTable, TaskBoard, LiveSessionsCard, SkillsRegistry, InboxCard, AlertEventsList) — all use `Date.now()` only for "X seconds/minutes ago" mock timestamps and none assert on threshold/boundary behavior. No flake risk → no migration. RelativeTime.test.tsx and EmergencyStopBanner.test.tsx were left untouched per Pitfall 3.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TypeScript error from removing makeSchedule's last_run_at default**

- **Found during:** Task 1 (initial commit)
- **Issue:** Pre-commit hook ran `tsc --noEmit` and failed with `TS2322: 'undefined' is not assignable to 'string | null'`. The plan instructed "REMOVE the `last_run_at: '2026-04-27T15:00:00Z'` line. Force callers to pass it explicitly." But `ScheduleListItem.last_run_at` is non-optional `string | null`, so omitting it from the factory's literal return makes TypeScript infer the property as missing.
- **Fix:** Replaced the deletion with `last_run_at: null` — the schema-valid "never run" sentinel. Semantically equivalent intent (factory doesn't smuggle in a stale timestamp) AND removes the bit-rot vector AND keeps the type system happy.
- **Files modified:** `frontend/src/components/panels/__tests__/SchedulesCard.test.tsx`
- **Verification:** `pnpm exec tsc --noEmit` clean; all 8 SchedulesCard tests pass; full vitest suite 293/293 pass.
- **Committed in:** `3457c32` (folded into the Task 1 commit before the second commit attempt succeeded)

### Cross-scope coordination violation (informational, not auto-fixed)

**`frontend/tests/e2e/README.md` was committed by this plan despite belonging to plan 18-04's file scope.**

- **What happened:** When I ran `git status --short` at start, `frontend/tests/e2e/README.md` was already in untracked state (`??`) — placed there by the parallel plan 18-04 agent before I started. After `git add frontend/src/components/panels/__tests__/SchedulesCard.test.tsx` and the first failed commit (TS error), my retry of `git add` + `git commit` swept the README into the same commit because the previous failed-commit run had moved the README's untracked file into `git`'s index for that particular commit attempt. (Pre-commit failure leaves staged state in place.)
- **Impact:** Plan 18-04's deliverable (Playwright E2E README) landed in `3457c32` instead of in plan 18-04's eventual commit. The file content itself is correct (147 lines documenting Playwright conventions, vite preview setup, reuseExistingServer, etc.) — it just shipped under the wrong plan's commit.
- **Recommended remediation:** Plan 18-04's agent should adjust their SUMMARY to reference `3457c32` for the README artifact (alongside their own commits for ScheduleComposer.tsx and the e2e spec). No file-level revert needed; the content is preserved exactly as 18-04 staged it.
- **Why not auto-revert:** Reverting would risk losing plan 18-04's exact pending content if their agent hasn't preserved it elsewhere; safer to keep the commit and document the coordination event.

---

**Total deviations:** 1 auto-fixed (Rule 3 blocking — TS type error) + 1 informational coordination event (README cross-commit)
**Impact on plan:** Auto-fix improved the design (sentinel-default factory pattern) over the plan's instruction (raw deletion). Cross-commit event is presentational only — no test or feature regressed.

## Issues Encountered

- **Pre-fix vitest baseline drift:** Plan body cited "65 files / 293 tests" pre-fix; actual pre-fix run showed 65 files / 292 pass / 1 fail (cumulative 293). Post-fix is 66 files / 293 pass / 0 fail. The +1 file is presumably from the parallel 18-04 agent adding test-related infrastructure between the plan's authoring time and execution time. No impact on success criteria — the FAIL→PASS transition on the stale-row test is what matters.

## User Setup Required

None — pure test refactor, no external services, no env changes.

## Next Phase Readiness

- Phase 18 Plans 02 (utcnow sweep), 04 (Playwright strict-mode + README), 05 (baseline) ready to proceed in parallel/sequence per the wave-2 plan.
- The test fixture pattern established here (NOW_MS literal + `vi.spyOn(Date, 'now')` + factory sentinel default) is reusable for any future test that asserts on time-window/threshold behavior in components that read `Date.now()` directly.

## Self-Check: PASSED

- `18-03-SUMMARY.md` exists at expected path.
- `SchedulesCard.test.tsx` exists and modified in scope.
- Commit `3457c32` exists in git log.
- Mechanism locks: `grep -c 'vi\.spyOn(Date'` = 2 (>= 1 required); `grep -c 'vi\.useFakeTimers'` = 0 (= 0 required).
- Vitest 293/293 pass under default + TZ=UTC + TZ=America/New_York.
- Production component `SchedulesCard.tsx` unmodified.

---
*Phase: 18-polish-carry-forward-cleanup*
*Completed: 2026-05-05*
