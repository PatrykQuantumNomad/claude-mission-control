# Deferred / Out-of-Scope Items — Phase 21

## Pre-existing flaky test (NOT caused by Plan 21-03)

- **`tests/test_emergency_stop.py::test_estop02_validate_pid_is_claude_positive`**
  - Discovered during Plan 21-03 full-suite verify (650 passed / 1 failed).
  - Passes in isolation (`uv run pytest tests/test_emergency_stop.py::test_estop02_validate_pid_is_claude_positive -v` → 1 passed).
  - Failure mode is environment-dependent (PID lookup against `claude` process), not test-logic.
  - Plan 21-03 touches frontend + a new backend pytest only — zero overlap with `cmc.system.emergency_stop` or its test surface.
  - Per SCOPE BOUNDARY rule: out of scope for this plan; logged for future cleanup.
