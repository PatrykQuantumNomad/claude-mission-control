import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '../../../test/utils'
import { HookActivityCard } from '../HookActivityCard'
import { aggregateP50ByHook, pivotHooksByDay } from '../HookActivityCard.utils'
import { qk } from '../../../lib/queries'
import type { HookActivityResponse } from '../../../lib/api'

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

const happy: HookActivityResponse = {
  range: '7d',
  total_fires: 200,
  items: [
    { day: '2026-04-26', hook_name: 'PreToolUse', fires: 50, paired_duration_ms_p50: 124 },
    { day: '2026-04-26', hook_name: 'PostToolUse', fires: 50, paired_duration_ms_p50: 87 },
    { day: '2026-04-27', hook_name: 'PreToolUse', fires: 50, paired_duration_ms_p50: 130 },
    { day: '2026-04-27', hook_name: 'PostToolUse', fires: 50, paired_duration_ms_p50: 90 },
  ],
}

describe('HookActivityCard', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders reqId/title + chart container + per-hook p50 list when data is cached', async () => {
    const client = makeClient()
    client.setQueryData(qk.hooks('7d'), happy)
    const { container } = render(
      <Wrap client={client}>
        <HookActivityCard />
      </Wrap>,
    )
    expect(screen.getByText('OPNL-09')).toBeInTheDocument()
    expect(screen.getByText('Hook Activity')).toBeInTheDocument()
    await waitFor(() =>
      expect(container.querySelector('.recharts-responsive-container')).not.toBeNull(),
    )
    // p50 list rendered
    expect(container.querySelector('.cmc-hook-activity__p50-list')).not.toBeNull()
    expect(screen.getByText('PreToolUse')).toBeInTheDocument()
    expect(screen.getByText('PostToolUse')).toBeInTheDocument()
  })

  it('renders EmptyState when total_fires is 0 (zero-aggregate empty rule)', () => {
    const client = makeClient()
    client.setQueryData(qk.hooks('7d'), {
      range: '7d',
      total_fires: 0,
      items: [],
    } satisfies HookActivityResponse)
    const { container } = render(
      <Wrap client={client}>
        <HookActivityCard />
      </Wrap>,
    )
    expect(screen.getByText('Nothing to show yet')).toBeInTheDocument()
    // No chart rendered
    expect(container.querySelector('.recharts-responsive-container')).toBeNull()
  })

  it('pivotHooksByDay produces wide rows keyed by hook_name', () => {
    const { rows, hookNames } = pivotHooksByDay(happy.items)
    expect(rows).toHaveLength(2)
    expect(hookNames.sort()).toEqual(['PostToolUse', 'PreToolUse'])
    expect(rows[0]['PreToolUse']).toBe(50)
    expect(rows[0]['PostToolUse']).toBe(50)
  })

  it('aggregateP50ByHook produces sample-weighted p50 per hook', () => {
    const summary = aggregateP50ByHook(happy.items)
    const pre = summary.find((s) => s.hook_name === 'PreToolUse')!
    // Both days had fires=50 so weighted = (124+130)/2 = 127
    expect(pre.p50_ms).toBe(127)
  })
})
