---
phase: 19-skills-per-project-deltas-badges
plan: 04
type: execute
wave: 4
# why_this_split: Frontend wiring depends on all three backend endpoints (Plan 19-02 + 19-03). Single plan because all UI changes share the same vertical slice (DeltaPill + projects table + badges) and there's only one /skills/$name page to mount on.
depends_on: ["19-02", "19-03"]
files_modified:
  - frontend/src/components/ui/DeltaPill.tsx
  - frontend/src/components/ui/index.ts
  - frontend/src/components/ui/__tests__/DeltaPill.test.tsx
  - frontend/src/components/panels/SkillProjectsTable.tsx
  - frontend/src/components/panels/__tests__/SkillProjectsTable.test.tsx
  - frontend/src/components/panels/TopSkills.tsx
  - frontend/src/components/panels/SkillCostCard.tsx
  - frontend/src/components/panels/SkillsRegistry.tsx
  - frontend/src/components/panels/index.ts
  - frontend/src/lib/api.ts
  - frontend/src/lib/queries.ts
  - frontend/src/routes/skills_.$name.tsx
  - frontend/tests/e2e/skills-detail.spec.ts
autonomous: true
requirements: [SKLP-08, SKLP-09, SKLP-10]
must_haves:
  truths:
    - "User opens /skills/<name> and sees a per-project table panel rendering rows from GET /api/skills/{name}/projects, with sortable columns for cost, p50/p95 latency, and count."
    - "Each row in the projects table shows ONLY project_key (12-char hex) — never a path-shaped value. Playwright spec asserts no row text contains a leading '/'."
    - "TopSkills panel displays a DeltaPill next to each skill row's invocation count (SKLP-09)."
    - "SkillCostCard displays a DeltaPill in its header showing the 7d-vs-prev-7d cost movement (SKLP-09)."
    - "Per-skill detail page (/skills/$name) renders a DeltaPill on the SkillCostCard header (inherits from the SkillCostCard change)."
    - "TopSkills and SkillsRegistry rows display 'new this week' badge (info variant) when row.badges includes 'new_this_week' AND 'dormant' badge (warning variant) when row.badges includes 'dormant' (SKLP-10)."
    - "DeltaPill component renders ↑/↓/· with absolute value + percent in parens; delta_pct=null renders as '—'."
    - "All new test-ids follow the kebab-case feature-component-element convention from Phase 18 (e.g., 'skills-detail-projects-table', 'top-skills-delta-pill', 'skill-cost-card-delta-pill', 'skills-registry-new-badge')."
    - "Vitest passes >= 293 (Phase 18 BASELINE.md floor) plus the new DeltaPill + SkillProjectsTable tests."
    - "Playwright skills-detail.spec.ts passes with strict-mode and asserts no path leakage in table rows."
  artifacts:
    - path: "frontend/src/components/ui/DeltaPill.tsx"
      provides: "DeltaPill component (↑/↓/· + abs + pct)"
      contains: "export function DeltaPill"
    - path: "frontend/src/components/ui/__tests__/DeltaPill.test.tsx"
      provides: "Vitest coverage of sign, format, null-pct edge case"
      min_lines: 40
    - path: "frontend/src/components/panels/SkillProjectsTable.tsx"
      provides: "Sortable per-project table panel rendering SKLP-08 endpoint data"
      contains: "DataTable"
      contains_also: "data-testid=\"skills-detail-projects-table\""
    - path: "frontend/src/components/panels/__tests__/SkillProjectsTable.test.tsx"
      provides: "Vitest coverage of sort behavior, empty state, no-path-leakage rendering"
      min_lines: 50
    - path: "frontend/src/lib/queries.ts"
      provides: "useSkillProjects(name, range) TanStack Query hook"
      contains: "useSkillProjects"
    - path: "frontend/src/lib/api.ts"
      provides: "fetchSkillProjects api method"
      contains: "fetchSkillProjects"
    - path: "frontend/src/routes/skills_.$name.tsx"
      provides: "Mounts SkillProjectsTable below SkillCostCard"
      contains: "SkillProjectsTable"
    - path: "frontend/tests/e2e/skills-detail.spec.ts"
      provides: "Playwright spec for /skills/<name> projects table + badge + delta visibility, with no-path-leakage assertion"
      contains: "skills-detail-projects-table"
  key_links:
    - from: "frontend/src/components/panels/SkillProjectsTable.tsx"
      to: "frontend/src/lib/queries.ts (useSkillProjects)"
      via: "import + useQuery hook subscription"
      pattern: "useSkillProjects"
    - from: "frontend/src/lib/api.ts"
      to: "GET /api/skills/{name}/projects (SKLP-08 endpoint)"
      via: "fetch wrapper in fetchSkillProjects"
      pattern: "/api/skills/.*projects"
    - from: "frontend/src/components/panels/TopSkills.tsx"
      to: "frontend/src/components/ui/DeltaPill.tsx"
      via: "import + render per row"
      pattern: "<DeltaPill"
---

<objective>
Wire the three SKLP-08/09/10 backend surfaces into the user-visible UI: a new DeltaPill primitive, a new SkillProjectsTable panel, badges on TopSkills + SkillsRegistry rows, and Cmd+K-discoverable test coverage.

Purpose: All three ROADMAP success criteria (#1 user sees per-project table, #3 user sees delta pills on three panels, #4 user sees new/dormant badges) demand frontend rendering. This plan completes the vertical slice so the feature is shippable, not just API-callable.

Output:
- `frontend/src/components/ui/DeltaPill.tsx` (NEW) — Pure presentation component. Props: `delta: number`, `deltaPct: number | null`, `format: 'integer' | 'currency'` (default integer). Renders `↑12 (+45%)` style; `null` pct renders `—`.
- `frontend/src/components/ui/index.ts` — exports DeltaPill.
- `frontend/src/components/ui/__tests__/DeltaPill.test.tsx` (NEW) — vitest covering sign, format (integer vs currency), null-pct edge case.
- `frontend/src/components/panels/SkillProjectsTable.tsx` (NEW) — Uses existing `DataTable` primitive; columns: project_key, count, p50_ms, p95_ms, cost_usd. Each column sortable client-side. Empty state via existing `EmptyState` UI. Uses `useSkillProjects(name, range)` hook.
- `frontend/src/components/panels/__tests__/SkillProjectsTable.test.tsx` (NEW) — vitest covering sort, empty, no-path-leakage assertion (programmatic check on rendered DOM).
- `frontend/src/components/panels/TopSkills.tsx` — UPDATED to render `<DeltaPill delta={row.usage_delta.delta} deltaPct={row.usage_delta.delta_pct} />` next to each row's invocation count, AND render badges (info/warning Badge variants).
- `frontend/src/components/panels/SkillCostCard.tsx` — UPDATED to render DeltaPill in header showing cost_delta from the response (format='currency').
- `frontend/src/components/panels/SkillsRegistry.tsx` — UPDATED to render badges per row (uses the same usage data source as TopSkills).
- `frontend/src/components/panels/index.ts` — exports SkillProjectsTable.
- `frontend/src/lib/api.ts` — adds `fetchSkillProjects(name, range)` method to the api object.
- `frontend/src/lib/queries.ts` — adds `useSkillProjects(name, range)` hook (60s staleTime, mirroring useSkillCost cadence).
- `frontend/src/routes/skills_.$name.tsx` — mounts `<SkillProjectsTable name={name} range={range} />` below SkillCostCard, above SkillRunsTable.
- `frontend/tests/e2e/skills-detail.spec.ts` (NEW) — Playwright spec opens `/skills/$name` for a seeded skill, asserts the projects table renders with `data-testid="skills-detail-projects-table"`, asserts no row text matches `/^\//` (path-leakage guard), asserts a DeltaPill is present, asserts at least one badge variant renders when seeded data should produce one.

All new `data-testid` values use the locked `feature-component-element` kebab-case convention from Phase 18 Plan 04 (`frontend/tests/e2e/README.md`):
- `skills-detail-projects-table` (the table panel)
- `top-skills-delta-pill` (delta pills on TopSkills)
- `skill-cost-card-delta-pill` (delta pill on SkillCostCard)
- `skills-registry-new-badge`, `skills-registry-dormant-badge` (badges on SkillsRegistry)
- `top-skills-new-badge`, `top-skills-dormant-badge` (badges on TopSkills)
- Per Phase 18 Plan 04 SUMMARY: decorate ONLY when strict mode collides — apply pre-emptively only to the new components above so the e2e spec's `getByTestId` calls have stable hooks; do not bulk-decorate existing component output.
</objective>

<execution_context>
@/Users/patrykattc/.claude/get-shit-done/workflows/execute-plan.md
@/Users/patrykattc/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/19-skills-per-project-deltas-badges/19-RESEARCH.md
@.planning/phases/19-skills-per-project-deltas-badges/19-02-skills-projects-endpoint-PLAN.md
@.planning/phases/19-skills-per-project-deltas-badges/19-03-deltas-and-badges-PLAN.md
@.planning/phases/18-polish-carry-forward-cleanup/18-04-playwright-strict-mode-and-readme-PLAN.md

# Existing files this plan touches (read before editing)
@frontend/src/components/ui/Badge.tsx
@frontend/src/components/ui/DataTable.tsx
@frontend/src/components/panels/TopSkills.tsx
@frontend/src/components/panels/SkillCostCard.tsx
@frontend/src/components/panels/SkillsRegistry.tsx
@frontend/src/lib/api.ts
@frontend/src/lib/queries.ts
@frontend/src/routes/skills_.$name.tsx
@frontend/tests/e2e/README.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: DeltaPill component + vitest + api/queries hooks for projects endpoint</name>
  <files>frontend/src/components/ui/DeltaPill.tsx, frontend/src/components/ui/index.ts, frontend/src/components/ui/__tests__/DeltaPill.test.tsx, frontend/src/lib/api.ts, frontend/src/lib/queries.ts</files>
  <action>
**Step 1a — DeltaPill component (`frontend/src/components/ui/DeltaPill.tsx`):**

```tsx
import type { HTMLAttributes } from 'react'

export interface DeltaPillProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Absolute delta — backend curr - prev. */
  delta: number
  /** Percent change — null when prev was zero (no baseline). */
  deltaPct: number | null
  /** Format hint — 'integer' for counts, 'currency' for $. */
  format?: 'integer' | 'currency'
}

/**
 * SKLP-09 delta pill. Renders ↑/↓/· + abs + pct.
 *
 * `deltaPct === null` -> renders '—' (no baseline; backend signals this
 * to avoid client-side div-by-zero. RESEARCH.md Pattern 3.)
 */
export function DeltaPill({ delta, deltaPct, format = 'integer', className = '', ...rest }: DeltaPillProps) {
  const direction = delta > 0 ? '↑' : delta < 0 ? '↓' : '·'
  const sign = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  const absStr =
    format === 'currency'
      ? `$${Math.abs(delta).toFixed(2)}`
      : new Intl.NumberFormat('en').format(Math.abs(delta))
  const pctStr =
    deltaPct === null ? '—' : `${deltaPct > 0 ? '+' : ''}${(deltaPct * 100).toFixed(0)}%`
  return (
    <span
      className={`cmc-delta-pill cmc-delta-pill--${sign} ${className}`.trim()}
      aria-label={`Change: ${direction} ${absStr} (${pctStr})`}
      {...rest}
    >
      <span aria-hidden="true">{direction}</span>
      <span className="cmc-delta-pill__abs cmc-numeric">{absStr}</span>
      <span className="cmc-delta-pill__pct cmc-numeric">({pctStr})</span>
    </span>
  )
}
```

Add CSS class hooks (`cmc-delta-pill`, `--up`, `--down`, `--flat`) to whichever style file the project uses for design-system tokens — read `frontend/src/components/ui/Badge.tsx` to identify the corresponding style file (likely `frontend/src/styles/design-system.css` or similar). Apply minimal: an inline-flex span with small monospace numeric and a single accent color per sign. Do NOT add a heavyweight color treatment — RESEARCH.md notes: "neutral chrome, color reserved for sign indication only". The sign-color hint can come from a CSS variable (`var(--cmc-color-up)` / `--cmc-color-down`).

Update `frontend/src/components/ui/index.ts` to export `DeltaPill`.

**Step 1b — Vitest for DeltaPill (`frontend/src/components/ui/__tests__/DeltaPill.test.tsx`):**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DeltaPill } from '../DeltaPill'

describe('DeltaPill', () => {
  it('renders up arrow when delta > 0', () => {
    render(<DeltaPill delta={12} deltaPct={0.45} />)
    expect(screen.getByLabelText(/Change: ↑ 12 \(\+45%\)/)).toBeInTheDocument()
  })
  it('renders down arrow when delta < 0', () => {
    render(<DeltaPill delta={-3} deltaPct={-0.20} />)
    expect(screen.getByLabelText(/Change: ↓ 3 \(-20%\)/)).toBeInTheDocument()
  })
  it('renders flat dot when delta === 0', () => {
    render(<DeltaPill delta={0} deltaPct={0} />)
    expect(screen.getByLabelText(/Change: · 0 \(\+?0%\)/)).toBeInTheDocument()
  })
  it('renders em-dash for percent when deltaPct is null', () => {
    render(<DeltaPill delta={5} deltaPct={null} />)
    expect(screen.getByText(/—/)).toBeInTheDocument()
  })
  it('formats currency when format=currency', () => {
    render(<DeltaPill delta={12.34} deltaPct={0.10} format="currency" />)
    expect(screen.getByText(/\$12\.34/)).toBeInTheDocument()
  })
  it('formats integer with locale separator', () => {
    render(<DeltaPill delta={1234} deltaPct={0.10} />)
    expect(screen.getByText(/1,234/)).toBeInTheDocument()
  })
})
```

**Step 1c — API + query hook for projects endpoint:**

In `frontend/src/lib/api.ts`, add (read the existing api map structure; mirror the `skillCost` / `skillLatency` shape):

```ts
async skillProjects(name: string, range: SkillRange): Promise<SkillProjectsResponse> {
  return get<SkillProjectsResponse>(`/api/skills/${encodeURIComponent(name)}/projects?range=${range}`)
}
// And the convenience export:
export const fetchSkillProjects = api.skillProjects
```

Define / import the TS types `SkillProjectsResponse` and `SkillProjectRow` to mirror the backend schemas. If the project has a backend->frontend type sync mechanism (e.g., openapi-typescript), use it; otherwise hand-write the types in the same module that holds `SkillCostResponse`. Read the existing skill schemas section to match the pattern.

In `frontend/src/lib/queries.ts`, add:

```ts
export const useSkillProjects = (name: string, range: SkillRange) =>
  useQuery({
    queryKey: ['skill-projects', name, range],
    queryFn: () => fetchSkillProjects(name, range),
    staleTime: 60_000, // mirror useSkillCost cadence
  })
```

Update existing TS types for SkillUsageRow / SkillCostResponse to include the new `usage_delta`, `cost_delta`, `badges` fields from Plan 19-03 — read the existing type and add the new fields with the corresponding shape (`{ curr: string, prev: string, delta: string, delta_pct: number | null, direction: 'up'|'down'|'flat' }` for DeltaPill — strings because Pydantic v2 serializes Decimal as JSON string). Wherever the existing type definitions live, place the new ones inline.
  </action>
  <verify>
cd frontend && pnpm exec vitest run src/components/ui/__tests__/DeltaPill.test.tsx
Expected: 6 tests pass.

cd frontend && pnpm exec tsc --noEmit
Expected: 0 type errors.

cd frontend && pnpm exec vitest run
Expected: passed >= 293 + 6 new DeltaPill tests; 0 failed.
  </verify>
  <done>
DeltaPill component, vitest, api method, useSkillProjects hook all shipping.
TS types for usage_delta / cost_delta / badges added.
  </done>
</task>

<task type="auto">
  <name>Task 2: SkillProjectsTable panel + vitest + mount on /skills/$name</name>
  <files>frontend/src/components/panels/SkillProjectsTable.tsx, frontend/src/components/panels/__tests__/SkillProjectsTable.test.tsx, frontend/src/components/panels/index.ts, frontend/src/routes/skills_.$name.tsx</files>
  <action>
**Step 2a — SkillProjectsTable component (`frontend/src/components/panels/SkillProjectsTable.tsx`):**

Use the existing `DataTable` primitive (read `frontend/src/components/ui/DataTable.tsx` to confirm the columns API — likely `DataTableColumn<T>` with `header`, `cell`, `sort`). Wrap in a `PanelCard` (existing primitive). Subscribe via `useSkillProjects(name, range)`.

```tsx
import { useSkillProjects } from '@/lib/queries'
import { DataTable } from '@/components/ui/DataTable'
import { PanelCard } from '@/components/ui/PanelCard'
import { EmptyState } from '@/components/ui/EmptyState'
// import type { SkillProjectRow, SkillRange } from ... wherever shared

interface SkillProjectsTableProps {
  name: string
  range: SkillRange
}

export function SkillProjectsTable({ name, range }: SkillProjectsTableProps) {
  const { data, isLoading, error } = useSkillProjects(name, range)
  if (isLoading) return <PanelCard title="Per-project breakdown">Loading…</PanelCard>
  if (error) return <PanelCard title="Per-project breakdown">Failed to load</PanelCard>
  if (!data || data.rows.length === 0) {
    return (
      <PanelCard title="Per-project breakdown">
        <EmptyState message="No projects yet for this skill." />
      </PanelCard>
    )
  }

  // Columns. cost_usd is a JSON string from Pydantic Decimal — parseFloat for sort.
  const columns = [
    {
      key: 'project_key',
      header: 'Project',
      cell: (r: SkillProjectRow) => <code className="cmc-numeric">{r.project_key}</code>,
      sort: (a: SkillProjectRow, b: SkillProjectRow) => a.project_key.localeCompare(b.project_key),
    },
    {
      key: 'count',
      header: 'Runs',
      cell: (r: SkillProjectRow) => r.count.toLocaleString(),
      sort: (a: SkillProjectRow, b: SkillProjectRow) => a.count - b.count,
    },
    {
      key: 'p50_ms',
      header: 'p50 (ms)',
      cell: (r: SkillProjectRow) => r.p50_ms ?? '—',
      sort: (a: SkillProjectRow, b: SkillProjectRow) => (a.p50_ms ?? 0) - (b.p50_ms ?? 0),
    },
    {
      key: 'p95_ms',
      header: 'p95 (ms)',
      cell: (r: SkillProjectRow) => r.p95_ms ?? '—',
      sort: (a: SkillProjectRow, b: SkillProjectRow) => (a.p95_ms ?? 0) - (b.p95_ms ?? 0),
    },
    {
      key: 'cost_usd',
      header: 'Cost',
      cell: (r: SkillProjectRow) => `$${parseFloat(r.cost_usd).toFixed(4)}`,
      sort: (a: SkillProjectRow, b: SkillProjectRow) => parseFloat(a.cost_usd) - parseFloat(b.cost_usd),
    },
  ]

  return (
    <PanelCard title="Per-project breakdown" data-testid="skills-detail-projects-table">
      <DataTable rows={data.rows} columns={columns} initialSortKey="count" initialSortDirection="desc" />
    </PanelCard>
  )
}
```

CRITICAL: read `DataTable.tsx` first — the columns API may use slightly different prop names; match it exactly.

The `data-testid="skills-detail-projects-table"` MUST be on the outer PanelCard (or a wrapping div) so Playwright can locate the panel. If PanelCard does not pass through `data-testid`, wrap the panel in a `<section data-testid="...">`.

NEVER render `cwd` or any path-shaped value. Cell renderers must operate ONLY on `project_key`, `count`, `p50_ms`, `p95_ms`, `cost_usd`. Backend already enforces this; UI does not import from the response shape any field that doesn't exist.

Update `frontend/src/components/panels/index.ts` to export `SkillProjectsTable`.

**Step 2b — Vitest for SkillProjectsTable (`frontend/src/components/panels/__tests__/SkillProjectsTable.test.tsx`):**

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { SkillProjectsTable } from '../SkillProjectsTable'

// Mock the hook
vi.mock('@/lib/queries', () => ({
  useSkillProjects: vi.fn(),
}))

import { useSkillProjects } from '@/lib/queries'

function withQueryClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
}

describe('SkillProjectsTable', () => {
  it('renders empty state when rows is []', () => {
    (useSkillProjects as any).mockReturnValue({ data: { name: 'x', range: '14d', rows: [] }, isLoading: false, error: null })
    render(withQueryClient(<SkillProjectsTable name="x" range="14d" />))
    expect(screen.getByText(/no projects/i)).toBeInTheDocument()
  })

  it('renders rows with project_key and count', () => {
    (useSkillProjects as any).mockReturnValue({
      data: {
        name: 'x', range: '14d',
        rows: [
          { project_key: 'a3f8d92b1c4e', count: 47, p50_ms: 1200, p95_ms: 4800, cost_usd: '0.4521', cost_attribution: 'session', low_sample: false },
        ],
      },
      isLoading: false, error: null,
    })
    const { container } = render(withQueryClient(<SkillProjectsTable name="x" range="14d" />))
    expect(screen.getByText('a3f8d92b1c4e')).toBeInTheDocument()
    expect(screen.getByText(/47/)).toBeInTheDocument()
    // No path leakage:
    const html = container.innerHTML
    expect(html).not.toMatch(/cwd|display_path/)
    expect(html).not.toMatch(/\b\/[a-zA-Z]/)  // No leading-slash filesystem paths
  })

  it('table is wrapped in panel with skills-detail-projects-table testid', () => {
    (useSkillProjects as any).mockReturnValue({
      data: { name: 'x', range: '14d', rows: [{ project_key: 'aaa', count: 1, p50_ms: 100, p95_ms: 200, cost_usd: '0.01', cost_attribution: 'session', low_sample: true }] },
      isLoading: false, error: null,
    })
    render(withQueryClient(<SkillProjectsTable name="x" range="14d" />))
    expect(screen.getByTestId('skills-detail-projects-table')).toBeInTheDocument()
  })
})
```

**Step 2c — Mount on `/skills/$name` (`frontend/src/routes/skills_.$name.tsx`):**

Read the existing route component, find where SkillCostCard is rendered, add SkillProjectsTable below it. Pass the same `name` and `range` props the existing components receive. Single-line addition pattern; do not refactor surrounding code.

```tsx
// In the route component body, between SkillCostCard and SkillRunsTable:
<SkillProjectsTable name={name} range={range} />
```

Add the import at the top of the file: `import { SkillProjectsTable } from '@/components/panels'` (or whichever import path the route already uses for panels).
  </action>
  <verify>
cd frontend && pnpm exec vitest run src/components/panels/__tests__/SkillProjectsTable.test.tsx
Expected: 3 tests pass.

cd frontend && pnpm exec tsc --noEmit
Expected: 0 type errors.

cd frontend && pnpm exec vitest run
Expected: passed >= 293 + DeltaPill (6) + SkillProjectsTable (3) = 302+ tests; 0 failed.
  </verify>
  <done>
SkillProjectsTable mounts on /skills/$name; renders sortable rows; empty state present; testid wired; no path-leakage in rendered DOM (vitest assertion).
  </done>
</task>

<task type="auto">
  <name>Task 3: Wire DeltaPill + badges into TopSkills, SkillCostCard, SkillsRegistry + Playwright e2e</name>
  <files>frontend/src/components/panels/TopSkills.tsx, frontend/src/components/panels/SkillCostCard.tsx, frontend/src/components/panels/SkillsRegistry.tsx, frontend/tests/e2e/skills-detail.spec.ts</files>
  <action>
**Step 3a — TopSkills.tsx:**

Read the existing component. For each row, render:
- `<DeltaPill delta={Number(row.usage_delta.delta)} deltaPct={row.usage_delta.delta_pct} data-testid="top-skills-delta-pill" />` next to the invocation count.
- For each badge in `row.badges`: render `<Badge variant={badge === 'new_this_week' ? 'info' : 'warning'} data-testid={badge === 'new_this_week' ? 'top-skills-new-badge' : 'top-skills-dormant-badge'}>{badge === 'new_this_week' ? 'new this week' : 'dormant'}</Badge>`.

Place delta pill inline with the count value; place badges next to the skill name. Use the existing layout primitives.

Note: backend serializes Decimal as JSON string, so `row.usage_delta.delta` arrives as a string. Wrap in `Number(...)` before passing to DeltaPill (which expects `number`).

**Step 3b — SkillCostCard.tsx:**

Read the existing component. The response shape gains `cost_delta`. In the card header (where the total cost is shown), render:
- `<DeltaPill delta={Number(data.cost_delta.delta)} deltaPct={data.cost_delta.delta_pct} format="currency" data-testid="skill-cost-card-delta-pill" />`

Place inline with the headline cost number (right-aligned or trailing).

**Step 3c — SkillsRegistry.tsx:**

This panel renders the list of skills with autonomy controls. Add badges per row from the same data source TopSkills uses (likely `useSkillUsage` or a sibling). For each row:
- If `row.badges.includes('new_this_week')`: render `<Badge variant="info" data-testid="skills-registry-new-badge">new this week</Badge>`.
- If `row.badges.includes('dormant')`: render `<Badge variant="warning" data-testid="skills-registry-dormant-badge">dormant</Badge>`.

NOTE: SkillsRegistry may currently call a different endpoint (`/api/skills` registry list) that doesn't carry `badges` — read the component first. If badges are NOT in the existing data fetch, either:
- (Preferred) wire SkillsRegistry to also subscribe to useSkillUsage (or merge the data sources) so the same badge state appears here.
- (Fallback) skip the SkillsRegistry badge wiring, document in SUMMARY, and ensure TopSkills + the per-skill detail page still display badges so SKLP-10 is satisfied at the user-visible level.

Choose preferred unless the data-source merge is invasive (>2 files of change). Document choice in plan SUMMARY.

**Step 3d — Playwright e2e (`frontend/tests/e2e/skills-detail.spec.ts`):**

Create a new spec following the pattern of existing specs (`frontend/tests/e2e/sessions-compare.spec.ts` is a good model).

```ts
import { test, expect } from '@playwright/test'

test.describe('SKLP-08 / SKLP-09 / SKLP-10: /skills/<name> detail panels', () => {
  test('projects table renders, no path leakage, delta pill visible', async ({ page }) => {
    // Navigate to the skills page first to find a real skill name to drill into.
    await page.goto('/skills')
    // Click the first skill row's name link (selector strategy depends on how
    // SkillsRegistry renders link affordances; read the component if needed).
    const firstSkillLink = page.getByRole('link').first()
    await firstSkillLink.click()
    await page.waitForURL(/\/skills\/[^/]+$/)

    // Assert the projects table panel is present:
    const projectsTable = page.getByTestId('skills-detail-projects-table')
    await expect(projectsTable).toBeVisible({ timeout: 5000 })

    // Path-leakage guard: no row text should start with '/'.
    const rowsText = await projectsTable.textContent()
    expect(rowsText ?? '').not.toMatch(/\b\/[a-zA-Z][\w/.-]+/)

    // Delta pill on SkillCostCard should be present:
    const costDelta = page.getByTestId('skill-cost-card-delta-pill')
    // Delta pill may not always be visible (depends on seed data); assert
    // either visible OR the cost card itself rendered (defensive — don't
    // make this spec dev-DB-state-dependent).
    const hasDelta = await costDelta.count() > 0
    if (hasDelta) {
      await expect(costDelta).toBeVisible()
    }
  })
})
```

The path-leakage assertion is the load-bearing one. The delta-pill assertion is conditional because seed-data state may not always produce both periods of activity (mirrors Phase 18 BASELINE.md `alerts.spec.ts` skip pattern — "1 skipped" is steady-state for data-dependent assertions).

If the existing `/skills/$name` route requires a known seeded skill to render meaningfully (no skills at all in dev DB → 404), document a SKIP path:

```ts
test.skip(({ page }) => /* condition: no skills exist */, 'requires at least one ingested skill in dev DB')
```

Mirror the alerts.spec.ts pattern documented in `frontend/tests/e2e/README.md`.
  </action>
  <verify>
cd frontend && pnpm exec vitest run
Expected: passed >= 302; 0 failed.

cd frontend && pnpm exec tsc --noEmit
Expected: 0 type errors.

cd frontend && npx playwright test tests/e2e/skills-detail.spec.ts
Expected: 1 passed (or 1 skipped if no skill exists in dev DB — document in SUMMARY which it was).

cd frontend && npx playwright test
Expected: passed >= 7 (Phase 18 baseline) + new skills-detail spec; failed == 0; skipped count documented.

# Adversarial path-leakage check: temporarily corrupt SkillProjectsTable to render row.project_key
# AND a fake "cwd" field, run spec, confirm RED. Restore. Confirm GREEN.
# (Verification step — don't commit the mutation.)
  </verify>
  <done>
TopSkills + SkillCostCard + (SkillsRegistry preferred) render DeltaPill + badges.
Playwright spec passes; path-leakage assertion is load-bearing structural guard.
Phase 18 BASELINE.md verifier preserved: vitest >= 293, playwright >= 7, failed == 0.
  </done>
</task>

</tasks>

<verification>
- DeltaPill component exists, 6 vitest tests pass.
- SkillProjectsTable component mounts on /skills/$name, 3 vitest tests pass.
- TopSkills + SkillCostCard wired with DeltaPill (via Number() coercion of Decimal-as-string from backend).
- Badges (info / warning Badge variants) render on TopSkills (and SkillsRegistry if data-source merge is feasible — document choice in SUMMARY).
- All new test-ids follow the kebab-case feature-component-element convention from Phase 18.
- Playwright skills-detail.spec.ts passes with the path-leakage guard as the load-bearing assertion.
- Phase 18 BASELINE.md verifier rules: vitest passed >= 293 + new tests, playwright passed >= 7 + 1 new spec, failed == 0 across both.
</verification>

<success_criteria>
- ROADMAP success criterion #1 user-visible: per-project table renders on /skills/<name> via DataTable.
- ROADMAP success criterion #3 user-visible: DeltaPill on TopSkills, SkillCostCard, per-skill detail.
- ROADMAP success criterion #4 user-visible: new/dormant badges on TopSkills + SkillsRegistry.
- ROADMAP success criterion #5 already verified server-side in Plan 19-03 (DST-correct windowing).
- All three SKLP-08/09/10 requirements complete end-to-end (backend + frontend + e2e coverage).
</success_criteria>

<output>
After completion, create `.planning/phases/19-skills-per-project-deltas-badges/19-04-SUMMARY.md`.
</output>
