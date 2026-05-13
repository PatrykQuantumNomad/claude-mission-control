import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '../../../test/utils'

// Phase 26 Plan 08 (TIME-02) — TokenUsageCard now consumes useRouteRange,
// which calls useRouterState. Mock router to feed time tokens that resolve to
// '7d' via rangeToVocab() so existing `qk.tokens('7d')` seeds still match.
// Also stubs useNavigate for the CompareToggle (Plan 07) mounted in the chrome.
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useRouterState: ({ select }: { select: (s: { location: { pathname: string; search: Record<string, unknown> } }) => unknown }) =>
    select({ location: { pathname: '/', search: { time_from: 'now-7d', time_to: 'now' } } }),
}))

import { TokenUsageCard } from '../TokenUsageCard'
import { groupTokensByDay } from '../TokenUsageCard.utils'
import { qk } from '../../../lib/queries'
import type { TokenUsageResponse } from '../../../lib/api'

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

const happy: TokenUsageResponse = {
  range: '7d',
  items: [
    {
      day: '2026-04-26',
      model: 'sonnet',
      source: 'claude_code',
      tokens_input: 100,
      tokens_output: 200,
      tokens_cache_read: 50,
      tokens_cache_create: 25,
      sessions_count: 1,
    },
    {
      day: '2026-04-26',
      model: 'haiku',
      source: 'claude_code',
      tokens_input: 10,
      tokens_output: 20,
      tokens_cache_read: 5,
      tokens_cache_create: 5,
      sessions_count: 1,
    },
    {
      day: '2026-04-27',
      model: 'sonnet',
      source: 'claude_code',
      tokens_input: 1000,
      tokens_output: 2000,
      tokens_cache_read: 500,
      tokens_cache_create: 250,
      sessions_count: 2,
    },
  ],
}

describe('TokenUsageCard', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders reqId/title and a Recharts container when data is cached', async () => {
    const client = makeClient()
    client.setQueryData(qk.tokens('7d'), happy)
    const { container } = render(
      <Wrap client={client}>
        <TokenUsageCard />
      </Wrap>,
    )
    expect(screen.getByText('OPNL-05')).toBeInTheDocument()
    expect(screen.getByText('Token Usage')).toBeInTheDocument()
    // ResponsiveContainer gets width: 0 in happy-dom (no real layout) so no
    // inner SVG renders. Assert on the container class + sr-only fallback
    // table so we know data flowed through. (test-infra deviation Rule 1.)
    await waitFor(() =>
      expect(container.querySelector('.recharts-responsive-container')).not.toBeNull(),
    )
    expect(container.querySelector('.cmc-sr-only')).not.toBeNull()
    // Fallback row contents prove groupTokensByDay aggregated correctly
    expect(container.querySelector('.cmc-sr-only')!.textContent).toContain('110')
  })

  it('renders EmptyState when items is empty', () => {
    const client = makeClient()
    client.setQueryData(qk.tokens('7d'), { range: '7d', items: [] } satisfies TokenUsageResponse)
    render(
      <Wrap client={client}>
        <TokenUsageCard />
      </Wrap>,
    )
    expect(screen.getByText('Nothing to show yet')).toBeInTheDocument()
  })

  it('groupTokensByDay collapses (model, source) into per-day token-type buckets', () => {
    const grouped = groupTokensByDay(happy.items)
    expect(grouped).toHaveLength(2)
    const day0 = grouped.find((d) => d.day === '2026-04-26')!
    expect(day0.input).toBe(110) // 100 + 10
    expect(day0.output).toBe(220) // 200 + 20
    expect(day0.cache_read).toBe(55) // 50 + 5
    expect(day0.cache_create).toBe(30) // 25 + 5
    const day1 = grouped.find((d) => d.day === '2026-04-27')!
    expect(day1.input).toBe(1000)
  })
})
