// UnifiedFailures — ACTV-05 (current).
//
// Surfaces /api/sessions/failures (route shipped in implementation) so operators
// have a "what crashed?" view across recent sessions. Each row shows:
//   - outcome Badge (variant=danger for errored, variant=warning for rate_limited)
//   - session_id (mono, truncated to 8 chars + ellipsis; full id on hover via title)
//   - RelativeTime started_at
//   - last_error_message in --cmc-text-dim mono (one-liner; truncates)
//
// Range fixed at '30d' for v1 — operators care about recent crashes, and the
// 30s polling cadence (locked in lib/queries.ts useFailures) keeps the list
// fresh without inlining refetchInterval here.

import { Badge, PanelCard, RelativeTime } from '../ui'
import { useFailures } from '../../lib/queries'
import type { FailuresResponse, FailureRow } from '../../lib/api'

function outcomeVariant(outcome: string): 'danger' | 'warning' | 'neutral' {
  if (outcome === 'errored') return 'danger'
  if (outcome === 'rate_limited') return 'warning'
  return 'neutral'
}

export function UnifiedFailures() {
  const query = useFailures('30d')
  return (
    <PanelCard<FailuresResponse>
      reqId="ACTV-05"
      title="Recent Failures"
      query={query}
      empty={{
        dataNoun: 'failed sessions',
        when: (d) => d.items.length === 0,
      }}
    >
      {(data) => (
        <ul className="cmc-failures-list" aria-label="Recent failed sessions">
          {data.items.map((row: FailureRow) => (
            <li key={row.session_id} className="cmc-failures-row">
              <Badge variant={outcomeVariant(row.outcome)}>{row.outcome}</Badge>
              <span className="cmc-failures-row__sid cmc-mono" title={row.session_id}>
                {row.session_id.slice(0, 8)}
                {'\u2026'}
              </span>
              <RelativeTime value={row.started_at} />
              <span className="cmc-failures-row__msg cmc-mono">
                {row.last_error_message ?? '—'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  )
}
