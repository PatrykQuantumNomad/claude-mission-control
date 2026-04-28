---
phase: 10-telegram-wiring-fixes
plan: 01
subsystem: telegram
tags: [telegram, callbacks, hitl, audit, reject-route, answered_by, provenance, fastapi, dash_router, gap-closure]

# Dependency graph
requires:
  - phase: 04-stateful-apis
    provides: Tasks router pattern (TASK-05 approve, TASK-06 rerun) — explicit source-state check + fixed-target action endpoints that bypass validate_transition
  - phase: 09-telegram-setup-testing
    provides: dash_router callback verb mapper, run_handler_loop dispatch loop, _local_api_transport / _telegram_transport mock fixtures, approval-card 🛑 Reject button (messages.py:97), HITL schemas/hitl.py answered_by Literal["dashboard","telegram","cli"]
provides:
  - POST /api/tasks/{task_id}/reject route (TASK-08, awaiting_approval -> cancelled, fixed-target action mirroring approve_task)
  - TaskRejectResponse DTO (id:int, status:str)
  - dash_router answer_decision body now stamped {"answer": ..., "answered_by": "telegram"} (HITL audit-trail provenance correctness)
  - _local_api_transport request-body capture (additive "body" key) — enables wired-handler body assertions for any future Telegram callback
  - Approve / Reject / Snooze / answer_decision callback parity quartet — all four now have end-to-end handler-level tests
affects: [v1.0 milestone gap closure, future Telegram callback verbs (the parity quartet is the template), HITL audit-trail correctness]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fixed-target action endpoint pattern (TASK-05/06/08): explicit source-state check + direct row.status assignment; bypasses validate_transition matrix because the target is constant"
    - "Wired-handler body-capture pattern: _local_api_transport additively records POST/PATCH/PUT bodies to enable end-to-end provenance assertions through run_handler_loop"
    - "Provenance-stamping convention: dash_router stamps source='telegram' on every body it constructs; backend HITL schemas accept Literal['dashboard','telegram','cli'] so this slots in zero-schema-change"

key-files:
  created: []
  modified:
    - backend/cmc/api/routes/tasks.py (+29 lines — reject_task handler + TaskRejectResponse import)
    - backend/cmc/api/schemas/tasks.py (+5 lines — TaskRejectResponse DTO)
    - backend/cmc/telegram/dash_router.py (+8/-2 lines — answered_by='telegram' literal + verb-table comment update)
    - backend/tests/test_phase4_tasks.py (+42 lines — 3 reject route tests: legal/illegal/404)
    - backend/tests/test_phase9_handler.py (+95/-1 lines — _local_api_transport body capture + 2 parity tests)
    - backend/tests/test_phase9_telegram_unit.py (+14/-1 lines — 1 new dash_router unit test + body shape update on existing test)

key-decisions:
  - "Did NOT extend _ALLOWED_TRANSITIONS matrix — mirrored approve_task / rerun_task convention with explicit source-state check + direct row.status='cancelled' assignment. The audit's claim 'transition already exists in matrix' (v1.0-MILESTONE-AUDIT.md:129) was incorrect; the matrix has no 'cancelled' entry. Fixed-target action endpoints conventionally bypass the matrix because the target is constant — adding 'cancelled' to the matrix would have triggered cascading questions (pending->cancelled? running->cancelled?) that v1.0 doesn't need."
  - "No cancelled_at column / Alembic migration — surgical surface. The audit didn't require it; adding it would have meant model + frontend cascade. Existing approved_at on Task model is the analog for approve; cancellation timestamp can be derived from the audit log if ever needed."
  - "Updated existing test_route_answer_decision (telegram_unit) to assert the new canonical body shape rather than keeping a parallel test for the legacy shape — the old shape was the v1.0 audit gap, full stop. Both pure-function tests now express the same canonical body."
  - "Reject route placed AFTER approve_task (logical inverse) and BEFORE rerun_task in routes/tasks.py, despite TASK-08 being a higher numeric label — readability + grep-locality > numeric ordering."

patterns-established:
  - "Wired-handler body capture: _local_api_transport additively records body bytes alongside method/url/path. Backward-compatible (existing tests reading c['method']/c['url'] keep working). Pattern reusable for any future callback that needs body-shape assertion at the handler level rather than just the dash_router level."
  - "Two-level coverage for dash_router body shape: pure-function test (test_phase9_telegram_unit.py — guards dash_router.route()) + wired-handler test (test_phase9_handler.py — guards handler→http_client wiring). The pair catches both 'router constructs wrong body' and 'router-correct but handler drops body' regressions."

# Metrics
duration: 8m 10s
completed: 2026-04-28
---

# Phase 10 Plan 01: Telegram Wiring Fixes Summary

**Closed two v1.0 audit gaps surgically — added the missing POST /api/tasks/{id}/reject backend route (mirroring approve_task convention) and tagged Telegram-sourced HITL answers with answered_by='telegram' in dash_router — across 6 files / 5 atomic commits / +189 / -4 lines, with the validate_transition matrix, Task model, frontend, telegram/messages.py, and telegram/handler.py all UNTOUCHED.**

## Performance

- **Duration:** 8m 10s
- **Started:** 2026-04-28T15:06:40Z
- **Completed:** 2026-04-28T15:14:50Z
- **Tasks:** 3 (all type="auto")
- **Commits:** 5 atomic (RED+GREEN×2 + 1 single)
- **Files modified:** 6 (3 source + 3 tests)
- **Test delta:** 373 → 379 (+6: 3 reject route + 1 router unit + 2 handler parity)

## Accomplishments

- **SC1 closed:** POST /api/tasks/{task_id}/reject route now exists and transitions awaiting_approval → cancelled, returns 200 with `{id, status: "cancelled"}` on success, 400 on illegal source state, 404 on missing id. Mirrors approve_task verbatim (explicit source-state check; bypasses validate_transition because target is fixed). 3 route tests cover legal / illegal / 404.
- **SC2 closed:** Telegram approval-card 🛑 Reject button now reaches the backend end-to-end (was 404'ing). New wired-handler test `test_handler_callback_reject_task_dispatches_post` exercises the full path: callback_query data="reject_task:42" → run_handler_loop → dash_router.route → POST /api/tasks/42/reject → ack callback_query + strip buttons via editMessageReplyMarkup.
- **SC3 closed (both halves):** dash_router.route("answer_decision", [...]) now stamps body with `answered_by="telegram"`, so the HITL audit trail correctly attributes Telegram-origin answers (was defaulting to "dashboard" via `schemas/hitl.py:53` Literal default). Two-level coverage: pure-function unit test + wired-handler end-to-end body-capture test (proves the body actually flows over the wire, not just gets constructed).
- **SC4 closed:** Approve / Reject / Snooze / answer_decision callback parity quartet all green at the wired-handler level (Approve + Snooze pre-existing, Reject + answer_decision newly added).
- **SC5 confirmed:** Full backend suite at 379 passing (was 373 baseline; +6 new tests, exactly per plan estimate of 378-379). Total runtime ~133 s.

## Audit Gaps Closed

Cites `v1.0-MILESTONE-AUDIT.md` sections (lines 119-135):

| Audit gap | Audit lines | Resolution |
|-----------|-------------|------------|
| 🛑 Reject button on Telegram approval-card 404s end-to-end (no `/api/tasks/{id}/reject` route) | 119-130 | Added `reject_task` route in `backend/cmc/api/routes/tasks.py` + `TaskRejectResponse` DTO; commit `1e5fb8b`. |
| `dash_router` posts decision answers without `answered_by`, mis-tagging Telegram-origin answers as "dashboard" in HITL audit log | 131-135 | One-line fix to `dash_router.route("answer_decision", ...)`; commit `c99d52e`. |

## Audit-Correction Note

The v1.0 audit at `v1.0-MILESTONE-AUDIT.md:129` claims "transition already exists in `validate_transition` matrix per Phase 4 verification" for `awaiting_approval -> cancelled`. **This is incorrect.** Inspection of `backend/cmc/tasks/transitions.py:16-22` confirms the matrix has no `cancelled` entry — neither as a key nor as a value. The Task model docstring (`db/models/tasks.py:28`) likewise omits it.

**This plan therefore did NOT extend `_ALLOWED_TRANSITIONS`.** Instead, it mirrored the existing `/approve` and `/rerun` convention: explicit source-state check (`if row.status != "awaiting_approval": raise HTTPException(400, ...)`), then direct `row.status = "cancelled"` assignment. Both `approve_task` and `rerun_task` already bypass the matrix because their target state is constant; `reject_task` follows the same convention. Bypassing the matrix avoids cascading questions (does pending→cancelled exist? running→cancelled?) that v1.0 doesn't need, keeps the matrix pure for PATCH-driven transitions (its actual purpose per the docstring), and matches the audit author's likely intent (the conceptual transition is sensible, even if the matrix entry doesn't exist).

## Untouched Modules — Negative Checks (all confirmed)

`git diff HEAD~5..HEAD` shows the following are EMPTY / UNCHANGED:

- `backend/cmc/tasks/transitions.py` — matrix intact; `_ALLOWED_TRANSITIONS` not modified.
- `backend/cmc/db/models/tasks.py` — Task model unchanged; no `cancelled_at` column.
- `backend/migrations/versions/` — no new migration files (1 existing migration `0001_initial`, unchanged).
- `backend/cmc/api/schemas/hitl.py` — unchanged; `answered_by: Literal["dashboard","telegram","cli"]` already accepted "telegram".
- `frontend/` — no files touched (frontend Reject UX is out of scope per Phase 10 RESEARCH §"Q2 — frontend").
- `backend/cmc/telegram/messages.py` — 🛑 Reject button stays per audit recommendation (the audit said "implement the route", NOT "remove the button").
- `backend/cmc/telegram/handler.py` — `dispatch_callback` already handled arbitrary (method, path, body) tuples; no wiring changes needed.

## Task Commits

Each task atomic-committed per the plan's `<done>` blocks:

1. **Task 1 (TDD: /reject route + DTO)** — 2 commits:
   - `affc19a` — `test(10-01): RED — add failing reject route tests` (+42 lines, test_phase4_tasks.py; 3 tests at 405 Method Not Allowed)
   - `1e5fb8b` — `feat(10-01): GREEN — POST /api/tasks/{id}/reject + TaskRejectResponse DTO` (+34 lines, routes/tasks.py + schemas/tasks.py)
2. **Task 2 (dash_router answered_by)** — 2 commits:
   - `80dea47` — `test(10-01): RED — assert answered_by=telegram in dash_router answer_decision body` (+13/-1 lines, test_phase9_telegram_unit.py)
   - `c99d52e` — `fix(10-01): GREEN — tag Telegram-sourced decision answers with answered_by=telegram` (+6/-2 lines, dash_router.py — body literal + verb-table comment)
3. **Task 3 (handler parity tests + body capture)** — 1 commit:
   - `9ebe70d` — `test(10-01): cover Telegram callback parity end-to-end (reject + answered_by provenance)` (+94/-1 lines, test_phase9_handler.py)

**5 atomic commits total**, exactly per the plan estimate. No metadata commit yet — that wraps SUMMARY.md + STATE.md + ROADMAP.md after self-check.

## Files Created/Modified

- `backend/cmc/api/routes/tasks.py` — `+29 lines` — added `reject_task` handler + `TaskRejectResponse` import. Mirrors `approve_task` pattern verbatim. NO change to existing routes.
- `backend/cmc/api/schemas/tasks.py` — `+5 lines` — added `TaskRejectResponse(BaseModel)` with id:int, status:str. Sits directly after `TaskRerunResponse`.
- `backend/cmc/telegram/dash_router.py` — `+8/-2 lines` — `answer_decision` branch now returns body `{"answer": args[1], "answered_by": "telegram"}`; verb-table comment block updated.
- `backend/tests/test_phase4_tasks.py` — `+42 lines` — 3 new tests: `test_task_reject_legal`, `test_task_reject_illegal`, `test_task_reject_404`.
- `backend/tests/test_phase9_handler.py` — `+95/-1 lines` — `_local_api_transport` body-capture extension; 2 new tests: `test_handler_callback_reject_task_dispatches_post`, `test_handler_callback_answer_decision_tags_telegram_provenance`.
- `backend/tests/test_phase9_telegram_unit.py` — `+14/-1 lines` — 1 new test: `test_route_answer_decision_includes_telegram_provenance`; existing `test_route_answer_decision` body assertion updated to canonical shape.

## Final Test Count + Pass Status

```
$ cd backend && .venv/bin/pytest --collect-only 2>&1 | tail -1
379 tests collected in 0.21s

$ cd backend && .venv/bin/pytest 2>&1 | tail -1
379 passed, 7211 warnings in 132.95s (0:02:12)
```

**379/379 passing** (was 373/373 baseline; +6 new tests, +0 regressions). Warnings are pre-existing aiosqlite deprecation noise from Python 3.13 — out of scope for this plan.

## Verification Mapping (ROADMAP SC1-5)

| SC | Check | Verified |
|----|-------|----------|
| SC1 | POST /api/tasks/{id}/reject — legal / illegal / 404 | `pytest tests/test_phase4_tasks.py -k reject -v` → 3 PASSED |
| SC2 | Telegram 🛑 Reject button cancels task end-to-end (no 404) | `pytest tests/test_phase9_handler.py::test_handler_callback_reject_task_dispatches_post -v` → PASSED |
| SC3 | answer_decision body includes answered_by="telegram" (pure-function + wired) | `pytest -k "answer_decision and (telegram_provenance or includes_telegram)" -v` → 2 PASSED |
| SC4 | Approve / Reject / Snooze / answer_decision quartet all green | `pytest tests/test_phase9_handler.py -k "approve or reject or snooze or answer_decision" -v` → 4 PASSED |
| SC5 | Backend suite ≥373 green | `pytest 2>&1 \| tail -1` → 379 passed |

## Decisions Made

See frontmatter `key-decisions`. The most consequential is the audit-correction note above (matrix NOT extended). The other three are conventional / surgical-surface choices that match the plan's intent.

## Deviations from Plan

**One micro-adjustment:**

### Auto-fixed Issues

**1. [Rule 1 — Bug] Updated existing `test_route_answer_decision` to canonical body shape**
- **Found during:** Task 2 RED phase
- **Issue:** The plan's RED phase only added a NEW test asserting the new body shape, but left the existing `test_route_answer_decision` (test_phase9_telegram_unit.py:202-205) asserting the OLD body shape `{"answer": "yes"}`. After Task 2 GREEN landed, that existing test would have failed (immediate regression in the same plan), forcing a follow-up commit to fix it.
- **Fix:** Updated the existing test to assert the same canonical shape as the new test. Both tests now express the canonical post-fix body. The old shape was the v1.0 audit gap, so retaining a test asserting it would have been actively wrong.
- **Files modified:** backend/tests/test_phase9_telegram_unit.py (the existing assertion + the new test, in the same RED commit)
- **Verification:** Both tests pass after GREEN; full telegram-unit suite at 34 green (was 33 baseline).
- **Committed in:** 80dea47 (Task 2 RED commit, atomic with the new test)

---

**Total deviations:** 1 auto-fixed (Rule 1 bug — same-plan regression in the existing assertion).
**Impact on plan:** Zero scope creep; the change is in the same line as the RED-phase work the plan called for, and avoids leaving a known-failing test on the branch between the RED and GREEN commits. All other plan instructions executed verbatim.

## Issues Encountered

- The system `pytest` on PATH (Python 3.11 from pyenv) raised `ImportError: cannot import name 'NoDecode' from 'pydantic_settings'` because `pydantic_settings.NoDecode` was added in 2.6+ and the system Python had an older pin. Resolved immediately by using `.venv/bin/pytest` (project venv, Python 3.13) — the project standard. Not a deviation; just an environment mismatch on first invocation.

## User Setup Required

None — no external service configuration required. All changes are server-side + tests. No env var changes, no migration, no frontend touch.

## Next Phase Readiness

- Phase 10 plan 01 is the only plan in this phase; all 5 ROADMAP SCs (SC1-5) green.
- Phase 11 (next gap-closure phase per `3e6012d docs(roadmap): add gap closure phases 10-11`) can be picked up immediately.
- v1.0 milestone tagging blocked only on the remaining Phase 11 work; the two telegram-wiring gaps that prompted Phase 10 are now closed.
- For future Telegram callback work: the `_local_api_transport` body-capture pattern + the parity-quartet test layout (1 pure-function dash_router test + 1 wired-handler test per verb) is the template.

## Self-Check: PASSED

All 6 modified source/test files + the SUMMARY.md exist on disk. All 5 task-commit hashes (affc19a, 1e5fb8b, 80dea47, c99d52e, 9ebe70d) are reachable in git history. No missing artifacts.

---
*Phase: 10-telegram-wiring-fixes*
*Completed: 2026-04-28*
