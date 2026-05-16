// ProjectBreakdownCard — OPNL-10 (current).
//
// DataTable rollup of sessions/tokens/tool_calls per project cwd. Pulls
// /api/sessions/by-project at 120s cadence via useByProject(range).
// Range toggle uniquely includes 'all' (RangeAll, not Range).
//
// Backend already supplies display_path (home-dir stripped) — never re-implement
// the regex client-side. STATE.md L201.

import { useState } from 'react'
import { DataTable, PanelCard, RangeToggle } from '../ui'
import type { DataTableColumn, LayoutCustomizableProps } from '../ui'
import { useByProject } from '../../lib/queries'
import type { ProjectRollupResponse, ProjectRollupRow, RangeAll } from '../../lib/api'
import { useRouteRange } from '../../lib/time/useRouteRange'

const RANGE_OPTIONS = [
  { value: 'today' as const, label: 'Today' },
  { value: '7d' as const, label: '7d' },
  { value: '30d' as const, label: '30d' },
  { value: 'all' as const, label: 'All' },
]

const nf = new Intl.NumberFormat('en')

const COLUMNS: DataTableColumn<ProjectRollupRow>[] = [
  {
    id: 'display_path',
    header: 'Project',
    cell: (r) => (
      <span
        className="cmc-numeric cmc-project-breakdown__path"
        title={r.cwd}
      >
        {r.display_path}
      </span>
    ),
  },
  {
    id: 'sessions',
    header: 'Sessions',
    cell: (r) => <span className="cmc-numeric">{nf.format(r.sessions)}</span>,
  },
  {
    id: 'tokens_effective',
    header: 'Tokens',
    cell: (r) => (
      <span className="cmc-numeric">{nf.format(r.tokens_effective)}</span>
    ),
  },
  {
    id: 'tool_calls',
    header: 'Tool Calls',
    cell: (r) => <span className="cmc-numeric">{nf.format(r.tool_calls)}</span>,
  },
  {
    id: 'pct_of_total',
    header: '% Total',
    cell: (r) => {
      const pct = Math.max(0, Math.min(100, r.pct_of_total * 100))
      return (
        <div className="cmc-pct-bar" aria-label={`${pct.toFixed(1)} percent of total`}>
          <div className="cmc-pct-bar__fill" style={{ width: `${pct}%` }} />
          <span className="cmc-pct-bar__label cmc-numeric">{pct.toFixed(1)}%</span>
        </div>
      )
    },
  },
]

export function ProjectBreakdownCard({ panelId, headerMenu }: LayoutCustomizableProps = {}) {
  // Phase 26 TIME-02 bridge: URL → vocab; per-route default 'today' on /.
  // ProjectBreakdownCard's vocab is RangeAll (adds 'all'); the bridge returns
  // Range, which is a subtype of RangeAll — assignment is type-safe.
  const globalRange: RangeAll = useRouteRange('today')
  const [localRange, setLocalRange] = useState<RangeAll | null>(null)
  const effectiveRange = localRange ?? globalRange
  const query = useByProject(effectiveRange)
  return (
    <PanelCard<ProjectRollupResponse>
      reqId="OPNL-10"
      title="Projects"
      query={query}
      bounded
      panelId={panelId}
      headerMenu={headerMenu}
      empty={{
        dataNoun: 'project session data',
        when: (d) => d.items.length === 0,
      }}
      trailing={
        <RangeToggle<RangeAll>
          value={effectiveRange}
          onChange={setLocalRange}
          options={RANGE_OPTIONS}
        />
      }
    >
      {(data) => (
        <DataTable<ProjectRollupRow>
          rows={data.items}
          columns={COLUMNS}
          rowKey={(r) => r.cwd}
          ariaLabel="Project breakdown"
        />
      )}
    </PanelCard>
  )
}
