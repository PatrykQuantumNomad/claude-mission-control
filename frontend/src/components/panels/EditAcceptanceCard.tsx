// EditAcceptanceCard — OPNL-12 (current).
//
// Always renders 4 fixed rows (Edit/MultiEdit/Write/NotebookEdit) — when the
// backend returns fewer rows, missing tools render with placeholder zero
// values. Each row shows accepted/rejected/accept_rate + Badge variant=warning
// when low_sample. Pulls /api/tools/edit-decisions at 60s cadence via
// useEdits(range).

import { useState } from 'react'
import { Badge, DataTable, PanelCard, RangeToggle } from '../ui'
import type { DataTableColumn } from '../ui'
import { useEdits } from '../../lib/queries'
import type { EditDecisionRow, EditDecisionsResponse, Range } from '../../lib/api'
import { useRouteRange } from '../../lib/time/useRouteRange'

const RANGE_OPTIONS = [
  { value: 'today' as const, label: 'Today' },
  { value: '7d' as const, label: '7d' },
  { value: '30d' as const, label: '30d' },
]

const FIXED_TOOLS = ['Edit', 'MultiEdit', 'Write', 'NotebookEdit'] as const

const nf = new Intl.NumberFormat('en')

function fillFixedRows(items: EditDecisionRow[]): EditDecisionRow[] {
  const map = new Map(items.map((r) => [r.tool_name, r]))
  return FIXED_TOOLS.map((tool) => {
    const existing = map.get(tool)
    if (existing) return existing
    return {
      tool_name: tool,
      accepted: 0,
      rejected: 0,
      accept_rate: 0,
      low_sample: true,
    }
  })
}

const COLUMNS: DataTableColumn<EditDecisionRow>[] = [
  {
    id: 'tool_name',
    header: 'Tool',
    cell: (r) => (
      <span className="cmc-numeric" style={{ color: 'var(--cmc-text)' }}>
        {r.tool_name}
      </span>
    ),
  },
  {
    id: 'accepted',
    header: 'Accepted',
    cell: (r) => <span className="cmc-numeric">{nf.format(r.accepted)}</span>,
  },
  {
    id: 'rejected',
    header: 'Rejected',
    cell: (r) => <span className="cmc-numeric">{nf.format(r.rejected)}</span>,
  },
  {
    id: 'accept_rate',
    header: 'Accept rate',
    cell: (r) => {
      const pct = (r.accept_rate * 100).toFixed(1)
      return (
        <span className="cmc-flag-badge">
          <span className="cmc-numeric">{pct}%</span>
          {r.low_sample ? <Badge variant="warning">low sample</Badge> : null}
        </span>
      )
    },
  },
]

export function EditAcceptanceCard() {
  // Phase 26 TIME-02 bridge: URL → vocab; per-route default 'today' on /.
  const globalRange = useRouteRange('today')
  const [localRange, setLocalRange] = useState<Range | null>(null)
  const effectiveRange = localRange ?? globalRange
  const query = useEdits(effectiveRange)
  return (
    <PanelCard<EditDecisionsResponse>
      reqId="OPNL-12"
      title="Edit Acceptance"
      query={query}
      bounded
      empty={{
        dataNoun: 'edit decision data',
        // Fixed-row card always renders → never empty.
        when: () => false,
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
        <DataTable<EditDecisionRow>
          rows={fillFixedRows(data.items)}
          columns={COLUMNS}
          rowKey={(r) => r.tool_name}
          ariaLabel="Edit acceptance by tool"
        />
      )}
    </PanelCard>
  )
}
