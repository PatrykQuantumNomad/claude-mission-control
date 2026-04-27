// ChartsStrip — ACTV-02 (Phase 6 Plan 04 / Wave 4).
//
// 14-day stacked token bar chart for the /activity page. The backend
// /api/usage/tokens Range Literal accepts only {today, 7d, 30d}; we
// overfetch 30d and slice the last 14 days client-side via sliceLast14Days
// (06-RESEARCH §11 mitigation — no backend change).
//
// /api/usage/tokens does not accept '14d' (Literal closed in observability.py);
// we overfetch 30d and slice client-side per RESEARCH §11.

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { PanelCard } from '../ui'
import { useTokens } from '../../lib/queries'
import type { TokenUsageResponse } from '../../lib/api'
import { sliceLast14Days } from './ChartsStrip.utils'

export function ChartsStrip() {
  // /api/usage/tokens does not accept '14d' (Literal closed in observability.py);
  // we overfetch 30d and slice client-side per RESEARCH §11.
  const query = useTokens('30d')
  return (
    <PanelCard<TokenUsageResponse>
      reqId="ACTV-02"
      title="14-Day Token Trend"
      query={query}
      empty={{
        dataNoun: '14 days of token usage',
        when: (d) => d.items.length === 0,
      }}
    >
      {(data) => {
        const sliced = sliceLast14Days(data.items)
        return (
          <figure className="cmc-chart-fig cmc-charts-strip" aria-label="14-day token trend">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={sliced}>
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
              <caption>14-day token totals by type</caption>
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
                {sliced.map((row) => (
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
