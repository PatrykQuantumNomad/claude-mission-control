// SkillCostCard — SKLP-02 (reactivated, Phase 14 Plan 04).
//
// Per-skill cost panel. Consumes useSkillCost(name, range), renders
// total $ + 3 token KpiTiles (input / output / cache-aggregate) +
// a 14-day cost-trend sparkline + the "Rates as of YYYY-MM-DD" caption +
// the cost_attribution caption (request | session — D-02 dual-path branch).
//
// CRITICAL CORRECTNESS NOTES:
//   - cost_usd is a STRING (Decimal-as-JSON-string per Pydantic v2 default;
//     T-14-04-01 / Plan 02 D-02 / Pitfall 5). Display as `${'$'}${data.cost_usd}`
//     — NEVER call Number(data.cost_usd) for the displayed dollar figure.
//     Recharts coerces the trend sparkline's cost_usd to a number internally;
//     that's acceptable because the chart axis is approximate, not a money
//     source-of-truth.
//   - cost_attribution surfaces the backend's dual-path JOIN result so the
//     operator sees whether per-request attribution succeeded ('request') or
//     fell back to session-scoped ('session'). Visible debug for D-02.
//
// Reused on /skills/$name (Plan 05). On the Skills page itself the wrapper
// component SkillCostCardForTopSkill in routes/skills.tsx picks the top-1
// skill via useSkillUsage('14d', 1) and forwards its name (D-07).

import { useState } from 'react'
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { KpiTile, PanelCard, RangeToggle } from '../ui'
import { useSkillCost } from '../../lib/queries'
import type { SkillCostResponse, SkillRange } from '../../lib/api'

const RANGE_OPTIONS = [
  { value: '14d' as const, label: '14d' },
  { value: '30d' as const, label: '30d' },
]

const nf = new Intl.NumberFormat('en')

export function SkillCostCard({ name }: { name: string }) {
  const [range, setRange] = useState<SkillRange>('14d')
  const query = useSkillCost(name, range)

  return (
    <PanelCard<SkillCostResponse>
      reqId="SKLP-02"
      title={`Skill Cost — ${name}`}
      query={query}
      empty={{ dataNoun: 'skill cost data', when: (d) => !d.trend || d.trend.length === 0 }}
      trailing={
        <RangeToggle<SkillRange>
          value={range}
          onChange={setRange}
          options={RANGE_OPTIONS}
          persistKey={`skill-cost-${name}`}
        />
      }
    >
      {(data) => {
        const cacheTotal =
          data.tokens_cache_read +
          data.tokens_cache_create_5m +
          data.tokens_cache_create_1h
        return (
          <div className="cmc-skill-cost">
            <div className="cmc-skill-cost__top">
              {/* Decimal-as-JSON-string — NEVER Number-coerce. */}
              <KpiTile label="Total cost" value={`$${data.cost_usd}`} mono />
              <KpiTile label="Input" value={nf.format(data.tokens_input)} mono />
              <KpiTile label="Output" value={nf.format(data.tokens_output)} mono />
              <KpiTile label="Cache" value={nf.format(cacheTotal)} mono />
            </div>
            <figure className="cmc-chart-fig" aria-label="Skill cost trend">
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={data.trend}>
                  <XAxis dataKey="day" stroke="var(--cmc-text-subtle)" fontSize={12} />
                  <YAxis stroke="var(--cmc-text-subtle)" fontSize={12} />
                  <RechartsTooltip
                    contentStyle={{
                      background: 'var(--cmc-surface-3)',
                      border: '1px solid var(--cmc-border)',
                      borderRadius: 8,
                      color: 'var(--cmc-text)',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="cost_usd"
                    stroke="var(--cmc-accent-blue)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </figure>
            {data.rates_as_of ? (
              <p className="cmc-caption">Rates as of {data.rates_as_of}</p>
            ) : null}
            <p className="cmc-caption">Attribution: {data.cost_attribution}</p>
          </div>
        )
      }}
    </PanelCard>
  )
}
