// AgentFanoutCard — OPNL-11 (current).
//
// Lists sessions running the Agent tool with fanout count + RelativeTime.
// When `title` is null, falls back to `session_id.slice(0,8)…` rendered in
// --cmc-text-subtle. Pulls /api/tools/agent-fanout at 120s cadence via
// useFanout(range).

import { useState } from 'react'
import { PanelCard, RangeToggle, RelativeTime } from '../ui'
import { useFanout } from '../../lib/queries'
import type { AgentFanoutResponse, Range } from '../../lib/api'

const RANGE_OPTIONS = [
  { value: 'today' as const, label: 'Today' },
  { value: '7d' as const, label: '7d' },
  { value: '30d' as const, label: '30d' },
]

const nf = new Intl.NumberFormat('en')

export function AgentFanoutCard() {
  const [range, setRange] = useState<Range>('7d')
  const query = useFanout(range)
  return (
    <PanelCard<AgentFanoutResponse>
      reqId="OPNL-11"
      title="Agent Fanout"
      query={query}
      empty={{
        dataNoun: 'agent invocations',
        when: (d) => d.items.length === 0,
      }}
      trailing={
        <RangeToggle<Range>
          value={range}
          onChange={setRange}
          options={RANGE_OPTIONS}
          persistKey="agent-fanout"
        />
      }
    >
      {(data) => (
        <ul className="cmc-agent-fanout-list" aria-label="Agent fanout sessions">
          {data.items.map((row) => (
            <li key={row.session_id} className="cmc-agent-fanout-row">
              {row.title ? (
                <span className="cmc-agent-fanout-row__title">{row.title}</span>
              ) : (
                <span className="cmc-agent-fanout-row__title--fallback">
                  {row.session_id.slice(0, 8)}
                  {'\u2026'}
                </span>
              )}
              <span className="cmc-agent-fanout-row__calls">
                {nf.format(row.agent_calls)} call{row.agent_calls === 1 ? '' : 's'}
              </span>
              <RelativeTime value={row.started_at} />
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  )
}
