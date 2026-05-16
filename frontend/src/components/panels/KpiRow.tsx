// KpiRow — OPNL-02 (current).
//
// Four-up KPI tile row rendered above the panel grid on / route. Pulls
// /api/summary every 15s via useSummary (cadence locked in lib/queries.ts).
// Special-cased empty rule: ALWAYS renders 4 tiles even when numbers are
// zero (override empty.when to () => false).
//
// Tiles:
//   1. Sessions  — sessions_count
//   2. Tokens    — sum of all 4 token fields, comma-grouped via Intl.NumberFormat
//   3. Tool Calls — tool_call_count
//   4. Errors    — error_count, with red emphasis when > 0

import { KpiTile, PanelCard, RelativeTime, type LayoutCustomizableProps } from '../ui'
import { useSummary } from '../../lib/queries'
import type { TodaySummaryResponse } from '../../lib/api'

const nf = new Intl.NumberFormat('en')

function totalTokens(d: TodaySummaryResponse): number {
  return (
    d.tokens_input_total +
    d.tokens_output_total +
    d.tokens_cache_read_total +
    d.tokens_cache_create_total
  )
}

export function KpiRow({ panelId, headerMenu }: LayoutCustomizableProps = {}) {
  const query = useSummary()
  return (
    <PanelCard<TodaySummaryResponse>
      reqId="OPNL-02"
      title="Today"
      query={query}
      empty={{ dataNoun: 'today summary', when: () => false }}
      bounded
      panelId={panelId}
      headerMenu={headerMenu}
      trailing={
        query.data ? <RelativeTime value={query.data.date} absoluteTooltip={false} /> : null
      }
    >
      {(data) => (
        <div className="cmc-kpi-row">
          <KpiTile label="Sessions" value={nf.format(data.sessions_count)} mono />
          <KpiTile label="Tokens" value={nf.format(totalTokens(data))} mono />
          <KpiTile label="Tool Calls" value={nf.format(data.tool_call_count)} mono />
          <KpiTile
            label="Errors"
            value={
              data.error_count > 0 ? (
                <span className="cmc-kpi-row__error">{nf.format(data.error_count)}</span>
              ) : (
                nf.format(data.error_count)
              )
            }
            mono
          />
        </div>
      )}
    </PanelCard>
  )
}
