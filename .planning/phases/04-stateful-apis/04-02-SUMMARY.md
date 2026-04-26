---
phase: 04-stateful-apis
plan: 02
subsystem: backend
tags: [phase-4, hitl, decisions, inbox, router, tdd, queue-writer, partial-unique]
dependency-graph:
  requires:
    - phase-1: SQLModel Decision + InboxMessage tables (Plan 01-05)
    - phase-3: cmc.api.schemas.common.ORMBase + per-router test convention (Plan 03-01)
    - phase-4-wave-0: cmc.api.schemas.hitl (11 DTOs), cmc.core.queue (write_decision_answer + write_inbox_reply), conftest factories make_decision_row + make_inbox_row (Plan 04-01)
  provides:
    - cmc.api.routes.hitl.router — 7 endpoints under /api (HITL-01..07)
    - hitl_router registration in cmc.api.routes.all_routers()
    - .tmp/mission-control-queue/decisions/{id}.jsonl writer side of the contract (Phase 8 dispatcher reads)
    - .tmp/mission-control-queue/inbox/{id}.jsonl writer side of the contract (Phase 8 dispatcher reads)
  affects:
    - Phase 7 dashboard (HPNL-01 + HPNL-02): consumes GET /api/decisions and GET /api/inbox; POSTs answers and replies through this router
    - Phase 8 dispatcher (DISP-07 + DISP-08): tails the JSONL files this router writes
    - Phase 4 Plan 04-03 (Tasks router): can decision-link via Decision.task_id (FK already wired) — no router change needed, just future TaskListResponse joins
tech-stack:
  added: []
  patterns:
    - "INSERT OR IGNORE via SQLAlchemy sqlite_insert(...).on_conflict_do_nothing(index_elements=['dedup_key'], index_where=text(\"status = 'pending'\")).returning(Decision) — conflict path returns 200, fresh insert returns 201"
    - "File-then-DB ordering for queue+DB writes: if file write raises, DB UPDATE never happens (dispatcher can safely resend)"
    - "Conflict-refetch SELECT scoped to status='pending' (Pitfall 6): without the scope, an answered row with the same dedup_key could shadow the live pending one"
    - "Per-router test file convention from Plan 03-01: every HITL-* test lives in test_phase4_hitl.py; helpers _seed_decision/_seed_inbox use app.state.sessions sessionmaker"
    - "DB-side idempotency check (HITL-06): SQLite strips tzinfo on round-trip so JSON string equality fails on trailing 'Z'/'+00:00' even when instants match — compare row.read_at across two SELECTs instead"
key-files:
  created:
    - backend/cmc/api/routes/hitl.py
    - .planning/phases/04-stateful-apis/04-02-SUMMARY.md
  modified:
    - backend/cmc/api/routes/__init__.py
    - backend/tests/test_phase4_hitl.py
decisions:
  - "HITL-02 conflict path returns 200 (NOT 201) + the existing pending row — distinguishes 'created new' from 'returned existing' for the dashboard's optimistic-UI path"
  - "HITL-03 + HITL-07 file-then-DB ordering locked in Plan 04-02; Pitfall 1 mitigation. The reverse order is the bug pattern."
  - "HITL-06 idempotency: second mark-read call returns the SAME read_at by skipping the DB write entirely (`if not row.read:` gate), not by re-stamping with the existing value"
  - "Partial-unique scope is `status='pending'` only — once answered, a same-dedup_key POST creates a NEW pending row (validated by test_hitl02_create_after_answer_creates_new_row)"
metrics:
  duration_minutes: 12
  tasks_completed: 2
  files_changed: 4
  tests_after: 151
  tests_before: 134
  completed_date: "2026-04-26"
---

# Phase 4 Plan 02: HITL Router Summary

7 HITL endpoints (HITL-01..07) shipped under `/api` in a single router because decisions and inbox share the file-queue writer dependency from Plan 04-01. INSERT OR IGNORE on the partial-unique `dedup_key` index prevents duplicate pending decisions; file-then-DB ordering on answer/reply ensures the dispatcher can safely resend if the queue write fails. 17 new tests bring the suite to 151/151 green.

## Endpoints Inventory

| Method | Path                              | Req body              | Response model            | Status codes        |
| ------ | --------------------------------- | --------------------- | ------------------------- | ------------------- |
| GET    | `/api/decisions`                  | (query: status, limit, offset) | `DecisionListResponse`   | 200                 |
| POST   | `/api/decisions`                  | `DecisionCreate`      | `DecisionListItem`        | 201 (new) / 200 (conflict) |
| POST   | `/api/decisions/{id}/answer`      | `DecisionAnswerRequest` | `DecisionAnswerResponse` | 200 / 404 / 409     |
| GET    | `/api/inbox`                      | (query: unread, max_age_days, limit, offset) | `InboxListResponse` | 200 |
| POST   | `/api/inbox`                      | `InboxCreate`         | `InboxListItem`           | 201                 |
| POST   | `/api/inbox/{id}/read`            | (none)                | `InboxReadResponse`       | 200 / 404           |
| POST   | `/api/inbox/{id}/reply`           | `InboxReplyRequest`   | `InboxReplyResponse`      | 200 / 404           |

All seven mounted under `/api` via `all_routers()` in `cmc.api.routes.__init__.py`, registered after `skills_router`.

## INSERT OR IGNORE Pattern (HITL-02)

```python
stmt = (
    sqlite_insert(Decision)
    .values(...)
    .on_conflict_do_nothing(
        index_elements=["dedup_key"],
        index_where=text("status = 'pending'"),
    )
    .returning(Decision)
)
result = await db.execute(stmt)
row = result.scalar_one_or_none()
if row is None:
    # Conflict: SELECT scoped to status='pending' (Pitfall 6)
    existing = (await db.execute(
        select(Decision).where(
            Decision.dedup_key == payload.dedup_key,
            Decision.status == "pending",
        )
    )).scalar_one()
    response.status_code = 200
    return DecisionListItem.model_validate(existing)
```

The conflict path uses `Response.status_code = 200` to distinguish "returned existing pending row" from "created new". The fallback SELECT must include `status='pending'` because the partial-unique scope is pending-only — without that filter, an answered row with the same `dedup_key` could be returned instead.

**Validated by tests:**
- `test_hitl02_create_returns_201` — fresh POST returns 201 + new row
- `test_hitl02_create_duplicate_pending_returns_existing` — re-POST while pending returns 200 + same id; DB has exactly 1 row
- `test_hitl02_create_after_answer_creates_new_row` — POST → answer → POST again → 201 + DIFFERENT id; DB has 2 rows (one answered, one pending)

## File-then-DB Ordering Invariant (HITL-03 + HITL-07)

Both answer and reply endpoints follow this exact sequence:

1. SELECT the row; 404 if missing.
2. (HITL-03 only) 409 if already answered.
3. **Append the JSONL line to the queue file FIRST.** If `write_decision_answer` / `write_inbox_reply` raises (FS full, EPERM, etc.), no DB UPDATE happens.
4. UPDATE the row (status/answer/answered_at/answered_by or reply/replied_at).
5. `await db.commit()`.
6. Return the response with `queue_path`.

The reverse order is the bug pattern: a successful DB UPDATE followed by a failed file write would mark a decision answered with no queue record for the dispatcher to consume.

**Validated by tests:**
- `test_hitl03_answer_writes_queue_file_first_then_updates_db` — both file and DB checked after a successful response
- `test_hitl03_answer_409_when_already_answered` — confirms the 409 path writes NO queue file (file-then-DB invariant cannot wrongly fire)
- `test_hitl07_reply_writes_queue_file_first_then_updates_db` — file + DB checked

## Queue File Paths + JSONL Record Shapes

Single source of truth: `cmc.core.queue.queue_path()` from Plan 04-01.

### Decisions

```
repo_root() / .tmp/mission-control-queue/decisions/{decision_id}.jsonl
```

```jsonl
{"ts":"2026-04-26T16:24:50.123456+00:00","decision_id":1,"answer":"yes","answered_by":"dashboard"}
```

### Inbox

```
repo_root() / .tmp/mission-control-queue/inbox/{inbox_id}.jsonl
```

```jsonl
{"ts":"2026-04-26T16:24:50.123456+00:00","inbox_id":1,"reply":"got it"}
```

Phase 8 dispatcher (DISP-07 + DISP-08) tails these directories. `.tmp/` is gitignored — confirmed by Plan 03-03's `test_sess06_queue_path_is_gitignored` (still passing).

## Test Inventory (17 cases mapping to requirements)

| # | Test                                                            | Requirement |
| - | --------------------------------------------------------------- | ----------- |
| 1 | `test_hitl01_list_default_returns_all_statuses`                 | HITL-01     |
| 2 | `test_hitl01_list_filtered_pending`                             | HITL-01     |
| 3 | `test_hitl01_list_filtered_answered`                            | HITL-01     |
| 4 | `test_hitl02_create_returns_201`                                | HITL-02     |
| 5 | `test_hitl02_create_duplicate_pending_returns_existing`         | HITL-02     |
| 6 | `test_hitl02_create_after_answer_creates_new_row`               | HITL-02     |
| 7 | `test_hitl03_answer_writes_queue_file_first_then_updates_db`    | HITL-03     |
| 8 | `test_hitl03_answer_404_when_decision_missing`                  | HITL-03     |
| 9 | `test_hitl03_answer_409_when_already_answered`                  | HITL-03     |
| 10 | `test_hitl04_inbox_list_default`                                | HITL-04     |
| 11 | `test_hitl04_inbox_list_unread_filter`                          | HITL-04     |
| 12 | `test_hitl04_inbox_list_max_age_days`                           | HITL-04     |
| 13 | `test_hitl05_create_inbox`                                      | HITL-05     |
| 14 | `test_hitl06_mark_read`                                         | HITL-06     |
| 15 | `test_hitl06_mark_read_404`                                     | HITL-06     |
| 16 | `test_hitl07_reply_writes_queue_file_first_then_updates_db`     | HITL-07     |
| 17 | `test_hitl07_reply_404`                                         | HITL-07     |

Plus 1 carry-over Wave-0 smoke (`test_phase4_hitl_smoke`) = 18 tests in `test_phase4_hitl.py`.

## Test Counts

| Phase                   | Tests | Notes                              |
| ----------------------- | ----- | ---------------------------------- |
| Phase 1 (boot)          | 25    | Unchanged                          |
| Phase 2 (ingest)        | 36    | Unchanged                          |
| Phase 3 (read APIs)     | 69    | Unchanged                          |
| Phase 4 Wave 0 smokes   | 4     | Unchanged                          |
| Phase 4 HITL (Wave 1)   | 17    | NEW (this plan; smoke kept inside test_phase4_hitl.py)        |
| **Total**               | **151** | All green; 0 failures           |

`backend/.venv/bin/python -m pytest backend/tests/ -p no:warnings` returns `151 passed in ~100s`.

## Entry Contracts for Downstream Plans

### Phase 7 dashboard (HPNL-01 + HPNL-02)

```typescript
// Decision queue panel: GET /api/decisions?status=pending then POST answer
type DecisionListItem = {
  id: number;
  session_id: string | null;
  task_id: number | null;
  dedup_key: string;
  prompt: string;
  options: any[];
  status: "pending" | "answered";
  answer: string | null;
  answered_at: string | null;       // ISO-8601, nullable while pending
  answered_by: "dashboard" | "telegram" | "cli" | null;
  created_at: string;
};

// Optimistic-UI hint: POST /api/decisions returning 200 (not 201)
// means "duplicate of an existing pending decision" — show the existing
// row inline rather than as a fresh create.
```

### Phase 8 dispatcher (DISP-07 + DISP-08)

The dispatcher tails the queue directories Phase 4 writes:

```python
import json
from pathlib import Path
from cmc.core.paths import repo_root

decisions_dir = repo_root() / ".tmp" / "mission-control-queue" / "decisions"
for jsonl_file in decisions_dir.glob("*.jsonl"):
    decision_id = int(jsonl_file.stem)
    with jsonl_file.open() as f:
        for line in f:
            record = json.loads(line)
            # record = {"ts": ..., "decision_id": id, "answer": ..., "answered_by": ...}
            handle_decision_answer(decision_id, record)
```

The DB row is the authoritative state (status='answered'); the queue file is the dispatcher's notification channel. After consuming a record, the dispatcher should rotate or truncate the file (Phase 8 implementation detail — Phase 4 only writes).

### Phase 4 Plan 04-03 (Tasks router)

`Decision.task_id` FK is already wired (Plan 01-05). `TaskListResponse` (Plan 04-03) can JOIN against decisions to surface "task is awaiting decision X" without changing this router. No coordination needed — the column is queryable today.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test bug] HITL-06 idempotency string-equality assertion**

- **Found during:** Task 2 verification (first GREEN run failed 1/15 tests)
- **Issue:** Test compared `r2.json()["read_at"] == first_read_at` where `first_read_at` came from the first response's JSON (serialized from an in-memory tz-aware datetime, including `Z`/`+00:00`). The second response serialized from a SQLite-round-tripped naive datetime (no tzinfo, no `Z`). Strings differed even though instants matched.
- **Fix:** Replaced the JSON-side string compare with a DB-side compare across two `SELECT`s (the invariant under test is "no second DB write" — DB row identity is the right surface).
- **Files modified:** `backend/tests/test_phase4_hitl.py` (test_hitl06_mark_read body)
- **Commit:** Folded into the GREEN commit `c2ba3a0` (test fix landed alongside router implementation).

This is a Pitfall 4 cousin: SQLite strips tzinfo on round-trip. The router behavior was correct from the first GREEN attempt; only the test assertion was wrong. The router itself was unchanged between the failing and passing runs.

## TDD Gate Compliance

Plan type: tdd. Both gates landed in order:

| Gate     | Commit  | Message                                               |
| -------- | ------- | ----------------------------------------------------- |
| RED      | 6668c61 | `test(04-02): add failing tests for HITL-01..07 (RED)`|
| GREEN    | c2ba3a0 | `feat(04-02): implement HITL-01..07 router (GREEN)`   |
| REFACTOR | (none)  | None needed — no duplication or dead code in GREEN    |

`git log --oneline backend/cmc/api/routes/hitl.py backend/tests/test_phase4_hitl.py` confirms the order.

## Self-Check: PASSED

All artifacts verified present:
- `backend/cmc/api/routes/hitl.py` FOUND (7 endpoints + module docstring describing file-then-DB invariant; 280 lines)
- `backend/cmc/api/routes/__init__.py` modified — `hitl_router` import on line 20, registration on line 40 (FOUND via `grep -n hitl_router`)
- `backend/tests/test_phase4_hitl.py` FOUND (17 HITL tests + 1 Wave-0 smoke)

Both task commits verified in `git log`:
- `6668c61` (Task 1 RED) FOUND
- `c2ba3a0` (Task 2 GREEN) FOUND

151/151 tests passing; 0 failures. `grep -n "hitl_router" backend/cmc/api/routes/__init__.py` finds both the import and the registration entry.
