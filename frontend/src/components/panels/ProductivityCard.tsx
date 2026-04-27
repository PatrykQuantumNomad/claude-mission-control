// ProductivityCard — OPNL-13 (Phase 6 Plan 03 / Wave 3).
//
// StatList of commits / PRs / lines added / lines removed pulled from
// /api/activity/productivity at 120s cadence via useProductivity(range).
// Empty: zero-aggregate (all four metrics === 0).

import { useState } from 'react'
import { GitCommit, GitPullRequest, Minus, Plus } from 'lucide-react'
import { PanelCard, RangeToggle, StatList } from '../ui'
import { useProductivity } from '../../lib/queries'
import type { ProductivityResponse, Range } from '../../lib/api'

const RANGE_OPTIONS = [
  { value: 'today' as const, label: 'Today' },
  { value: '7d' as const, label: '7d' },
  { value: '30d' as const, label: '30d' },
]

const nf = new Intl.NumberFormat('en')

export function ProductivityCard() {
  const [range, setRange] = useState<Range>('7d')
  const query = useProductivity(range)
  return (
    <PanelCard<ProductivityResponse>
      reqId="OPNL-13"
      title="Productivity"
      query={query}
      empty={{
        dataNoun: 'productivity metrics',
        when: (d) =>
          d.commits + d.pull_requests + d.lines_added + d.lines_removed === 0,
      }}
      trailing={
        <RangeToggle<Range>
          value={range}
          onChange={setRange}
          options={RANGE_OPTIONS}
          persistKey="productivity"
        />
      }
    >
      {(data) => (
        <StatList
          items={[
            {
              icon: <GitCommit size={16} />,
              label: 'Commits',
              value: nf.format(data.commits),
            },
            {
              icon: <GitPullRequest size={16} />,
              label: 'Pull Requests',
              value: nf.format(data.pull_requests),
            },
            {
              icon: <Plus size={16} />,
              label: 'Lines added',
              value: nf.format(data.lines_added),
              trend: 'up',
            },
            {
              icon: <Minus size={16} />,
              label: 'Lines removed',
              value: nf.format(data.lines_removed),
              trend: 'down',
            },
          ]}
        />
      )}
    </PanelCard>
  )
}
