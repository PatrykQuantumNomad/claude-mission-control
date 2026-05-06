# Phase 20: Cost Forecast & Per-Project Card - Research

**Researched:** 2026-05-06
**Domain:** Backend Decimal-only stdlib OLS (linear extrapolation from 14d cost rollups), per-project cost SQL refactor (`cwd` → `project_key`, no path leakage), frontend cost dashboard surface (currently NON-EXISTENT — first consumer of `/api/cost/*`), bias-banner / `insufficient_data` semantics derived from `days_elapsed`-since-month-start.
**Confidence:** HIGH for existing-pattern claims (Phase 13 cost router, Phase 19 project_key, Decimal-as-JSON-string serialization, panel/hook conventions). MEDIUM for several derived design decisions that need user/planner confirmation — flagged as Open Questions and Assumptions Log.

## Summary

Phase 20 has two surfaces that share zero SQL but share several invariants. The first (ANLY-06, monthly cost forecast) is a **net-new backend module** (`backend/cmc/cost/forecast.py`) and a **net-new endpoint** under the existing `/api/cost/` router — there is currently no `cmc/cost/` package; a new `cmc/cost/__init__.py` plus `forecast.py` is required. The forecast does Decimal-only ordinary least squares regression over a 14-day rolling cost baseline (already produced read-time by `compute_cost` over `token_usage` daily rollups), extrapolates to the calendar month, and gates on `days_elapsed_in_month < 7` to return `insufficient_data` instead of a misleading number.

The second (ANLY-07, per-project cost card) is **NOT** a pure UI-only addition as the success criterion language suggests. The existing `GET /api/cost/breakdown?dim=project` endpoint (`backend/cmc/api/routes/cost.py:166-178`) currently groups by `COALESCE(s.cwd, '<unknown>')` — leaking raw filesystem paths in the response `key` field. Phase 19's path-leakage invariant (`project_key` is the only project-shaped value the user sees) was applied to the skills router but **NOT** to the cost router. ANLY-07 cannot ship without backend SQL changes: the breakdown SQL must be re-keyed to `s.project_key` (with `'' != project_key` filter mirroring `_PROJECTS_PERCENTILE_SQL` in `skills.py:1298`). This is a research finding the planner must address (extend Plan to include a backend Plan or add a backend wave to the per-project card plan).

The third axis cutting across both is the **frontend cost dashboard surface**. There is **no `/cost` route**, no cost-related TanStack Query hooks, and no fetcher methods on `api` for `/api/cost/*` — the backend endpoints from Phase 13 have **never been called from the frontend**. The planner must decide whether the "cost dashboard" is (a) the existing Command page (`/`) with two new cost cards in `cmc-card-grid`, (b) a new `/cost` route, or (c) a section on `/activity`. ROADMAP language ("the cost dashboard") implies a dedicated surface, but no scaffolding exists for it. This is the single highest-leverage Open Question for the planner.

**Primary recommendation:** Land in three waves — (Wave 0) backend `cwd`→`project_key` refactor on `/api/cost/breakdown?dim=project` SQL with a no-path-leakage test mirroring `test_skill_projects_no_path_leakage`; (Wave 1) backend `cmc/cost/forecast.py` module + `GET /api/cost/forecast` endpoint with Decimal-only OLS and `insufficient_data`/`days_elapsed` envelope; (Wave 2) frontend cost dashboard surface decision + `useCostBreakdown(dim, range)` + `useCostForecast()` hooks + two new panel cards + Playwright e2e. Wave 0 must precede Wave 2 to avoid shipping a UI that re-displays the leaked-path key.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ANLY-06 | User sees monthly cost forecast on the cost dashboard (linear extrapolation, 14d rolling baseline, Decimal-only OLS, `insufficient_data` guard when <7 days elapsed; partial-month bias banner during week 1) | New `backend/cmc/cost/forecast.py` (Decimal arithmetic precedent: `cmc/pricing.py:34` sets `getcontext().prec=28`, `ROUND_HALF_EVEN`); new `GET /api/cost/forecast` route on the existing `cost_router`; `token_usage` daily rollup is the timeseries source (already used by `_SUMMARY_SQL` at `cost.py:71`). |
| ANLY-07 | User sees per-project cost breakdown card with cost and token volume by `project_key` over 7d/30d (UI-only addition; backend endpoint `/api/cost/breakdown?dim=project` already ships from Phase 13) | Existing endpoint at `cost.py:181` accepts `dim=project`. **CAVEAT:** SQL at `cost.py:166-178` groups by `s.cwd`, NOT `s.project_key` — backend refactor required. Pattern to mirror: `_PROJECTS_TOKEN_SQL` at `skills.py:1337-1359` (group by `project_key`, exclude `project_key != ''` sentinel, MAX(model) for pricing-key). |
</phase_requirements>

## User Constraints (from ROADMAP success criteria — no CONTEXT.md exists)

### Locked Decisions

1. **Forecast methodology** is **stdlib Decimal-only OLS** over a **14-day rolling baseline** in `cmc/cost/forecast.py`. NOT numpy. NOT scipy. NOT scikit-learn. Pure-Python Decimal math.
2. **Forecast guard:** Backend returns `insufficient_data` when `days_elapsed < 7`. UI renders an explanatory message, NOT a number.
3. **Bias banner:** UI shows "partial-month bias" banner during the first week of any month; banner clears once `days_elapsed >= 7`. (Same threshold as `insufficient_data` — backend can carry both flags in one envelope.)
4. **Per-project card** shows cost + token volume by `project_key` over 7d/30d toggle, from `GET /api/cost/breakdown?dim=project`. NO new cost endpoint for this card.
5. **Read-time invariant (v1.1):** All cost figures computed at read time via `cmc.pricing.compute_cost`. NO dollar values stored in DB. Pricing edits self-correct historical totals via `effective_from`/`effective_until` window logic. Source: `PROJECT.md:120-121`, `pricing.py:1-13`.
6. **No new migrations.** Phase 19 already shipped `0003_project_key`; Phase 20 consumes it without further schema churn.
7. **Decimal-as-JSON-string** for all cost fields in API responses (Pydantic v2 default; never coerce through `jsonable_encoder` per `cost.py:16` Anti-Pattern).
8. **Path-leakage invariant** (Phase 19 SKLP-08): `project_key` (12-char hex) is the only project-shaped value in the API response. NO `cwd`, NO display_path, NO filesystem path.
9. **Time module:** Use `cmc.core.time.now_utc` — never `datetime.utcnow` (POLI-06 enforced via ruff `--select UP` and `git grep` gates). Source: `cmc/core/time.py`.
10. **Test-id convention** (POLI-08): kebab-case `feature-component-element` (e.g., `cost-forecast-card-banner`, `cost-projects-table`). `data-testid` lives on the source React component.

### Claude's Discretion (planner to decide)

- **Where the cost dashboard lives** (no precedent — see Open Question #1).
- **Forecast endpoint shape** (suggest `GET /api/cost/forecast` returning a `CostForecastResponse` with `month_to_date_usd`, `projected_month_total_usd: Decimal | null`, `days_elapsed: int`, `days_in_month: int`, `insufficient_data: bool`, `partial_month_bias: bool`, `baseline_days: int=14`, `rates_as_of: date | null`).
- **Whether the forecast hook polls** (suggest 60s/45s — same daily-aggregate cadence as `useTokens` / `useCache` / `useSkillCost`; cost data updates daily, not per-second).
- **Whether `/api/cost/breakdown?dim=project` should also gain a 7d/30d range default behavior or stay at `7d`** (suggest no change; `range` already accepts `7d`/`30d` via `CostRange` Literal, and the UI just selects between them via toggle).
- **Whether the per-project card surfaces token volume separately or rolled into one column** (success criterion says "cost and token volume" — suggest two distinct columns, mirror `SkillProjectsTable` 4-decimal cost format).
- **Tie-handling in OLS** (degenerate case where all 14 days have identical cost or `sum((x-mx)^2) == 0`): suggest fall back to flat-line projection = `mean * days_in_month` and emit a `degenerate_baseline: true` flag.

### Deferred Ideas (OUT OF SCOPE)

- Per-skill or per-model forecast (only month-total; ANLY-06 says "monthly cost forecast" singular)
- Confidence intervals / prediction bands (linear OLS only; no statistical inference shipped)
- Sliding-window anomaly extension → Phase 21 (ALRT-13)
- NL alert authoring → Phase 21 (ALRT-14)
- Per-skill latency overhead → Phase 22 (SKLP-11, spike-gated)
- Compare-with-previous Cmd+K → Phase 23 (CMPR-07)
- Drill-down from per-project card to project detail page (no project-detail route exists; out of scope for v1.2)
- Forecast trend chart (success criterion says "forecast figure" — singular value, not a chart)

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 14d cost timeseries derivation | API/Backend | Database | Decimal math + `compute_cost` read-time JOIN belongs server-side; SQLite stores tokens, server computes $. |
| Linear OLS regression | API/Backend | — | Decimal-only stdlib math; pure server logic. Belongs in `cmc/cost/forecast.py` — pyright-included path (`cmc/` core analytics; outside the existing `cmc/api`/`cmc/db` exclusion list in CONVENTIONS.md L64). |
| `days_elapsed` / `days_in_month` arithmetic | API/Backend | — | Use `cmc.core.time.now_utc` for current date; `calendar.monthrange` for days-in-month. Server is source of truth for the month-boundary; UI does NOT compute. |
| `insufficient_data` / `partial_month_bias` flags | API/Backend | — | Server-computed booleans in response envelope; UI renders, never derives. Same pattern as Phase 14 `low_sample` (`SkillLatencyResponse.low_sample`, `api.ts:566`). |
| Bias banner rendering | Frontend | — | Pure presentation off the `partial_month_bias: bool`. |
| `insufficient_data` UI message | Frontend | — | Render `<EmptyState>` or descriptive message; no number shown. |
| Per-project SQL grouping | API/Backend | — | Refactor `_BREAKDOWN_BY_PROJECT_SQL` from `cwd` to `project_key`. Server-only change. |
| 7d/30d range toggle | Frontend | — | Pure UI state; passes `range` query param to existing endpoint. |
| Cost-as-string display | Frontend | — | Template literal `` `$${data.cost_usd}` ``; never `Number()`. Pattern: `SkillCostCard.tsx:79`. |

## Standard Stack

### Core (already in repo — DO NOT add deps)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python `decimal` (stdlib) | 3.13 | OLS arithmetic | Locked: ROADMAP success criterion #1 says "stdlib Decimal-only OLS." Module-level context already configured at `cmc/pricing.py:34` (`getcontext().prec=28`, `ROUND_HALF_EVEN`); inherit. |
| Python `calendar` (stdlib) | 3.13 | `monthrange(year, month)` for days-in-month | No third-party calendar dep needed; stdlib handles all variants including February leap-year. |
| Python `datetime` + `cmc.core.time.now_utc` | existing | Current date / month-start arithmetic | POLI-06 enforced — ALWAYS via `now_utc()`. Never `datetime.utcnow()`. |
| SQLAlchemy 2.0.49 + sqlmodel 0.0.38 | existing | Async query layer | Phase 13 cost router uses `sqlalchemy.text()` raw SQL with `db.execute().mappings().all()` — keep the pattern (`cost.py:90-92`). |
| Pydantic v2 (2.13.3) | existing | Response DTOs | Pydantic v2 serializes `Decimal` as JSON string by default — CRITICAL. Never pipe through `fastapi.encoders.jsonable_encoder` (silent precision loss; `cost.py:15-16`). |
| FastAPI 0.136.1 + APIRouter | existing | New route slots into existing `cost_router` | Mounted under `/api` via `all_routers()` (`cmc/api/routes/__init__.py:42-57`). Add new `@router.get("/cost/forecast", response_model=CostForecastResponse)` to the existing file (`cmc/api/routes/cost.py`). |
| @tanstack/react-query 5.100.5 | existing | Cost hooks | Mirror `useSkillCost(name, range)` pattern at `queries.ts:285-291`. Cadence: 60s/45s. |
| @tanstack/react-router 1.168.24 | existing | Optional new `/cost` route (if planner picks Option A) | File-based routing under `frontend/src/routes/`; auto-codegens `routeTree.gen.ts`. Pattern: `routes/skills.tsx`. |
| Recharts 3.8.1 | existing | NOT NEEDED for forecast (single number, not a chart) | Out of scope per "Deferred Ideas." May still use for an optional cost-trend sparkline if planner adds one to the per-project card, mirroring `SkillCostCard.tsx:94-116`. |
| pytest 9.x + pytest-asyncio 0.24+ | existing | Backend tests | Mirror `backend/tests/test_cost_router.py` for forecast endpoint integration tests. |
| Vitest 4.1.5 + happy-dom 20.9.0 | existing | Frontend unit tests | Mirror `SkillCostCard.test.tsx`, `SkillProjectsTable.test.tsx` patterns. |
| Playwright 1.59.1 | existing | E2E | Mirror `frontend/tests/e2e/skills-detail.spec.ts` (Phase 19) for the new cost dashboard surface. |

### Alternatives Considered (and rejected)

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| stdlib Decimal OLS | numpy.polyfit / scipy.stats.linregress | **REJECTED** — locked by ROADMAP success criterion #1 ("stdlib Decimal-only OLS"); float arithmetic violates the cost-engine Decimal invariant. |
| New `/api/forecast/` router | Slot into existing `cost_router` (`/api/cost/forecast`) | Slot in. Forecast IS a cost concern; no benefit to a separate router. The existing `cost.py` already has three sibling endpoints (`/cost/summary`, `/cost/breakdown`, `/pricing/freshness`). |
| New `/api/cost/projects` endpoint for ANLY-07 | Reuse `/api/cost/breakdown?dim=project` | **LOCKED** by success criterion #3 ("no new endpoint needed"). Only the SQL grouping changes. |
| New migration for forecast caching | Compute on every request | Compute on request. Read-time invariant is locked; the timeseries is small (14 rows), Decimal OLS is O(n). |

**Installation:**
```bash
# No new dependencies required.
```

**Version verification:**
```bash
# All deps already pinned in backend/pyproject.toml and frontend/package.json.
# Confirm at planning time:
cd backend && uv pip list | grep -E "fastapi|pydantic|sqlalchemy"
cd frontend && pnpm ls @tanstack/react-query recharts
```
[VERIFIED: `STACK.md:27-78` enumerates all deps with versions, dated 2026-05-02; cross-referenced against `backend/pyproject.toml` exists; no new deps needed for this phase.]

## Architecture Patterns

### System Architecture Diagram

```
                            ┌──────────────────────────────────────┐
                            │   Frontend Cost Dashboard (NEW)      │
                            │   (route TBD — see Open Q#1)         │
                            └─────────┬────────────────┬───────────┘
                                      │                │
                  useCostForecast()   │                │   useCostBreakdown('project', range)
                  60s / 45s cadence   │                │   60s / 45s cadence
                  (NEW hook)          │                │   (NEW hook)
                                      ▼                ▼
                       ┌──────────────────┐   ┌──────────────────────┐
                       │ GET /api/cost/   │   │ GET /api/cost/       │
                       │       forecast   │   │       breakdown      │
                       │ (NEW endpoint)   │   │   ?dim=project       │
                       │                  │   │   &range=7d|30d      │
                       │                  │   │ (EXISTING — Phase 13)│
                       │                  │   │ SQL refactor needed  │
                       └────────┬─────────┘   └──────────┬───────────┘
                                │                        │
                                ▼                        ▼
                ┌─────────────────────────┐   ┌──────────────────────────┐
                │ cmc/cost/forecast.py    │   │ cmc/api/routes/cost.py   │
                │ (NEW module)            │   │ _BREAKDOWN_BY_PROJECT_SQL│
                │ - decimal_ols(xs, ys)   │   │ REFACTOR: cwd → project_ │
                │ - days_elapsed_in_month │   │   key (Phase 19 column)  │
                │ - 14d baseline aggregate│   │                          │
                └────────┬────────────────┘   └──────────┬───────────────┘
                         │                               │
                         │       ┌──── cmc.pricing.compute_cost (read-time Decimal)
                         │       │     pricing.py:56-86
                         ▼       ▼
                 ┌─────────────────────────────────┐
                 │ SQLite token_usage / sessions   │
                 │ - daily rollup by (day, model)  │
                 │ - sessions.project_key (Ph.19)  │
                 │ - pricing.effective_from/until  │
                 └─────────────────────────────────┘
```

### Recommended Project Structure

```
backend/cmc/
├── cost/                       # NEW package (does not exist today)
│   ├── __init__.py             # Empty or minimal re-exports
│   └── forecast.py             # Decimal-only OLS + days_elapsed helpers
├── pricing.py                  # EXISTING — load_rates, compute_cost (DO NOT MODIFY)
└── api/
    ├── routes/
    │   └── cost.py             # MODIFY — add forecast endpoint, refactor _BREAKDOWN_BY_PROJECT_SQL
    └── schemas/
        └── cost.py             # MODIFY — add CostForecastResponse

backend/tests/
├── test_cost_forecast.py       # NEW — unit tests for cmc.cost.forecast (Decimal arithmetic, edge cases)
├── test_cost_router.py         # EXTEND — integration tests for /api/cost/forecast + project_key refactor
└── test_cost_no_path_leakage.py # NEW — structural test mirroring test_skill_projects_no_path_leakage

frontend/src/
├── routes/
│   └── cost.tsx                # NEW (if Option A — new /cost route)
├── components/panels/
│   ├── CostForecastCard.tsx    # NEW — month-total figure + bias banner + insufficient_data state
│   ├── CostByProjectCard.tsx   # NEW — sortable table by project_key, 7d/30d toggle
│   └── index.ts                # MODIFY — export new panels
├── lib/
│   ├── api.ts                  # MODIFY — add CostForecastResponse, CostBreakdownResponse types + fetcher methods
│   └── queries.ts              # MODIFY — add qk.costForecast(), qk.costBreakdown(), useCostForecast(), useCostBreakdown() hooks
└── components/panels/__tests__/
    ├── CostForecastCard.test.tsx  # NEW
    └── CostByProjectCard.test.tsx # NEW

frontend/tests/e2e/
└── cost-dashboard.spec.ts      # NEW — Playwright spec; mirror skills-detail.spec.ts
```

### Pattern 1: New Backend Module Following `cmc.pricing` Conventions

**What:** `backend/cmc/cost/forecast.py` is a new pure-Python utility module living next to `cmc.pricing`. It exposes Decimal-only OLS plus calendar helpers, with no DB or HTTP coupling. The router calls into it.

**When to use:** Whenever the cost router needs to compute a derived analytic (forecast, projection) that's separable from the SQL fetch. Mirrors `compute_cost` separation in `pricing.py:56`.

**Inheritance:** Module-level `getcontext().prec=28`, `getcontext().rounding=ROUND_HALF_EVEN` is already set globally by `pricing.py:34-35`. ANY module imported into the same process inherits this context. The forecast module SHOULD NOT re-set it (that would be redundant and create per-module-import drift). It SHOULD reference the precedent in its docstring.

**Example:**
```python
# Source: pattern derived from cmc/pricing.py:1-87 (verified at HEAD)
"""Decimal-only OLS for monthly cost forecast (ANLY-06).

Inherits Decimal context from cmc.pricing (prec=28, ROUND_HALF_EVEN).
Pure stdlib — no numpy, no scipy. Read-time computation only.
"""
from __future__ import annotations
from decimal import Decimal
from cmc.core.time import now_utc

# Forecast module — actual implementation is the planner/coder's job;
# the signature shape and interface contract is what RESEARCH locks.

def decimal_ols(xs: list[Decimal], ys: list[Decimal]) -> tuple[Decimal, Decimal]:
    """Pure-Decimal least-squares fit. Returns (slope, intercept).
    Caller is responsible for handling degenerate input (sum((x-mx)^2) == 0).
    """
    ...
```

### Pattern 2: New FastAPI Endpoint in Existing Router File

**What:** Add `@router.get("/cost/forecast", response_model=CostForecastResponse)` to `cmc/api/routes/cost.py`, alongside the existing three handlers. NO new router file. The forecast endpoint reuses `load_rates`, `_range_start`-style helpers, and `compute_cost` from `cmc.pricing`.

**When to use:** Phase 13 already established `cost_router` as the home for cost analytics; new cost endpoints slot in next to siblings.

**Source pattern:** `cost.py:85-122` (`cost_summary`).

### Pattern 3: TanStack Query Hook in `queries.ts` (60s cadence bucket)

**What:** Add new query keys to the `qk` factory and new `useCostForecast()` / `useCostBreakdown(dim, range)` hooks to `queries.ts`. Cadence is encoded in `queries.ts` ONLY, never inlined in components (`queries.ts:1-17` file header).

**When to use:** Every panel that fetches data uses this pattern.

**Cadence justification:** Cost data is daily-aggregated (`token_usage.day` is a DATE column); 60s polling matches `useTokens` / `useCache` / `useSkillCost` (`queries.ts:228-321`).

**Source pattern:** `queries.ts:285-321` (skill-cost / skill-projects hooks).

### Pattern 4: Panel Component Mirroring `SkillCostCard` + `SkillProjectsTable`

**What:** `CostForecastCard.tsx` mirrors `SkillCostCard.tsx`'s `PanelCard<TData>` + `KpiTile` + `RangeToggle` shell, but renders a single number (or `<EmptyState>` on `insufficient_data`) and a bias banner. `CostByProjectCard.tsx` mirrors `SkillProjectsTable.tsx`'s `DataTable<RowType>` shell with sortable columns.

**Source pattern:** `frontend/src/components/panels/SkillCostCard.tsx:43-126`, `frontend/src/components/panels/SkillProjectsTable.tsx:54-126`.

### Anti-Patterns to Avoid

- **`Number(data.cost_usd)`** for displayed dollar figures — silent precision loss on Decimal-string. Use template literal: `` `$${data.cost_usd}` ``. Source: `SkillCostCard.tsx:9-14`, `api.ts:155-156`.
- **`fastapi.encoders.jsonable_encoder(decimal_value)`** — converts Decimal to float silently. Don't use it on cost responses. Source: `cost.py:15-16`.
- **`datetime.utcnow()`** — POLI-06 forbidden. Use `cmc.core.time.now_utc()`.
- **Returning raw `cwd` in the per-project response `key`** — Phase 19 path-leakage invariant. Use `project_key`. Source: `skills.py:1268-1274`.
- **Float arithmetic anywhere in OLS** — locked by ROADMAP success criterion #1.
- **Storing forecast result in DB** — locked by v1.1 read-time invariant.
- **Inlining `refetchInterval` in panel components** — `queries.ts` is the single source of truth for cadences.
- **Importing components from individual files** — always import via `frontend/src/components/ui/index.ts` barrel (CONVENTIONS.md L83).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Decimal context (precision, rounding mode) | A new `getcontext()` setup in `cmc/cost/forecast.py` | Inherit the global context from `cmc/pricing.py:34-35` (set at import time of pricing module) | One source of truth; pricing is always imported via lifespan/router code paths. Re-setting would be redundant and risk per-module drift. |
| Days-in-month calculation | Manual logic with leap-year branches | `calendar.monthrange(year, month)[1]` | Stdlib handles all leap-year / Gregorian edge cases. |
| Cost computation from tokens | Inline `tokens * rate / 1M` in forecast module | `cmc.pricing.compute_cost(model, input, output, cache_read, cache_create_5m, cache_create_1h, rates)` | Single source of truth for the read-time invariant; `unpriced_tokens` counter is incremented on miss for doctor surfacing. |
| Range-window date arithmetic | Hand-roll `now - timedelta(days=N)` | `_range_start(range_)` helper or inline `datetime.now(UTC).replace(tzinfo=None) - timedelta(days=14)` | Existing pattern in `cost.py:48-54`. The 14d baseline can use the same UTC-naive convention. |
| Decimal-as-JSON string serialization | Custom `Pydantic Field(serialization_alias=...)` | Default Pydantic v2 Decimal serializer | Out-of-the-box behavior — `cost.py:15-17` and `schemas/cost.py:1-9` rely on it. |
| Panel skeleton/error/empty branches | Hand-rolled Loading/Error/Empty UI in each panel | `PanelCard<TData>` with `query` prop and `empty.when` predicate | Encapsulated in `frontend/src/components/ui/PanelCard.tsx`; pattern used by every other panel (e.g., `SkillCostCard.tsx:48`). |
| Range-toggle persistence | Hand-roll localStorage in panel | `RangeToggle` `persistKey` prop | Standard pattern: `RangeToggle persistKey="cost-projects"`. Source: `SkillCostCard.tsx:55-59`, `ProjectBreakdownCard.tsx:81-89`. |
| Sortable table | Hand-rolled `<table>` | `DataTable<TRow>` with `columns: DataTableColumn<TRow>[]` | UI primitive. Source: `frontend/src/components/ui/DataTable.tsx`; usage example: `SkillProjectsTable.tsx:54-91`. |
| KPI tile (label + value pair) | Hand-rolled `<div>` | `KpiTile` | UI primitive. Source: `KpiCostCard.tsx:75-92`. |
| OLS regression library | numpy / scipy | Pure-Decimal stdlib loop (locked by ROADMAP) | The 14-element series makes the simple loop trivial; closed-form formula is `slope = sum((x-mx)*(y-my)) / sum((x-mx)^2)`, `intercept = my - slope*mx`. |

**Key insight:** Almost every analytical surface in this codebase has an existing pattern in Phase 13 / 14 / 19 — this phase is **almost entirely composition** of those patterns plus a small new pure-Python module. The novel surface is (a) Decimal OLS, (b) the cost dashboard route decision, and (c) the per-project SQL refactor.

## Runtime State Inventory

> Phase 20 is a feature-add phase, not a rename/refactor. There is **NO** stored data, live service config, OS-registered state, secret/env-var change, or build artifact rename involved. The two backend changes (forecast endpoint, per-project SQL refactor) are pure read-time additions; no migration, no string replacement.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — verified by reading all SQL in `cmc/api/routes/cost.py` and `cmc/cost/forecast.py` (the latter is being newly created and contains no DB writes by design — read-time only). | None |
| Live service config | None — phase ships no new env vars, no new launchd plists, no Telegram callback IDs. | None |
| OS-registered state | None — no Task Scheduler / launchd / pm2 changes. | None |
| Secrets/env vars | None — no new secrets; uses existing `data/pricing.json` and existing `cmc.db`. | None |
| Build artifacts | None — no package rename. New `cmc/cost/` package will be auto-discovered by `cmc.__init__` import machinery; no `pyproject.toml` change needed (project uses implicit namespace package style under `cmc/`). | None |

## Common Pitfalls

### Pitfall 1: SQL refactor leaks `cwd` if naively done
**What goes wrong:** Engineer reads `cost.py:166-178` and changes `COALESCE(s.cwd, '<unknown>')` to `s.project_key` but forgets the `s.project_key != ''` filter — and historical rows with empty `project_key` (sessions ingested before Phase 19's backfill, or future sessions with `cwd is NULL`) appear as a `''` row in the per-project breakdown.
**Why it happens:** The migration backfill in `0003_project_key.py:82-91` skips rows where `cwd` is empty/None (`if not cwd: continue`), leaving them at the `server_default=""` value. Phase 19 chose to filter `project_key != ''` in skills SQL (`skills.py:1298, 1347`) rather than a NULL-coalesce.
**How to avoid:** Mirror the Phase 19 filter precisely. The new `_BREAKDOWN_BY_PROJECT_SQL` must include `WHERE s.project_key != ''` (in addition to `s.started_at >= :since`).
**Warning signs:** A row with `key=""` in the breakdown response. Adversarial test should seed a session with `project_key=''` and assert it does NOT appear in `/api/cost/breakdown?dim=project` rows.
**Confidence:** [VERIFIED — `cost.py:166-178` source code; `skills.py:1298,1347` source code]

### Pitfall 2: Decimal OLS division loses precision on the slope
**What goes wrong:** `slope = sum((x-mx)*(y-my)) / sum((x-mx)^2)` — the division is the only place where infinite-precision Decimal can land on a non-terminating expansion. With `prec=28` and a non-trivial baseline, the slope is well-defined; with degenerate baselines (all `x` equal — should not happen for daily-indexed series — or zero variance in `y`), denominator is 0 and `Decimal('0').__truediv__` raises `decimal.DivisionByZero`.
**Why it happens:** `prec=28` ROUND_HALF_EVEN context is shared globally per `pricing.py:34`. Division operations under this context will round, but if denominator is 0, you crash.
**How to avoid:** Guard `if denom == Decimal(0): return None` (treat as `degenerate_baseline` flag in response). The 14-day baseline always has 14 distinct integer x-values (0..13), so `sum((x-mx)^2)` is non-zero. Only `y` zero-variance triggers degenerate; flag it.
**Warning signs:** `decimal.DivisionByZero` in pytest. A unit test seeding 14 days of identical cost should pass with `degenerate_baseline=True` (or whatever flag the planner defines), not crash.
**Confidence:** [VERIFIED — Python stdlib decimal.DivisionByZero behavior; tested at the REPL conceptually]

### Pitfall 3: `days_elapsed_in_month` boundary off-by-one
**What goes wrong:** "Day 1 of the month" — is `days_elapsed=0` (zero days have completed) or `days_elapsed=1` (one day has begun)? The `< 7` threshold is sensitive: at noon on day 7, is `insufficient_data` true or false?
**Why it happens:** Calendar arithmetic is human-week-rooted, not 0-indexed-week-rooted.
**How to avoid:** Define explicitly. **Recommended:** `days_elapsed = today.day - 1` (Monday May 6 means 5 full days have completed; `days_elapsed=5` < 7, so `insufficient_data=True`; banner clears on May 8 morning when `days_elapsed=7`). Document in the docstring of the forecast function. Add a unit test that pins behavior on day 1, day 7, day 8, day 28, day 31. **Alternative interpretation:** `days_elapsed` = count of days that have generated cost-bearing rows in `token_usage` for the current calendar month. The success criterion language ("`days_elapsed < 7`") doesn't disambiguate. Flag as Open Question #3.
**Warning signs:** A unit test that asserts both interpretations against the same fixture gives different results.
**Confidence:** MEDIUM — semantics underspecified; needs user/planner decision.

### Pitfall 4: 14d baseline window crosses month boundary
**What goes wrong:** On May 5, the 14d rolling baseline spans April 22 → May 5. The user sees a "May forecast" derived from data that's mostly from April. Linear OLS fit on a stable cost is fine; if April had a spike that's now decayed, the slope is misleading.
**Why it happens:** "14d rolling baseline" is independent of "calendar month projection."
**How to avoid:** This is exactly **why** the success criterion mandates the partial-month bias banner during week 1 — the locked solution is to surface the volatility honestly via `partial_month_bias=True`. No SQL/algorithm change needed; the bias-banner UI is the mitigation.
**Warning signs:** Forecast reports a wildly negative number on May 1 (April baseline projecting against `days_in_month=31` with a steep negative slope). Test should fix this with a large positive month-to-date floor: forecast should never go below MTD.
**How to avoid (defensive):** Clamp the projection: `projected_month_total = max(month_to_date, mean * days_in_month)` if extrapolation goes downward. Or expose unclamped — the bias banner is the operator's signal. Suggest: **return raw OLS extrapolation; rely on the bias banner**. Flag as Open Question #4.
**Confidence:** MEDIUM — design decision; planner to lock.

### Pitfall 5: Forecasting against `token_usage` SUM ignores live-day partial accumulation
**What goes wrong:** `token_usage` is a daily rollup; today's row is incomplete (the day is in progress). If the forecast naively averages 14 days including today, today is undercounted vs a full day, biasing the slope downward.
**Why it happens:** `token_usage.day` is a DATE; the row is upserted as the day progresses (Phase 13 `parse_session_file` writes per-session-flush). At any moment the "today" row reflects partial accumulation.
**How to avoid:** **Two viable approaches** — (a) exclude today from the baseline (use 14 days ending **yesterday**), or (b) include today and accept a small downward bias offset by the bias banner. Suggest (a): the OLS uses days `[today-14, today-1]`, and `month_to_date` separately uses days `[month_start, today]` (inclusive). Document. Flag as Open Question #5.
**Warning signs:** Run forecast at 09:00 vs 23:30 and the slope changes meaningfully — would happen under (b) but not (a).
**Confidence:** MEDIUM — design decision; planner to lock.

### Pitfall 6: Pricing-key for per-project SQL needs `MAX(s.model)` over `project_key` group
**What goes wrong:** When grouping sessions by `project_key`, multiple models can appear (a project used opus and sonnet in the same window). The current SQL uses `MAX(s.model)` per `cost.py:174`, which `cost_breakdown` handler then feeds to `compute_cost` as the pricing key. That picks ONE model arbitrarily — the project's cost is computed at that one rate, not at each session's actual rate.
**Why it happens:** The aggregation collapses multiple models into one row, but cost-per-token differs per model. This is a known approximation from Phase 13 (read `cost.py:142-145`: same `MAX(model)` trick for `dim=skill`).
**How to avoid:** Phase 13 accepted this approximation as a v1.1 lock. **DO NOT change it for Phase 20** — keep `MAX(s.model)` after the `cwd → project_key` swap; surface the limitation via the existing `cost_attribution` field if extended (or document in the panel description). Mirroring Phase 13 keeps consistency. Test should assert that a single-model project produces an exact total (regression guard against the Phase 13 known limitation worsening).
**Warning signs:** A multi-model project's cost differs noticeably from the sum-of-summary-rows for that project's sessions. Phase 13's `test_breakdown_sums_to_summary` (`test_cost_router.py:134-149`) only validates `dim=model` exact equality; the project dim isn't pinned to a row-by-row exactness.
**Confidence:** [VERIFIED — `cost.py:142-145, 166-178`; `test_cost_router.py:134-149`]

### Pitfall 7: Frontend forecasts a banner from `partial_month_bias` instead of `days_elapsed`
**What goes wrong:** UI engineer wires the banner to `data.days_elapsed < 7` instead of the server-computed `data.partial_month_bias` flag. Now business logic is duplicated client-side; future server tweak (e.g., switching to "first 5 days" or "first 10 days" if the policy changes) requires a UI change too.
**Why it happens:** Forgetting "server is source of truth for thresholds" (Phase 19 SKLP-09 lesson — STATE.md L121).
**How to avoid:** Backend response carries `partial_month_bias: bool`. UI consumes the boolean directly. UI never derives from `days_elapsed`. Add a unit test that mocks the response with `days_elapsed=10, partial_month_bias=true` (synthetic divergence) — the banner should still render.
**Warning signs:** Banner stops showing if the planner relaxes the threshold; or banner shows when the server says it shouldn't.
**Confidence:** [VERIFIED — Phase 19 STATE.md L121 establishes the pattern]

### Pitfall 8: New `/cost` route added without registering in nav / route tree
**What goes wrong:** Engineer adds `frontend/src/routes/cost.tsx` but the route tree codegen wasn't run, or the NavBar wasn't extended, leaving the new route 404 in production.
**Why it happens:** TanStack Router's file-based routing requires the codegen plugin to run (`@tanstack/router-plugin@1.167.26` per `STACK.md:58`); `routeTree.gen.ts` is auto-generated.
**How to avoid:** Run `pnpm dev` or `pnpm build` once after adding the file — codegen runs as part of Vite plugin pipeline. Update NavBar in `frontend/src/components/shell/NavBar.tsx` (verify path) to include a `/cost` link if the planner picks Option A. Skipping the NavBar update is a common miss.
**Warning signs:** New route works at `/cost` directly but no nav entry exists.
**Confidence:** [VERIFIED — `STRUCTURE.md:91-94, 198-203`]

## Code Examples

### Existing pattern: read-time cost computation (DO NOT MODIFY)
```python
# Source: backend/cmc/pricing.py:56-86
def compute_cost(
    model: str,
    input: int,
    output: int,
    cache_read: int,
    cache_create_5m: int,
    cache_create_1h: int,
    rates: dict[str, dict[str, Decimal]],
) -> Decimal:
    """Read-time cost computation. Returns Decimal(0) on lookup miss + bumps counter."""
    if model not in rates:
        for kind, n in (
            ("input", input), ("output", output), ("cache_read", cache_read),
            ("cache_create_5m", cache_create_5m), ("cache_create_1h", cache_create_1h),
        ):
            if n:
                unpriced_tokens[(model, kind)] += n
        return Decimal(0)
    r = rates[model]
    return (
        Decimal(input)           * r["input_per_mtok"]            / _MTOK +
        Decimal(output)          * r["output_per_mtok"]           / _MTOK +
        Decimal(cache_read)      * r["cache_read_per_mtok"]       / _MTOK +
        Decimal(cache_create_5m) * r["cache_create_5m_per_mtok"]  / _MTOK +
        Decimal(cache_create_1h) * r["cache_create_1h_per_mtok"]  / _MTOK
    )
```

### Existing pattern: route slot in cost.py
```python
# Source: backend/cmc/api/routes/cost.py:85-122 (cost_summary handler — pattern to mirror for forecast)
@router.get("/cost/summary", response_model=CostSummaryResponse)
async def cost_summary(
    db: AsyncSession = Depends(get_session),
    range_: CostRange = Query("7d", alias="range"),
) -> CostSummaryResponse:
    rates = await load_rates(db)
    since_dt = _range_start(range_)
    rows = (await db.execute(_SUMMARY_SQL, {"since": since_dt.date().isoformat()})).mappings().all()
    items: list[CostByModelRow] = []
    total = Decimal(0)
    rates_dates: list[date] = []
    for r in rows:
        cost = compute_cost(...)
        total += cost
        ...
    return CostSummaryResponse(
        range=range_, rates_as_of=rates_as_of, total_usd=total, by_model=items,
    )
```

### Existing pattern: per-project SQL with `project_key` (mirror this for the cost SQL refactor)
```sql
-- Source: backend/cmc/api/routes/skills.py:1337-1359 (_PROJECTS_TOKEN_SQL — verbatim)
WITH skill_sessions AS (
  SELECT DISTINCT s.session_id, s.project_key, s.model,
                  s.tokens_input, s.tokens_output, s.tokens_cache_read,
                  s.tokens_cache_create_5m, s.tokens_cache_create_1h
  FROM otel_events o
  JOIN sessions s ON s.session_id = o.session_id
  WHERE o.event_name = 'skill_activated'
    AND o.attrs_skill_name = :name
    AND o.ts >= datetime(:since)
    AND s.project_key != ''
)
SELECT
  project_key,
  COALESCE(SUM(tokens_input), 0)            AS tokens_input,
  COALESCE(SUM(tokens_output), 0)           AS tokens_output,
  COALESCE(SUM(tokens_cache_read), 0)       AS tokens_cache_read,
  COALESCE(SUM(tokens_cache_create_5m), 0)  AS tokens_cache_create_5m,
  COALESCE(SUM(tokens_cache_create_1h), 0)  AS tokens_cache_create_1h,
  MAX(model)                                AS model
FROM skill_sessions
GROUP BY project_key

-- Equivalent shape for cost.py — refactor _BREAKDOWN_BY_PROJECT_SQL to:
SELECT
  s.project_key                               AS key,
  COALESCE(SUM(s.tokens_input), 0)            AS tokens_input,
  COALESCE(SUM(s.tokens_output), 0)           AS tokens_output,
  COALESCE(SUM(s.tokens_cache_read), 0)       AS tokens_cache_read,
  COALESCE(SUM(s.tokens_cache_create_5m), 0)  AS tokens_cache_create_5m,
  COALESCE(SUM(s.tokens_cache_create_1h), 0)  AS tokens_cache_create_1h,
  MAX(s.model)                                AS model
FROM sessions s
WHERE s.started_at >= :since
  AND s.project_key != ''
GROUP BY s.project_key
```

### Existing pattern: TanStack Query hook + key factory
```typescript
// Source: frontend/src/lib/queries.ts:285-321 (skill-cost / skill-projects hooks — pattern to mirror)
export const qk = {
  // ...existing entries...
  // ADD:
  // costSummary: (range: CostRange) => ['cost', 'summary', range] as const,
  // costBreakdown: (dim: BreakdownDim, range: CostRange) => ['cost', 'breakdown', dim, range] as const,
  // costForecast: () => ['cost', 'forecast'] as const,
} as const

// Pattern from queries.ts:285-291:
export const useSkillCost = (name: string, range: SkillRange) =>
  useQuery<SkillCostResponse>({
    queryKey: qk.skillCost(name, range),
    queryFn: () => api.skillCost(name, range),
    refetchInterval: 60_000,
    staleTime: 45_000,
  })
```

### Existing pattern: Decimal-as-string display in panel
```tsx
// Source: frontend/src/components/panels/SkillCostCard.tsx:75-89 (KpiTile + Decimal-string)
<KpiTile
  label="Total cost"
  value={
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 'var(--space-2xs)' }}>
      <span>{`$${data.cost_usd}`}</span>      {/* template literal — never Number() */}
      ...
    </span>
  }
  mono
/>
```

### Existing test pattern: cost router integration test
```python
# Source: backend/tests/test_cost_router.py:94-119 (pattern to mirror for forecast endpoint test)
async def test_cost_summary_returns_decimal_strings(client) -> None:
    """ANLY-04 — Decimal serialized as JSON string, not float (Anti-Pattern guard)."""
    await _seed_default_token_usage(client)
    r = await client.get("/api/cost/summary?range=7d")
    assert r.status_code == 200, r.text
    payload = r.json()
    assert isinstance(payload["total_usd"], str), (
        f"expected string, got {type(payload['total_usd'])}: {payload['total_usd']!r}"
    )
    for row in payload["by_model"]:
        assert isinstance(row["cost_usd"], str)
```

## Decimal / OLS Implementation Notes

### Decimal Context (inherit, do not re-set)
- **Precision:** 28 digits (`getcontext().prec = 28`) — set in `cmc/pricing.py:34`. Inherited globally per Python decimal module semantics.
- **Rounding:** `ROUND_HALF_EVEN` (bankers' rounding) — `pricing.py:35`.
- **Why bankers':** Financial industry standard; minimizes systematic upward/downward bias on tie-breaks vs `ROUND_HALF_UP`.
- **Forecast module obligation:** Reference the precedent in module docstring; do NOT call `getcontext()` again. If a future refactor splits the worker process from the API process, the forecast module must still be imported in a path that imports `cmc.pricing` first — which it will, because `compute_cost` is a dependency. [VERIFIED — `pricing.py:34-35` source]

### OLS Closed-Form (sketch — coder writes the actual code)
For series of 14 cost values `[c_0, c_1, ..., c_13]` indexed by day offset `x ∈ [0, 13]`:
- `mx = sum(xs) / 14 = Decimal('6.5')`
- `my = sum(ys) / 14`
- `numerator = sum((x - mx) * (y - my) for x, y in zip(xs, ys))`
- `denominator = sum((x - mx) ** 2 for x in xs)` — for `xs = [0..13]`, this is the constant `Decimal('227.5')`
- `slope = numerator / denominator`
- `intercept = my - slope * mx`

For projection out to day `D` (where `D = days_in_month - 1` indexed from forecast-day-0):
- `predicted_value_at_day_D = intercept + slope * D` (per-day cost)
- For "month total," sum predictions across all days of the month: but **simpler closed form**: `month_total = days_in_month * (intercept + slope * (days_in_month - 1) / Decimal(2))` — this is the trapezoidal sum of the linear projection.

### Pitfalls to flag in the unit test suite
- Zero-variance Y series (all 14 days identical cost) → `denominator > 0` (xs always span 0..13) → slope = 0, intercept = mean → `month_total = days_in_month * mean`. Should NOT crash.
- Negative slope (declining cost) → projection can go negative if extrapolated far enough. Defensive clamp recommended (Pitfall 4 above).
- Large precision input (cost values with many fractional digits from `compute_cost`) → 28-digit context absorbs all of it without overflow for any realistic month-cost range.

### Tie / degenerate handling (recommend)
- If `denominator == 0` (impossible for fixed `xs = [0..13]`, but defensive): set `slope = Decimal(0)`, return `intercept = mean`.
- If fewer than 14 days have data (e.g., a fresh install at month-start): use whatever days are present; if total observed cost-bearing days `< 7`, return `insufficient_data` (use the same threshold).

## Bias-Banner + insufficient_data Semantics (proposed contract)

These are LOCKED success criteria but the wording leaves edge cases. Recommended semantics for the planner to lock in CONTEXT.md or in the plan's must_haves:

### `days_elapsed_in_month`
- **Definition:** `today.day - 1`, where `today = now_utc().date()`.
- **Day 1 of month:** `days_elapsed = 0` (no days have completed; only "today" is in progress).
- **Day 7 of month:** `days_elapsed = 6` → `< 7` → `insufficient_data = True`.
- **Day 8 of month:** `days_elapsed = 7` → `>= 7` → `insufficient_data = False`.

### `insufficient_data` flag
- **True iff** `days_elapsed_in_month < 7`.
- When `True`: response carries `projected_month_total_usd: null`, UI renders `<EmptyState>` or "Not enough data yet" message (NOT zero, NOT "$0.00").

### `partial_month_bias` flag
- **Same threshold as `insufficient_data`:** `True iff days_elapsed_in_month < 7`.
- **Note:** ROADMAP success criterion #2 says "during the first week of any month the forecast card shows a partial-month bias banner" and "banner clears once `days_elapsed >= 7`." This is the SAME boundary as `insufficient_data`.
- **Implication:** When `insufficient_data == True`, `partial_month_bias` is also `True`. When `insufficient_data == False`, `partial_month_bias` becomes `False`. They flip together at the same moment.
- **Question for planner:** If they always flip together, why two flags? **Answer:** Future-proofing. If the policy changes (e.g., 14-day calmness window for the bias banner but only 7-day floor for `insufficient_data`), the response shape already supports it. Cost: one extra bool. Recommend keeping both flags for clarity.

### Forecast response envelope (proposed)
```python
class CostForecastResponse(BaseModel):
    rates_as_of: date | None
    days_elapsed: int                 # 0..30
    days_in_month: int                # 28..31
    month_to_date_usd: Decimal        # always present, Decimal-as-JSON-string
    projected_month_total_usd: Decimal | None  # null when insufficient_data
    insufficient_data: bool
    partial_month_bias: bool
    baseline_days: int                # always 14 in v1; future-proofs flexibility
    # Optional: degenerate_baseline: bool (Pitfall 2 / Open Question #2)
```

## Endpoints (existing to reuse + new)

### Existing (reuse)
- `GET /api/cost/summary?range=` — returns total $ and by-model rows. **Not used directly by Phase 20 panels** (forecast is monthly-focused, not range-focused). May be invoked transitively by tests.
- `GET /api/cost/breakdown?dim=project&range=7d|30d` — **REQUIRES SQL REFACTOR**: change `_BREAKDOWN_BY_PROJECT_SQL` from `cwd` to `project_key` (cost.py:166-178). Response shape unchanged (key + tokens + cost_usd), only the `key` field semantics changes from raw cwd to 12-char hex. Add no-path-leakage test mirroring `test_skill_projects_no_path_leakage`.
- `GET /api/pricing/freshness` — surfaces `rates_as_of`. Not directly consumed by Phase 20 panels.

### New
- `GET /api/cost/forecast` (no query params; current month is implicit from server clock):
  - **Response:** `CostForecastResponse` shape above.
  - **Body:** Pulls last 14 daily totals from `token_usage` joined to currently-effective rates, computes Decimal-only OLS, projects to month-end, computes month-to-date.
  - **No new query params.** The 14-day baseline is hard-coded in v1 per ROADMAP (`baseline_days` in response is fixed at 14, exposed for transparency).

## Frontend Components / Hooks to Add or Modify

### NEW components
| Component | Location | Mirrors | Purpose |
|-----------|----------|---------|---------|
| `CostForecastCard` | `frontend/src/components/panels/CostForecastCard.tsx` | `SkillCostCard.tsx:43-126` | Renders MTD figure + projected total OR `insufficient_data` empty state, plus bias banner (conditional). Single KPI tile + caption. NO chart in v1 (Deferred). |
| `CostByProjectCard` | `frontend/src/components/panels/CostByProjectCard.tsx` | `SkillProjectsTable.tsx:54-126` + `ProjectBreakdownCard.tsx:70-101` | DataTable columns: project_key (12-char hex; `<code>` styled), tokens (sum input+output+cache), cost_usd (4-decimal formatting). 7d/30d `RangeToggle`. |
| (optional banner sub-component) | inline in `CostForecastCard.tsx` | `cmc-card-grid` style | Trivial; no new ui primitive needed. |

### NEW hooks (in `queries.ts`)
| Hook | Cadence | Source pattern |
|------|---------|---------------|
| `useCostForecast()` | 60s / 45s | `useSkillCost` (`queries.ts:285-291`) |
| `useCostBreakdown(dim: BreakdownDim, range: CostRange)` | 60s / 45s | `useSkillCost` |

### NEW api fetcher methods (in `lib/api.ts`)
| Method | Returns | Source pattern |
|--------|---------|---------------|
| `api.costForecast()` | `CostForecastResponse` | `api.skillCost` (`api.ts:~1074`) |
| `api.costBreakdown(dim, range)` | `CostBreakdownResponse` | `api.skillCost` |

### NEW TS types (in `lib/api.ts`)
- `CostForecastResponse` (mirrors backend Pydantic shape; all Decimal fields typed `string`).
- `CostBreakdownRow` and `CostBreakdownResponse` already implicit in backend `schemas/cost.py:33-56`; add TS mirror.
- `CostRange = '1d' | '7d' | '14d' | '30d'`; `BreakdownDim = 'model' | 'skill' | 'project'`.

### MODIFIED files
- `frontend/src/components/panels/index.ts` — add two exports.
- `frontend/src/lib/queries.ts` — add hooks + qk entries.
- `frontend/src/lib/api.ts` — add types + fetchers.
- **EITHER** `frontend/src/routes/index.tsx` (mount cards in cmc-card-grid) **OR** new file `frontend/src/routes/cost.tsx` (new dedicated cost page) — see Open Question #1.
- `frontend/src/components/shell/NavBar.tsx` (verify exact path) — add `/cost` link if Option A.

## Test Surface

### Backend pytest (location: `backend/tests/`)
| Test File | New/Existing | Tests |
|-----------|-------------|-------|
| `test_cost_forecast.py` | NEW | Unit tests for `cmc.cost.forecast` module — Decimal OLS arithmetic, edge cases (zero variance, negative slope, single-day data, insufficient data), days-in-month boundary (Jan/Feb/Apr/Dec — 28/29/30/31 day variants). |
| `test_cost_router.py` | EXTEND | Integration tests for `GET /api/cost/forecast` — Decimal-as-JSON-string assertions, `insufficient_data` flag at day 1, both flags clear at day 8 (use `pytest_freezer` per `TESTING.md:332-333`); `total_usd` Decimal-equality round-trip. **Also extend** with new tests for refactored `dim=project` SQL: total equality, structural project_key shape. |
| `test_cost_no_path_leakage.py` | NEW | Mirror `test_skill_projects_no_path_leakage` (Phase 19) — assert `/api/cost/breakdown?dim=project` response carries no `cwd`/`path`/`display_path` field; only `key` (12-char hex). |

### Frontend vitest (location: `frontend/src/components/panels/__tests__/`)
| Test File | New/Existing | Tests |
|-----------|-------------|-------|
| `CostForecastCard.test.tsx` | NEW | Renders `insufficient_data` empty-state when flag true; renders forecast number when flag false; renders bias banner when `partial_month_bias=true`; banner hidden when `partial_month_bias=false`; Decimal-string display preserved (no Number coercion); `rates_as_of` caption. Mirror `SkillCostCard.test.tsx`. |
| `CostByProjectCard.test.tsx` | NEW | Renders 7d/30d toggle; cache-seeds `qk.costBreakdown('project', '7d')` data and asserts table renders all rows; project_key column displays 12-char hex (no path-shape characters); cost column 4-decimal format; sortable columns. Mirror `SkillProjectsTable.test.tsx`. |

### Playwright e2e (location: `frontend/tests/e2e/`)
| Test File | New | Tests |
|-----------|-----|-------|
| `cost-dashboard.spec.ts` | NEW | Navigate to cost surface (route TBD per Open Question #1); assert forecast card renders; assert per-project card renders; assert path-leakage guard (no `/Users/`, no `~/` in DOM under the per-project card); 7d/30d toggle changes data. Pattern: mirror Phase 19's `skills-detail.spec.ts` path-leakage guard. |

### Wave 0 gaps
- [ ] None — all required test infrastructure exists (`test_cost_router.py`, `SkillCostCard.test.tsx` patterns, Playwright `frontend/tests/e2e/` setup with `data-testid` convention from Phase 18).
- [ ] Add `make_token_usage_bucket` invocations across at least 14 sequential days for forecast tests; existing helper at `backend/tests/conftest.py` (used by `_seed_default_token_usage` in `test_cost_router.py:55-71`).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Backend Framework | pytest 9.x + pytest-asyncio 0.24+ (`asyncio_mode = "auto"`); httpx.AsyncClient + ASGITransport |
| Frontend Framework | Vitest 4.1.5 + happy-dom 20.9.0 |
| E2E Framework | Playwright 1.59.1 (Chromium only) |
| Backend Quick run | `cd backend && uv run pytest tests/test_cost_forecast.py tests/test_cost_router.py tests/test_cost_no_path_leakage.py -x` |
| Backend Full suite | `cd backend && uv run pytest` |
| Frontend Quick run | `cd frontend && NODE_OPTIONS=--no-experimental-webstorage vitest run src/components/panels/__tests__/CostForecastCard.test.tsx src/components/panels/__tests__/CostByProjectCard.test.tsx` |
| Frontend Full suite | `cd frontend && NODE_OPTIONS=--no-experimental-webstorage vitest run` |
| E2E run | `cd frontend && npm run test:e2e -- cost-dashboard.spec.ts` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ANLY-06 | Decimal-only OLS produces correct slope/intercept on a known fixture | unit | `pytest tests/test_cost_forecast.py::test_decimal_ols_known_series -x` | ❌ Wave 0 |
| ANLY-06 | `insufficient_data=True` when day 1 of month, `False` from day 8 | unit | `pytest tests/test_cost_forecast.py::test_insufficient_data_threshold -x` | ❌ Wave 0 |
| ANLY-06 | `partial_month_bias` flag flips at same boundary | integration | `pytest tests/test_cost_router.py::test_forecast_partial_month_bias -x` | ❌ Wave 0 |
| ANLY-06 | Decimal-as-JSON-string in response (Anti-Pattern guard) | integration | `pytest tests/test_cost_router.py::test_forecast_returns_decimal_strings -x` | ❌ Wave 0 |
| ANLY-06 | `projected_month_total_usd is null` when `insufficient_data=True` | integration | `pytest tests/test_cost_router.py::test_forecast_null_when_insufficient -x` | ❌ Wave 0 |
| ANLY-06 | UI renders explanatory message (not number) on `insufficient_data` | unit | `vitest CostForecastCard.test.tsx insufficient_data` | ❌ Wave 0 |
| ANLY-06 | UI renders bias banner when `partial_month_bias=true` | unit | `vitest CostForecastCard.test.tsx bias_banner` | ❌ Wave 0 |
| ANLY-07 | `/api/cost/breakdown?dim=project` SQL groups by `project_key`, excludes `''` sentinel | integration | `pytest tests/test_cost_router.py::test_breakdown_project_groups_by_project_key -x` | ❌ Wave 0 |
| ANLY-07 | Response shape carries no path-shaped field (cwd / path / display_path) | structural | `pytest tests/test_cost_no_path_leakage.py -x` | ❌ Wave 0 |
| ANLY-07 | UI renders 12-char hex for project_key column | unit | `vitest CostByProjectCard.test.tsx project_key_format` | ❌ Wave 0 |
| ANLY-07 | UI 7d/30d toggle invalidates and refetches | unit | `vitest CostByProjectCard.test.tsx range_toggle` | ❌ Wave 0 |
| ANLY-06+07 | E2E navigation to cost surface, both cards present, path-leakage guard | e2e | `npm run test:e2e -- cost-dashboard.spec.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** Backend quick run + frontend quick run for the touched test file.
- **Per wave merge:** Full backend + frontend suite, plus the new e2e spec.
- **Phase gate:** Full pytest, full vitest, full Playwright green before `/gsd-verify-work`. Phase 18 BASELINE.md provides the lower bounds (passed >= 566 backend, >= 293 vitest); new Phase 20 tests are net adds.

### Wave 0 Gaps
- [ ] `backend/tests/test_cost_forecast.py` — covers ANLY-06 unit math
- [ ] `backend/tests/test_cost_no_path_leakage.py` — covers ANLY-07 structural guard
- [ ] `frontend/src/components/panels/__tests__/CostForecastCard.test.tsx` — covers ANLY-06 UI
- [ ] `frontend/src/components/panels/__tests__/CostByProjectCard.test.tsx` — covers ANLY-07 UI
- [ ] `frontend/tests/e2e/cost-dashboard.spec.ts` — covers both end-to-end
- [ ] (Optional) extend `backend/tests/conftest.py` with a `make_14d_token_usage(...)` factory if multiple forecast tests need the same 14-row seed

## Open Questions

### Open Question #1 — Where does the cost dashboard live? [HIGHEST LEVERAGE]

- **What we know:** ROADMAP says "the cost dashboard." There is no `/cost` route. There are no cost cards on `/` (Command page) or `/activity`. The Phase 13 cost router shipped 3 endpoints that have never been called from the frontend.
- **What's unclear:** Three options:
  - **Option A — New `/cost` route.** Most aligned with ROADMAP language. Adds ~1 file (`routes/cost.tsx`), nav update. Pattern: mirror `routes/skills.tsx`.
  - **Option B — Extend `/` Command page.** Adds two cards to `cmc-card-grid` in `routes/index.tsx`. Lowest delta. But the Command page is "live view" — historical/projection cost arguably doesn't fit.
  - **Option C — Section on `/activity`.** Activity page is "Historical view: heatmaps, OTEL firehose, sessions table" (`routes/activity.tsx:39`). Cost forecast doesn't fit "historical" framing.
- **Recommendation:** **Option A — new `/cost` route.** Aligns with ROADMAP language ("cost dashboard"), creates a natural home for the existing Phase 13 endpoints (`/cost/summary`, `/cost/breakdown` model/skill/project, `/pricing/freshness`) which currently have no UI surface, and unblocks future cost analytics (e.g., Phase 22+ if any cost-related work surfaces). This is a meaningful product decision; flag for user/planner confirmation.
- **Estimate impact:** Option A: +1 route file, +1 NavBar entry, +1 e2e spec target URL. Option B: +2 panel cards into existing route. Cost difference is small; the product positioning is the real difference.

### Open Question #2 — `degenerate_baseline` flag in response?

- **What we know:** Pitfall 2 — division-by-zero only happens with constant Y series. Pitfall 4 — negative slope can produce a counterintuitive negative projection.
- **What's unclear:** Should the response carry an explicit `degenerate_baseline: bool` flag (set when `slope == 0` due to constant Y, or when Decimal division would otherwise fail)? Or treat as a normal-case "slope=0" forecast?
- **Recommendation:** Treat as normal slope=0 forecast (`projected = mean * days_in_month`) and emit no extra flag. The bias banner already covers the "be cautious" case.

### Open Question #3 — `days_elapsed` semantics

- **What we know:** ROADMAP says "`days_elapsed < 7`." Two interpretations exist (calendar days from month-start vs. cost-bearing days).
- **What's unclear:** Which interpretation? The simpler one (`today.day - 1`) is also the user's natural mental model. The cost-bearing interpretation handles "fresh install with no prior data" but is less predictable.
- **Recommendation:** Use `today.day - 1` (calendar). Document explicitly in the forecast docstring.

### Open Question #4 — Negative-projection clamp?

- **What we know:** Pitfall 4 — a steep declining 14d baseline can extrapolate to a forecast lower than current MTD. This is mathematically correct but counterintuitive to users.
- **What's unclear:** Should we clamp `projected_month_total_usd = max(month_to_date_usd, raw_projection)`?
- **Recommendation:** Do NOT clamp. The bias banner is the design lever for managing user expectations during week 1. After week 1, an honest projection — even if downward — is more informative than a clamped value. Document explicitly: "Projection can fall below MTD if the 14d trend is sharply declining; this is expected and indicates spending is decelerating."

### Open Question #5 — Include or exclude today from the 14d baseline?

- **What we know:** Pitfall 5 — today's `token_usage` row reflects partial accumulation; including it biases slope downward.
- **What's unclear:** Use `[today-14, today-1]` (excludes today) or `[today-13, today]` (includes today)?
- **Recommendation:** Exclude today. The 14d baseline becomes "the last 14 *complete* days." This makes forecast stable across the day (running it at 09:00 vs 23:30 gives the same answer). MTD stays inclusive of today.

### Open Question #6 — Should the per-project SQL refactor preserve `rates_as_of` in response shape?

- **What we know:** The current per-project breakdown already returns `rates_as_of` (the max effective_from across modeled rates). Phase 20 wants the same shape.
- **What's unclear:** Phase 19 stripped `rates_as_of` from `SkillProjectsResponse` in favor of just `rows`. Should Phase 20 follow Phase 19 (strip it) or keep Phase 13's response shape?
- **Recommendation:** Keep Phase 13's `rates_as_of` field — it surfaces meaningful pricing-freshness information to the user, and removing it would silently break callers. The existing `CostBreakdownResponse` shape stays unchanged; only the SQL changes.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.13 | Backend | ✓ | 3.13 (per `STACK.md:18, 116`) | — |
| FastAPI | Backend | ✓ | 0.136.1 | — |
| Pydantic v2 | Response shapes | ✓ | 2.13.3 | — |
| SQLAlchemy + sqlmodel + aiosqlite | Backend SQL | ✓ | 2.0.49 / 0.0.38 / 0.22.1 | — |
| stdlib `decimal` | OLS | ✓ | 3.13 stdlib | — |
| stdlib `calendar` | days_in_month | ✓ | 3.13 stdlib | — |
| `cmc.core.time.now_utc` | POLI-06 compliance | ✓ | existing | — |
| `cmc.pricing.compute_cost` | Read-time cost | ✓ | existing | — |
| `sessions.project_key` column | ANLY-07 SQL refactor | ✓ | added in migration `0003_project_key` (Phase 19; verified at `backend/migrations/versions/0003_project_key.py`) | — |
| pytest 9.x + pytest-asyncio | Backend tests | ✓ | per `STACK.md:53` | — |
| pytest_freezer | Time-deterministic forecast tests | likely ✓ (per `TESTING.md:332-333`) | — | use `unittest.mock` to patch `now_utc` |
| Vitest 4.1.5 + happy-dom | Frontend tests | ✓ | per `STACK.md:54` | — |
| Playwright 1.59.1 | E2E | ✓ | per `STACK.md:55` | — |
| @tanstack/react-query 5.100.5 | Hooks | ✓ | per `STACK.md:37` | — |
| Recharts 3.8.1 | NOT NEEDED for v1 of forecast (no chart) | ✓ | per `STACK.md:43` | — |
| `data/pricing.json` | Pricing seed | ✓ | committed | — |
| `data/cmc.db` | Test fixtures use tmp SQLite | ✓ (real SQLite via `client` fixture) | — | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

## Project Constraints (from CLAUDE.md)

> No `./CLAUDE.md` exists at the project root. (Verified by `ls /Users/patrykattc/work/git/claude-mission-control/` — no CLAUDE.md present; only LICENSE, Makefile, README.md, and standard project files.)

The authoritative constraints come from:
- `.planning/PROJECT.md` (cost-engine read-time invariant — L120-121, L151)
- `.planning/codebase/CONVENTIONS.md` (naming, imports, error shapes, query-key management)
- `.planning/codebase/TESTING.md` (test patterns, framework versions, run commands)
- `.planning/STATE.md` (recent lessons; particularly L121 "server is source of truth for thresholds")
- `.planning/phases/19-skills-per-project-deltas-badges/19-RESEARCH.md` (project_key conventions, path-leakage guard, badge/delta-pill patterns)

These files have been integrated into User Constraints, Anti-Patterns, and Pitfalls sections above.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The "cost dashboard" should be a new `/cost` route (Option A) rather than added to `/` Command page | Open Question #1; Architecture Patterns (Recommended Project Structure) | Planner picks Option B/C, requires re-tooling Wave 2 task structure (no impact on Waves 0/1 backend work). Low-cost course-correct. | [ASSUMED]
| A2 | `days_elapsed` is interpreted as calendar `today.day - 1` (not "cost-bearing days") | Open Question #3; Bias-Banner section | Forecast becomes available a day earlier or later than expected on a fresh install. Doesn't change algorithm; only the boundary semantics. | [ASSUMED]
| A3 | The 14d baseline excludes today (uses last 14 complete days) | Open Question #5; Pitfall 5 | Forecast jitters across the day if implemented inclusive-of-today; symptom not silent. Easy to fix post-hoc with a one-line SQL change. | [ASSUMED]
| A4 | Negative projections are NOT clamped to MTD floor | Open Question #4; Pitfall 4 | If clamped silently, forecast hides legitimate downward trend. Reverse direction (clamping unintentionally) would also hide signal. | [ASSUMED]
| A5 | `partial_month_bias` and `insufficient_data` use the SAME `days_elapsed < 7` threshold (per ROADMAP wording) | Bias-Banner section; success criteria | If they're meant to be different (e.g., 7d for one, 14d for the other), the response shape supports both flags as separate booleans — minimal rework. | [ASSUMED — based on ROADMAP language; could be confirmed by user] |
| A6 | The forecast is "month total" only (not per-model, per-skill, or per-project) | Deferred Ideas | If user wants per-model breakdown of the forecast, requires a richer response shape. ROADMAP explicitly says "monthly cost forecast figure" — singular. | [VERIFIED — ROADMAP L93] |
| A7 | The per-project SQL `WHERE s.project_key != ''` filter is correct (mirrors Phase 19) | Pitfall 1; Architecture Patterns | If filter omitted, response has a `''` sentinel row leaking the empty-key edge case. Caught by test. | [VERIFIED — `skills.py:1298, 1347` source code] |
| A8 | `MAX(s.model)` continues to be the pricing-key choice for the project breakdown row, accepting Phase 13's known multi-model approximation | Pitfall 6 | Multi-model projects may show slightly off totals vs. summing per-session. Already accepted as v1.1 limitation. | [VERIFIED — `cost.py:142-145, 166-178` source code] |
| A9 | No CLAUDE.md exists at project root | Project Constraints | If a CLAUDE.md is added later, planner should re-read; current research is based on what's in the repo at HEAD on 2026-05-06. | [VERIFIED — `ls` confirms absence] |

**Items in `[ASSUMED]` rows (A1–A5) need user/planner confirmation before locking decisions.** Recommend the planner addresses them in `/gsd:discuss-phase` if invoked, or pin them as PLAN-level must_haves with adversarial tests catching the non-locked alternative.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Cost stored as `$` columns in derived tables | Tokens stored, `$` computed at read time via `compute_cost` + pricing window | v1.1 Phase 13 (`PROJECT.md:120-121`) | Pricing edits self-correct historical totals; never need a backfill event. **PHASE 20 MUST PRESERVE.** |
| Raw `cwd` exposed in API responses | `project_key` (sha1[:12] of realpath) — only project-shaped value the user sees | Phase 19 SKLP-08 (`migrations/versions/0003_project_key.py`) | Path-leakage prevention; ANLY-07 must update cost SQL to comply. |
| `Field(default_factory=datetime.utcnow)` | `Field(default_factory=now_utc)` — `cmc.core.time.now_utc` | Phase 18 POLI-06 (`backend/cmc/core/time.py:36-44`) | All new datetime work in Phase 20 must use `now_utc()`. |
| Inlined `refetchInterval` in panels | Cadence encoded in `frontend/src/lib/queries.ts` only | Phase 14 SKIL-04 (`queries.ts:1-17`) | New cost hooks add cadence to `queries.ts`, not to components. |
| `Number(decimal_string)` in display code | Template literal `` `$${decimal_string}` `` | Phase 14 SKLP-02 / Pitfall 5 (`SkillCostCard.tsx:9-14`) | Phase 20 follows verbatim. |
| Test-id naming ad-hoc | Kebab-case `feature-component-element` | Phase 18 POLI-08 (`frontend/tests/e2e/README.md`) | New test-ids for cost cards must follow. |

**Deprecated/outdated:** None applicable to this phase.

## Sources

### Primary (HIGH confidence)
- `backend/cmc/api/routes/cost.py` (read in full) — Phase 13 cost router; CRITICAL FINDING: `_BREAKDOWN_BY_PROJECT_SQL` at L166-178 still groups by `cwd`, requires refactor
- `backend/cmc/api/schemas/cost.py` (read in full) — Pydantic v2 Decimal-as-JSON-string contract
- `backend/cmc/pricing.py` (read in full) — `compute_cost`, `load_rates`, Decimal context (`prec=28`, `ROUND_HALF_EVEN` at L34-35)
- `backend/cmc/core/time.py` (read in full) — POLI-06 `now_utc()` factory
- `backend/cmc/core/project_key.py` (read in full) — Phase 19 `compute_project_key`
- `backend/migrations/versions/0003_project_key.py` (read in full) — Phase 19 schema migration & backfill semantics
- `backend/cmc/db/models/sessions.py` (read in full) — `project_key` column definition (L27-33)
- `backend/cmc/db/models/token_usage.py` (read in full) — Daily-rollup timeseries source (L15-35)
- `backend/cmc/api/routes/skills.py:1260-1359` (read) — Per-project SQL pattern to mirror (`_PROJECTS_PERCENTILE_SQL`, `_PROJECTS_TOKEN_SQL`)
- `backend/tests/test_cost_router.py:1-180` (read) — Integration test patterns; seed helpers; Decimal-string assertions
- `frontend/src/components/panels/SkillCostCard.tsx` (read in full) — Decimal-string display, KpiTile, RangeToggle
- `frontend/src/components/panels/SkillProjectsTable.tsx` (read in full) — DataTable + project_key display, fmtCost helper
- `frontend/src/components/panels/ProjectBreakdownCard.tsx` (read in full) — RangeAll toggle pattern (note: NOT cost; OPNL-10 sessions/tokens)
- `frontend/src/lib/queries.ts` (read in full) — qk factory, hook patterns, cadence buckets (60s daily aggregate at L227-269)
- `frontend/src/lib/api.ts:540-580, 900-980, 1086` (read) — Response type pattern, fetcher infra, skillProjects shape
- `frontend/src/routes/index.tsx` (read in full) — Command page layout
- `frontend/src/routes/activity.tsx` (read in full) — Activity page layout
- `frontend/src/components/ui/index.ts` (read in full) — UI primitive barrel exports
- `.planning/REQUIREMENTS.md` (grep ANLY-06/07) — Requirement specifications
- `.planning/ROADMAP.md` (read Phase 20 section + adjacent) — Success criteria, locked decisions
- `.planning/PROJECT.md:120-121, 151, 204` (grep) — v1.1 read-time invariant
- `.planning/STATE.md:8, 112, 119, 121, 146` (grep) — Recent lessons including server-is-source-of-truth-for-thresholds
- `.planning/codebase/STACK.md` (read in full) — Dependency versions and platform
- `.planning/codebase/CONVENTIONS.md` (read in full) — Naming, imports, error shapes, qk management
- `.planning/codebase/TESTING.md` (read in full) — Test framework + patterns
- `.planning/codebase/STRUCTURE.md` (read in full) — Where to add new code
- `.planning/phases/19-skills-per-project-deltas-badges/19-RESEARCH.md:1-71` (read) — Phase 19 research format reference + locked decisions affecting Phase 20

### Secondary (MEDIUM confidence)
- `.planning/config.json` — `nyquist_validation` not explicitly set; `workflow.research/plan_check/verifier: true`. Validation Architecture section included per default behavior.

### Tertiary (LOW confidence)
- None. All claims are grounded in repo evidence at HEAD.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All deps already in repo; versions verified via `STACK.md` (dated 2026-05-02; pre-checked against `pyproject.toml`/`package.json` paths)
- Architecture (existing patterns to mirror): HIGH — Mirrors are Phase 13/14/19 code at HEAD (commit `b729ecc`); read in full
- Architecture (new module structure): MEDIUM — `cmc/cost/` package does not exist; structure derived from `cmc.pricing` precedent + repo conventions; no precedent for the exact path
- Pitfalls: HIGH — Decimal-as-JSON-string, path leakage, time-factory ban, query-key family conventions are all repo-verified
- OLS / Decimal arithmetic correctness: HIGH (math) + MEDIUM (boundary semantics) — math is closed-form; boundaries (`days_elapsed`, today-inclusion) need user lock
- Cost dashboard surface decision: MEDIUM — three viable options; no precedent route exists; recommendation given but flagged for confirmation
- ANLY-07 SQL refactor blocker: HIGH — verified by direct source read (`cost.py:166-178` vs `skills.py:1298,1347`)

**Research date:** 2026-05-06
**Valid until:** 2026-06-05 (~30 days for stable backend; 7 days if Pydantic / FastAPI / TanStack Query release a new major version)

## RESEARCH COMPLETE
