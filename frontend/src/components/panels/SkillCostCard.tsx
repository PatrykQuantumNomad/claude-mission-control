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
import { useRouterState } from '@tanstack/react-router'
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { DeltaPill, KpiTile, PanelCard, RangeToggle } from '../ui'
import { useSkillCost } from '../../lib/queries'
import type { SkillCostResponse, SkillRange } from '../../lib/api'
import {
  snapToSkillRange,
  useRouteRangeVocab,
} from '../../lib/time/useRouteRangeVocab'

// Phase 27 / SC#1 — global picker precedence helper. SkillsDetailRange is
// the URL's wider vocab ('7d'|'14d'|'30d'); the backend SkillRange is
// '14d'|'30d'. The detail route's route-local `?range=` survives '7d' for
// deep-link parity, but the data layer needs the narrower vocab — local
// helper at the panel narrows.
type SkillsDetailRange = '7d' | '14d' | '30d'
function narrowToSkillRange(r: SkillsDetailRange): SkillRange {
  return r === '7d' ? '14d' : r
}

const RANGE_OPTIONS = [
  { value: '14d' as const, label: '14d' },
  { value: '30d' as const, label: '30d' },
]

const nf = new Intl.NumberFormat('en')

export function SkillCostCard({ name }: { name: string }) {
  // Phase 27 / SC#1 — global picker WINS over route-local ?range= when both
  // time_from and time_to are present (LOCKED OPERATOR DECISION 2). Three
  // independent sources fold into a single effectiveRange:
  //   1. globalRange — useRouteRangeVocab unconditional call (rules-of-hooks
  //      safe; returns routeDefault='14d' when URL has no picker).
  //   2. routeLocalRange — Phase 25 ?range=7d|14d|30d (narrowed to backend
  //      vocab here at consumption time).
  //   3. localOverride — user clicks the internal RangeToggle (precedence
  //      below global to satisfy the operator decision; RangeToggle's
  //      onChange still works as a per-panel scope-down).
  // Selection rule: localOverride > hasGlobalPicker ? globalRange :
  //                  routeLocalRange ?? '14d'. The explicit hasGlobalPicker
  //  flag is REQUIRED because useRouteRangeVocab returns '14d' for both
  //  "missing" and "valid default match" cases — the hook's return value
  //  cannot be used as a presence proxy.
  const globalRange = useRouteRangeVocab<SkillRange>('14d', snapToSkillRange)
  const search = useRouterState({ select: (s) => s.location.search }) as Record<
    string,
    unknown
  >
  const hasGlobalPicker =
    typeof search.time_from === 'string' && typeof search.time_to === 'string'
  const routeLocalRange =
    typeof search.range === 'string'
      ? narrowToSkillRange(search.range as SkillsDetailRange)
      : '14d'
  const [localOverride, setLocalOverride] = useState<SkillRange | null>(null)
  const range = localOverride ?? (hasGlobalPicker ? globalRange : routeLocalRange)
  const setRange = (next: SkillRange) => setLocalOverride(next)
  const query = useSkillCost(name, range)

  return (
    <PanelCard<SkillCostResponse>
      bounded
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
              {/* Decimal-as-JSON-string — NEVER Number-coerce the displayed
                * dollar figure. Trailing DeltaPill (SKLP-09) shows 7d-vs-
                * prev-7d cost movement; its `delta` arrives as a Decimal-
                * string and IS Number-coerced for the inline numeric pill,
                * which is a UX summary, not a money source-of-truth. */}
              <KpiTile
                label="Total cost"
                value={
                  <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 'var(--space-2xs)' }}>
                    <span>{`$${data.cost_usd}`}</span>
                    <DeltaPill
                      delta={Number(data.cost_delta.delta)}
                      deltaPct={data.cost_delta.delta_pct}
                      format="currency"
                      data-testid="skill-cost-card-delta-pill"
                    />
                  </span>
                }
                mono
              />
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
