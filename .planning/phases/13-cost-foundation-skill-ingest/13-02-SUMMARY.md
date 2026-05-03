---
phase: 13-cost-foundation-skill-ingest
plan: 02
subsystem: database
tags: [alembic, sqlite, sqlmodel, migrations, otel, opentelemetry, json_each, alerts]

# Dependency graph
requires:
  - phase: 13-01
    provides: PricingRow SQLModel + cmc.pricing module + pricing.json seed (model file already registered in metadata; this plan ships the matching DDL)
  - phase: 01-foundation
    provides: Alembic env.py with render_as_batch + 0001_initial baseline (15 tables)
provides:
  - Single Alembic revision 0002_v1_1_alerts_and_skills landing every Phase 13 schema mutation atomically
  - otel_events.attrs_skill_name (indexed) + otel_events.otel_event_id + (session_id, otel_event_id) UNIQUE — INGST-11/13 dedup contract
  - sessions.tokens_cache_create_5m / _1h cache TTL split columns (legacy aggregate stays for back-compat)
  - token_usage.tokens_cache_create_5m / _1h daily-rollup parity columns
  - pricing table with all 5 *_per_mtok Numeric(10,4) cols + seed_hash for Plan 05 doctor drift check
  - alert_rules table — final ALRT-01 shape (Phase 15 ships ZERO migration)
  - alert_state table — final ALRT-02 hysteresis/dedup shape with UNIQUE(rule_id, scope_key)
  - BUG-A read-side fix at observability.py:_EDIT_DECISIONS_OTEL_SQL — json_each over body.record.attributes + bare event_name 'tool_decision'
  - BUG-B data backfill — re-extracts session.id from body.record.attributes for all NULL rows (~13,998 in production)
  - tests/test_migrations.py — 3 cases (upgrade from 0001, downgrade to 0001, BUG-B backfill semantics)
affects: [13-03, 13-04, 13-05, 13-06, 15-alert-engine]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single migration containing union of all schema + data fixes for a phase — INGST-12 contract"
    - "json_each() to walk OTLP attribute arrays (body.record.attributes is [{key, value}, ...])"
    - "Pessimistic backfill on cache TTL split — legacy aggregate -> _1h column; _5m starts at 0"
    - "Migration tests use alembic.command.upgrade/downgrade against ephemeral SQLite tmpfile with sqlite+aiosqlite:// URL (env.py runs async engine)"

key-files:
  created:
    - backend/cmc/db/models/alert_rules.py
    - backend/cmc/db/models/alert_state.py
    - backend/migrations/versions/0002_v1_1_alerts_and_skills.py
    - backend/tests/test_migrations.py
  modified:
    - backend/cmc/db/models/otel_events.py
    - backend/cmc/db/models/sessions.py
    - backend/cmc/db/models/token_usage.py
    - backend/cmc/db/models/__init__.py
    - backend/cmc/api/routes/observability.py
    - backend/tests/test_observability_router.py
    - backend/tests/test_foundation_boot.py

key-decisions:
  - "Single 0002 revision lands all 7 Phase 13 schema mutations + both v1.0 BUG fixes — Phase 15 alert engine ships zero migration work"
  - "BUG-B backfill is one-way (not reversed in downgrade) — pre-migration session_id was always NULL so populating it is a strict improvement and the column is nullable on 0001"
  - "Test alembic config uses sqlite+aiosqlite:// URL because env.py invokes async_engine_from_config; sqlite:// URL fails with InvalidRequestError"
  - "Existing test_obsv_08_edit_decisions_via_otel_events test was rewritten to seed OTLP-array body shape — the previous flat-shape test was masking the production bug (1,406 tool_decision rows returning NULL silently)"
  - "test_foundation_boot table-count assertions bumped from 15 to 18 — drift fix necessary because Plan 01 added pricing without updating the assertion"

patterns-established:
  - "OTLP attribute extraction: SELECT json_extract(value, '$.value.stringValue') FROM json_each(json_extract(body, '$.record.attributes')) WHERE json_extract(value, '$.key') = '<KEY>' LIMIT 1"
  - "event_name BARE-form filtering: event_name = 'tool_decision' (NOT 'claude_code.tool_decision') — ingest strips the prefix per SPIKE.md LOCK-1"

# Metrics
duration: 17m
completed: 2026-05-03
---

# Phase 13 Plan 02: Alerts + Skills Migration Summary

**Single Alembic 0002 revision atomically lands Phase 13's 7 schema mutations + BUG-A read-side fix + BUG-B data backfill (13,998 production rows recovered) — Phase 15's alert engine inherits ready-shaped alert_rules + alert_state tables and ships zero migration work.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-05-03T12:17:18Z
- **Completed:** 2026-05-03T12:34:19Z
- **Tasks:** 2 (both complete)
- **Files modified:** 11 (4 created, 7 modified)

## Accomplishments

- 0002 migration upgrades cleanly from 0001 on fresh DB AND on a copy of the production DB; downgrades cleanly back to 0001 (round-trip verified).
- BUG-B backfill recovered 13,998 of 14,000 production `otel_events.session_id` NULLs (the 2 remaining are the corrupt-attribute rows SPIKE.md called out — Q-13 finding).
- BUG-A read-side fix at `observability.py` replaces flat `json_extract` with `json_each` over `body.record.attributes` and flips event_name to bare form `'tool_decision'` (was `'claude_code.tool_decision'` — wrong post prefix-strip). Production has 2,525 `tool_decision` rows that are now correctly grouped by tool_name.
- Phase 15 alert engine schema already shipped: alert_rules has all 12 structural columns (rule_id, name, kind, metric, threshold_fire/clear, min_dwell_seconds, min_samples, cooldown_seconds, enabled, spec_version, params_json) + timestamps; alert_state has the 8 lifecycle columns + UNIQUE(rule_id, scope_key).
- pricing table mirrors `cmc.db.models.pricing.PricingRow` exactly — 5 `*_per_mtok` Numeric(10,4) columns plus the `seed_hash VARCHAR NOT NULL` column Plan 05's `_check_pricing_json_hash_drift` reads.
- 3 new migration tests (upgrade, downgrade, BUG-B backfill semantics) pass deterministically; full backend test suite passes 399/399 (2 skipped, 0 failed).

## Task Commits

Each task was committed atomically:

1. **Task 1: AlertRule + AlertState SQLModels and Phase-13 column adds** — `ed6ec56` (feat)
2. **Task 2: 0002 alembic migration + BUG-A/B fixes + tests** — `2f30a66` (feat)

## Files Created/Modified

**Created:**
- `backend/cmc/db/models/alert_rules.py` — AlertRule SQLModel (final ALRT-01 shape).
- `backend/cmc/db/models/alert_state.py` — AlertState SQLModel (ALRT-02 lifecycle).
- `backend/migrations/versions/0002_v1_1_alerts_and_skills.py` — Single revision implementing all of Phase 13's schema work + BUG-B backfill + cache-TTL split backfill.
- `backend/tests/test_migrations.py` — 3 cases: upgrade-from-0001, downgrade-to-0001, BUG-B SQL semantics.

**Modified:**
- `backend/cmc/db/models/otel_events.py` — added `attrs_skill_name`, `otel_event_id`, plus matching indexes including `(session_id, otel_event_id)` UNIQUE.
- `backend/cmc/db/models/sessions.py` — added `tokens_cache_create_5m` / `_1h` cache TTL split columns.
- `backend/cmc/db/models/token_usage.py` — same cache TTL split columns for daily rollup parity.
- `backend/cmc/db/models/__init__.py` — registered AlertRule + AlertState imports (alphabetic position).
- `backend/cmc/api/routes/observability.py` — BUG-A fix: `_EDIT_DECISIONS_OTEL_SQL` now uses `json_each` over OTLP-array attributes and filters on bare `event_name = 'tool_decision'`.
- `backend/tests/test_observability_router.py` — `test_obsv_08_edit_decisions_via_otel_events` rewritten to seed OTLP-array body shape (matches production).
- `backend/tests/test_foundation_boot.py` — table count assertions updated 15 -> 18 to match Plan 01's pricing + Plan 02's alert_rules + alert_state.

## Decisions Made

- **Single migration locked.** All 7 Phase 13 schema mutations landed in `0002_v1_1_alerts_and_skills` per the plan's INGST-12 contract. No follow-up migration files for any other plan in this phase or for Phase 15.
- **BUG-B backfill is forward-only.** The downgrade path does NOT re-NULL `session_id` because the pre-migration state was 100% NULL on the affected rows; preserving the populated value across downgrade is harmless (column is nullable on 0001) and avoids a destructive data action.
- **Pessimistic cache-TTL backfill applied.** `UPDATE sessions SET tokens_cache_create_1h = tokens_cache_create WHERE tokens_cache_create > 0` (and same for `token_usage`); `_5m` stays 0 — locked CONTEXT.md decision. The legacy `tokens_cache_create` column is preserved for backward compat until Plan 03's JSONL re-parse can split it accurately.
- **`event_name` bare form is the source of truth.** Production `event_name` column reads `tool_decision` (post prefix-strip per SPIKE.md LOCK-1 / `cmc/api/routes/ingest.py:102` reading the bare form). The previous test was coding against the prefixed form because no production row was ever queried — a write-only test that masked the actual bug. Test now mirrors the live shape.
- **Backfill counts updated.** Plan called out 9,359 NULL session_id rows from the planning-time inspection. By execution time the count was 13,818 (continued ingest before the migration). Migration recovered 13,998 of 14,000 — leaving exactly the 2 corrupt rows SPIKE.md predicted (1 corrupt + 1 boundary).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Test alembic config required `sqlite+aiosqlite://` URL**
- **Found during:** Task 2 (running `pytest tests/test_migrations.py` for the first time)
- **Issue:** Initial test config used `sqlite:///` URL, but `migrations/env.py` invokes `async_engine_from_config` which raises `sqlalchemy.exc.InvalidRequestError: The asyncio extension requires an async driver to be used. The loaded 'pysqlite' is not async`.
- **Fix:** Updated `_alembic_cfg` helper in `tests/test_migrations.py` to set `sqlalchemy.url` to `sqlite+aiosqlite:///{db_path}`. Also added a comment explaining why.
- **Files modified:** `backend/tests/test_migrations.py`
- **Verification:** All 3 migration tests pass (`pytest tests/test_migrations.py -x -v` → `3 passed in 0.45s`).
- **Committed in:** `2f30a66` (Task 2 commit)

**2. [Rule 1 — Bug] Foundation boot test assertion drift (15 -> 18 tables)**
- **Found during:** Task 2 (running broader regression suite after migration landed)
- **Issue:** `test_foundation_boot.py::test_alembic_upgrade_creates_all_tables` and `test_lifespan_creates_all_tables` hardcoded `assert len(app_tables) == 15`. After 0002 lands `pricing` (Plan 01) + `alert_rules` (Plan 02) + `alert_state` (Plan 02), the count is 18. Plan 01's SUMMARY didn't catch this — the assertion is at row count 16 right now if we'd run only Plan 01's tests, and bumps to 18 with Plan 02. Both failures surface together because `pricing` was never table-counted in Plan 01.
- **Fix:** Bumped both assertions to 18 with an inline comment explaining the breakdown (15 + 1 pricing + 2 alert tables).
- **Files modified:** `backend/tests/test_foundation_boot.py`
- **Verification:** Foundation boot tests pass (34 / 34, 0 failed). Full backend suite still 399 passed / 2 skipped / 0 failed.
- **Committed in:** `2f30a66` (Task 2 commit)

**3. [Rule 1 — Bug] Existing OBSV-08 test seeded wrong body shape**
- **Found during:** Task 2 (after BUG-A SQL fix, the existing `test_obsv_08_edit_decisions_via_otel_events` would have continued to pass against the OLD broken pattern but FAIL against the new correct pattern)
- **Issue:** Test seeded `event_name="claude_code.tool_decision"` (prefixed form) and `body={"tool_name": "Write", "decision": d}` (flat). Both were wrong: ingest strips the prefix (LOCK-1) and OTLP attributes live under `body.record.attributes` as an array. The test was coding against a synthetic shape that no production row ever has — masking BUG-A by appearing green while production query returned NULL silently for 1,406+ rows.
- **Fix:** Rewrote the test to use `event_name="tool_decision"` (bare) and `body={"record": {"attributes": [{"key": "tool_name", "value": {"stringValue": "Write"}}, {"key": "decision", "value": {"stringValue": d}}]}}` — matching the production OTLP shape verified in SPIKE.md Q-13.
- **Files modified:** `backend/tests/test_observability_router.py`
- **Verification:** `pytest tests/test_observability_router.py -x -q` → 17 passed. The test now exercises the json_each path correctly.
- **Committed in:** `2f30a66` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking dependency, 2 bugs)
**Impact on plan:** All three were necessary for the migration tests + observability router tests to deliver the success criteria. No scope creep — every deviation supports a plan-level success criterion.

## Issues Encountered

- None beyond the deviations above. The migration applied cleanly to a copy of the production DB on first attempt; round-trip (upgrade/downgrade/upgrade) on a fresh DB succeeded; full test suite (399 tests) passes.

## User Setup Required

None — no external service configuration required for this plan. All work is local schema + Python code.

## Next Phase Readiness

- **Plan 03 unblocked:** ingest.py BUG-B prospective fix + JSONL parser cache split can land against the now-existing `attrs_skill_name`, `otel_event_id`, and cache TTL split columns. (session.id) extraction will land in the ingest read-side; the table is already shaped for it.
- **Plan 04 unblocked:** cost engine can read `pricing` rows by `WHERE effective_from <= ts AND (effective_until IS NULL OR effective_until > ts)` — the temporal columns are present.
- **Plan 05 unblocked:** doctor `_check_pricing_json_hash_drift` has the `pricing.seed_hash` column to compare against `cmc.pricing.pricing_json_hash()`. The plan's exact assertion target exists.
- **Phase 15 alert engine schema-ready:** `alert_rules` has all 12 ALRT-01 structural columns + `params_json` + timestamps; `alert_state` has the 8 ALRT-02 lifecycle columns + UNIQUE(rule_id, scope_key) for hysteresis dedup. Phase 15 ships ZERO migration work — confirmed by upgrading to head and observing `alembic_version = 0002_v1_1_alerts_and_skills` plus all 18 tables.
- **No blockers carried forward.**

## Self-Check: PASSED

- File `backend/cmc/db/models/alert_rules.py` — FOUND
- File `backend/cmc/db/models/alert_state.py` — FOUND
- File `backend/migrations/versions/0002_v1_1_alerts_and_skills.py` — FOUND
- File `backend/tests/test_migrations.py` — FOUND
- Commit `ed6ec56` (Task 1) — FOUND in `git log --oneline -5`
- Commit `2f30a66` (Task 2) — FOUND in `git log --oneline -5`
- Test gates: `pytest tests/test_migrations.py -x -q` → 3 passed; `pytest tests/test_observability_router.py -x -q` → 17 passed; full suite → 399 passed / 2 skipped / 0 failed.
- Production DB copy: `sqlite3 /tmp/cmc-mig-test.db "SELECT count(*) FROM otel_events WHERE session_id IS NOT NULL"` → 13,998 (was 0 pre-migration). Validates BUG-B backfill on real data.
- Schema check: `sqlite3 /tmp/cmc-mig-test.db ".schema pricing"` → all 5 `*_per_mtok` Numeric(10,4) cols + `seed_hash VARCHAR NOT NULL` present (verified verbatim against `PricingRow` model).
- Round-trip check on fresh DB: `upgrade head` → `downgrade 0001_initial` → `upgrade head` all succeeded.

---
*Phase: 13-cost-foundation-skill-ingest*
*Completed: 2026-05-03*
