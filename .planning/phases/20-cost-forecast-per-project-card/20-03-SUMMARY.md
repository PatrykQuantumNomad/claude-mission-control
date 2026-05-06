---
phase: 20-cost-forecast-per-project-card
plan: 03
subsystem: frontend/cost-dashboard
tags: [react, tanstack-query, tanstack-router, vitest, decimal, anly-06, anly-07, cost-dashboard]
requires:
  - 20-01 (per-project SQL refactor — /api/cost/breakdown?dim=project returns 12-char hex keys)
  - 20-02 (CostForecastResponse Pydantic schema + GET /api/cost/forecast endpoint)
  - Phase 19 SkillCostCard pattern (PanelCard<TData> + KpiTile shell, Decimal-string display)
  - Phase 19 SkillProjectsTable pattern (DataTable + section-level testid + path-leakage guard)
  - Phase 19 hotfix lesson (STATE.md L121 cache-key discipline — every shape-affecting param keyed)
provides:
  - New /cost top-level route (TanStack Router file-route, sibling of /skills, /alerts)
  - CostForecastCard panel (ANLY-06): projection / MTD KpiTiles + bias banner + insufficient-data branch
  - CostByProjectCard panel (ANLY-07): sortable per-project DataTable with 7d/30d RangeToggle
  - useCostForecast() / useCostBreakdown(dim, range) hooks at 60s/45s daily-aggregate cadence
  - qk.costForecast() / qk.costBreakdown(dim, range) keyed by BOTH dim AND range
  - api.costForecast() / api.costBreakdown(dim, range) typed fetchers + fetchCostForecast / fetchCostBreakdown re-exports
  - TS types CostForecastResponse, CostBreakdownResponse, CostBreakdownRow, CostRange, BreakdownDim
  - NavBar Cost link between Skills and Alerts
affects:
  - Plan 20-04 (e2e Playwright spec consumes /cost route + section-level testids)
  - Future v1.3 ANLY-08 (confidence band) and ANLY-09 (per-project budgets) — /cost dashboard surface established
tech-stack:
  added: []
  patterns:
    - PanelCard<TData> + section-level testid (Phase 19 SKLP-08 lesson — survives all four PanelCard branches)
    - Server-source-of-truth flag consumption (data.partial_month_bias, never client-side re-derivation from days_elapsed — Pitfall 7)
    - Decimal-as-JSON-string template-literal display (NEVER Number-coerce displayed money figures — Pitfall 5)
    - Cache-key discipline: every shape-affecting param in queryKey (Phase 19 hotfix lesson)
    - File-route + nav-link + routeTree.gen.ts codegen pattern for new top-level surfaces
key-files:
  created:
    - frontend/src/components/panels/CostForecastCard.tsx
    - frontend/src/components/panels/CostByProjectCard.tsx
    - frontend/src/components/panels/__tests__/CostForecastCard.test.tsx
    - frontend/src/components/panels/__tests__/CostByProjectCard.test.tsx
    - frontend/src/routes/cost.tsx
  modified:
    - frontend/src/lib/api.ts (types + fetchers + re-exports)
    - frontend/src/lib/queries.ts (qk.costForecast/costBreakdown + hooks)
    - frontend/src/lib/__tests__/queries.test.ts (cost-key discipline assertion + surface area pin)
    - frontend/src/components/panels/index.ts (barrel)
    - frontend/src/components/shell/NavBar.tsx (Cost link)
    - frontend/src/components/shell/__tests__/NavBar.test.tsx (5-link assertion + href check)
    - frontend/src/routeTree.gen.ts (codegen)
key-decisions:
  - "Open Question #1 / Assumption A1 — NEW /cost top-level route (Option A from 20-RESEARCH.md). No existing route hosts forecast or breakdown surfaces; ROADMAP language ('the cost dashboard') implies a dedicated page."
  - "Section-level data-testid wrappers (cost-forecast-card, cost-by-project-card) survive ALL four PanelCard branches (loading/error/empty/data) — Phase 19 SKLP-08 lesson reapplied."
  - "Bias banner wired to data.partial_month_bias FLAG, never re-derived from data.days_elapsed < 7 — server is single source of truth for forecast-confidence policy (Pitfall 7)."
  - "MTD KpiTile ALWAYS rendered, even on insufficient_data branch — user always sees current month-to-date even when projection is suppressed."
  - "qk.costBreakdown(dim, range) keyed by BOTH dim AND range — Phase 19 hotfix lesson (STATE.md L121); without range in the key, /api/cost/breakdown?range=30d would corrupt the 7d cache slice."
  - "useCostForecast / useCostBreakdown both at 60s/45s — same daily-aggregate bucket as useSkillCost (cost data updates daily, not per-second). Cadence lives in queries.ts ONLY (panels never inline refetchInterval)."
  - "Decimal-as-JSON-string display via template literals only — `$${data.projected_month_total_usd}` preserves full 4-decimal precision; Number(value) coercion is type-rejected (string field) and Pitfall 5 forbidden."
metrics:
  duration: 8m
  completed: 2026-05-06
  vitest_passed_before: 306
  vitest_passed_after: 316
  vitest_delta: +10
  vitest_files_before: 68
  vitest_files_after: 70
  tsc_status: clean
  backend_pytest_status: unchanged (pre-existing Pydantic NoDecode collection error predates this plan; not a regression)
  unit_tests_added: 10  # 5 forecast + 4 by-project + 1 cost-key qk discipline test
  commits: 3
requirements: [ANLY-06, ANLY-07]
---

# Phase 20 Plan 03: Cost Dashboard Route and Cards Summary

**`/cost` route mounts CostForecastCard (ANLY-06) and CostByProjectCard (ANLY-07) — projection + MTD KpiTiles + bias banner driven by server-source-of-truth `partial_month_bias` flag, sortable per-project DataTable with 7d/30d toggle, all keyed by Decimal-as-JSON-string template literals (no Number coercion).**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-06T19:25:55Z
- **Completed:** 2026-05-06T19:33:54Z
- **Tasks:** 3
- **Files modified:** 5 created + 6 modified (+1 codegen)

## Accomplishments

- ANLY-06 user-shippable: cost-forecast figure renders when `data.insufficient_data === false`, explanatory message replaces it when true. Bias banner appears iff `data.partial_month_bias === true` (server-source-of-truth flag). MTD KpiTile always present.
- ANLY-07 user-shippable: per-project cost breakdown with 7d/30d toggle, sortable Project / Tokens / Cost columns. Project column renders 12-char hex `key` in `<code className="cmc-numeric">`; cost in 4-decimal `$0.xxxx` format (mirrors `SkillProjectsTable.fmtCost`).
- New `/cost` top-level route registered via TanStack Router file-route; routeTree.gen.ts codegen picked up the entry on first `tsc --noEmit` run.
- NavBar shows 5 links in canonical order: Command -> Activity -> Skills -> Cost -> Alerts. Cost link routes to `/cost`.
- Cache-key discipline: `qk.costBreakdown('project', '7d') !== qk.costBreakdown('project', '30d')`; tested in queries.test.ts.
- 10 new vitest tests (5 ForecastCard + 4 ByProjectCard + 1 cost-key qk assertion) all passing; full suite 316/316.
- Path-leakage runtime guard: `container.textContent` regex `/\/[A-Za-z][\w/.-]+/` does not match the rendered DOM — Phase 19 SKLP-08 dual-guard pattern reapplied (the schema half is enforced by Plan 20-01's SQL refactor + the TS schema's no-cwd/no-path-field type rejection).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add cost types + api fetchers + query hooks** — `f90ec21` (feat)
2. **Task 2: Build CostForecastCard + CostByProjectCard panels with vitest coverage** — `1fc13e1` (feat)
3. **Task 3: Mount /cost route + add NavBar entry + update NavBar test** — `96ea120` (feat)

_TDD flow per task: failing assertion(s) authored first (RED), implementation added (GREEN), full suite re-verified after each commit. No REFACTOR commits needed — code shipped clean on first pass._

## Files Created/Modified

### Created
- `frontend/src/components/panels/CostForecastCard.tsx` — ANLY-06 panel; projection / MTD KpiTiles + bias banner + insufficient-message branch + rates_as_of caption
- `frontend/src/components/panels/CostByProjectCard.tsx` — ANLY-07 panel; sortable DataTable + RangeToggle (persistKey='cost-by-project')
- `frontend/src/components/panels/__tests__/CostForecastCard.test.tsx` — 5 vitest cases covering all four user-visible branches plus the Pitfall 5 (Decimal precision) and Pitfall 7 (server-source-of-truth flag) guards
- `frontend/src/components/panels/__tests__/CostByProjectCard.test.tsx` — 4 vitest cases: happy path, path-leakage guard, range-toggle invalidation, empty-state
- `frontend/src/routes/cost.tsx` — top-level page mounting both panels in cmc-card-grid

### Modified
- `frontend/src/lib/api.ts` — added CostRange, BreakdownDim, CostBreakdownRow, CostBreakdownResponse, CostForecastResponse types; api.costForecast() / api.costBreakdown() fetchers; fetchCostForecast / fetchCostBreakdown standalone re-exports
- `frontend/src/lib/queries.ts` — added qk.costForecast() / qk.costBreakdown(dim, range) (BOTH dim AND range keyed); useCostForecast() / useCostBreakdown() at 60s/45s
- `frontend/src/lib/__tests__/queries.test.ts` — cost-key discipline assertion (dim AND range both discriminate); surface area pin updated 32 -> 34 callable exports
- `frontend/src/components/panels/index.ts` — barrel export for the two new panels
- `frontend/src/components/shell/NavBar.tsx` — Cost link added between Skills and Alerts
- `frontend/src/components/shell/__tests__/NavBar.test.tsx` — in-memory router bootstraps /cost + /alerts; 5-link count assertion + Cost href check
- `frontend/src/routeTree.gen.ts` — TanStack Router codegen picked up /cost FileRoute on first `tsc --noEmit`

## Decisions Made

See frontmatter `key-decisions` for the full list. Highlights:

- **NEW /cost route (Option A from 20-RESEARCH.md, Open Question #1).** No existing route precedented hosting forecast / breakdown surfaces; ROADMAP language implies a dedicated dashboard.
- **Bias banner driven by `data.partial_month_bias` flag, NEVER from `data.days_elapsed < 7` re-derivation** (Pitfall 7). The adversarial test (`days_elapsed: 10` + `partial_month_bias: true`) confirms the UI consumes the flag verbatim, ready for any future server-side policy change.
- **MTD KpiTile always rendered**, even on the insufficient-data branch — operator visibility into current month-to-date is independent of forecast confidence.
- **Cache-key discipline: BOTH dim and range in `qk.costBreakdown`** — Phase 19 hotfix lesson (STATE.md L121) carried forward. Tested via `expect(qk.costBreakdown('project', '7d')).not.toEqual(qk.costBreakdown('project', '30d'))`.
- **Cadence centralization preserved** — `useCostForecast` / `useCostBreakdown` cadence (60s/45s) lives in `queries.ts` only; panels never inline `refetchInterval` per project convention (Phase 14 file header).

## Deviations from Plan

None — plan executed exactly as written. All three task contracts (types/fetchers/hooks; panels + tests; route + nav + test) shipped on the first GREEN pass.

Three implementation choices the plan left open (fully within plan guidance) that I selected:

1. **CostByProjectCard initial sort = `cost desc`** (most-expensive project first). Plan called for sortable Project/Tokens/Cost columns and didn't pin a default; cost-desc is the canonical "where is my money going" view (mirrors SkillProjectsTable's `count desc` rationale of surface-the-most-active-row-first).
2. **CostForecastCard `empty.when: () => false`** — the forecast endpoint always returns a body (per Plan 20-02's two-phase handler), so PanelCard's empty branch is a network-stub safeguard only. The "not enough data" UX is handled inside the data renderer via `data.insufficient_data`, exactly as the plan specifies. This avoids double-handling the same empty signal in two places.
3. **`<code className="cmc-numeric">`** for project-key cells (matching `SkillProjectsTable`'s existing precedent), not `<code className="cmc-mono">` as the plan's example sketch suggested. The codebase uses `cmc-numeric` for tabular-numerics in DataTable cells; staying consistent with Phase 19's pattern.

## Issues Encountered

- **Stash/pop interaction during pre-existing-pytest verification.** Running `git stash` to verify the backend Pydantic `NoDecode` ImportError was pre-existing (and not caused by this plan's frontend-only changes) caused a routeTree.gen.ts conflict on `git stash pop`. Resolved by `git checkout -- frontend/src/routeTree.gen.ts` and re-popping; all Plan 20-03 changes recovered intact (NavBar.tsx, NavBar.test.tsx, routeTree.gen.ts, routes/cost.tsx). Final post-recovery file states verified by direct `Read`. The pytest collection error is **pre-existing and predates this plan** — confirmed by reproducing it on the stashed (pre-Plan-20-03) tree.

## Next Phase Readiness

- ROADMAP success criteria #1, #2, #3 user-visible; Plan 20-04 Playwright e2e is the final coverage layer (path-leakage at the wire / DOM / e2e-page levels = three independent guards).
- /cost route surface established for future v1.3 work — ANLY-08 (forecast confidence band) and ANLY-09 (per-project budgets) can compose alongside the two existing cards without further routing decisions.
- Phase 19 cache-key-discipline lesson carried forward: every TanStack-Query hook param affecting response shape is in the queryKey. Pattern documented in `key-decisions` for Phase 21+.

## Self-Check

- [x] frontend/src/components/panels/CostForecastCard.tsx EXISTS
- [x] frontend/src/components/panels/CostByProjectCard.tsx EXISTS
- [x] frontend/src/components/panels/__tests__/CostForecastCard.test.tsx EXISTS
- [x] frontend/src/components/panels/__tests__/CostByProjectCard.test.tsx EXISTS
- [x] frontend/src/routes/cost.tsx EXISTS
- [x] commit f90ec21 (Task 1) in `git log --oneline`
- [x] commit 1fc13e1 (Task 2) in `git log --oneline`
- [x] commit 96ea120 (Task 3) in `git log --oneline`
- [x] vitest 316/316 passing (was 306 baseline + 10 new)
- [x] tsc clean
- [x] qk.costBreakdown('project', '7d') !== qk.costBreakdown('project', '30d')

## Self-Check: PASSED

---
*Phase: 20-cost-forecast-per-project-card*
*Completed: 2026-05-06*
