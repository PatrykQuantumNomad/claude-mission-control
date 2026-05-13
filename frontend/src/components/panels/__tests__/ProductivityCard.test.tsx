import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '../../../test/utils'

// Phase 26 Plan 08 (TIME-02) — ProductivityCard now consumes useRouteRange.
// Feed router with time tokens resolving to '7d' so existing fixture seeds
// `qk.productivity('7d')` continue to match the panel's query key.
vi.mock('@tanstack/react-router', () => ({
  useRouterState: ({ select }: { select: (s: { location: { pathname: string; search: Record<string, unknown> } }) => unknown }) =>
    select({ location: { pathname: '/', search: { time_from: 'now-7d', time_to: 'now' } } }),
}))

import { ProductivityCard } from '../ProductivityCard'
import { qk } from '../../../lib/queries'
import type { ProductivityResponse } from '../../../lib/api'

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

describe('ProductivityCard', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders all 4 stat rows when totals are non-zero', async () => {
    const client = makeClient()
    client.setQueryData(qk.productivity('7d'), {
      range: '7d',
      commits: 12,
      pull_requests: 3,
      lines_added: 450,
      lines_removed: 80,
    } satisfies ProductivityResponse)
    render(
      <Wrap client={client}>
        <ProductivityCard />
      </Wrap>,
    )
    expect(screen.getByText('OPNL-13')).toBeInTheDocument()
    expect(screen.getByText('Productivity')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Commits')).toBeInTheDocument())
    expect(screen.getByText('Pull Requests')).toBeInTheDocument()
    expect(screen.getByText('Lines added')).toBeInTheDocument()
    expect(screen.getByText('Lines removed')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('450')).toBeInTheDocument()
  })

  it('renders EmptyState when zero-aggregate', () => {
    const client = makeClient()
    client.setQueryData(qk.productivity('7d'), {
      range: '7d',
      commits: 0,
      pull_requests: 0,
      lines_added: 0,
      lines_removed: 0,
    } satisfies ProductivityResponse)
    render(
      <Wrap client={client}>
        <ProductivityCard />
      </Wrap>,
    )
    expect(screen.getByText('Nothing to show yet')).toBeInTheDocument()
    // No StatList items rendered
    expect(screen.queryByText('Commits')).toBeNull()
  })
})
