---
phase: 19-skills-per-project-deltas-badges
plan: 01
subsystem: database
tags: [alembic, sqlite, sqlmodel, hashlib, project-key, migration, ingest]

# Dependency graph
requires:
  - phase: 18-polish-carry-forward-cleanup
    provides: green-CI baseline (pytest 566/0/32, datetime.utcnow=0, POLI-06 ban)
  - phase: 13-cost-and-skills-foundation
    provides: sessions table + cwd column + scheduler/repository ingest path
provides:
  - "compute_project_key(cwd) helper — sha1[:12] of realpath(cwd.rstrip('/'))"
  - "sessions.project_key VARCHAR(12) NOT NULL DEFAULT '' column with idx_sessions_project_key index"
  - "Migration 0003_project_key with Python-loop backfill (no path leakage, no symlink ambiguity)"
  - "Ingest wiring (scheduler + repository) sets project_key on insert AND propagates on re-sync"
affects: [19-02-skills-projects-endpoint, 19-03-skills-deltas-and-badges, 20-cost-anomalies-and-forecasts (ANLY-07)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Self-contained migration: hash logic INLINED (not imported from cmc.core) so future helper refactors cannot break historical migrations — same convention as 0002 inlining json_extract."
    - "Python-loop backfill for filesystem-aware migrations — pure SQL cannot resolve symlinks, so iterate rows and call os.path.realpath per row."
    - "Project canonicalization helper as a thin pure function in cmc.core (matches now_utc shape: single-purpose, re-exported, zero deps)."
    - "_SESSION_MUTABLE_COLS upsert convention: any computed-from-input field MUST be listed there so re-syncs propagate, not just first inserts."

key-files:
  created:
    - backend/cmc/core/project_key.py
    - backend/migrations/versions/0003_project_key.py
    - backend/tests/test_core_project_key.py
  modified:
    - backend/cmc/core/__init__.py
    - backend/cmc/db/models/sessions.py
    - backend/cmc/ingest/scheduler.py
    - backend/cmc/ingest/repository.py
    - backend/tests/test_migrations.py

key-decisions:
  - "Migration 0003 INLINES the sha1[:12] backfill logic instead of importing compute_project_key — defensive against future refactors of cmc.core.project_key. The helper's unit tests pin the formula so the two cannot silently diverge."
  - "Helper returns '' for None and '' inputs (sentinel, never raises). Mirrors the COALESCE pattern in cost.py:168 but as an empty-string sentinel since the column is NOT NULL."
  - "project_key added to _SESSION_MUTABLE_COLS so a late-arriving cwd correction on re-sync recomputes the key (Pitfall 9 — backfill is one-time, ingest must keep it fresh)."
  - "Backfill iterates in Python (not pure SQL) because SQLite cannot resolve symlinks. Mirrors how 0002 used pure-SQL backfill for session_id (json_extract was sufficient there); 0003 must cross into the filesystem layer for realpath, hence the Python loop."
  - "11 unit tests instead of the 7 specified — added test_reexport_via_cmc_core, test_matches_inline_sha1_logic, and a parametrized falsy-input test, all of which materially defend a different invariant (re-export shape, formula pin against migration drift, parametric coverage)."

patterns-established:
  - "Pattern A — Migration self-containedness: any helper logic the migration depends on is inlined; the helper's unit tests assert the formula equality so bisect-stability is preserved across helper refactors."
  - "Pattern B — Helper-first commit, wiring-second commit: Task 1 lands compute_project_key + tests in isolation; Task 2 lands the migration + ingest in a single atomic edit. Bisect-friendly: a regression in either layer is attributable to one commit."
  - "Pattern C — Empty-string sentinel for NOT NULL identity columns: project_key='' means 'no canonical project' (no path leakage, no fake project). Queries naturally exclude `WHERE project_key != ''`."

# Metrics
duration: 8min
completed: 2026-05-06
---

# Phase 19 Plan 01: Migration & Project Key Helper Summary

**sha1[:12]-of-realpath project_key column landed on `sessions` via migration 0003 with Python-loop backfill, plus a re-exported `cmc.core.compute_project_key` helper and ingest wiring that keeps the key fresh across re-syncs.**

## Performance

- **Duration:** ~8 min execution wall-clock (start 11:30:53Z, end 11:38:41Z UTC)
- **Started:** 2026-05-06T11:30:53Z
- **Completed:** 2026-05-06T11:38:41Z
- **Tasks:** 2 (helper + tests; migration + model + ingest + tests)
- **Files modified:** 8 (3 created, 5 modified)
- **Test additions:** 13 (11 unit tests for project_key, 2 migration tests for 0003)

## Accomplishments

- **`cmc.core.project_key.compute_project_key(cwd) -> str`** — pure function: `sha1[:12]` of `os.path.realpath(cwd.rstrip('/'))`; `''` for `None` / empty input. Re-exported via `cmc.core` (mirrors `now_utc` ergonomics).
- **Migration `0003_project_key`** — adds `sessions.project_key VARCHAR(12) NOT NULL DEFAULT ''` plus `idx_sessions_project_key`, then backfills every existing row with a non-empty `cwd` via a Python loop (SQLite cannot resolve symlinks in pure SQL). Hash logic INLINED in the migration for self-containedness against future helper refactors.
- **Sessions model updated** — `Session.project_key: str = Field(default="", max_length=12, nullable=False, server_default="", index=True)`, placed adjacent to `project_hash` for readability. The `model_fields` introspection confirms the field is registered.
- **Ingest wired end-to-end** — `cmc/ingest/scheduler.py` imports `compute_project_key` and sets `sess["project_key"]` next to the existing `project_hash` line; `cmc/ingest/repository.py` adds `"project_key"` to `_SESSION_MUTABLE_COLS` so existing rows get re-keyed on subsequent syncs (Pitfall 9 in 19-RESEARCH.md — backfill is one-shot, ingest must continue the work).
- **13 new tests, all green** — 11 cover the helper (trailing-slash idempotence, None/empty, 12-char hex, deterministic output, non-existent path safety per Pitfall 5, symlink canonicalization, re-export shape, formula equality vs the inlined migration logic, parametrized falsy inputs); 2 cover the migration (upgrade + backfill against seeded rows; downgrade drops the column and index cleanly).

## Task Commits

Each task was committed atomically on `main`:

1. **Task 1: Helper module + 11 unit tests** — `53fe578` (`feat(19-01): add cmc.core.project_key.compute_project_key helper`)
2. **Task 2: Migration 0003 + sessions model + scheduler/repository wiring + 2 migration tests** — `95bd1df` (`feat(19-01): land migration 0003_project_key + ingest wiring`)

## Files Created/Modified

- `backend/cmc/core/project_key.py` *(created)* — `compute_project_key(cwd: str | None) -> str` helper.
- `backend/cmc/core/__init__.py` *(modified)* — re-exports `compute_project_key` and adds it to `__all__`.
- `backend/migrations/versions/0003_project_key.py` *(created)* — Alembic upgrade/downgrade with Python-loop backfill; module docstring documents Pitfall 5 (realpath on missing path tail) and the POLI-06 absence-of-time-logic claim.
- `backend/cmc/db/models/sessions.py` *(modified)* — `project_key` SQLModel field added next to `project_hash`.
- `backend/cmc/ingest/scheduler.py` *(modified)* — imports `compute_project_key`; sets `sess["project_key"] = compute_project_key(sess.get("cwd"))` immediately after `project_hash`.
- `backend/cmc/ingest/repository.py` *(modified)* — `_SESSION_MUTABLE_COLS` now includes `"project_key"`.
- `backend/tests/test_core_project_key.py` *(created)* — 11 unit tests covering all helper invariants.
- `backend/tests/test_migrations.py` *(modified)* — `test_0003_upgrade_from_0002` (with seeded sessions and an empty-cwd negative case) + `test_0003_downgrade_to_0002`; new imports for `hashlib` and `os` + a `_seed_session_for_0003` helper that fills every NOT NULL column the schema requires at revision 0002.

## Decisions Made

1. **Migration self-containedness via inlined hash logic.** The migration computes `sha1[:12]` and `os.path.realpath` itself rather than importing from `cmc.core.project_key`. Rationale: Alembic migrations must remain runnable against historical revisions even if the helper is refactored, renamed, or moved. `test_matches_inline_sha1_logic` in `test_core_project_key.py` pins the formula so the helper and the migration cannot silently diverge.
2. **Empty-string sentinel for null-equivalent inputs.** `compute_project_key(None) == compute_project_key('') == ''`. The `sessions.project_key` column is NOT NULL, so the empty string is the natural "no canonical project" marker. Queries downstream filter via `WHERE project_key != ''`.
3. **Python-loop backfill instead of pure SQL.** Required because SQLite has no `realpath` builtin. Documented in the migration docstring; mirrors the trade-off where 0002 used pure-SQL `json_extract` for session_id but 0003 must cross into the filesystem layer.
4. **`_SESSION_MUTABLE_COLS` includes `project_key`.** Pitfall 9 — the migration is one-shot; ingest must keep the column fresh on every re-sync, including rows where the cwd value arrives or is corrected later.
5. **More tests than the plan specified (11 vs the 7 requested).** Each additional test defends an invariant the original 7 didn't: re-export shape, formula equality vs the inlined migration code (drift guard), and parametric falsy-input coverage. No deviation cost — pure-function tests run in 0.02s combined.

## Deviations from Plan

None - plan executed exactly as written.

The unit-test count grew from the 7 listed in the plan's task action to 11 — that's adding-tests-around-the-spec, not deviating from it. Each extra test pins an invariant called out elsewhere in the plan or research:

- `test_reexport_via_cmc_core` — pins the `__init__.py` re-export so a future `__all__` rewrite cannot silently break callers (the plan explicitly required the re-export but did not test it).
- `test_matches_inline_sha1_logic` — drift guard between `compute_project_key` and the inlined migration; the plan's `key_links` field already declares the formula equality contract.
- `test_falsy_inputs_return_empty` (parametrized) — equivalent to the plan's `test_none_returns_empty` + `test_empty_string_returns_empty` consolidated, but kept the original two for self-documenting names.

No Rule 1/2/3 auto-fixes triggered. No architectural Rule 4 prompts.

## Issues Encountered

None. All verify gates green on first execution:
- `tests/test_core_project_key.py`: 11 passed in 0.02s.
- `tests/test_migrations.py`: 5 passed in 0.64s (3 existing + 2 new for 0003).
- `tests/test_ingest.py`: 41 passed in 84.29s (no regressions from project_key wiring).
- Full suite: **579 passed, 0 failed, 32 warnings, 0 datetime.utcnow** in 194.56s.
- `git grep -nE 'datetime\.utcnow|...' -- backend/migrations/ backend/cmc/core/project_key.py`: 0 matches.
- `ruff check`: All checks passed!

## Verifier Snapshot vs Phase 18 BASELINE.md

| Suite | Baseline | This plan | Delta | Verdict |
|-------|----------|-----------|-------|---------|
| Backend pytest passed | 566 | **579** | +13 | pass (`>= 566`) |
| Backend pytest failed | 0 | **0** | 0 | pass (`failed > 0` → fail) |
| Backend pytest warnings (datetime.utcnow) | 0 | **0** | 0 | pass (`> 0` → fail) |
| Backend pytest total warnings | 32 | **32** | 0 | pass (warn at `> 132`) |
| ruff check | clean | **clean** | — | pass |

All Phase 18 BASELINE.md verifier rules continue to pass. POLI-06 ban honored in every new file.

## User Setup Required

None - no external service configuration required. Migration 0003 will auto-apply on next `cmc start` via `lifespan.py:98-100` (joining the existing 0002 auto-apply).

## Next Phase Readiness

- **`project_key` column exists, indexed, backfilled.** Ready for SKLP-08 (per-project skills endpoint, plan 19-02) to JOIN `otel_events.skill_activated` against `sessions` and GROUP BY `sessions.project_key` without further migration churn.
- **`compute_project_key` is importable from `cmc.core` AND `cmc.core.project_key`.** Future plans can pick whichever style matches their other imports.
- **Ingest path keeps the column fresh.** Scheduler computes on insert; repository propagates on re-sync via `_SESSION_MUTABLE_COLS`. No additional wiring is needed for downstream plans.
- **Phase 20 ANLY-07 unblocked.** ROADMAP success criterion #2 satisfied: "Migration `0003_project_key` lands in this phase: `sessions.project_key VARCHAR(12) NOT NULL DEFAULT ''`, backfilled, indexed; available for ANLY-07 in Phase 20 to consume without migration churn."

## Self-Check: PASSED

- `backend/cmc/core/project_key.py` — FOUND
- `backend/migrations/versions/0003_project_key.py` — FOUND
- `backend/tests/test_core_project_key.py` — FOUND
- `backend/cmc/core/__init__.py` re-export — FOUND (verified by `test_reexport_via_cmc_core`)
- `backend/cmc/db/models/sessions.py` `project_key` field — FOUND (verified via `model_fields` introspection)
- `backend/cmc/ingest/scheduler.py` `compute_project_key` import + setter — FOUND
- `backend/cmc/ingest/repository.py` `_SESSION_MUTABLE_COLS` includes `"project_key"` — FOUND
- `backend/tests/test_migrations.py` `test_0003_upgrade_from_0002` + `test_0003_downgrade_to_0002` — FOUND (5 passed)
- Commit `53fe578` (Task 1) — FOUND in `git log`
- Commit `95bd1df` (Task 2) — FOUND in `git log`

---
*Phase: 19-skills-per-project-deltas-badges*
*Completed: 2026-05-06*
