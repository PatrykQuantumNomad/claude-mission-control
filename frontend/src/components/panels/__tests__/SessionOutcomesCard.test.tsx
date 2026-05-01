import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '../../../test/utils'
import { SessionOutcomesCard } from '../SessionOutcomesCard'
import { qk } from '../../../lib/queries'
import type { OutcomesResponse } from '../../../lib/api'

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

const happy: OutcomesResponse = {
  range: '7d',
  items: [
    { day: '2026-04-26', errored: 1, rate_limited: 2, truncated: 0, unfinished: 1, ok: 6, total: 10 },
    { day: '2026-04-27', errored: 0, rate_limited: 0, truncated: 0, unfinished: 0, ok: 12, total: 12 },
  ],
}

describe('SessionOutcomesCard', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders reqId/title + Recharts container when data is cached', async () => {
    const client = makeClient()
    client.setQueryData(qk.outcomes('7d'), happy)
    const { container } = render(
      <Wrap client={client}>
        <SessionOutcomesCard />
      </Wrap>,
    )
    expect(screen.getByText('OPNL-07')).toBeInTheDocument()
    expect(screen.getByText('Session Outcomes')).toBeInTheDocument()
    // ResponsiveContainer gets width: 0 in happy-dom; assert on container class
    // (test-infra deviation — Rule 1 test infra).
    await waitFor(() =>
      expect(container.querySelector('.recharts-responsive-container')).not.toBeNull(),
    )
    // Sr-only fallback row for 2026-04-26 lists OK count = 6
    const fallbackTable = container.querySelector('.cmc-sr-only')
    expect(fallbackTable).not.toBeNull()
    expect(fallbackTable!.textContent).toContain('2026-04-26')
  })

  it('renders EmptyState when items is empty', () => {
    const client = makeClient()
    client.setQueryData(qk.outcomes('7d'), {
      range: '7d',
      items: [],
    } satisfies OutcomesResponse)
    render(
      <Wrap client={client}>
        <SessionOutcomesCard />
      </Wrap>,
    )
    expect(screen.getByText('Nothing to show yet')).toBeInTheDocument()
  })
})
