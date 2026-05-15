// CostByProjectCard compare-overlay — Phase 27 Plan 05 Task 2 (TIME-04 on /cost).
//
// Strategy mirrors TokenUsageCard.compareOverlay.test.tsx:
//   - In-memory router so the CompareToggle's useRouterState + useNavigate
//     resolve through real TanStack Router internals. Different URL fixtures
//     per test drive the compare_panels round-trip without happy-dom mocks.
//   - QueryClient with retry/refetch disabled; we setQueryData on the cost
//     breakdown slot so the panel's data branch renders deterministically.
//
// ACCEPTED EXCEPTION — this panel uses escape path (i) from the plan:
// `useCostBreakdown` returns rolled-up per-project totals (CostBreakdownRow
// has no time bucketing — only `key` + `tokens_*` + `cost_usd`), so client-
// side prior-period slicing is not possible. The CompareToggle ships for
// URL-round-trip parity with TokenUsageCard (Phase 26 Plan 07), but the
// prior-period DeltaPill column is NOT rendered. This file asserts on:
//   1. CompareToggle renders inside the panel chrome (testid present)
//   2. aria-pressed reflects compare_panels CSV state (read-side contract)
//   3. clicking the toggle writes ?compare_panels=cost-by-project to URL
//      (write-side contract — full round-trip)
//   4. initial-load round-trip: ?compare_panels=cost-by-project shows the
//      toggle as pressed (deep-link / saved-view-fork resume contract)
//   5. unrelated compare_panels value (different panel id) leaves the
//      cost-by-project toggle inactive (independence invariant — multiple
//      panels share the CSV but each reads its own membership)
//
// When/if the backend exposes bucketed cost-by-project data, this file
// should be extended with a DeltaPill column rendering test (compareActive
// && hasPriorData → DOM has `cmc-delta-pill` instances per row). The
// current expectation is that the data-shape limitation surfaces in the
// SUMMARY.md Accepted Exception block.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { render, screen, waitFor, userEvent } from '../../../test/utils'
import { CostByProjectCard } from '../CostByProjectCard'
import { qk } from '../../../lib/queries'
import {
  asComparePanels,
  asTimeToken,
} from '../../../lib/searchSchemas'
import type {
  CostBreakdownResponse,
  CostBreakdownRow,
  CostRange,
} from '../../../lib/api'

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchInterval: false,
        refetchOnWindowFocus: false,
      },
    },
  })
}

function makeRow(overrides: Partial<CostBreakdownRow> = {}): CostBreakdownRow {
  return {
    key: 'abcdef012345',
    tokens_input: 100,
    tokens_output: 50,
    tokens_cache_read: 0,
    tokens_cache_create_5m: 0,
    tokens_cache_create_1h: 0,
    cost_usd: '0.0123',
    ...overrides,
  }
}

function makeBreakdown(
  rows: CostBreakdownRow[],
  range: CostRange = '7d',
): CostBreakdownResponse {
  const total = rows
    .reduce((acc, r) => acc + Number.parseFloat(r.cost_usd), 0)
    .toFixed(4)
  return {
    range,
    dim: 'project',
    rates_as_of: '2026-05-01',
    total_usd: total,
    rows,
  }
}

function makeRouter(
  children: ReactNode,
  initialSearch: Record<string, unknown> = {},
) {
  const rootRoute = createRootRoute({ component: () => children as never })
  const costRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/cost',
    component: () => children as never,
    // Mirror routes/cost.tsx validateSearch shape so the round-trip through
    // useRouterState resolves the same fields that production reads.
    validateSearch: (raw: Record<string, unknown>) => ({
      time_from: asTimeToken(raw.time_from),
      time_to: asTimeToken(raw.time_to),
      compare_panels: asComparePanels(raw.compare_panels),
    }),
  })
  const qs = Object.entries(initialSearch)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
  const entry = qs ? `/cost?${qs}` : '/cost'
  return createRouter({
    routeTree: rootRoute.addChildren([costRoute]),
    history: createMemoryHistory({ initialEntries: [entry] }),
  })
}

function Wrap({
  client,
  children,
  initialSearch,
}: {
  client: QueryClient
  children: ReactNode
  initialSearch?: Record<string, unknown>
}) {
  const router = makeRouter(children, initialSearch)
  return (
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

describe('CostByProjectCard CompareToggle (Phase 27 Plan 05 / TIME-04)', () => {
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

  it('SC#2: mounts CompareToggle in panel chrome with panelId=cost-by-project', async () => {
    const client = makeClient()
    client.setQueryData(
      qk.costBreakdown('project', '7d'),
      makeBreakdown([makeRow({ key: 'aaaaaaaaaaaa', cost_usd: '0.5' })]),
    )
    render(
      <Wrap client={client}>
        <CostByProjectCard />
      </Wrap>,
    )
    const toggle = await screen.findByTestId(
      'compare-overlay-toggle-cost-by-project',
    )
    expect(toggle).toBeTruthy()
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
  })

  it('SC#2: toggle off when URL has no compare_panels (default state)', async () => {
    const client = makeClient()
    client.setQueryData(
      qk.costBreakdown('project', '7d'),
      makeBreakdown([makeRow({ key: 'bbbbbbbbbbbb' })]),
    )
    render(
      <Wrap client={client}>
        <CostByProjectCard />
      </Wrap>,
    )
    const toggle = await screen.findByTestId(
      'compare-overlay-toggle-cost-by-project',
    )
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
  })

  it('SC#2: clicking toggle writes ?compare_panels=cost-by-project to URL (write round-trip)', async () => {
    const client = makeClient()
    client.setQueryData(
      qk.costBreakdown('project', '7d'),
      makeBreakdown([makeRow({ key: 'cccccccccccc' })]),
    )
    const { container } = render(
      <Wrap client={client}>
        <CostByProjectCard />
      </Wrap>,
    )
    const toggle = await screen.findByTestId(
      'compare-overlay-toggle-cost-by-project',
    )
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    const user = userEvent.setup()
    await user.click(toggle)
    // After the click the toggle's aria-pressed flips true — confirming the
    // navigate({ search }) updated the in-memory router state and the toggle
    // re-read it via useRouterState. (Asserting the URL string itself would
    // require fishing the router instance out of context, but aria-pressed
    // is the user-visible contract.)
    await waitFor(() =>
      expect(toggle.getAttribute('aria-pressed')).toBe('true'),
    )
    // Sanity: panel data still renders alongside the toggle (no exception
    // from the click handler disrupting React's render tree).
    expect(container.textContent ?? '').toContain('cccccccccccc')
  })

  it('SC#2: initial ?compare_panels=cost-by-project shows toggle as pressed (read round-trip)', async () => {
    const client = makeClient()
    client.setQueryData(
      qk.costBreakdown('project', '7d'),
      makeBreakdown([makeRow({ key: 'dddddddddddd' })]),
    )
    render(
      <Wrap
        client={client}
        initialSearch={{ compare_panels: 'cost-by-project' }}
      >
        <CostByProjectCard />
      </Wrap>,
    )
    const toggle = await screen.findByTestId(
      'compare-overlay-toggle-cost-by-project',
    )
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
  })

  it('SC#2: different panel id in compare_panels leaves cost-by-project inactive (independence invariant)', async () => {
    const client = makeClient()
    client.setQueryData(
      qk.costBreakdown('project', '7d'),
      makeBreakdown([makeRow({ key: 'eeeeeeeeeeee' })]),
    )
    render(
      <Wrap
        client={client}
        initialSearch={{ compare_panels: 'token-usage' }}
      >
        <CostByProjectCard />
      </Wrap>,
    )
    const toggle = await screen.findByTestId(
      'compare-overlay-toggle-cost-by-project',
    )
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
  })

  it('SC#2 (Accepted Exception escape path (i)): no prior-period DeltaPill column renders — data shape lacks bucketing', async () => {
    // The plan's Pitfall 8 LOCK + escape path (i): CostBreakdownRow is
    // rolled-up totals per project (no `day` axis), so client-side
    // prior-period slicing is impossible. The CompareToggle ships for
    // URL-round-trip parity with TokenUsageCard, but the prior-period
    // column is NOT rendered. This test pins the current behavior so a
    // future patch that adds a DeltaPill column without also wiring real
    // prior-period data flags as a regression.
    const client = makeClient()
    client.setQueryData(
      qk.costBreakdown('project', '7d'),
      makeBreakdown([makeRow({ key: 'ffffffffffff' })]),
    )
    const { container } = render(
      <Wrap
        client={client}
        initialSearch={{ compare_panels: 'cost-by-project' }}
      >
        <CostByProjectCard />
      </Wrap>,
    )
    await screen.findByTestId('compare-overlay-toggle-cost-by-project')
    // No DeltaPill components rendered (would have class `cmc-delta-pill`).
    expect(container.querySelectorAll('.cmc-delta-pill').length).toBe(0)
    // No "vs prior period" column header.
    expect(screen.queryByText(/vs prior period/i)).toBeNull()
  })
})
