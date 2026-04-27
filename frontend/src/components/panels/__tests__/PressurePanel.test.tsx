import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, userEvent, waitFor } from '../../../test/utils'
import { PressurePanel } from '../PressurePanel'
import { qk } from '../../../lib/queries'
import type { PressureResponse } from '../../../lib/api'

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

const happy: PressureResponse = {
  api_retries_exhausted: 5,
  compaction_count: 12,
  recent_api_errors: [
    {
      ts: new Date(Date.now() - 60_000).toISOString(),
      session_id: 'aaaaaaaa-1111',
      message: 'rate_limit_exceeded',
    },
    {
      ts: new Date(Date.now() - 120_000).toISOString(),
      session_id: null,
      message: 'overloaded_error',
    },
  ],
}

describe('PressurePanel', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('paints api_retries_exhausted in red when > 0', async () => {
    const client = makeClient()
    client.setQueryData(qk.pressure(), happy)
    const { container } = render(
      <Wrap client={client}>
        <PressurePanel />
      </Wrap>,
    )
    expect(screen.getByText('OPNL-14')).toBeInTheDocument()
    expect(screen.getByText('Pressure')).toBeInTheDocument()
    await waitFor(() =>
      expect(container.querySelector('.cmc-pressure__retries-emphasis')).not.toBeNull(),
    )
    expect(container.querySelector('.cmc-pressure__retries-emphasis')!.textContent).toBe('5')
  })

  it('CollapsibleSection toggles open on click and reveals recent errors', async () => {
    const client = makeClient()
    client.setQueryData(qk.pressure(), happy)
    const { container } = render(
      <Wrap client={client}>
        <PressurePanel />
      </Wrap>,
    )
    const user = userEvent.setup()
    // Default closed (defaultOpen=false). Click trigger.
    const trigger = await screen.findByRole('button', {
      name: /Recent API errors/i,
    })
    await user.click(trigger)
    await waitFor(() =>
      expect(container.querySelectorAll('.cmc-pressure__error-row').length).toBe(2),
    )
    expect(screen.getByText('rate_limit_exceeded')).toBeInTheDocument()
    expect(screen.getByText('overloaded_error')).toBeInTheDocument()
  })

  it('renders 0 retries without emphasis class when both counters are zero', async () => {
    const client = makeClient()
    client.setQueryData(qk.pressure(), {
      api_retries_exhausted: 0,
      compaction_count: 0,
      recent_api_errors: [],
    } satisfies PressureResponse)
    const { container } = render(
      <Wrap client={client}>
        <PressurePanel />
      </Wrap>,
    )
    await waitFor(() => expect(screen.getByText('Pressure')).toBeInTheDocument())
    expect(container.querySelector('.cmc-pressure__retries-emphasis')).toBeNull()
  })
})
