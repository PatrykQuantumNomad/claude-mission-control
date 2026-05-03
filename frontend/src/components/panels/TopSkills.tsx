// TopSkills — ACTV-04 (Phase 14 Plan 03 reactivation).
//
// Reactivated panel: PanelCard wrapping useSkillUsage(range, 10) → top-N
// skills + aggregate sparkline + RangeToggle (14d / 30d, persistKey
// "top-skills-range") + drill-in <Link to="/skills/$name"> per row.
//
// Pattern mirrors CacheEfficiencyCard (LineChart + ResponsiveContainer @
// height=120) for the sparkline; SessionsTable's DataTable for the row table.
//
// IMPORTANT (Phase 14 Plan 05 dependency): the per-row <Link> targets
// /skills/$name. The route file lands in Plan 05 — until that ships,
// TanStack Router will 404 on click. Acceptable transient state per Plan 03's
// must_haves[2].

import { useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts'
import { Link } from '@tanstack/react-router'
import { DataTable, PanelCard, RangeToggle } from '../ui'
import type { DataTableColumn, RangeOption } from '../ui'
import { useSkillUsage } from '../../lib/queries'
import type { SkillRange, SkillUsageResponse, SkillUsageRow } from '../../lib/api'

const RANGE_OPTIONS: RangeOption<SkillRange>[] = [
  { value: '14d', label: '14d' },
  { value: '30d', label: '30d' },
]

// TanStack Router's typegen (`routeTree.gen.ts`) is generated from the file
// routes under `src/routes/`. The `/skills/$name` detail route lands in Plan
// 14-05; until that file exists, the typed `Link to="/skills/$name"` is
// rejected at compile time even though the runtime URL builds fine. We use a
// minimal `as never` cast on the `to` and `params` props so this file can
// ship in Wave 3 without dragging Plan 05's route file in as a coupling. Once
// Plan 05 lands and routeTree regenerates, the cast can be removed.
//
// This matches Plan 14-03 must_haves[2]: "until then, the link target produces
// a TanStack Router 404; that's acceptable for Wave 3".
const SkillLink = Link as unknown as (props: {
  to: string
  params?: Record<string, string>
  className?: string
  children?: ReactNode
}) => ReactElement

const COLUMNS: DataTableColumn<SkillUsageRow>[] = [
  {
    id: 'skill_name',
    header: 'Skill',
    sortable: true,
    sort: (a, b) => a.skill_name.localeCompare(b.skill_name),
    cell: (r) => (
      <SkillLink
        to="/skills/$name"
        params={{ name: r.skill_name }}
        className="cmc-link cmc-mono"
      >
        {r.skill_name}
      </SkillLink>
    ),
  },
  {
    id: 'total',
    header: 'Invocations',
    sortable: true,
    sort: (a, b) => a.total - b.total,
    cell: (r) => <span className="cmc-numeric">{r.total}</span>,
  },
]

/** Aggregate sparkline: collapse rows[*].sparkline into a single per-day
 * sum-of-invocations series. Mirrors CacheEfficiencyCard's single-LineChart
 * pattern — keeps the panel light by avoiding N inline charts. */
function buildAggregate(rows: SkillUsageRow[]): Array<{ day: string; invocations: number }> {
  const byDay = new Map<string, number>()
  for (const row of rows) {
    for (const point of row.sparkline ?? []) {
      byDay.set(point.day, (byDay.get(point.day) ?? 0) + point.invocations)
    }
  }
  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, invocations]) => ({ day, invocations }))
}

export function TopSkills() {
  const [range, setRange] = useState<SkillRange>('14d')
  const query = useSkillUsage(range, 10)

  return (
    <PanelCard<SkillUsageResponse>
      reqId="ACTV-04"
      title="Top Skills"
      query={query}
      empty={{
        dataNoun: 'skill activity',
        // Defensive: guard against malformed/empty server payloads (e.g. `{}`)
        // that may arrive transiently before the typed schema is honored.
        // PanelCard renders this branch only when query.data is truthy, so the
        // missing-rows case is a server/test-stub edge, not a happy path.
        when: (d) => !Array.isArray(d?.rows) || d.rows.length === 0,
      }}
      trailing={
        <RangeToggle<SkillRange>
          value={range}
          onChange={setRange}
          options={RANGE_OPTIONS}
          persistKey="top-skills-range"
          ariaLabel="Top skills range"
        />
      }
    >
      {(data) => <TopSkillsBody data={data} />}
    </PanelCard>
  )
}

function TopSkillsBody({ data }: { data: SkillUsageResponse }) {
  const aggregate = useMemo(() => buildAggregate(data.rows), [data.rows])

  return (
    <div className="cmc-top-skills">
      <figure
        className="cmc-chart-fig"
        aria-label="Aggregate skill invocations over time"
      >
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={aggregate}>
            <XAxis dataKey="day" stroke="var(--cmc-text-subtle)" fontSize={12} />
            <YAxis
              stroke="var(--cmc-text-subtle)"
              fontSize={12}
              allowDecimals={false}
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
                return [String(v), 'invocations'] as [string, string]
              }}
            />
            <Line
              type="monotone"
              dataKey="invocations"
              stroke="var(--cmc-accent-blue)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </figure>
      <DataTable<SkillUsageRow>
        rows={data.rows}
        columns={COLUMNS}
        rowKey={(r) => r.skill_name}
        ariaLabel="Top skills by invocations"
      />
    </div>
  )
}
