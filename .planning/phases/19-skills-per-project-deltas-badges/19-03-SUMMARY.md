---
phase: 19-skills-per-project-deltas-badges
plan: 03
subsystem: backend-api
tags: [fastapi, sqlite, sqlalchemy, deltas, badges, dst-safety, sklp-09, sklp-10, decimal-arithmetic]

# Dependency graph
requires:
  - phase: 19-skills-per-project-deltas-badges
    plan: 01
    provides: "sessions.project_key + cmc.core.compute_project_key (commits 53fe578 + 95bd1df) — not directly consumed here, but the lifetime MIN/MAX-of-ts CTE shape is reusable"
  - phase: 19-skills-per-project-deltas-badges
    plan: 02
    provides: "/api/skills/{name}/projects endpoint + path-leakage discipline (commits b6d73a7 + 056141b) — sequenced so Plan 19-02 and 19-03 stay file-disjoint with each other"
  - phase: 13-cost-and-skills-foundation
    provides: "cmc.pricing.compute_cost (read-time Decimal cost) + load_rates"
  - phase: 14-skills-detail-and-firehose
    provides: "_USAGE_TOP_SQL top-N + sparkline rollup pattern; _COST_REQUEST_SCOPED_SQL / _COST_SESSION_SCOPED_SQL dual-path attribution"
  - phase: 18-polish-carry-forward-cleanup
    provides: "cmc.core.time.now_utc (POLI-06 source-of-truth) + BASELINE.md verifier rules"
provides:
  - "DeltaPill schema (curr/prev/delta/delta_pct/direction) — server-computed period-over-period delta primitive (SKLP-09)"
  - "SkillUsageRow.usage_delta + SkillUsageRow.badges fields — wired in /api/skills/usage response"
  - "SkillCostResponse.cost_delta field — wired in /api/skills/{name}/cost response"
  - "_DELTA_WINDOW_DAYS / _BADGE_NEW_DAYS / _BADGE_DORMANT_DAYS / _BADGE_COLDSTART_DAYS module constants — single source of truth for the 7d/7d/30d/14d thresholds"
  - "_build_delta_pill helper (Decimal/int polymorphic; delta_pct=None when prev=0)"
  - "_derive_badges helper with cold-start suppression (skills <14d old never get 'dormant')"
  - "_USAGE_DELTA_BADGE_SQL_PORTABLE: companion CTE returning curr/prev counts + lifetime MIN/MAX(ts) per skill, range-INDEPENDENT and DST-safe (datetime('now', '-N days'), never 'localtime')"
  - "_COST_DELTA_CURR_REQUEST_SQL / _COST_DELTA_PREV_REQUEST_SQL / _COST_DELTA_CURR_SESSION_SQL / _COST_DELTA_PREV_SESSION_SQL — dual-path 7d-vs-prev-7d cost windows mirroring the existing attribution choice"
  - "_compute_cost_delta helper — runs the matching curr/prev SQL pair against the chosen attribution path so cost_delta is internally consistent with cost_usd"
  - "12 new tests covering delta math, badge boundaries, cold-start suppression, DST spring-forward (LOAD-BEARING for ROADMAP success criterion #5), cost_delta on growth + empty cases, default-pill-on-no-prev-activity"
affects: [19-04-frontend-deltas-projects-badges]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DeltaPill primitive (curr/prev/delta/delta_pct/direction) reused across both invocation counts and Decimal cost. Pydantic v2 Decimal-as-JSON-string default keeps the same serializer working for both money and integers."
    - "delta_pct=None invariant when prev=0 — server's job to decide '—' vs '+inf%' (RESEARCH §Pattern 3, server is source of truth, frontend never re-derives)."
    - "Companion lifetime MIN/MAX-of-ts SQL runs alongside the range-bounded primary rollup. The badge CTE is range-INDEPENDENT — first_at/last_at are lifetime properties, NOT window-relative — so the same query feeds both 14d and 30d UI ranges."
    - "Three-CTE pattern (curr / prev / activations) merged via UNION-of-skills + LEFT JOIN — works on SQLite < 3.39 which lacks FULL OUTER JOIN. Documented as `_USAGE_DELTA_BADGE_SQL` (FULL OUTER reference) + `_USAGE_DELTA_BADGE_SQL_PORTABLE` (the variant we actually run)."
    - "Cost delta runs four dedicated SQL fragments (curr/prev × request/session) with LITERAL window bounds (datetime('now', '-7 days'), '-14 days'), not parameterized. The 7d delta horizon is a structural property of the SQL, not a caller decision — Pitfall 2 enforced at the SQL level so the user-facing 14d/30d range toggle CANNOT bind to it."
    - "Python-side badge classification with cold-start suppression. Pure-function helper takes naive UTC datetimes from the SQL CTE outputs, so DST safety reduces to (a) UTC-anchored SQL inputs (verified by the grep guard) and (b) Python timedelta arithmetic (DST-immune by construction)."
    - "Adversarial mutation as a verifier: temporarily inject 'localtime' into one window, verify the DST test goes RED, restore. Proves the structural guard is load-bearing rather than tautological."
    - "Module constants (_DELTA_WINDOW_DAYS, _BADGE_*_DAYS) defined ONCE near the top of the file. The plan's truth contract demanded a single source of truth — verified by the grep `_DELTA_WINDOW_DAYS|_BADGE_(NEW|DORMANT|COLDSTART)_DAYS` count being identical across the file."

key-files:
  created: []
  modified:
    - backend/cmc/api/schemas/skills.py
    - backend/cmc/api/routes/skills.py
    - backend/tests/test_skills_router.py

key-decisions:
  - "Python-side badge classification (not pure SQL CASE WHEN). The plan offered both as acceptable; Python form chosen for readability + easier unit-testability of the cold-start gate. The structural DST safety guarantee shifts from 'SQL never uses localtime modifier' (still true) to 'Python helper takes UTC inputs from SQL and computes via timedelta' (DST-immune by construction). Documented in _derive_badges docstring."
  - "_USAGE_DELTA_BADGE_SQL_PORTABLE uses skills_seen UNION + LEFT JOIN trio, not FULL OUTER JOIN. SQLite < 3.39 lacks FULL OUTER; the portable form gives the same result and ships everywhere. The FULL OUTER form is preserved in source as documentation only."
  - "Cost delta uses four NEW dedicated SQL fragments with literal datetime('now', '-7 days') / '-14 days' bounds. Could have parameterized the existing _COST_*_SCOPED_SQL — adds upper-bound :until — but that risked Pitfall 2 (caller binds ?range= to the delta windows). Hardcoding the windows in the SQL itself is the structural guard."
  - "cost_delta is emitted on the EMPTY-CASE branch of skill_cost (no events in window). Pill shape: curr=0/prev=0/delta=0/delta_pct=None/direction='flat'. Frontend never has to special-case 'no delta in this response' — the field is always present."
  - "_compute_cost_delta runs against load_rates() once per call. Could have memoized rates between the main attribution path and the delta path; not done because compute_cost is read-time and load_rates() is already memoized at the module level (cmc.pricing maintains a per-process rate cache). The extra await load_rates(db) call is a no-op on the second invocation."
  - "DST spring-forward test combines TWO orthogonal assertions: (1) Python helper correctness on synthetic UTC timestamps that straddle US 2026-03-08; (2) structural grep guard that the route source NEVER contains 'datetime('now', '-N days', 'localtime')' on any 7d/14d window. Either alone is insufficient: helper alone doesn't catch a regression that swaps SQL to localtime and corrupts the inputs; grep alone doesn't catch a regression that drops timezone info from the helper. Both together are the load-bearing structural guard for ROADMAP success criterion #5."
  - "The 30d window literal does NOT appear in the route SQL — the dormant threshold is enforced in Python against MIN/MAX(ts) lifted out of SQL. The DST test's positive-presence assertion was scoped to '-7 days' and '-14 days' (which DO appear, as delta CTE bounds); the '-30 days' Python check is covered by the helper's pinned UTC arithmetic."
  - "12 tests vs the 9+ specified in the plan. Two extras: test_usage_delta_down_when_decline (locks the negative delta_pct branch, mirroring up/zero/flat coverage) and test_usage_delta_default_when_no_activity (asserts the pill is ALWAYS present even for skills with curr-only activity — no implicit None / missing-field regression)."

patterns-established:
  - "Pattern A — DeltaPill primitive: server computes curr/prev/delta/delta_pct/direction; delta_pct=None when prev=0; direction is the rendered arrow ('up'/'down'/'flat'). Reusable for ANY future period-over-period server response in cmc.api (cost forecasts, alert frequencies, etc.)."
  - "Pattern B — UTC-arithmetic-only badge SQL: hardcoded datetime('now', '-N days') with NO 'localtime' modifier; structural grep guard in tests asserts source-side absence; Python helper takes UTC datetimes and uses timedelta arithmetic. Going forward, any time-windowed badge or threshold rule in cmc.api should follow this pattern."
  - "Pattern C — Companion lifetime CTE alongside range-bounded primary rollup: when a response needs BOTH range-bounded numbers (last 14d activations for sparkline) AND lifetime properties (first/last activation for badges), run the lifetime CTE as a separate query and merge keyed by skill_name. Avoids the temptation to widen the primary range to 'lifetime' just for badge inputs."
  - "Pattern D — Adversarial mutation as DST verifier: insert 'localtime' into source SQL, run the DST test, confirm it goes RED, restore. Confirms the structural guard is load-bearing rather than vacuously satisfied. Documented as a CI-ready recipe in the plan's verify gate."

# Metrics
duration: 23min
completed: 2026-05-06
---

# Phase 19 Plan 03: Skills Deltas and Badges (SKLP-09/10) Summary

**7d-vs-prev-7d delta pills + new/dormant badges live on /api/skills/usage and /api/skills/{name}/cost; DST spring-forward correctness load-bearingly tested via UTC-only SQL + Python helper + adversarial-mutation grep guard.**

## Performance

- **Duration:** ~23 min execution wall-clock (start 12:06:20Z, end 12:29:13Z UTC)
- **Started:** 2026-05-06T12:06:20Z
- **Completed:** 2026-05-06T12:29:13Z
- **Tasks:** 3 (schema; handlers; tests)
- **Files modified:** 3 (`backend/cmc/api/schemas/skills.py`, `backend/cmc/api/routes/skills.py`, `backend/tests/test_skills_router.py`)
- **Test additions:** 12 (10 plan-required + 2 mirror-discipline guards)

## Accomplishments

- **`DeltaPill` schema** — `curr: Decimal`, `prev: Decimal`, `delta: Decimal`, `delta_pct: float | None`, `direction: Literal["up", "down", "flat"]`. Pydantic v2 Decimal-as-JSON-string serialization preserved (no jsonable_encoder coercion). `delta_pct=None` is the canonical "prev was zero, no rate of change defined" marker.
- **`SkillUsageRow` extended** — `usage_delta: DeltaPill` (always emitted, range-INDEPENDENT 7d-vs-prev-7d) + `badges: list[Literal["new_this_week", "dormant"]] = Field(default_factory=list)`.
- **`SkillCostResponse` extended** — `cost_delta: DeltaPill` emitted on every response, including the empty-case branch (skill with no events still gets a flat-zero pill — no special UI casing).
- **Module constants** — `_DELTA_WINDOW_DAYS = 7`, `_BADGE_NEW_DAYS = 7`, `_BADGE_DORMANT_DAYS = 30`, `_BADGE_COLDSTART_DAYS = 14`. Single source of truth; no magic 7s scattered through SQL.
- **`_build_delta_pill(curr, prev) -> DeltaPill`** — Decimal/int-polymorphic (str-coerce path); enforces `delta_pct=None when prev==0`; emits `direction` as Literal["up", "down", "flat"]. RESEARCH §Pattern 3: server is source of truth for sign + magnitude.
- **`_derive_badges(first_at, last_at, days_since_first, now) -> list[...]`** — Python-side classification with cold-start suppression. UTC-anchored throughout (sourced via `cmc.core.time.now_utc()`); DST-immune by construction.
- **`_USAGE_DELTA_BADGE_SQL_PORTABLE`** — three-CTE companion query (curr / prev / activations) UNION-keyed by skill_name + LEFT JOIN trio. Returns `{skill_name, curr_count, prev_count, first_at, last_at, days_since_first}` per skill. Range-INDEPENDENT: lifetime MIN/MAX(ts) feeds badge classification regardless of the user's 14d/30d range toggle.
- **Four cost-delta SQL fragments** — `_COST_DELTA_CURR_REQUEST_SQL`, `_COST_DELTA_PREV_REQUEST_SQL`, `_COST_DELTA_CURR_SESSION_SQL`, `_COST_DELTA_PREV_SESSION_SQL`. Each mirrors the dual-path attribution (Path R / Path S) of the existing top-line cost SQL but with LITERAL window bounds (`datetime('now', '-7 days')` / `'-14 days'`). The 7d delta horizon is a structural SQL property, NOT a caller decision (Pitfall 2 — `?range=` cannot bind to it).
- **`_compute_cost_delta` async helper** — runs the matching curr/prev SQL pair against the chosen attribution branch (request OR session, mirroring the top-line decision); computes Decimal cost via `cmc.pricing.compute_cost` for both windows; returns a DeltaPill. Internally consistent with the response's `cost_attribution` literal.
- **12 new tests, all green** —
  1. `test_usage_delta_basic_positive_growth` — curr=10, prev=5 → direction='up', delta_pct=1.0.
  2. `test_usage_delta_zero_prev_returns_null_pct` — curr=5, prev=0 → delta_pct=None, direction='up'.
  3. `test_usage_delta_flat_when_no_change` — curr=3, prev=3 → direction='flat', delta_pct=0.0.
  4. `test_usage_delta_down_when_decline` — curr=2, prev=5 → direction='down', delta_pct=-0.6.
  5. `test_new_this_week_badge_within_7_days` — first activation 3d ago → 'new_this_week'.
  6. `test_no_new_badge_after_8_days` — first activation 8d ago → 'new_this_week' suppressed.
  7. `test_dormant_badge_after_30_days` — direct `_derive_badges` test (lifetime first=-60d, last=-31d, days_since_first=60) → 'dormant'.
  8. `test_no_dormant_badge_when_skill_under_14_days_old` — synthetic days_since_first=5 + last=-31d → 'dormant' suppressed (cold-start gate); 'new_this_week' fires.
  9. `test_dormant_badge_dst_spring_forward` — **LOAD-BEARING for ROADMAP success criterion #5**. Synthetic UTC timestamps straddling US 2026-03-08 spring-forward (last=2026-02-06T02:30Z, now=2026-03-09T02:00Z) confirm Python helper produces 'dormant' at exactly 30d UTC delta. Combined with structural grep guard asserting route source contains NO `'localtime'` modifier on any 7d/14d/30d window. Adversarial mutation (replace `'now', '-7 days'` with `'now', '-7 days', 'localtime'` via in-place sed) was verified to flip the test RED, then restored to GREEN.
  10. `test_cost_delta_basic` — 1M tokens in curr 7d, 0 in prev → cost_delta.curr='5', prev=0, direction='up', delta_pct=None.
  11. `test_cost_delta_emitted_on_empty_response` — skill with NO events → flat-zero pill on response.
  12. `test_usage_delta_default_when_no_activity` — single-event skill → curr=1, prev=0, direction='up', pill always present (defensive: ensures the field is never missing or None).
- **Existing test updated** — `test_skills_router_schemas_importable` now constructs the required `cost_delta` field on its `SkillCostResponse` example. Decimal-as-JSON-string regression check preserved + new DeltaPill round-trip serialization assertion added.

## Task Commits

Each task was committed atomically on `main`:

1. **Task 1: DeltaPill schema + SkillUsageRow/SkillCostResponse extensions** — `ee662cb` (`feat(19-03): add DeltaPill schema + extend SkillUsageRow/SkillCostResponse (SKLP-09/10)`)
2. **Task 2: Wire delta CTE + badge derivation into handlers** — `ea0d1cb` (`feat(19-03): wire delta CTE + badge derivation into skills_usage and skill_cost (SKLP-09/10)`)
3. **Task 3: Delta + badge + DST spring-forward tests** — `68aeb5c` (`test(19-03): add SKLP-09/10 delta + badge + DST spring-forward tests`)

## Files Created/Modified

- `backend/cmc/api/schemas/skills.py` *(modified)* — appended `DeltaPill` after the `SkillRange` alias; extended `SkillUsageRow` with `usage_delta` (required) + `badges` (default `[]`); extended `SkillCostResponse` with `cost_delta` (required). Added `Field` to existing pydantic import.
- `backend/cmc/api/routes/skills.py` *(modified)* — added `Literal` to typing imports; added `DeltaPill` to schemas import; added `cmc.core.time.now_utc` import. Added module constants `_DELTA_WINDOW_DAYS`/`_BADGE_*_DAYS`. Added helpers `_build_delta_pill`, `_coerce_db_datetime`, `_derive_badges`, `_compute_cost_delta`. Added SQL fragments `_USAGE_DELTA_BADGE_SQL` (FULL OUTER reference, doc-only) + `_USAGE_DELTA_BADGE_SQL_PORTABLE` (the running variant) + `_COST_DELTA_CURR_REQUEST_SQL` + `_COST_DELTA_PREV_REQUEST_SQL` + `_COST_DELTA_CURR_SESSION_SQL` + `_COST_DELTA_PREV_SESSION_SQL`. Rewrote `skills_usage` to merge in delta+badges per row. Extended `skill_cost` to compute and emit `cost_delta` on both empty-case AND populated branches.
- `backend/tests/test_skills_router.py` *(modified)* — extended `test_skills_router_schemas_importable` to construct `cost_delta` (Plan 19-03 made it required) plus a new DeltaPill round-trip assertion. Appended a "Phase 19 Plan 03: SKLP-09 + SKLP-10" header block with 12 tests covering delta math, badge boundaries, cold-start suppression, DST spring-forward (LOAD-BEARING), and cost_delta on growth + empty cases.

## Decisions Made

1. **Python-side badge classification (over pure SQL CASE WHEN).** The plan offered both as acceptable; Python won on readability + unit-testability of the cold-start gate. The DST safety property still holds: SQL emits UTC-clean MIN/MAX(ts) (verified by grep guard) and Python does timedelta arithmetic (DST-immune by construction).
2. **Portable three-CTE pattern (skills_seen UNION + LEFT JOIN trio) instead of FULL OUTER JOIN.** SQLite < 3.39 (still common in production) lacks FULL OUTER; the portable form is what we actually run. The FULL OUTER form is preserved as source-only documentation.
3. **Cost-delta windows are LITERAL in SQL, not parameterized.** Could have added `:until` to the existing `_COST_*_SCOPED_SQL` pair — instead, four new dedicated fragments. Rationale: a parameterized version risks Pitfall 2 (caller binds `?range=` to delta windows). Hardcoding the 7d horizon in SQL is the structural guard.
4. **`cost_delta` emitted on the empty-case branch.** Frontend never has to special-case "this response has no delta" — the field is always present (flat-zero pill).
5. **DST test combines Python helper assertion + structural grep guard.** Either alone is insufficient: helper-only misses an SQL regression that corrupts inputs; grep-only misses a Python regression that drops timezone info. Together they form the load-bearing structural guard for ROADMAP success criterion #5. Adversarial-mutation verification (sed in `'localtime'`, observe RED, restore) proved the guard isn't vacuous.
6. **The 30d window literal is NOT in route SQL.** Dormant threshold runs in Python against MIN/MAX(ts) hoisted out of SQL. The DST positive-presence assertion was scoped to `-7 days` / `-14 days` (which DO appear as delta CTE bounds); the `-30 days` arithmetic is pinned by the Python helper's UTC-anchored timedelta math.
7. **12 tests vs the 9+ specified in the plan.** Two extras: `test_usage_delta_down_when_decline` (locks negative delta_pct, mirroring up/zero/flat coverage) and `test_usage_delta_default_when_no_activity` (asserts pill is ALWAYS present, no implicit None / missing-field regression). Both edge-case tests; pure SQL+pydantic; sub-second runtime.

## Deviations from Plan

None - plan executed exactly as written, with one note on the badge-attribution path:

The plan's Step 2c offered Python OR pure-SQL badge classification ("Either approach is acceptable; the Python form is shown for readability... Prefer the SQL form if it composes cleanly... fall back to Python if mixing CASE columns and GROUP_CONCAT becomes unwieldy."). I chose Python for readability + unit-testability of the cold-start gate. The DST safety property is unchanged because the SQL still emits UTC-anchored MIN/MAX(ts) (no `'localtime'` modifier), and the Python helper does timedelta arithmetic on those UTC inputs. The DST grep test was scoped accordingly to the windows that DO appear in source (`-7 days`, `-14 days`) and the Python `_BADGE_DORMANT_DAYS` arithmetic was pinned by the helper-side assertion in `test_dormant_badge_dst_spring_forward`.

The 12-vs-9 test count is "adding tests around the spec" — two extras (`down_when_decline`, `default_when_no_activity`) lock invariants the original 9+ didn't (negative-delta_pct branch coverage; pill-always-present invariant against a future regression that returns None / drops the field). No deviation cost — pure-edge-case tests run in milliseconds.

No Rule 1/2/3 auto-fixes triggered. No architectural Rule 4 prompts.

## Issues Encountered

One ruff issue caught at pre-commit time and immediately fixed:
- E501 line-too-long on a multiline-string assertion in `test_skills_router_schemas_importable` — split the expected JSON-substring into a multi-line concatenation.
- I001 import-sort on the dynamic `_BADGE_DORMANT_DAYS, _derive_badges` import inside `test_dormant_badge_dst_spring_forward` — sorted alphabetically.

One DST-test design iteration: the initial test asserted `assert "datetime('now', '-30 days')" in src_text` as a positive-presence guard. Removed because the badge classifier ran in Python (not SQL), so the 30d literal does not appear in source. The Python helper's UTC-arithmetic correctness is pinned by the `_derive_badges` synthetic-input test in the same function — equivalent structural coverage.

Adversarial DST mutation verified: temporarily applied `s/datetime('now', '-7 days')/datetime('now', '-7 days', 'localtime')/1` to the route file, ran `pytest -k test_dormant_badge_dst_spring_forward`, observed FAILED, then `git checkout -- backend/cmc/api/routes/skills.py` to restore, observed PASSED. The structural guard is live.

## Verifier Snapshot vs Phase 18 BASELINE.md

| Suite | Baseline (Phase 18) | Plan 19-01 | Plan 19-02 | This plan (19-03) | Delta vs baseline | Verdict |
|-------|---------------------|------------|------------|-------------------|-------------------|---------|
| Backend pytest passed | 566 | 579 | 586 | **598** | +32 | pass (`>= 566`) |
| Backend pytest failed | 0 | 0 | 0 | **0** | 0 | pass (`> 0` → fail) |
| Backend pytest warnings (`datetime.utcnow`) | 0 | 0 | 0 | **0** | 0 | pass (`> 0` → fail) |
| Backend pytest total warnings | 32 | 32 | 32 | **32** | 0 | pass (warn at `> 132`) |
| ruff check (touched files) | clean | clean | clean | **clean** | — | pass |
| pyright (touched files) | clean | clean | clean | **clean** | — | pass |
| Source contains `'localtime'` modifier on N-day window | 0 | 0 | 0 | **0** | 0 | pass (DST safety GATE) |
| Source contains `datetime.utcnow` in plan-touched files | 0 | 0 | 0 | **0** | 0 | pass (POLI-06 GATE) |

All Phase 18 BASELINE.md verifier rules continue to pass. POLI-06 ban honored in every new line. ROADMAP success criterion #5 (DST spring-forward) is structurally enforced by the test + the source-side absence of `'localtime'` modifiers.

## User Setup Required

None — no external service configuration required. The endpoint additions are live as soon as the backend restarts; consumers (Plan 19-04 frontend) can begin wiring against `usage_delta`, `badges`, and `cost_delta` immediately.

## Next Phase Readiness

- **`DeltaPill` is the canonical period-over-period primitive going forward.** Reusable for cost forecasts (Phase 20 ANLY-08), alert frequency comparisons, compare-mode session diffs — anywhere a curr/prev/delta/direction shape is needed. Frontend should hand-mirror the TypeScript type once and reuse.
- **`_USAGE_DELTA_BADGE_SQL_PORTABLE` + `_compute_cost_delta` patterns** are reusable for any future skill-level period comparison. The companion-CTE approach (range-INDEPENDENT lifetime properties merged with range-bounded primary rollup) keeps each query single-purpose.
- **DST safety pattern is ready to apply elsewhere.** Pattern B (UTC-only datetime SQL + structural grep guard + Python helper UTC arithmetic) should be the template for any time-windowed badge or threshold rule going forward in cmc.api. Plan 20 ANLY-07 (per-project cost anomalies) will need the same pattern for its forecast-window math.
- **Plan 19-04 (frontend) unblocked.** Backend response shapes are stable: `usage_delta` is always present on `SkillUsageRow`; `badges` defaults to `[]`; `cost_delta` is always present on `SkillCostResponse` (including the empty-events case). The frontend can wire DeltaPill rendering primitives without worrying about null/missing-field branches.
- **ROADMAP success criteria #3, #4, #5 satisfied on the backend side.** TopSkills + SkillCostCard + per-skill detail page can render delta pills (criterion #3); 'new_this_week' / 'dormant' badges with cold-start suppression are wired (criterion #4); DST day-boundary windowing uses UTC arithmetic and is verified by a unit test crossing the spring-forward boundary (criterion #5).

## Self-Check: PASSED

- `backend/cmc/api/schemas/skills.py` — `class DeltaPill` — FOUND (verified by `grep -n "class DeltaPill"`).
- `backend/cmc/api/schemas/skills.py` — `usage_delta: DeltaPill` + `badges: list[Literal[...]]` on `SkillUsageRow` — FOUND.
- `backend/cmc/api/schemas/skills.py` — `cost_delta: DeltaPill` on `SkillCostResponse` — FOUND.
- `backend/cmc/api/routes/skills.py` — `_DELTA_WINDOW_DAYS = 7`, `_BADGE_NEW_DAYS = 7`, `_BADGE_DORMANT_DAYS = 30`, `_BADGE_COLDSTART_DAYS = 14` — FOUND.
- `backend/cmc/api/routes/skills.py` — `_build_delta_pill`, `_derive_badges`, `_compute_cost_delta` — FOUND.
- `backend/cmc/api/routes/skills.py` — `_USAGE_DELTA_BADGE_SQL_PORTABLE` + four cost-delta SQL fragments — FOUND.
- `backend/cmc/api/routes/skills.py` — `datetime('now', '-7 days')` and `datetime('now', '-14 days')` present; `'localtime'` modifier absent on every N-day window — FOUND.
- `backend/tests/test_skills_router.py` — 12 new tests covering delta math (4) + badge boundaries (3) + cold-start suppression (1) + DST spring-forward (1) + cost_delta (2) + default-pill invariant (1) — FOUND.
- `git grep -nE 'datetime\.utcnow|from datetime import .*utcnow' -- backend/cmc/api/routes/skills.py backend/cmc/api/schemas/skills.py backend/tests/test_skills_router.py` — 0 matches — FOUND (POLI-06 GATE clean).
- `git grep -nE "datetime\('now', '-[0-9]+ days', 'localtime'\)" -- backend/cmc/ backend/migrations/` — 0 matches — FOUND (DST safety GATE clean).
- Commit `ee662cb` (Task 1: schema) — FOUND in `git log`.
- Commit `ea0d1cb` (Task 2: handlers) — FOUND in `git log`.
- Commit `68aeb5c` (Task 3: tests) — FOUND in `git log`.
- Full backend pytest: **598 passed / 0 failed / 32 warnings / 0 datetime.utcnow** — FOUND.
- Adversarial DST mutation (in-place sed in `'localtime'`, observe RED, restore, observe GREEN) — VERIFIED.

---
*Phase: 19-skills-per-project-deltas-badges*
*Completed: 2026-05-06*
