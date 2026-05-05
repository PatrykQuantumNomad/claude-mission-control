---
phase: 17-polish-doctor-tests
plan: 01
subsystem: testing
tags: [pytest, doctor, alerts, traceability, poli-01, poli-04]

# Dependency graph
requires:
  - phase: 13-cost-skills-foundation
    provides: "POLI-01 doctor checks (_check_pricing_freshness, _check_unpriced_tokens, _check_otel_log_tool_details) — lifted forward in Phase 13 Plan 05"
  - phase: 15-alerting
    provides: "POLI-04 heartbeat one-shot lifecycle (1 decision + 1 notification_log per firing rule) — implemented in test_heartbeat_hook_calls_evaluate_alerts; this plan adds the missing notification_log assertion"
provides:
  - "POLI-01 traceability test pinning the three doctor checks in doctor.CHECKS registry"
  - "POLI-04 docstring tag + notification_log==1 assertion in heartbeat one-shot test"
  - "Greppable POLI-01 / POLI-04 tokens in backend/tests/ for /gsd:verify-work mapping"
affects: [17-06-plan, gsd-verify-work, REQUIREMENTS.md status flips]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Traceability tag tests: docstring contains REQ-ID for verifier grep mapping"

key-files:
  created: []
  modified:
    - backend/tests/test_doctor.py
    - backend/tests/test_alerts_dispatcher.py

key-decisions:
  - "No re-implementation: POLI-01 and POLI-04 are 95-100% already shipped — added smallest possible diff (1 new test + 1 docstring rewrite + 1 assertion line)"
  - "REQUIREMENTS.md status flips deferred to plan 17-06 (single-writer wave-2 pattern) to avoid concurrent writes from parallel wave-1 plans"
  - "Used registry-presence assertion (CHECKS function names) instead of behavioral re-test — pins the wiring without duplicating per-check unit tests at backend/tests/test_doctor.py:286-335"

patterns-established:
  - "Traceability tags: requirement IDs (POLI-XX) live in test docstrings so /gsd:verify-work can grep tests by ID"
  - "Single-writer REQUIREMENTS.md flips: wave-1 plans add tests; wave-2 closer plan flips status atomically"

# Metrics
duration: 5min
completed: 2026-05-05
---

# Phase 17 Plan 01: POLI-01 + POLI-04 Traceability Summary

**Added registry-presence test for POLI-01 doctor checks and notification_log==1 assertion + POLI-04 docstring tag in heartbeat one-shot test — 30 LOC total, zero re-implementation.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-05T13:48:23Z
- **Completed:** 2026-05-05T13:53:14Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- POLI-01 closed: confirmed already-shipped Phase 13-05 work via new `test_poli_01_doctor_checks_registered` registry test (asserts `_check_pricing_freshness`, `_check_unpriced_tokens`, `_check_otel_log_tool_details` all present in `doctor.CHECKS`).
- POLI-04 closed: extended `test_heartbeat_hook_calls_evaluate_alerts` with POLI-04 tagged docstring and a `_count_notification_log == 1` assertion alongside the existing `_count_decisions == 1` — fully captures the firing-rule lifecycle.
- Backend suite: 552 passed (up from 551), zero regressions, full `pytest -x` green in 205s.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add POLI-01 traceability test to test_doctor.py** — `0a3855b` (test)
2. **Task 2: Extend test_heartbeat_hook_calls_evaluate_alerts with POLI-04 notification_log assertion** — `cb44ad0` (test)

## Files Created/Modified
- `backend/tests/test_doctor.py` — Appended `test_poli_01_doctor_checks_registered` (21 lines, including blank-line + section comment) at end of file. Asserts the 3 POLI-01 check function names are present in `doctor.CHECKS`.
- `backend/tests/test_alerts_dispatcher.py` — Rewrote docstring of `test_heartbeat_hook_calls_evaluate_alerts` (POLI-04 tag, lifecycle wording) and added 1 new assertion `_count_notification_log(sessions, entity_id=dedup_key) == 1` after the existing `_count_decisions == 1`.

## Decisions Made
- **No POLI-01 re-implementation needed.** Research confirmed all three doctor checks were lifted forward in Phase 13 Plan 05 (commit a8a0d1f) with full unit-test coverage at lines 286-335 of `test_doctor.py`. Adding a registry-presence test is sufficient and pins the wiring against future regressions.
- **No POLI-04 dispatcher work needed.** The heartbeat one-shot already produces both the decision row and the notification_log row (Phase 15); the existing `_count_notification_log` helper at line 137 was already in use by sibling tests. This plan added the missing pairing assertion + docstring tag — that's it.
- **REQUIREMENTS.md flips deferred** to plan 17-06 to keep wave-1 plans free of concurrent REQUIREMENTS.md writes.

## Deviations from Plan

None - plan executed exactly as written. Verbatim code blocks from the plan compiled and passed on first run.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- POLI-01 and POLI-04 traceability complete and greppable from `backend/tests/`.
- Plan 17-06 (single-writer closer) can flip REQUIREMENTS.md status for POLI-01 and POLI-04 once all wave-1 plans (17-01 through 17-05) have landed.
- Wave-1 sibling plans (17-02 through 17-05) are unblocked; this plan touched only test files, no shared modules.

## Self-Check: PASSED

- FOUND: backend/tests/test_doctor.py (modified)
- FOUND: backend/tests/test_alerts_dispatcher.py (modified)
- FOUND commit 0a3855b (Task 1)
- FOUND commit cb44ad0 (Task 2)
- VERIFIED: `pytest tests/test_doctor.py::test_poli_01_doctor_checks_registered` — 1 passed
- VERIFIED: `pytest tests/test_alerts_dispatcher.py::test_heartbeat_hook_calls_evaluate_alerts` — 1 passed
- VERIFIED: `pytest -x` full suite — 552 passed, zero failures
- VERIFIED: `grep POLI-01 backend/tests/test_doctor.py` — 4 matches
- VERIFIED: `grep POLI-04 backend/tests/test_alerts_dispatcher.py` — 3 matches

---
*Phase: 17-polish-doctor-tests*
*Completed: 2026-05-05*
