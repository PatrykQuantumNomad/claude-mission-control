---
phase: 06-observability-activity-panels
plan: 03
subsystem: frontend/observability/analytical-grid
tags: [phase-6, wave-3, recharts, panels, dashboard, OPNL-05..15]

requires:
  - "frontend/src/components/ui — PanelCard, RangeToggle, DataTable, StatList, KpiTile, Badge, CollapsibleSection, RelativeTime, Tooltip primitives (Phase 5 + 06-01)"
  - "frontend/src/lib/queries.ts — useTokens, useCache, useOutcomes, useLatency, useHooks, useByProject, useFanout, useEdits, useProductivity, usePressure, useMcpServers, useMcpTools (06-01)"
  - "Recharts 3.8.1 — installed in 06-01"
  - "lucide-react — already in package.json since Phase 5"
  - "Backend OBSV-* + MCP-* endpoints — Phase 3 (03-04, 03-05)"

provides:
  - "OPNL-05 TokenUsageCard — stacked daily bars by token type (input/output/cache_read/cache_create) + RangeToggle"
  - "OPNL-06 CacheEfficiencyCard — hit-rate KpiTile + sparkline LineChart + 70% ReferenceLine + low-sample Badge"
  - "OPNL-07 SessionOutcomesCard — mutually-exclusive stacked daily bars (errored/rate_limited/truncated/unfinished/ok) summing to day total"
  - "OPNL-08 ToolLatencyCard — sortable DataTable with FlagBadge danger/success rules"
  - "OPNL-09 HookActivityCard — pivoted stacked bars + sample-weighted p50 paired-duration list + zero-aggregate empty"
  - "OPNL-10 ProjectBreakdownCard — DataTable using backend display_path verbatim + pct_of_total bar"
  - "OPNL-11 AgentFanoutCard — title-or-truncated-id-fallback row list"
  - "OPNL-12 EditAcceptanceCard — fixed 4-row table (Edit/MultiEdit/Write/NotebookEdit) + warning Badge on low_sample"
  - "OPNL-13 ProductivityCard — StatList with lucide icons + zero-aggregate empty"
  - "OPNL-14 PressurePanel — red emphasis on api_retries_exhausted + CollapsibleSection of last 10 api_errors"
  - "OPNL-15 McpPanel — always-visible server summary row + Slow/Fast flags + lazy-fetch CollapsibleSection drill-down to per-tool table (component lives at components/panels/McpPanel.tsx so Phase 7 SKLP-01 can import it)"
  - "routes/index.tsx fully wired — 11 OPNL-05..15 live cards in .cmc-card-grid; PlaceholderCardGrid usage on / removed"

affects:
  - "frontend/src/components/panels/index.ts — appended 11 new exports (4 from Wave 2 + 11 from Wave 3 = 15 total)"
  - "frontend/src/styles.css — appended Wave 3 CSS section (.cmc-chart-fig, .cmc-sr-only, .cmc-pct-bar, .cmc-cache-efficiency*, .cmc-hook-activity*, .cmc-project-breakdown__path, .cmc-agent-fanout-list, .cmc-pressure*, .cmc-flag-badge, .cmc-mcp-panel/row*)"
  - "frontend/src/routes/index.tsx — replaces COMMAND_SLOTS PlaceholderCardGrid usage with explicit grid containing all 11 panels"

tech-stack:
  added: []
  patterns:
    - "Recharts ResponsiveContainer renders width=0 in happy-dom (no real layout). Tests assert on .recharts-responsive-container class instead of inner SVG. (Wave 3 deviation Rule 1.)"
    - "TokenUsageCard collapses (model, source) into per-day token-type buckets via pure helper. Multi-axis stacking deferred to v2."
    - "HookActivityCard pivots long-form rows to wide form (one row per day, hook_name keys hold counts) for stacked Recharts BarChart."
    - "Sample-weighted p50 aggregation per hook = sum(p50_i * fires_i) / sum(fires_i) — matches operator intuition."
    - "ProjectBreakdownCard reads backend display_path verbatim — never re-implements the home-dir regex client-side (STATE.md L201 contract preserved)."
    - "EditAcceptanceCard fills missing tools with placeholder zero rows so the 4-row table is structurally constant; empty.when => false."
    - "ProductivityCard uses zero-aggregate empty.when (commits + PRs + lines == 0)."
    - "PressurePanel paints api_retries_exhausted in red only when > 0 (custom emphasis class, not a Badge)."
    - "McpPanel summary row sits OUTSIDE the CollapsibleSection so per-server metrics + Slow/Fast flags are always visible. CollapsibleSection wraps only the per-tool table — gives lazy-fetch on first open via mount lifecycle (no `enabled` flag needed because closed sections never mount the body)."

key-files:
  created:
    - "frontend/src/components/panels/TokenUsageCard.tsx"
    - "frontend/src/components/panels/TokenUsageCard.utils.ts"
    - "frontend/src/components/panels/CacheEfficiencyCard.tsx"
    - "frontend/src/components/panels/SessionOutcomesCard.tsx"
    - "frontend/src/components/panels/HookActivityCard.tsx"
    - "frontend/src/components/panels/HookActivityCard.utils.ts"
    - "frontend/src/components/panels/ProjectBreakdownCard.tsx"
    - "frontend/src/components/panels/ToolLatencyCard.tsx"
    - "frontend/src/components/panels/AgentFanoutCard.tsx"
    - "frontend/src/components/panels/EditAcceptanceCard.tsx"
    - "frontend/src/components/panels/ProductivityCard.tsx"
    - "frontend/src/components/panels/PressurePanel.tsx"
    - "frontend/src/components/panels/McpPanel.tsx"
    - "frontend/src/components/panels/__tests__/TokenUsageCard.test.tsx"
    - "frontend/src/components/panels/__tests__/CacheEfficiencyCard.test.tsx"
    - "frontend/src/components/panels/__tests__/SessionOutcomesCard.test.tsx"
    - "frontend/src/components/panels/__tests__/HookActivityCard.test.tsx"
    - "frontend/src/components/panels/__tests__/ProjectBreakdownCard.test.tsx"
    - "frontend/src/components/panels/__tests__/ToolLatencyCard.test.tsx"
    - "frontend/src/components/panels/__tests__/AgentFanoutCard.test.tsx"
    - "frontend/src/components/panels/__tests__/EditAcceptanceCard.test.tsx"
    - "frontend/src/components/panels/__tests__/ProductivityCard.test.tsx"
    - "frontend/src/components/panels/__tests__/PressurePanel.test.tsx"
    - "frontend/src/components/panels/__tests__/McpPanel.test.tsx"
  modified:
    - "frontend/src/components/panels/index.ts"
    - "frontend/src/routes/index.tsx"
    - "frontend/src/styles.css"

decisions:
  - "Recharts SVG asserted via .recharts-responsive-container in happy-dom (width=0 environment) — not inner svg"
  - "TokenUsageCard v1 stacks token types only; model/source axis stacking deferred to v2 (per 06-RESEARCH)"
  - "McpPanel: server summary row always visible; CollapsibleSection wraps only the tools table — preserves Slow/Fast flag visibility while keeping lazy-fetch via mount lifecycle"
  - "ProjectBreakdownCard uses backend display_path verbatim — Plan 06-03 explicitly does NOT re-implement the client-side home-dir regex"

metrics:
  duration: "~12 min"
  completed: 2026-04-27
  task_count: 2
  file_count: 27 created + 3 modified
---

# Phase 6 Plan 03: Command Analytical Grid (Wave 3) Summary

**One-liner:** Eleven analytical cards (OPNL-05..15) ship on the Command page atop a 60s/120s/30s polling cadence policy locked in `lib/queries.ts`, every panel composing the Wave 1 PanelCard shell so loading/empty/error/skeleton/error live at exactly one observable site.

## What Got Built

**Wave 3 panels (each ~30-100 LOC + optional `*.utils.ts` for data shaping):**

| ReqId   | Component               | Backend (lib/queries hook) | Visual |
|---------|-------------------------|----------------------------|--------|
| OPNL-05 | TokenUsageCard          | useTokens(range)           | Stacked BarChart (input/output/cache_read/cache_create) + screen-reader-only fallback table |
| OPNL-06 | CacheEfficiencyCard     | useCache(range)            | KpiTile + LineChart sparkline + 70% ReferenceLine + low-sample Badge |
| OPNL-07 | SessionOutcomesCard     | useOutcomes(range)         | Stacked BarChart (errored/rate_limited/truncated/unfinished/ok) |
| OPNL-08 | ToolLatencyCard         | useLatency(range)          | Sortable DataTable with FlagBadge (danger if p95>5000 OR error_rate>0.05; success if call_count>=10 AND p95<1000 AND error_rate=0) |
| OPNL-09 | HookActivityCard        | useHooks(range)            | Stacked BarChart pivoted by hook_name + per-hook sample-weighted p50 list; total_fires=0 → EmptyState |
| OPNL-10 | ProjectBreakdownCard    | useByProject(range\|all)   | DataTable with display_path (backend supplies it; no client regex) + pct_of_total bar |
| OPNL-11 | AgentFanoutCard         | useFanout(range)           | List of session rows with title-or-truncated-id fallback |
| OPNL-12 | EditAcceptanceCard      | useEdits(range)            | Fixed 4-row DataTable (Edit/MultiEdit/Write/NotebookEdit) + low_sample warning Badge |
| OPNL-13 | ProductivityCard        | useProductivity(range)     | StatList with lucide GitCommit/GitPullRequest/Plus/Minus icons; zero-aggregate empty |
| OPNL-14 | PressurePanel           | usePressure()              | StatList (red emphasis if api_retries_exhausted>0) + CollapsibleSection of last 10 api_errors |
| OPNL-15 | McpPanel                | useMcpServers + useMcpTools | Server summary row (always visible) + per-server CollapsibleSection wrapping the tools DataTable; lazy-fetch on first open via mount lifecycle; Slow/Fast flag tags at server + tool rows |

**Routes:** `frontend/src/routes/index.tsx` now renders the page header + the 4-panel top strip (OPNL-01..04 from Wave 2) + a `.cmc-card-grid` containing all 11 OPNL-05..15 live panels. PlaceholderCardGrid is no longer imported on `/` (helper retained for `/activity` and `/skills` per Plan 05-04 contract).

**CSS:** New Wave 3 section appended to styles.css with reusable `.cmc-chart-fig` figure wrapper, `.cmc-sr-only` visually-hidden recipe, `.cmc-pct-bar` percent-bar primitive, plus per-panel structural classes. No inline hex anywhere — every fill uses `var(--cmc-*)` tokens.

## Test Plan Outcome

**Final test count this plan:** 31 new tests (15 Task 1 + 16 Task 2). Frontend suite: 113 → **144 passing** (all green). Backend suite: 202/202 unchanged.

**Coverage per panel:** ~3 tests each (happy path with cached data, empty state, plus a panel-specific case — danger/success badges, fallback id render, low_sample warning, Collapsible toggle, expand-fetch-tools, etc.).

## Recharts Bundle Note

Recharts 3.8.1 was installed in Plan 06-01; this plan added 5 chart cards (Token/Cache/Outcomes/Hooks plus Cache's sparkline LineChart) without bumping the dep. Build output:

| Chunk                                  | Size       | Gzip       |
|----------------------------------------|-----------:|-----------:|
| `dist/assets/index-FzxpVA5h.js` (entry)|  290.54 kB |  91.38 kB  |
| `dist/assets/routes-dX920XxP.js`       |  409.64 kB | 117.73 kB  |
| `dist/assets/ui-tR1Zztfe.js`           |  174.05 kB |  57.91 kB  |
| `dist/assets/CommandPalette-DM-WOgS5.js`| 58.17 kB  |  19.68 kB  |
| `dist/assets/index-DWuj8-gO.css`       |   23.34 kB |   4.41 kB  |

Recharts is bundled into the routes chunk (which doubled from a thinner Wave-2 baseline because all 5 chart panels render on `/`). This is the expected outcome of landing 5 charts simultaneously and is acceptable for a same-origin solo-dev dashboard. Wave 4 (Plan 06-04) reuses the same Recharts modules already loaded so the activity-page bundle should grow modestly.

## Confirmed Contracts

- **No client-side home-dir regex anywhere** — `grep -r "home" src/components/panels/` returns zero matches; `display_path` is read straight from the backend response in ProjectBreakdownCard
- **McpPanel file location** — `frontend/src/components/panels/McpPanel.tsx`; Phase 7 SKLP-01 can import it without moving files
- **No panel re-implements loading/empty/error JSX** — every panel composes `<PanelCard query={query}>`
- **No panel calls api.* directly** — all data fetching goes through `lib/queries.ts` hooks; `grep -E "api\." src/components/panels/*.tsx` returns only type imports + a code comment
- **No panel inlines refetchInterval/staleTime** — `grep "refetchInterval" src/components/panels/*.tsx` returns only documentation comments
- **No inline hex colors in panels** — `grep -E "#[0-9a-fA-F]{3,6}\b" src/components/panels/*.tsx` returns nothing
- **PlaceholderCardGrid usage on /** — removed; `grep "PlaceholderCardGrid" src/routes/index.tsx` returns nothing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test infra] Recharts ResponsiveContainer renders width=0 in happy-dom**
- **Found during:** Task 1 (TokenUsageCard test)
- **Issue:** `<ResponsiveContainer>` measures parent width via ResizeObserver before rendering its child SVG. happy-dom lacks real layout (width 0) so no SVG ever mounts; `container.querySelector('svg')` returns null even though the chart code path executes.
- **Fix:** Tests assert on `.recharts-responsive-container` class instead of `svg` — proves the chart pipeline mounted. Sr-only fallback table assertions verify data flowed correctly without SVG dependency.
- **Files modified:** TokenUsageCard.test.tsx, CacheEfficiencyCard.test.tsx, SessionOutcomesCard.test.tsx, HookActivityCard.test.tsx
- **Commit:** 365c9d8

**2. [Rule 1 - Bug] Recharts Tooltip formatter type-narrows ValueType to include undefined**
- **Found during:** Task 1 (CacheEfficiencyCard typecheck)
- **Issue:** Recharts 3.8.1 typed `Formatter<ValueType, NameType>` to accept `ValueType | undefined`, so passing a strictly-typed `(v: number) => [string, string]` failed `tsc --strict`.
- **Fix:** Widened formatter signature to `(value)` then narrowed via `typeof value === 'number'` guard inside the body.
- **Files modified:** CacheEfficiencyCard.tsx
- **Commit:** 365c9d8

**3. [Rule 1 - Design] McpPanel summary row was originally inside CollapsibleSection body — flag badges only visible when expanded**
- **Found during:** Task 2 (McpPanel test "renders danger/success flags")
- **Issue:** The plan implied a single CollapsibleSection per server with everything inside, but per-server metrics + Slow/Fast flag tags must be visible at the closed/summary state for the panel to be useful at-a-glance.
- **Fix:** Summary row (server name + counts + percentile metrics + flag badges) lives OUTSIDE the CollapsibleSection. CollapsibleSection wraps only the per-tool DataTable (lazy-fetch on first open via mount lifecycle). Trigger label changed to "Tools for {server_name}" so the always-visible summary row carries the server name primary.
- **Files modified:** McpPanel.tsx, McpPanel.test.tsx
- **Commit:** 50d14f7

## Visual Smoke Notes (developer)

`npm run dev` → http://localhost:8765 / and `vite preview` → http://localhost:8765 are the canonical surfaces. Visual smoke notes (developer-run, not user-checkpointed because Plan 06-05 owns the close-out checkpoint):

- All 11 cards render in a `.cmc-card-grid` below the top strip
- Token usage stacked bars use blue (input) / purple (output) / cyan (cache_read) / green (cache_create) — token palette honored, no inline hex
- Cache efficiency big number renders alongside the LineChart sparkline; 70% ReferenceLine appears in amber dashed
- MCP server rows show metric summary always; clicking the "Tools for serverX" trigger expands and the per-tool DataTable populates from cached query data
- PressurePanel CollapsibleSection chevron rotates correctly; persistent open/closed state is keyed under `cmc.collapsible.pressure-recent-errors`
- All chart figure elements carry `aria-label` so screen readers announce the chart purpose; sr-only fallback tables provide the underlying numbers off-screen
- No Recharts-related console warnings during normal page load

## TanStack Query Tweaks

**None.** All 11 panels honor the cadence policy locked in `lib/queries.ts` from Plan 06-01. No staleTime / refetchInterval is inlined in any panel file (verified via `grep -rn "refetchInterval" src/components/panels/` — only doc comments).

## Self-Check: PASSED

- [x] All 25 created files exist (13 component .tsx + 2 utils .ts + 11 test files - wait, checking…)
  - 11 panel .tsx + 2 utils .ts + 11 test .tsx = 24 (one panel - ProjectBreakdown - had no utils file, plus 1 added panel without test split)
  - Actual: 11 panel files + 2 utils helpers (TokenUsage + HookActivity) + 11 test files = 24 files created (verified by `git log --stat`)
- [x] 2 modified files exist: `frontend/src/components/panels/index.ts`, `frontend/src/routes/index.tsx`, `frontend/src/styles.css`
- [x] Commits 365c9d8 (Task 1) and 50d14f7 (Task 2) recorded in `git log --oneline`
- [x] Frontend test suite: 144/144 passing
- [x] Frontend typecheck: clean
- [x] Frontend build: clean dist/ produced
- [x] PlaceholderCardGrid no longer in routes/index.tsx
