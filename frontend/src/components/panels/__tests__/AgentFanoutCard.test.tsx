import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '../../../test/utils'
import { AgentFanoutCard } from '../AgentFanoutCard'
import { qk } from '../../../lib/queries'
import type { AgentFanoutResponse } from '../../../lib/api'

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

const happy: AgentFanoutResponse = {
  range: '7d',
  items: [
    {
      session_id: 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb',
      title: 'Refactor auth flow',
      agent_calls: 4,
      started_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    },
    {
      session_id: 'cccccccc-1111-2222-3333-dddddddddddd',
      title: null,
      agent_calls: 1,
      started_at: new Date(Date.now() - 60_000).toISOString(),
    },
  ],
}

describe('AgentFanoutCard', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders title for rows that have one', async () => {
    const client = makeClient()
    client.setQueryData(qk.fanout('7d'), happy)
    render(
      <Wrap client={client}>
        <AgentFanoutCard />
      </Wrap>,
    )
    expect(screen.getByText('OPNL-11')).toBeInTheDocument()
    expect(screen.getByText('Agent Fanout')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Refactor auth flow')).toBeInTheDocument())
  })

  it('renders fallback truncated id with subtle color when title is null', async () => {
    const client = makeClient()
    client.setQueryData(qk.fanout('7d'), happy)
    const { container } = render(
      <Wrap client={client}>
        <AgentFanoutCard />
      </Wrap>,
    )
    await waitFor(() => expect(screen.getByText('Refactor auth flow')).toBeInTheDocument())
    // Fallback element class should appear for the null-title row
    expect(container.querySelector('.cmc-agent-fanout-row__title--fallback')).not.toBeNull()
    // The fallback contains the first 8 chars of the session id + ellipsis
    expect(
      container.querySelector('.cmc-agent-fanout-row__title--fallback')!.textContent,
    ).toContain('cccccccc')
  })

  it('renders 4 calls count as "4 calls" (plural)', async () => {
    const client = makeClient()
    client.setQueryData(qk.fanout('7d'), happy)
    render(
      <Wrap client={client}>
        <AgentFanoutCard />
      </Wrap>,
    )
    await waitFor(() => expect(screen.getByText(/4 calls/)).toBeInTheDocument())
    // Singular "1 call" for the second row
    expect(screen.getByText(/1 call(?!s)/)).toBeInTheDocument()
  })
})
