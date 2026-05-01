// HookActivityCard — OPNL-09 (current).
//
// Stacked daily bar chart of hook fires by hook_name + a sample-weighted
// per-hook p50 paired-duration summary line below the chart.
// Empty rule: total_fires === 0 (zero-aggregate) → EmptyState. Pulls
// /api/hooks/activity at 60s cadence via useHooks(range).

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
import { useHooks } from '../../lib/queries'
import type { HookActivityResponse, Range } from '../../lib/api'
import { aggregateP50ByHook, colorForHook, pivotHooksByDay } from './HookActivityCard.utils'

const RANGE_OPTIONS = [
  { value: 'today' as const, label: 'Today' },
  { value: '7d' as const, label: '7d' },
  { value: '30d' as const, label: '30d' },
]

export function HookActivityCard() {
  const [range, setRange] = useState<Range>('7d')
  const query = useHooks(range)
  return (
    <PanelCard<HookActivityResponse>
      reqId="OPNL-09"
      title="Hook Activity"
      query={query}
      empty={{
        dataNoun: 'hook fires',
        when: (d) => d.total_fires === 0,
      }}
      trailing={
        <RangeToggle<Range>
          value={range}
          onChange={setRange}
          options={RANGE_OPTIONS}
          persistKey="hook-activity"
        />
      }
    >
      {(data) => {
        const { rows, hookNames } = pivotHooksByDay(data.items)
        const p50s = aggregateP50ByHook(data.items)
        return (
          <div className="cmc-hook-activity">
            <figure className="cmc-chart-fig" aria-label="Daily hook fires">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={rows}>
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
                  {hookNames.map((name, idx) => (
                    <Bar
                      key={name}
                      dataKey={name}
                      stackId="h"
                      fill={colorForHook(idx)}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </figure>
            {p50s.length > 0 ? (
              <ul className="cmc-hook-activity__p50-list" aria-label="p50 paired duration">
                {p50s.map((row) => (
                  <li key={row.hook_name} className="cmc-hook-activity__p50-row">
                    <span className="cmc-hook-activity__p50-label">{row.hook_name}</span>
                    <span className="cmc-hook-activity__p50-value cmc-numeric">
                      {row.p50_ms === null ? '—' : `${row.p50_ms}ms`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )
      }}
    </PanelCard>
  )
}
