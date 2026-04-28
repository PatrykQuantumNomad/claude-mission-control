# Deferred Items — Phase 9

Out-of-scope discoveries logged during plan execution. Not fixed in the
discovering plan; tracked here for a future cleanup pass.

## 09-02 (notifier oneshot loop)

- **Test order dependency:** `tests/test_phase4_estop.py::test_estop02_validate_pid_is_claude_positive`
  fails when the full suite runs (`uv run pytest`) but passes both in
  isolation (`pytest tests/test_phase4_estop.py::test_estop02...`) and
  when only the `test_phase4_estop.py` file is run by itself. It also
  passed cleanly during the 09-02 baseline measurement (340 passed).
  This is a pre-existing order-dependent flake in Phase 4 ESTOP tests
  unrelated to the telegram surface area touched by 09-02. Out of scope
  for this plan; flagged here for the verifier or a future Phase 4
  hardening pass to investigate (likely a leaked process / shared psutil
  monkeypatch state between tests).
