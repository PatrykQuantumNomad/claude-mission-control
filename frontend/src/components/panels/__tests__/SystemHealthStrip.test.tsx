import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '../../../test/utils'
import { SystemHealthStrip } from '../SystemHealthStrip'
import { qk } from '../../../lib/queries'
import type { SystemHealthResponse } from '../../../lib/api'

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

const baseData: SystemHealthResponse = {
  status: 'ok',
  uptime_seconds: 4900,
  memory_rss_mb: 128.456,
  last_otel_event_age_seconds: 12,
  daemon_ages: [
    { key: 'jsonl_sync', last_tick_at: '2026-04-27T00:00:00Z', age_seconds: 30 },
    { key: 'dispatcher', last_tick_at: '2026-04-27T00:00:00Z', age_seconds: 200 },
    { key: 'telegram', last_tick_at: null, age_seconds: 600 },
  ],
  tzname: 'America/New_York',
}

describe('SystemHealthStrip', () => {
  beforeEach(() => {
    // Stop hooks from issuing real network requests in case query starts fetching.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders skeleton + reqId + title when query has no cached data', () => {
    const client = makeClient()
    const { container } = render(
      <Wrap client={client}>
        <SystemHealthStrip />
      </Wrap>,
    )
    expect(screen.getByText('OPNL-01')).toBeInTheDocument()
    expect(screen.getByText('System Health')).toBeInTheDocument()
    expect(container.querySelector('.cmc-skeleton-stack')).not.toBeNull()
  })

  it('renders pills and stats line for cached health payload', async () => {
    const client = makeClient()
    client.setQueryData(qk.systemHealth(), baseData)
    render(
      <Wrap client={client}>
        <SystemHealthStrip />
      </Wrap>,
    )
    // server status pill (label aria includes "(ok)")
    await waitFor(() =>
      expect(screen.getByLabelText('server ok (ok)')).toBeInTheDocument(),
    )
    // OTEL pill ok (12s < 60)
    expect(screen.getByLabelText('otel (ok)')).toBeInTheDocument()
    // Daemon pills
    expect(screen.getByLabelText('jsonl_sync (ok)')).toBeInTheDocument()
    // Stats line: humanized uptime (4900s = 1h 21m)
    expect(screen.getByText(/1h 21m/)).toBeInTheDocument()
    expect(screen.getByText(/128\.5 MB/)).toBeInTheDocument()
    expect(screen.getByText('America/New_York')).toBeInTheDocument()
  })

  it('renders stale daemon as stale StatePill (90s ≤ age < 300s)', async () => {
    const client = makeClient()
    client.setQueryData(qk.systemHealth(), baseData)
    render(
      <Wrap client={client}>
        <SystemHealthStrip />
      </Wrap>,
    )
    // dispatcher (200s) → stale
    await waitFor(() =>
      expect(screen.getByLabelText('dispatcher (stale)')).toBeInTheDocument(),
    )
    // telegram (600s) → error
    expect(screen.getByLabelText('telegram (error)')).toBeInTheDocument()
  })

  it('renders error state pill when server status is degraded', async () => {
    const client = makeClient()
    client.setQueryData(qk.systemHealth(), { ...baseData, status: 'degraded' })
    render(
      <Wrap client={client}>
        <SystemHealthStrip />
      </Wrap>,
    )
    await waitFor(() =>
      expect(screen.getByLabelText('server degraded (error)')).toBeInTheDocument(),
    )
  })
})
