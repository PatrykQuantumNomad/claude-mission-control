// CostForecastCard — ANLY-06 (Phase 20 Plan 03).
//
// Locks the four user-visible branches:
//   1. projection branch (insufficient_data=false) renders the projected
//      $-figure with FULL Decimal-string precision (Pitfall 5 guard:
//      no Number-coercion of cost_usd-shape values for display).
//   2. insufficient-data branch hides the projection KpiTile and surfaces an
//      explanatory message instead. The MTD KpiTile is ALWAYS rendered
//      regardless of branch.
//   3. partial-month-bias banner appears iff `data.partial_month_bias` is
//      true. Adversarial test: days_elapsed=10 + partial_month_bias=true →
//      banner SHOWS (server-source-of-truth flag, never re-derived from
//      days_elapsed client-side; Pitfall 7 from 20-RESEARCH.md).
//   4. rates_as_of caption renders below the KpiTile when present.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '../../../test/utils'
import { CostForecastCard } from '../CostForecastCard'
import { qk } from '../../../lib/queries'
import type { CostForecastResponse } from '../../../lib/api'

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
}

function Wrap({ client, children }: { client: QueryClient; children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function makeForecast(
  overrides: Partial<CostForecastResponse> = {},
): CostForecastResponse {
  return {
    rates_as_of: '2026-05-01',
    days_elapsed: 15,
    days_in_month: 31,
    baseline_days: 14,
    month_to_date_usd: '50.0000',
    projected_month_total_usd: '125.4321',
    insufficient_data: false,
    partial_month_bias: false,
    ...overrides,
  }
}

describe('CostForecastCard (ANLY-06)', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders projection KpiTile and preserves full Decimal-string precision when insufficient_data is false', async () => {
    const client = makeClient()
    client.setQueryData(
      qk.costForecast(),
      makeForecast({ projected_month_total_usd: '125.4321' }),
    )
    render(
      <Wrap client={client}>
        <CostForecastCard />
      </Wrap>,
    )

    const projected = await screen.findByTestId('cost-forecast-card-projected')
    // Pitfall 5 guard: 4-decimal Decimal-string preserved (NOT '$125.43' from
    // a Number()-coercion).
    expect(projected.textContent).toBe('$125.4321')
    // insufficient-message is NOT in the DOM on this branch.
    expect(
      screen.queryByTestId('cost-forecast-card-insufficient-message'),
    ).toBeNull()
  })

  it('renders the explanatory message and hides the projection when insufficient_data is true', async () => {
    const client = makeClient()
    client.setQueryData(
      qk.costForecast(),
      makeForecast({
        insufficient_data: true,
        partial_month_bias: true,
        projected_month_total_usd: null,
        days_elapsed: 3,
      }),
    )
    render(
      <Wrap client={client}>
        <CostForecastCard />
      </Wrap>,
    )

    expect(
      await screen.findByTestId('cost-forecast-card-insufficient-message'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('cost-forecast-card-projected')).toBeNull()
    // MTD is ALWAYS present (so the user sees the actual month-to-date even
    // when the forecast is suppressed).
    expect(screen.getByTestId('cost-forecast-card-mtd')).toBeInTheDocument()
  })

  it('renders the bias banner iff partial_month_bias is true', async () => {
    // partial_month_bias=false → banner absent
    const clientA = makeClient()
    clientA.setQueryData(
      qk.costForecast(),
      makeForecast({ partial_month_bias: false }),
    )
    const { unmount } = render(
      <Wrap client={clientA}>
        <CostForecastCard />
      </Wrap>,
    )
    expect(screen.queryByTestId('cost-forecast-card-bias-banner')).toBeNull()
    unmount()

    // partial_month_bias=true → banner present
    const clientB = makeClient()
    clientB.setQueryData(
      qk.costForecast(),
      makeForecast({ partial_month_bias: true }),
    )
    render(
      <Wrap client={clientB}>
        <CostForecastCard />
      </Wrap>,
    )
    expect(
      await screen.findByTestId('cost-forecast-card-bias-banner'),
    ).toBeInTheDocument()
  })

  it('renders the bias banner from the partial_month_bias FLAG, not days_elapsed (Pitfall 7)', async () => {
    // Adversarial: days_elapsed >= 7 (server says forecast unlocked) BUT
    // partial_month_bias is still true (synthetic divergence — e.g., a
    // future server-side policy change). The UI MUST consume the flag, never
    // re-derive `days_elapsed < 7` client-side.
    const client = makeClient()
    client.setQueryData(
      qk.costForecast(),
      makeForecast({
        days_elapsed: 10,
        partial_month_bias: true,
        insufficient_data: false, // forecast IS shown
      }),
    )
    render(
      <Wrap client={client}>
        <CostForecastCard />
      </Wrap>,
    )

    expect(
      await screen.findByTestId('cost-forecast-card-bias-banner'),
    ).toBeInTheDocument()
    expect(
      await screen.findByTestId('cost-forecast-card-projected'),
    ).toBeInTheDocument()
  })

  it('renders the rates_as_of caption when present', async () => {
    const client = makeClient()
    client.setQueryData(
      qk.costForecast(),
      makeForecast({ rates_as_of: '2026-05-01' }),
    )
    render(
      <Wrap client={client}>
        <CostForecastCard />
      </Wrap>,
    )
    expect(await screen.findByText(/Rates as of 2026-05-01/)).toBeInTheDocument()
  })
})
