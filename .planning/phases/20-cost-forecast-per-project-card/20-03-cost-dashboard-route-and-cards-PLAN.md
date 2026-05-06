---
phase: 20-cost-forecast-per-project-card
plan: 03
type: execute
wave: 3
# why_this_split: Frontend vertical slice — new /cost route + 2 cards + 2 hooks + types + nav update + vitest. Depends on Plans 20-01 (cost.breakdown SQL is now project_key-keyed) and 20-02 (CostForecastResponse schema + /api/cost/forecast endpoint). All UI changes are tightly coupled via shared types in api.ts and shared route file; no further splitting beneficial. e2e in Plan 04.
depends_on: ["20-01", "20-02"]
files_modified:
  - frontend/src/lib/api.ts
  - frontend/src/lib/queries.ts
  - frontend/src/components/panels/CostForecastCard.tsx
  - frontend/src/components/panels/CostByProjectCard.tsx
  - frontend/src/components/panels/__tests__/CostForecastCard.test.tsx
  - frontend/src/components/panels/__tests__/CostByProjectCard.test.tsx
  - frontend/src/components/panels/index.ts
  - frontend/src/routes/cost.tsx
  - frontend/src/components/shell/NavBar.tsx
  - frontend/src/components/shell/__tests__/NavBar.test.tsx
autonomous: true
requirements: [ANLY-06, ANLY-07]
must_haves:
  truths:
    - "User navigates to /cost and sees a NEW cost dashboard route with two PanelCards: CostForecastCard (top, ANLY-06) and CostByProjectCard (below, ANLY-07)."
    - "NavBar exposes a new 'Cost' link between 'Skills' and 'Alerts'; clicking it navigates to /cost; the link is styled with cmc-navlink--active when on /cost (existing TanStack Router activeProps pattern)."
    - "CostForecastCard renders the projected month-total figure (Decimal-as-JSON-string via template literal `$${data.projected_month_total_usd}`) when `data.insufficient_data === false`."
    - "CostForecastCard renders an explanatory empty-state message ('Not enough data yet — wait until day 8 of the month for a forecast') when `data.insufficient_data === true` — never a number, never `$0.00`."
    - "CostForecastCard renders a partial-month-bias banner when `data.partial_month_bias === true`. Banner is wired to `data.partial_month_bias` (server-source-of-truth flag), NEVER to a client-side `data.days_elapsed < 7` re-derivation. (Pitfall 7 from 20-RESEARCH.md.)"
    - "CostForecastCard surfaces month_to_date_usd in a secondary KpiTile alongside the projection (so users see the actual month-to-date number even when the forecast is suppressed)."
    - "CostForecastCard surfaces `rates_as_of` as a caption beneath the KpiTile (mirrors SkillCostCard rates_as_of caption pattern)."
    - "CostByProjectCard renders a sortable DataTable with columns: project_key (12-char hex; rendered in `<code>` style), tokens (sum of input + output + cache_read + cache_create), cost_usd (4-decimal display via existing fmtCost helper from SkillProjectsTable.tsx). Has a 7d/30d RangeToggle with persistKey='cost-by-project'."
    - "CostByProjectCard rendered text contains NO `/`-prefixed strings and NO raw filesystem-path-shape values — vitest assertion mirrors SkillProjectsTable's path-leakage guard."
    - "useCostForecast() and useCostBreakdown(dim, range) hooks live in queries.ts with 60s/45s cadence (matches useSkillCost daily-aggregate bucket); cadence is NOT inlined in the panel components (Pitfall: queries.ts is the cadence source of truth)."
    - "All Decimal fields are typed as `string` in TypeScript types (CostForecastResponse, CostBreakdownResponse) — `Number()`-coercion is forbidden; template-literal rendering only."
    - "TanStack Query keys MUST include all params that affect response shape: `qk.costBreakdown(dim, range)` keys by both dim and range. (STATE.md L121 'Cache-key discipline locked' lesson from Phase 19 hotfix da592ff.)"
    - "data-testids on new components follow Phase 18 POLI-08 kebab-case feature-component-element convention: `cost-forecast-card`, `cost-forecast-card-projected`, `cost-forecast-card-bias-banner`, `cost-forecast-card-insufficient-message`, `cost-by-project-card`, `cost-by-project-card-table`."
  artifacts:
    - path: "frontend/src/lib/api.ts"
      provides: "TS types CostForecastResponse, CostBreakdownResponse, CostBreakdownRow, CostRange, BreakdownDim; api.costForecast() and api.costBreakdown(dim, range) fetcher methods"
      contains: "costForecast"
      contains_also: "costBreakdown"
    - path: "frontend/src/lib/queries.ts"
      provides: "qk.costForecast() + qk.costBreakdown(dim, range) keys; useCostForecast() + useCostBreakdown(dim, range) hooks (60s/45s)"
      contains: "useCostForecast"
      contains_also: "useCostBreakdown"
    - path: "frontend/src/components/panels/CostForecastCard.tsx"
      provides: "Net-new panel: PanelCard<CostForecastResponse> with KpiTile for projection + bias banner + insufficient-data state"
      contains: "data-testid=\"cost-forecast-card\""
      contains_also: "data.partial_month_bias"
      min_lines: 80
    - path: "frontend/src/components/panels/CostByProjectCard.tsx"
      provides: "Net-new panel: DataTable<CostBreakdownRow> grouped by project_key, with 7d/30d RangeToggle"
      contains: "data-testid=\"cost-by-project-card\""
      contains_also: "DataTable"
      min_lines: 80
    - path: "frontend/src/components/panels/__tests__/CostForecastCard.test.tsx"
      provides: "Vitest suite for forecast card: insufficient_data branch, projection branch, bias banner conditional, Decimal-string preservation"
      contains: "describe('CostForecastCard'"
      min_lines: 80
    - path: "frontend/src/components/panels/__tests__/CostByProjectCard.test.tsx"
      provides: "Vitest suite for per-project card: rendered rows, project_key 12-hex format, no-path-leakage assertion, range toggle invalidates cache"
      contains: "describe('CostByProjectCard'"
      min_lines: 80
    - path: "frontend/src/components/panels/index.ts"
      provides: "Barrel export for the two new panels"
      contains: "CostForecastCard"
      contains_also: "CostByProjectCard"
    - path: "frontend/src/routes/cost.tsx"
      provides: "New /cost route mounting CostForecastCard above CostByProjectCard inside cmc-card-grid"
      contains: "createFileRoute"
      contains_also: "CostForecastCard"
    - path: "frontend/src/components/shell/NavBar.tsx"
      provides: "Adds { to: '/cost', label: 'Cost' } to the routes array between '/skills' and '/alerts'"
      contains: "to: '/cost'"
  key_links:
    - from: "frontend/src/routes/cost.tsx"
      to: "frontend/src/components/panels/CostForecastCard.tsx + CostByProjectCard.tsx"
      via: "import + JSX mount inside cmc-card-grid"
      pattern: "<CostForecastCard"
    - from: "frontend/src/components/panels/CostForecastCard.tsx"
      to: "frontend/src/lib/queries.ts (useCostForecast)"
      via: "import + useQuery hook subscription via PanelCard"
      pattern: "useCostForecast"
    - from: "frontend/src/components/panels/CostByProjectCard.tsx"
      to: "frontend/src/lib/queries.ts (useCostBreakdown)"
      via: "import + useQuery hook subscription via PanelCard"
      pattern: "useCostBreakdown"
    - from: "frontend/src/lib/api.ts (costForecast, costBreakdown)"
      to: "GET /api/cost/forecast (Plan 20-02) + GET /api/cost/breakdown?dim=project (Plan 20-01)"
      via: "fetchJson wrapper"
      pattern: "/api/cost/forecast|/api/cost/breakdown"
    - from: "frontend/src/components/shell/NavBar.tsx"
      to: "frontend/src/routes/cost.tsx"
      via: "TanStack Router Link to='/cost'"
      pattern: "to: '/cost'"
---

<objective>
Wire the two backend surfaces from Plans 20-01 (per-project SQL refactor) and 20-02 (forecast endpoint) into a user-visible cost dashboard. Per 20-RESEARCH.md Open Question #1 + Assumption A1 (researcher's recommended Option A), this plan creates a NEW `/cost` route — no precedent route exists, ROADMAP language ("the cost dashboard") implies a dedicated surface, and the existing Phase 13 endpoints (`/cost/summary`, `/cost/breakdown`, `/pricing/freshness`) currently have no UI surface.

Purpose: Complete the user-facing vertical slice for ANLY-06 + ANLY-07. ROADMAP success criteria:
- #1 (forecast figure with insufficient_data when <7 days) — UI renders the figure when ready, message when not.
- #2 (partial-month bias banner during week 1) — UI renders the banner conditionally on `data.partial_month_bias`.
- #3 (per-project cost card with 7d/30d toggle) — UI renders the breakdown sourced from `/api/cost/breakdown?dim=project`.

Output:
- `frontend/src/lib/api.ts` (EXTENDED):
  - TS types `CostRange = '1d' | '7d' | '14d' | '30d'`, `BreakdownDim = 'model' | 'skill' | 'project'`, `CostBreakdownRow`, `CostBreakdownResponse`, `CostForecastResponse` (Decimal fields → `string`, ISO date fields → `string | null`).
  - `api.costForecast(): Promise<CostForecastResponse>` → `fetchJson<CostForecastResponse>('/api/cost/forecast')`.
  - `api.costBreakdown(dim: BreakdownDim, range: CostRange): Promise<CostBreakdownResponse>` → `fetchJson<CostBreakdownResponse>(`/api/cost/breakdown?dim=${dim}&range=${range}`)`.
- `frontend/src/lib/queries.ts` (EXTENDED):
  - `qk.costForecast = () => ['cost-forecast'] as const`
  - `qk.costBreakdown = (dim: BreakdownDim, range: CostRange) => ['cost-breakdown', dim, range] as const`
  - `useCostForecast()` — refetchInterval 60_000, staleTime 45_000.
  - `useCostBreakdown(dim, range)` — refetchInterval 60_000, staleTime 45_000.
- `frontend/src/components/panels/CostForecastCard.tsx` (NEW, ~120 LOC). Pattern: mirror `SkillCostCard.tsx`'s `PanelCard<TData>` + `KpiTile` shell.
  - `<PanelCard<CostForecastResponse> reqId="ANLY-06" title="Cost Forecast" query={query} ...>`
  - When `data.insufficient_data`: render `<EmptyState>` or descriptive paragraph "Not enough data yet — wait until day 8 of the month for a forecast." Use `data-testid="cost-forecast-card-insufficient-message"`.
  - When `!data.insufficient_data`: render `<KpiTile label="Projected month total" value={`$${data.projected_month_total_usd}`} mono />` with `data-testid="cost-forecast-card-projected"`.
  - Always render `<KpiTile label="Month to date" value={`$${data.month_to_date_usd}`} mono />` (data-testid `cost-forecast-card-mtd`).
  - When `data.partial_month_bias`: render an info-styled banner above the KpiTiles: "Forecast is volatile during the first week of the month — projection will stabilize after day 7." `data-testid="cost-forecast-card-bias-banner"`.
  - Caption: `data.rates_as_of` formatted with date-only display (no time). Mirror SkillCostCard pattern.
  - Outer wrapping `<section data-testid="cost-forecast-card">` (Phase 19 SkillProjectsTable lesson — section-level testid survives all PanelCard branches).
- `frontend/src/components/panels/CostByProjectCard.tsx` (NEW, ~120 LOC). Pattern: mirror `SkillProjectsTable.tsx`'s DataTable shell + `ProjectBreakdownCard.tsx`'s RangeToggle.
  - `const [range, setRange] = useState<CostRange>('7d')`
  - `const query = useCostBreakdown('project', range)`
  - `<PanelCard<CostBreakdownResponse> reqId="ANLY-07" title="Cost by Project" query={query} trailing={<RangeToggle ...persistKey="cost-by-project" />} empty={{ when: (d) => d.rows.length === 0, dataNoun: 'project cost data' }}>`
  - DataTable columns:
    - Project: `row.key` rendered inside `<code className="cmc-mono">`. Sortable alphabetically.
    - Tokens: `row.tokens_input + row.tokens_output + row.tokens_cache_read + row.tokens_cache_create_5m + row.tokens_cache_create_1h`. Display via `nf.format(...)` (existing Intl.NumberFormat pattern).
    - Cost: `$${row.cost_usd}` with 4-decimal formatting (mirror SkillProjectsTable.tsx fmtCost helper).
  - RangeToggle options: `[{ value: '7d', label: '7d' }, { value: '30d', label: '30d' }]`.
  - Outer wrapping `<section data-testid="cost-by-project-card">`; inner `data-testid="cost-by-project-card-table"` on the DataTable container.
- `frontend/src/components/panels/index.ts` — append `export { CostForecastCard } from './CostForecastCard'` and `export { CostByProjectCard } from './CostByProjectCard'`.
- `frontend/src/routes/cost.tsx` (NEW). Mirror `frontend/src/routes/skills.tsx` and `frontend/src/routes/index.tsx` for the file-route pattern (TanStack Router file-based; codegen runs on `pnpm dev` / `pnpm build`).
  ```tsx
  import { createFileRoute } from '@tanstack/react-router'
  import { CostForecastCard, CostByProjectCard } from '../components/panels'

  export const Route = createFileRoute('/cost')({
    component: CostPage,
  })

  function CostPage() {
    return (
      <div className="cmc-card-grid">
        <CostForecastCard />
        <CostByProjectCard />
      </div>
    )
  }
  ```
- `frontend/src/components/shell/NavBar.tsx` — extend the `routes` const with `{ to: '/cost', label: 'Cost' }`. Insertion point: between `'/skills'` and `'/alerts'` (so the order is Command → Activity → Skills → Cost → Alerts).
- `frontend/src/components/shell/__tests__/NavBar.test.tsx` — UPDATE the snapshot/assertion test to expect the new 'Cost' nav link (read the file before editing — the existing test asserts on the link list; add 'Cost' to the expected list).

vitest tests:
- `CostForecastCard.test.tsx` — render with cache-seeded `qk.costForecast()` data:
  1. **insufficient_data branch**: seed `{ insufficient_data: true, partial_month_bias: true, projected_month_total_usd: null, month_to_date_usd: '0.0123', days_elapsed: 3, days_in_month: 31, baseline_days: 14, rates_as_of: '2026-05-01' }` → assert the message element with testid `cost-forecast-card-insufficient-message` is in the DOM AND the element with testid `cost-forecast-card-projected` is NOT in the DOM AND the bias banner IS present.
  2. **projection branch**: seed `{ insufficient_data: false, partial_month_bias: false, projected_month_total_usd: '125.4321', ... }` → assert testid `cost-forecast-card-projected` is in the DOM with text containing `$125.4321` AND insufficient-message is NOT AND banner is NOT.
  3. **Decimal-string preservation**: assert the rendered projection text is exactly `$125.4321` (NOT `$125.43` from a Number() coercion). Pitfall guard.
  4. **bias-banner-from-flag-not-derivation**: seed adversarial divergence — `{ days_elapsed: 10, partial_month_bias: true, ... }` (synthetic — server says "still biased" even though days_elapsed > 7). Assert the banner DOES render (UI consumes the boolean, never re-derives). Pitfall 7 guard.
- `CostByProjectCard.test.tsx`:
  1. **happy path**: seed `qk.costBreakdown('project', '7d')` with 3 rows of `{ key: 'a1b2c3d4e5f6', cost_usd: '0.0234', tokens_*: ... }` → assert table renders, project_key column shows 12-char hex, cost shows `$0.0234`.
  2. **no-path-leakage rendering**: same seed, plus one adversarial row with `key: 'a1b2c3d4e5f6'` (legitimate). Use `container.textContent` regex `/\b\/[A-Za-z][\w/.-]+/` to assert no path-shape strings rendered. (Mirror Phase 19 SkillProjectsTable.test.tsx adversarial guard.)
  3. **range-toggle invalidates**: render with `range='7d'` seed; click the 30d RangeToggle; assert a new fetch fires for `qk.costBreakdown('project', '30d')`. Use `vi.spyOn(globalThis, 'fetch')` to verify.
  4. **empty state**: seed `rows: []` → PanelCard's empty branch renders.

NavBar test:
- Update `NavBar.test.tsx` to expect 5 nav links instead of 4: Command, Activity, Skills, Cost, Alerts. Add an explicit assertion `expect(screen.getByRole('link', { name: 'Cost' })).toHaveAttribute('href', '/cost')`.
</objective>

<execution_context>
@/Users/patrykattc/work/git/claude-mission-control/.claude/get-shit-done/workflows/execute-plan.md
@/Users/patrykattc/work/git/claude-mission-control/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/20-cost-forecast-per-project-card/20-RESEARCH.md
@.planning/phases/20-cost-forecast-per-project-card/20-01-cost-breakdown-project-key-refactor-PLAN.md
@.planning/phases/20-cost-forecast-per-project-card/20-02-cost-forecast-module-and-endpoint-PLAN.md
@.planning/phases/19-skills-per-project-deltas-badges/19-04-frontend-deltas-projects-badges-PLAN.md

# Existing files this plan touches or imports from (read before editing)
@frontend/src/lib/api.ts
@frontend/src/lib/queries.ts
@frontend/src/components/panels/SkillCostCard.tsx
@frontend/src/components/panels/SkillProjectsTable.tsx
@frontend/src/components/panels/ProjectBreakdownCard.tsx
@frontend/src/components/panels/index.ts
@frontend/src/components/shell/NavBar.tsx
@frontend/src/components/shell/__tests__/NavBar.test.tsx
@frontend/src/routes/skills.tsx
@frontend/src/routes/index.tsx

<interfaces>
<!-- Key types and contracts the executor needs. Use these directly — no exploration. -->

From frontend/src/components/shell/NavBar.tsx (existing structure to extend):
```tsx
const routes = [
  { to: '/', label: 'Command' },
  { to: '/activity', label: 'Activity' },
  { to: '/skills', label: 'Skills' },
  { to: '/alerts', label: 'Alerts' },
] as const
// ADD: { to: '/cost', label: 'Cost' } between Skills and Alerts.
```

From frontend/src/lib/queries.ts (existing qk + hook patterns to mirror):
```typescript
// qk shape (excerpt):
export const qk = {
  ...
  skillCost: (name: string, range: SkillRange) => ['skill-cost', name, range] as const,
  skillProjects: (name: string, range: SkillRange) => ['skill-projects', name, range] as const,
  // ADD:
  // costForecast: () => ['cost-forecast'] as const,
  // costBreakdown: (dim: BreakdownDim, range: CostRange) => ['cost-breakdown', dim, range] as const,
} as const

// Hook pattern (60s/45s daily-aggregate cadence):
export const useSkillCost = (name: string, range: SkillRange) =>
  useQuery<SkillCostResponse>({
    queryKey: qk.skillCost(name, range),
    queryFn: () => api.skillCost(name, range),
    refetchInterval: 60_000,
    staleTime: 45_000,
  })
```

From frontend/src/lib/api.ts (existing fetcher pattern to mirror):
```typescript
// API method pattern:
skillProjects: (name: string, range: SkillRange) =>
  fetchJson<SkillProjectsResponse>(
    `/api/skills/${encodeURIComponent(name)}/projects?range=${range}`,
  ),

// Type pattern:
export interface SkillProjectsResponse {
  name: string
  range: SkillRange
  rows: SkillProjectRow[]
}
```

From frontend/src/components/panels/SkillCostCard.tsx (Decimal-string display + KpiTile + RangeToggle pattern):
```tsx
// Decimal-as-JSON-string in TS: typed as `string` in the response interface;
// rendered via template literal — NEVER Number(data.cost_usd).
<KpiTile label="Total cost" value={`$${data.cost_usd}`} mono />

// RangeToggle:
<RangeToggle<SkillRange>
  value={range}
  onChange={setRange}
  options={RANGE_OPTIONS}
  persistKey={`skill-cost-${name}`}
/>
```

From frontend/src/components/panels/SkillProjectsTable.tsx (DataTable + section-level testid + path-leakage guard):
```tsx
// Outer section wrapper for testid stability across PanelCard branches:
<section data-testid="skills-detail-projects-table">
  <PanelCard<SkillProjectsResponse> ...>
    {(data) => <DataTable<SkillProjectRow> rows={data.rows} columns={[...]} />}
  </PanelCard>
</section>

// Cost formatting (mirror for CostByProjectCard):
const fmtCost = (v: string) => `$${parseFloat(v).toFixed(4)}`
// (Sort uses parseFloat-coerced value; display uses the formatted string.)
```

From frontend/src/test/utils.tsx (custom render — ALWAYS import from here):
```typescript
import { render, screen, waitFor, userEvent } from '../../../test/utils'
```

From frontend/src/components/panels/__tests__/SkillProjectsTable.test.tsx (path-leakage assertion pattern to mirror):
```typescript
// After rendering, scan the rendered DOM:
const PATH_REGEX = /\b\/[A-Za-z][\w/.-]+/
expect(container.textContent ?? '').not.toMatch(PATH_REGEX)
```

Backend response shapes (from Plans 20-01 + 20-02 — known by reading those PLANs' interfaces):
```typescript
// CostForecastResponse — from Plan 20-02
interface CostForecastResponse {
  rates_as_of: string | null            // ISO date (e.g., "2026-05-01")
  days_elapsed: number                   // 0..30
  days_in_month: number                  // 28..31
  baseline_days: number                  // always 14
  month_to_date_usd: string              // Decimal-as-JSON-string
  projected_month_total_usd: string | null  // null when insufficient_data
  insufficient_data: boolean
  partial_month_bias: boolean
}

// CostBreakdownResponse — from Plan 20-01 (shape unchanged from Phase 13;
// only the semantics of `key` shifted from raw cwd to 12-char hex)
interface CostBreakdownRow {
  key: string                            // 12-char hex when dim=project
  tokens_input: number
  tokens_output: number
  tokens_cache_read: number
  tokens_cache_create_5m: number
  tokens_cache_create_1h: number
  cost_usd: string                       // Decimal-as-JSON-string
}
interface CostBreakdownResponse {
  range: CostRange
  dim: BreakdownDim
  rates_as_of: string | null
  total_usd: string
  rows: CostBreakdownRow[]
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add cost types + api fetchers + query hooks (queries.ts + api.ts)</name>
  <files>frontend/src/lib/api.ts, frontend/src/lib/queries.ts</files>
  <behavior>
    - api.costForecast() and api.costBreakdown(dim, range) are typed and importable.
    - useCostForecast() and useCostBreakdown(dim, range) hooks subscribe to the right query keys.
    - qk.costBreakdown('project', '7d') !== qk.costBreakdown('project', '30d') — the queryKey discriminates on range. (Phase 19 hotfix lesson — STATE.md L121 cache-key discipline.)
    - qk.costForecast() === qk.costForecast() (stable identity).
    - All Decimal fields are typed `string` in TS; no `number` typing for cost values.
  </behavior>
  <action>
**Step 1a — Add types + fetchers to `frontend/src/lib/api.ts`:**

Locate the `SkillProjectsResponse` interface (around L551 per the existing file). Add the following type definitions adjacent to it (find a logical grouping point — alongside other response interfaces is fine):

```typescript
// ---- Phase 20 cost surface (ANLY-06 + ANLY-07) ---------------------------

// CostRange and BreakdownDim mirror backend cmc.api.schemas.cost Literal types.
// CostRange has 4 valid values, but the cost dashboard UI only uses 7d/30d.
export type CostRange = '1d' | '7d' | '14d' | '30d'
export type BreakdownDim = 'model' | 'skill' | 'project'

// CostBreakdownRow.key is a 12-char hex project_key when dim=project (Phase 19
// SKLP-08 invariant + Plan 20-01 SQL refactor) — NEVER a raw filesystem path.
// All Decimal fields are JSON strings; never coerce to Number for display.
export interface CostBreakdownRow {
  key: string
  tokens_input: number
  tokens_output: number
  tokens_cache_read: number
  tokens_cache_create_5m: number
  tokens_cache_create_1h: number
  cost_usd: string  // Decimal-as-JSON-string
}

export interface CostBreakdownResponse {
  range: CostRange
  dim: BreakdownDim
  rates_as_of: string | null
  total_usd: string
  rows: CostBreakdownRow[]
}

// CostForecastResponse — ANLY-06. Matches backend Pydantic CostForecastResponse
// shape (Plan 20-02). insufficient_data is server-source-of-truth (Pitfall 7).
export interface CostForecastResponse {
  rates_as_of: string | null
  days_elapsed: number
  days_in_month: number
  baseline_days: number
  month_to_date_usd: string  // Decimal-as-JSON-string, ALWAYS present
  projected_month_total_usd: string | null  // null when insufficient_data
  insufficient_data: boolean
  partial_month_bias: boolean
}
```

Then locate the `api` object's `skillProjects` method (around L1086). Add the two new fetcher methods adjacent (the cost endpoints can sit in a new section just below the skills group, or wherever the file groups cost-related fetchers — currently Phase 13 cost fetchers don't exist on `api`, so this plan creates the precedent group):

```typescript
  // Phase 20 (ANLY-06) — monthly cost forecast. Read-time computed,
  // Decimal-as-JSON-string. No query params (current month implicit).
  costForecast: () =>
    fetchJson<CostForecastResponse>('/api/cost/forecast'),

  // Phase 20 (ANLY-07) — per-project cost breakdown. dim is fixed to 'project'
  // for the Cost dashboard surface; the param is left general for future
  // dim=model or dim=skill consumers (existing endpoint, no schema change).
  // Path-leakage-resistant by Plan 20-01's SQL refactor (sessions.project_key
  // grouping, WHERE != '' filter).
  costBreakdown: (dim: BreakdownDim, range: CostRange) =>
    fetchJson<CostBreakdownResponse>(
      `/api/cost/breakdown?dim=${dim}&range=${range}`,
    ),
```

Also add the corresponding `fetch*` re-exports at the bottom of the file (mirror the L1304-1312 group):

```typescript
export const fetchCostForecast = api.costForecast
export const fetchCostBreakdown = api.costBreakdown
```

**Step 1b — Add hooks + qk entries to `frontend/src/lib/queries.ts`:**

Locate the `qk` factory (around L100+). Add new entries inside the `qk` object, in the cost-domain group (near `skillCost` / `skillProjects` for proximity to similar cadence):

```typescript
  // Phase 20 (ANLY-06) — monthly cost forecast. No params (server-clock derived).
  costForecast: () => ['cost-forecast'] as const,
  // Phase 20 (ANLY-07) — per-project cost breakdown. Both dim and range affect
  // response shape — both MUST be in the queryKey (cache-key discipline lesson
  // from Phase 19 hotfix da592ff, STATE.md L121).
  costBreakdown: (dim: BreakdownDim, range: CostRange) =>
    ['cost-breakdown', dim, range] as const,
```

Imports (top of `queries.ts`): add `BreakdownDim, CostRange, CostBreakdownResponse, CostForecastResponse` to the existing `import type { ... } from './api'` block.

Locate the 60s/45s hook bucket (around L227+, where `useTokens`, `useCache`, `useSkillCost` live) and add:

```typescript
// ----------------------------------------------------------------------------
// Phase 20 (ANLY-06 + ANLY-07) — cost dashboard. 60s/45s daily-aggregate
// cadence — same bucket as useSkillCost / useTokens (cost data updates daily,
// not per-second).
// ----------------------------------------------------------------------------

export const useCostForecast = () =>
  useQuery<CostForecastResponse>({
    queryKey: qk.costForecast(),
    queryFn: () => api.costForecast(),
    refetchInterval: 60_000,
    staleTime: 45_000,
  })

export const useCostBreakdown = (dim: BreakdownDim, range: CostRange) =>
  useQuery<CostBreakdownResponse>({
    queryKey: qk.costBreakdown(dim, range),
    queryFn: () => api.costBreakdown(dim, range),
    refetchInterval: 60_000,
    staleTime: 45_000,
  })
```

  </action>
  <verify>
    <automated>cd frontend && pnpm tsc --noEmit</automated>
    Expected: clean (no type errors).

    cd frontend && NODE_OPTIONS=--no-experimental-webstorage vitest run src/lib/__tests__/queries.test.ts
    Expected: existing queries.test.ts passes (and any new test asserting qk.costBreakdown identity — see below).

    cd frontend && grep -nE "qk\.costForecast|qk\.costBreakdown|useCostForecast|useCostBreakdown" frontend/src/lib/queries.ts
    Expected: 4+ matches (key factory + hook for each).

    cd frontend && grep -nE "costForecast|costBreakdown" frontend/src/lib/api.ts
    Expected: matches in api object methods + fetchCostForecast/fetchCostBreakdown re-exports.

    # If queries.test.ts has an existing pattern of asserting key uniqueness,
    # add one for the new hooks. Otherwise just check the new hooks compile.
    cd frontend && node -e "
      const queries = require('./src/lib/queries')
      console.log('hooks importable:', typeof queries.useCostForecast, typeof queries.useCostBreakdown)
    " 2>&1 || true
  </verify>
  <done>
    api.ts exports CostForecastResponse, CostBreakdownResponse, CostBreakdownRow, CostRange, BreakdownDim types.
    api.costForecast and api.costBreakdown are callable; fetchCostForecast and fetchCostBreakdown re-exported.
    queries.ts exports useCostForecast and useCostBreakdown with 60s/45s cadence.
    qk.costBreakdown('project', '7d') !== qk.costBreakdown('project', '30d') (different array contents, distinct cache entries).
    tsc clean.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Build CostForecastCard + CostByProjectCard panels with vitest coverage</name>
  <files>frontend/src/components/panels/CostForecastCard.tsx, frontend/src/components/panels/CostByProjectCard.tsx, frontend/src/components/panels/__tests__/CostForecastCard.test.tsx, frontend/src/components/panels/__tests__/CostByProjectCard.test.tsx, frontend/src/components/panels/index.ts</files>
  <behavior>
    - CostForecastCard renders the projection ($-prefixed Decimal-string) when insufficient_data is false.
    - CostForecastCard renders the explanatory message (testid cost-forecast-card-insufficient-message) when insufficient_data is true; the projection KpiTile is NOT in the DOM.
    - CostForecastCard renders the bias banner (testid cost-forecast-card-bias-banner) iff data.partial_month_bias is true.
    - CostForecastCard renders the bias banner from the partial_month_bias FLAG, never from days_elapsed re-derivation (Pitfall 7 adversarial test: days_elapsed=10 + partial_month_bias=true → banner SHOWS).
    - Decimal-string preservation test: rendering '125.4321' produces text containing '$125.4321' (full 4 decimals), not '$125.43' from Number-coercion.
    - CostByProjectCard renders DataTable rows from useCostBreakdown('project', range) with project_key column showing 12-char hex.
    - CostByProjectCard adversarial guard: rendered DOM textContent never matches /\b\/[A-Za-z][\w/.-]+/ (no path-shape strings).
    - CostByProjectCard 7d/30d toggle invalidates the cache: clicking '30d' triggers a fetch for qk.costBreakdown('project', '30d') (different from '7d').
    - CostByProjectCard renders empty state when rows is [].
  </behavior>
  <action>
**Step 2a — Create `frontend/src/components/panels/CostForecastCard.tsx`:**

Read `frontend/src/components/panels/SkillCostCard.tsx` first (full file) to understand the PanelCard<TData> + KpiTile + caption pattern. Then write:

```tsx
import { PanelCard, KpiTile, EmptyState } from '../ui'
import { useCostForecast } from '../../lib/queries'
import type { CostForecastResponse } from '../../lib/api'

/**
 * CostForecastCard — ANLY-06.
 *
 * Renders the monthly cost forecast: projected month-total + month-to-date
 * KpiTiles. When `insufficient_data` is true (days_elapsed < 7), suppresses
 * the projection and shows an explanatory message instead.
 *
 * The partial-month-bias banner is wired to `data.partial_month_bias`
 * (server-source-of-truth flag), NEVER derived from `data.days_elapsed < 7`
 * client-side. Pitfall 7 in 20-RESEARCH.md.
 *
 * Decimal-as-JSON-string display: template literals only — never
 * `Number(data.projected_month_total_usd)`.
 */
export function CostForecastCard() {
  const query = useCostForecast()

  return (
    <section data-testid="cost-forecast-card">
      <PanelCard<CostForecastResponse>
        reqId="ANLY-06"
        title="Cost Forecast"
        query={query}
        empty={{
          when: (d) => d == null,
          dataNoun: 'cost forecast',
        }}
      >
        {(data) => (
          <div className="cmc-cost-forecast">
            {data.partial_month_bias && (
              <div
                className="cmc-cost-forecast__bias-banner"
                data-testid="cost-forecast-card-bias-banner"
                role="note"
              >
                Forecast is volatile during the first week of the month —
                projection will stabilize after day 7.
              </div>
            )}
            <div className="cmc-cost-forecast__kpis">
              {data.insufficient_data ? (
                <div
                  className="cmc-cost-forecast__insufficient"
                  data-testid="cost-forecast-card-insufficient-message"
                >
                  Not enough data yet — wait until day 8 of the month for a
                  forecast. ({data.days_elapsed} of {data.days_in_month} days
                  elapsed.)
                </div>
              ) : (
                <KpiTile
                  label="Projected month total"
                  value={
                    <span data-testid="cost-forecast-card-projected">
                      {`$${data.projected_month_total_usd}`}
                    </span>
                  }
                  mono
                />
              )}
              <KpiTile
                label="Month to date"
                value={
                  <span data-testid="cost-forecast-card-mtd">
                    {`$${data.month_to_date_usd}`}
                  </span>
                }
                mono
              />
            </div>
            {data.rates_as_of && (
              <div className="cmc-cost-forecast__caption cmc-label">
                Rates as of {data.rates_as_of}
              </div>
            )}
          </div>
        )}
      </PanelCard>
    </section>
  )
}
```

**NOTE:** verify the `EmptyState` import is correct from `../ui`. If `EmptyState` is not present in the ui barrel, use a plain `<div>` instead. Read `frontend/src/components/ui/index.ts` first to confirm available exports.

**Step 2b — Create `frontend/src/components/panels/CostByProjectCard.tsx`:**

Read `frontend/src/components/panels/SkillProjectsTable.tsx` (full file) and `frontend/src/components/panels/ProjectBreakdownCard.tsx` (RangeToggle pattern) before writing:

```tsx
import { useState } from 'react'
import { PanelCard, DataTable, RangeToggle } from '../ui'
import { useCostBreakdown } from '../../lib/queries'
import type { CostBreakdownResponse, CostBreakdownRow, CostRange } from '../../lib/api'

const RANGE_OPTIONS = [
  { value: '7d' as const, label: '7d' },
  { value: '30d' as const, label: '30d' },
] satisfies ReadonlyArray<{ value: CostRange; label: string }>

const nf = new Intl.NumberFormat('en')

const fmtCost = (v: string) => `$${parseFloat(v).toFixed(4)}`

/**
 * CostByProjectCard — ANLY-07.
 *
 * Sortable per-project cost breakdown over a 7d/30d toggle. Sources
 * /api/cost/breakdown?dim=project — Plan 20-01 refactored that SQL to group
 * by sessions.project_key (12-char hex; never raw cwd).
 *
 * Path-leakage guard: vitest asserts container.textContent does not match
 * `/\b\/[A-Za-z][\w/.-]+/` — the same adversarial rendering check Phase 19
 * SkillProjectsTable.test.tsx uses.
 */
export function CostByProjectCard() {
  const [range, setRange] = useState<CostRange>('7d')
  const query = useCostBreakdown('project', range)

  return (
    <section data-testid="cost-by-project-card">
      <PanelCard<CostBreakdownResponse>
        reqId="ANLY-07"
        title="Cost by Project"
        query={query}
        empty={{
          when: (d) => d.rows.length === 0,
          dataNoun: 'project cost data',
        }}
        trailing={
          <RangeToggle<CostRange>
            value={range}
            onChange={setRange}
            options={RANGE_OPTIONS}
            persistKey="cost-by-project"
          />
        }
      >
        {(data) => (
          <div data-testid="cost-by-project-card-table">
            <DataTable<CostBreakdownRow>
              rows={data.rows}
              keyFn={(row) => row.key}
              columns={[
                {
                  id: 'project',
                  header: 'Project',
                  render: (row) => <code className="cmc-mono">{row.key}</code>,
                  sort: (a, b) => a.key.localeCompare(b.key),
                },
                {
                  id: 'tokens',
                  header: 'Tokens',
                  render: (row) =>
                    nf.format(
                      row.tokens_input +
                        row.tokens_output +
                        row.tokens_cache_read +
                        row.tokens_cache_create_5m +
                        row.tokens_cache_create_1h,
                    ),
                  sort: (a, b) => {
                    const ta =
                      a.tokens_input +
                      a.tokens_output +
                      a.tokens_cache_read +
                      a.tokens_cache_create_5m +
                      a.tokens_cache_create_1h
                    const tb =
                      b.tokens_input +
                      b.tokens_output +
                      b.tokens_cache_read +
                      b.tokens_cache_create_5m +
                      b.tokens_cache_create_1h
                    return ta - tb
                  },
                },
                {
                  id: 'cost',
                  header: 'Cost',
                  render: (row) => fmtCost(row.cost_usd),
                  sort: (a, b) =>
                    parseFloat(a.cost_usd) - parseFloat(b.cost_usd),
                },
              ]}
            />
          </div>
        )}
      </PanelCard>
    </section>
  )
}
```

**CRITICAL:** verify `DataTable` props by reading `frontend/src/components/ui/DataTable.tsx` and checking how `SkillProjectsTable.tsx` uses it. The exact prop names (`rows`, `columns`, `keyFn`, column `render` / `sort`) MUST match the existing primitive's contract. Adjust the JSX above if the prop names differ.

**Step 2c — Add barrel exports in `frontend/src/components/panels/index.ts`:**

Append:
```typescript
export { CostForecastCard } from './CostForecastCard'
export { CostByProjectCard } from './CostByProjectCard'
```

**Step 2d — Create `frontend/src/components/panels/__tests__/CostForecastCard.test.tsx`:**

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '../../../test/utils'
import { CostForecastCard } from '../CostForecastCard'
import { qk } from '../../../lib/queries'
import type { CostForecastResponse } from '../../../lib/api'

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
}

function Wrap({ client, children }: { client: QueryClient; children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function makeForecast(overrides: Partial<CostForecastResponse> = {}): CostForecastResponse {
  return {
    rates_as_of: '2026-05-01',
    days_elapsed: 15,
    days_in_month: 31,
    baseline_days: 14,
    month_to_date_usd: '50.0000',
    projected_month_total_usd: '125.4321',
    insufficient_data: false,
    partial_month_bias: false,
    ...overrides,
  }
}

describe('CostForecastCard', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders projection KpiTile and Decimal-string preservation when insufficient_data is false', async () => {
    const client = makeClient()
    client.setQueryData(qk.costForecast(), makeForecast({ projected_month_total_usd: '125.4321' }))
    render(<Wrap client={client}><CostForecastCard /></Wrap>)

    const projected = await screen.findByTestId('cost-forecast-card-projected')
    expect(projected.textContent).toBe('$125.4321')  // Pitfall guard: full 4 decimals preserved
    expect(screen.queryByTestId('cost-forecast-card-insufficient-message')).toBeNull()
  })

  it('renders explanatory message and hides projection when insufficient_data is true', async () => {
    const client = makeClient()
    client.setQueryData(qk.costForecast(), makeForecast({
      insufficient_data: true,
      partial_month_bias: true,
      projected_month_total_usd: null,
      days_elapsed: 3,
    }))
    render(<Wrap client={client}><CostForecastCard /></Wrap>)

    expect(await screen.findByTestId('cost-forecast-card-insufficient-message')).toBeInTheDocument()
    expect(screen.queryByTestId('cost-forecast-card-projected')).toBeNull()
    // MTD always present
    expect(screen.getByTestId('cost-forecast-card-mtd')).toBeInTheDocument()
  })

  it('renders bias banner iff partial_month_bias is true', async () => {
    const client = makeClient()
    client.setQueryData(qk.costForecast(), makeForecast({ partial_month_bias: false }))
    render(<Wrap client={client}><CostForecastCard /></Wrap>)
    expect(screen.queryByTestId('cost-forecast-card-bias-banner')).toBeNull()

    // Re-render with banner=true
    client.setQueryData(qk.costForecast(), makeForecast({ partial_month_bias: true }))
    expect(await screen.findByTestId('cost-forecast-card-bias-banner')).toBeInTheDocument()
  })

  it('renders bias banner from partial_month_bias FLAG, not days_elapsed (Pitfall 7)', async () => {
    // Adversarial: days_elapsed >= 7 (server says forecast unlocked) BUT
    // partial_month_bias is still true (synthetic divergence, future policy
    // change). UI MUST render the banner because it consumes the flag, not
    // a re-derivation.
    const client = makeClient()
    client.setQueryData(qk.costForecast(), makeForecast({
      days_elapsed: 10,
      partial_month_bias: true,
      insufficient_data: false,  // forecast IS shown
    }))
    render(<Wrap client={client}><CostForecastCard /></Wrap>)

    expect(await screen.findByTestId('cost-forecast-card-bias-banner')).toBeInTheDocument()
    expect(await screen.findByTestId('cost-forecast-card-projected')).toBeInTheDocument()
  })

  it('renders rates_as_of caption when present', async () => {
    const client = makeClient()
    client.setQueryData(qk.costForecast(), makeForecast({ rates_as_of: '2026-05-01' }))
    render(<Wrap client={client}><CostForecastCard /></Wrap>)
    expect(await screen.findByText(/Rates as of 2026-05-01/)).toBeInTheDocument()
  })
})
```

**Step 2e — Create `frontend/src/components/panels/__tests__/CostByProjectCard.test.tsx`:**

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, userEvent } from '../../../test/utils'
import { CostByProjectCard } from '../CostByProjectCard'
import { qk } from '../../../lib/queries'
import type { CostBreakdownResponse, CostBreakdownRow } from '../../../lib/api'

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
}

function Wrap({ client, children }: { client: QueryClient; children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function makeRow(overrides: Partial<CostBreakdownRow> = {}): CostBreakdownRow {
  return {
    key: 'a1b2c3d4e5f6',
    tokens_input: 1000,
    tokens_output: 500,
    tokens_cache_read: 0,
    tokens_cache_create_5m: 0,
    tokens_cache_create_1h: 0,
    cost_usd: '0.0234',
    ...overrides,
  }
}

function makeBreakdown(rows: CostBreakdownRow[], range: '7d' | '30d' = '7d'): CostBreakdownResponse {
  return {
    range,
    dim: 'project',
    rates_as_of: '2026-05-01',
    total_usd: rows.reduce((acc, r) => acc + parseFloat(r.cost_usd), 0).toString(),
    rows,
  }
}

const PATH_REGEX = /\b\/[A-Za-z][\w/.-]+/

describe('CostByProjectCard', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders project_key column as 12-char hex with cost in 4-decimal format', async () => {
    const client = makeClient()
    client.setQueryData(qk.costBreakdown('project', '7d'), makeBreakdown([
      makeRow({ key: 'a1b2c3d4e5f6', cost_usd: '0.0234' }),
      makeRow({ key: 'fedcba987654', cost_usd: '0.5000' }),
    ]))
    const { container } = render(<Wrap client={client}><CostByProjectCard /></Wrap>)

    expect(await screen.findByText('a1b2c3d4e5f6')).toBeInTheDocument()
    expect(screen.getByText('fedcba987654')).toBeInTheDocument()
    // 4-decimal cost format
    expect(screen.getByText('$0.0234')).toBeInTheDocument()
    expect(screen.getByText('$0.5000')).toBeInTheDocument()
    // No path-shape leakage in rendered DOM
    expect(container.textContent ?? '').not.toMatch(PATH_REGEX)
  })

  it('renders empty state when rows is []', async () => {
    const client = makeClient()
    client.setQueryData(qk.costBreakdown('project', '7d'), makeBreakdown([]))
    render(<Wrap client={client}><CostByProjectCard /></Wrap>)
    // PanelCard's empty branch — assert against the dataNoun text
    expect(await screen.findByText(/no project cost data/i)).toBeInTheDocument()
  })

  it('toggling 30d invalidates cache and fetches the 30d slice', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input): Promise<Response> => {
        const url = String(input)
        if (url.includes('range=30d')) {
          return new Response(
            JSON.stringify(makeBreakdown([makeRow({ key: 'thirty_day_xx' })], '30d')),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(
          JSON.stringify(makeBreakdown([makeRow({ key: 'sevenday_xxxx' })], '7d')),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      },
    )
    const client = makeClient()
    render(<Wrap client={client}><CostByProjectCard /></Wrap>)

    // Initial 7d render
    expect(await screen.findByText('sevenday_xxxx')).toBeInTheDocument()

    // Click 30d toggle (assumes RangeToggle exposes the option as a button)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /^30d$/i }))

    // Assert a new fetch fired with range=30d
    expect(await screen.findByText('thirty_day_xx')).toBeInTheDocument()
    const calls30d = fetchSpy.mock.calls.filter(([url]) => String(url).includes('range=30d'))
    expect(calls30d.length).toBeGreaterThan(0)
  })

  it('does not render any path-shape strings even with adversarial keys (no-leakage guard)', async () => {
    // Sanity check: even if a future bug accidentally seeded a cwd-like value
    // into key, the regex would catch it. We DON'T seed a leaky value here
    // (the SQL refactor in Plan 20-01 prevents it), but the assertion is
    // structural — protects against regressions.
    const client = makeClient()
    client.setQueryData(qk.costBreakdown('project', '7d'), makeBreakdown([
      makeRow({ key: 'aaaaaaaaaaaa' }),
      makeRow({ key: 'bbbbbbbbbbbb' }),
    ]))
    const { container } = render(<Wrap client={client}><CostByProjectCard /></Wrap>)
    await screen.findByText('aaaaaaaaaaaa')
    expect(container.textContent ?? '').not.toMatch(PATH_REGEX)
  })
})
```

  </action>
  <verify>
    <automated>cd frontend && NODE_OPTIONS=--no-experimental-webstorage vitest run src/components/panels/__tests__/CostForecastCard.test.tsx src/components/panels/__tests__/CostByProjectCard.test.tsx</automated>
    Expected: ~9 tests pass (5 forecast + 4 by-project).

    cd frontend && pnpm tsc --noEmit
    Expected: clean.

    cd frontend && grep -rnE 'Number\((data|row)\.(cost_usd|projected_month_total_usd|month_to_date_usd)' frontend/src/components/panels/CostForecastCard.tsx frontend/src/components/panels/CostByProjectCard.tsx
    Expected: 0 matches (no Number-coercion of Decimal-strings for display; only parseFloat for sort which is acceptable per existing fmtCost precedent).

    cd frontend && grep -nE "data-testid" frontend/src/components/panels/CostForecastCard.tsx frontend/src/components/panels/CostByProjectCard.tsx
    Expected: testids match the kebab-case feature-component-element convention (cost-forecast-card, cost-forecast-card-projected, cost-forecast-card-bias-banner, cost-forecast-card-insufficient-message, cost-forecast-card-mtd, cost-by-project-card, cost-by-project-card-table).

    cd frontend && NODE_OPTIONS=--no-experimental-webstorage vitest run
    Expected: total >= 306 + 9 = 315 passing tests; 0 failed.
  </verify>
  <done>
    CostForecastCard renders projection / insufficient-message / bias banner per the response flags.
    CostByProjectCard renders sortable per-project rows; range toggle invalidates cache; no path-shape leakage.
    9 new vitest tests pass.
    Phase 18 BASELINE.md vitest floor (>= 293) preserved (now 306+ from Phase 19, +9 from Phase 20 → 315+).
    All testids follow Phase 18 POLI-08 convention.
    No Decimal-string Number-coercion in display code.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Mount /cost route + add NavBar entry + update NavBar test</name>
  <files>frontend/src/routes/cost.tsx, frontend/src/components/shell/NavBar.tsx, frontend/src/components/shell/__tests__/NavBar.test.tsx</files>
  <behavior>
    - /cost route exists in TanStack Router file-route system; navigating to /cost renders CostPage with both panels mounted in cmc-card-grid.
    - NavBar's `routes` array contains exactly 5 entries in this order: '/', '/activity', '/skills', '/cost', '/alerts'.
    - NavBar test asserts the 'Cost' link exists with href='/cost' (or `to='/cost'` depending on the existing test pattern).
    - `pnpm build` (or `pnpm dev` codegen) regenerates `routeTree.gen.ts` with the new /cost route — verify by greping for the new entry.
  </behavior>
  <action>
**Step 3a — Create `frontend/src/routes/cost.tsx`:**

Read `frontend/src/routes/skills.tsx` (or `index.tsx`) to confirm the file-route pattern verbatim:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { CostForecastCard, CostByProjectCard } from '../components/panels'

export const Route = createFileRoute('/cost')({
  component: CostPage,
})

function CostPage() {
  return (
    <div className="cmc-card-grid">
      <CostForecastCard />
      <CostByProjectCard />
    </div>
  )
}
```

After creating the file, run codegen so `routeTree.gen.ts` picks up the new route:

```bash
cd frontend && pnpm tsc --noEmit
# (TanStack Router plugin codegens during Vite plugin pipeline; if it
# doesn't update via tsc-only, run `pnpm build` once OR `pnpm dev` and
# kill it — the generated tree updates on file watch.)
```

Confirm `frontend/src/routeTree.gen.ts` now references `/cost`:
```bash
cd frontend && grep -n "'/cost'" frontend/src/routeTree.gen.ts
# Expected: at least one match in the routesById/CostRoute interface.
```

If codegen didn't run automatically, run `pnpm build` once to force it, then revert the build artifacts (they're in dist/ and gitignored).

**Step 3b — Update `frontend/src/components/shell/NavBar.tsx`:**

Locate the existing `routes` array (currently 4 entries):

```typescript
const routes = [
  { to: '/', label: 'Command' },
  { to: '/activity', label: 'Activity' },
  { to: '/skills', label: 'Skills' },
  { to: '/alerts', label: 'Alerts' },
] as const
```

Insert `{ to: '/cost', label: 'Cost' }` between Skills and Alerts:

```typescript
const routes = [
  { to: '/', label: 'Command' },
  { to: '/activity', label: 'Activity' },
  { to: '/skills', label: 'Skills' },
  { to: '/cost', label: 'Cost' },
  { to: '/alerts', label: 'Alerts' },
] as const
```

The `Link` component's `to` prop is typed against `routeTree.gen.ts` — TanStack Router's typed routing will FAIL TO COMPILE if `/cost` isn't in the route tree. Hence Step 3a (codegen) must run before this edit takes effect; if `tsc` complains about `to: '/cost'`, kick the codegen.

**Step 3c — Update `frontend/src/components/shell/__tests__/NavBar.test.tsx`:**

Read the existing test file to see how it asserts on the link list. Most likely it iterates over the `routes` constant or asserts on link names. Patch the expectations:

```typescript
// If the existing test asserts on the count of links:
expect(screen.getAllByRole('link')).toHaveLength(5)  // was 4

// If it asserts on specific names, add Cost:
expect(screen.getByRole('link', { name: 'Command' })).toBeInTheDocument()
expect(screen.getByRole('link', { name: 'Activity' })).toBeInTheDocument()
expect(screen.getByRole('link', { name: 'Skills' })).toBeInTheDocument()
expect(screen.getByRole('link', { name: 'Cost' })).toBeInTheDocument()  // NEW
expect(screen.getByRole('link', { name: 'Alerts' })).toBeInTheDocument()

// Add an explicit href assertion for /cost:
expect(screen.getByRole('link', { name: 'Cost' })).toHaveAttribute('href', '/cost')
```

If the existing test uses snapshot matching, regenerate the snapshot:
```bash
cd frontend && NODE_OPTIONS=--no-experimental-webstorage vitest run src/components/shell/__tests__/NavBar.test.tsx -u
```

Manually inspect the diff to confirm only the expected addition (one new `<li>` with `href='/cost'` and label 'Cost') is in the snapshot delta.

  </action>
  <verify>
    <automated>cd frontend && pnpm tsc --noEmit</automated>
    Expected: clean (route-tree codegen has picked up /cost).

    cd frontend && grep -n "/cost" frontend/src/routeTree.gen.ts
    Expected: matches in routesById and the CostRoute interface.

    cd frontend && grep -n "to: '/cost'" frontend/src/components/shell/NavBar.tsx
    Expected: 1 match.

    cd frontend && NODE_OPTIONS=--no-experimental-webstorage vitest run src/components/shell/__tests__/NavBar.test.tsx
    Expected: NavBar test passes with the updated 5-link assertion.

    cd frontend && NODE_OPTIONS=--no-experimental-webstorage vitest run
    Expected: full vitest suite green (>= 315 passing now); 0 failed.

    # Manual smoke test (operator-runnable):
    cd frontend && pnpm dev
    # Navigate to http://localhost:5173/cost — assert both cards render.
    # Click the 'Cost' nav link from any other page — assert it routes to /cost.
  </verify>
  <done>
    /cost route exists; routeTree.gen.ts includes the entry; tsc clean.
    NavBar shows 5 links in the Command → Activity → Skills → Cost → Alerts order.
    NavBar test passes with updated 5-link assertion + Cost href check.
    Full vitest suite green at the new floor (>= 315).
    /cost route renders CostForecastCard above CostByProjectCard inside cmc-card-grid.
  </done>
</task>

</tasks>

<verification>
- All 3 tasks complete; 13 new vitest tests added and passing (4 ForecastCard + 4 ByProjectCard + ~5 navbar/queries adjustments where applicable).
- `pnpm tsc --noEmit` clean across all touched files.
- `frontend/src/routeTree.gen.ts` registers the new `/cost` route.
- `frontend/src/components/panels/index.ts` barrel exports both new cards.
- `frontend/src/lib/queries.ts` exports `useCostForecast` and `useCostBreakdown`; `qk.costBreakdown('project', '7d') !== qk.costBreakdown('project', '30d')` (cache-key discipline).
- `frontend/src/lib/api.ts` exports `CostForecastResponse`, `CostBreakdownResponse`, `CostBreakdownRow`, `CostRange`, `BreakdownDim` types and `api.costForecast`, `api.costBreakdown` fetchers.
- All Decimal fields typed `string` in TS; no `Number()`-coercion in display code (verified by grep gate).
- NavBar shows 5 nav links; 'Cost' link routes to /cost.
- Full vitest run >= 315 passing (Phase 18 baseline 293 + Phase 19 +13 → 306; Phase 20 +9 → 315 floor); 0 failed.
- Phase 18 BASELINE.md verifier rules preserved across all suites.
- No `data.days_elapsed < 7` re-derivation client-side for the bias banner — Pitfall 7 guarded by adversarial vitest case.
- Path-leakage guard wired at THREE layers now: (1) backend Plan 20-01 SQL filter + structural test, (2) frontend vitest container.textContent regex, (3) Playwright e2e in Plan 20-04.
</verification>

<success_criteria>
- ROADMAP success criteria #1, #2, #3 user-visible: forecast figure or insufficient-message; bias banner during week 1; per-project card with 7d/30d toggle.
- ANLY-06 + ANLY-07 user-shippable end-to-end (modulo Playwright e2e in Plan 20-04).
- New `/cost` route establishes the cost dashboard surface — opens future cost analytics work (v1.3 ANLY-08 confidence band, ANLY-09 per-project budgets) without further routing decisions.
- Phase 19 cache-key-discipline lesson (STATE.md L121) carried forward — `qk.costBreakdown` keys by both dim AND range.
</success_criteria>

<output>
After completion, create `.planning/phases/20-cost-forecast-per-project-card/20-03-SUMMARY.md` documenting:
- New /cost route + NavBar entry (Option A from Open Question #1).
- The two new panels' design choices (section-level testid, server-source-of-truth bias-banner flag, Decimal-string template literals).
- New hook + qk additions; cache-key discipline preserved.
- Vitest counts before/after.
- Phase 18 BASELINE.md compliance.
- Any deviation from this plan and rationale.
</output>
