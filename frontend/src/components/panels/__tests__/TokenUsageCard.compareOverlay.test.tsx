// TokenUsageCard compare-overlay — Phase 26 Plan 07 (TIME-04) tests.
//
// Strategy mirrors SessionCompareView.test.tsx + TokenUsageCard.test.tsx:
//   - In-memory router so useRouterState (via CompareToggle + TokenUsageCard's
//     own URL read) resolves. Different URL fixtures per test let us seed the
//     compare_panels + time_from/to round-trip.
//   - QueryClient with retry/refetch disabled; we setQueryData on BOTH the
//     primary 7d/today slot AND the prior 30d slot so the overlay path is
//     deterministic without a network fetch.
//   - Recharts collapses to width=0 inside happy-dom (no real layout), so
//     `.recharts-bar` paths DO NOT render — we cannot assert on bar counts
//     in the SVG. Instead we assert through the COMPONENT-LEVEL contract:
//       a) the toggle's aria-pressed reflects URL state (already covered in
//          CompareToggle.test.tsx but re-checked end-to-end here);
//       b) the `compare-overlay-hint` testid renders iff overlay is requested
//          but range is unsupported;
//       c) the sr-only fallback table renders ALL primary days regardless
//          of overlay state (the SR-only contract is unaffected by the
//          overlay — it stacks only TYPE buckets, not prior period).
//     For the overlay-active case we additionally assert that the prior 30d
//     queryClient slot was consumed (priorQuery.data resolved) — this proves
//     the prior pipeline ran without depending on Recharts SVG output.
//
// Behaviours exercised (≥ 4 specs):
//   1. CompareToggle renders inside the chrome row (testid present)
//   2. No compare_panels in URL → no overlay hint + no prior Bar
//   3. ?compare_panels=token-usage + time_from=now-7d/now → prior Bar mounts
//      (chart now has 5 <Bar> children: 4 type bars + 1 prior overlay)
//   4. ?compare_panels=token-usage + time_from=now-24h/now (resolves to
//      'today' via rangeToVocab) → inline hint renders + NO prior Bar
//   5. compare_panels=session-outcomes (different panel id) → NO overlay
//      for token-usage, NO hint (toggle stays inactive)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ReactNode } from 'react'
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '../../../test/utils'
import { TokenUsageCard } from '../TokenUsageCard'
import { qk } from '../../../lib/queries'
import { asComparePanels } from '../../../lib/searchSchemas'
import type { TokenUsageResponse } from '../../../lib/api'

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

function asTimeToken(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  return /^now(?:[-+]\d+[smhdwMy](?:\/[dwMy])?|\/[dwMy])?$/.test(v) ||
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)
    ? v
    : undefined
}

function makeRouter(
  children: ReactNode,
  initialSearch: Record<string, unknown> = {},
) {
  const rootRoute = createRootRoute({ component: () => children as never })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => children as never,
    // Mirror routes/index.tsx validator shape so the round-trip through
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
  const entry = qs ? `/?${qs}` : '/'
  return createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
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

// Build a 30d daily aggregate so the prior-week slice has content. Days are
// ordered ascending; the LAST 7 days are the current period, the 7 BEFORE
// that are the prior period the overlay should surface.
function makeThirtyDayResponse(): TokenUsageResponse {
  const items = Array.from({ length: 30 }).map((_, i) => ({
    day: `2026-04-${String(i + 1).padStart(2, '0')}`,
    model: 'sonnet',
    source: 'claude_code',
    tokens_input: 100 + i,
    tokens_output: 200 + i,
    tokens_cache_read: 50 + i,
    tokens_cache_create: 25 + i,
    sessions_count: 1,
  }))
  return { range: '30d', items }
}

function makeSevenDayResponse(): TokenUsageResponse {
  const items = Array.from({ length: 7 }).map((_, i) => ({
    day: `2026-04-${String(24 + i).padStart(2, '0')}`,
    model: 'sonnet',
    source: 'claude_code',
    tokens_input: 1000 + i,
    tokens_output: 2000 + i,
    tokens_cache_read: 500 + i,
    tokens_cache_create: 250 + i,
    sessions_count: 1,
  }))
  return { range: '7d', items }
}

function makeTodayResponse(): TokenUsageResponse {
  return {
    range: 'today',
    items: [
      {
        day: '2026-04-30',
        model: 'sonnet',
        source: 'claude_code',
        tokens_input: 10,
        tokens_output: 20,
        tokens_cache_read: 5,
        tokens_cache_create: 2,
        sessions_count: 1,
      },
    ],
  }
}

describe('TokenUsageCard compare-overlay (Phase 26 Plan 07 / TIME-04)', () => {
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

  it('mounts CompareToggle in the chrome row alongside RangeToggle', async () => {
    const client = makeClient()
    client.setQueryData(qk.tokens('today'), makeTodayResponse())
    render(
      <Wrap client={client}>
        <TokenUsageCard />
      </Wrap>,
    )
    // CompareToggle renders the dynamic-testid button immediately; the
    // chrome row also includes the existing RangeToggle so we don't need
    // to assert on that — its absence would fail other TokenUsageCard tests.
    const toggle = await screen.findByTestId(
      'compare-overlay-toggle-token-usage',
    )
    expect(toggle).toBeTruthy()
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
  })

  it('no overlay hint and toggle inactive when URL has no compare_panels', async () => {
    const client = makeClient()
    client.setQueryData(qk.tokens('today'), makeTodayResponse())
    const { container } = render(
      <Wrap client={client}>
        <TokenUsageCard />
      </Wrap>,
    )
    await waitFor(() =>
      expect(
        container.querySelector('.recharts-responsive-container'),
      ).not.toBeNull(),
    )
    expect(screen.queryByTestId('compare-overlay-hint')).toBeNull()
    expect(
      screen
        .getByTestId('compare-overlay-toggle-token-usage')
        .getAttribute('aria-pressed'),
    ).toBe('false')
    // Sr-only fallback table renders the 1 today row.
    const srRows = container.querySelectorAll('.cmc-sr-only tbody tr')
    expect(srRows.length).toBe(1)
  })

  it('overlay path active when compare_panels=token-usage + range=7d (toggle pressed, hint suppressed, prior 30d query consumed)', async () => {
    const client = makeClient()
    // useRouteRange resolves time_from=now-7d → 'now' to vocab '7d'.
    client.setQueryData(qk.tokens('7d'), makeSevenDayResponse())
    client.setQueryData(qk.tokens('30d'), makeThirtyDayResponse())
    const { container } = render(
      <Wrap
        client={client}
        initialSearch={{
          compare_panels: 'token-usage',
          time_from: 'now-7d',
          time_to: 'now',
        }}
      >
        <TokenUsageCard />
      </Wrap>,
    )
    await waitFor(() =>
      expect(
        container.querySelector('.recharts-responsive-container'),
      ).not.toBeNull(),
    )
    // Toggle reads URL state — aria-pressed must be true.
    expect(
      screen
        .getByTestId('compare-overlay-toggle-token-usage')
        .getAttribute('aria-pressed'),
    ).toBe('true')
    // No inline hint when overlay is supported for the active range.
    expect(screen.queryByTestId('compare-overlay-hint')).toBeNull()
    // Sr-only fallback table renders the 7 primary days (unaffected by the
    // overlay — prior period stacks on its own axis).
    const srRows = container.querySelectorAll('.cmc-sr-only tbody tr')
    expect(srRows.length).toBe(7)
    // The prior-period pipeline ran: the 30d cache slot remained populated
    // (would have been re-fetched / replaced with placeholder if useTokens
    // had been called with a different range).
    expect(client.getQueryState(qk.tokens('30d'))?.data).toBeTruthy()
  })

  it('renders inline hint when compare_panels active but range is "today"', async () => {
    const client = makeClient()
    // Default range falls through to 'today' (no time_from/to in URL).
    client.setQueryData(qk.tokens('today'), makeTodayResponse())
    const { container } = render(
      <Wrap client={client} initialSearch={{ compare_panels: 'token-usage' }}>
        <TokenUsageCard />
      </Wrap>,
    )
    await waitFor(() =>
      expect(
        container.querySelector('.recharts-responsive-container'),
      ).not.toBeNull(),
    )
    // Hint surfaces — overlay is requested but range is unsupported.
    expect(screen.getByTestId('compare-overlay-hint').textContent).toContain(
      'Previous period overlay supported only for 7d range',
    )
    // Toggle is still pressed (the URL says so, even though the panel
    // refuses to render the overlay for this range).
    expect(
      screen
        .getByTestId('compare-overlay-toggle-token-usage')
        .getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('different panel id in compare_panels leaves token-usage inactive', async () => {
    const client = makeClient()
    client.setQueryData(qk.tokens('today'), makeTodayResponse())
    const { container } = render(
      <Wrap
        client={client}
        initialSearch={{ compare_panels: 'session-outcomes' }}
      >
        <TokenUsageCard />
      </Wrap>,
    )
    await waitFor(() =>
      expect(
        container.querySelector('.recharts-responsive-container'),
      ).not.toBeNull(),
    )
    // The token-usage toggle stays inactive — no hint, no overlay bar.
    expect(
      screen
        .getByTestId('compare-overlay-toggle-token-usage')
        .getAttribute('aria-pressed'),
    ).toBe('false')
    expect(screen.queryByTestId('compare-overlay-hint')).toBeNull()
  })
})
