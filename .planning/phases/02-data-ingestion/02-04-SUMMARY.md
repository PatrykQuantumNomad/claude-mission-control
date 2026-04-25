---
phase: 02-data-ingestion
plan: 04
subsystem: ingestion
tags: [backend, ingestion, scheduler, repository, sqlalchemy, asyncio, upsert, phase-2]

requires:
  - phase: 02-data-ingestion
    provides: parse_session_file (Plan 02-02) — pure-sync entry contract called via asyncio.to_thread; emits session/tool_calls/token_usage_buckets dicts
  - phase: 02-data-ingestion
    provides: Settings.jsonl_root + session_idle_minutes (Plan 02-01)
  - phase: 01-foundation-database
    provides: SessionModel/ToolCall/TokenUsage SQLModel tables + lifespan-driven engine + sessionmaker
provides:
  - cmc.ingest.repository — idempotent upsert helpers for sessions/tools/token_usage
  - cmc.ingest.scheduler — sync_once coroutine + periodic_sync_loop for lifespan/manual sync
affects:
  - 02-05 (lifespan + manual /api/sync wiring)
  - 06 (observability panels) — relies on token_usage rollups not double-counting
  - phase-3+ (multi-day session token bucketing — current v1 has documented smear)

tech-stack:
  added:
    - sqlalchemy.dialects.sqlite.insert (ON CONFLICT DO UPDATE upsert pattern)
    - asyncio.to_thread (off-event-loop file parsing — research §5)
  patterns:
    - "Per-row ON CONFLICT DO UPDATE for SQLite upsert (research §4)"
    - "UPDATE-then-INSERT-fallback for column-arithmetic deltas (token_usage)"
    - "Option B subtract-then-add for re-parse rollup correctness"
    - "One AsyncSession per file: transaction boundary = file unit-of-work"
    - "Sleep-first while-True loop with bare `except Exception` and CancelledError re-raise (Pitfall 7)"

key-files:
  created:
    - backend/cmc/ingest/repository.py
    - backend/cmc/ingest/scheduler.py
  modified:
    - backend/tests/test_phase2_ingest.py (8 new tests; +503 lines net)

key-decisions:
  - "Option B Phase-2-v1 simplification: a session's previous-totals are attributed to a single primary (day, model) bucket — the latest sync date in system tz — when subtracting on re-parse. Multi-day sessions get small smear; documented for Phase 3+ revisit."
  - "Mutable session columns enumerated in repository._SESSION_MUTABLE_COLS (started_at intentionally omitted so first-insert started_at survives re-parses)."
  - "_adjust_bucket uses UPDATE-then-INSERT-fallback (rather than ON CONFLICT with arithmetic on excluded.* + existing column) for portability + readability; ON CONFLICT safety net included for theoretical concurrent-insert race."
  - "Test pattern: pending→ok transition test uses fresh AsyncSession per assertion phase to bypass expire_on_commit=False identity-map cache. Scheduler mirrors this naturally (one session per file)."

patterns-established:
  - "ON CONFLICT DO UPDATE upsert with mutable-cols allowlist driven from `excluded.*`"
  - "Option B token-usage math (subtract previous, add new) on re-parse"
  - "sleep-first periodic loop with CancelledError-aware exception handling"
  - "asyncio.to_thread wrapping for sync CPU/IO functions called from async code"

duration: 6 min
completed: 2026-04-25
---

# Phase 02 Plan 04: Scheduler + Repository Summary

**Idempotent SQLAlchemy upsert layer (sessions/tools/token_usage) plus a sleep-first asyncio sync loop with Option B token-rollup math — Phase 2's persistence heart, ready for Plan 02-05 lifespan wiring.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-25T18:56:05Z
- **Completed:** 2026-04-25T19:02:23Z
- **Tasks:** 2 (each TDD: RED + GREEN commits)
- **Files modified:** 3 (2 created, 1 extended)
- **Tests added:** 13 (5 repository + 8 scheduler)
- **Total Phase 2 test count:** 30 (was 17 after Plan 02-03)
- **Total project test count:** 55

## Accomplishments

- `cmc.ingest.repository` lands the four documented upsert helpers (`upsert_session`, `upsert_tools`, `accumulate_token_usage`, `get_existing_session_for_path`), all idempotent and DO-NOT-commit (caller controls transactions).
- `cmc.ingest.scheduler` lands `sync_once` (one-shot ingestion cycle) + `periodic_sync_loop` (sleep-first while True with cancellation hygiene), ready for Plan 02-05 to import directly.
- INGST-04 idempotence proven by 5 repository tests: identical re-runs produce identical row state, pending→ok transitions update the same row (no duplicate), session totals update in place.
- INGST-05 Option B proven by `test_accumulate_token_usage_option_b_no_double_count`: re-parse with corrected totals (10→15) yields a bucket of 15, not 25.
- INGST-05 local-day bucketing proven by `test_sync_once_local_day_bucket_uses_system_tz`: 04:00 UTC buckets to the previous day in `America/Los_Angeles` via `monkeypatch.setenv("TZ", ...) + time.tzset()`.
- Glob safety verified by `test_sync_once_excludes_subagents`: a decoy at `<hash>/subagents/agent-1.jsonl` is NOT ingested (one-level glob).
- Loop hygiene verified by two periodic-loop tests: ≥3 cycles in 0.18s with `interval_s=0.05`, and a transient `RuntimeError` on cycle 2 does not kill the loop.

## Task Commits

1. **Task 1 RED — repository tests** — `baf3624` (test)
2. **Task 1 GREEN — repository implementation** — `eca22ba` (feat)
3. **Task 2 RED — scheduler tests** — `0ef404f` (test)
4. **Task 2 GREEN — scheduler implementation** — `763c10b` (feat)

## Files Created/Modified

- `backend/cmc/ingest/repository.py` (NEW, 232 lines) — Public API: `upsert_session`, `upsert_tools`, `accumulate_token_usage`, `get_existing_session_for_path`. Internal: `_adjust_bucket`, `_SESSION_MUTABLE_COLS`.
- `backend/cmc/ingest/scheduler.py` (NEW, 177 lines) — Public API: `sync_once(sessionmaker, settings) -> dict`, `periodic_sync_loop(sessionmaker, settings, interval_s=120)`. Internal: `_sync_one_file`.
- `backend/tests/test_phase2_ingest.py` (EXTENDED, +503 lines) — 13 new tests under two markers (`# ---- Plan 02-04: repository ...` and `# ---- Plan 02-04: scheduler ...`).

## Public API Reference (Plan 02-05 entry contract)

```python
from cmc.ingest.repository import (
    upsert_session,                    # async; **fields kwargs match SessionModel cols
    upsert_tools,                      # async; (db, session_id, list[dict])
    accumulate_token_usage,            # async; Option B subtract-then-add
    get_existing_session_for_path,     # async; jsonl_path -> SessionModel | None
)
from cmc.ingest.scheduler import (
    sync_once,                         # async; (sessionmaker, settings) -> summary dict
    periodic_sync_loop,                # async; (sessionmaker, settings, interval_s=120)
)
```

`sync_once` is what lifespan startup AND `POST /api/sync` will call.
`periodic_sync_loop` is what `asyncio.create_task(...)` will schedule in lifespan.
Both functions tolerate (a) missing `jsonl_root` directory, (b) corrupted JSONL lines, (c) per-file errors (logged + counted, loop continues).

## Decisions Made

- **Option B Phase 2 v1 simplification (locked):** A session's previous-totals are attributed to a single primary `(day, model, source='claude-code')` bucket on re-parse — specifically the bucket keyed by `existing.synced_at.date()` in system tz. This is correct for the >>99% of single-day sessions and produces small smear on multi-day sessions. Documented as a Phase 3+ revisit candidate (see `cmc.ingest.repository` module docstring).
- **Mutable session columns are an explicit allowlist** in `_SESSION_MUTABLE_COLS`. `started_at` is intentionally omitted so the first-insert `started_at` survives re-parses (immutable lower bound on session lifetime).
- **`_adjust_bucket` uses UPDATE-then-INSERT-fallback** for column-arithmetic deltas. ON CONFLICT with `col = col + excluded.col` is awkward to express portably for multi-column deltas; the chosen pattern keeps the SQL readable. ON CONFLICT safety net is included on the INSERT for theoretical concurrent-insert races (single-writer Phase 2 design means this branch is dead-code insurance).
- **Test pattern: fresh AsyncSession per assertion phase** in the pending→ok transition test. With `expire_on_commit=False` on the session factory, the identity-map cache returns stale ORM instances after a commit. Opening a fresh session (mirroring how the scheduler actually works — one session per file) gives accurate visibility. Documented inline in the test docstring.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test used a single AsyncSession across pending→ok transition, returning stale identity-map cached row**
- **Found during:** Task 1 (Repository GREEN — `test_upsert_tools_pending_to_ok_transition`)
- **Issue:** With `make_sessionmaker(engine, expire_on_commit=False)`, the same AsyncSession's identity map returned the originally-loaded `pending` ORM instance even after a successful upsert that wrote `status='ok'` to the DB. Verified via raw SQL — DB had `'ok'`; ORM query returned `'pending'`.
- **Fix:** Restructured the test to open a fresh `app.state.sessions()` AsyncSession for each assertion phase (insert → verify pending → upsert → verify ok). This mirrors how the scheduler actually consumes the sessionmaker (one session per file unit-of-work) so the test's invariants align with production usage.
- **Files modified:** `backend/tests/test_phase2_ingest.py` (`test_upsert_tools_pending_to_ok_transition`)
- **Verification:** Test now passes; behavior re-confirmed end-to-end via `test_sync_once_ingests_golden_session` which observes `{'ok', 'pending'}` statuses across paired and unpaired tools.
- **Committed in:** `eca22ba` (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug in test scaffold).
**Impact on plan:** Test-only fix; production code path was correct as written. No scope creep.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Known Limitations (for Phase 3+ revisit)

- **Multi-day session token bucketing:** A session whose assistant messages span midnight (in system tz) has its tokens attributed to a single primary bucket on re-parse. The parser still emits per-day buckets correctly on the first parse; the smear only appears on RE-parse cycles. For Phase 2 v1 this is acceptable because (a) most CC sessions complete within one local day, (b) re-parse cycles are 120s apart so the visible drift is bounded, (c) the scheduler still re-attributes the latest totals to the latest day (the most useful behavior for live dashboards).
- **`primary_day` approximation uses `synced_at.date()` in system tz**, not the actual last-message-day from the previous parse. For sessions where `synced_at` was on a different day from the last assistant message, the subtract step targets the wrong bucket. This compounds the multi-day smear above. Phase 3+ option: store `last_day` on the sessions row to make the subtract step exact.

## Next Phase Readiness

Plan 02-05 (lifespan + manual /api/sync) is fully unblocked:

- `from cmc.ingest.scheduler import sync_once, periodic_sync_loop` — both importable, both ready to wire into `cmc/app/lifespan.py` (boot-time `await sync_once(...)`, then `asyncio.create_task(periodic_sync_loop(...))`).
- `sync_once` returns a JSON-serializable summary dict suitable as the `POST /api/sync` response body.
- Both functions tolerate (a) missing `jsonl_root` directory, (b) corrupted JSONL lines, (c) DB write failures.
- `periodic_sync_loop` honours `asyncio.CancelledError` for clean lifespan shutdown.

Phase 2 progress: 4/6 plans complete. Remaining: 02-05 (lifespan/manual sync), 02-06.

---
*Phase: 02-data-ingestion*
*Completed: 2026-04-25*

## Self-Check: PASSED

- backend/cmc/ingest/repository.py — exists
- backend/cmc/ingest/scheduler.py — exists
- backend/tests/test_phase2_ingest.py — exists (extended)
- .planning/phases/02-data-ingestion/02-04-SUMMARY.md — exists
- Task commits verified in `git log`: baf3624, eca22ba, 0ef404f, 763c10b
- 30/30 Phase 2 tests pass; 55/55 total project tests pass
- Imports verified: `from cmc.ingest.repository import upsert_session, upsert_tools, accumulate_token_usage, get_existing_session_for_path` and `from cmc.ingest.scheduler import sync_once, periodic_sync_loop` both succeed.
