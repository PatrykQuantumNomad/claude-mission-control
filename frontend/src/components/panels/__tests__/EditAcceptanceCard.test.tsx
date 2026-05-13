import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '../../../test/utils'

// Phase 26 Plan 08 (TIME-02) — EditAcceptanceCard now consumes useRouteRange.
// Feed router with time tokens resolving to '7d' so existing fixture seeds
// `qk.edits('7d')` continue to match the panel's query key.
vi.mock('@tanstack/react-router', () => ({
  useRouterState: ({ select }: { select: (s: { location: { pathname: string; search: Record<string, unknown> } }) => unknown }) =>
    select({ location: { pathname: '/', search: { time_from: 'now-7d', time_to: 'now' } } }),
}))

import { EditAcceptanceCard } from '../EditAcceptanceCard'
import { qk } from '../../../lib/queries'
import type { EditDecisionsResponse } from '../../../lib/api'

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

describe('EditAcceptanceCard', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('always renders 4 fixed rows even when backend returns fewer', async () => {
    const client = makeClient()
    client.setQueryData(qk.edits('7d'), {
      range: '7d',
      items: [
        { tool_name: 'Edit', accepted: 8, rejected: 2, accept_rate: 0.8, low_sample: false },
      ],
    } satisfies EditDecisionsResponse)
    render(
      <Wrap client={client}>
        <EditAcceptanceCard />
      </Wrap>,
    )
    expect(screen.getByText('OPNL-12')).toBeInTheDocument()
    expect(screen.getByText('Edit Acceptance')).toBeInTheDocument()
    // All 4 fixed tool names render
    await waitFor(() => expect(screen.getByText('Edit')).toBeInTheDocument())
    expect(screen.getByText('MultiEdit')).toBeInTheDocument()
    expect(screen.getByText('Write')).toBeInTheDocument()
    expect(screen.getByText('NotebookEdit')).toBeInTheDocument()
  })

  it('renders warning Badge for low_sample row', async () => {
    const client = makeClient()
    client.setQueryData(qk.edits('7d'), {
      range: '7d',
      items: [
        { tool_name: 'Edit', accepted: 1, rejected: 0, accept_rate: 1, low_sample: true },
      ],
    } satisfies EditDecisionsResponse)
    const { container } = render(
      <Wrap client={client}>
        <EditAcceptanceCard />
      </Wrap>,
    )
    await waitFor(() => expect(screen.getByText('Edit')).toBeInTheDocument())
    expect(container.querySelector('.cmc-badge--warning')).not.toBeNull()
  })
})
