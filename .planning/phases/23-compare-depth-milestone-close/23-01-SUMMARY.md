---
phase: 23-compare-depth-milestone-close
plan: 01
subsystem: api
tags: [fastapi, sqlite, sessions, compare, p95, otel]

requires:
  - phase: 16-session-compare
    provides: "/api/sessions/compare baseline (CMPR-01..04) and over-cap behavior"
  - phase: 19-per-project-skills
    provides: "sessions.project_key normalization for project identity"
provides:
  - "CMPR-06: per-side per-skill p95 latency rollup + low-sample gating flags on /api/sessions/compare"
  - "CMPR-07: GET /api/sessions/{sid}/previous resolver (project_key + ended_at ordering)"
affects: [frontend, cmdk, sessions-compare]

tech-stack:
  added: []
  patterns:
    - "Single rollup SQL per compare side to preserve CMPR-04 query budget"
    - "404-as-empty-state for previous-session resolver (no previous session)"

key-files:
  created: []
  modified:
    - backend/cmc/api/routes/sessions.py
    - backend/cmc/api/schemas/sessions.py
    - backend/tests/test_sessions_router.py

key-decisions:
  - "None - followed plan as specified (D-01..D-06, D-15..D-18)."

patterns-established:
  - "Compare response shape pinning: top-level low_sample_* and per-side skill_latencies"
  - "SQL budget tests: statement-count pin for under-cap vs over-cap compare paths"

requirements-completed: [CMPR-06, CMPR-07]

duration: 8m
completed: 2026-05-08
---

# Phase 23 Plan 01: Compare Depth (Backend) Summary

**Extended session compare with per-skill p95 latency per side plus a server-authoritative previous-session resolver keyed by `project_key`.**

## Performance

- **Duration:** 8m
- **Started:** 2026-05-08T14:50:00Z
- **Completed:** 2026-05-08T14:58:00Z
- **Tasks:** 2/2
- **Files modified:** 5

## Accomplishments

- Added `skill_latencies` per compare side and top-level `low_sample_a` / `low_sample_b` flags without increasing compare-side SQL count.
- Ensured `over_cap=true` responses still include `skill_latencies` (only tool-counts work is skipped).
- Implemented `GET /api/sessions/{sid}/previous` with locked ordering semantics and deterministic tests.

## Task Commits

Each task was committed atomically:

1. **Task 23-01-01: Add per-skill p95 latency to compare sides (CMPR-06)** - `46e85be` (feat)
2. **Task 23-01-02: Implement GET /api/sessions/{sid}/previous resolver (CMPR-07)** - `bdc0e74` (feat)

## Files Created/Modified

- `backend/cmc/api/routes/sessions.py` - Combined per-side skills+latency rollup, top-level low-sample flags, and new `/previous` resolver endpoint.
- `backend/cmc/api/schemas/sessions.py` - Added `skill_latencies` to `SessionCompareSide` and top-level `low_sample_a/low_sample_b` to `SessionCompareResponse`.
- `backend/tests/test_sessions_router.py` - Pinned compare shape + low-sample threshold + SQL budget; added full `/previous` contract test suite.
- `backend/cmc/config/settings.py` - Compatibility shim for `pydantic_settings.NoDecode` (deviation; see below).
- `backend/cmc/auth/service.py` - Optional PyJWT import so auth-disabled startup doesn’t require `jwt` module (deviation; see below).

## Decisions Made

None - followed plan as specified.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Made settings/auth imports robust in minimal Python envs**
- **Found during:** Task 23-01-01 verification (running backend hooks/tests)
- **Issue:** Some environments lacked `pydantic_settings.NoDecode` and `jwt` (PyJWT), causing import-time failures even when those features are not enabled.
- **Fix:** Added a `NoDecode` compatibility shim and made PyJWT optional with clear errors only when auth is enabled.
- **Files modified:** `backend/cmc/config/settings.py`, `backend/cmc/auth/service.py`
- **Verification:** pre-commit hooks passed on the task commit; pytest for sessions router passed under `backend/.venv`.
- **Committed in:** `46e85be` (part of Task 23-01-01 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3: 1)
**Impact on plan:** Blocking fixes only; no scope creep.

## Issues Encountered

- **Backend tests must be run under the repo’s Python 3.13 virtualenv** (`backend/.venv`). Running under an older global Python fails due to 3.12+ syntax in the codebase.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Backend contracts for CMPR-06 and CMPR-07 are implemented and pinned with tests; ready for frontend wiring (Cmd+K action + compare view rendering).

## Self-Check: PASSED

- Found `.planning/phases/23-compare-depth-milestone-close/23-01-SUMMARY.md`
- Found commits `46e85be` and `bdc0e74`

