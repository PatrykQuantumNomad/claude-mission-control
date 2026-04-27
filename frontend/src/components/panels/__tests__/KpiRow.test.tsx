import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '../../../test/utils'
import { KpiRow } from '../KpiRow'
import { qk } from '../../../lib/queries'
import type { TodaySummaryResponse } from '../../../lib/api'

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

const happy: TodaySummaryResponse = {
  date: new Date().toISOString(),
  sessions_count: 12,
  tokens_input_total: 1000,
  tokens_output_total: 2000,
  tokens_cache_read_total: 500,
  tokens_cache_create_total: 1500,
  tool_call_count: 87,
  error_count: 0,
}

describe('KpiRow', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders skeleton when query is pending', () => {
    const client = makeClient()
    const { container } = render(
      <Wrap client={client}>
        <KpiRow />
      </Wrap>,
    )
    expect(screen.getByText('OPNL-02')).toBeInTheDocument()
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(container.querySelector('.cmc-skeleton-stack')).not.toBeNull()
  })

  it('renders 4 KpiTiles with comma-grouped totals when summary is cached', async () => {
    const client = makeClient()
    client.setQueryData(qk.summary(), happy)
    const { container } = render(
      <Wrap client={client}>
        <KpiRow />
      </Wrap>,
    )
    await waitFor(() => expect(container.querySelectorAll('.cmc-kpi-tile').length).toBe(4))
    // tokens total = 1000 + 2000 + 500 + 1500 = 5,000
    expect(screen.getByText('5,000')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument() // sessions
    expect(screen.getByText('87')).toBeInTheDocument() // tool calls
    // Each label rendered once
    expect(screen.getByText('Sessions')).toBeInTheDocument()
    expect(screen.getByText('Tokens')).toBeInTheDocument()
    expect(screen.getByText('Tool Calls')).toBeInTheDocument()
    expect(screen.getByText('Errors')).toBeInTheDocument()
  })

  it('renders 4 tiles even when every counter is zero (empty.when=() => false)', async () => {
    const client = makeClient()
    client.setQueryData(qk.summary(), {
      ...happy,
      sessions_count: 0,
      tokens_input_total: 0,
      tokens_output_total: 0,
      tokens_cache_read_total: 0,
      tokens_cache_create_total: 0,
      tool_call_count: 0,
      error_count: 0,
    })
    const { container } = render(
      <Wrap client={client}>
        <KpiRow />
      </Wrap>,
    )
    await waitFor(() => expect(container.querySelectorAll('.cmc-kpi-tile').length).toBe(4))
    // EmptyState heading should NOT render
    expect(screen.queryByText('Nothing to show yet')).toBeNull()
  })

  it('paints error count in red when error_count > 0', async () => {
    const client = makeClient()
    client.setQueryData(qk.summary(), { ...happy, error_count: 3 })
    const { container } = render(
      <Wrap client={client}>
        <KpiRow />
      </Wrap>,
    )
    await waitFor(() => expect(container.querySelector('.cmc-kpi-row__error')).not.toBeNull())
    expect(container.querySelector('.cmc-kpi-row__error')!.textContent).toBe('3')
  })
})
