---
phase: 21-alert-anomaly-depth-nl-authoring
plan: 01
subsystem: alerts
tags: [anomaly-detection, sliding-window, ewma, pydantic-validator, ast-static-import-test]

# Dependency graph
requires:
  - phase: 15-alert-engine-baseline
    provides: "evaluate_anomaly + evaluate_threshold pure-function detectors; AlertRuleCreate / AlertRulePatch validator surface"
  - phase: 18-polish-carry-forward-cleanup
    provides: "Phase 18 BASELINE.md pytest floor (632/0/32) used as regression guard"
provides:
  - "_resolve_alpha helper in cmc/alerts/detector.py — single dispatch site for ewma=2/(N+1) vs sliding=1/N inside evaluate_anomaly"
  - "WindowKind = Literal['ewma', 'sliding'] type at API boundary"
  - "AlertRuleCreate / AlertRulePatch validator coupling: window_kind enum strict-rejection + min_samples >= window_n warmup-boundary guard"
  - "test_only_one_anomaly_detector AST guard pinning the single-detector invariant against future regressions"
  - "5 sliding-window detector unit tests proving the discriminator dispatches (mean differs from EWMA branch on identical inputs)"
affects: [21-02-nl-parser-route-and-metrics, 21-03-frontend-nl-input-and-metrics-sync]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "params_json discriminator INSIDE existing detector (NOT a parallel function or new rule.kind value) — locks PITFALLS Pitfall 1"
    - "AST static-import test mirrors test_no_tasks_import precedent (cmc/dispatcher/alerts.py audit) for any future single-function invariant"
    - "Validator-coupled warmup-boundary guard: API-side min_samples >= window_n constraint reuses the existing detector warmup gate at detector.py:239-240, avoiding a second branch in the detector"
    - "Defense-in-depth on enum drift: API validator strict-rejects unknown values; detector helper defensively defaults unknown to 'ewma' to preserve v1.0 behavior for pre-Phase-21 persisted rules"

key-files:
  created: []
  modified:
    - "backend/cmc/alerts/detector.py — _resolve_alpha helper (16 net lines) + 1-line replace at alpha-resolution site + docstring tweak"
    - "backend/cmc/api/schemas/alerts.py — WindowKind Literal + AlertRuleCreate window_kind+min_samples coupling + AlertRulePatch best-effort coupling"
    - "backend/tests/test_alerts_detector.py — 5 sliding-window test cases + ALRT-13 section header"
    - "backend/tests/test_alerts_dispatcher.py — test_only_one_anomaly_detector AST guard"

key-decisions:
  - "Single function, single dispatch: ALRT-13 ships as a params_json.window_kind discriminator INSIDE evaluate_anomaly. No third rule.kind value, no parallel detector function, no second dispatcher branch."
  - "Sliding reuses the SAME EWMA-style recurrence verbatim (`new_var = alpha*(diff*diff) + (1-alpha)*prior_var`); only alpha differs (sliding=1/N, ewma=2/(N+1)). Did NOT introduce textbook Welford M2 += ... and did NOT extract the recurrence to a helper (per-tick hot path, no readability gain)."
  - "Q3 lock honored: warmup gate keeps the existing AlertSignal.INSUFFICIENT return — `PENDING_FIRE` in the success criterion phrase describes intent, not literal signal value."
  - "min_samples >= window_n coupling enforced at the API validator (422 on violation); the existing detector warmup gate at :239-240 IS the boundary guard. No second branch in the detector."
  - "Defensive default: unknown/missing window_kind defaults to 'ewma' in `_resolve_alpha` to preserve v1.0 behavior for pre-Phase-21 persisted rules. API validator strict-rejects unknown values (defense in depth — typo `slidng` cannot silently default to ewma at the API boundary)."
  - "AST guard uses exact equality (`node.name == 'evaluate_anomaly'`) — NOT startswith — per RESEARCH Pitfall 7 (a future `_evaluate_anomaly_helper` must not trip a prefix match)."
  - "Atomic single-commit ship per plan output: detector + schema validator + 5 detector tests + 1 AST guard test all land in c2a7793. Bisect-friendly — a regression in any layer is attributable to one commit."

patterns-established:
  - "Discriminator-inside-existing-function pattern for additive detector variants: surface the discriminator at the API boundary as a Literal, dispatch via a single small helper at the existing alpha-resolution site, defend against typo-masking via API strict-rejection + detector defensive default."
  - "AST static-import guards for single-function invariants: scan ast.walk(tree) for FunctionDef nodes with exact-name equality (NOT startswith) and assert exactly-one. Adversarial-mutation verified via ad-hoc duplication."

# Metrics
duration: 27min
completed: 2026-05-07
---

# Phase 21 Plan 01: Detector window_kind Discriminator Summary

**Sliding-window anomaly detector ships as a params_json.window_kind discriminator inside evaluate_anomaly (single function, single dispatch branch); validator-coupled min_samples >= window_n is the warmup-boundary guard; AST static-import test pins the single-detector invariant.**

## Performance

- **Duration:** 27 min
- **Started:** 2026-05-07T10:51:07Z
- **Completed:** 2026-05-07T11:18:43Z
- **Tasks:** 2 (both `type="auto"`)
- **Files modified:** 4 (2 source + 2 tests)

## Accomplishments

- `_resolve_alpha(rule, n)` helper added to `cmc/alerts/detector.py` mapping `params_json.window_kind` to the EWMA recurrence's smoothing factor (ewma → `2/(N+1)`, sliding → `1/N`); single-line replace at the alpha-resolution site; recurrence body, warmup gate, and hysteresis state machine unchanged.
- API-boundary validators on `AlertRuleCreate` / `AlertRulePatch` reject unknown `window_kind` values with HTTP 422 and enforce `min_samples >= params_json.window_n` for sliding rules (warmup-boundary guard). `WindowKind = Literal["ewma", "sliding"]` surfaced in the schema module.
- 5 new sliding-window detector tests prove (a) seed semantics shared with EWMA, (b) discriminator dispatches (sliding new_mean=10.2 vs ewma new_mean≈10.36 on identical inputs), (c) warmup-boundary guard suppresses fires through the entire window, (d) hysteresis state machine is shared between branches, (e) `_resolve_alpha` defensively defaults unknown/missing window_kind to `2/(N+1)`.
- `test_only_one_anomaly_detector` AST static-import guard added to `tests/test_alerts_dispatcher.py` mirroring `test_no_tasks_import`; adversarial-mutation verified (true-duplicate `evaluate_anomaly` → RED with contracted diagnostic; restoration → GREEN).

## Task Commits

Single atomic commit per plan output:

1. **Tasks 1+2 atomic ship** — `c2a7793` (feat — `feat(21-01): add params_json.window_kind discriminator to evaluate_anomaly (ALRT-13)`)

The plan offered a per-task split as an alternative; chose the single-atomic shape because (a) the plan's `<output>` explicitly says "one atomic commit", (b) the helper, validators, and tests are tightly coupled (a partial commit would leave failing tests on the bisect timeline), (c) the diff is small (362 net insertions / 3 deletions across 4 files).

## Files Created/Modified

- `backend/cmc/alerts/detector.py` — Added `_resolve_alpha(rule, n)` helper after `_resolve_window_n` (lines 176-194); replaced single line at the alpha-resolution site (`alpha = _resolve_alpha(rule, n)` at line 240); updated `evaluate_anomaly` docstring "Math" section (lines 211-219) to cite the new dispatch. 26 added / 3 changed.
- `backend/cmc/api/schemas/alerts.py` — Added `WindowKind = Literal["ewma", "sliding"]` near top (lines 30-36); extended `AlertRuleCreate._validate_thresholds_and_metric` (lines 80-108) with `kind == "anomaly"` window_kind enum check + sliding `min_samples >= window_n` coupling; extended `AlertRulePatch._validate_thresholds` (lines 145-175) with the same enum check + best-effort coupling when both `min_samples` and `params_json` are present in the patch body. 70 added / 0 changed.
- `backend/tests/test_alerts_detector.py` — Appended `# ---- ALRT-13: sliding-window anomaly ----` section with 5 tests (`test_anomaly_sliding_seed_returns_insufficient`, `test_anomaly_sliding_recurrence_uses_uniform_alpha`, `test_anomaly_sliding_warmup_boundary_returns_insufficient`, `test_anomaly_sliding_hysteresis_on_z_score_reuses_state_machine`, `test_anomaly_unknown_window_kind_defaults_to_ewma`). 226 added.
- `backend/tests/test_alerts_dispatcher.py` — Appended `test_only_one_anomaly_detector` AST guard immediately after `test_no_tasks_import`. 35 added.

## Decisions Made

All seven decisions cited in the frontmatter `key-decisions` are inheritances from the locked plan_context (RESEARCH.md Pitfalls 1, 2, 7; ROADMAP success criteria 1+2; Q3 INSUFFICIENT-vs-PENDING_FIRE lock). The execution exposed three additional in-flight decisions:

- **Hysteresis test threshold tuning (`threshold_fire=2.5` instead of `3.0`).** Sliding alpha=1/N=0.1 inflates variance proportionally to squared diff (`new_var = 0.1*diff² + 0.9*prior_var`), so single-tick |z|-magnitude is asymptotically bounded near √(N-1) ≈ 3.0 for N=10. With `threshold_fire=3.0` no single-tick value can cross |z|>fire on a fresh sliding-window estimator. Lowered the test's threshold to 2.5 so the |z|≈2.79 produced by `value=80, prior_mean=50, prior_var=4` trips the hysteresis branch deterministically. Documented in the test's docstring; this is a property of the sliding recurrence (not a bug in the implementation), the test exists to prove the state machine is shared, not to claim sliding can fire on a single tick at the canonical 3-sigma threshold.
- **Warmup-boundary test off-by-one tightening (`min_samples = window_n + 1`).** The plan's literal `min_samples=window_n=10` does NOT make all 10 ticks return INSUFFICIENT — the gate is `new_sc < min_samples` (strict less-than), so tick 10 produces new_sc=10 which clears the gate (10<10 is False). Setting `min_samples=11` (still satisfies the validator's `min_samples >= window_n`) makes the test literally assert what the plan intended: "feed window_n ticks; all return INSUFFICIENT". Documented in the test's docstring as a tightening of the plan's intent, not a deviation from the success criterion (the success criterion is "no fire during warmup", which both shapes satisfy).
- **Single-atomic vs per-task split.** Plan output stipulates one atomic commit. Honored.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Test bug] Hysteresis test value+threshold combination yielded |z|<fire under sliding alpha**
- **Found during:** Task 2 (sliding-window tests; first run of `test_anomaly_sliding_hysteresis_on_z_score_reuses_state_machine`)
- **Issue:** Plan suggested `threshold_fire=3.0` + `value=80` + prior `(mean=50, var=4)` should produce PENDING_FIRE. Math under sliding alpha=1/N=0.1: new_mean=53, new_var=93.6, |z|=27/√93.6≈2.79 — strictly less than 3.0 → CLEAR (test failed). The sliding recurrence's variance update inflates proportional to squared diff, so single-tick z-magnitude is bounded near √(N-1)≈3 for N=10.
- **Fix:** Lowered `threshold_fire` to 2.5; documented the sliding-recurrence z-bound property in the test docstring.
- **Files modified:** `backend/tests/test_alerts_detector.py`
- **Verification:** Test now passes deterministically; the |z|≈2.79 > 2.5 fire boundary holds.
- **Committed in:** c2a7793 (atomic commit)

**2. [Rule 1 — Off-by-one in plan text] Warmup-boundary literal `min_samples=window_n=10` does not match gate semantics**
- **Found during:** Task 2 (sliding-window tests; reasoning through `test_anomaly_sliding_warmup_boundary_returns_insufficient`)
- **Issue:** Plan body says "feed `window_n` ticks with `min_samples=window_n=10` and assert all return INSUFFICIENT" but the gate is `new_sc < min_samples` — tick 10 produces new_sc=10, 10<10 is False → gate clears.
- **Fix:** Use `min_samples=window_n+1=11` (still satisfies the validator's `min_samples >= window_n` constraint); test now literally exercises "window_n ticks all INSUFFICIENT" as the plan intends; documented as tightening in the test docstring.
- **Files modified:** `backend/tests/test_alerts_detector.py`
- **Verification:** Test passes; tick 11 (which produces new_sc=11=min_samples, clearing the gate) returns a non-INSUFFICIENT signal.
- **Committed in:** c2a7793 (atomic commit)

**3. [Rule 3 — Parallel-execution conflict resolution] Plan 21-02 landed first; re-applied schema changes**
- **Found during:** Post-test full-suite run revealed `backend/cmc/api/schemas/alerts.py` was no longer in `git status`
- **Issue:** Plan 21-02 (commits dfeb6fa + ef2a3d7) landed on `main` mid-execution and overwrote my unstaged edits to `alerts.py` (the validator regions). The execution_context anticipated this exact scenario: "If you encounter a merge conflict at commit time, do not panic — rebase your validator-region changes onto Plan 21-02's appended models. Plans land in numeric order (21-01 first); if 21-02 happens to land first you rebase."
- **Fix:** Re-applied the three edits to `alerts.py` (WindowKind Literal + AlertRuleCreate validator extension + AlertRulePatch validator extension). 21-02 only appended models at end-of-file, so the validator regions remained clean for re-application; merge-clean as plan_context predicted.
- **Files modified:** `backend/cmc/api/schemas/alerts.py`
- **Verification:** Inline schema validator probe passed (10 cases incl. enum-rejection, coupling, accept-paths, patch best-effort); `tests/test_alerts_router.py` 21 passed; `tests/test_alerts_nl_parser.py` (21-02's tests) all green; pyright + ruff clean.
- **Committed in:** c2a7793 (atomic commit, post-rebase)

---

**Total deviations:** 3 auto-fixed (2 plan-text bugs/off-by-ones, 1 parallel-execution rebase)
**Impact on plan:** All three deviations are surface-level and non-architectural; no scope creep. The two test-side adjustments are documented in test docstrings. The schema rebase was anticipated by the execution_context's conflict-coordination guidance.

## Issues Encountered

- **Adversarial-mutation false-negative on first attempt.** Initial mutation appended `evaluate_anomaly_v2` (sibling, not duplicate) — the AST guard correctly let this pass because exact-equality is `node.name == "evaluate_anomaly"` (Pitfall 7 lock). Replaced with a true `evaluate_anomaly` duplicate, which produced the contracted RED diagnostic `Found: ['evaluate_anomaly', 'evaluate_anomaly']`. This validated the guard's design — sibling helpers are tolerated, exact-name duplicates are rejected.
- **Phase 18 BASELINE.md pytest floor preserved.** Pre-our-changes (HEAD = `ef2a3d7`, after Plan 21-02): 644 collected. Post-our-changes: 650 collected (+6 = 5 sliding-window detector + 1 AST guard). 0 datetime.utcnow warnings preserved (POLI-06 reverse-direction signal); 32 total warnings preserved.

## Self-Check

**Files exist:**
- `backend/cmc/alerts/detector.py` — FOUND (contains `_resolve_alpha`)
- `backend/cmc/api/schemas/alerts.py` — FOUND (contains `WindowKind`, window_kind validator)
- `backend/tests/test_alerts_detector.py` — FOUND (24 tests, 5 new ALRT-13 cases)
- `backend/tests/test_alerts_dispatcher.py` — FOUND (13 tests, 1 new AST guard)

**Commit exists:**
- `c2a7793` — FOUND (`feat(21-01): add params_json.window_kind discriminator to evaluate_anomaly (ALRT-13)`)

**Self-Check: PASSED**

## User Setup Required

None — no external service configuration required. The detector + validators ship pure-Python with no migration; rules persisted before Phase 21 (without `window_kind` in `params_json`) defensively default to `ewma` (v1.0 behavior preserved). Operators can opt in to sliding-window rules via the next Plan 21-03 frontend or directly via `POST /api/alerts/rules` with `params_json={"window_kind": "sliding", "window_n": N}` and `min_samples >= N`.

## Next Phase Readiness

- **Plan 21-02 (NL parser + parse-nl/metrics routes)** already landed in parallel (commits dfeb6fa + ef2a3d7); validator extensions in this plan compose cleanly with 21-02's appended `AlertRuleParseRequest` / `AlertRuleParseResponse` / `AlertMetricsResponse` models.
- **Plan 21-03 (frontend NL input + metrics sync)** ready to consume: (a) the closed `WindowKind` Literal at the schema boundary, (b) the strict 422 on enum drift (frontend can rely on backend rejection of typos), (c) the metrics-sync drift guard surface from 21-02.
- ROADMAP success criterion 1 (params_json.window_kind discriminator) and 2 (warmup-boundary guard preventing spurious fires + Welford recurrence reused verbatim) satisfied on the backend side; PITFALLS Pitfall 1 (no parallel detector) pinned by AST guard.

References RESEARCH.md Patterns 2 and 4 per the plan's `<output>` section.

---
*Phase: 21-alert-anomaly-depth-nl-authoring*
*Plan: 01 (detector-window-kind-discriminator)*
*Completed: 2026-05-07*
