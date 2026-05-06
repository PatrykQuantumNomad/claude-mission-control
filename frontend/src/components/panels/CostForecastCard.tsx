// CostForecastCard — ANLY-06 (Phase 20 Plan 03).
//
// Renders the monthly cost forecast: projected month-total + month-to-date
// KpiTiles, plus a partial-month-bias banner and a rates_as_of caption.
// Consumes useCostForecast() (cadence 60s/45s — locked in queries.ts; never
// inlined here per project convention).
//
// CRITICAL CORRECTNESS NOTES:
//   - Decimal-as-JSON-string display: template literals only. NEVER call
//     Number(data.projected_month_total_usd) for the displayed dollar
//     figure (Pitfall 5 from 14-RESEARCH.md). The value type itself is
//     `string` (CostForecastResponse), so the type system rejects naive
//     coercion at compile time.
//   - The bias banner is wired to `data.partial_month_bias` (server-source-
//     of-truth flag), NEVER derived from `data.days_elapsed < 7` client-
//     side. Pitfall 7 from 20-RESEARCH.md — server is the single source of
//     truth for forecast-confidence policy; UI consumes the flag verbatim.
//   - The MTD KpiTile is ALWAYS rendered (even when insufficient_data is
//     true) so the user sees the actual month-to-date number even when the
//     projection is suppressed.
//
// data-testid lives on the wrapping <section> (Phase 19 SkillProjectsTable
// lesson — section-level testid survives all PanelCard branches: loading,
// error, empty, data).

import { KpiTile, PanelCard } from '../ui'
import { useCostForecast } from '../../lib/queries'
import type { CostForecastResponse } from '../../lib/api'

export function CostForecastCard() {
  const query = useCostForecast()

  return (
    <section
      className="cmc-cost-forecast"
      data-testid="cost-forecast-card"
    >
      <PanelCard<CostForecastResponse>
        reqId="ANLY-06"
        title="Cost Forecast"
        query={query}
        empty={{
          // The forecast endpoint always returns a body — empty branch only
          // fires if `data` is nullish (network-stub path). The actual
          // "not enough data" UX is handled inside the data renderer via the
          // insufficient_data flag.
          when: () => false,
          dataNoun: 'cost forecast',
        }}
      >
        {(data) => (
          <div className="cmc-cost-forecast__body">
            {data.partial_month_bias ? (
              <div
                className="cmc-cost-forecast__bias-banner"
                data-testid="cost-forecast-card-bias-banner"
                role="note"
              >
                Forecast is volatile during the first week of the month — the
                projection will stabilize after day 7.
              </div>
            ) : null}
            <div className="cmc-cost-forecast__kpis">
              {data.insufficient_data ? (
                <div
                  className="cmc-cost-forecast__insufficient"
                  data-testid="cost-forecast-card-insufficient-message"
                >
                  Not enough data yet — wait until day 8 of the month for a
                  forecast. ({data.days_elapsed} of {data.days_in_month} days
                  elapsed.)
                </div>
              ) : (
                <KpiTile
                  label="Projected month total"
                  value={
                    <span data-testid="cost-forecast-card-projected">
                      {`$${data.projected_month_total_usd}`}
                    </span>
                  }
                  mono
                />
              )}
              <KpiTile
                label="Month to date"
                value={
                  <span data-testid="cost-forecast-card-mtd">
                    {`$${data.month_to_date_usd}`}
                  </span>
                }
                mono
              />
            </div>
            {data.rates_as_of ? (
              <p className="cmc-caption">Rates as of {data.rates_as_of}</p>
            ) : null}
          </div>
        )}
      </PanelCard>
    </section>
  )
}
