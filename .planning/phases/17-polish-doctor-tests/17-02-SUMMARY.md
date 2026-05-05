---
phase: 17-polish-doctor-tests
plan: 02
subsystem: testing
tags: [pytest, telegram, callback-verbs, parametrize, traceability, poli-02, poli-03]

# Dependency graph
requires:
  - phase: 9-telegram-bot
    provides: "Phase 9-01 narrow inspect.signature() guard on api.send_message — POLI-02 extends it with a directory-wide grep guard"
  - phase: 15-alerting
    provides: "CallbackVerb StrEnum (8 members) consolidated in cmc.telegram.callback_verbs; dash_router.decode_callback + route() verb dispatch — POLI-03 round-trips them all"
provides:
  - "POLI-02: directory-wide regex guard against parse_mode= assignments anywhere in cmc/telegram/*.py"
  - "POLI-03: parametrized round-trip test over list(CallbackVerb) — every enum member exercises decode_callback → route end-to-end"
  - "Coverage-completeness gate that KeyError-fails when a new CallbackVerb member is added without a VERB_FIXTURES entry"
  - "Greppable POLI-02 / POLI-03 tokens for /gsd:verify-work and 17-06 status-flip mapping"
affects: [17-06-plan, REQUIREMENTS.md status flips, future telegram package contributions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Directory-wide source grep test: Path.rglob('*.py') + comment-stripping + negative lookahead regex"
    - "Registry-driven parametrize: list(EnumClass) in @pytest.mark.parametrize so new enum members auto-include + force fixture coverage"

key-files:
  created:
    - backend/tests/test_telegram_grep.py
    - backend/tests/test_callback_verbs_round_trip.py
  modified: []

decisions:
  - "Comment-stripping (line.split('#', 1)[0]) before regex match keeps the 8 prose mentions of `parse_mode` in cmc/telegram/ legal — only `=` assignments (not `==` equality) fail the guard"
  - "VERB_FIXTURES dict keyed by CallbackVerb member (not by string literal) so a renamed verb auto-detects the keyer and the fixture survives identifier renames"
  - "Defense-in-depth: a separate `test_callback_verb_fixture_coverage_complete` complements the parametrize so missing fixtures surface as ONE named failure rather than 8 parametrize-shape errors"
  - "REQUIREMENTS.md status flip for POLI-02 + POLI-03 deferred to 17-06 (single-writer wave 2 plan) — passing tests ARE this plan's verification artifact"

metrics:
  duration_minutes: 7
  completed: 2026-05-05
---

# Phase 17 Plan 02: Telegram parse_mode Guard + CallbackVerb Round-Trip Summary

Two greppable backend tests pin two of v1.1's most load-bearing telegram invariants — "no parse_mode in the package" and "every callback verb routes correctly" — to a registry-driven failure path. New telegram functions or enum members can no longer slip past `make test` without explicit author attention.

## What Shipped

| File                                                                          | LOC | Tests | POLI tags |
| ----------------------------------------------------------------------------- | --: | ----: | --------- |
| `backend/tests/test_telegram_grep.py` (new)                                   |  48 |     1 | POLI-02 ×3 |
| `backend/tests/test_callback_verbs_round_trip.py` (new)                       | 105 |     9 | POLI-03 ×8 |

10 tests added, 0 modified. Backend regression suite: **561 passed** (was ~551 before this plan landed POLI-01 + POLI-04 in 17-01 plus this plan's 10).

## POLI-02 — Directory-wide `parse_mode=` Guard

**Empirical confirmation that the regex catches assignments but allows existing prose mentions:**

The HEAD scan during planning predicted 0 matches against the regex `\bparse_mode\s*=(?!=)` combined with comment-stripping. Re-confirmed at execution time (manual python harness) — 0 matches. The test passes cleanly.

The 8 prose mentions in `cmc/telegram/` that the guard intentionally permits:

| File                                | Line | Context                                                  |
| ----------------------------------- | ---: | -------------------------------------------------------- |
| `cmc/telegram/__init__.py`          |    1 | Module docstring: "do not use parse_mode"                |
| `cmc/telegram/api.py`               |    3 | Docstring: "do NOT add a `parse_mode` parameter"         |
| `cmc/telegram/api.py`               |    7 | Docstring: "swallows the notification"                   |
| `cmc/telegram/api.py`               |   44 | Function docstring: "NO parse_mode parameter (Pitfall P3)" |
| `cmc/telegram/handler.py`           |   14 | Docstring: "does NOT accept a parse_mode parameter"      |
| `cmc/telegram/handler.py`           |   15 | Docstring: "Do not bypass this by adding a parse_mode here" |
| `cmc/telegram/notifier.py`          |    6 | Module docstring: "no parse_mode arg"                    |
| `cmc/telegram/messages.py`          |    9 | ALRT-11 invariant docstring                              |
| `cmc/telegram/messages.py`          |  125 | Inline comment on plain-UTF-8 contract                   |

ALL pass the guard because:
1. **Word-boundary `\b`** ensures no spurious matches inside identifiers.
2. **Optional whitespace + `=` + negative lookahead `(?!=)`** requires assignment (not equality `==`, not bare mention).
3. **Comment-stripping** via `line.split("#", 1)[0]` excludes `# parse_mode=...` documentation lines.

A future contributor adding `parse_mode='Markdown'` to ANY telegram call site (existing function OR brand-new function) gets:
```
POLI-02: cmc/telegram/ must contain NO parse_mode= assignments. Found:
  cmc/telegram/<file>:<line>: <offending line>
```

This complements (does not replace) the existing per-signature `test_api_no_parse_mode_argument` in `test_telegram_units.py:15`, which only inspects `api.send_message`'s signature. POLI-02's grep catches the same regression on NEW functions the signature test couldn't see.

## POLI-03 — CallbackVerb Round-Trip Parametrize

8 fixtures, 8 enum members, 1 coverage-completeness gate. Each fixture pairs a representative `callback_data` string with the expected `(method, path_prefix)` shape:

| Verb               | callback_data                       | Expected (method, path_prefix)                                              |
| ------------------ | ----------------------------------- | --------------------------------------------------------------------------- |
| `approve_task`     | `approve_task:42`                   | `("POST", "/api/tasks/42/approve")`                                         |
| `reject_task`      | `reject_task:42`                    | `("POST", "/api/tasks/42/reject")`                                          |
| `rerun_task`       | `rerun_task:9`                      | `("POST", "/api/tasks/9/rerun")`                                            |
| `answer_decision`  | `answer_decision:7:yes`             | `("POST", "/api/decisions/7/answer")`                                       |
| `reply_inbox`      | `reply_inbox:12`                    | `("NOOP", "/api/inbox/12")`                                                 |
| `snooze`           | `snooze:overdue_schedule:7:30m`     | `("RESOLVE_THEN_PATCH", "/api/notifications/_resolve/overdue_schedule/7")` |
| `estop`            | `estop`                             | `("POST", "/api/system/emergency-stop")`                                    |
| `ack_alert`        | `ack_alert:42:abcdef12`             | `("POST", "/api/alerts/_ack")`                                              |

### Reinforced ad-hoc coverage

Of the 8 verbs, **6/8** previously had per-verb ad-hoc tests that the registry-driven parametrize now reinforces (defense-in-depth — the existing tests are NOT removed, they cover edge cases this round-trip doesn't exercise):

| Verb              | Reinforced from                           |
| ----------------- | ----------------------------------------- |
| `approve_task`    | `test_telegram_units.py::test_route_approve_task` |
| `answer_decision` | `test_telegram_units.py::test_route_answer_decision` (+ `_includes_telegram_provenance`) |
| `estop`           | `test_telegram_units.py::test_route_estop` |
| `snooze`          | `test_telegram_units.py::test_route_snooze_resolves_first` |
| `reply_inbox`     | `test_telegram_units.py::test_route_reply_inbox_is_noop` |
| `ack_alert`       | `test_alerts_telegram.py::test_dash_router_routes_ack_alert` |

The **2/8** that lacked dedicated `route()` tests gain first-time end-to-end route assertions:

| Verb           | Previous coverage                         | New                              |
| -------------- | ----------------------------------------- | -------------------------------- |
| `reject_task`  | Touched only by handler-side keyboard composition tests | Full decode → route round-trip |
| `rerun_task`   | Keyboard composition test only            | Full decode → route round-trip   |

### Coverage-completeness defense

`test_callback_verb_fixture_coverage_complete` runs once (NOT parametrized) and surfaces missing `VERB_FIXTURES` entries as a single named failure with this exact message:

```
POLI-03: <N> CallbackVerb members lack VERB_FIXTURES entries: ['<value>', ...]
```

Without this defense test, a contributor adding a new enum member without updating the fixture would see 1 single parametrized test fail with a KeyError — semantically correct but easy to confuse with a real routing bug. The defense gate names the precise failure mode.

## Verification

```
$ cd backend && uv run pytest tests/test_telegram_grep.py tests/test_callback_verbs_round_trip.py -v
collected 10 items
tests/test_telegram_grep.py .                                            [ 10%]
tests/test_callback_verbs_round_trip.py .........                        [100%]
============================== 10 passed in 0.02s ==============================

$ cd backend && uv run pytest -x
561 passed, 1429 warnings in 196.60s (0:03:16)

$ grep -rn "POLI-02\|POLI-03" backend/tests/ | wc -l
11
```

All success criteria met:
- [x] Task 1: `test_telegram_grep.py` created with POLI-02 module + test docstring tags
- [x] Task 2: `test_callback_verbs_round_trip.py` created with POLI-03 tags + `parametrize(list(CallbackVerb))` + coverage-completeness defense test
- [x] Each new file committed atomically (Task 1 = `3bfe340`; Task 2 final = `cfb1c63`; see Deviations re: `197ccde`)
- [x] 10/10 new tests green
- [x] Full backend suite green (561 passed, no regressions)
- [x] POLI-02/POLI-03 grep returns 11 matches across both new files (≥5 required)
- [x] No REQUIREMENTS.md edits (deferred to 17-06)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Reformatted aligned-column VERB_FIXTURES dict literal to satisfy ruff E501**

- **Found during:** Task 2 first commit attempt
- **Issue:** The plan's verbatim `VERB_FIXTURES` block used aligned-column formatting that produced 6 lines exceeding the project's 100-char line length cap. `pre-commit` ran `uv run ruff check cmc tests` and rejected the commit.
- **Fix:** Reformatted the dict literal so each entry spans 4 lines (key + `(` + payload-tuple-1 + payload-tuple-2 + `)`), preserving identical semantics. Re-ran tests (9/9 still green) before recommit.
- **Files modified:** `backend/tests/test_callback_verbs_round_trip.py`
- **Commit:** `cfb1c63`

**2. [Rule 3 — Recovery] Pre-commit stash/restore race produced wrong-content commit; corrected with follow-up commit**

- **Found during:** Task 2 commit verification (`git show --stat HEAD`)
- **Issue:** After ruff failed and was fixed, the retry of `git commit` reported success (`[main 197ccde]`) but the resulting commit contained `frontend/tests/e2e/alerts.spec.ts` (114 lines, NOT my work — appears to be in-flight content from a different work stream) instead of `backend/tests/test_callback_verbs_round_trip.py`. The intended file remained untracked. Hypothesis: pre-commit's "stash unstaged files → run hooks → restore" sequence raced with concurrent file activity in the working tree (other untracked .planning/ and frontend/ files were present), and the final post-hook stage capture pulled the wrong delta. The Task 1 commit had no such race despite the same workflow because no concurrent untracked file activity overlapped its commit window.
- **Fix:** Did NOT use destructive ops (no `git reset --hard`, no `--amend`). Instead, made a follow-up commit `cfb1c63` that adds the actual `backend/tests/test_callback_verbs_round_trip.py` and explains the recovery in the commit message. Commit `197ccde` remains in history but its body content (`alerts.spec.ts`) is unrelated CMC work that another work stream owns; this plan does NOT modify or revert it.
- **Files modified:** `backend/tests/test_callback_verbs_round_trip.py` (added in `cfb1c63`)
- **Commit:** `cfb1c63` (corrective); `197ccde` (racy precursor, kept in history)

### Authentication Gates

None encountered.

### Out-of-Scope Discoveries

None deferred. The README.md / `frontend/tests/e2e/{alerts,sessions-compare}.spec.ts` activity in the working tree during execution belongs to other work streams (separate planning/agent processes) and was deliberately NOT staged or committed by this plan.

## Commits

| Task | Commit  | Files                                                | Tests |
| ---- | ------- | ---------------------------------------------------- | ----- |
| 1    | 3bfe340 | `backend/tests/test_telegram_grep.py`                | 1     |
| 2    | cfb1c63 | `backend/tests/test_callback_verbs_round_trip.py`    | 9     |

(Note: `197ccde` is the racy precursor of Task 2 — see Deviation 2 above; HEAD as of plan completion is `cfb1c63` plus this SUMMARY commit.)

## Self-Check: PASSED

- `backend/tests/test_telegram_grep.py` — FOUND
- `backend/tests/test_callback_verbs_round_trip.py` — FOUND
- `.planning/phases/17-polish-doctor-tests/17-02-SUMMARY.md` — FOUND
- Commit `3bfe340` (Task 1) — FOUND
- Commit `cfb1c63` (Task 2 corrective) — FOUND
- Test pass count: 10/10 new + 561 total backend suite — VERIFIED
