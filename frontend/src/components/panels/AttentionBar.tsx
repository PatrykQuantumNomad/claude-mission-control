// AttentionBar — OPNL-03 (Phase 6 Plan 02 / Wave 2).
//
// Full-width warning bar that DISAPPEARS via PanelCard's hiddenWhenEmpty=true
// when there is nothing demanding the operator's attention. Pulls /api/attention
// every 10s via useAttention (cadence locked in lib/queries.ts).
//
// Empty predicate (PanelCard hides → returns null when ALL of):
//   - items.length === 0
//   - stuck_sessions === 0
//   - stale_dispatcher_seconds === null
//
// Visible content:
//   - Badge "Stuck sessions: N" when stuck_sessions > 0
//   - Badge "Dispatcher stale Xs" when stale_dispatcher_seconds != null
//   - One pill per items[i] showing kind/severity/count/detail
//
// Phase 7 will populate pending_decisions / failed_tasks; AttentionBar v1 ignores them.

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
          d.stale_dispatcher_seconds === null,
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
