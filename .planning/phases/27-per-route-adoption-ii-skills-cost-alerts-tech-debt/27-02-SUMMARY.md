---
phase: 27-per-route-adoption-ii-skills-cost-alerts-tech-debt
plan: 02
subsystem: api
tags: [fastapi, pydantic, sqlmodel, sessions, compare, project-key, tdbt-01]

# Dependency graph
requires:
  - phase: 19-skills-routing-and-otel
    provides: "sessions.project_key column (sha1[:12] of realpath(cwd.rstrip('/'))) + cmc.core.project_key.compute_project_key helper + migration 0003 backfill"
  - phase: 16-sessions-compare-foundation
    provides: "SessionCompareSide schema + _build_compare_side handler + /api/sessions/compare endpoint"
provides:
  - "SessionListItem.project_key: str (additive required field) on GET /api/sessions response items"
  - "SessionCompareSide.project_key: str (additive required field) on GET /api/sessions/compare both sides"
  - "3 round-trip pytest cases locking the wire-shape promise (test_list_sessions_includes_project_key, test_compare_sessions_includes_project_key, test_project_key_matches_compute_helper)"
affects:
  - 27-03-compare-picker-frontend-half
  - 27-09-close-gate

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive wire-shape expansion — required str field on response schema, no migration, no behavior change beyond field presence"
    - "ORMBase auto-mapping vs BaseModel explicit-population — SessionListItem (ORMBase) auto-maps the new column; SessionCompareSide (BaseModel) requires handler patch"
    - "Round-trip wire-vs-canonical cross-check — third test recomputes compute_project_key(cwd) from the response and asserts equality, catching any future stale-column or wrong-hash divergence"

key-files:
  created: []
  modified:
    - "backend/cmc/api/schemas/sessions.py — SessionListItem.project_key + SessionCompareSide.project_key (additive str fields)"
    - "backend/cmc/api/routes/sessions.py — _build_compare_side populates project_key=sess.project_key"
    - "backend/tests/test_sessions_router.py — 3 round-trip TDBT-01 pytest cases appended"

key-decisions:
  - "Required str (NOT str | None) — DB column has default='' / server_default='' and Phase 19 migration 0003 backfilled all historical rows, so non-null is invariant"
  - "ORMBase auto-mapping for SessionListItem means the LIST + DETAIL endpoints required no handler patch — model_validate(r) pulls the new column transparently"
  - "Explicit field population in _build_compare_side (NOT model_validate) — SessionCompareSide is BaseModel because it composes a Session ORM row + computed cost + skills + tool_counts; switching it to ORMBase would be a wider refactor and pulls in unwanted auto-mapping for the Decimal cost field"
  - "Cross-check test recomputes compute_project_key(response.cwd) and asserts equality with response.project_key — defends against future regressions where someone reads from a stale column, applies wrong truncation length, or accidentally normalizes the cwd differently"

patterns-established:
  - "When a backend schema field MUST be on the wire for frontend consumers but the source is already a DB column, prefer ORMBase + model_validate (auto-map) over BaseModel + explicit field-by-field construction"
  - "For BaseModel response shapes that compose multiple sources, the test suite MUST include a guard that constructs the schema-equivalent payload to fail loudly if a field is silently dropped from the handler"

# Metrics
duration: 6 min
completed: 2026-05-15
---

# Phase 27 Plan 02: project_key on /sessions list + /sessions/compare Summary

**Authoritative `project_key: str` (sha1[:12] of realpath(cwd)) surfaced as additive required field on `GET /api/sessions` and `GET /api/sessions/compare` — backend half of TDBT-01 unblocking Plan 27-03's ComparePicker switch from cwd-string-equality to canonical project-equality.**

## Performance

- **Duration:** ~6 min (excluding 4 min full-suite pytest run-time)
- **Started:** 2026-05-15T19:39:00Z (approx — plan agent spawn)
- **Completed:** 2026-05-15T19:46:00Z
- **Tasks:** 2 (both `type="auto"`)
- **Files created:** 0
- **Files modified:** 3 (2 source + 1 test)
- **LOC added:** 161 (16 source + 145 test)

## Accomplishments

- Added `project_key: str` (required, additive) to `SessionListItem` — ORMBase auto-mapping pulls the new field from the existing `Session.project_key` DB column with zero handler change. Both `GET /api/sessions` (list) and `GET /api/sessions/{id}` (detail, which embeds SessionListItem) emit the field automatically.
- Added `project_key: str` (required, additive) to `SessionCompareSide` + patched `_build_compare_side` to populate `project_key=sess.project_key` (BaseModel, no auto-map). `GET /api/sessions/compare?a={sid}&b={sid}` now emits `a.project_key` + `b.project_key`.
- Shipped 3 round-trip pytest cases locking the wire-shape promise:
  - `test_list_sessions_includes_project_key` — seeds one row with cwd `/Users/test/proj` and asserts the LIST response includes `project_key == compute_project_key(cwd)` and is a 12-char lowercase hex.
  - `test_compare_sessions_includes_project_key` — seeds two rows with distinct cwds and asserts both `a.project_key` + `b.project_key` are present and hex-shaped.
  - `test_project_key_matches_compute_helper` — belt-and-suspenders: recomputes `compute_project_key(item.cwd)` for every response item and asserts equality with `item.project_key`, catching any future stale-column / wrong-hash regression.
- Backend pytest **686 → 689 with zero regressions** (full suite). Pre-commit hooks (pyright + ruff) clean on both commits.
- Live smoke check against the dev server on `:8001` confirmed both endpoints return 12-char hex `project_key` matching real production sessions.

## Task Commits

1. **Task 1: Add project_key to SessionListItem + SessionCompareSide schemas + audit handler population** — `f1ad119` (feat)
2. **Task 2: Add pytest round-trip cases asserting project_key present in both endpoints** — `81b4c43` (test)

_Each task committed atomically per execute-plan convention. Task 1 ships schema + handler in one commit because the SessionCompareSide field addition is non-functional without the corresponding handler patch (Pydantic would raise `ValidationError: project_key Field required` on every compare call)._

## Files Modified

- `backend/cmc/api/schemas/sessions.py` (+12 LOC) — `SessionListItem.project_key: str` (line 27-34) + `SessionCompareSide.project_key: str` (line 145-148). Both carry a Phase 27 TDBT-01 comment block explaining the sha1[:12] derivation and the ORMBase-vs-BaseModel distinction.
- `backend/cmc/api/routes/sessions.py` (+4 LOC) — `_build_compare_side` populates `project_key=sess.project_key` between `cwd=` and `model=` keyword args (line 239-244). Three-line comment cites the symlink/realpath divergence motivation.
- `backend/tests/test_sessions_router.py` (+145 LOC) — three new `@pytest.mark.asyncio` cases appended after `test_previous_session_empty_project_key_returns_404_no_previous_session`. Pattern mirrors the existing CMPR-07 idiom: `make_session_row(...) | {"project_key": pk}` because the conftest factory predates the Phase 19 project_key column.

## Verifications

| Check | Command | Result |
|-------|---------|--------|
| Module-level field check | `cd backend && uv run python -c "from cmc.api.schemas.sessions import SessionListItem, SessionCompareSide; assert 'project_key' in SessionListItem.model_fields; assert 'project_key' in SessionCompareSide.model_fields; print('OK')"` | **OK** |
| Sessions router tests | `cd backend && uv run pytest tests/test_sessions_router.py -x` | **43 passed** (40 baseline + 3 new) |
| Full backend pytest | `cd backend && uv run pytest` | **689 passed, 32 warnings in 214.28s** (686 → 689, zero regressions) |
| Live smoke — list | `curl 'http://localhost:8001/api/sessions?limit=2'` | `project_key:"9719f89c22b4"` and `"63c04f774647"` (matches compute helper) |
| Live smoke — compare | `curl 'http://localhost:8001/api/sessions/compare?a=...&b=...'` | `a.project_key="9719f89c22b4"`, `b.project_key="63c04f774647"` |
| Pre-commit pyright | (auto on commit) | **Passed** for both commits |
| Pre-commit ruff | (auto on commit) | **Passed** for both commits |

## Decisions Made

1. **Required `str` (not `str | None`)** — the DB column is non-nullable with `default=""` and `server_default=""`; Phase 19 migration 0003 backfilled all historical rows. Empty string means "session has no cwd recorded" (a valid sentinel), not "field missing". The schema field is `project_key: str` to preserve this invariant on the wire.
2. **No LIST handler change** — `SessionListItem` inherits from `ORMBase` (Pydantic `from_attributes=True`); the existing `SessionListItem.model_validate(r) for r in rows` flow at line 300 auto-maps the new field. The DETAIL handler at line 465 uses the same pattern. Audit-grep confirmed zero field-by-field constructions of `SessionListItem` in `routes/sessions.py`.
3. **Compare handler patch (BaseModel)** — `SessionCompareSide` is intentionally `BaseModel`, not `ORMBase`, because the handler composes a Session ORM row + computed `cost_usd: Decimal` (Phase 13 wire-shape lock — Pydantic v2 emits Decimal as JSON string) + skills list (read-time SQL) + tool_counts dict (read-time SQL or `{}` on over-cap). Switching it to ORMBase would pull in auto-mapping for the Decimal cost field which violates that lock. Explicit `project_key=sess.project_key` in `_build_compare_side` is the right surface change.
4. **Belt-and-suspenders cross-check test** — `test_project_key_matches_compute_helper` recomputes `compute_project_key(item.cwd)` from the response and asserts equality with `item.project_key`. This catches future regressions where someone might:
   - Read from a stale or deprecated column,
   - Apply wrong hash truncation length (e.g. `[:13]`),
   - Accidentally normalize cwd differently (e.g. forget `.rstrip('/')` or skip `realpath`).
   The cost is a 5-line test; the upside is the canonical-identity invariant becomes structurally locked.
5. **Test pattern: `make_session_row(...) | {"project_key": pk}`** — mirrors the existing CMPR-07 test idiom at lines 1023-1197 because the conftest factory predates the Phase 19 column. Did NOT extend `make_session_row` itself — it's a shared cross-file helper and changing its signature would require auditing all call sites across `test_cost_router.py`, `test_skills_router.py`, etc. for behavior shifts (some tests deliberately want `project_key=""`).

## Deviations from Plan

None — plan executed exactly as written.

The plan's example test code referenced fixtures named `sample_session` and `sample_session_pair` that don't exist in `tests/conftest.py`. The plan's own guidance correctly noted "If fixtures `sample_session` / `sample_session_pair` don't exist in the test file, mirror the pattern already used by the surrounding tests" — which is the inline `_seed(client, [(SessionModel, make_session_row(...) | {"project_key": pk})])` pattern from the CMPR-07 tests at lines 1023-1197. Following the plan's explicit fallback guidance is not a deviation.

The plan also referenced `lines 19-35 (SessionListItem) and lines 123-159 (SessionCompareSide)` — the actual lines were 19-34 and 123-159 (off-by-one on SessionListItem). Used line-context anchoring instead of exact line numbers per the file's current state; this is normal Read-then-Edit hygiene, not a deviation.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

**Plan 27-02 ships clean. Backend half of TDBT-01 complete. Unblocks Plan 27-03:**

- Plan **27-03** (frontend half) can now switch `ComparePicker.tsx` filter from `candidates.filter(c => c.cwd === scopeCwd)` to `candidates.filter(c => c.project_key === scopeProjectKey)`. The wire-shape promise is locked by `test_compare_sessions_includes_project_key` — if a future refactor accidentally drops `project_key` from `_build_compare_side`, that test fails before reaching production.
- Plan **27-09** (close gate) will re-run the full backend pytest suite + Playwright + Lighthouse + axe; the 686 → 689 delta is preserved in the close-gate baselines.

**Parallel-safety honored:** Plan 27-01 (running concurrently in sibling agent) touched only frontend TypeScript files (`frontend/src/lib/time/useRouteRangeVocab.ts` + `__tests__/useRouteRangeVocab.test.ts`); this plan touched only backend Python files. Pre-commit hooks confirmed zero overlap — frontend tsc + lint hooks reported "no files to check" for both commits in this plan.

**Phase 27 SC mapping:** This plan satisfies the **BACKEND HALF of SC#3** ("compare picker uses authoritative project_key instead of cwd-as-proxy"). Frontend ComparePicker switch is the Plan 27-03 deliverable. End-to-end SC#3 verification is downstream in Plan 27-09.

**REQ-ID coverage:** TDBT-01 backend half complete (frontend half = Plan 27-03).

## Self-Check: PASSED

- `[ -f backend/cmc/api/schemas/sessions.py ]` → FOUND (modified +12 LOC)
- `[ -f backend/cmc/api/routes/sessions.py ]` → FOUND (modified +4 LOC)
- `[ -f backend/tests/test_sessions_router.py ]` → FOUND (modified +145 LOC)
- `git log --oneline --all | grep f1ad119` → FOUND (`feat(27-02): expose project_key on /sessions list + /sessions/compare responses`)
- `git log --oneline --all | grep 81b4c43` → FOUND (`test(27-02): round-trip pytest for project_key on /sessions list + compare`)
- Pytest count delta: 686 → 689 (+3 as predicted)
- Live smoke check: `curl http://localhost:8001/api/sessions?limit=2` returns `project_key` field as 12-char hex on every row

---
*Phase: 27-per-route-adoption-ii-skills-cost-alerts-tech-debt*
*Completed: 2026-05-15*
