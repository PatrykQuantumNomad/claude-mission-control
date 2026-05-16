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
import { Badge, DataTable, DeltaPill, PanelCard, RangeToggle } from '../ui'
import type { DataTableColumn, LayoutCustomizableProps, RangeOption } from '../ui'
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

// Phase 19 SKLP-10 — render zero, one, or both badges per row.
// 'new_this_week' → info variant; 'dormant' → warning variant. Badge text
// is human-readable (e.g. "new this week"), the variant carries the
// semantic color, and the data-testid identifies the badge for e2e
// path-leakage and presence assertions.
function RowBadges({ badges }: { badges: SkillUsageRow['badges'] }) {
  if (!badges || badges.length === 0) return null
  return (
    <span style={{ display: 'inline-flex', gap: 'var(--space-2xs)', marginLeft: 'var(--space-2xs)' }}>
      {badges.includes('new_this_week') ? (
        <Badge variant="info" data-testid="top-skills-new-badge">
          new this week
        </Badge>
      ) : null}
      {badges.includes('dormant') ? (
        <Badge variant="warning" data-testid="top-skills-dormant-badge">
          dormant
        </Badge>
      ) : null}
    </span>
  )
}

const COLUMNS: DataTableColumn<SkillUsageRow>[] = [
  {
    id: 'skill_name',
    header: 'Skill',
    sortable: true,
    sort: (a, b) => a.skill_name.localeCompare(b.skill_name),
    cell: (r) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2xs)' }}>
        <SkillLink
          to="/skills/$name"
          params={{ name: r.skill_name }}
          className="cmc-link cmc-mono"
        >
          {r.skill_name}
        </SkillLink>
        {/* SKLP-10 — new/dormant badges live next to the skill name so
         * the user sees the qualifier before the count. */}
        <RowBadges badges={r.badges} />
      </span>
    ),
  },
  {
    id: 'total',
    header: 'Invocations',
    sortable: true,
    sort: (a, b) => a.total - b.total,
    cell: (r) => (
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 'var(--space-2xs)' }}>
        <span className="cmc-numeric">{r.total}</span>
        {/* SKLP-09 — usage_delta is a server-computed period-over-period
         * pill. Decimal-as-JSON-string from Pydantic v2 → Number-coerce
         * before passing the numeric primitive. */}
        <DeltaPill
          delta={Number(r.usage_delta.delta)}
          deltaPct={r.usage_delta.delta_pct}
          data-testid="top-skills-delta-pill"
        />
      </span>
    ),
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

export function TopSkills({ panelId, headerMenu }: LayoutCustomizableProps = {}) {
  const [range, setRange] = useState<SkillRange>('14d')
  const query = useSkillUsage(range, 10)

  // Phase 26 Plan 08: bounded mode adopted; URL→Range bridge is N/A here
  // because TopSkills uses SkillRange ('14d' | '30d'), a DIFFERENT closed-set
  // vocab from the rangeToVocab output ('today' | '7d' | '30d'). Mapping the
  // two without backend work would either lossy-coerce ('today' → '14d'?) or
  // create a vocab-coupling we don't want. Defer to Phase 27 when backend
  // window vocab unifies. The existing per-panel RangeToggle stays.
  return (
    <PanelCard<SkillUsageResponse>
      reqId="ACTV-04"
      title="Top Skills"
      query={query}
      bounded
      panelId={panelId}
      headerMenu={headerMenu}
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
