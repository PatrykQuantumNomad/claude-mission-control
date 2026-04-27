# Phase 7 Deferred Items

## Out-of-scope (logged during Plan 07-03 execution)

### Backend test flake — `test_phase4_estop.py::test_estop02_validate_pid_is_claude_positive`

- **Discovered:** Plan 07-03 baseline check (2026-04-27)
- **Symptom:** Fails when run as part of the full `uv run pytest` suite,
  passes when run in isolation (`uv run pytest tests/test_phase4_estop.py::
  test_estop02_validate_pid_is_claude_positive`).
- **Scope:** Pre-existing Phase 4 ESTOP test — NOT caused by Plan 07-03 (no
  Phase 4 ESTOP code modified by this plan). Likely a test-isolation /
  cwd-dependent assertion in cmc.core.process.validate_pid_is_claude.
- **Decision:** Out of scope per executor Rule SCOPE BOUNDARY. Plan 07-03
  modifies `routes/system.py` (SAPI-04 attention) only — neither the test
  itself nor any code under test was touched.
- **Owner:** Future maintenance plan; this entry serves as the trail of
  evidence that Plan 07-03 did NOT introduce the regression.
