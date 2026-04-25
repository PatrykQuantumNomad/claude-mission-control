---
phase: 01-foundation-database
plan: 01
subsystem: database
tags: [sqlalchemy, sqlmodel, alembic, sqlite, schema, documentation]

# Dependency graph
requires:
  - phase: 01-foundation-database
    provides: Phase context (CONTEXT.md) and research (RESEARCH.md) that locked SQLAlchemy 2.0 + SQLModel + Alembic as the data-access stack
provides:
  - Reconciled REQUIREMENTS.md (no longer marks ORM as out-of-scope; clarifies FOUND-02/03 wording as intent rather than implementation)
  - Reconciled PROJECT.md (4 locations updated to describe SQLAlchemy 2.0 async + SQLModel + Alembic instead of "raw SQL, no ORM")
  - Canonical 15-table schema reference (.planning/phases/01-foundation-database/01-01-SCHEMA.md) approved as the source of truth for Plan 05's Alembic initial revision
affects: [Plan 01-02 (project skeleton), Plan 01-03 (DB engine), Plan 01-04 (SQLModel classes), Plan 01-05 (Alembic initial revision), all of Phase 2-9 (every phase reads/writes these tables)]

# Tech tracking
tech-stack:
  added: []  # documentation-only plan; no code added
  patterns:
    - "Schema-first locking: phase-level schema reference (01-01-SCHEMA.md) is approved before any model code is written, so Plan 05's Alembic autogenerate has a deterministic target"
    - "Visible-TODO flagging: deferred schema decisions tagged inline as [NEEDS USER CONFIRMATION] in the schema doc rather than blocking the plan, so downstream plans inherit the open questions explicitly"

key-files:
  created:
    - .planning/phases/01-foundation-database/01-01-SCHEMA.md
    - .planning/phases/01-foundation-database/01-01-SUMMARY.md
  modified:
    - .planning/REQUIREMENTS.md
    - .planning/PROJECT.md
    - .planning/STATE.md

key-decisions:
  - "Stack reconciliation: SQLAlchemy 2.0 async + SQLModel + Alembic supersedes the earlier 'raw SQL, no ORM' direction in REQUIREMENTS.md and PROJECT.md (Phase 1 discussion result, dated 2026-04-25 in PROJECT.md Key Decisions table)"
  - "FOUND-02/03 wording (CREATE TABLE IF NOT EXISTS, _migrate_add_column) is INTENT, not implementation — Alembic provides the same idempotent / data-safe schema evolution semantics"
  - "15-table list (sessions, token_usage, tools, otel_events, otel_metrics, tasks, schedules, decisions, inbox, activities, live_state, mcp_stats, skills, system_state, notification_log) approved as-is on 2026-04-25 with 10 deferred questions accepted as visible TODOs for downstream plans"

patterns-established:
  - "Pattern 1: Documentation reconciliation before code — when locked decisions contradict pre-existing project docs, fix the docs in a dedicated plan first so all downstream plans inherit the corrected source of truth"
  - "Pattern 2: Schema-as-spec — the canonical schema lives as a reviewable markdown file before any SQLModel/Alembic code, so the user has one place to push back on table/column choices"

# Metrics
duration: ~30min
completed: 2026-04-25
---

# Phase 01 Plan 01: Documentation Reconciliation + 15-Table Schema Lock Summary

**Reconciled REQUIREMENTS.md and PROJECT.md with the locked SQLAlchemy 2.0 + SQLModel + Alembic stack, then drafted and locked a canonical 15-table schema reference (01-01-SCHEMA.md) as the source of truth for Plan 05's Alembic initial revision.**

## Performance

- **Duration:** ~30 min (across two agent sessions: Tasks 1-3 + Task 4 resolution)
- **Started:** 2026-04-25 (Tasks 1-3 in initial session)
- **Completed:** 2026-04-25 (Task 4 checkpoint resolved with `approve-as-is`)
- **Tasks:** 4 / 4
- **Files modified:** 3 (REQUIREMENTS.md, PROJECT.md, STATE.md)
- **Files created:** 1 (01-01-SCHEMA.md; SUMMARY.md created post-completion)

## Accomplishments

- Removed the contradiction between CONTEXT.md (locks SQLAlchemy ORM) and the pre-existing REQUIREMENTS.md / PROJECT.md (said "raw SQL, no ORM"). All three docs now agree.
- Produced a column-level 15-table schema with FK relationships, index hints, and per-table requirement-ID traceability — covering every database-touching requirement across Phases 2-9.
- Captured 10 genuinely-ambiguous schema questions inline as `[NEEDS USER CONFIRMATION]` flags so they are visible to (but do not block) downstream plans.
- Got explicit user approval (option: `approve-as-is`) so Plan 05 has an unambiguous, locked target for the Alembic initial revision.

## Task Commits

Each task was committed atomically:

1. **Task 1: Reconcile REQUIREMENTS.md** — `931b8d7` (docs)
2. **Task 2: Reconcile PROJECT.md (4 locations)** — `a01aa6e` (docs)
3. **Task 3: Draft 15-table schema** — `1d3e13e` (docs)
4. **Task 4: Checkpoint resolution — schema approved as-is** — `f426959` (docs)

**Plan metadata:** Will be `<final-commit-hash>` once SUMMARY.md + STATE.md are committed (see Final Commit section).

(Auxiliary STATE.md update for in-progress tracking: `8b9d8fc` — committed between Tasks 3 and 4.)

## Files Created/Modified

### Created

- `.planning/phases/01-foundation-database/01-01-SCHEMA.md` — Canonical 15-table schema with column-level intent. Covers all 15 tables (sessions, token_usage, tools, otel_events, otel_metrics, tasks, schedules, decisions, inbox, activities, live_state, mcp_stats, skills, system_state, notification_log) with: purpose + requirement-ID traceability, columns + types + null/default, indexes (including partial UNIQUE on decisions for HITL-02 and on notification_log for TELE-04), FKs with ondelete semantics, and a per-phase coverage matrix.
- `.planning/phases/01-foundation-database/01-01-SUMMARY.md` — This file.

### Modified

- `.planning/REQUIREMENTS.md`
  - **Out-of-Scope row deleted (was at line 254 in original):** `| ORM (SQLAlchemy models) | Raw SQL specified — simpler for read-heavy dashboard with known schema |` — removed entirely (commit `931b8d7`).
  - **Note added (now at line 242, immediately above the Out-of-Scope table):** italicized clarification that Phase 1 locked SQLAlchemy 2.0 async + SQLModel + Alembic and that the FOUND-02/03 wording is INTENT, not implementation.
  - FOUND-02 / FOUND-03 requirement text itself was left unchanged per Task 1's instructions.

- `.planning/PROJECT.md` (4 locations reconciled in commit `a01aa6e`):
  1. **Line ~78-79 (Context, "FastAPI chassis foundation" paragraph):** parenthetical changed from `(raw SQL instead of SQLAlchemy ORM, ...)` to `(SQLAlchemy 2.0 async + SQLModel instead of the chassis's plain stack, SQLite-only, no auth layer)`.
  2. **Line ~84 (Context, "Database uses ..." paragraph):** entire paragraph rewritten from `**Database uses raw SQL:** No ORM. All queries are raw SQL via Python's sqlite3 or aiosqlite ...` to a description of `**Database uses SQLAlchemy 2.0 async + SQLModel:**`, including how Alembic provides the same idempotent / data-safe `_migrate_add_column` semantics that FOUND-03 specifies.
  3. **Line ~96 (Constraints, ORM bullet):** `- **No ORM**: Raw SQL everywhere, aiosqlite for async access` replaced with `- **ORM**: SQLAlchemy 2.0 async + SQLModel; raw SQL only when stepping outside the ORM is unavoidable ...`.
  4. **Line ~106 (Key Decisions table):** the row `| Raw SQL instead of SQLAlchemy ORM | ... | -- Pending |` replaced with `| SQLAlchemy 2.0 async + SQLModel + Alembic | Locked in Phase 1 discussion — supersedes earlier "raw SQL" direction. ... | 2026-04-25 |`.

- `.planning/STATE.md` — updated mid-plan (commit `8b9d8fc`) to record "in progress, awaiting Task 4 checkpoint"; will be updated again on plan completion (see Final Commit) to mark Plan 01-01 complete and Wave 1 ready.

## Final Approved Table List

The following 15 tables are now locked as Phase 1's schema (each table is documented in detail in `.planning/phases/01-foundation-database/01-01-SCHEMA.md`):

| #  | Table              | Primary purpose                                                                  |
|----|--------------------|----------------------------------------------------------------------------------|
| 1  | `sessions`         | One row per Claude Code session (upserted by INGST-04); root table for SESS-* / OBSV-* APIs |
| 2  | `token_usage`      | Daily rollups (day, model, source) for OBSV-01 / OPNL-05                         |
| 3  | `tools`            | Paired tool_use/tool_result rows (INGST-03); drives OBSV-04 / OBSV-08 / MCP-02   |
| 4  | `otel_events`      | Append-only OTEL `/v1/logs` event log; drives SAPI-05 firehose, OBSV-05/08/10    |
| 5  | `otel_metrics`     | Append-only OTEL `/v1/metrics` points; drives OBSV-09 productivity counters      |
| 6  | `tasks`            | Mission Control task queue (TASK-* / DISP-* / ESTOP-*)                           |
| 7  | `schedules`        | Cron-driven recurring task templates (SCHD-*)                                    |
| 8  | `decisions`        | HITL decision queue with partial-UNIQUE dedup (HITL-02)                          |
| 9  | `inbox`            | Agent-to-user message inbox (HITL-04..07)                                        |
| 10 | `activities`       | Daily aggregate counters for the heatmap (ACTV-01); see Q3 below                 |
| 11 | `live_state`       | Per-session live state for sessions active <5min (SESS-03/04/05)                 |
| 12 | `mcp_stats`        | Per-server / per-tool MCP aggregates rebuilt by MCP-03                           |
| 13 | `skills`           | Local skill registry (SKIL-01..03 / DISP-04/10/11)                               |
| 14 | `system_state`     | Generic KV store (emergency_stop, last sync stamps, tzname, daemon health)       |
| 15 | `notification_log` | Telegram notification dedup ledger (TELE-04 UNIQUE constraint)                   |

All 15 are referenced by at least one downstream phase (see Coverage Summary table at the end of `01-01-SCHEMA.md`); no table is orphaned.

## Deferred Schema Questions (10 `[NEEDS USER CONFIRMATION]` flags)

The user explicitly accepted these flags as-is on 2026-04-25 and chose to resolve them downstream (in subsequent plans, or via future Alembic migrations as the production-dashboard reality clarifies each one). They are NOT blockers for Plan 05's initial Alembic revision; they are visible TODOs for whichever downstream plan first needs to disambiguate.

1. **`sessions.source` and `token_usage.source` enum values** — what discrete strings does the production dashboard use? (`cli`, `claude-code`, `telemetry`, anything else?)
2. **`tools.decision` column vs. separate `edit_decisions` table** — current draft folds tool_decision events onto the `tools` row; alternative is a small dedicated table that keeps the decision timestamp separate from the tool call.
3. **`activities` table — keep or drop** — if the production dashboard computes the heatmap on the fly from `otel_metrics` and `sessions`, this table is dead weight.
4. **`tasks.skill` and `schedules.skill` as FK** vs. free-text — FK gives integrity but breaks if a skill is renamed/deleted mid-flight.
5. **`tasks.quadrant` enum** — Eisenhower-matrix labels (do/plan/delegate/drop) or a different taxonomy used by the production dashboard?
6. **`live_state.state` enum** — what discrete states does the existing dashboard already use? (current draft: idle, thinking, tool_running, awaiting_decision, streaming).
7. **`skills.environment` enum** — confirm the discrete set ({personal, project, mcp} is a guess from CLAUDE.md ecosystem conventions).
8. **`system_state` shape** — keep both `value` (TEXT) and `value_json` (JSON) columns, or pick one?
9. **`schedules.name` UNIQUE** — should duplicate schedule names be allowed?
10. **OBSV-05 hooks data source** — current draft routes hook events through `otel_events` (`event_name="claude_code.hook"`). If the production dashboard has a dedicated `hooks` table, that would replace one of the 15 above.

These are tracked in-line in `01-01-SCHEMA.md` so any downstream plan that needs to resolve one can search for `[NEEDS USER CONFIRMATION]` and surface the question to the user before proceeding.

## Decisions Made

- **Reconcile rather than fork:** Edited the existing REQUIREMENTS.md and PROJECT.md in place (rather than annotating them with a "see CONTEXT.md instead" callout). Rationale: Phase 1 discussion was definitive; future plans should not have to read CONTEXT.md to know what stack is in scope.
- **Single canonical schema file (not split per-domain):** Kept all 15 tables in one `01-01-SCHEMA.md` rather than splitting into per-phase files. Rationale: cross-table FK relationships are easier to spot in one document, and Plan 05 reads exactly one source of truth.
- **Approve-as-is over approve-with-edits:** User accepted the 10 deferred questions as future-resolvable rather than spending another round on them now. Rationale: Alembic makes column-level corrections cheap; blocking on them would be over-investment.

## Deviations from Plan

None — plan executed exactly as written. The plan anticipated the checkpoint outcome (`approve-as-is` was option 1), all four tasks ran without auto-fixes, and verification commands matched expected results.

## Issues Encountered

None.

## User Setup Required

None — this plan is documentation-only; no external services or environment variables.

## Next Phase Readiness

**Ready for Wave 1 (Plans 01-02 + 01-03):**
- Plan 01-02 (project skeleton) can proceed; PROJECT.md and REQUIREMENTS.md now agree on the SQLAlchemy stack.
- Plan 01-03 (database engine) can proceed; the stack is locked.

**Ready for Wave 2 (Plan 01-04):**
- Plan 01-04 will translate `01-01-SCHEMA.md` into SQLModel classes; the schema file is the deterministic source of truth.

**Ready for Wave 3 (Plan 01-05):**
- Plan 01-05 (Alembic initial revision) has an unambiguous, user-approved target. `alembic revision --autogenerate` will be compared against `01-01-SCHEMA.md` as the spec.

No blockers. All 7 Phase-1 plans can now run their dependency-ordered execution.

## Self-Check: PASSED

Verified before final commit:

- [x] `.planning/phases/01-foundation-database/01-01-SCHEMA.md` exists and starts with `**Status:** APPROVED 2026-04-25`
- [x] Commit `931b8d7` exists (Task 1: REQUIREMENTS.md reconcile)
- [x] Commit `a01aa6e` exists (Task 2: PROJECT.md reconcile)
- [x] Commit `1d3e13e` exists (Task 3: schema draft)
- [x] Commit `f426959` exists (Task 4: schema approved-as-is, status header updated)
- [x] `grep "ORM (SQLAlchemy models)" .planning/REQUIREMENTS.md` returns 0 matches
- [x] `grep "raw SQL via" .planning/PROJECT.md` returns 0 matches
- [x] `grep "SQLAlchemy 2.0 async + SQLModel" .planning/PROJECT.md` returns >=1 match
- [x] `grep -c "^### " .planning/phases/01-foundation-database/01-01-SCHEMA.md` returns 15

---
*Phase: 01-foundation-database*
*Plan: 01*
*Completed: 2026-04-25*
