---
phase: 13-cost-foundation-skill-ingest
plan: 04
subsystem: api
tags: [fastapi, pydantic-v2, decimal, sqlalchemy, sqlite, pricing, cost-engine]

# Dependency graph
requires:
  - phase: 13-cost-foundation-skill-ingest/01
    provides: cmc.pricing.compute_cost / load_rates / pricing_json_hash (pure Decimal math + DB-backed rate window)
  - phase: 13-cost-foundation-skill-ingest/02
    provides: pricing table with effective_from/effective_until window + lifespan auto-seed of 5 SKUs

provides:
  - GET /api/cost/summary?range=1d|7d|14d|30d (Decimal-as-string totals + rates_as_of)
  - GET /api/cost/breakdown?dim=model|skill|project&range=... (rows summing to summary.total_usd exactly)
  - GET /api/pricing/freshness (rates_as_of + age_days + is_stale + on-disk sha256 + model_count)
  - cost_router registered in routes/__init__.py::all_routers()

affects:
  - phase 14 (skills cost dashboard mounts /api/cost/summary + /api/cost/breakdown directly; SkillCostCard JSON contract is locked here)
  - phase 16 (session-compare endpoint reuses compute_cost via cmc.pricing for parity)
  - doctor (doctor's pricing-drift check consumes /api/pricing/freshness's on_disk_hash + rates_as_of)
  - settings UI (rates_as_of badge, age_days warning when is_stale=true)

# Tech tracking
tech-stack:
  added: []  # no new libraries — uses existing fastapi / pydantic-v2 / sqlalchemy
  patterns:
    - "Range param locked enum (Literal['1d','7d','14d','30d']) — anything else returns 422 from FastAPI auto-422 on Literal mismatch."
    - "Decimal serialized as JSON string by Pydantic v2 default (NEVER through fastapi.encoders.jsonable_encoder which silently converts to float)."
    - "rates_as_of derived from MAX(effective_from across rates touched) — propagates to every cost payload + freshness endpoint for consistency."
    - "Cost is read-time computed from token totals × Decimal rates — no $ stored anywhere; historical totals self-correct as new pricing rows back-date effective_until."
    - "Session-scoped skill attribution (Phase 13 LOCK-9): ALL tokens of any session that fired skill X attributed to skill X. Phase 14 will refine to request-scoped via api_request JOIN."

key-files:
  created:
    - backend/cmc/api/schemas/cost.py
    - backend/cmc/api/routes/cost.py
    - backend/tests/test_cost_router.py
  modified:
    - backend/cmc/api/routes/__init__.py

key-decisions:
  - "Decimal-as-string is the on-the-wire money format — Pydantic v2 default round-trips correctly; jsonable_encoder is forbidden anywhere near a Decimal payload."
  - "Range enum is exactly 1d|7d|14d|30d (Literal). Range '2d' returns 422 — locked."
  - "Breakdown dim=model rows MUST sum to summary.total_usd by Decimal equality (no float drift). The two endpoints share _SUMMARY_SQL shape so ordering and rounding are identical."
  - "Skill attribution is session-scoped in Phase 13 (per SPIKE.md LOCK-9). Two skills fired in the same session WILL show the same cost number. Phase 14 owns request-scoped refinement via api_request JOIN."
  - "Project breakdown keys on cwd (not project_hash — that column doesn't exist in sessions; cwd is the canonical OBSV-06 project key)."
  - "Tests use the shared `client` fixture (lifespan auto-seeds 5 SKUs from data/pricing.json) and seed token_usage inline via the engine, matching test_observability_router.py — no need for the seed_pricing/seed_token_usage fixtures the plan suggested (they don't exist)."

patterns-established:
  - "Cost-engine endpoint pattern: load_rates(db) -> per-row compute_cost(...) -> accumulate Decimal total + rates_dates; emit rates_as_of = max(rates_dates) on every payload."
  - "Literal-validated range/dim Query() params — declarative, FastAPI emits 422 for free."

# Metrics
duration: 17min
completed: 2026-05-03
---

# Phase 13 Plan 04: Cost API Summary

**Three read-time-computed cost endpoints (`/api/cost/summary`, `/api/cost/breakdown`, `/api/pricing/freshness`) wiring `cmc.pricing.compute_cost` to the pricing-table effective_from/effective_until window. Decimal-as-JSON-string locked, range enum locked, summary↔breakdown Decimal equality verified.**

## Performance

- **Duration:** ~17 min
- **Started:** 2026-05-03T12:41:18Z
- **Completed:** 2026-05-03T12:58:44Z
- **Tasks:** 2
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments

- `GET /api/cost/summary?range=1d|7d|14d|30d` returns Decimal-as-string `total_usd` and `rates_as_of: YYYY-MM-DD`, with per-model rows.
- `GET /api/cost/breakdown?dim=model|skill|project&range=...` returns rows whose total exactly equals `/api/cost/summary` (Decimal equality, no float drift).
- `GET /api/pricing/freshness` returns the 64-char sha256 of `data/pricing.json`, `model_count=5`, `rates_as_of`, `age_days`, and `is_stale` for doctor + settings consumption.
- Range enum is locked (`Literal["1d","7d","14d","30d"]`) — anything else returns 422 from FastAPI's auto-422.
- Skill attribution is session-scoped per SPIKE.md LOCK-9 — Phase 14 owns the request-scoped refinement.
- 8 integration tests pass (Decimal-as-string, range/dim 422 validation, breakdown↔summary Decimal equality, freshness shape, schema importability).
- Full backend suite: **432 passed, 2 skipped, 0 failed.**

## Task Commits

Each task was committed atomically:

1. **Task 1: Create response schemas in cmc/api/schemas/cost.py** — `c40eaf0` (feat)
2. **Task 2: Create cost.py router with 3 endpoints; register in all_routers()** — `5811beb` (feat)

## Files Created/Modified

- `backend/cmc/api/schemas/cost.py` (created) — `CostSummaryResponse`, `CostBreakdownResponse`, `CostByModelRow`, `CostBreakdownRow`, `PricingFreshnessResponse`, `CostRange`, `BreakdownDim`. `protected_namespaces=()` on `PricingFreshnessResponse` to silence the `model_count` namespace warning.
- `backend/cmc/api/routes/cost.py` (created) — three endpoints. `_SUMMARY_SQL` and `_BREAKDOWN_BY_MODEL_SQL` are shape-identical so the totals match by Decimal equality. `_BREAKDOWN_BY_SKILL_SQL` JOINs `otel_events` (where `event_name='skill_activated'`) to `sessions` for session-scoped attribution. `_BREAKDOWN_BY_PROJECT_SQL` rolls up by `sessions.cwd`.
- `backend/cmc/api/routes/__init__.py` (modified) — added `cost_router` import + entry in `all_routers()` between `context_router` and `hitl_router`.
- `backend/tests/test_cost_router.py` (created) — 8 tests covering Decimal-as-string, range/dim 422 validation, summary↔breakdown Decimal equality, `/pricing/freshness` shape, schema importability.

## Decisions Made

- **Decimal-as-JSON-string** is the on-wire money format. Pydantic v2 serializes `Decimal` as a string by default; `jsonable_encoder` is explicitly forbidden anywhere near a money field (research Anti-Pattern: silent float conversion).
- **Range enum: `Literal["1d","7d","14d","30d"]`**. `?range=2d` returns 422. FastAPI's automatic Literal validation does this for free.
- **Skill breakdown is session-scoped in Phase 13** (per SPIKE.md LOCK-9). Phase 14 owns the request-scoped refinement via `api_request` JOIN. The locked decision means two skills fired in the same session WILL show the same cost number — gsd-verifier expectation locked.
- **Project breakdown keys on `sessions.cwd`** (not `project_hash` — that column doesn't exist in the current `sessions` schema). Matches the OBSV-06 canonical project key.
- **`MAX(s.model)` as pricing-key for skill/project breakdowns** — within a single session the model is effectively constant, so MAX is "pick the one model".
- **Skill/project breakdowns set `tokens_cache_create_5m=0` and `_1h=0`** because the `sessions` table only has unsplit `tokens_cache_create`. The 5m/1h split lives in `token_usage`, which is per-(day, model, source), not per-session. Phase 14 refinement will add the per-request JOIN that recovers the split. For Phase 13, this is the correct conservative read.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test fixtures `db_session` / `seed_pricing` / `seed_token_usage` don't exist in `conftest.py`**
- **Found during:** Task 2 (writing `test_cost_router.py`)
- **Issue:** The plan's example test code references `db_session`, `seed_pricing`, and `seed_token_usage` fixtures and suggests adding them to `conftest.py`. None of those fixtures exist, and adding them is out of Plan 04's `files_modified` list (`conftest.py` is not in scope).
- **Fix:** Adapted the test file to use the actual project pattern from `test_observability_router.py`: the shared `client` fixture (which runs the lifespan, auto-seeding pricing from `data/pricing.json`) plus an inline `_seed_token_usage` helper that writes rows via the engine. Pricing seeding is automatic via the lifespan; token_usage is seeded per-test.
- **Files modified:** `backend/tests/test_cost_router.py` only (no conftest.py edit needed).
- **Verification:** All 8 tests pass; full backend suite passes 432/432.
- **Committed in:** `5811beb` (Task 2 commit).

**2. [Rule 2 - Missing Critical] Pydantic `model_count` field triggered "protected namespace" warning**
- **Found during:** Task 1 verification (`python -c "from cmc.api.schemas.cost import ..."` printed a `UserWarning`)
- **Issue:** Pydantic v2 reserves `model_*` field names by default. `model_count` on `PricingFreshnessResponse` is unrelated to Pydantic's reserved API but triggered a `UserWarning` on every import.
- **Fix:** Set `model_config = ConfigDict(protected_namespaces=())` on `PricingFreshnessResponse` to silence the spurious warning. The field name is locked by the public JSON contract.
- **Files modified:** `backend/cmc/api/schemas/cost.py`.
- **Verification:** Import is now warning-free; tests still pass.
- **Committed in:** `c40eaf0` (Task 1 commit).

**3. [Linter - cosmetic] Ruff swapped `from datetime import timezone` + `timezone.utc` → `from datetime import UTC` + `UTC`**
- **Found during:** Pre-commit hook on Task 2
- **Issue:** Ruff style preference for the Python 3.11+ `datetime.UTC` alias.
- **Fix:** Accepted — functionally identical to `timezone.utc`.
- **Files modified:** `backend/cmc/api/routes/cost.py`.
- **Committed in:** `5811beb` (Task 2 commit).

---

**Total deviations:** 3 (1 blocking-fixture-mismatch, 1 missing-critical-warning-fix, 1 linter-cosmetic).
**Impact on plan:** All deviations were necessary for the tests to run (Rule 3) or to ship a clean import (Rule 2). No scope creep — Plan 04's `files_modified` list was honored exactly.

## Issues Encountered

- **Pre-existing test-ordering flake in `test_otlp_logs_extracts_skill_name`** — appeared once during a `pytest -x` run that failed early on this Plan 03 / Wave 2 test. Confirmed pre-existing and unrelated to Plan 04: the test passes in isolation and the full suite (with `-x` removed) is 432-pass clean. Logged for visibility but no action — out of Plan 04's scope.

## Verification Performed

- `pytest tests/test_cost_router.py -x -v` — **8 passed.**
- Full backend suite: `pytest` — **432 passed, 2 skipped, 0 failed.**
- Schema importability: `python -c "from cmc.api.schemas.cost import ..."` — clean (no warnings after `protected_namespaces` fix).
- Decimal-as-string round-trip: `CostByModelRow(model='m', cost_usd=Decimal('1.234')).model_dump_json()` emits `"cost_usd":"1.234"` (string).
- `summary.total_usd == breakdown(dim=model).total_usd` (Decimal equality assertion in `test_breakdown_sums_to_summary`).
- Range validation: `?range=2y` and `?range=2d` both return 422 (separate test cases).
- `dim` validation: `?dim=zoinks` and missing `dim` both return 422.
- `/api/pricing/freshness` returns `model_count=5`, 64-char sha256, `rates_as_of=2026-05-03`.

## Next Phase Readiness

- **Phase 14 dashboard panels (`SkillCostCard` etc.) can mount `/api/cost/summary` + `/api/cost/breakdown` directly** — JSON contract is locked.
- **Doctor (Plan 05) consumes `/api/pricing/freshness`** — `on_disk_hash`, `rates_as_of`, `age_days`, `is_stale` are all in place.
- **Phase 16 session-compare** — can reuse `cmc.pricing.compute_cost` directly (no router dependency).
- **Phase 14 refinement of skill cost** — the session-scoped skill attribution is the locked Phase 13 contract; the refinement to request-scoped (api_request JOIN) is owned by Phase 14 per SPIKE.md LOCK-9.

## Self-Check: PASSED

- [x] `backend/cmc/api/schemas/cost.py` exists.
- [x] `backend/cmc/api/routes/cost.py` exists.
- [x] `backend/tests/test_cost_router.py` exists.
- [x] `backend/cmc/api/routes/__init__.py` modified (cost_router import + entry in `all_routers()`).
- [x] Commit `c40eaf0` exists in `git log`.
- [x] Commit `5811beb` exists in `git log`.
- [x] `pytest tests/test_cost_router.py` — 8 passed.
- [x] Full backend suite — 432 passed, 2 skipped, 0 failed.

---
*Phase: 13-cost-foundation-skill-ingest*
*Plan: 04*
*Completed: 2026-05-03*
