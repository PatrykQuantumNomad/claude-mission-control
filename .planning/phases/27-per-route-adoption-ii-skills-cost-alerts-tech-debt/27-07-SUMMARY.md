---
phase: 27-per-route-adoption-ii-skills-cost-alerts-tech-debt
plan: 07
subsystem: alerts
tags: [alerts, react-query, useAlertMetrics, drift-guard, contract-test, pydantic, tdbt-02, sc-4]

# Dependency graph
requires:
  - phase: 27-06
    provides: AlertRuleForm bespoke-card `cmc-card--bounded` className-only touch landed cleanly; SCOPE BOUNDARY preserved so Plan 27-07 inherits a clean AlertRuleForm with only the className touch in place (the bespoke `<article className="cmc-card cmc-card--bounded cmc-alert-rule-form">` at line 309 untouched by this plan)
  - phase: 21-alert-anomaly-depth-nl-authoring
    provides: useAlertMetrics React Query hook, GET /api/alerts/metrics endpoint, AlertMetricsResponse Pydantic schema, the original FALLBACK_KNOWN_METRICS constant + the build-time grep-based test_alerts_metrics_sync.py drift guard — Phase 27 TDBT-02 reverses the design call (Plan 21-02 made the constant a second source of truth to cover the loading window; Plan 27-07 makes useAlertMetrics the SOLE source with a disabled "Loading metric vocabulary…" placeholder covering the brief window)
provides:
  - TDBT-02 SOLE-SOURCE complete — FALLBACK_KNOWN_METRICS constant fully removed from AlertRuleForm.tsx; useAlertMetrics is the only frontend metric-vocabulary source
  - Disabled `<select>` loading-state placeholder pattern — "Loading metric vocabulary…" while isLoading; "No metrics available" when loaded-empty; "Select a metric…" disabled placeholder option when loaded-populated
  - Empty-string sentinel idiom on default draft initializers (defaultThresholdDraft + defaultAnomalyDraft both set metric='') — buildBody validator rejects on submit
  - API-layer drift guard (test_alerts_metrics_contract.py) replacing the build-time grep guard (test_alerts_metrics_sync.py — DELETED)
  - Phase 21 ALRT-14 design call REVERSED for the loading-window fallback path (kept as historical context in file headers)
affects:
  - Phase 27 Plan 27-08 (TDBT-03 NL composer retry UX) — inherits the same AlertRuleForm.tsx file but targets disjoint lines (~184-236 AlertNlInput component) so write happens after this plan lands cleanly
  - Phase 27 Plan 27-09 (close gate) — depends on TDBT-02 satisfaction for SC#4 verification

# Tech tracking
tech-stack:
  added: []  # no new deps; pure source-level refactor + test rewrite
  patterns:
    - "Disabled-select loading-state placeholder — three branches (isLoading / loaded-empty / loaded-populated) instead of an in-file fallback constant"
    - "Empty-string sentinel for required-but-unselected dropdowns — paired with submit-side validator (mirrors the existing name-required pattern in buildBody)"
    - "API-layer contract test as drift guard — assert sorted(dict.keys()) == sorted(API response array) at the route boundary instead of grepping a frontend source file"

key-files:
  created:
    - "backend/tests/test_alerts_metrics_contract.py (2 async tests — exact-equality + ≥3 smoke)"
  modified:
    - "frontend/src/components/panels/AlertRuleForm.tsx (4 sections: file header comment; FALLBACK_KNOWN_METRICS constant DELETED; defaultThresholdDraft + defaultAnomalyDraft initialize metric=''; buildBody adds empty-metric guard; knownMetrics useMemo simplified to one-line read; <select> renders 3-branch loading/empty/populated state)"
    - "frontend/src/components/panels/__tests__/AlertRuleForm.test.tsx (5 new TDBT-02 cases + 3 pre-existing tests updated to route /api/alerts/metrics in their fetch mocks + 1 test assertion adjusted for the new placeholder option)"
    - "frontend/src/lib/queries.ts (refreshed useAlertMetrics doc comment — loading window covered by disabled <select> placeholder, not by an in-file constant)"
  deleted:
    - "backend/tests/test_alerts_metrics_sync.py (1 build-time grep test removed; replaced by the contract test)"

key-decisions:
  - "Honored locked operator decision #2 verbatim: 'Replace with contract test' — old sync test DELETED (not relaxed in place), new contract test CREATED (asserts the genuine architectural invariant: sorted(_SCOPE_EXTRACTORS.keys()) == sorted(GET /api/alerts/metrics → metrics))"
  - "Empty-string sentinel + submit-side guard chosen over 'first vocabulary entry' default — surfaces the requirement explicitly to the user via the disabled 'Select a metric…' placeholder option; matches Pitfall 2 typed-form pattern already established for the name-required validation in buildBody"
  - "Loading-state UX: disabled <select> with 'Loading metric vocabulary…' placeholder; honest given useAlertMetrics has staleTime: Infinity so the window is typically 1-2 frames on cold load"
  - "knownMetrics labels become the raw metric keys — backend response shape (AlertMetricsResponse.metrics: list[str]) only carries keys; if a label channel ever ships, the knownMetrics useMemo is the single touch point. Out of scope for this plan."

patterns-established:
  - "Disabled-select loading-state placeholder: three branches keyed off isLoading + length === 0 — codify before adopting in other useQuery-driven <select> elements"
  - "API-layer contract drift guard: assert sorted(dict.keys()) == sorted(API response array) using the existing async client fixture — same idiom test_alerts_router.py uses for its happy-path assertion, just elevated to a dedicated test file the close-gate verifier can grep for"

# Metrics
duration: 10 min
completed: 2026-05-15
---

# Phase 27 Plan 07: TDBT-02 — useAlertMetrics SOLE source + API-layer drift guard Summary

**Deleted FALLBACK_KNOWN_METRICS from AlertRuleForm; useAlertMetrics is now the sole frontend metric-vocabulary source with a disabled "Loading metric vocabulary…" placeholder covering the brief window, and replaced the build-time grep-based drift guard (test_alerts_metrics_sync.py) with a runtime API-layer contract test (test_alerts_metrics_contract.py) asserting sorted(_SCOPE_EXTRACTORS.keys()) == GET /api/alerts/metrics → metrics.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-05-15T20:55:00Z
- **Completed:** 2026-05-15T21:05:51Z
- **Tasks:** 2
- **Files modified:** 3 frontend (AlertRuleForm.tsx + AlertRuleForm.test.tsx + queries.ts) + 1 backend created + 1 backend deleted = 5 files total

## Accomplishments

- **TDBT-02 SOLE-SOURCE achieved**: `grep -c "FALLBACK_KNOWN_METRICS\|KNOWN_METRICS" frontend/src/components/panels/AlertRuleForm.tsx` returns 0 hits. The constant is gone; default draft initializers use empty-string sentinel; `knownMetrics` useMemo collapses to a one-line read of `metricsQuery.data?.metrics ?? []` mapped to `{value, label: key}`.
- **Three-branch loading-state UX**: `<select>` renders `disabled` with "Loading metric vocabulary…" placeholder while `metricsQuery.isLoading`; "No metrics available" disabled state when loaded-empty; "Select a metric…" disabled placeholder option when loaded-populated.
- **Submit-side validator**: `buildBody()` rejects `metric === ''` with "Metric is required." inline — same idiom as the existing name-required guard.
- **Drift guard rewritten**: `backend/tests/test_alerts_metrics_sync.py` DELETED; `backend/tests/test_alerts_metrics_contract.py` CREATED with 2 async tests asserting `sorted(_SCOPE_EXTRACTORS.keys()) == sorted(GET /api/alerts/metrics → metrics)` and a smoke "≥3 metrics" check.
- **SC#4 satisfied**: AlertRuleForm metric vocabulary loads exclusively from `useAlertMetrics`; the in-file fallback constant is fully removed; the cross-language drift guard remains (now at the API contract layer instead of build-time grep).

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete FALLBACK_KNOWN_METRICS + simplify metric vocab derivation + add loading-state placeholder + update vitest** — `38424a1` (feat)
2. **Task 2: Delete test_alerts_metrics_sync.py + create test_alerts_metrics_contract.py (API-layer drift guard)** — `c611da3` (test)

**Plan metadata:** (TBD — committed in the docs commit after STATE.md / ROADMAP.md / REQUIREMENTS.md updates)

## Files Created / Modified / Deleted

### Created
- `backend/tests/test_alerts_metrics_contract.py` — 2 async tests using the existing `client` fixture from `conftest.py` (httpx.AsyncClient bound to the seeded FastAPI app via ASGITransport). Test 1 asserts the exact-equality contract `sorted(_SCOPE_EXTRACTORS.keys()) == sorted(GET /api/alerts/metrics → metrics)`. Test 2 is a smoke "≥3 metrics" check guarding against an accidental empty-vocab regression that the frontend's "No metrics available" friendly-UI branch would otherwise mask.

### Modified
- `frontend/src/components/panels/AlertRuleForm.tsx` — 4 sections:
  - File header comment (lines 9-18): rewritten to document Phase 27 TDBT-02 supersession of Phase 21 ALRT-14's loading-window-fallback design call; drift-guard rationale points at the new contract test path.
  - FALLBACK_KNOWN_METRICS constant (was lines 56-60): DELETED, replaced with a 2-line note pointing back to the file header.
  - defaultThresholdDraft + defaultAnomalyDraft (lines 83-113): `metric: FALLBACK_KNOWN_METRICS[0].value` → `metric: ''` (empty-string sentinel) with inline comment citing Pitfall 2 typed-form pattern.
  - buildBody (line ~122-128): added `if (!draft.metric) return { error: 'Metric is required.' }` guard immediately after the name validation.
  - knownMetrics useMemo (was lines 244-257): simplified to `(metricsQuery.data?.metrics ?? []).map((key) => ({ value: key, label: key }))` — 5 lines down from 8, dropped the fallback branch + the labelByKey merge.
  - `<select>` rendering (was lines 369-383): 3-branch state — disabled "Loading metric vocabulary…" placeholder when `metricsQuery.isLoading`; disabled "No metrics available" when loaded-empty; disabled "Select a metric…" placeholder option plus one option per metric when loaded-populated; select itself is `disabled={manualDisabled || metricsQuery.isLoading || knownMetrics.length === 0}`.
- `frontend/src/components/panels/__tests__/AlertRuleForm.test.tsx` — 5 new TDBT-02 cases appended in a fresh `describe` block: (a) loading-state placeholder + disabled select; (b) loaded state renders 3 metric options + "Select a metric…" placeholder + no leftover fallback metric like `cost_usd_24h`; (c) loaded-but-empty server response renders "No metrics available" disabled state with no leftover loading placeholder; (d) default draft initializers (threshold + anomaly) both set `metric=''` (asserted via the DOM select.value); (e) submit-side rejects empty metric — types Name + Threshold fire, leaves metric=' selected, asserts inline "Metric is required." error + zero POST calls. Plus 3 pre-existing tests updated to route `/api/alerts/metrics` in their fetch mocks and call `user.selectOptions` on the metric select before submitting (POST happy-path, missing-threshold_fire error, 422 server error tests) and 1 test assertion adjusted (the "useAlertMetrics drives the metric <select>" test now filters the placeholder option's empty value out of the values list before comparing to the canonical 3-metric vocabulary).
- `frontend/src/lib/queries.ts` — `useAlertMetrics` doc comment refreshed: the loading window is now covered by the disabled `<select>` placeholder, not by an in-file constant.

### Deleted
- `backend/tests/test_alerts_metrics_sync.py` — 1 test case removed (`test_known_metrics_match_scope_extractors`). The file's regex-based "extract `value:` strings from FALLBACK_KNOWN_METRICS array literal" approach is no longer applicable (the constant is gone). Replaced by the API-layer contract test in `backend/tests/test_alerts_metrics_contract.py`.

## Decisions Made

1. **Honored locked operator decision #2 verbatim**: "Replace with contract test" — old `test_alerts_metrics_sync.py` DELETED (NOT relaxed in place), new `test_alerts_metrics_contract.py` CREATED. The contract test asserts the genuine architectural invariant (`sorted(_SCOPE_EXTRACTORS.keys()) == sorted(GET /api/alerts/metrics → metrics)`) instead of the previous build-time grep on a frontend source file.
2. **Empty-string sentinel + submit-side guard** chosen over "default to first vocabulary entry". Surfaces the requirement explicitly to the user via the disabled "Select a metric…" placeholder option; matches the existing Pitfall 2 typed-form pattern (the name-required validation in `buildBody` is the precedent — same shape `return { error: '...' }`).
3. **Disabled-`<select>` loading-state placeholder** chosen over a separate skeleton/spinner. The window is typically 1-2 frames on cold load thanks to `useAlertMetrics`'s `staleTime: Infinity`; a placeholder option is honest and avoids the layout-shift a spinner would introduce.
4. **knownMetrics labels = raw metric keys**. The backend response shape (`AlertMetricsResponse.metrics: list[str]`) only carries keys; if a label channel ever ships, the `knownMetrics` useMemo is the single touch point. Out of scope for this plan — the SC says "loads exclusively from `useAlertMetrics`", not "renders pretty labels".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] grep returns 3 hits when literally checking the comment text mentioning the deleted constant**
- **Found during:** Task 1 (post-edit verification)
- **Issue:** The plan's literal SC reads `grep -c "FALLBACK_KNOWN_METRICS\|KNOWN_METRICS" frontend/src/components/panels/AlertRuleForm.tsx` returns 0. After my initial Edits the grep returned 3 because the new comments documenting the deletion ("KNOWN_METRICS sync...", "FALLBACK_KNOWN_METRICS constant was removed...", "FALLBACK_KNOWN_METRICS constant removed") still contained the literal strings.
- **Fix:** Rewrote both comment blocks to use "in-file fallback constant" / "Metric vocabulary" phrasing, dropping the literal symbol names. The rationale is preserved in prose form; the strict grep now returns 0.
- **Files modified:** frontend/src/components/panels/AlertRuleForm.tsx (header comment + interim deletion-marker comment)
- **Verification:** `grep -c "FALLBACK_KNOWN_METRICS\|KNOWN_METRICS" frontend/src/components/panels/AlertRuleForm.tsx` → 0
- **Committed in:** 38424a1 (Task 1)

**2. [Rule 3 - Blocking] Three pre-existing AlertRuleForm tests broke due to default metric change**
- **Found during:** Task 1 (running vitest)
- **Issue:** The plan flagged this in step 6 ("any existing tests that asserted the old fallback shape"). Three tests submitted the form expecting `metric: 'cost_usd_24h'` to flow from the default draft (POST happy-path, missing-threshold_fire client error, 422 server error tests) — with the new empty-string sentinel + submit-side guard, the form short-circuits on "Metric is required." before reaching the assertion. Additionally, their `mockImplementation` fetch routers fell through to an empty `{}` response for `/api/alerts/metrics`, leaving the select in "No metrics available" disabled state and preventing the user from picking a metric.
- **Fix:** Added `/api/alerts/metrics` routing to each broken test's fetch mock (returns the canonical 3-metric vocabulary) AND added a `user.selectOptions(screen.getByLabelText(/Metric/i), 'cost_usd_24h')` step after the metric select flips enabled. Tests now exercise the full happy path through the new sentinel + validator.
- **Files modified:** frontend/src/components/panels/__tests__/AlertRuleForm.test.tsx (3 pre-existing test cases updated)
- **Verification:** `pnpm test --run src/components/panels/__tests__/AlertRuleForm.test.tsx` → 14/14 PASS
- **Committed in:** 38424a1 (Task 1)

**3. [Rule 1 - Bug] Existing "useAlertMetrics drives the metric <select>" test asserts a 3-option list; now there are 4**
- **Found during:** Task 1 (running vitest)
- **Issue:** Post-change the select renders 4 options (`["", "cost_usd_24h", "dispatcher_failed_tasks_5m", "skill_p95_latency_ms"]`) but the test asserted exact equality with the 3-metric list — `expect(values).toEqual([3 metrics])` fails.
- **Fix:** Filter the placeholder option's empty `value` out before comparing — `.filter((v) => v !== '')` — preserves the test's intent (the select reflects the backend canonical vocabulary) while accommodating the new placeholder.
- **Files modified:** frontend/src/components/panels/__tests__/AlertRuleForm.test.tsx
- **Verification:** test passes; updated assertion still catches drift in the canonical vocabulary, only loosened to ignore the empty-string placeholder.
- **Committed in:** 38424a1 (Task 1)

**4. [Rule 3 - Blocking] ruff RUF100 caught an unused `# noqa: PLC2701` directive**
- **Found during:** Task 2 (pre-commit hook on `git commit`)
- **Issue:** The new `test_alerts_metrics_contract.py` imported `_SCOPE_EXTRACTORS` with a `# noqa: PLC2701  (test boundary)` directive intended to suppress private-name-import warnings. But the project's ruff config doesn't enable PLC2701, so RUF100 flagged the directive as unused. The pre-commit hook blocked the commit.
- **Fix:** Removed the `# noqa: PLC2701` directive — the import is now bare. Re-ran the commit and the hook passed.
- **Files modified:** backend/tests/test_alerts_metrics_contract.py (single line)
- **Verification:** `uv run ruff check tests/test_alerts_metrics_contract.py` → "All checks passed!"
- **Committed in:** c611da3 (Task 2)

---

**Total deviations:** 4 auto-fixed (2 bugs, 2 blocking)
**Impact on plan:** All four were minor mechanical fixes — the grep-literal cleanup landed inside Task 1's intended edits; the three test-update fixes are exactly what the plan's step 6 anticipated ("any existing tests that asserted the old fallback shape"); the ruff directive cleanup is project-config-specific noise. No scope creep, no behavior change beyond what the plan specified.

## Issues Encountered

- **Plan said `_SCOPE_EXTRACTORS` "lives in `backend/cmc/api/routes/alerts.py` per RESEARCH"** — verified at execution that the symbol is actually DEFINED in `backend/cmc/alerts/scopes.py` and IMPORTED into `backend/cmc/api/routes/alerts.py` at line 46. The new contract test imports from `cmc.alerts.scopes` (the definition site, same as the route handler does) so the test stays at the single source of truth. Confirmed via `grep -rn "_SCOPE_EXTRACTORS" backend/cmc/`.
- **`client` fixture is async (httpx.AsyncClient bound to ASGITransport), not sync `fastapi.testclient.TestClient` as the plan's snippet suggested.** Adapted the test to be `async def` + `await client.get(...)` matching the existing idiom in `test_alerts_router.py::test_get_alert_metrics_returns_200_with_sorted_keys` at line 590. The `pytest.mark.asyncio` decorator is required (auto-mode is enabled in `pyproject.toml`'s pytest config, but explicit decoration is defensive in case mode flips).

## Authentication Gates

None — fully autonomous execution.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- TDBT-02 SOLE-SOURCE complete; SC#4 of Phase 27 satisfied.
- Plan 27-08 (TDBT-03 NL composer retry UX) now ungated to land its AlertNlInput-targeted edits (lines ~184-236 of AlertRuleForm.tsx — disjoint from this plan's edits).
- Plan 27-09 (Phase 27 close gate) can score SC#4 GREEN.
- Backend pytest baseline shifted from 689 / 0 / 0 → 690 / 0 / 0 (+1 net: -1 sync test deleted, +2 contract tests added). Frontend vitest gained 5 new AlertRuleForm cases (213 / 0 / 0 across panel tests, up from 208 / 0 / 0 at Plan 27-06 close).
- No new dependencies; no migrations; no API schema changes.

---
*Phase: 27-per-route-adoption-ii-skills-cost-alerts-tech-debt*
*Completed: 2026-05-15*

## Self-Check: PASSED

- `frontend/src/components/panels/AlertRuleForm.tsx` exists on disk + `grep -c "FALLBACK_KNOWN_METRICS\|KNOWN_METRICS"` returns 0
- `backend/tests/test_alerts_metrics_contract.py` exists on disk
- `backend/tests/test_alerts_metrics_sync.py` does NOT exist on disk (verified via `ls`)
- Commit `38424a1` present in `git log` (Task 1 — feat)
- Commit `c611da3` present in `git log` (Task 2 — test)
- Frontend vitest: 14/14 PASS on AlertRuleForm.test.tsx
- Backend pytest: 690/0/0 PASS on full suite (uv run pytest -x)
- pnpm tsc --noEmit + pnpm lint --max-warnings 0: both clean
