// AttentionBar — OPNL-03 (Phase 6 Plan 02 / Wave 2; extended Phase 7 Plan 03).
//
// Full-width warning bar that DISAPPEARS via PanelCard's hiddenWhenEmpty=true
// when there is nothing demanding the operator's attention. Pulls /api/attention
// every 10s via useAttention (cadence locked in lib/queries.ts).
//
// Empty predicate (PanelCard hides → returns null when ALL of):
//   - items.length === 0
//   - stuck_sessions === 0
//   - stale_dispatcher_seconds === null
//   - pending_decisions === 0 (Plan 07-03)
//   - failed_tasks === 0 (Plan 07-03)
//
// Visible content:
//   - Badge "Stuck sessions: N" when stuck_sessions > 0
//   - Badge "Dispatcher stale Xs" when stale_dispatcher_seconds != null
//   - Badge "N pending decisions" when pending_decisions > 0 (Plan 07-03)
//   - Badge "N failed tasks" when failed_tasks > 0 (Plan 07-03)
//   - One pill per items[i] showing kind/severity/count/detail
//
// Plan 07-03 closes the Plan 06-02 deferral by surfacing pending_decisions
// + failed_tasks (now real-data-backed in routes/system.py SAPI-04).

import { Badge, PanelCard } from '../ui'
import { useAttention } from '../../lib/queries'
import type { AttentionItem, AttentionResponse } from '../../lib/api'

function severityVariant(s: AttentionItem['severity']): 'info' | 'warning' | 'danger' {
  if (s === 'error') return 'danger'
  if (s === 'warning') return 'warning'
  return 'info'
}

export function AttentionBar() {
  const query = useAttention()
  return (
    <PanelCard<AttentionResponse>
      reqId="OPNL-03"
      title="Attention"
      query={query}
      hiddenWhenEmpty
      empty={{
        dataNoun: 'attention items',
        when: (d) =>
          d.items.length === 0 &&
          d.stuck_sessions === 0 &&
          d.stale_dispatcher_seconds === null &&
          d.pending_decisions === 0 &&
          d.failed_tasks === 0,
      }}
    >
      {(data) => (
        <div className="cmc-attention-bar" role="region" aria-label="Attention">
          {data.stuck_sessions > 0 ? (
            <Badge variant="warning">Stuck sessions: {data.stuck_sessions}</Badge>
          ) : null}
          {data.stale_dispatcher_seconds !== null ? (
            <Badge variant="warning">
              Dispatcher stale {Math.round(data.stale_dispatcher_seconds)}s
            </Badge>
          ) : null}
          {data.pending_decisions > 0 ? (
            <Badge variant="warning">
              {data.pending_decisions} pending decision
              {data.pending_decisions === 1 ? '' : 's'}
            </Badge>
          ) : null}
          {data.failed_tasks > 0 ? (
            <Badge variant="danger">
              {data.failed_tasks} failed task
              {data.failed_tasks === 1 ? '' : 's'}
            </Badge>
          ) : null}
          {data.items.map((item, idx) => (
            <Badge
              key={`${item.kind}-${idx}`}
              variant={severityVariant(item.severity)}
              title={item.detail ?? undefined}
            >
              {item.kind}
              {item.count > 1 ? ` ×${item.count}` : ''}
              {item.detail ? `: ${item.detail}` : ''}
            </Badge>
          ))}
        </div>
      )}
    </PanelCard>
  )
}
