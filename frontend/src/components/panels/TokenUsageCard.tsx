// TokenUsageCard — OPNL-05 (Phase 6 Plan 03 / Wave 3).
//
// Stacked daily bar chart of token usage broken out by token TYPE
// (input/output/cache_read/cache_create). Pulls /api/usage/tokens at the
// 60s daily-aggregate cadence via useTokens(range) — refetchInterval is
// owned by lib/queries.ts, NEVER inlined here.
//
// Accessibility: chart wraps in <figure aria-label="Daily token breakdown">
// with a screen-reader-only fallback table (06-RESEARCH §risk register).
// Model/source-axis stacking deferred to v2.

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
import { useTokens } from '../../lib/queries'
import type { Range, TokenUsageResponse } from '../../lib/api'
import { groupTokensByDay } from './TokenUsageCard.utils'

const RANGE_OPTIONS = [
  { value: 'today' as const, label: 'Today' },
  { value: '7d' as const, label: '7d' },
  { value: '30d' as const, label: '30d' },
]

export function TokenUsageCard() {
  const [range, setRange] = useState<Range>('7d')
  const query = useTokens(range)
  return (
    <PanelCard<TokenUsageResponse>
      reqId="OPNL-05"
      title="Token Usage"
      query={query}
      empty={{
        dataNoun: 'token usage data',
        when: (d) => d.items.length === 0,
      }}
      trailing={
        <RangeToggle<Range>
          value={range}
          onChange={setRange}
          options={RANGE_OPTIONS}
          persistKey="token-usage"
        />
      }
    >
      {(data) => {
        const daily = groupTokensByDay(data.items)
        return (
          <figure className="cmc-chart-fig" aria-label="Daily token breakdown">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={daily}>
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
                <Bar dataKey="input" stackId="t" fill="var(--cmc-accent-blue)" />
                <Bar dataKey="output" stackId="t" fill="var(--cmc-accent-purple)" />
                <Bar dataKey="cache_read" stackId="t" fill="var(--cmc-status-cyan)" />
                <Bar dataKey="cache_create" stackId="t" fill="var(--cmc-status-green)" />
              </BarChart>
            </ResponsiveContainer>
            <table className="cmc-sr-only">
              <caption>Daily token totals by type</caption>
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Input</th>
                  <th>Output</th>
                  <th>Cache read</th>
                  <th>Cache create</th>
                </tr>
              </thead>
              <tbody>
                {daily.map((row) => (
                  <tr key={row.day}>
                    <td>{row.day}</td>
                    <td>{row.input}</td>
                    <td>{row.output}</td>
                    <td>{row.cache_read}</td>
                    <td>{row.cache_create}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </figure>
        )
      }}
    </PanelCard>
  )
}
