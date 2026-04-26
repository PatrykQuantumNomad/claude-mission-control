---
phase: 04-stateful-apis
verified: 2026-04-26T17:00:00Z
status: passed
score: 5/5
overrides_applied: 0
re_verification: null
gaps: []
deferred: []
human_verification: []
---

# Phase 4: Stateful APIs — Verification Report

**Phase Goal:** Users can create, manage, and interact with decisions, inbox messages, tasks, schedules, and emergency stop via the API
**Verified:** 2026-04-26T17:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                    | Status     | Evidence                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Creating a decision via POST and answering it via POST writes the answer to the queue file on disk                                       | VERIFIED   | `hitl.py` answer_decision: `write_decision_answer` called BEFORE DB UPDATE (file-then-DB invariant); `test_hitl03_answer_writes_queue_file_first_then_updates_db` verifies file + DB   |
| 2   | Creating a task, approving it, and rerunning a failed task all transition status correctly                                               | VERIFIED   | `tasks.py` create_task/approve_task/rerun_task all present; `validate_transition` enforced in PATCH; TASK-05 gates on `awaiting_approval`, TASK-06 gates on `failed`; 17 tests pass    |
| 3   | Creating a schedule with a cron expression shows correct next\_run\_at; updating the cron clears and recomputes next\_run\_at            | VERIFIED   | `schedules.py` SCHD-02 computes `next_run(cron, now)` on create; SCHD-03 recomputes when `cron_changed OR enabled_changed`; spot-check: `next_run('0 9 * * *', now)` returns future   |
| 4   | POST /api/system/emergency-stop SIGTERMs only validated claude -p processes and sets the emergency flag                                  | VERIFIED   | `system.py` emergency_stop: KV-upserts `emergency_stop='1'`, calls `emergency_stop_all()` which uses `ps -p PID -o command=` checking both `'claude'` AND `' -p'`; 10 ESTOP tests pass |
| 5   | POST /api/inbox creates a message; POST /api/inbox/{id}/reply writes the reply to the queue file                                         | VERIFIED   | `hitl.py` create_inbox (201), reply_inbox: `write_inbox_reply` called BEFORE DB UPDATE; `test_hitl07_reply_writes_queue_file_first_then_updates_db` verifies file + DB                |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact                                        | Expected                                    | Status     | Details                                                              |
| ----------------------------------------------- | ------------------------------------------- | ---------- | -------------------------------------------------------------------- |
| `backend/cmc/api/routes/hitl.py`               | 7 HITL endpoints (decisions + inbox)        | VERIFIED   | 294 lines; all 7 endpoints confirmed; router = APIRouter present     |
| `backend/cmc/api/routes/tasks.py`              | 7 Tasks endpoints (CRUD + dispatcher)       | VERIFIED   | 267 lines; all 7 endpoints confirmed                                 |
| `backend/cmc/api/routes/schedules.py`          | 6 Schedules endpoints (CRUD + runs + NL)    | VERIFIED   | 286 lines; all 6 endpoints confirmed                                 |
| `backend/cmc/api/routes/system.py`             | Emergency stop/resume appended              | VERIFIED   | 456 lines; `/system/emergency-stop` at line 375, resume at line 435  |
| `backend/cmc/api/routes/__init__.py`           | all_routers() includes hitl, tasks, schedules | VERIFIED | All 3 imported and registered; schedules_router is 10th entry        |
| `backend/cmc/core/queue.py`                    | write_decision_answer + write_inbox_reply    | VERIFIED   | Both functions present with file-then-JSONL pattern                  |
| `backend/cmc/core/process.py`                  | validate_pid_is_claude + emergency_stop_all  | VERIFIED   | Both functions present; SIGTERM (not SIGKILL), ps validation correct |
| `backend/cmc/tasks/transitions.py`             | validate_transition state machine            | VERIFIED   | Pure function, 5-state matrix matches RESEARCH §6                    |
| `backend/cmc/tasks/spawn.py`                   | spawn_dispatcher_oneshot returning PID       | VERIFIED   | Popen with start_new_session=True, returns proc.pid                  |
| `backend/cmc/schedules/cron.py`                | validate_cron + next_run                     | VERIFIED   | Thin croniter wrappers; next_run rejects naive base                  |
| `backend/cmc/schedules/nlcron.py`              | nl_to_cron async, 503-graceful               | VERIFIED   | Returns None when ANTHROPIC_API_KEY missing; 503 in router           |
| `backend/cmc/dispatcher/oneshot.py`            | Phase-4 stub; main() returns 0               | VERIFIED   | Intentional stub; Phase 8 replaces; spot-check: main() == 0          |
| `backend/cmc/api/schemas/hitl.py`              | 11 HITL DTOs                                 | VERIFIED   | All 11 DTOs present and importable                                   |
| `backend/cmc/api/schemas/tasks.py`             | 7 Task DTOs (no TaskTriggerRequest)          | VERIFIED   | All 7 present; TaskTriggerRequest intentionally absent               |
| `backend/cmc/api/schemas/schedules.py`         | 7 Schedule DTOs                              | VERIFIED   | All 7 present including NLCronRequest/Response                       |
| `backend/cmc/api/schemas/system.py`            | Extended with EmergencyStopResponse          | VERIFIED   | EmergencyStopResponse + EmergencyResumeResponse appended             |
| `backend/cmc/config/settings.py`               | dispatcher_oneshot_cmd field                 | VERIFIED   | Field present with list[str] default_factory                         |
| `backend/tests/test_phase4_hitl.py`            | 18 tests (17 HITL + smoke)                   | VERIFIED   | 18 tests collected and passing                                       |
| `backend/tests/test_phase4_tasks.py`           | 18 tests (17 TASK + smoke)                   | VERIFIED   | 18 tests collected and passing                                       |
| `backend/tests/test_phase4_schedules.py`       | 17 tests (16 SCHD + smoke)                   | VERIFIED   | 17 tests collected and passing                                       |
| `backend/tests/test_phase4_estop.py`           | 10 tests (ESTOP-01..04)                      | VERIFIED   | 10 tests collected and passing                                       |

### Key Link Verification

| From                              | To                                   | Via                           | Status   | Details                                                        |
| --------------------------------- | ------------------------------------ | ----------------------------- | -------- | -------------------------------------------------------------- |
| `hitl.py`                         | `cmc.core.queue`                     | write_decision_answer         | WIRED    | `from cmc.core.queue import write_decision_answer, write_inbox_reply` at top of hitl.py |
| `hitl.py`                         | `cmc.db.models.decisions`            | on_conflict_do_nothing        | WIRED    | sqlite_insert(Decision).on_conflict_do_nothing at HITL-02      |
| `tasks.py`                        | `cmc.tasks.transitions`              | validate_transition           | WIRED    | Imported and called in patch_task                              |
| `tasks.py`                        | `cmc.tasks.spawn`                    | spawn_dispatcher_oneshot      | WIRED    | Imported and called in trigger_dispatcher                      |
| `schedules.py`                    | `cmc.schedules.cron`                 | validate_cron + next_run      | WIRED    | Imported and called in create_schedule and patch_schedule      |
| `schedules.py`                    | `cmc.schedules.nlcron`               | nl_to_cron                    | WIRED    | Imported and awaited in parse_nl_cron                          |
| `system.py`                       | `cmc.core.process`                   | emergency_stop_all            | WIRED    | `from cmc.core.process import emergency_stop_all` at line 48   |
| `routes/__init__.py`              | `hitl.py`, `tasks.py`, `schedules.py` | all_routers() registration   | WIRED    | All three routers imported and in all_routers() return list    |

### Data-Flow Trace (Level 4)

All router handlers query the real SQLite DB via AsyncSession from `cmc.db.get_session`. No hardcoded returns in the router endpoints — every list endpoint executes a SELECT, every create executes an INSERT. Queue writes go to real filesystem paths rooted at `repo_root() / .tmp/mission-control-queue/`. Data flows verified by TDD tests which seed real DB rows and check file side-effects.

| Artifact              | Data Variable    | Source                              | Produces Real Data | Status   |
| --------------------- | ---------------- | ----------------------------------- | ------------------ | -------- |
| `hitl.py`             | decisions/inbox  | `select(Decision/InboxMessage)` DB  | Yes                | FLOWING  |
| `tasks.py`            | tasks            | `select(Task)` DB                   | Yes                | FLOWING  |
| `schedules.py`        | schedules        | `select(Schedule)` DB               | Yes                | FLOWING  |
| `system.py` (ESTOP)   | summary, count   | `emergency_stop_all()` + `rowcount` | Yes                | FLOWING  |

### Behavioral Spot-Checks

| Behavior                                              | Command/Check                                                    | Result                              | Status  |
| ----------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------- | ------- |
| Task transition matrix correct                        | `validate_transition('awaiting_approval','pending')` == True     | True                                | PASS    |
| Terminal state enforced                               | `validate_transition('done','pending')` == False                 | False                               | PASS    |
| Rerun path works                                      | `validate_transition('failed','pending')` == True                | True                                | PASS    |
| Schedule next_run_at computed correctly               | `next_run('0 9 * * *', now_utc)` returns future datetime         | 2026-04-27 09:00:00+00:00           | PASS    |
| Invalid cron rejected                                 | `validate_cron('not a cron')` == False                           | False                               | PASS    |
| Dispatcher stub callable                              | `main()` returns 0                                               | 0                                   | PASS    |
| Full test suite                                       | 193/193 tests pass                                               | 193 passed in 92.49s                | PASS    |

### Requirements Coverage

| Requirement | Source Plan | Description                                                         | Status    | Evidence                                                          |
| ----------- | ----------- | ------------------------------------------------------------------- | --------- | ----------------------------------------------------------------- |
| HITL-01     | 04-02       | GET /api/decisions paginated list with status filter                | SATISFIED | list_decisions endpoint; 3 tests cover default + filtered paths   |
| HITL-02     | 04-02       | POST /api/decisions INSERT OR IGNORE on partial-unique dedup_key    | SATISFIED | on_conflict_do_nothing with index_where="status = 'pending'"      |
| HITL-03     | 04-02       | POST /api/decisions/{id}/answer writes to queue file FIRST          | SATISFIED | write_decision_answer before DB UPDATE; test verifies ordering     |
| HITL-04     | 04-02       | GET /api/inbox filtered list (unread, max_age_days)                 | SATISFIED | list_inbox endpoint; 3 tests cover all filter combinations        |
| HITL-05     | 04-02       | POST /api/inbox creates a message                                   | SATISFIED | create_inbox endpoint returns 201                                 |
| HITL-06     | 04-02       | POST /api/inbox/{id}/read idempotent mark-read                      | SATISFIED | Gate on `if not row.read`; second call returns same read_at       |
| HITL-07     | 04-02       | POST /api/inbox/{id}/reply writes to queue file FIRST               | SATISFIED | write_inbox_reply before DB UPDATE; test verifies ordering         |
| TASK-01     | 04-03       | GET /api/tasks paginated list with status + quadrant filters        | SATISFIED | list_tasks endpoint; 3 filter tests                               |
| TASK-02     | 04-03       | POST /api/tasks creates task with status='pending'                  | SATISFIED | create_task with full TaskCreate schema                           |
| TASK-03     | 04-03       | PATCH /api/tasks/{id} validates transition via state machine        | SATISFIED | validate_transition called; illegal transition returns 400        |
| TASK-04     | 04-03       | DELETE /api/tasks/{id} returns 204                                  | SATISFIED | delete_task returns Response(status_code=204)                     |
| TASK-05     | 04-03       | POST /api/tasks/{id}/approve awaiting_approval -> pending           | SATISFIED | Source-state check; stamps approved_at                            |
| TASK-06     | 04-03       | POST /api/tasks/{id}/rerun failed -> pending                        | SATISFIED | Source-state check; clears started_at/ended_at/error_message      |
| TASK-07     | 04-03       | POST /api/dispatcher/trigger spawns detached dispatcher             | SATISFIED | spawn_dispatcher_oneshot with start_new_session=True; returns 202 |
| SCHD-01     | 04-04       | GET /api/schedules paginated list                                   | SATISFIED | list_schedules endpoint                                           |
| SCHD-02     | 04-04       | POST /api/schedules validates cron, computes next_run_at            | SATISFIED | validate_cron before INSERT; next_run computed when enabled=True  |
| SCHD-03     | 04-04       | PATCH /api/schedules/{id} recomputes next_run_at on cron/enable     | SATISFIED | cron_changed OR enabled_changed trigger; 4 recompute tests        |
| SCHD-04     | 04-04       | DELETE /api/schedules/{id} returns 204                              | SATISFIED | delete_schedule returns Response(status_code=204)                 |
| SCHD-05     | 04-04       | GET /api/schedules/{id}/runs returns task history                   | SATISFIED | list_schedule_runs; 404 on missing schedule                       |
| SCHD-06     | 04-04       | POST /api/schedules/parse-nl NL->cron via Haiku, 503-graceful       | SATISFIED | nl_to_cron returns None -> 503; single message hides failure mode |
| ESTOP-01    | 04-05       | POST /api/system/emergency-stop SIGTERMs PID-file claude -p procs   | SATISFIED | emergency_stop_all() called; SIGTERM not SIGKILL                  |
| ESTOP-02    | 04-05       | Emergency stop verifies PID is claude -p via ps                     | SATISFIED | validate_pid_is_claude checks 'claude' AND ' -p' in cmd line      |
| ESTOP-03    | 04-05       | Emergency stop sets emergency_stop='1' and fails running tasks      | SATISFIED | KV-upsert then UPDATE tasks WHERE status='running'                |
| ESTOP-04    | 04-05       | POST /api/system/emergency-resume clears flag                       | SATISFIED | KV-upsert value='0' (NOT DELETE — preserves audit row)            |

### Anti-Patterns Found

| File                          | Pattern           | Severity | Impact                                                                          |
| ----------------------------- | ----------------- | -------- | ------------------------------------------------------------------------------- |
| `cmc/dispatcher/oneshot.py`   | Intentional stub  | Info     | main() returns 0 and logs "Phase-4 stub". Intentional — Phase 8 replaces this. |

No blockers found. The dispatcher stub is the only flagged pattern and it is intentional per the roadmap (Phase 8 replaces it via `Settings.dispatcher_oneshot_cmd`).

### Human Verification Required

None. All 5 must-haves are verifiable programmatically and confirmed by the 193-test suite. The ESTOP endpoint works against real PIDs via subprocess `ps`; the queue file writes are verified by reading the filesystem in tests. No UI-layer behavior is part of Phase 4 scope.

### Gaps Summary

No gaps. All 5 observable truths are VERIFIED with direct code evidence and test coverage.

**Note on ROADMAP.md checkbox:** The `04-04-PLAN.md` checkbox in ROADMAP.md shows `[ ]` (unchecked) but the implementation is complete — commits `59402cf` (RED) and `8a0ef25` (GREEN) landed, `04-04-SUMMARY.md` is present, and 16 SCHD tests pass. The checkbox is a documentation gap only; it does not affect verification status.

---

_Verified: 2026-04-26T17:00:00Z_
_Verifier: Claude (gsd-verifier)_
