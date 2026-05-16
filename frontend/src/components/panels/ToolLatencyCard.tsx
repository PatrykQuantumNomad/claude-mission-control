// ToolLatencyCard — OPNL-08 (current).
//
// Sortable DataTable: tool_name / call_count / p50 / p95 / max / error_rate
// + Flag badge (danger when p95>5000 OR error_rate>0.05; success when
// call_count>=10 AND p95<1000 AND error_rate=0). Pulls /api/tools/latency
// at 30s cadence via useLatency(range). Backend already returns p50/p95/max
// via implementation's window-function pattern; frontend just renders the values.

import { useState } from 'react'
import { Badge, DataTable, PanelCard, RangeToggle } from '../ui'
import type { DataTableColumn, DataTableSort, LayoutCustomizableProps } from '../ui'
import { useLatency } from '../../lib/queries'
import type { Range, ToolLatencyResponse, ToolLatencyRow } from '../../lib/api'
import { useRouteRange } from '../../lib/time/useRouteRange'

const RANGE_OPTIONS = [
  { value: 'today' as const, label: 'Today' },
  { value: '7d' as const, label: '7d' },
  { value: '30d' as const, label: '30d' },
]

const nf = new Intl.NumberFormat('en')

function FlagBadge({ tool }: { tool: ToolLatencyRow }) {
  const danger =
    (tool.p95_ms !== null && tool.p95_ms > 5000) || tool.error_rate > 0.05
  const success =
    tool.call_count >= 10 &&
    tool.p95_ms !== null &&
    tool.p95_ms < 1000 &&
    tool.error_rate === 0
  if (danger) {
    return (
      <span className="cmc-flag-badge">
        <Badge variant="danger">slow</Badge>
      </span>
    )
  }
  if (success) {
    return (
      <span className="cmc-flag-badge">
        <Badge variant="success">fast</Badge>
      </span>
    )
  }
  return null
}

const COLUMNS: DataTableColumn<ToolLatencyRow>[] = [
  {
    id: 'tool_name',
    header: 'Tool',
    cell: (r) => (
      <span className="cmc-numeric" style={{ color: 'var(--cmc-text)' }}>
        {r.tool_name}
      </span>
    ),
    sortable: true,
    sort: (a, b) => a.tool_name.localeCompare(b.tool_name),
  },
  {
    id: 'call_count',
    header: 'Calls',
    cell: (r) => <span className="cmc-numeric">{nf.format(r.call_count)}</span>,
    sortable: true,
    sort: (a, b) => a.call_count - b.call_count,
  },
  {
    id: 'p50_ms',
    header: 'p50',
    cell: (r) => (
      <span className="cmc-numeric">{r.p50_ms === null ? '—' : `${r.p50_ms}ms`}</span>
    ),
    sortable: true,
    sort: (a, b) => (a.p50_ms ?? 0) - (b.p50_ms ?? 0),
  },
  {
    id: 'p95_ms',
    header: 'p95',
    cell: (r) => (
      <span className="cmc-numeric">{r.p95_ms === null ? '—' : `${r.p95_ms}ms`}</span>
    ),
    sortable: true,
    sort: (a, b) => (a.p95_ms ?? 0) - (b.p95_ms ?? 0),
  },
  {
    id: 'max_ms',
    header: 'max',
    cell: (r) => (
      <span className="cmc-numeric">{r.max_ms === null ? '—' : `${r.max_ms}ms`}</span>
    ),
    sortable: true,
    sort: (a, b) => (a.max_ms ?? 0) - (b.max_ms ?? 0),
  },
  {
    id: 'error_rate',
    header: 'Error %',
    cell: (r) => (
      <span className="cmc-numeric">{(r.error_rate * 100).toFixed(1)}%</span>
    ),
    sortable: true,
    sort: (a, b) => a.error_rate - b.error_rate,
  },
  {
    id: 'flag',
    header: '',
    cell: (r) => <FlagBadge tool={r} />,
  },
]

export function ToolLatencyCard({ panelId, headerMenu }: LayoutCustomizableProps = {}) {
  // Phase 26 TIME-02 bridge: URL → vocab; per-route default 'today' on /.
  const globalRange = useRouteRange('today')
  const [localRange, setLocalRange] = useState<Range | null>(null)
  const effectiveRange = localRange ?? globalRange
  const [sort, setSort] = useState<DataTableSort>({ col: 'p95_ms', dir: 'desc' })
  const query = useLatency(effectiveRange)
  return (
    <PanelCard<ToolLatencyResponse>
      reqId="OPNL-08"
      title="Tool Latency"
      query={query}
      bounded
      panelId={panelId}
      headerMenu={headerMenu}
      empty={{
        dataNoun: 'tool latency data',
        when: (d) => d.items.length === 0,
      }}
      trailing={
        <RangeToggle<Range>
          value={effectiveRange}
          onChange={setLocalRange}
          options={RANGE_OPTIONS}
        />
      }
    >
      {(data) => (
        <DataTable<ToolLatencyRow>
          rows={data.items}
          columns={COLUMNS}
          rowKey={(r) => r.tool_name}
          sort={sort}
          onSortChange={setSort}
          ariaLabel="Tool latency"
        />
      )}
    </PanelCard>
  )
}
