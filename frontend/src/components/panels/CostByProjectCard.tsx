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
// Phase 27 Plan 05 (SC#2 adoption sweep):
//   - URL-driven range: replaces the v1.2 `useState<CostRange>('7d')` +
//     `RangeToggle persistKey='cost-by-project'` localStorage pair with
//     `useRouteRangeVocab('7d', snapToCostRange)` (Phase 27 Plan 01). The
//     URL is now the canonical persistence layer; reload preserves choice
//     via `?time_from=now-30d&time_to=now`. localStorage `cost-by-project`
//     key is DROPPED. The global TimePicker re-anchors this panel.
//   - PanelCard `bounded` (CONT-04) pins the panel to the
//     .cmc-page--bounded viewport flex ladder on /cost.
//   - TruncatedCell wraps the project_key column. The values today are
//     uniform 12-char hex (short + fixed-width), but the success criterion
//     reads "long project paths truncate cleanly" — wrap defensively so
//     long values from a future schema change (or a sentinel-overflow
//     branch) collapse with tooltip-on-hover instead of overflowing the
//     table cell. ZERO chart added — Phase 24 ResponsiveContainer lock
//     preserved (DeltaPill column wiring lands in Plan 05 Task 2; this
//     module never imports recharts).

import { useState } from 'react'
import { DataTable, PanelCard, TruncatedCell } from '../ui'
import type { DataTableColumn, DataTableSort } from '../ui'
import { useCostBreakdown } from '../../lib/queries'
import {
  snapToCostRange,
  useRouteRangeVocab,
} from '../../lib/time/useRouteRangeVocab'
import type {
  CostBreakdownResponse,
  CostBreakdownRow,
} from '../../lib/api'

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
    // TruncatedCell wraps defensively: r.key is a 12-char hex project_key
    // today (short + uniform), but the SC#2 spec reads "long project paths
    // truncate cleanly" — if a future schema change widens this column the
    // truncate-on-overflow + tooltip-on-hover behavior already lands.
    // Keeping the .cmc-numeric monospace styling via the outer <code>.
    cell: (r) => (
      <code className="cmc-numeric">
        <TruncatedCell value={r.key} />
      </code>
    ),
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
  // Phase 27 Plan 05 / SC#2: URL-driven range via useRouteRangeVocab.
  // Returns '7d' when the URL has no time picker (matches the v1.2
  // useState<CostRange>('7d') initial value); otherwise snaps the URL
  // window hours to the CostRange Literal '1d' | '7d' | '14d' | '30d'.
  // The global TimePicker writes time_from/time_to; this panel re-queries
  // automatically because the query key changes with `range`.
  const range = useRouteRangeVocab('7d', snapToCostRange)
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
        bounded
        empty={{
          dataNoun: 'project cost data',
          when: (d) => !d.rows || d.rows.length === 0,
        }}
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
