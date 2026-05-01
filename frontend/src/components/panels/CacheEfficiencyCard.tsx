// CacheEfficiencyCard — OPNL-06 (current).
//
// Big number (overall hit_rate × 100 displayed as %) + sparkline of trend
// hit_rate with a 70% target ReferenceLine + a Low-sample Badge when the
// payload's `low_sample` is true. Pulls /api/usage/cache at 60s cadence via
// useCache(range) — refetchInterval owned by lib/queries.ts.

import { useState } from 'react'
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Badge, KpiTile, PanelCard, RangeToggle } from '../ui'
import { useCache } from '../../lib/queries'
import type { CacheResponse, Range } from '../../lib/api'

const RANGE_OPTIONS = [
  { value: 'today' as const, label: 'Today' },
  { value: '7d' as const, label: '7d' },
  { value: '30d' as const, label: '30d' },
]

export function CacheEfficiencyCard() {
  const [range, setRange] = useState<Range>('7d')
  const query = useCache(range)
  return (
    <PanelCard<CacheResponse>
      reqId="OPNL-06"
      title="Cache Efficiency"
      query={query}
      empty={{
        dataNoun: 'cache hit rate data',
        when: (d) => d.trend.length === 0,
      }}
      trailing={
        <RangeToggle<Range>
          value={range}
          onChange={setRange}
          options={RANGE_OPTIONS}
          persistKey="cache-efficiency"
        />
      }
    >
      {(data) => {
        const pct = (data.hit_rate * 100).toFixed(1)
        return (
          <div className="cmc-cache-efficiency">
            <div className="cmc-cache-efficiency__top">
              <KpiTile label="Hit rate" value={`${pct}%`} mono />
              {data.low_sample ? (
                <Badge variant="warning">Low sample</Badge>
              ) : null}
            </div>
            <figure className="cmc-chart-fig" aria-label="Cache hit rate trend">
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={data.trend}>
                  <XAxis dataKey="day" stroke="var(--cmc-text-subtle)" fontSize={12} />
                  <YAxis
                    domain={[0, 1]}
                    stroke="var(--cmc-text-subtle)"
                    fontSize={12}
                    tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      background: 'var(--cmc-surface-3)',
                      border: '1px solid var(--cmc-border)',
                      borderRadius: 8,
                      color: 'var(--cmc-text)',
                    }}
                    formatter={(value) => {
                      const v = typeof value === 'number' ? value : 0
                      return [`${(v * 100).toFixed(1)}%`, 'hit rate'] as [string, string]
                    }}
                  />
                  <ReferenceLine
                    y={0.7}
                    strokeDasharray="3 3"
                    stroke="var(--cmc-status-amber)"
                    label={{
                      value: '70% target',
                      position: 'insideTopRight',
                      fill: 'var(--cmc-status-amber)',
                      fontSize: 10,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="hit_rate"
                    stroke="var(--cmc-accent-blue)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </figure>
          </div>
        )
      }}
    </PanelCard>
  )
}
