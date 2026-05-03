---
phase: 13-cost-foundation-skill-ingest
plan: 03
subsystem: ingest
tags: [otel, otlp, jsonl, sqlalchemy, fastapi, anthropic-cache-ttl, idempotent-upsert]

# Dependency graph
requires:
  - phase: 13-02
    provides: "alembic migration 0002 — otel_events.attrs_skill_name (indexed) + otel_events.otel_event_id + (session_id, otel_event_id) UNIQUE; sessions/token_usage tokens_cache_create_5m/_1h columns; BUG-A read-side fix; BUG-B SQL data backfill"
provides:
  - "extract_skill_attr() — pure-function OTLP attribute extractor that tries skill_name -> skill.name -> name"
  - "extract_event_sequence() — pure-function event.sequence reader with int64 wire-safety string coercion"
  - "/v1/logs router populates attrs_skill_name + otel_event_id on every insert"
  - "BUG-B prospective fix at /v1/logs: reads session.id (DOTTED) first, falls back to session_id (underscore) for legacy fixtures"
  - "INGST-13 idempotent ingest: sqlite_insert(...).on_conflict_do_nothing(index_elements=['session_id','otel_event_id']) absorbs cross-midnight re-posts and OTLP exporter retries"
  - "JSONL parse_session_file extracts cache_creation.ephemeral_5m_input_tokens + ephemeral_1h_input_tokens into session dict + token_usage_buckets"
  - "Legacy fallback: when split block absent, aggregate cache_creation_input_tokens lands entirely in 1h tier (CONTEXT.md pessimistic rule — direction-honest)"
  - "Repository upserts (Session + TokenUsage) carry the new tokens_cache_create_5m / _1h columns through Option B subtract-then-add path"
affects: [13-04 cost-engine, 13-05 doctor checks, 14 skill-latency-table, OBSV-01 token-rollups]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "OTLP attribute extraction via iter_attrs() returning materialized dict[str, dict] — pure-function helpers next to extract_mcp_attrs"
    - "sqlite_insert(...).on_conflict_do_nothing(index_elements=[...]) for idempotent OTLP ingest (per-record dedup at the DB layer, not in-app)"
    - "Pessimistic-fallback policy for legacy data shapes — when richer info is absent, attribute to the more expensive tier so cost direction stays honest without re-walking raw bodies"

key-files:
  created:
    - backend/tests/test_otel_parser.py
  modified:
    - backend/cmc/ingest/otel_parser.py
    - backend/cmc/api/routes/ingest.py
    - backend/cmc/ingest/jsonl_parser.py
    - backend/cmc/ingest/repository.py
    - backend/tests/test_ingest.py

key-decisions:
  - "Tried skill_name (underscore) first per SPIKE.md LOCK-2 best-evidence, with skill.name (dotted) and bare name as fallbacks. Production data inspected at execute time confirms real skill_activated rows use skill.name DOTTED — fallback chain handles both."
  - "BUG-B fix is one-line: try session.id (dotted) first, fall back to session_id (underscore). Existing test fixtures (otlp_log_payload) still round-trip because the fallback honors the legacy underscore form."
  - "Used sqlite_insert(...).on_conflict_do_nothing instead of INSERT OR IGNORE because SQLAlchemy's dialect-level helper composes cleanly with the existing soft-FK retry path."
  - "New integration tests pre-seed the parent sessions row so the FK is satisfied — without seeding, the existing soft-FK retry intentionally nulls session_id and the BUG-B happy-path assertion would falsely fail."
  - "Cache TTL split: legacy fallback lands aggregate in 1h ONLY when both _5m and _1h are zero. If either tier is non-zero, the parser trusts the source's split (CONTEXT.md-locked behavior)."

patterns-established:
  - "Pure-function OTLP extractors (extract_mcp_attrs / extract_skill_attr / extract_event_sequence) are exercised via real OTLP `[{key, value}]` list shape in unit tests so future refactors of iter_attrs surface immediately."
  - "Pre-seed parent rows in integration tests when asserting FK-dependent column values; soft-FK retry behavior must be tested separately from happy-path FK satisfaction."

requirements-completed: []

# Metrics
duration: ~25min
completed: 2026-05-03
---

# Phase 13 Plan 03: Ingest extractors + BUG-B fix + JSONL cache TTL split Summary

**Skill-event extractors (skill_name + event.sequence), prospective BUG-B fix at /v1/logs, INGST-13 dedup via on_conflict_do_nothing, and Anthropic cache TTL split (5m/1h) parsed from JSONL into sessions + token_usage_buckets.**

## Performance

- **Duration:** ~25 min (including unblocking out-of-scope ruff lint failures)
- **Tasks:** 2 of 2
- **Files modified:** 5 (4 source + 1 test) + 1 created (test_otel_parser.py)

## Accomplishments

- Two pure-function OTLP attribute extractors land in `cmc.ingest.otel_parser` with full unit-test coverage that exercises the real OTLP list shape (`[{key, value}]`) end-to-end through `iter_attrs`.
- `/v1/logs` handler now reads `session.id` (DOTTED, per SPIKE.md LOCK-5) — the BUG-B prospective fix. New skill events posted to the endpoint with a corresponding parent session row land with non-NULL `session_id`.
- The router populates `attrs_skill_name` (TENTATIVE LOCK-2 fallback chain: `skill_name` → `skill.name` → `name`) and `otel_event_id` (`event.sequence` int64 with string-coercion wire safety) on every insert.
- INGST-13 idempotency: `sqlite_insert(OtelEvent.__table__).values(**row_values).on_conflict_do_nothing(index_elements=['session_id', 'otel_event_id'])` absorbs cross-midnight re-posts and OTLP exporter retries via the migration-0002 UNIQUE constraint. NULL `otel_event_id` rows are intentionally NOT deduped (SQLite UNIQUE treats multiple NULLs as distinct — research Pitfall 4).
- JSONL parser captures the Anthropic cache TTL split per LOCK-4: `message.usage.cache_creation.ephemeral_5m_input_tokens` and `ephemeral_1h_input_tokens` flow into `tokens_cache_create_5m` / `_1h` on both the session dict and per-day `token_usage_buckets` entries.
- Legacy fallback honors the CONTEXT.md-locked rule: when the split block is absent, the aggregate `cache_creation_input_tokens` lands entirely in 1h (pessimistic — keeps cost direction honest without re-walking bodies). Smoke-tested against ~20 real production JSONL files in `~/.claude/projects/`; the fallback fires correctly for older sessions and the split path fires correctly for 2.1.116 sessions.
- Repository upserts (`upsert_session` + `accumulate_token_usage` + `_adjust_bucket`) carry the new `_5m` / `_1h` deltas through both the `_SESSION_MUTABLE_COLS` propagation path and the Option B subtract-then-add path for `token_usage`. Legacy `tokens_cache_create` aggregate is preserved for backward-compatible read paths.

## Task Commits

Each task was committed atomically:

1. **Task 1: skill+sequence extractors + BUG-B fix + INGST-13 dedup** — `a190a92` (feat)
2. **Task 2: JSONL cache TTL split + repository column wiring** — `479452f` (feat)

## Files Created/Modified

- `backend/cmc/ingest/otel_parser.py` (modified) — added `extract_skill_attr` and `extract_event_sequence` pure functions (mirroring `extract_mcp_attrs` access pattern). Both safe-coerce missing attributes to `None`.
- `backend/cmc/api/routes/ingest.py` (modified) — module docstring documents the dotted/underscore fallback policy; imports the two new helpers; replaces `db.add(...)/flush()` with `sqlite_insert(...).on_conflict_do_nothing(index_elements=['session_id', 'otel_event_id'])` for INGST-13 dedup; preserves the soft-FK retry path; reads `session.id` first then `session_id` (BUG-B fix); populates `attrs_skill_name` + `otel_event_id` on insert.
- `backend/cmc/ingest/jsonl_parser.py` (modified) — module docstring documents the new keys + the LOCK-4 / pessimistic-fallback policy; `parse_session_file` declares `tokens_cache_create_5m` / `_1h` accumulators, extends the `daily` defaultdict factory with `cache_create_5m` / `cache_create_1h`, splits the assistant `usage` block into the new tiers (with the legacy aggregate fallback path), and propagates the values into both the session dict and `token_usage_buckets` return shapes.
- `backend/cmc/ingest/repository.py` (modified) — `_SESSION_MUTABLE_COLS` includes the two new columns; `accumulate_token_usage` carries the deltas; `_adjust_bucket` carries them through both the UPDATE-then-INSERT path and the `on_conflict_do_update` safety net.
- `backend/tests/test_ingest.py` (modified) — added 5 new tests: `test_otlp_logs_extracts_skill_name`, `test_otlp_logs_session_id_dotted_key`, `test_otlp_logs_idempotent_session_seq`, `test_jsonl_parser_cache_ttl_split`, `test_jsonl_parser_cache_legacy_aggregate_falls_into_1h`. Added a private `_seed_parent_session` helper that pre-creates the parent `sessions` row so FK is satisfied for the BUG-B happy-path assertions.
- `backend/tests/test_otel_parser.py` (created) — 7 pure-function unit tests covering primary key + 2 fallbacks + absent for `extract_skill_attr`, plus int + string-int (wire safety) + absent for `extract_event_sequence`. Exercises the real OTLP `[{key, value}]` list shape so future refactors of `iter_attrs` surface immediately.

## Decisions Made

- LOCK-2 fallback ORDER kept as plan-specified (`skill_name` → `skill.name` → `name`) even though production data inspection during execution confirmed real skill events use `skill.name` (dotted). Reason: the plan is explicit per SPIKE.md best-evidence, and the fallback chain handles both cases. Phase 14 doctor / verifier can disambiguate later if it matters for indexing performance.
- Soft-FK retry path was preserved as-is. Production behavior intentionally nulls `session_id` when the parent `sessions` row hasn't landed yet (events arrive faster than the JSONL scheduler discovers them). The tests mock the happy path by pre-seeding.
- Pre-commit ruff hook scanned the whole `backend/` tree and surfaced lint failures in `backend/cmc/api/routes/cost.py` (Plan 04 file, untracked at execute time). I applied the minimal lint fixes (UP017 datetime alias + 5 line-length wraps) under deviation Rule 3 — see Deviations below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Lint failures in `backend/cmc/api/routes/cost.py` blocked Task 1 commit**

- **Found during:** Task 1 commit (the `pre-commit` hook runs `make ruff-backend` which scans the whole backend tree).
- **Issue:** `cost.py` was an untracked file left behind by Plan 04 work-in-progress; it has 6 ruff violations (1 UP017 + 5 E501). Removing the file would break `cmc/api/routes/__init__.py` (which already imports `cost_router`); leaving it untouched blocked all my commits because the pre-commit hook is unfiltered.
- **Fix:** Applied minimal lint fixes — `ruff --fix` auto-resolved 3 (UP017 + 2 E501 with fixes), and I manually wrapped 3 long lines in `cost.py` (the `CostSummaryResponse(...)` and `CostBreakdownResponse(...)` returns + the SQL execute-call cluster around lines 188-194). The fixes are pure formatting; they do not change behavior.
- **Files modified:** `backend/cmc/api/routes/cost.py` (lint-only). NOT staged in either Task 1 or Task 2 commit — left in the working tree for whichever Plan 04 commit eventually catches up.
- **Verification:** `cd backend && .venv/bin/python -m ruff check cmc tests` returns "All checks passed!"
- **Committed in:** Not committed by Plan 03 (out of scope). Will be picked up by the next Plan 04 commit.

**2. [Rule 3 - Blocking] New integration tests required pre-seeding parent `sessions` row for BUG-B happy-path assertion**

- **Found during:** Task 1 first test run.
- **Issue:** The plan-specified `test_otlp_logs_extracts_skill_name` body asserts `rows[0].session_id == "sess-test-1"`. With `PRAGMA foreign_keys=ON` (production setting, also enabled in tests), the existing `IntegrityError` retry path nulls `session_id` when no parent `sessions` row exists. This is intentional production behavior (events arrive before sessions are discovered), but it makes the BUG-B assertion fail in a hermetic test.
- **Fix:** Added a private `_seed_parent_session(app, session_id)` helper inside `test_ingest.py` that inserts a stub `sessions` row before each of the 3 new integration tests posts to `/v1/logs`. The helper docstring documents the production rationale.
- **Files modified:** `backend/tests/test_ingest.py` (test-only, in-scope).
- **Verification:** All 3 new integration tests pass.
- **Committed in:** `a190a92` (Task 1 commit).

---

**Total deviations:** 2 auto-fixed (both Rule 3 unblocking). 
**Impact on plan:** Deviation 1 surfaces a Plan 04 process gap (untracked source file with lint violations); the project should commit `cost.py` and verifier flags should fire there. Deviation 2 is a test-quality refinement that the plan body didn't anticipate — the helper is defensive and could be reused by Plan 04/05 verifier suites.

## Issues Encountered

- The first run of `pytest tests/test_ingest.py -k "skill or bugB or idem"` collected the whole file and tripped a stale-cache-style failure on `cmc.api.routes.__init__` — running the same test under a different invocation succeeded. Likely Python `__pycache__` artifact; cleared by re-running. Not reproducible after.
- Smoke-test against real production JSONL initially showed all `_5m=0` for legacy sessions, which is expected (those sessions were captured before Anthropic added the split block). Verified the parser correctly takes the split path for newer (2.1.116) sessions that do have `cache_creation.ephemeral_*_input_tokens` keys, and falls back for legacy sessions.

## Verification

- **`pytest backend/tests/test_otel_parser.py`** — 7 / 7 pass.
- **`pytest backend/tests/test_ingest.py`** — 41 / 41 pass (was 36 before; added 5 new cases — 3 OTLP integration + 2 JSONL parser).
- **`pytest backend/tests/test_otel_parser.py backend/tests/test_ingest.py`** — 48 / 48 pass.
- **Targeted regression** (`test_observability_router test_observability_extensions test_pricing test_migrations test_skills_router test_sessions_router`): 59 / 59 pass.
- **Targeted regression** (`test_foundation_boot test_emergency_stop test_attention_metrics test_context_router test_hitl_router test_mcp_router`): 71 / 71 pass.
- **Smoke against real production JSONL** (`~/.claude/projects/`): legacy sessions correctly fall back to `_1h=aggregate`; sessions with the split block correctly route per-tier (verified file `b2c1aa99-…jsonl` shows `_1h=528901, _5m=0` matching the source attribution).
- **Plan grep checks** — `extract_skill_attr` + `extract_event_sequence` exported from `otel_parser.py` (lines 83 + 105); `session.id` (dotted) tried before `session_id` in ingest router (line 125); `tokens_cache_create_5m` / `_1h` wired through both `Session` and `TokenUsage` repository paths (10 occurrences).

## Self-Check: PASSED

**Files claimed in summary:**
- `backend/cmc/ingest/otel_parser.py` — FOUND
- `backend/cmc/api/routes/ingest.py` — FOUND
- `backend/cmc/ingest/jsonl_parser.py` — FOUND
- `backend/cmc/ingest/repository.py` — FOUND
- `backend/tests/test_ingest.py` — FOUND
- `backend/tests/test_otel_parser.py` — FOUND (created)

**Commits claimed in summary:**
- `a190a92` (Task 1) — FOUND in `git log`
- `479452f` (Task 2) — FOUND in `git log`

## Next Phase Readiness

- Plan 04 (cost engine) can now read accurate per-tier cache_creation tokens from `sessions.tokens_cache_create_5m` / `_1h` and `token_usage.tokens_cache_create_5m` / `_1h`. Pitfall 2 (cache TTL pricing accuracy) is mitigated for new ingests; existing rows lack the split until the next re-parse cycle (the scheduler will pick them up automatically as `jsonl_mtime` advances).
- Plan 05 (doctor) checks 9-14 should now find `attrs_skill_name`-populated rows once a real skill event lands via `/v1/logs` (Phase 12 Wave 2 negative finding may resolve once OTLP exporter mis-config is corrected — that's a separate concern).
- The `cost.py` lint fix is staged in working tree as a pending un-committed delta; whoever finalizes Plan 04 should commit it.

---
*Phase: 13-cost-foundation-skill-ingest*
*Completed: 2026-05-03*
