// SessionOutcomesCard — OPNL-07 (current).
//
// Stacked daily bar chart with mutually-exclusive outcome buckets
// (errored / rate_limited / truncated / unfinished / ok) summing to that
// day's total session count. Pulls /api/sessions/outcomes at 60s cadence
// via useOutcomes(range) — refetchInterval owned by lib/queries.ts.

import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { PanelCard, RangeToggle } from '../ui'
import { useOutcomes } from '../../lib/queries'
import type { OutcomesResponse, Range } from '../../lib/api'

const RANGE_OPTIONS = [
  { value: 'today' as const, label: 'Today' },
  { value: '7d' as const, label: '7d' },
  { value: '30d' as const, label: '30d' },
]

export function SessionOutcomesCard() {
  const [range, setRange] = useState<Range>('7d')
  const query = useOutcomes(range)
  return (
    <PanelCard<OutcomesResponse>
      reqId="OPNL-07"
      title="Session Outcomes"
      query={query}
      empty={{
        dataNoun: 'session outcome data',
        when: (d) => d.items.length === 0,
      }}
      trailing={
        <RangeToggle<Range>
          value={range}
          onChange={setRange}
          options={RANGE_OPTIONS}
          persistKey="session-outcomes"
        />
      }
    >
      {(data) => (
        <figure className="cmc-chart-fig" aria-label="Daily session outcomes">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.items}>
              <CartesianGrid stroke="var(--cmc-border)" strokeDasharray="3 3" />
              <XAxis dataKey="day" stroke="var(--cmc-text-subtle)" fontSize={12} />
              <YAxis stroke="var(--cmc-text-subtle)" fontSize={12} />
              <RechartsTooltip
                cursor={{ fill: 'var(--cmc-surface-2)' }}
                contentStyle={{
                  background: 'var(--cmc-surface-3)',
                  border: '1px solid var(--cmc-border)',
                  borderRadius: 8,
                  color: 'var(--cmc-text)',
                }}
              />
              <Bar dataKey="errored" stackId="o" fill="var(--cmc-status-red)" />
              <Bar dataKey="rate_limited" stackId="o" fill="var(--cmc-status-amber)" />
              <Bar dataKey="truncated" stackId="o" fill="var(--cmc-accent-purple)" />
              <Bar dataKey="unfinished" stackId="o" fill="var(--cmc-text-dim)" />
              <Bar dataKey="ok" stackId="o" fill="var(--cmc-status-green)" />
            </BarChart>
          </ResponsiveContainer>
          <table className="cmc-sr-only">
            <caption>Session outcomes by day</caption>
            <thead>
              <tr>
                <th>Day</th>
                <th>Errored</th>
                <th>Rate-limited</th>
                <th>Truncated</th>
                <th>Unfinished</th>
                <th>OK</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.day}>
                  <td>{row.day}</td>
                  <td>{row.errored}</td>
                  <td>{row.rate_limited}</td>
                  <td>{row.truncated}</td>
                  <td>{row.unfinished}</td>
                  <td>{row.ok}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </figure>
      )}
    </PanelCard>
  )
}
