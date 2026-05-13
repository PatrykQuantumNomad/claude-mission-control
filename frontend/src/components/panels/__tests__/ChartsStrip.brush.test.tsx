// ChartsStrip brush integration — Phase 26 Plan 05 (TIME-05) tests.
//
// Test strategy:
//   - vi.mock('@tanstack/react-router') so useNavigate + useRouterState
//     are intercepted (mirrors the ChartBrushController.test.tsx strategy).
//   - QueryClient pre-seeded with a fixed 30-day token payload so
//     ChartsStrip renders the recharts BarChart synchronously.
//   - jsdom collapses ResponsiveContainer to 0×0 (no layout engine), so
//     the inner recharts <BarChart> SVG is never actually mounted — the
//     `recharts-responsive-container` wrapper is the only DOM artifact
//     reliably available. This matches the existing
//     `ChartsStrip.test.tsx` precedent (it asserts the same wrapper).
//   - Direct onDragEnd dispatch + URL-write semantics are exhaustively
//     covered by ChartBrushController.test.tsx (the actual logic is in
//     the hook, not the component). These specs assert WIRING:
//     ResetZoomButton's visibility branches AND the chrome row's
//     always-mounted, layout-stable presence.
//
// Covered specs (≥4):
//   1. ChartsStrip renders with Brush wired (no React error; chart wrapper present; chrome row mounted)
//   2. <div data-testid="charts-strip-brush-chrome"> is always rendered (reserved height — no layout reflow when ResetZoomButton toggles)
//   3. ResetZoomButton is HIDDEN when URL has no time_from
//   4. ResetZoomButton is VISIBLE when URL has absolute ISO time_from
//   5. ResetZoomButton is HIDDEN when URL time_from is a Grafana relative token

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '../../../test/utils'

// Hoisted mock state shared with vi.mock factory.
const routerMockState = vi.hoisted(() => {
  return {
    navigate: vi.fn(),
    pathname: '/activity',
    search: {} as Record<string, unknown>,
  }
})

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => routerMockState.navigate,
  useRouterState: ({ select }: { select: (s: { location: { pathname: string; search: Record<string, unknown> } }) => unknown }) =>
    select({
      location: {
        pathname: routerMockState.pathname,
        search: routerMockState.search,
      },
    }),
}))

// Imports AFTER vi.mock.
import { ChartsStrip } from '../ChartsStrip'
import { qk } from '../../../lib/queries'
import type { TokenUsageDailyRow, TokenUsageResponse } from '../../../lib/api'

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, refetchOnWindowFocus: false },
    },
  })
}

function Wrap({ client, children }: { client: QueryClient; children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function makeRow(day: string, model = 'sonnet', source = 'claude_code'): TokenUsageDailyRow {
  return {
    day,
    model,
    source,
    tokens_input: 100,
    tokens_output: 200,
    tokens_cache_read: 50,
    tokens_cache_create: 25,
    sessions_count: 1,
  }
}

function seedCharts(client: QueryClient): TokenUsageResponse {
  // 30 distinct days so sliceLast14Days returns a 14-row dataset for Brush.
  const items: TokenUsageDailyRow[] = Array.from({ length: 30 }, (_, i) =>
    makeRow(`2026-03-${String(i + 1).padStart(2, '0')}`),
  )
  const payload = { range: '30d', items } satisfies TokenUsageResponse
  client.setQueryData(qk.tokens('30d'), payload)
  return payload
}

beforeEach(() => {
  routerMockState.navigate.mockReset()
  routerMockState.pathname = '/activity'
  routerMockState.search = {}
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
  )
})

describe('ChartsStrip brush integration (TIME-05)', () => {
  it('renders with Brush wired (no React error; chart wrapper + chrome row both mounted)', async () => {
    const client = makeClient()
    seedCharts(client)
    const { container } = render(
      <Wrap client={client}>
        <ChartsStrip />
      </Wrap>,
    )
    // The fact that ChartsStrip renders at all proves the Brush import + the
    // useChartBrush hook call inside ChartsStripBody compiled and executed
    // without throwing. jsdom collapses ResponsiveContainer to 0×0 so the
    // inner BarChart SVG (including .recharts-brush) is not emitted — this
    // is a known jsdom limitation that the existing ChartsStrip.test.tsx
    // also works around by asserting only on the wrapper.
    await waitFor(() =>
      expect(container.querySelector('.recharts-responsive-container')).not.toBeNull(),
    )
    expect(container.querySelector('[data-testid="charts-strip-brush-chrome"]')).not.toBeNull()
    // Hook integration guard: useChartBrush must have rendered without
    // throwing — verified by the chrome row's presence (component returned
    // its tree). If useChartBrush had broken (e.g. missing router context),
    // the render-prop would have thrown before reaching the chrome row.
  })

  it('always renders the charts-strip-brush-chrome row (reserved height — no layout reflow)', async () => {
    const client = makeClient()
    seedCharts(client)
    render(
      <Wrap client={client}>
        <ChartsStrip />
      </Wrap>,
    )
    const chrome = await screen.findByTestId('charts-strip-brush-chrome')
    expect(chrome).toBeInTheDocument()
    // Empty (no zoom) — chrome row exists but ResetZoomButton renders null.
    expect(within(chrome).queryByTestId('reset-zoom-button')).toBeNull()
  })

  it('ResetZoomButton is HIDDEN when URL has no time_from', async () => {
    routerMockState.search = {}
    const client = makeClient()
    seedCharts(client)
    render(
      <Wrap client={client}>
        <ChartsStrip />
      </Wrap>,
    )
    await screen.findByTestId('charts-strip-brush-chrome')
    expect(screen.queryByTestId('reset-zoom-button')).toBeNull()
  })

  it('ResetZoomButton is VISIBLE when URL has absolute ISO time_from', async () => {
    routerMockState.search = {
      time_from: '2026-03-17T00:00:00.000Z',
      time_to: '2026-03-30T23:59:59.999Z',
    }
    const client = makeClient()
    seedCharts(client)
    render(
      <Wrap client={client}>
        <ChartsStrip />
      </Wrap>,
    )
    const btn = await screen.findByTestId('reset-zoom-button')
    expect(btn).toBeInTheDocument()
  })

  it('ResetZoomButton is HIDDEN when URL time_from is a Grafana relative token', async () => {
    routerMockState.search = { time_from: 'now-7d', time_to: 'now' }
    const client = makeClient()
    seedCharts(client)
    render(
      <Wrap client={client}>
        <ChartsStrip />
      </Wrap>,
    )
    await screen.findByTestId('charts-strip-brush-chrome')
    expect(screen.queryByTestId('reset-zoom-button')).toBeNull()
  })
})
