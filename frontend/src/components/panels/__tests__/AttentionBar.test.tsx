import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '../../../test/utils'
import { AttentionBar } from '../AttentionBar'
import { qk } from '../../../lib/queries'
import type { AttentionResponse } from '../../../lib/api'

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

const empty: AttentionResponse = {
  items: [],
  pending_decisions: 0,
  failed_tasks: 0,
  stale_dispatcher_seconds: null,
  stuck_sessions: 0,
}

describe('AttentionBar', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null (no card heading rendered) when attention payload is empty', async () => {
    const client = makeClient()
    client.setQueryData(qk.attention(), empty)
    const { container } = render(
      <Wrap client={client}>
        <AttentionBar />
      </Wrap>,
    )
    // hiddenWhenEmpty short-circuits to null — no card rendered.
    await waitFor(() => expect(container.firstChild).toBeNull())
    expect(screen.queryByText('OPNL-03')).toBeNull()
    expect(screen.queryByText('Attention')).toBeNull()
  })

  it('renders skeleton (not null) while data is loading', () => {
    const client = makeClient()
    const { container } = render(
      <Wrap client={client}>
        <AttentionBar />
      </Wrap>,
    )
    // Card should be visible while loading.
    expect(screen.getByText('OPNL-03')).toBeInTheDocument()
    expect(container.querySelector('.cmc-skeleton-stack')).not.toBeNull()
  })

  it('renders stuck-sessions + dispatcher badges + per-item pills when payload has items', async () => {
    const client = makeClient()
    client.setQueryData(qk.attention(), {
      ...empty,
      stuck_sessions: 2,
      stale_dispatcher_seconds: 145,
      items: [
        { kind: 'rate_limited', severity: 'error', count: 3, detail: 'Anthropic 429' },
        { kind: 'errored', severity: 'warning', count: 1, detail: null },
      ],
    } satisfies AttentionResponse)
    render(
      <Wrap client={client}>
        <AttentionBar />
      </Wrap>,
    )
    await waitFor(() => expect(screen.getByText(/Stuck sessions: 2/)).toBeInTheDocument())
    expect(screen.getByText(/Dispatcher stale 145s/)).toBeInTheDocument()
    expect(screen.getByText(/rate_limited/)).toBeInTheDocument()
    expect(screen.getByText(/Anthropic 429/)).toBeInTheDocument()
    expect(screen.getByText(/errored/)).toBeInTheDocument()
  })

  it('renders the bar when only stale_dispatcher is set (no items, no stuck)', async () => {
    const client = makeClient()
    client.setQueryData(qk.attention(), {
      ...empty,
      stale_dispatcher_seconds: 60,
    } satisfies AttentionResponse)
    const { container } = render(
      <Wrap client={client}>
        <AttentionBar />
      </Wrap>,
    )
    await waitFor(() => expect(screen.getByText(/Dispatcher stale 60s/)).toBeInTheDocument())
    // The bar root region renders.
    expect(container.querySelector('.cmc-attention-bar')).not.toBeNull()
  })
})
