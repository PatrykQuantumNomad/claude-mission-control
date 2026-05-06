---
phase: 19-skills-per-project-deltas-badges
plan: 02
subsystem: backend-api
tags: [fastapi, sqlite, sqlalchemy, percentiles, project-key, sklp-08, read-time-cost]

# Dependency graph
requires:
  - phase: 19-skills-per-project-deltas-badges
    plan: 01
    provides: "sessions.project_key column + cmc.core.compute_project_key + ingest wiring (commits 53fe578 + 95bd1df)"
  - phase: 13-cost-and-skills-foundation
    provides: "cmc.pricing.compute_cost (read-time Decimal cost) + load_rates"
  - phase: 14-skills-detail-and-firehose
    provides: "_LATENCY_SQL window-CTE percentile idiom + MIN_LATENCY_SAMPLES + _SKILL_NAME_RE"
provides:
  - "GET /api/skills/{name}/projects -> SkillProjectsResponse (SKLP-08 endpoint)"
  - "SkillProjectRow + SkillProjectsResponse Pydantic schemas (path-leakage-resistant by construction)"
  - "_PROJECTS_PERCENTILE_SQL + _PROJECTS_TOKEN_SQL — reusable per-project rollup pattern for future SKLP-* plans"
  - "_seed_skill_row + project_key kwarg on _seed_session_row test helpers"
affects: [19-03-skills-deltas-and-badges, 19-04-frontend-projects-table-and-badges]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-project window-CTE percentiles: ROW_NUMBER() OVER (PARTITION BY project_key ORDER BY duration_ms) + COUNT(*) OVER (PARTITION BY project_key) — direct adaptation of _LATENCY_SQL with PARTITION key swapped from skill_name to project_key."
    - "Two-query split for percentiles vs. token sums. Mixing percentile windows and SUM in one CTE would force GROUP BY duration_ms to coexist with window functions; cleaner to materialize {project_key, count, p50, p95} in one query and {project_key, tokens_*, model} in a second, then merge in Python keyed by project_key."
    - "Per-project token DISTINCT-by-session: SELECT DISTINCT s.session_id, s.project_key, s.tokens_* FROM otel_events JOIN sessions — a session firing the same skill N times still contributes ONCE to token sums (Path S baseline preserved)."
    - "Empty-project-key sentinel filtered at the SQL boundary (`WHERE s.project_key != ''`) — never bubbles up to a phantom '' bucket in the response."
    - "cost_attribution semantics: 'session' when the model is priced (compute_cost returns >= 0); 'approximate' when the model is missing from rates (compute_cost returns Decimal(0) AND increments cmc.pricing.unpriced_tokens). Distinct from skill_cost's 'request|session' pair — per-project intentionally never tries the request-scoped JOIN because rolling up across many sessions per project doesn't gain meaningful signal from per-request correlation."
    - "Path-leakage prohibition is enforced TWICE: structurally (SkillProjectRow's explicit field list with no cwd/path/display_path) AND at runtime (test_skill_projects_no_path_leakage scans every row key + value for filesystem-shape violations)."

key-files:
  created: []
  modified:
    - backend/cmc/api/schemas/skills.py
    - backend/cmc/api/routes/skills.py
    - backend/tests/test_skills_router.py

key-decisions:
  - "Per-project endpoint uses session-scoped token attribution only (no Path R / request-scoped fallback). Rationale: per-project rollups aggregate across many sessions; per-request correlation adds SQL cost without changing the bucketed numbers materially. cost_attribution becomes 'session' (priced) | 'approximate' (unpriced) instead of skill_cost's 'request' | 'session'."
  - "Two-CTE split (_PROJECTS_PERCENTILE_SQL + _PROJECTS_TOKEN_SQL) instead of one mega-query. Window-function percentiles + SUM token aggregation in the same CTE would force awkward GROUP BY/window-partition coexistence; the split keeps each query single-purpose and reuses the proven _LATENCY_SQL window pattern verbatim."
  - "Skill registry existence check (404) is layered ON TOP of the regex/'..' check (400), divergent from /skills/{name}/cost which only validates the name shape. The plan's must_have explicitly says 'rejects unknown skills with 404' and the no-empty-rows test asserts it; this is intentional drift from /cost's behaviour."
  - "_seed_session_row gains an optional project_key kwarg (default ''), preserving every existing test caller's behaviour — only the SKLP-08 tests pass an explicit non-empty key. _seed_skill_row is a new helper for the registry-lookup precondition."
  - "test_skill_projects_no_path_leakage is LOAD-BEARING: it doesn't just check field-name absence, it programmatically iterates every value and asserts no string starts with '/' AND no string contains the seeded secret cwd ('/tmp/super/secret/path'). This catches even a hypothetical regression that adds a non-obviously-named field but stuffs a path into it."
  - "7 tests instead of the 5 listed in the plan. Two extra (invalid_range_returns_422 and path_traversal_rejected) were added to mirror the discipline of test_skill_cost_invalid_range_returns_422 and test_skill_runs_path_traversal_rejected — these are the canonical guards every SKIL-* router endpoint ships with, and omitting them in 19-02 would leave a structural hole."

patterns-established:
  - "Pattern A — Per-project endpoint shape: regex+'..' validation (400) -> registry lookup (404) -> two-CTE rollup (percentiles + tokens) -> Python merge -> read-time compute_cost. Reusable for any future per-project skill rollup."
  - "Pattern B — Path-leakage doubly enforced: schema (structural enumeration of allowed fields) + runtime test (programmatic value scan). Going forward, any project-keyed response in cmc.api should ship both."
  - "Pattern C — cost_attribution 'session' | 'approximate' for read-time-priced rollups where request_id correlation is not pursued. Distinct from the existing 'request' | 'session' pair on skill_cost."

# Metrics
duration: 16min
completed: 2026-05-06
---

# Phase 19 Plan 02: Skills Projects Endpoint (SKLP-08) Summary

**Per-project skill rollup endpoint live: `GET /api/skills/{name}/projects` returns `{project_key, count, p50_ms, p95_ms, cost_usd, cost_attribution, low_sample}` per project, structurally guaranteed to leak no filesystem paths.**

## Performance

- **Duration:** ~16 min execution wall-clock (start 11:44:56Z, end 12:00:39Z UTC)
- **Started:** 2026-05-06T11:44:56Z
- **Completed:** 2026-05-06T12:00:39Z
- **Tasks:** 2 (schemas; endpoint + 7 tests)
- **Files modified:** 3 (`backend/cmc/api/schemas/skills.py`, `backend/cmc/api/routes/skills.py`, `backend/tests/test_skills_router.py`)
- **Test additions:** 7 (5 plan-required + 2 mirror-the-existing-discipline guards)

## Accomplishments

- **`SkillProjectRow` + `SkillProjectsResponse` schemas** — `SkillProjectRow` fields are explicitly enumerated (`project_key: str`, `count: int`, `p50_ms: int | None`, `p95_ms: int | None`, `cost_usd: Decimal`, `cost_attribution: Literal["session", "approximate"]`, `low_sample: bool`). NO `cwd`, NO `path`, NO `display_path` — the path-leakage prohibition is structurally enforced by the schema itself. `cost_usd` serializes as a JSON string (Pydantic v2 default Decimal handling).
- **`GET /api/skills/{name}/projects` endpoint** — wired with `_SKILL_NAME_RE` + `..` check (400 on shape violation), skills-registry existence check (404 on unknown skill, consistent with the plan's must_have), `range: SkillRange = Query("14d", alias="range")` (422 on `7d` / `2d` / etc. — `7d` is intentionally reserved for the Plan 19-03 delta CTE).
- **`_PROJECTS_PERCENTILE_SQL`** — window-function CTE adapted directly from `_LATENCY_SQL` with the PARTITION key swapped from `skill_name` to `project_key`. Joins `otel_events` to `sessions` on `session_id`, filters `s.project_key != ''` to drop the legacy/missing-cwd sentinel, and produces `{project_key, count, p50_ms, p95_ms}` rows ordered `count DESC LIMIT 100`.
- **`_PROJECTS_TOKEN_SQL`** — companion query that distinct-counts each session once per project, sums session-scoped token columns, and surfaces a representative model (`MAX(model)`) per project for `compute_cost` lookup. Read-time cost computation preserved (v1.1 invariant — no `$` stored).
- **5 plan-required + 2 bonus tests, all green** —
  1. `test_skill_projects_happy_path` — 2 projects with 2/3 events each; `project_key` values match `compute_project_key(cwd)` for both; cost_usd is JSON string; `cost_attribution=='session'`; `low_sample=True` for both (count < 30).
  2. `test_skill_projects_unknown_skill_404` — regex-valid but unseeded skill returns 404.
  3. `test_skill_projects_no_path_leakage` — **LOAD-BEARING**: programmatic scan of every row's keys AND values. Forbids `cwd`/`path`/`display_path` field names, asserts no string value starts with `/`, asserts the seeded secret cwd (`/tmp/super/secret/path`) does not appear anywhere, asserts the substring `super` from the seeded path leaks nowhere, asserts `project_key` is exactly 12 lowercase hex chars.
  4. `test_skill_projects_low_sample_flag` — 10-event project has `low_sample=True`; 35-event project has `low_sample=False` (boundary at MIN_LATENCY_SAMPLES=30).
  5. `test_skill_projects_excludes_empty_project_key` — legacy session with `project_key=''` AND `cwd=None` does NOT appear in the rollup; only the keyed session's bucket surfaces.
  6. `test_skill_projects_invalid_range_returns_422` — `range=7d` and `range=2d` both return 422 (Pitfall 2 / SkillRange Literal narrowing).
  7. `test_skill_projects_path_traversal_rejected` — `name=has..dotdot` returns 400 (V12 mirror).

## Task Commits

Each task was committed atomically on `main`:

1. **Task 1: Schema additions** — `b6d73a7` (`feat(19-02): add SkillProjectRow + SkillProjectsResponse schemas (SKLP-08)`)
2. **Task 2: Endpoint + 7 tests** — `056141b` (`feat(19-02): add GET /api/skills/{name}/projects endpoint (SKLP-08)`)

## Files Created/Modified

- `backend/cmc/api/schemas/skills.py` *(modified)* — appended `SkillProjectRow` and `SkillProjectsResponse` after `SkillRunsResponse`. No `__all__` to update (the file does not export one). Only `Decimal` and `Literal` imports were already present — no new top-level imports needed.
- `backend/cmc/api/routes/skills.py` *(modified)* — added `SkillProjectRow, SkillProjectsResponse` to the existing schema import block; appended `_PROJECTS_PERCENTILE_SQL`, `_PROJECTS_TOKEN_SQL`, and the `skill_projects` route handler after `skill_latency`. No new top-level imports needed (`load_rates`, `compute_cost`, `Skill`, `select`, `text`, `Query`, `HTTPException`, `Depends`, `AsyncSession` were all already imported for the existing endpoints).
- `backend/tests/test_skills_router.py` *(modified)* — added an optional `project_key: str = ""` kwarg to `_seed_session_row` (preserves existing call sites); added a new `_seed_skill_row` helper for the registry-lookup precondition; appended 7 tests in a clearly-headered `Phase 19 Plan 02: SKLP-08` section.

## Decisions Made

1. **Session-scoped attribution only on per-project endpoint.** Per-project rollups aggregate across many sessions, so the request-scoped JOIN (Path R in `skill_cost`) was not ported. This drives the `cost_attribution: Literal["session", "approximate"]` choice — divergent from `skill_cost`'s `Literal["request", "session"]` pair. Documented in the schema docstring + the route docstring.
2. **Two-CTE split (percentiles + tokens) instead of a single mega-query.** Mixing window functions (PARTITION BY project_key for percentiles) with SUM aggregation (GROUP BY project_key for tokens) in one CTE would force awkward double-aggregation. The split is single-purpose per query and reuses `_LATENCY_SQL`'s proven window pattern verbatim. Python merges the two row-sets keyed by `project_key`.
3. **Skill registry existence check returns 404 (drift from `/skills/{name}/cost`).** The plan's must_have explicitly says "rejects unknown skills with 404" and the test asserts `status_code == 404`. `/cost` does not check the registry — that's a pre-existing inconsistency in the codebase, not something this plan must fix. New endpoint, new (better) discipline.
4. **`test_skill_projects_no_path_leakage` is the load-bearing structural guard.** It does FOUR things: (a) field-name absence check (`cwd`, `path`, `display_path`), (b) string-value `/`-prefix check, (c) seeded-secret-cwd substring check, (d) seeded-cwd-segment (`super`) substring check. (d) is over-the-top defensively — the 12-char hex `project_key` cannot produce `super` by construction — but it catches a hypothetical regression that smuggles a path into a non-obviously-named field.
5. **7 tests vs. the 5 listed in the plan.** The two bonus tests (`invalid_range_returns_422`, `path_traversal_rejected`) mirror the existing discipline shipped with every other SKIL-* router endpoint (`test_skill_cost_invalid_range_returns_422`, `test_skill_runs_path_traversal_rejected`, etc.). Omitting them would leave structural holes that a future verifier might flag. Pure-edge-case tests run in milliseconds — no deviation cost.
6. **`_seed_session_row` extension is backward-compatible.** Default `project_key=""` preserves every existing test caller's behaviour. Only the SKLP-08 tests pass non-empty values, computed via `cmc.core.compute_project_key(cwd)` so the test mirrors the production scheduler/repository wiring.

## Deviations from Plan

None - plan executed exactly as written.

The 7-vs-5 test count is "adding tests around the spec," not "deviating from it." Each extra test pins an invariant the original 5 didn't (range narrowing — SkillRange Literal exists, must be exercised; path traversal — `_SKILL_NAME_RE`+`..` check exists, must be exercised). Both invariants were called out in the plan's must_haves but not given dedicated tests; landing them now is cheaper than backfilling later.

The plan's example endpoint code in Task 2's `<action>` used **kwarg** invocation of `compute_cost(model=..., input_tokens=..., ...)`. The actual `compute_cost` signature uses **positional** args without the `_tokens` suffix — see `backend/cmc/pricing.py:56-64`. The plan's instruction explicitly said to "READ skills.py:746-797" to confirm the exact invocation pattern, and the implementation mirrors `skill_cost`'s positional-args call at `skills.py:697-705`. This is following the plan's resolution rule, not deviating from it.

No Rule 1/2/3 auto-fixes triggered. No architectural Rule 4 prompts.

## Issues Encountered

None. All verify gates green on first execution:

- `tests/test_skills_router.py -k "projects"`: 7 passed in 1.09s.
- `tests/test_skills_router.py` (full): 40 passed in 4.90s (33 pre-existing + 7 new).
- `pytest --tb=no` (full backend): **586 passed, 0 failed, 32 warnings** in 178.42s.
- `git grep` for `datetime.utcnow` in plan-touched files: 0 matches (POLI-06 ban honored).
- `ruff check`: All checks passed.
- Per-commit `pyright` + `ruff` pre-commit hooks: passed for both Task 1 and Task 2.

## Verifier Snapshot vs Phase 18 BASELINE.md

| Suite | Baseline (Phase 18) | Plan 19-01 | This plan (19-02) | Delta vs baseline | Verdict |
|-------|---------------------|------------|-------------------|-------------------|---------|
| Backend pytest passed | 566 | 579 | **586** | +20 | pass (`>= 566`) |
| Backend pytest failed | 0 | 0 | **0** | 0 | pass (`> 0` → fail) |
| Backend pytest warnings (`datetime.utcnow`) | 0 | 0 | **0** | 0 | pass (`> 0` → fail) |
| Backend pytest total warnings | 32 | 32 | **32** | 0 | pass (warn at `> 132`) |
| ruff check (touched files) | clean | clean | **clean** | — | pass |

All Phase 18 BASELINE.md verifier rules continue to pass. POLI-06 ban honored in every new file.

## User Setup Required

None — no external service configuration required. The endpoint is live as soon as the backend restarts; consumers (Plan 19-04 frontend) can begin wiring against it immediately.

## Next Phase Readiness

- **`GET /api/skills/{name}/projects` ships.** ROADMAP success criterion #1 satisfied on the backend side: response shape carries `project_key` only, no filesystem paths leak, structurally enforced AND runtime-asserted.
- **Plan 19-03 unblocked.** The deltas/badges plan extends existing skill endpoints with prev-period CTE comparisons; it does NOT touch the new `/projects` endpoint, so Plan 19-02 and Plan 19-03 stay file-disjoint as the wave-2 split intended.
- **Plan 19-04 (frontend) can now wire `SkillProjectsTable.tsx`** against the endpoint. Schema fields are stable (the explicit no-cwd/no-path/no-display_path enumeration is locked); the frontend's TypeScript type can be hand-mirrored from `SkillProjectRow` without surprise additions.
- **`_PROJECTS_PERCENTILE_SQL` + `_PROJECTS_TOKEN_SQL` patterns** are reusable for any future per-project skill rollup (e.g. Plan 22's per-project tools breakdown if SKLP-11 lands). The two-CTE split + Python merge keyed by project_key is the canonical idiom going forward.

## Self-Check: PASSED

- `backend/cmc/api/schemas/skills.py` — `SkillProjectRow` + `SkillProjectsResponse` classes — FOUND (verified by `grep -n "class SkillProjectRow\|class SkillProjectsResponse"`).
- `backend/cmc/api/routes/skills.py` — `@router.get("/skills/{name}/projects"` registration — FOUND (verified by `grep -n` at `skills.py:899`).
- `backend/cmc/api/routes/skills.py` — `from cmc.api.schemas.skills import ... SkillProjectRow, SkillProjectsResponse` — FOUND.
- `backend/tests/test_skills_router.py` — 5 plan-required tests + 2 bonus = 7 — FOUND (`test_skill_projects_happy_path`, `test_skill_projects_unknown_skill_404`, `test_skill_projects_no_path_leakage`, `test_skill_projects_low_sample_flag`, `test_skill_projects_excludes_empty_project_key`, `test_skill_projects_invalid_range_returns_422`, `test_skill_projects_path_traversal_rejected`).
- Commit `b6d73a7` (Task 1: schemas) — FOUND in `git log`.
- Commit `056141b` (Task 2: endpoint + tests) — FOUND in `git log`.
- Full backend pytest: 586 passed / 0 failed / 32 warnings / 0 datetime.utcnow — FOUND.
- `git grep -nE 'datetime\.utcnow' -- backend/cmc/api/routes/skills.py backend/cmc/api/schemas/skills.py backend/tests/test_skills_router.py` — 0 matches — FOUND (POLI-06 ban honored).

---
*Phase: 19-skills-per-project-deltas-badges*
*Completed: 2026-05-06*
