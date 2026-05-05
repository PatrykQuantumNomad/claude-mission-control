---
phase: 18-polish-carry-forward-cleanup
plan: 01
subsystem: backend-core
tags: [datetime, utc, pydantic, deprecation, python-3.12, time-helper]

# Dependency graph
requires:
  - phase: 17-skill-perf-baselines-and-comparator
    provides: stable backend foundation, 561-test pytest baseline
provides:
  - "cmc.core.time module: now_utc() naive-UTC helper (replaces datetime.utcnow)"
  - "cmc.core.time.UTCDatetime: canonical home for the PlainSerializer (Z-suffix JSON contract)"
  - "Re-export plumbing: cmc.api.schemas.common.UTCDatetime + cmc.core.now_utc"
  - "5 unit tests pinning the helper contract (naive shape, factory pattern, JSON round-trip, identity)"
affects: [18-02-utcnow-sweep, all-future-time-stamping-code]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Naive-UTC helper module pattern: single helper (now_utc) + colocated serializer (UTCDatetime), re-export from legacy home for backwards-compat"
    - "TDD with intra-plan RED-then-GREEN: 4/5 tests went green at module creation, the 5th (re-export identity) intentionally stayed RED until Task 2 wired the re-export"

key-files:
  created:
    - "backend/cmc/core/time.py"
    - "backend/tests/test_core_time.py"
  modified:
    - "backend/cmc/api/schemas/common.py"
    - "backend/cmc/core/__init__.py"

key-decisions:
  - "now_utc() returns datetime.now(UTC).replace(tzinfo=None) — preserves the SQLite-naive storage invariant while shedding the 3.12 deprecation. Aware datetimes were rejected to avoid changing the storage contract under 22 call sites."
  - "UTCDatetime moved to cmc.core.time (D-Colocation). All naive-UTC concerns now live in one module."
  - "Re-export from cmc.api.schemas.common (one-line `from cmc.core.time import UTCDatetime`) instead of touching the 8 schema importers. D-Pitfall-9 confirms re-export saves an 8-file cosmetic sweep."
  - "No speculative helpers (today_utc, parse_iso_utc) — D-Module-shape locks `promote helpers only at 3+ uses`. Plan 02's sweep determines if any pattern hits the threshold."
  - "now_utc also re-exported from cmc.core.__init__ for ergonomic `from cmc.core import now_utc`. Plan 02 may pick either form."

patterns-established:
  - "Pattern: Single-symbol helper module + colocated annotated-type — keeps the contract narrow, avoids API drift"
  - "Pattern: Two-commit migration (helper-creation, helper-adoption) — bisect-friendly, lets the sweep commit be uniform mechanical"

# Metrics
duration: ~10min
completed: 2026-05-05
---

# Phase 18 Plan 01: Time Helper and Test Summary

**Canonical naive-UTC time module (`cmc.core.time`) with `now_utc()` and colocated `UTCDatetime`, plus 5 unit tests pinning the contract — the destination Plan 02 will sweep 22 `datetime.utcnow()` call sites onto.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-05T20:00:00Z (approx)
- **Completed:** 2026-05-05T20:10:00Z (approx)
- **Tasks:** 2 (executed as 3 commits — TDD RED → GREEN module → GREEN re-export)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- Created `cmc.core.time` as the canonical home for naive-UTC time concerns.
- Added `now_utc()` returning `datetime.now(UTC).replace(tzinfo=None)`, the deprecation-free replacement for `datetime.utcnow()`.
- Moved `UTCDatetime` PlainSerializer to `cmc.core.time` and re-exported from `cmc.api.schemas.common` so all 8 existing import sites keep working without modification.
- Added 5 unit tests (`tests/test_core_time.py`) that pin the helper contract: naive shape, current-UTC value, factory-call semantics, JSON round-trip with `Z` suffix, and identity across both import paths.
- Backend pytest suite remains green: **566 passed** (561 baseline + 5 new helper tests), zero regressions.
- The 22 `datetime.utcnow()` call sites are deliberately untouched — Plan 02's scope.

## Task Commits

Each task committed atomically. Task 1 used TDD (RED then GREEN):

1. **Task 1 RED — failing tests for cmc.core.time** — `4247f56` (test)
2. **Task 1 GREEN — cmc.core.time module created** — `3256760` (feat)
3. **Task 2 — re-export wiring (common.py + cmc/core/__init__.py)** — `6e01645` (refactor)

## Files Created/Modified
- `backend/cmc/core/time.py` (new) — `now_utc()`, `_serialize_utc`, `UTCDatetime`. Module docstring documents factory-reference vs factory-call gotcha (Pitfall 7) so the sweep cannot regress on it.
- `backend/tests/test_core_time.py` (new) — 5 unit tests covering the helper contract (naive shape, UTC value, factory pattern, JSON round-trip, re-export identity).
- `backend/cmc/api/schemas/common.py` (modified) — local `_serialize_utc` and `UTCDatetime` definitions removed; replaced by a single `from cmc.core.time import UTCDatetime  # noqa: F401` re-export. Now-orphaned `from datetime import UTC, datetime`, `Annotated`, and `PlainSerializer` imports also removed.
- `backend/cmc/core/__init__.py` (modified) — `now_utc` added to the existing re-export block and to `__all__`.

## Symbol Contract for Plan 02

Stable contract Plan 02's sweep can rely on:

| Symbol | Canonical import | Ergonomic import | Re-export |
|---|---|---|---|
| `now_utc` | `from cmc.core.time import now_utc` | `from cmc.core import now_utc` | — |
| `UTCDatetime` | `from cmc.core.time import UTCDatetime` | — | `from cmc.api.schemas.common import UTCDatetime` (preserved for the 8 existing importers) |

`UTCDatetime` from both import paths is identity-equal (`is` check enforced by `test_utc_datetime_reexport_path`).

## Decisions Made
See `key-decisions` in frontmatter. All 5 are inherited from CONTEXT.md (D-Time-helper-API, D-Colocation, D-Module-shape, D-No-deprecation-shim, D-Pitfall-9) — this plan executed exactly as written, no fresh decisions taken at runtime.

## Deviations from Plan

None — plan executed exactly as written. The two minor mechanical adjustments below were lint-driven, not behavioral:

- Ruff I001 import-sort fixup on `tests/test_core_time.py` (auto-fixed via `ruff check --fix` before the RED commit landed). No semantic change.
- Removed the now-orphaned `from datetime import UTC, datetime`, `from typing import Annotated`, and `from pydantic import PlainSerializer` imports from `common.py` after deleting the local definition — this was implied by "DELETE the now-orphaned … imports IF unused" in the plan and was straight cleanup.

**Total deviations:** 0 auto-fixes via deviation rules (no Rule 1/2/3/4 invocations).
**Impact on plan:** None. Plan stayed within its single concern (helper creation + re-export).

## Issues Encountered
None. The pre-commit hook flagged a ruff import-sort issue on the test file; the standard `--fix` autofix resolved it on the first retry.

## Sweep Confirmation (Plan 02 Hand-off)

`git grep -E 'datetime\.utcnow' -- backend/` returns **22** real call sites (excluding the 4 docstring/test-comment mentions in the new module and test file). This confirms the sweep was not attempted in this plan — Plan 02 owns the 22-site mechanical replace.

Real call sites Plan 02 must replace (1 per file unless noted):
- `backend/cmc/db/models/{activities, alert_state, decisions, inbox, live_state, mcp_stats, notification_log, otel_events, otel_metrics, pricing, sessions, skills, system_state, tasks, token_usage}.py`
- `backend/cmc/db/models/alert_rules.py` (×2)
- `backend/cmc/db/models/schedules.py` (×2)
- `backend/cmc/pricing.py`
- `backend/tests/conftest.py`
- `backend/tests/test_pricing.py`

## Backend Pytest Baseline

- **Pre-plan baseline:** 561 passed (from CONTEXT/Phase 17 close)
- **Post-plan:** 566 passed (561 + 5 new `test_core_time.py` tests), 0 failed, 0 errored
- Helper introduction is purely additive — no existing test was modified or regressed.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Plan 02 (`18-02-utcnow-sweep`) is unblocked. The destination module is in place and the contract is pinned by tests.
- Recommended sweep form: `from cmc.core.time import now_utc` (most explicit; aids grep when auditing the migration). Either import form is correct per the contract.
- Plan 02 must NOT remove the re-export from `cmc.api.schemas.common` — the 8 schema importers still depend on it.

## Self-Check: PASSED

- [x] `backend/cmc/core/time.py` exists (verified)
- [x] `backend/tests/test_core_time.py` exists (verified)
- [x] Commit `4247f56` (test RED) exists in git log
- [x] Commit `3256760` (feat GREEN module) exists in git log
- [x] Commit `6e01645` (refactor re-export) exists in git log
- [x] `pytest tests/test_core_time.py` shows 5/5 GREEN
- [x] `from cmc.api.schemas.common import UTCDatetime as A; from cmc.core.time import UTCDatetime as B; assert A is B` succeeds
- [x] Full backend pytest suite: 566 passed, 0 failed
- [x] 22 `datetime.utcnow()` call sites still present (sweep is Plan 02's scope)

## TDD Gate Compliance

This plan used TDD on Task 1 (per `tdd="true"` flag). Gate sequence in git log:

1. **RED gate:** `4247f56` — `test(18-01): add failing tests for cmc.core.time helper contract`
2. **GREEN gate:** `3256760` — `feat(18-01): add cmc.core.time with now_utc() and colocated UTCDatetime`
3. **REFACTOR gate:** `6e01645` — `refactor(18-01): re-export UTCDatetime + now_utc from canonical home` (closes the remaining RED test from step 1 by wiring the re-export)

All three gates present in the expected order. RED commit correctly fails (4/5 RED with the module-missing import error).

---
*Phase: 18-polish-carry-forward-cleanup*
*Completed: 2026-05-05*
