// AlertEventsList — ALRT-10 (Phase 15 Plan 05).
//
// Renders firing history (events) from useAlertEvents(range). Each row is one
// decision WHERE dedup_key LIKE 'alert:%' (backend AlertEventsResponse — see
// lib/api.ts:566). Columns: fired_at (RelativeTime) / rule_name / scope_key /
// status (StatePill) / last_value.
//
// 4-tier RangeToggle (1d / 7d / 14d / 30d) per Plan 04 D-01 — alerts events
// have no <14d noisy-data constraint (unlike skills analytics which is 14d|30d).
// persistKey='alert-events-range' round-trips through lib/storage.
//
// StatePill mapping per <interfaces> behavior:
//   status='pending'  → variant='pending' (warning amber) label='Firing'
//   status='answered' → variant='ok'      (success green) label='Cleared'
//
// last_value formatted as toFixed(2) (consistent with format_alert in Plan 03).
//
// Cadence is locked at 30_000ms in lib/queries.ts (useAlertEvents) — this
// panel does NOT inline refetchInterval (project convention).

import { useState } from 'react'
import { DataTable, PanelCard, RangeToggle, RelativeTime, StatePill } from '../ui'
import type { DataTableColumn, RangeOption } from '../ui'
import { useAlertEvents } from '../../lib/queries'
import type { AlertEvent, AlertEventsResponse, AlertRange } from '../../lib/api'

const EM_DASH = '—'

const RANGE_OPTIONS: RangeOption<AlertRange>[] = [
  { value: '1d', label: '1d' },
  { value: '7d', label: '7d' },
  { value: '14d', label: '14d' },
  { value: '30d', label: '30d' },
]

function formatLastValue(v: number | null): string {
  if (v === null) return EM_DASH
  return v.toFixed(2)
}

function StatusCell({ event }: { event: AlertEvent }) {
  if (event.status === 'pending') {
    return <StatePill state="pending" label="Firing" />
  }
  return <StatePill state="ok" label="Cleared" />
}

const COLUMNS: DataTableColumn<AlertEvent>[] = [
  {
    id: 'fired_at',
    header: 'When',
    cell: (r) => <RelativeTime value={r.fired_at} />,
    width: 140,
  },
  {
    id: 'rule_name',
    header: 'Rule',
    cell: (r) => <strong>{r.rule_name}</strong>,
  },
  {
    id: 'scope_key',
    header: 'Scope',
    cell: (r) => <span className="cmc-mono">{r.scope_key}</span>,
  },
  {
    id: 'status',
    header: 'Status',
    cell: (r) => <StatusCell event={r} />,
    width: 120,
  },
  {
    id: 'last_value',
    header: 'Value',
    cell: (r) => <span className="cmc-numeric">{formatLastValue(r.last_value)}</span>,
    width: 100,
  },
]

export function AlertEventsList() {
  const [range, setRange] = useState<AlertRange>('7d')
  const query = useAlertEvents(range)

  return (
    <PanelCard<AlertEventsResponse>
      reqId="ALRT-10"
      title="Alert History"
      description="Recent firing events. Pending rows are still active; cleared rows resolved themselves."
      query={query}
      empty={{
        dataNoun: 'alert firings',
        when: (d) => !d.items || d.items.length === 0,
      }}
      trailing={
        <RangeToggle<AlertRange>
          value={range}
          onChange={setRange}
          options={RANGE_OPTIONS}
          persistKey="alert-events-range"
          ariaLabel="Alert events range"
        />
      }
    >
      {(data) => (
        <DataTable<AlertEvent>
          rows={data.items}
          columns={COLUMNS}
          rowKey={(r) => String(r.decision_id)}
          ariaLabel="Alert firing history"
        />
      )}
    </PanelCard>
  )
}
