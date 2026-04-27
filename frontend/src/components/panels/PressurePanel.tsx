// PressurePanel — OPNL-14 (Phase 6 Plan 03 / Wave 3).
//
// Operator-pressure indicators: api_retries_exhausted (red emphasis when >0),
// compaction_count, and a CollapsibleSection containing the 10 most-recent
// api_errors. Pulls /api/system/pressure at 30s cadence via usePressure().
// Empty rule: NEVER hide — when both counters are 0 we still want the panel
// visible to signal "no pressure" (custom empty.when => false).

import {
  CollapsibleSection,
  PanelCard,
  RelativeTime,
  StatList,
} from '../ui'
import { usePressure } from '../../lib/queries'
import type { PressureResponse } from '../../lib/api'

const nf = new Intl.NumberFormat('en')

function shortSid(sid: string | null): string {
  if (!sid) return '—'
  return sid.length > 8 ? sid.slice(0, 8) : sid
}

export function PressurePanel() {
  const query = usePressure()
  return (
    <PanelCard<PressureResponse>
      reqId="OPNL-14"
      title="Pressure"
      query={query}
      empty={{
        dataNoun: 'system pressure data',
        when: () => false,
      }}
    >
      {(data) => {
        const recent = data.recent_api_errors.slice(0, 10)
        return (
          <div className="cmc-pressure">
            <StatList
              items={[
                {
                  label: 'API retries exhausted',
                  value:
                    data.api_retries_exhausted > 0 ? (
                      <span className="cmc-pressure__retries-emphasis">
                        {nf.format(data.api_retries_exhausted)}
                      </span>
                    ) : (
                      nf.format(data.api_retries_exhausted)
                    ),
                },
                {
                  label: 'Compactions',
                  value: nf.format(data.compaction_count),
                },
              ]}
            />
            <CollapsibleSection
              id="pressure-recent-errors"
              title={`Recent API errors (${recent.length})`}
              defaultOpen={false}
            >
              {recent.length === 0 ? (
                <p style={{ color: 'var(--cmc-text-subtle)', margin: 0 }}>
                  No recent API errors.
                </p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {recent.map((err, idx) => (
                    <li
                      key={`${err.ts}-${idx}`}
                      className="cmc-pressure__error-row"
                    >
                      <RelativeTime value={err.ts} />
                      <span className="cmc-pressure__error-sid">
                        {shortSid(err.session_id)}
                      </span>
                      <span
                        className="cmc-pressure__error-msg"
                        title={err.message}
                      >
                        {err.message}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CollapsibleSection>
          </div>
        )
      }}
    </PanelCard>
  )
}
