// AlertEventsList — ALRT-10 (Phase 15 Plan 05) + Phase 27 Plan 06.
//
// Renders firing history (events) from useAlertEvents(range). Each row is one
// decision WHERE dedup_key LIKE 'alert:%' (backend AlertEventsResponse — see
// lib/api.ts:566). Columns: fired_at (RelativeTime) / rule_name / scope_key /
// status (StatePill) / last_value.
//
// Phase 27 Plan 06 migration: the v1.2 `useState<AlertRange>('7d')` +
// per-panel RangeToggle (localStorage-backed) has been REPLACED with
// `useRouteRangeVocab('7d', snapToAlertRange)` from Phase 27 Plan 01. The URL
// is now the canonical persistence layer — the global TimePicker writes
// ?time_from + ?time_to, this panel re-queries automatically because the
// query key changes with `range`. Pre-existing entries under the legacy
// localStorage key become dead values (matches Plan 27-05's stance for
// `cost-by-project`). The 4-tier vocab is preserved via snapToAlertRange's
// 48h/192h/504h boundaries (identical to CostRange).
//
// StatePill mapping per <interfaces> behavior:
//   status='pending'  → variant='pending' (warning amber) label='Firing'
//   status='answered' → variant='ok'      (success green) label='Cleared'
//
// last_value formatted as toFixed(2) (consistent with format_alert in Plan 03).
//
// Cadence is locked at 30_000ms in lib/queries.ts (useAlertEvents) — this
// panel does NOT inline refetchInterval (project convention).

import { DataTable, PanelCard, RelativeTime, StatePill } from '../ui'
import type { DataTableColumn, LayoutCustomizableProps } from '../ui'
import { useAlertEvents } from '../../lib/queries'
import {
  snapToAlertRange,
  useRouteRangeVocab,
} from '../../lib/time/useRouteRangeVocab'
import type { AlertEvent, AlertEventsResponse, AlertRange } from '../../lib/api'

const EM_DASH = '—'

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

export function AlertEventsList({ panelId, headerMenu }: LayoutCustomizableProps = {}) {
  // Phase 27 Plan 06: URL-driven range via useRouteRangeVocab.
  // Returns '7d' when the URL has no time picker (matches the v1.2
  // useState<AlertRange>('7d') initial value); otherwise snaps the URL
  // window hours to the AlertRange Literal '1d' | '7d' | '14d' | '30d'
  // via snapToAlertRange's 48h/192h/504h boundaries. The global TimePicker
  // writes time_from/time_to; this panel re-queries automatically because
  // the query key changes with `range`.
  const range = useRouteRangeVocab<AlertRange>('7d', snapToAlertRange)
  const query = useAlertEvents(range)

  return (
    <PanelCard<AlertEventsResponse>
      reqId="ALRT-10"
      title="Alert History"
      description="Recent firing events. Pending rows are still active; cleared rows resolved themselves."
      query={query}
      bounded
      panelId={panelId}
      headerMenu={headerMenu}
      empty={{
        dataNoun: 'alert firings',
        when: (d) => !d.items || d.items.length === 0,
      }}
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
