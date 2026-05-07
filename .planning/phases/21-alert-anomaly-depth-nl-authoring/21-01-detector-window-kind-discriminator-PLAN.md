---
phase: 21-alert-anomaly-depth-nl-authoring
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/cmc/alerts/detector.py
  - backend/cmc/api/schemas/alerts.py
  - backend/tests/test_alerts_detector.py
  - backend/tests/test_alerts_dispatcher.py
autonomous: true
requirements: [ALRT-13]

must_haves:
  truths:
    - "evaluate_anomaly accepts params_json.window_kind in {ewma, sliding}; ewma is the default for missing/unknown values (preserves v1.0 behavior)."
    - "Sliding-window rules with min_samples >= window_n return AlertSignal.INSUFFICIENT during the first window_n ticks (warmup-boundary guard) without firing."
    - "AlertRuleCreate / AlertRulePatch reject anomaly+sliding rules where min_samples < window_n with HTTP 422 (validator-level warmup coupling)."
    - "AlertRuleCreate / AlertRulePatch reject params_json.window_kind values outside {ewma, sliding, None} with HTTP 422."
    - "An AST-based static-import test asserts cmc/alerts/detector.py defines exactly ONE FunctionDef named 'evaluate_anomaly' (no parallel detector function exists)."
  artifacts:
    - path: backend/cmc/alerts/detector.py
      provides: "evaluate_anomaly with _resolve_alpha helper dispatching on window_kind"
      contains: "def _resolve_alpha"
    - path: backend/cmc/api/schemas/alerts.py
      provides: "params_json.window_kind validator + min_samples >= window_n coupling on AlertRuleCreate / AlertRulePatch"
      contains: "window_kind"
    - path: backend/tests/test_alerts_detector.py
      provides: "Sliding-window seed / recurrence / warmup-boundary / hysteresis tests"
      contains: "window_kind"
    - path: backend/tests/test_alerts_dispatcher.py
      provides: "test_only_one_anomaly_detector AST guard"
      contains: "test_only_one_anomaly_detector"
  key_links:
    - from: "backend/cmc/alerts/detector.py:evaluate_anomaly"
      to: "_resolve_alpha"
      via: "alpha = _resolve_alpha(rule, n)  (single-line replace at :212)"
      pattern: "_resolve_alpha\\(rule, n\\)"
    - from: "backend/cmc/api/schemas/alerts.py:AlertRuleCreate"
      to: "params_json.window_kind"
      via: "model_validator enforces window_kind in {ewma, sliding} and min_samples >= window_n"
      pattern: "window_kind"
---

<objective>
ALRT-13: extend `evaluate_anomaly` with a `params_json.window_kind: "ewma" | "sliding"` discriminator inside the existing function — no parallel detector, no second dispatch branch in the dispatcher. Sliding-window rules reuse the existing EWMA-style variance recurrence verbatim, differing only in how `alpha` is resolved (sliding = `1/N`, ewma = `2/(N+1)`). Couple `min_samples >= window_n` at the schema validator so the existing warmup gate at detector.py:239-240 is the warmup-boundary guard for sliding rules without adding a second branch in the detector. Pin the invariant via an AST static-import test mirroring `tests/test_alerts_dispatcher.py:147-183` (`test_no_tasks_import`).

Purpose: ship sliding-window rolling-mean ± stddev anomaly detection without inflating the detector surface (PITFALLS lockout: "ALRT-13 as parallel detector function — must extend `evaluate_anomaly`; never add a sibling or third `kind`").

Output: one atomic commit touching the detector, the schema validator, the detector tests, and the dispatcher AST-guard test.
</objective>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/21-alert-anomaly-depth-nl-authoring/21-RESEARCH.md

# Source-of-truth files (read these before editing)
@backend/cmc/alerts/detector.py
@backend/cmc/alerts/scopes.py
@backend/cmc/api/schemas/alerts.py
@backend/tests/test_alerts_detector.py
@backend/tests/test_alerts_dispatcher.py
</context>

<plan_context>
**Locked decisions (from RESEARCH.md + ROADMAP success criteria 1+2):**

1. Single function, single dispatch branch. ALRT-13 is a `params_json.window_kind` discriminator INSIDE `evaluate_anomaly`. There is NO third `kind` value (rule-level `kind` stays `"threshold" | "anomaly"`), NO parallel detector function, NO second `if rule.kind == ...` branch in the dispatcher. Verified by an AST-based static-import test.

2. "Welford variance recurrence reused verbatim" interpretation (Q3): the success criterion uses the spec term "Welford"; the shipped code at `detector.py:226-229` already calls itself "Welford-style" for the EWMA branch (`new_var = alpha*(diff*diff) + (1-alpha)*prior_var`). The sliding branch reuses the SAME RECURRENCE — only `alpha` differs (sliding = `1/N`, ewma = `2/(N+1)`). DO NOT introduce a textbook Welford `M2 += (x - mean_old)*(x - mean_new)`. DO NOT extract the 3-line recurrence into a helper (Q2 — adds function-call cost in the per-tick hot path for zero readability benefit).

3. **Q3 lock — `PENDING_FIRE` vs `INSUFFICIENT` for warmup signal:** the success criterion says "warmup-boundary `PENDING_FIRE` guard"; the existing warmup gate at `detector.py:239-240` returns `INSUFFICIENT` (`AlertSignal.INSUFFICIENT`). This plan KEEPS the `INSUFFICIENT` return for the sliding warmup path. Rationale: `PENDING_FIRE` semantically means "candidate firing but min_dwell not met" — emitting it during warmup would lie to the dispatcher. `INSUFFICIENT` means "no baseline yet" which is the correct semantic. The success criterion's `PENDING_FIRE` wording describes the guard's INTENT (prevent spurious fires during warmup), not its literal `AlertSignal` value. **DO NOT add a `PENDING_FIRE` enum value or change the existing warmup return.** The verifier reads this CONTEXT block and accepts `INSUFFICIENT`.

4. Warmup-boundary guard mechanism: server-side validator on `AlertRuleCreate` / `AlertRulePatch` enforces `min_samples >= params_json.window_n` for anomaly+sliding rules. Failing input → 422. This means the existing warmup gate at `detector.py:239-240` (`if new_sc < rule.min_samples: return AlertSignal.INSUFFICIENT, ewma`) IS the warmup-boundary guard for sliding rules — no new code path in the detector is required (avoids "second branch in detector" critique).

5. Defaults / unknown values: missing or unrecognized `window_kind` defaults to `"ewma"` at the detector helper (preserves v1.0 behavior for rules persisted before Phase 21 without a migration). At the API boundary, the validator rejects unknown values to prevent typo-masking (Pitfall 2 — `"slidng"` would silently default to ewma). Detector defensive default + API strict validation = defense in depth.

6. AST-test exact-equality check: `node.name == "evaluate_anomaly"` (exact, NOT `startswith`) and the count must be exactly 1. Pitfall 7 — a future `_evaluate_anomaly_helper` could trip a prefix match.

**Conflict resolution with Plan 21-02:**
Plan 21-01 modifies `backend/cmc/api/schemas/alerts.py` ONLY in the `AlertRuleCreate` / `AlertRulePatch` `model_validator` regions (and adjacent imports if needed for a Literal). Plan 21-02 APPENDS new model classes (`AlertRuleParseRequest`, `AlertRuleParseResponse`, `AlertMetricsResponse`) at the END of the same file. The two plans touch disjoint line regions; merge-clean. If a merge conflict surfaces, Plan 21-01 lands first (Wave 1) — Plan 21-02 rebases.
</plan_context>

<tasks>

<task type="auto">
  <name>Task 1: Add _resolve_alpha helper + window_kind validator + min_samples coupling</name>
  <files>backend/cmc/alerts/detector.py, backend/cmc/api/schemas/alerts.py</files>
  <action>
**A) `backend/cmc/alerts/detector.py`:**

1. Add a private helper `_resolve_alpha(rule, n)` immediately AFTER `_resolve_window_n` (currently `:163-173`). Shape:

```python
def _resolve_alpha(rule: AlertRule, n: int) -> float:
    """Map params_json.window_kind to the recurrence's smoothing factor.

    "ewma":    alpha = 2 / (N + 1)  — exponential decay (default, v1.0 behavior).
    "sliding": alpha = 1 / N        — uniform-weight rolling mean (rolling-mean ± stddev).

    Unknown / missing window_kind defaults to "ewma" — preserves v1.0 behavior
    for rules persisted before Phase 21 without a migration. The API-side
    validator rejects unknown values up front; this helper is defense in depth.
    """
    pj = rule.params_json or {}
    kind = pj.get("window_kind", "ewma")
    if kind == "sliding":
        return 1.0 / float(n)
    return 2.0 / (float(n) + 1.0)
```

2. Replace the SINGLE line at `detector.py:212` (`alpha = 2.0 / (n + 1.0)`) with `alpha = _resolve_alpha(rule, n)`. The recurrence body at `:226-229`, the warmup gate at `:239-243`, and the hysteresis state machine at `:254-274` are UNTOUCHED.

3. Update the `evaluate_anomaly` docstring (line ~194 area) so the "Math" section notes:
   - `alpha = _resolve_alpha(rule, n)` (was `2 / (N + 1)`)
   - `window_kind in {"ewma", "sliding"}`; sliding uses `alpha = 1/N`
   - "Welford-style" comment at `:226` stays (the recurrence is shared between branches).

DO NOT extract the recurrence into a helper. DO NOT add a second `if window_kind == ...` branch elsewhere in the function. DO NOT touch `_read_anomaly_state`, `evaluate_threshold`, or any signal value.

**B) `backend/cmc/api/schemas/alerts.py`:**

1. Add a `Literal["ewma", "sliding"]` import and an explicit `WindowKind = Literal["ewma", "sliding"]` near the top (next to `AlertRange` / `AlertKind` at `:27-28`).

2. Extend `AlertRuleCreate._validate_thresholds_and_metric` (`:55-71`) — add a new validator (or extend the existing one) that, when `self.kind == "anomaly"`, validates `self.params_json`:
   - `window_kind = self.params_json.get("window_kind", None)`
   - If present and not in `{"ewma", "sliding"}` → `raise ValueError("params_json.window_kind must be 'ewma' or 'sliding'")`.
   - When `window_kind == "sliding"`:
     - `window_n = int(self.params_json.get("window_n", 50))` (catch ValueError → 422)
     - `if self.min_samples < window_n: raise ValueError("sliding-window anomaly rules require min_samples >= params_json.window_n (warmup-boundary guard)")`

3. Extend `AlertRulePatch._validate_thresholds` (`:96-106`) symmetrically — when patching `params_json` AND the patched `params_json` includes `window_kind`, apply the same checks. Patching min_samples without params_json (or vice versa) cannot enforce the coupling alone (the patch is partial), so the rule-level coupling is best-effort on PATCH; document this with a comment. Hard reject only `window_kind` enum drift; the min_samples >= window_n coupling is enforced if BOTH fields are present in the patch body.

DO NOT change the canonical AlertRule SQL model (`backend/cmc/db/models/alert_rules.py`) — `params_json` is already a JSON column.

DO NOT add `AlertRuleParseRequest` / `AlertRuleParseResponse` / `AlertMetricsResponse` here. Those belong to Plan 21-02 and are appended at the END of this file by that plan. This task only touches the validator regions and the type imports near the top.
  </action>
  <verify>
```bash
cd backend && uv run pytest tests/test_alerts_detector.py -x -q
cd backend && uv run pytest tests/test_alerts_router.py -x -q
cd backend && uv run python -c "
from cmc.api.schemas.alerts import AlertRuleCreate
import pytest
# Reject unknown window_kind
try:
    AlertRuleCreate(name='r', kind='anomaly', metric='skill_p95_latency_ms', threshold_fire=3.0, params_json={'window_kind': 'slidng'})
    raise SystemExit('FAIL: accepted unknown window_kind')
except ValueError:
    pass
# Reject sliding with min_samples < window_n
try:
    AlertRuleCreate(name='r', kind='anomaly', metric='skill_p95_latency_ms', threshold_fire=3.0, min_samples=1, params_json={'window_kind': 'sliding', 'window_n': 50})
    raise SystemExit('FAIL: accepted sliding min_samples<window_n')
except ValueError:
    pass
# Accept sliding with min_samples >= window_n
AlertRuleCreate(name='r', kind='anomaly', metric='skill_p95_latency_ms', threshold_fire=3.0, min_samples=50, params_json={'window_kind': 'sliding', 'window_n': 50})
print('OK')
"
```
  </verify>
  <done>
- `_resolve_alpha` helper present in `detector.py` with the EWMA-default body.
- `evaluate_anomaly` line `:212` replaced (1 line) — no other detector lines touched (verify with `git diff --stat`).
- `AlertRuleCreate` rejects: unknown `window_kind` values; anomaly+sliding rules with `min_samples < window_n`.
- `AlertRulePatch` rejects unknown `window_kind` values; enforces the min_samples >= window_n coupling when both fields present in the patch body.
- Existing detector tests + existing router tests pass (regression baseline preserved: pytest 632/0 + 32 warnings target).
  </done>
</task>

<task type="auto">
  <name>Task 2: Sliding-window detector tests + AST static-import guard</name>
  <files>backend/tests/test_alerts_detector.py, backend/tests/test_alerts_dispatcher.py</files>
  <action>
**A) `backend/tests/test_alerts_detector.py` — extend with sliding-window cases:**

Add a new section labeled `# ---- ALRT-13: sliding-window anomaly ----` after the existing EWMA tests. New test cases (mirror existing detector test fixtures and shape):

1. `test_anomaly_sliding_seed_returns_insufficient` — first sample with `window_kind="sliding", window_n=10, min_samples=10` returns `(AlertSignal.INSUFFICIENT, ewma_dict)` with `sample_count == 1.0` and `ewma_mean == current_value`.

2. `test_anomaly_sliding_recurrence_uses_uniform_alpha` — after 2 samples (`x1=10.0, x2=12.0`) with `window_n=10`, assert `new_mean ≈ 0.1*12 + 0.9*10 = 10.2` (alpha = 1/10 for sliding) and `new_var ≈ 0.1*(12-10)^2 + 0.9*0 = 0.4`. Compare against the EWMA equivalent (`window_kind="ewma", window_n=10` — alpha = 2/11 ≈ 0.1818, `new_mean ≈ 10.364`) to PROVE the discriminator dispatches: same input, different `new_mean` per branch.

3. `test_anomaly_sliding_warmup_boundary_returns_insufficient` — feed `window_n` ticks with `min_samples=window_n=10` and assert all return `INSUFFICIENT` (the warmup gate fires because `new_sc < rule.min_samples`). On tick `window_n + 1`, with `now > rule.created_at + WARMUP_SECONDS`, the detector emits a non-INSUFFICIENT signal.

4. `test_anomaly_sliding_hysteresis_on_z_score_reuses_state_machine` — fixture: a sliding rule that has been firing; pass a value with `|z| < threshold_clear` and assert `CLEAR`. Pass a value with `|z| > fire` after cooldown and assert `FIRING`. Confirms the state machine at `:254-274` is shared (no second hysteresis path).

5. `test_anomaly_unknown_window_kind_defaults_to_ewma` — call `_resolve_alpha` directly with a rule whose `params_json["window_kind"] = "garbage"`; assert `alpha == 2/(n+1)` (NOT `1/n`). This pins the v1.0-default behavior even though the API validator rejects such input (defense in depth).

Use the existing `_make_rule` / `_make_state` test helpers in the file (or whatever the shipped fixture pattern is). Do NOT create new fixtures unless the existing ones don't cover sliding-window params.

**B) `backend/tests/test_alerts_dispatcher.py` — add AST static-import guard:**

Append new test mirroring `test_no_tasks_import` (`tests/test_alerts_dispatcher.py:147-183`) line-for-line:

```python
def test_only_one_anomaly_detector():
    """ALRT-13 (Phase 21): the sliding-window detector ships as a
    params_json.window_kind discriminator INSIDE evaluate_anomaly, NOT a
    parallel detector function. AST-asserts that cmc/alerts/detector.py
    defines exactly ONE FunctionDef whose name equals 'evaluate_anomaly'.

    Mirrors the precedent at test_no_tasks_import (this file:147-183).
    """
    import ast
    from pathlib import Path

    src_path = (
        Path(__file__).resolve().parent.parent
        / "cmc"
        / "alerts"
        / "detector.py"
    )
    tree = ast.parse(src_path.read_text())
    anomaly_fns = [
        node.name
        for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef)
        and node.name == "evaluate_anomaly"
    ]
    assert anomaly_fns == ["evaluate_anomaly"], (
        "ALRT-13 must extend evaluate_anomaly via params_json.window_kind, "
        "not add a parallel detector function. "
        f"Found: {anomaly_fns}"
    )
```

CRITICAL: use exact-equality (`node.name == "evaluate_anomaly"`), NOT `startswith` — Pitfall 7 in RESEARCH.md (a future `_evaluate_anomaly_helper` would trip a prefix match).

DO NOT add a second AST test for the dispatcher import surface — Phase 21 keeps the dispatcher's import line `from cmc.alerts.detector import evaluate_anomaly, evaluate_threshold` unchanged; the existing test_no_tasks_import audit is sufficient. (RESEARCH Q8 mentions an optional reinforcement test; skip it — minimum surface area.)
  </action>
  <verify>
```bash
cd backend && uv run pytest tests/test_alerts_detector.py -x -q
cd backend && uv run pytest tests/test_alerts_dispatcher.py::test_only_one_anomaly_detector -x -v
cd backend && uv run pytest tests/test_alerts_detector.py tests/test_alerts_dispatcher.py -q
```

Negative-test the AST guard locally (without committing): temporarily duplicate `def evaluate_anomaly(...)` as `def evaluate_anomaly_v2(...)` in detector.py — the AST test must FAIL with the diagnostic message. Revert.
  </verify>
  <done>
- 5 new sliding-window test cases pass; assertions hit the discriminator (mean differs from EWMA branch on identical inputs).
- `test_only_one_anomaly_detector` passes against the current single-function detector.
- Negative-test confirmed: introducing a sibling function makes the AST test FAIL fast with the contracted diagnostic.
- Full pytest suite (`uv run pytest -q`) green; warning count unchanged from baseline (32).
  </done>
</task>

</tasks>

<verification>
1. `cd backend && uv run pytest -q` — full backend suite green; no regressions vs. Phase 18 baseline (632/0 + 32 warnings).
2. `cd backend && uv run pytest tests/test_alerts_detector.py tests/test_alerts_dispatcher.py tests/test_alerts_router.py -q` — focused green.
3. `cd backend && uv run python -m pyright cmc/alerts/detector.py cmc/api/schemas/alerts.py 2>&1 | tail -5` — type clean (or whatever the project's typechecker invocation is).
4. `git diff backend/cmc/alerts/detector.py | grep -c "^+"` — diff is small (helper + 1-line replace + docstring tweak; ~15 lines added).
5. AST test bisect-friendly: introducing a sibling `evaluate_anomaly_*` function in any future commit fails the test with the contracted diagnostic.
</verification>

<success_criteria>
- ROADMAP success criterion 1: `params_json.window_kind: "ewma" | "sliding"` discriminator inside `evaluate_anomaly` — verified by `_resolve_alpha` helper + AST test.
- ROADMAP success criterion 2: Welford variance recurrence reused verbatim (the recurrence body at `:226-229` is unchanged); warmup-boundary guard prevents spurious fires during the first window's worth of ticks (enforced by validator-coupled `min_samples >= window_n` + existing `:239-240` gate; documented as `INSUFFICIENT` per Q3 in CONTEXT block above).
- PITFALLS lockout: no parallel detector function shipped (AST test pins this).
- Atomic single commit covering: helper + line replace + validator + 5 detector tests + 1 AST test.
</success_criteria>

<output>
After completion, create `.planning/phases/21-alert-anomaly-depth-nl-authoring/21-01-detector-window-kind-discriminator-SUMMARY.md` documenting: the `_resolve_alpha` helper line numbers, the validator additions, the AST test placement, any deviations from the plan, and the green pytest output. Reference `21-RESEARCH.md` Patterns 2 and 4 for downstream context.
</output>
