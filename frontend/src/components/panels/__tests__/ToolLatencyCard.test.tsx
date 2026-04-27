import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '../../../test/utils'
import { ToolLatencyCard } from '../ToolLatencyCard'
import { qk } from '../../../lib/queries'
import type { ToolLatencyResponse } from '../../../lib/api'

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

const happy: ToolLatencyResponse = {
  range: '7d',
  items: [
    {
      tool_name: 'Bash',
      call_count: 50,
      p50_ms: 200,
      p95_ms: 6000, // > 5000 → danger
      max_ms: 12000,
      error_rate: 0.0,
    },
    {
      tool_name: 'Read',
      call_count: 20,
      p50_ms: 50,
      p95_ms: 500, // < 1000, call_count >= 10, error_rate=0 → success
      max_ms: 800,
      error_rate: 0.0,
    },
    {
      tool_name: 'Write',
      call_count: 5,
      p50_ms: 100,
      p95_ms: 800,
      max_ms: 1200,
      error_rate: 0.02,
    },
  ],
}

describe('ToolLatencyCard', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders reqId/title + danger flag for p95>5000', async () => {
    const client = makeClient()
    client.setQueryData(qk.latency('7d'), happy)
    const { container } = render(
      <Wrap client={client}>
        <ToolLatencyCard />
      </Wrap>,
    )
    expect(screen.getByText('OPNL-08')).toBeInTheDocument()
    expect(screen.getByText('Tool Latency')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Bash')).toBeInTheDocument())
    // danger badge exists somewhere in the card
    expect(container.querySelector('.cmc-badge--danger')).not.toBeNull()
  })

  it('renders success flag for fast row (call_count>=10 + p95<1000 + error_rate=0)', async () => {
    const client = makeClient()
    client.setQueryData(qk.latency('7d'), happy)
    const { container } = render(
      <Wrap client={client}>
        <ToolLatencyCard />
      </Wrap>,
    )
    await waitFor(() => expect(screen.getByText('Read')).toBeInTheDocument())
    expect(container.querySelector('.cmc-badge--success')).not.toBeNull()
  })

  it('does not flag rows that fall in the neutral zone', async () => {
    const client = makeClient()
    client.setQueryData(qk.latency('7d'), {
      range: '7d',
      items: [happy.items[2]], // Write — neutral
    } satisfies ToolLatencyResponse)
    const { container } = render(
      <Wrap client={client}>
        <ToolLatencyCard />
      </Wrap>,
    )
    await waitFor(() => expect(screen.getByText('Write')).toBeInTheDocument())
    expect(container.querySelector('.cmc-badge--danger')).toBeNull()
    expect(container.querySelector('.cmc-badge--success')).toBeNull()
  })
})
