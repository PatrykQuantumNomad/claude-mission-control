// CostByProjectCard — ANLY-07 (Phase 20 Plan 03).
//
// Sortable per-project cost breakdown over a 7d/30d toggle. Sources
// /api/cost/breakdown?dim=project — Plan 20-01 refactored that SQL to
// GROUP BY sessions.project_key (12-char hex; never raw cwd) with a
// WHERE != '' filter that excludes the empty-key sentinel.
//
// PATH-LEAKAGE GUARD (load-bearing for ROADMAP success criterion #3):
//   The cell renderers operate ONLY on fields enumerated in CostBreakdownRow:
//   key / tokens_* / cost_usd. The TS type itself has no cwd / path /
//   display_path field, so the type system rejects any future renderer that
//   tries to surface a path-shaped value. The runtime DOM half of the dual
//   guard is enforced via vitest container.textContent regex (mirror Phase
//   19 SkillProjectsTable).
//
// data-testid lives on the wrapping <section> — PanelCard does NOT
// pass-through data-testid, so we sandwich the testid on a stable wrapper
// that survives the loading / empty / error / data branches.
//
// RangeToggle persistKey='cost-by-project' so the user's choice round-trips
// through localStorage on reload (mirror SkillCostCard / ProjectBreakdownCard
// pattern).

import { useState } from 'react'
import { DataTable, PanelCard, RangeToggle } from '../ui'
import type { DataTableColumn, DataTableSort } from '../ui'
import { useCostBreakdown } from '../../lib/queries'
import type {
  CostBreakdownResponse,
  CostBreakdownRow,
  CostRange,
} from '../../lib/api'

const RANGE_OPTIONS = [
  { value: '7d' as const, label: '7d' },
  { value: '30d' as const, label: '30d' },
]

const nf = new Intl.NumberFormat('en')

function tokensTotal(r: CostBreakdownRow): number {
  return (
    r.tokens_input +
    r.tokens_output +
    r.tokens_cache_read +
    r.tokens_cache_create_5m +
    r.tokens_cache_create_1h
  )
}

function fmtCost(v: string): string {
  // cost_usd arrives as a Decimal-as-JSON-string; render with 4 decimals
  // (per-project rollups can be sub-cent; 2 decimals would round-to-zero
  // and look like a free run). parseFloat is sort-only — display passes
  // through the formatted string. Mirror SkillProjectsTable.fmtCost.
  const n = Number.parseFloat(v)
  if (!Number.isFinite(n)) return v
  return `$${n.toFixed(4)}`
}

const COLUMNS: DataTableColumn<CostBreakdownRow>[] = [
  {
    id: 'project',
    header: 'Project',
    sortable: true,
    sort: (a, b) => a.key.localeCompare(b.key),
    cell: (r) => <code className="cmc-numeric">{r.key}</code>,
  },
  {
    id: 'tokens',
    header: 'Tokens',
    sortable: true,
    sort: (a, b) => tokensTotal(a) - tokensTotal(b),
    cell: (r) => (
      <span className="cmc-numeric">{nf.format(tokensTotal(r))}</span>
    ),
  },
  {
    id: 'cost',
    header: 'Cost',
    sortable: true,
    sort: (a, b) =>
      (Number.parseFloat(a.cost_usd) || 0) -
      (Number.parseFloat(b.cost_usd) || 0),
    cell: (r) => <span className="cmc-numeric">{fmtCost(r.cost_usd)}</span>,
  },
]

export function CostByProjectCard() {
  const [range, setRange] = useState<CostRange>('7d')
  const query = useCostBreakdown('project', range)
  // Default sort: cost desc (most-expensive project first).
  const [sort, setSort] = useState<DataTableSort>({
    col: 'cost',
    dir: 'desc',
  })

  return (
    <section
      className="cmc-cost-by-project"
      data-testid="cost-by-project-card"
    >
      <PanelCard<CostBreakdownResponse>
        reqId="ANLY-07"
        title="Cost by Project"
        description="Per-project cost grouped by project_key (12-char hex; never a filesystem path)."
        query={query}
        empty={{
          dataNoun: 'project cost data',
          when: (d) => !d.rows || d.rows.length === 0,
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
              columns={COLUMNS}
              rowKey={(r) => r.key}
              sort={sort}
              onSortChange={setSort}
              ariaLabel="Per-project cost breakdown"
            />
          </div>
        )}
      </PanelCard>
    </section>
  )
}
