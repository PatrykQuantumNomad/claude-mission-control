import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '../../../test/utils'
import { ChartsStrip } from '../ChartsStrip'
import { sliceLast14Days } from '../ChartsStrip.utils'
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

describe('ChartsStrip', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders reqId/title and the chart container when data is cached', async () => {
    const client = makeClient()
    // 30 distinct days
    const items: TokenUsageDailyRow[] = Array.from({ length: 30 }, (_, i) =>
      makeRow(`2026-03-${String(i + 1).padStart(2, '0')}`),
    )
    client.setQueryData(qk.tokens('30d'), { range: '30d', items } satisfies TokenUsageResponse)
    const { container } = render(
      <Wrap client={client}>
        <ChartsStrip />
      </Wrap>,
    )
    expect(screen.getByText('ACTV-02')).toBeInTheDocument()
    expect(screen.getByText('14-Day Token Trend')).toBeInTheDocument()
    await waitFor(() =>
      expect(container.querySelector('.recharts-responsive-container')).not.toBeNull(),
    )
    // sr-only fallback table proves the slice happened — should have 14 rows
    const rows = container.querySelectorAll('.cmc-sr-only tbody tr')
    expect(rows.length).toBe(14)
  })

  it('renders EmptyState when items is empty', () => {
    const client = makeClient()
    client.setQueryData(qk.tokens('30d'), { range: '30d', items: [] } satisfies TokenUsageResponse)
    const { container } = render(
      <Wrap client={client}>
        <ChartsStrip />
      </Wrap>,
    )
    expect(screen.getByText('Nothing to show yet')).toBeInTheDocument()
    expect(container.querySelector('.recharts-responsive-container')).toBeNull()
  })

  it('sliceLast14Days returns the last 14 distinct days from a 30-day payload', () => {
    const items: TokenUsageDailyRow[] = Array.from({ length: 30 }, (_, i) =>
      makeRow(`2026-03-${String(i + 1).padStart(2, '0')}`),
    )
    const sliced = sliceLast14Days(items)
    expect(sliced).toHaveLength(14)
    // First sliced day should be the 17th of March (30 - 14 + 1 = 17)
    expect(sliced[0].day).toBe('2026-03-17')
    expect(sliced[13].day).toBe('2026-03-30')
  })

  it('sliceLast14Days returns all rows when fewer than 14 distinct days are present', () => {
    const items: TokenUsageDailyRow[] = [
      makeRow('2026-03-01'),
      makeRow('2026-03-02'),
      makeRow('2026-03-03'),
    ]
    const sliced = sliceLast14Days(items)
    expect(sliced).toHaveLength(3)
  })
})
