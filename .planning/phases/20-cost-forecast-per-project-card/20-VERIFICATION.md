---
phase: 20-cost-forecast-per-project-card
verified: 2026-05-06T00:00:00Z
status: passed
score: 4/4
overrides_applied: 0
---

# Phase 20: Cost Forecast Per-Project Card — Verification Report

**Phase Goal:** User can see *where the month is heading* (monthly cost forecast) and *which projects are driving spend* (per-project cost card) on the cost dashboard, using read-time analytics consistent with the v1.1 'tokens stored, $ computed at read time' invariant.
**Verified:** 2026-05-06
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User loads cost dashboard and sees monthly forecast from 14d OLS baseline; `insufficient_data` returned when `days_elapsed < 7`; UI renders explanatory message instead of number | VERIFIED | `GET /api/cost/forecast` in `cmc/api/routes/cost.py` lines 291–411: `insufficient = days_elapsed_count < 7`, early-return with `insufficient_data=True, projected_month_total_usd=None`. Frontend `CostForecastCard.tsx` renders `cost-forecast-card-insufficient-message` div when `data.insufficient_data` is true, hides the projection KpiTile. Test `test_forecast_insufficient_data_threshold` in `test_cost_router.py` pins the boundary. |
| 2 | During first week of month, forecast card shows partial-month bias banner; banner clears once `days_elapsed >= 7` | VERIFIED | `partial_month_bias=True` set in the early-return path (line 355) and `partial_month_bias=False` in the sufficient-data path (line 410). Frontend `CostForecastCard.tsx` line 53: `{data.partial_month_bias ? (<div ... role="note">...</div>) : null}` — wired to the server flag verbatim, never re-derived from `days_elapsed < 7` client-side. Adversarial vitest test (days_elapsed=10 + partial_month_bias=true) confirms server flag is the sole driver. |
| 3 | User sees per-project cost card with cost and token volume by `project_key` over 7d/30d toggle, from existing `GET /api/cost/breakdown?dim=project` | VERIFIED | `CostByProjectCard.tsx` calls `useCostBreakdown('project', range)` which maps to `/api/cost/breakdown?dim=project&range={range}`. No new endpoint created. `_BREAKDOWN_BY_PROJECT_SQL` in `cost.py` groups by `s.project_key` (not `cwd`), with `WHERE s.project_key != ''` empty-key filter. All four path-leakage defense layers present and active (see below). |
| 4 | No dollar values stored in DB at any point; all cost figures computed at read time via `cmc.pricing.compute_cost` | VERIFIED | `sessions.py` and `token_usage.py` models contain zero `_usd` / `_dollars` / cost columns. `pricing.py` stores rates-per-mtok only (Numeric(10,4)) with explicit doc: "NEVER store dollars in derived tables — locked anti-feature." All three endpoints (summary, breakdown, forecast) call `compute_cost(...)` at request time. No INSERT/UPDATE path for computed dollar values in any migration (0001, 0002, 0003). |

**Score:** 4/4 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/cmc/cost/forecast.py` | Decimal-only OLS module, stdlib only | VERIFIED | Pure stdlib: imports `calendar`, `datetime.date`, `decimal.Decimal`. No numpy/pandas/scipy. No `getcontext()` call (inherits from `cmc.pricing`). Contains `decimal_ols`, `days_elapsed_in_month`, `days_in_month`, `project_month_total`. |
| `backend/cmc/api/routes/cost.py` — `GET /api/cost/forecast` | Forecast endpoint with documented response shape | VERIFIED | Lines 291–411. Uses `CostForecastResponse` schema, calls `compute_cost` at read time, `days_elapsed_count < 7` threshold for both flags. SQL: `_FORECAST_BASELINE_SQL` (14d, today excluded) + `_FORECAST_MTD_SQL`. |
| `backend/cmc/api/routes/cost.py` — `_BREAKDOWN_BY_PROJECT_SQL` | Groups by `project_key`, not `cwd` | VERIFIED | Lines 183–196: `s.project_key AS key`, `WHERE s.project_key != ''`, `GROUP BY s.project_key`. Comment cites Phase 19 SKLP-08 prohibition. |
| `backend/tests/test_cost_forecast.py` | Unit tests for OLS + calendar helpers | VERIFIED | 10 parametrized tests covering OLS correctness (positive/negative/zero slope), D-01 boundary semantics for `days_elapsed`, leap-year `days_in_month`, trapezoidal sum, D-03 (no negative clamp). |
| `backend/tests/test_cost_no_path_leakage.py` | Structural pytest path-leakage guard | VERIFIED | Layer 2 defense: seeds session with `/tmp/super/secret/leakage/path`, calls `GET /api/cost/breakdown?dim=project&range=7d`, scans all row keys and values for banned keys (`cwd`, `path`, `display_path`) and leading-slash strings. |
| `frontend/src/components/panels/CostForecastCard.tsx` | Renders forecast with bias banner and insufficient-data branch | VERIFIED | Uses `useCostForecast()` hook; renders `data.partial_month_bias` server flag (not re-derived); renders `data.insufficient_data` explanatory message; always renders MTD KpiTile. No client-side `days_elapsed < 7` computation. |
| `frontend/src/components/panels/CostByProjectCard.tsx` | Sortable per-project table, 7d/30d toggle | VERIFIED | Calls `useCostBreakdown('project', range)`. RangeToggle with `persistKey='cost-by-project'`. Columns: project_key, tokens, cost (4 decimal display). No `cwd`/`path` fields in `CostBreakdownRow` type or column renderers. |
| `frontend/src/routes/cost.tsx` | `/cost` route mounting both cards | VERIFIED | `createFileRoute('/cost')`, mounts `<CostForecastCard />` and `<CostByProjectCard />` in `cmc-card-grid`. Registered in `routeTree.gen.ts` as `/cost`. |
| `frontend/src/components/shell/NavBar.tsx` | `Cost` link in NavBar | VERIFIED | Line 11: `{ to: '/cost', label: 'Cost' }` inserted between Skills and Alerts in the routes array. |
| `frontend/src/lib/queries.ts` | `useCostForecast` and `useCostBreakdown` hooks | VERIFIED | Lines 339–353: both hooks at 60s/45s cadence. `qk.costForecast()` and `qk.costBreakdown(dim, range)` query keys properly scoped. |
| `frontend/tests/e2e/cost-dashboard.spec.ts` | 4-test Playwright e2e spec | VERIFIED | Tests: panel mounting (DB-state-independent), NavBar navigation, path-leakage DOM scan, 7d→30d toggle network assertion. API-guarded preflight with documented skip on empty DB. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `CostForecastCard.tsx` | `/api/cost/forecast` | `useCostForecast()` → `api.costForecast()` → `fetchJson('/api/cost/forecast')` | WIRED | `queries.ts:339`, `api.ts:1139` |
| `CostByProjectCard.tsx` | `/api/cost/breakdown?dim=project` | `useCostBreakdown('project', range)` → `api.costBreakdown(dim, range)` | WIRED | `CostByProjectCard.tsx:91`, `queries.ts:347`, `api.ts:1147` |
| `/cost route` | `CostForecastCard`, `CostByProjectCard` | import from `../components/panels` | WIRED | `cost.tsx:18-21`, `panels/index.ts:49-50` |
| `cost.py forecast endpoint` | `cmc.cost.forecast` module | `from cmc.cost.forecast import decimal_ols, days_elapsed_in_month, days_in_month, project_month_total` | WIRED | `cost.py:44-47` |
| `cost.py forecast endpoint` | `cmc.pricing.compute_cost` | `from cmc.pricing import compute_cost, load_rates` | WIRED | `cost.py:49`, used at lines 330, 377 |
| `partial_month_bias` server flag | `CostForecastCard` bias banner | `data.partial_month_bias` consumed verbatim; no client re-derivation | WIRED | `CostForecastCard.tsx:53` — only server flag reference, no `days_elapsed < 7` expression anywhere in frontend src |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `CostForecastCard.tsx` | `query.data` (CostForecastResponse) | `useCostForecast()` → `GET /api/cost/forecast` → `compute_cost` over `token_usage` rows → `decimal_ols` over 14d baseline | DB query (`_FORECAST_BASELINE_SQL`, `_FORECAST_MTD_SQL`) with real token rows | FLOWING |
| `CostByProjectCard.tsx` | `query.data` (CostBreakdownResponse) | `useCostBreakdown('project', range)` → `GET /api/cost/breakdown?dim=project` → `compute_cost` over `sessions` rows grouped by `project_key` | DB query (`_BREAKDOWN_BY_PROJECT_SQL`) with real session rows | FLOWING |

---

### Path-Leakage Defense Layers

All four defense layers are present and verified:

| Layer | Implementation | Location | Status |
|-------|----------------|----------|--------|
| 1 — SQL filter | `WHERE s.project_key != ''` + `GROUP BY s.project_key` | `cost.py:183-196` | VERIFIED |
| 2 — pytest structural | `test_cost_breakdown_project_no_path_leakage` — seeds adversarial cwd, scans response | `test_cost_no_path_leakage.py:65-114` | VERIFIED |
| 3 — vitest DOM regex | `PATH_REGEX = /\/[A-Za-z][\w/.-]+/` on rendered container textContent | `CostByProjectCard.test.tsx:72,137` | VERIFIED |
| 4 — Playwright e2e | Same regex on `cost-by-project-card-table` real DOM | `cost-dashboard.spec.ts:34,102` | VERIFIED |

---

### Behavioral Spot-Checks

| Behavior | Verification | Result | Status |
|----------|--------------|--------|--------|
| `forecast.py` imports stdlib only | `grep -n "import numpy\|import pandas\|import scipy\|from numpy\|from pandas\|from scipy" forecast.py` | No output | PASS |
| `forecast.py` does not call `getcontext()` | Grep found only the doc comment warning not to call it; no actual invocation | No `getcontext(` call in function bodies | PASS |
| `partial_month_bias` set to False for sufficient-data path | `cost.py:410` — `partial_month_bias=False` in the non-insufficient return | `partial_month_bias=True` at line 355, `=False` at line 410 | PASS |
| No dollar columns in DB models | `grep usd\|dollar\|cost sessions.py token_usage.py` | Zero results | PASS |
| `/cost` route in generated tree | `routeTree.gen.ts:13,26-27` | `Route as CostRouteImport`, `id: '/cost'`, `path: '/cost'` | PASS |
| `CostForecastCard` and `CostByProjectCard` exported from panels index | `panels/index.ts:49-50` | Both exported | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status |
|-------------|------------|-------------|--------|
| ANLY-06 | 20-02, 20-03 | Monthly cost forecast with OLS, insufficient_data guard, bias banner | SATISFIED |
| ANLY-07 | 20-01, 20-03 | Per-project cost card using breakdown?dim=project, path-leakage resistant | SATISFIED |

---

### Anti-Patterns Found

None. No TODO/FIXME/placeholder comments in Phase 20 artifacts. No stub component returns. No hardcoded empty state arrays passed as props. No `Number(decimal_string)` coercions in display paths — `CostForecastCard.tsx` uses template literal `${data.projected_month_total_usd}` for display (comment at line 12 explicitly documents this).

---

### Human Verification Required

None. All must-haves are mechanically verifiable from the codebase.

---

## Gaps Summary

No gaps. All four ROADMAP success criteria are satisfied:

1. `GET /api/cost/forecast` exists, uses stdlib Decimal-only OLS in `cmc/cost/forecast.py`, returns `insufficient_data=True` + `projected_month_total_usd=null` when `days_elapsed < 7`, and the frontend renders an explanatory message in that branch.
2. The partial-month bias banner is driven exclusively by the server-side `partial_month_bias` flag; it appears when `days_elapsed < 7` (same threshold) and clears once sufficient. No client-side re-derivation.
3. `CostByProjectCard` renders cost and token volume by `project_key` over a 7d/30d toggle using the existing `GET /api/cost/breakdown?dim=project` endpoint (no new endpoint). All four path-leakage defense layers are present.
4. No `_usd` or `_dollars` columns exist in any DB model or migration. All cost computation flows through `cmc.pricing.compute_cost` at request time.

---

_Verified: 2026-05-06_
_Verifier: Claude (gsd-verifier)_
