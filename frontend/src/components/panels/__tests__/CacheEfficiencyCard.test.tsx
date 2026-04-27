import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '../../../test/utils'
import { CacheEfficiencyCard } from '../CacheEfficiencyCard'
import { qk } from '../../../lib/queries'
import type { CacheResponse } from '../../../lib/api'

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

const happy: CacheResponse = {
  range: '7d',
  hit_rate: 0.842,
  low_sample: false,
  trend: [
    { day: '2026-04-26', hit_rate: 0.78, billable_tokens: 1000, low_sample: false },
    { day: '2026-04-27', hit_rate: 0.842, billable_tokens: 1500, low_sample: false },
  ],
}

describe('CacheEfficiencyCard', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders reqId/title + big-number hit rate (× 100, 1 decimal)', async () => {
    const client = makeClient()
    client.setQueryData(qk.cache('7d'), happy)
    const { container } = render(
      <Wrap client={client}>
        <CacheEfficiencyCard />
      </Wrap>,
    )
    expect(screen.getByText('OPNL-06')).toBeInTheDocument()
    expect(screen.getByText('Cache Efficiency')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('84.2%')).toBeInTheDocument())
    // ResponsiveContainer gets width: 0 in happy-dom; assert on container class
    // instead of svg (Wave 3 deviation — Rule 1 test infra).
    expect(container.querySelector('.recharts-responsive-container')).not.toBeNull()
  })

  it('shows Low sample badge when low_sample=true', async () => {
    const client = makeClient()
    client.setQueryData(qk.cache('7d'), { ...happy, low_sample: true } satisfies CacheResponse)
    render(
      <Wrap client={client}>
        <CacheEfficiencyCard />
      </Wrap>,
    )
    await waitFor(() => expect(screen.getByText('Low sample')).toBeInTheDocument())
  })

  it('renders EmptyState when trend is empty', () => {
    const client = makeClient()
    client.setQueryData(qk.cache('7d'), {
      range: '7d',
      hit_rate: 0,
      low_sample: false,
      trend: [],
    } satisfies CacheResponse)
    render(
      <Wrap client={client}>
        <CacheEfficiencyCard />
      </Wrap>,
    )
    expect(screen.getByText('Nothing to show yet')).toBeInTheDocument()
  })
})
