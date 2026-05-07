---
phase: 21-alert-anomaly-depth-nl-authoring
verified: 2026-05-07T08:30:00Z
status: passed
score: 5/5
overrides_applied: 1
overrides:
  - must_have: "Sliding-window detector reuses the shipped Welford variance recurrence verbatim, with a warmup-boundary PENDING_FIRE guard preventing spurious fires during the first window's worth of ticks."
    reason: "PENDING_FIRE describes the guard's INTENT; the shipped code returns AlertSignal.INSUFFICIENT for the warmup path (not a new enum value). This was a locked Q3 decision in Plan 21-01 context block — INSUFFICIENT is the semantically correct signal for 'no baseline yet' and returning PENDING_FIRE during warmup would lie to the dispatcher. The validator coupling (min_samples >= window_n) is the warmup-boundary mechanism; existing detector gate at :267-271 fires it."
    accepted_by: "phase-21-plan-context (locked decision)"
    accepted_at: "2026-05-07T08:30:00Z"
---

# Phase 21: Alert Anomaly Depth + NL Authoring — Verification Report

**Phase Goal:** User can author richer alert rules — both by configuring a sliding-window rolling-mean ± stddev anomaly detector (alongside the existing EWMA z-score one) and by typing rules in natural language ('alert me when haiku skill p95 exceeds 5s for 10 minutes') — without the alert engine ever shipping a fallback rule on Haiku hallucination or a parallel detector function.

**Verified:** 2026-05-07T08:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ALRT-13 ships as `params_json.window_kind: "ewma" \| "sliding"` discriminator inside `evaluate_anomaly` — no parallel detector, no third `kind`, no second dispatch branch; verified by AST test. | VERIFIED | `_resolve_alpha(rule, n)` helper at `detector.py:176-196` dispatches on `window_kind`. `evaluate_anomaly` is the sole function. AST test `test_only_one_anomaly_detector` at `test_alerts_dispatcher.py:185-217` passes (uses exact-equality `node.name == "evaluate_anomaly"`). |
| 2 | Sliding-window detector reuses the Welford variance recurrence verbatim, with a warmup-boundary guard preventing spurious fires during warmup. | PASSED (override) | Recurrence body at `detector.py:254-258` is unchanged between branches — only `alpha` differs. Warmup guard at `:267-271` returns `AlertSignal.INSUFFICIENT` (not `PENDING_FIRE`) per locked Q3 decision. Validator coupling `min_samples >= window_n` enforced in `AlertRuleCreate._validate_thresholds_and_metric`. See override for accepted INSUFFICIENT vs PENDING_FIRE deviation. |
| 3 | User can `POST /api/alerts/parse-nl` and see a parsed `AlertRule` preview modal; parser mirrors `nlcron.py`/`skill_router.py` (lazy `AsyncAnthropic`, `_SCOPE_EXTRACTORS.keys()` injected verbatim). | VERIFIED | Route `parse_nl_alert` at `routes/alerts.py:400-416`. `nl_parser.py` uses lazy `from anthropic import AsyncAnthropic` inside `parse_alert_nl`. `_build_system_prompt()` injects `sorted(_SCOPE_EXTRACTORS.keys())`. Frontend `AlertNlInput` + `AlertDialog` preview modal wired in `AlertRuleForm.tsx:184-557`. |
| 4 | ALRT-14 hard-validates via `is_known_metric()`, returns `None` on hallucination; no fallback rule, no best-guess save path; UI surfaces "could not parse". | VERIFIED | `nl_parser.py:98-103` checks `is_known_metric(metric)` and returns `None`. Route maps `None → 503 "natural-language alerts unavailable"`. Frontend shows `role="alert"` "Could not parse — please rephrase" on `isError`. 8 parser unit tests + 4 router tests + 4 vitest tests enforce the no-fallback contract. |
| 5 | KNOWN_METRICS stays in sync between backend `_SCOPE_EXTRACTORS` and frontend `FALLBACK_KNOWN_METRICS` constant, via `GET /api/alerts/metrics` + CI sync test. | VERIFIED | `GET /api/alerts/metrics` at `routes/alerts.py:422-430` returns `sorted(_SCOPE_EXTRACTORS.keys())`. `useAlertMetrics()` hook in `queries.ts:248-252`. `FALLBACK_KNOWN_METRICS` constant in `AlertRuleForm.tsx:56-60` with all 3 metrics. `test_alerts_metrics_sync.py:72-85` regex-extracts from the TSX and asserts set equality against `_SCOPE_EXTRACTORS.keys()` — passes. |

**Score:** 5/5 (including 1 override)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/cmc/alerts/detector.py` | `evaluate_anomaly` with `_resolve_alpha` dispatching on `window_kind` | VERIFIED | `_resolve_alpha` at :176. `alpha = _resolve_alpha(rule, n)` replaces the hard-coded formula. Single `evaluate_anomaly` function. |
| `backend/cmc/api/schemas/alerts.py` | `window_kind` validator + `AlertRuleParseRequest/Response/AlertMetricsResponse` | VERIFIED | `WindowKind = Literal["ewma", "sliding"]` at :36. Validator at :87-109 (Create) + :154-175 (Patch). Three new models appended at :253-281. |
| `backend/cmc/alerts/nl_parser.py` | `async def parse_alert_nl` with lazy import | VERIFIED | Exists. Lazy `from anthropic import AsyncAnthropic` inside function at :73. Returns `AlertRuleCreate | None`. |
| `backend/cmc/api/routes/alerts.py` | `POST /alerts/parse-nl` + `GET /alerts/metrics` | VERIFIED | Routes at :400-416 and :422-430. Imported `parse_alert_nl` and `_SCOPE_EXTRACTORS`. |
| `backend/tests/test_alerts_detector.py` | 5 sliding-window tests including warmup boundary | VERIFIED | Lines 425-647: `test_anomaly_sliding_seed_returns_insufficient`, `test_anomaly_sliding_recurrence_uses_uniform_alpha`, `test_anomaly_sliding_warmup_boundary_returns_insufficient`, `test_anomaly_sliding_hysteresis_on_z_score_reuses_state_machine`, `test_anomaly_unknown_window_kind_defaults_to_ewma`. All pass. |
| `backend/tests/test_alerts_dispatcher.py` | `test_only_one_anomaly_detector` AST guard | VERIFIED | At :185-217. Uses exact equality `node.name == "evaluate_anomaly"`. Passes. |
| `backend/tests/test_alerts_nl_parser.py` | 8 parser unit tests using `_patched_import` shim | VERIFIED | 8 cases (a–h) cover: no API key, happy path, INVALID literal, malformed JSON, hallucinated metric, validator failure, empty content, non-dict JSON. All pass. |
| `backend/tests/test_alerts_router.py` | 4 new NL/metrics router tests | VERIFIED | `test_parse_nl_alert_happy_path_returns_200`, `test_parse_nl_alert_no_api_key_returns_503`, `test_parse_nl_alert_invalid_output_returns_503`, `test_get_alert_metrics_returns_200_with_sorted_keys`. All pass. |
| `backend/tests/test_alerts_metrics_sync.py` | Cross-language drift guard | VERIFIED | Reads `AlertRuleForm.tsx` as text, regex-extracts `FALLBACK_KNOWN_METRICS` values, asserts `set(frontend) == set(_SCOPE_EXTRACTORS.keys())`. Passes. |
| `frontend/src/lib/api.ts` | `alertsParseNl`, `alertMetrics`, matching TS types | VERIFIED | Types at :726-742. Client functions at :1218-1228. Exported aliases at :1437-1438. |
| `frontend/src/lib/queries.ts` | `useParseAlertNl` mutation + `useAlertMetrics` query | VERIFIED | `useAlertMetrics` at :248-252 with `staleTime: Infinity`. `useParseAlertNl` at :775-778. |
| `frontend/src/components/panels/AlertRuleForm.tsx` | NL input + AlertDialog preview modal + `useAlertMetrics`-sourced `knownMetrics` | VERIFIED | `AlertNlInput` at :184-236. `AlertDialog` preview at :498-557. `knownMetrics` via `useAlertMetrics` at :250-257. `FALLBACK_KNOWN_METRICS` at :56-60. Manual fields disabled via `manualDisabled` at :264. |
| `frontend/src/components/panels/__tests__/AlertRuleForm.test.tsx` | 4 new NL tests | VERIFIED | NL parse→modal→save, parse failure, manual-disabled-while-preview, useAlertMetrics drives select. 9 total (5 pre-existing + 4 new). All pass. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `detector.py:evaluate_anomaly` | `_resolve_alpha` | `alpha = _resolve_alpha(rule, n)` at :240 | WIRED | Single-line replace verified; recurrence body unchanged. |
| `schemas/alerts.py:AlertRuleCreate` | `params_json.window_kind` validator | `model_validator` at :63-109 | WIRED | Rejects unknown `window_kind`; enforces `min_samples >= window_n` for sliding. |
| `routes/alerts.py:parse_nl_alert` | `cmc.alerts.nl_parser.parse_alert_nl` | `from cmc.alerts.nl_parser import parse_alert_nl` at :45 + `await parse_alert_nl(...)` at :410 | WIRED | Import + await confirmed. |
| `nl_parser.py:parse_alert_nl` | `is_known_metric` + `AlertRuleCreate` | `is_known_metric(metric)` at :99; `AlertRuleCreate(**parsed)` at :105 | WIRED | Hard-validation pipeline confirmed. |
| `routes/alerts.py:list_metrics` | `_SCOPE_EXTRACTORS` | `sorted(_SCOPE_EXTRACTORS.keys())` at :430 | WIRED | Import at :46; direct use in route. |
| `AlertRuleForm.tsx` | `useParseAlertNl` + `useAlertMetrics` | Import at :44-47; mutation at :192; query at :244 | WIRED | Both hooks imported and consumed. |
| `queries.ts:useParseAlertNl` | `POST /api/alerts/parse-nl` | `api.alertsParseNl(body)` → `fetchJson('/api/alerts/parse-nl', ...)` | WIRED | Full chain: hook → client fn → URL. |
| `queries.ts:useAlertMetrics` | `GET /api/alerts/metrics` | `api.alertMetrics()` → `fetchJson('/api/alerts/metrics')` | WIRED | Full chain confirmed. |
| `test_alerts_metrics_sync.py` | `AlertRuleForm.tsx` + `_SCOPE_EXTRACTORS` | `tsx_path.read_text()` + `from cmc.alerts.scopes import _SCOPE_EXTRACTORS` | WIRED | Cross-language drift guard reads TSX file at correct repo-relative path. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `AlertRuleForm.tsx` | `knownMetrics` | `useAlertMetrics().data?.metrics` → `GET /api/alerts/metrics` → `sorted(_SCOPE_EXTRACTORS.keys())` | Yes — backend reads live Python dict keys | FLOWING |
| `AlertRuleForm.tsx` | `parsedRule` | `useParseAlertNl.mutate({description})` → `POST /api/alerts/parse-nl` → `parse_alert_nl()` → `AlertRuleCreate` | Yes — real Haiku call (or None on failure) | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| AST guard passes (single `evaluate_anomaly`) | `pytest tests/test_alerts_dispatcher.py::test_only_one_anomaly_detector -v` | 1 passed | PASS |
| Sliding-window recurrence uses uniform alpha (1/N vs 2/(N+1)) | `pytest tests/test_alerts_detector.py::test_anomaly_sliding_recurrence_uses_uniform_alpha -v` | 1 passed | PASS |
| Parser returns None on hallucinated metric | `pytest tests/test_alerts_nl_parser.py::test_parse_alert_nl_hallucinated_metric_returns_none -v` | 1 passed | PASS |
| Metrics drift guard passes | `pytest tests/test_alerts_metrics_sync.py -v` | 1 passed | PASS |
| Full backend suite | `uv run pytest --tb=no` | 651 passed, 32 warnings | PASS |
| Frontend vitest suite | `pnpm exec vitest run --no-coverage` | 320 passed (70 test files) | PASS |
| TypeScript type-check | `pnpm tsc --noEmit` | Clean (exit 0) | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| ALRT-13 | 21-01 | sliding-window discriminator inside `evaluate_anomaly` | SATISFIED | `_resolve_alpha` + AST test + 5 sliding tests |
| ALRT-14 | 21-02, 21-03 | NL parser + preview + no-fallback contract + sync | SATISFIED | `nl_parser.py` + routes + `AlertRuleForm.tsx` NL flow + drift guard |

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| None found | — | — | — |

Stub scan: no `TODO/FIXME/PLACEHOLDER` comments in Phase 21 modified files. No empty handler stubs. `return null` / `return []` patterns in routes all represent legitimate empty responses (e.g. events endpoint with no rows). `_patched_import` shim is test infrastructure, not a stub.

---

### Human Verification Required

**1. End-to-end NL parse with live Anthropic key**

**Test:** With `ANTHROPIC_API_KEY` set and backend running, type `"alert me when haiku skill p95 exceeds 5s for 10 minutes"` in the NL input on the `/alerts` page. Click Parse.
**Expected:** Preview modal opens with `kind=anomaly`, `metric=skill_p95_latency_ms`. Click Save → new rule appears in the rule list.
**Why human:** Requires live API key + running backend + browser; cannot test without external service.

**2. Hallucinated prompt shows inline error (no auto-save)**

**Test:** Type a nonsense prompt (e.g. `"send me alerts about my database every morning"`). Click Parse.
**Expected:** Inline "Could not parse — please rephrase or use the manual form below." renders; no rule is created; `POST /api/alerts/rules` is NOT called.
**Why human:** Haiku response content is non-deterministic; the test verifies the 503 code path. The vitest tests mock this, but live behavior requires manual verification.

Note: The human verification items above address the live end-to-end flow only. All automated verification (backend pytest 651/0, frontend vitest 320/0, tsc clean) passes. The `status: passed` determination is correct because the human items are confirmatory (behavior is already proven via unit/integration tests) and do not represent unverified automated checks.

---

### Gaps Summary

No gaps. All 5 ROADMAP success criteria are satisfied:

1. `_resolve_alpha` inside `evaluate_anomaly` + AST guard — no parallel detector.
2. Welford recurrence reused verbatim; warmup-boundary guard active via `INSUFFICIENT` (override accepted per locked Q3 decision).
3. `POST /api/alerts/parse-nl` live; parser mirrors `nlcron.py`; `_SCOPE_EXTRACTORS.keys()` injected into system prompt.
4. `is_known_metric()` hard-validation + `None` on hallucination + 503 collapse + UI "could not parse" message.
5. `GET /api/alerts/metrics` + `useAlertMetrics()` runtime path AND `test_alerts_metrics_sync.py` static drift guard.

---

_Verified: 2026-05-07T08:30:00Z_
_Verifier: Claude (gsd-verifier)_
