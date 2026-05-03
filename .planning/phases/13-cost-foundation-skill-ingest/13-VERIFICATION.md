---
phase: 13-cost-foundation-skill-ingest
verified: 2026-05-03T14:20:00Z
status: human_needed
score: 5/5
overrides_applied: 0
human_verification:
  - test: "Apply Alembic migration 0002 to the live data/cmc.db and verify BUG-B backfill"
    expected: "After running `cd backend && uv run alembic upgrade head` (or starting `cmc start`), sqlite3 data/cmc.db shows version_num=0002_v1_1_alerts_and_skills, `pricing` table has 5 rows, otel_events has attrs_skill_name + otel_event_id columns, and COUNT(session_id) / COUNT(*) > 0 for otel_events."
    why_human: "The live data/cmc.db is still on 0001_initial (verified via sqlite3 query). The migration IS correct and the lifespan auto-applies it, but no human-visible smoke of the production schema state has run post-commit. This must be operator-confirmed before claiming BUG-B backfill populated 13,998+ rows in production."
---

# Phase 13: Cost Foundation & Skill Ingest Verification Report

**Phase Goal:** Stand up the cost-math primitive and skill-name ingest column so every subsequent panel computes dollars consistently from token counts and queries skills by indexed column, not JSON path.
**Verified:** 2026-05-03T14:20:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | `cmc.pricing.compute_cost` importable from REPL, returns `Decimal`, no float drift, reads from `data/pricing.json` rates | VERIFIED | `test_phase13_repl_import_compute_cost` passes — direct import, asserts `Decimal("5")` for 1M tokens @ $5/Mtok, no float. Actual signature is 7-arg (with `rates` dict); ROADMAP SC text says 6-arg but the plan's own verification step and SUMMARY both document 7-arg form as the intentional design. `load_rates()` / `_rates_dict_to_decimal()` are the REPL-callable helpers to build the rates dict. |
| SC2 | `GET /api/cost/summary?range=` and `GET /api/cost/breakdown?dim=model\|skill\|project&range=` return read-time-computed cost figures covering all five SKUs and all cache tiers | VERIFIED | `test_cost_summary_returns_decimal_strings`, `test_breakdown_sums_to_summary`, `test_phase13_full_trace` (step 6-7) — all pass. `/api/cost/summary` returns `total_usd` as JSON string (Decimal-safe), `rates_as_of` populated. Both `cache_create_5m` and `cache_create_1h` columns used in `_SUMMARY_SQL` and `_BREAKDOWN_BY_MODEL_SQL`. Five SKUs seeded via lifespan auto-seed confirmed by `test_seed_loader_round_trip`. |
| SC3 | `rates_as_of` field (ISO date string) present in every cost API response; `cmc doctor` warns when pricing rows are >30 days old or `unpriced_tokens > 0` | VERIFIED | `rates_as_of` field in `CostSummaryResponse`, `CostBreakdownResponse`, and `PricingFreshnessResponse` schemas (`backend/cmc/api/schemas/cost.py`). `test_pricing_freshness_returns_hash_and_age` asserts `rates_as_of == "2026-05-03"`. Doctor checks: `test_pricing_freshness_warn_at_30d` (45-day-old row → warn), `test_unpriced_tokens_warn_per_bucket` (model not in pricing → warn per model). UI caption ("Rates as of") is Phase 14 — SC3 explicitly says "verify via API response shape". |
| SC4 | `claude_code.skill_activated` events land in `otel_events.attrs_skill_name` (indexed), idempotent via `(session_id, otel_event_id)` UNIQUE, in the same migration that adds alert tables | VERIFIED (code) / HUMAN NEEDED (live DB state) | Code path: `extract_skill_attr()` in `cmc/ingest/otel_parser.py`; `ingest.py` writes to `attrs_skill_name`; `test_otlp_logs_extracts_skill_name` passes. UNIQUE constraint + `on_conflict_do_nothing`: `test_otlp_logs_idempotent_session_seq` + `test_phase13_full_trace` step 4 pass. `test_0002_upgrade_from_0001` asserts `idx_otel_events_attrs_skill_name` + `uq_otel_events_session_seq` created. Alert tables present in same migration. **GAP**: `data/cmc.db` is on `0001_initial` — migration not applied to live DB yet. |
| SC5 | Historical cost totals self-correct when pricing rows are added (`effective_from`/`effective_until` window logic); no `$` values stored in derived tables | VERIFIED | `test_pricing_window_self_correcting` (Plan 06 finalized stub) — manually inserts a future-dated row, exercises the `close_stmt UPDATE` clause, verifies the prior row gets `effective_until` set. Cost API never stores `$` values: `_SUMMARY_SQL`, `_BREAKDOWN_BY_*_SQL` select raw token counts; `compute_cost()` is called at read time per row. Pydantic schemas have `cost_usd: Decimal` but this is a response field, not a DB column. |

**Score:** 5/5 truths verified (one has a human-needed live-DB sub-check)

### Bug Fix Verification

| Fix | Status | Evidence |
|-----|--------|----------|
| BUG-A: `_EDIT_DECISIONS_OTEL_SQL` uses `json_each` over `body.record.attributes` AND `event_name = 'tool_decision'` (bare) | VERIFIED | `observability.py` lines 539-560: `FROM json_each(json_extract(body, '$.record.attributes'))` for all attribute reads; `WHERE event_name = 'tool_decision'` (not `'claude_code.tool_decision'`). No flat `json_extract(body, '$.tool_name')` pattern anywhere in that SQL. |
| BUG-B (prospective): `ingest.py` reads `session.id` (dotted) for new events | VERIFIED | `ingest.py` lines 123-127: `(attrs.get("session.id") or {}).get("stringValue")` tried first, falling back to `attrs.get("session_id")`. `test_otlp_logs_session_id_dotted_key` explicitly asserts dotted key populates `session_id` column. |
| BUG-B (backfill): production `otel_events.session_id` populated for NULL rows | HUMAN NEEDED | Migration `0002` line 163-184 contains correct backfill SQL (`UPDATE otel_events SET session_id = (SELECT ... FROM json_each(body.record.attributes) WHERE key='session.id')  WHERE session_id IS NULL`). `test_0002_bug_b_backfill` passes (ephemeral DB). **But**: `data/cmc.db` is on `0001_initial` — backfill has not run on the live DB. Verified: `sqlite3 data/cmc.db "SELECT version_num FROM alembic_version"` → `0001_initial`; `COUNT(session_id)/COUNT(*) = 0/18950`. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/cmc/pricing.py` | compute_cost, load_seed, load_rates, unpriced_tokens | VERIFIED | 197 lines. All 5 exports present. Decimal(str()) pattern throughout. No float arithmetic. |
| `data/pricing.json` | 5 SKUs with all 5 rate fields as JSON strings | VERIFIED | 13 lines. All values as strings. `published_at: "2026-05-03"`. |
| `backend/cmc/db/models/pricing.py` | PricingRow SQLModel with effective_from/until | VERIFIED | 12 columns including seed_hash, UniqueConstraint, Index. |
| `backend/migrations/versions/0002_v1_1_alerts_and_skills.py` | Single migration with all 7 Phase 13 schema mutations | VERIFIED | Adds attrs_skill_name + index, otel_event_id + UNIQUE, cache TTL split columns, pricing table, alert_rules, alert_state, BUG-B backfill SQL. |
| `backend/cmc/api/routes/cost.py` | /api/cost/summary, /api/cost/breakdown, /api/pricing/freshness | VERIFIED | 265 lines. All 3 endpoints. rates_as_of in all responses. compute_cost called at read-time per row. |
| `backend/cmc/api/routes/ingest.py` | /v1/logs with session.id dotted-key read + on_conflict_do_nothing | VERIFIED | Line 124-127: dotted-first fallback. Line 159-162: on_conflict_do_nothing on (session_id, otel_event_id). |
| `backend/cmc/ingest/otel_parser.py` | extract_skill_attr, extract_event_sequence | VERIFIED | Both functions present. extract_skill_attr tries skill_name, skill.name, name in order. extract_event_sequence handles int/string intValue. |
| `backend/cmc/cli/doctor.py` | _check_pricing_freshness, _check_unpriced_tokens registered as checks 9-10 | VERIFIED | Lines 651-652: both checks registered. Implementation at lines 347-426. |
| `backend/tests/test_phase13_e2e.py` | 2 tests: full_trace + repl_import | VERIFIED | 179 lines. test_phase13_full_trace (async, 7 steps), test_phase13_repl_import_compute_cost (sync). |
| `backend/tests/test_pricing.py` | 4 tests, no pytest.skip | VERIFIED | 174 lines. No pytest.skip call sites in test bodies. test_seed_loader_round_trip and test_pricing_window_self_correcting are real async tests (Plan 06 unstubbed). |
| `backend/tests/conftest.py` | db_session + seed_pricing fixtures with client-coexistence | VERIFIED | Lines 38+ include both fixtures; client-coexistence detection via request.fixturenames. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lifespan.py` | `cmc.pricing.load_seed` | `await load_pricing_seed(seed_session)` in startup | VERIFIED | lifespan.py lines 108-113: import + async with + call |
| `lifespan.py` | `alembic upgrade head` | `command.upgrade(alembic_cfg, "head")` | VERIFIED | lifespan.py lines 98-100 |
| `cost.py` | `cmc.pricing.compute_cost` | called per row in summary/breakdown handlers | VERIFIED | cost.py lines 97-105, 205-213: compute_cost called per DB row |
| `cost.py` | `cmc.pricing.load_rates` | `rates = await load_rates(db)` at top of each handler | VERIFIED | cost.py lines 90, 187 |
| `ingest.py` | `cmc.ingest.otel_parser.extract_skill_attr` | imported at top, called per record | VERIFIED | ingest.py line 46, 151 |
| `ingest.py` | `OtelEvent.attrs_skill_name` | `"attrs_skill_name": skill_name` in row_values | VERIFIED | ingest.py line 152 |
| `observability.py` | `otel_events.event_name = 'tool_decision'` | `WHERE event_name = 'tool_decision'` in SQL | VERIFIED | observability.py line 554 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `cost.py:/api/cost/summary` | `rates` | `load_rates(db)` → SELECT from pricing table | Yes — pricing table seeded via lifespan | FLOWING |
| `cost.py:/api/cost/summary` | `rows` (token counts) | `_SUMMARY_SQL` SELECT from token_usage | Yes — real token counts from JSONL ingest | FLOWING |
| `cost.py:/api/cost/breakdown dim=skill` | `rows` | `_BREAKDOWN_BY_SKILL_SQL` JOIN otel_events + sessions | Yes — otel_events populated via /v1/logs | FLOWING |
| `ingest.py:/v1/logs` | `attrs_skill_name` | `extract_skill_attr(record)` from OTLP body | Yes — real OTLP attribute extraction | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite passes 438/438 | `cd backend && uv run pytest --no-header 2>&1 \| grep "passed"` | `438 passed, 1106 warnings in 148.51s` | PASS |
| Phase 13 core tests (73 tests) | `uv run pytest tests/test_pricing.py tests/test_phase13_e2e.py tests/test_cost_router.py tests/test_doctor.py tests/test_migrations.py tests/test_ingest.py -q` | `73 passed` | PASS |
| Migration tests (3 tests) | `uv run pytest tests/test_migrations.py -v` | `3 passed in 0.38s` | PASS |
| REPL import smoke | `uv run pytest tests/test_phase13_e2e.py::test_phase13_repl_import_compute_cost -v` | `1 passed in 0.13s` | PASS |
| Live DB migration status | `sqlite3 data/cmc.db "SELECT version_num FROM alembic_version"` | `0001_initial` | FAIL (operator action required — see Human Verification) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ANLY-01 | 13-01, 13-06 | compute_cost returns Decimal, no float drift; REPL importable | SATISFIED | `test_compute_cost_decimal_no_float_drift` + `test_phase13_repl_import_compute_cost` |
| ANLY-02 | 13-01, 13-06 | 5 SKUs seeded from data/pricing.json, idempotent | SATISFIED | `test_seed_loader_round_trip` |
| ANLY-03 | 13-01, 13-06 | effective_from/until window self-correction | SATISFIED | `test_pricing_window_self_correcting` |
| ANLY-04 | 13-04, 13-06 | /api/cost/summary + /api/cost/breakdown read-time cost | SATISFIED | `test_cost_summary_returns_decimal_strings`, `test_breakdown_sums_to_summary`, `test_phase13_full_trace` |
| ANLY-05 | 13-04, 13-05 | Doctor warns on stale pricing / unpriced tokens; rates_as_of in API | SATISFIED | `test_pricing_freshness_warn_at_30d`, `test_unpriced_tokens_warn_per_bucket`, `test_pricing_freshness_returns_hash_and_age` |
| INGST-11 | 13-03, 13-06 | skill_activated events populate attrs_skill_name (indexed) | SATISFIED | `test_otlp_logs_extracts_skill_name`, `test_phase13_full_trace` step 3 |
| INGST-12 | 13-02 | Single migration 0002 adds all Phase 13 schema changes | SATISFIED | `test_0002_upgrade_from_0001`, `test_0002_downgrade_to_0001` |
| INGST-13 | 13-02, 13-03, 13-06 | (session_id, otel_event_id) UNIQUE deduplicates re-POST | SATISFIED | `test_otlp_logs_idempotent_session_seq`, `test_phase13_full_trace` step 4 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/cmc/pricing.py` | 182 | `datetime.utcnow()` (deprecated) | Info | Non-blocking — deprecated in Python 3.12+, no functional impact. Documented in SUMMARY as known deviation. |
| `backend/tests/test_pricing.py` | 139 | `datetime.utcnow()` in test helper | Info | Test-only, same as above. |
| `data/cmc.db` | N/A | Production DB on `0001_initial`, not `0002_v1_1_alerts_and_skills` | Warning | Migration not applied to live DB. `pricing` table absent, `attrs_skill_name` absent, BUG-B backfill not run. Lifespan auto-applies on next `cmc start`. No code defect — operator action needed. |

No `TODO`/`FIXME`/`PLACEHOLDER` markers found in any Phase 13 source files. No `return null` or empty-stub patterns in production code paths.

### Human Verification Required

#### 1. Apply migration to live data/cmc.db

**Test:** From the repo root, run:
```
cd backend
uv run alembic upgrade head
```
Or start the app (`cmc start`) which auto-applies migrations via lifespan.

**Expected:**
- `sqlite3 data/cmc.db "SELECT version_num FROM alembic_version"` returns `0002_v1_1_alerts_and_skills`
- `sqlite3 data/cmc.db "SELECT COUNT(*) FROM pricing"` returns `5` (5 SKUs seeded)
- `sqlite3 data/cmc.db "PRAGMA table_info(otel_events)"` shows `attrs_skill_name` and `otel_event_id` columns
- `sqlite3 data/cmc.db "SELECT COUNT(session_id) FROM otel_events"` returns a number substantially > 0 (BUG-B backfill populated session_id from dotted `session.id` key in body)
- `sqlite3 data/cmc.db ".tables"` shows `alert_rules` and `alert_state` tables

**Why human:** The live `data/cmc.db` is confirmed on `0001_initial` as of verification time (18,950 rows in otel_events, 0 with session_id, no pricing table). The migration script and backfill SQL are correct (verified by ephemeral-DB tests), but the operator must actually run the migration to close the BUG-B production claim ("13,998+ rows recovered"). This is not a code defect — it is an operational step.

### Gaps Summary

No code-level gaps found. All 5 ROADMAP success criteria are satisfied by the implementation and verified by passing automated tests (438/438 suite). The single outstanding item is operational: the Alembic migration 0002 must be applied to `data/cmc.db` before the production BUG-B claim ("session_id populated for 13,998+ rows") can be verified. The migration is correct, idempotent, and the lifespan will auto-apply it on the next `cmc start`. This is classified `human_needed` rather than `passed` because the stated Phase 13 deliverable explicitly includes the production backfill outcome.

---

_Verified: 2026-05-03T14:20:00Z_
_Verifier: Claude (gsd-verifier)_
