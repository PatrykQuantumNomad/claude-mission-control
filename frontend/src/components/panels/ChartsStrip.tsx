// ChartsStrip — ACTV-02 (current) + TIME-05 (Phase 26 Plan 05).
//
// 14-day stacked token bar chart for the /activity page. The backend
// /api/usage/tokens Range Literal accepts only {today, 7d, 30d}; we
// overfetch 30d and slice the last 14 days client-side via sliceLast14Days
// (06-design notes).
//
// /api/usage/tokens does not accept '14d' (Literal closed in observability.py);
// we overfetch 30d and slice client-side per design notes.
//
// Plan 26-05: Brush element is mounted INSIDE the existing BarChart (which
// lives inside the existing recharts responsive wrapper). Net new
// responsive-wrapper count: 0 — preserves Phase 24 Pitfall 4 lock.
// useChartBrush wires the brush's onDragEnd to a navigate() call that
// writes absolute ISO time_from/time_to to the URL, triggering both
// AutoRefreshController's pause branch and the global TimePicker label
// re-render via useSearch fan-out.

import {
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { PanelCard } from '../ui'
import { ResetZoomButton } from '../ui/ResetZoomButton'
import { useChartBrush } from '../time/ChartBrushController'
import { useTokens } from '../../lib/queries'
import type { TokenUsageResponse } from '../../lib/api'
import { sliceLast14Days } from './ChartsStrip.utils'
import type { DailyTokenBuckets } from './TokenUsageCard.utils'

// Inner render-prop body extracted as its own component so the useChartBrush
// hook call lives at a stable component scope (not inside the
// PanelCard render-prop closure, which would re-run the hook on every
// query-state transition without React detecting the call site).
function ChartsStripBody({ data }: { data: TokenUsageResponse }) {
  const sliced: DailyTokenBuckets[] = sliceLast14Days(data.items)
  const { onDragEnd } = useChartBrush({ data: sliced })
  return (
    <figure className="cmc-chart-fig cmc-charts-strip" aria-label="14-day token trend">
      <div className="cmc-charts-strip__chrome" data-testid="charts-strip-brush-chrome">
        <ResetZoomButton />
      </div>
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
          <Brush
            dataKey="day"
            height={28}
            stroke="var(--cmc-accent-blue)"
            fill="var(--cmc-surface-2)"
            travellerWidth={8}
            // recharts' published Brush type predates the onDragEnd payload
            // we consume; cast to keep tsc happy without inflating the
            // ChartBrushController surface area.
            onDragEnd={onDragEnd as never}
          />
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
}

export function ChartsStrip() {
  // /api/usage/tokens does not accept '14d' (Literal closed in observability.py);
  // we overfetch 30d and slice client-side per design notes.
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
      {(data) => <ChartsStripBody data={data} />}
    </PanelCard>
  )
}
