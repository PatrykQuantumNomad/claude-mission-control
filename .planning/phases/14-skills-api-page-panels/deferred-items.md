# Phase 14 Deferred Items

Items discovered during execution that are out of scope per the SCOPE BOUNDARY
rule (only auto-fix issues directly caused by the current task's changes).

## From Plan 14-02 Execution (2026-05-03)

### Pre-existing test failure: SchedulesCard stale-row class assertion

- **Test:** `frontend/src/components/panels/__tests__/SchedulesCard.test.tsx`
  > "stale row (last_run_at > 48h ago) gets cmc-schedules-row--stale class"
- **Status:** Failing at baseline (commit `e8af6b2`, before any Plan 14-02 commits).
- **Why deferred:** Plan 14-02 only touched `frontend/src/lib/api.ts`,
  `frontend/src/lib/queries.ts`, `frontend/src/lib/useFirehose.ts`, and the
  affected mock-data tests in `__tests__/`. SchedulesCard.tsx and its test
  were NOT modified. The test failure is unrelated to skills-API plumbing.
- **Likely owner:** Phase 7 (SchedulesCard original work, commit `30b17d0`)
  or any prior phase that drifted the `cmc-schedules-row--stale` class
  computation.
- **Recommendation:** Track separately as a pre-existing bug; resolve in a
  dedicated test-stabilization plan or under Phase 14 Plan 03/04 if any
  panel work touches the schedules surface.
