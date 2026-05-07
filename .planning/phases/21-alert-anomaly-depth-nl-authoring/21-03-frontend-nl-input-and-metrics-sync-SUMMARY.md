---
phase: 21-alert-anomaly-depth-nl-authoring
plan: 03
subsystem: alerts-ui
tags: [alerts, nl-authoring, react-query, alertdialog, vitest, drift-guard, ALRT-14]
dependency_graph:
  requires:
    - "Plan 21-02 (POST /api/alerts/parse-nl + GET /api/alerts/metrics endpoints; cmc/alerts/nl_parser.py)"
    - "Plan 15-04 (existing AlertRuleForm + useCreateAlertRule hook)"
    - "Plan 15-05 (AlertDialog Radix primitive)"
    - "Phase 16 (NLCronInput pattern in ScheduleComposer.tsx; useParseNlCron mutation in queries.ts)"
  provides:
    - "Frontend NL → AlertRule authoring (user-visible Phase 21 deliverable)"
    - "Cross-language metrics-vocabulary drift guard (test_alerts_metrics_sync.py)"
  affects:
    - "frontend/src/lib/api.ts (alertsParseNl + alertMetrics + 3 new types + 2 standalone exports)"
    - "frontend/src/lib/queries.ts (useParseAlertNl mutation + useAlertMetrics query + qk.alertMetrics key)"
    - "frontend/src/components/panels/AlertRuleForm.tsx (KNOWN_METRICS → FALLBACK_KNOWN_METRICS rename, AlertNlInput sub-component, AlertDialog preview modal, manualDisabled gate)"
    - "frontend/src/components/panels/__tests__/AlertRuleForm.test.tsx (4 new vitest cases + routed-fetch helper)"
    - "backend/tests/test_alerts_metrics_sync.py (NEW file; reads .tsx as text, regex drift guard with `//`-comment filter)"
tech_stack:
  added: []
  patterns:
    - "AlertDialog (Radix-portaled, role='alertdialog') used as preview-and-confirm modal"
    - "Single-source-of-truth save semantics — manual fields disabled while preview open (Pitfall 5)"
    - "useMemo over useAlertMetrics().data ?? FALLBACK_KNOWN_METRICS for runtime vocabulary sync"
    - "Cross-language drift guard via Python regex over .tsx text (no JS runtime dependency)"
key_files:
  created:
    - "backend/tests/test_alerts_metrics_sync.py (~80 lines; 1 test)"
  modified:
    - "frontend/src/lib/api.ts (+50 lines: 3 types + 2 client fns + 2 standalone exports)"
    - "frontend/src/lib/queries.ts (+30 lines: 1 query + 1 mutation + 1 qk key)"
    - "frontend/src/components/panels/AlertRuleForm.tsx (+243 net lines; AlertNlInput sub-component + AlertDialog preview modal + manualDisabled gate + useAlertMetrics-driven knownMetrics)"
    - "frontend/src/components/panels/__tests__/AlertRuleForm.test.tsx (+333 lines; 4 new tests + installRoutedFetch helper)"
decisions:
  - "Followed plan's Pitfall 5 lockout: manual fields disabled while previewOpen || createMutation.isPending; on Save the parsed rule fires DIRECTLY (NOT merged with manual draft) — verified by test asserting captured POST body has kind='anomaly' (manual default is 'threshold' so a merge would have silently won)."
  - "Followed plan's PITFALLS lockout: on parse 503, render an actionable inline 'Could not parse — please rephrase or use the manual form below.' role='alert' message; do NOT echo the raw 503 body literal ('natural-language alerts unavailable') and do NOT auto-save a fallback rule. Verified by the parse-failure vitest case asserting POST /api/alerts/rules was never called."
  - "Mirrored existing fetch-spy mocking pattern in AlertRuleForm.test.tsx rather than introducing a `vi.mock('../../lib/api')` module-mock layer — the plan's instruction was 'mirror whatever module-mock pattern the existing AlertRuleForm.test.tsx already uses', and that file uses `vi.spyOn(globalThis, 'fetch')` with URL+method routing. Consistency with neighboring panel tests (AlertEventsList, AlertRulesList) wins over the plan's incidental phrasing."
  - "Plan said 'mirror useParseNlCron at :745-749' — done verbatim. AlertNlInput sub-component verbatim mirrors NLCronInput at ScheduleComposer.tsx:452-498."
  - "Renamed KNOWN_METRICS → FALLBACK_KNOWN_METRICS at the constant; updated the file-header comment block to remove the 'Phase 17 may fetch dynamically' TODO and replace with the Phase 21 useAlertMetrics() runtime path + cross-language guard pointer. The drift-guard pytest's regex tolerates BOTH names (forward-portable per plan §9)."
metrics:
  duration_minutes: ~25
  tasks_completed: 2
  files_modified: 4
  files_created: 1
  vitest_cases_added: 4
  pytest_cases_added: 1
  total_tests_after_plan:
    vitest: 320
    pytest: 650
completed_date: 2026-05-07
---

# Phase 21 Plan 03: Frontend NL Input + Metrics Sync Summary

**One-liner:** Phase 21's user-shippable half of ALRT-14 — `useParseAlertNl` mutation + `useAlertMetrics` query, AlertNlInput sub-component (mirrors NLCronInput), AlertDialog preview-and-confirm modal in AlertRuleForm with single-source-of-truth save semantics, and a cross-language pytest that regex-extracts FALLBACK_KNOWN_METRICS from the .tsx file and asserts equality with `_SCOPE_EXTRACTORS.keys()`.

## What shipped

### Task 1 — API client + query hooks + AlertRuleForm UI (commit b902661)

**`frontend/src/lib/api.ts`** (+50 lines):
- 3 new types: `AlertRuleParseRequest`, `AlertRuleParseResponse`, `AlertMetricsResponse` (mirror backend `cmc/api/schemas/alerts.py:253-281` verbatim).
- 2 new client fns: `alertsParseNl` (POST /api/alerts/parse-nl) and `alertMetrics` (GET /api/alerts/metrics) — mirror neighboring alert client fns.
- 2 new standalone exports: `fetchAlertsParseNl`, `fetchAlertMetrics`.

**`frontend/src/lib/queries.ts`** (+30 lines):
- New `qk.alertMetrics()` query key (`['alert-metrics']`).
- `useAlertMetrics` query: `staleTime: Infinity`, `gcTime: Infinity`, `refetchOnWindowFocus: false`, `refetchInterval: false` — vocabulary changes only on backend deploys.
- `useParseAlertNl` mutation: mirrors `useParseNlCron` at `:745-749` shape exactly.
- Added `AlertMetricsResponse` and `AlertRuleParseRequest` to the type imports from `./api`.

**`frontend/src/components/panels/AlertRuleForm.tsx`** (+243 net lines):
- Renamed `KNOWN_METRICS` → `FALLBACK_KNOWN_METRICS`; updated file-header comment from "Phase 17 may fetch dynamically" to point at Phase 21's runtime path + cross-language guard.
- New `AlertNlInput` sub-component verbatim-mirrors `NLCronInput` at `ScheduleComposer.tsx:452-498` (label + input + Parse button + inline `role="alert"` error). On parse failure, the `m.isError` branch renders the actionable message **"Could not parse — please rephrase or use the manual form below."** — does NOT echo the raw 503 body (PITFALLS lockout).
- Added local state at the top of `AlertRuleForm`: `parsedRule`, `parsedDescription`. `previewOpen = parsedRule !== null`. `manualDisabled = m.isPending || previewOpen` (Pitfall 5: manual fields disabled while preview modal open OR create-mutation pending).
- `knownMetrics` = `useMemo` over `useAlertMetrics().data?.metrics ?? FALLBACK_KNOWN_METRICS`. Labels are preserved from the fallback when keys match; raw key as label for any new metric the backend exposes ahead of the frontend.
- `<AlertNlInput onParsed={...} disabled={m.isPending} />` rendered above the manual form (between header and `<form>`).
- All manual `<button>` / `<input>` / `<select>` / `<Button>` elements pass `disabled={manualDisabled}` (15 sites swept).
- New `<AlertDialog>` preview modal at the bottom of the article; renders the parsed `AlertRuleCreate` read-only via `<dl>` / `<dt>` / `<dd>` markup; `actionLabel="Save"` (or `"Saving…"` while in flight); `onAction={handlePreviewSave}` fires `useCreateAlertRule.mutate(parsedRule)` directly (Pitfall 5: NOT merged with manual draft); modal closes on success.
- For anomaly rules, the modal also renders `window_kind` (defaults `"ewma"`) + `window_n` (defaults `50`) from `params_json`.

### Task 2 — Vitest tests + backend drift-guard pytest (commit 379a673)

**`frontend/src/components/panels/__tests__/AlertRuleForm.test.tsx`** (+333 lines):
- 4 new vitest cases under a new `describe('AlertRuleForm — NL authoring (ALRT-14)')` block.
- Helper `installRoutedFetch(opts)` composes URL+method-routed fetch mocks for `/api/alerts/parse-nl`, `/api/alerts/metrics`, `/api/alerts/rules`. Each test wires only the routes it needs.
- Test cases:
  1. **Parse → preview → save fires useCreateAlertRule with the parsed rule (NOT merged).** Asserts captured POST body has `kind='anomaly'` (manual default is `'threshold'` — locks the Pitfall 5 contract: a silent merge would have left `kind='threshold'`).
  2. **Parse 503 → inline "could not parse" message; no auto-save.** Asserts `role='alert'` text matches `/could not parse/i`, modal is NOT in DOM, POST `/api/alerts/rules` was never called (PITFALLS lockout).
  3. **Manual fields disabled while preview modal open; re-enabled on Cancel.** Asserts `name` and `metric` inputs are disabled when modal opens, and re-enabled after clicking Cancel.
  4. **`useAlertMetrics` drives the metric `<select>` options at runtime.** Asserts the select options enumerate the 3 canonical metric values.
- Existing 5 vitest cases continue to pass unchanged.

**`backend/tests/test_alerts_metrics_sync.py`** (NEW, ~80 lines):
- `_extract_frontend_metric_keys()` reads `frontend/src/components/panels/AlertRuleForm.tsx` as text, captures the `FALLBACK_KNOWN_METRICS` (or `KNOWN_METRICS` — forward-portable name match) array literal body, **filters out single-line `//` comments**, then regex-extracts `value: '...'` strings.
- `test_known_metrics_match_scope_extractors()` asserts `set(extracted) == set(_SCOPE_EXTRACTORS.keys())` and prints both sets + symmetric difference on failure.
- Test imports `_SCOPE_EXTRACTORS` directly (Python source-of-truth) — no JS / node dependency at the backend layer.

## Verification

- `cd frontend && pnpm tsc --noEmit` — clean.
- `cd frontend && pnpm vitest run src/components/panels/__tests__/AlertRuleForm.test.tsx` — 9 passed (5 existing + 4 new).
- `cd frontend && pnpm vitest run` — 70 files / **320 passed** (vs Phase 18 floor 293).
- `cd backend && uv run pytest tests/test_alerts_metrics_sync.py -v` — 1 passed.
- `cd backend && uv run pytest` — 650 passed / 1 flaky (pre-existing `test_emergency_stop.py::test_estop02_validate_pid_is_claude_positive` — passes in isolation; environment-dependent PID lookup; logged in `deferred-items.md`; out of scope for this plan per SCOPE BOUNDARY rule).
- **Negative-test of drift guard performed locally** (per plan's done criteria): commented out one entry of `FALLBACK_KNOWN_METRICS`, ran the pytest, observed it FAIL with the contracted diagnostic:
  ```
  AssertionError: KNOWN_METRICS drift between frontend FALLBACK_KNOWN_METRICS and backend _SCOPE_EXTRACTORS.
    Only in frontend: []
    Only in backend:  ['skill_p95_latency_ms']
  ```
  Reverted the .tsx file, re-ran the pytest — 1 passed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Drift-guard regex was hole-permeable to `//`-commented entries.**
- **Found during:** Task 2 negative-test (the plan's stated done criterion: "removing a frontend metric value makes the pytest FAIL").
- **Issue:** The plan's regex (`value\s*:\s*['"]([^'"]+)['"]`) matched `value:` substrings inside single-line `//`-commented entries. A developer who comments out a metric to verify drift locally would see the test FALSELY PASS — defeating the entire purpose of the guard.
- **Fix:** Added a line-level filter that drops lines whose first non-whitespace chars are `//` BEFORE running the value regex. Multi-line `/* ... */` blocks are not used inside the array body by project convention; line-level filter is sufficient and the comment in the test documents the assumption.
- **Files modified:** `backend/tests/test_alerts_metrics_sync.py`.
- **Commit:** `379a673` (folded into Task 2's atomic commit).
- **Negative-test re-run:** confirmed FAIL with `Only in backend: ['skill_p95_latency_ms']` after fix; PASS after revert.

### Minor planning-text divergence (not behavioral)

**2. Test mocking pattern.** The plan's prose said "Module-mock `api.alertsParseNl` per the existing module-mock pattern" — but `AlertRuleForm.test.tsx` (and every other panel test in `__tests__/`) uses `vi.spyOn(globalThis, 'fetch')` URL+method routing, not `vi.mock('../../lib/api')`. The plan's later sentence said "mirror whatever module-mock pattern the existing AlertRuleForm.test.tsx already uses" — which I followed (fetch-spy). Consistency with the 5 existing tests in this file + the AlertEventsList / AlertRulesList neighbors wins over the plan's earlier phrasing.

### Deferred (out of scope)

**3. Pre-existing flaky `tests/test_emergency_stop.py::test_estop02_validate_pid_is_claude_positive`.** Discovered during the full-suite verify (650 / 1 flaky). Passes in isolation; environment-dependent PID lookup against `claude` process. Plan 21-03 touches frontend + a new backend pytest only — zero overlap with `cmc.system.emergency_stop`. Logged in `.planning/phases/21-alert-anomaly-depth-nl-authoring/deferred-items.md` per SCOPE BOUNDARY rule.

## Threat Flags

None. The plan introduces no new network endpoints (consumes Plan 21-02's existing routes), no new auth paths, no new file access patterns, no new schema changes at trust boundaries. The drift-guard pytest reads a tracked .tsx file from inside the repo via stdlib pathlib + `read_text()` — no external input, no dynamic execution.

## Known Stubs

None. The runtime `useAlertMetrics()` query resolves on mount; the `FALLBACK_KNOWN_METRICS` constant is a deliberate loading-window fallback (not a stub) and is the static input to the drift-guard pytest by design.

## Cross-references

- **21-RESEARCH.md Pattern 4** — UX template via NLCronInput + AlertDialog. This plan instantiates that pattern verbatim.
- **21-02 SUMMARY** (`21-02-nl-parser-route-and-metrics-SUMMARY.md`) — backend half (parser + routes + schemas) consumed by this plan's hooks.
- **15-RESEARCH.md / Plan 15-05** — original `AlertRuleForm` shape; the Phase 21 overlay preserves the threshold/anomaly discriminated-union pattern, the role='alert' Pitfall 2 error rendering, and the .cmc-card root layout.
- **ScheduleComposer.tsx:452-498** — `NLCronInput` source-of-truth that `AlertNlInput` mirrors verbatim.
- **lib/queries.ts:745-749** — `useParseNlCron` source-of-truth that `useParseAlertNl` mirrors verbatim.

## Self-Check: PASSED

Verified post-write:

- `frontend/src/lib/api.ts` — FOUND, contains `alertsParseNl`, `alertMetrics`, `AlertRuleParseRequest`, `AlertRuleParseResponse`, `AlertMetricsResponse`.
- `frontend/src/lib/queries.ts` — FOUND, contains `useParseAlertNl`, `useAlertMetrics`, `qk.alertMetrics`.
- `frontend/src/components/panels/AlertRuleForm.tsx` — FOUND, contains `FALLBACK_KNOWN_METRICS`, `AlertNlInput`, `AlertDialog`, `useAlertMetrics`, `useParseAlertNl`, `manualDisabled`.
- `frontend/src/components/panels/__tests__/AlertRuleForm.test.tsx` — FOUND, contains the 4 new test cases under `'AlertRuleForm — NL authoring (ALRT-14)'`.
- `backend/tests/test_alerts_metrics_sync.py` — FOUND, contains `_extract_frontend_metric_keys`, `test_known_metrics_match_scope_extractors`, `_SCOPE_EXTRACTORS` import.
- Commits `b902661` (feat) and `379a673` (test) — FOUND in `git log --oneline -5`.
