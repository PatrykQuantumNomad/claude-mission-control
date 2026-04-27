import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, userEvent, waitFor } from '../../../test/utils'
import { McpPanel } from '../McpPanel'
import { qk } from '../../../lib/queries'
import type { McpServerListResponse, McpToolsResponse } from '../../../lib/api'

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

const servers: McpServerListResponse = {
  items: [
    {
      server_name: 'serverA',
      call_count: 30,
      error_count: 0,
      latency_p50_ms: 80,
      latency_p95_ms: 8000, // > 5000 → danger / slow
      latency_max_ms: 9000,
      source_priority: 'project',
      computed_at: new Date().toISOString(),
    },
    {
      server_name: 'serverB',
      call_count: 50,
      error_count: 0,
      latency_p50_ms: 30,
      latency_p95_ms: 200, // call_count >= 10, p95 < 500, error_count=0 → fast
      latency_max_ms: 600,
      source_priority: 'user',
      computed_at: new Date().toISOString(),
    },
  ],
}

const serverATools: McpToolsResponse = {
  server_name: 'serverA',
  items: [
    {
      server_name: 'serverA',
      tool_name: 'fetch',
      call_count: 20,
      error_count: 0,
      latency_p50_ms: 50,
      latency_p95_ms: 200,
      latency_max_ms: 500,
      source_priority: 'project',
      schema_size_bytes: 800,
    },
    {
      server_name: 'serverA',
      tool_name: 'list_repos',
      call_count: 5,
      error_count: 0,
      latency_p50_ms: 100,
      latency_p95_ms: 7000, // slow
      latency_max_ms: 9000,
      source_priority: 'project',
      schema_size_bytes: 1200,
    },
  ],
}

describe('McpPanel', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders server list with danger/success flags always visible (summary outside Collapsible)', async () => {
    const client = makeClient()
    client.setQueryData(qk.mcpServers(), servers)
    const { container } = render(
      <Wrap client={client}>
        <McpPanel />
      </Wrap>,
    )
    expect(screen.getByText('OPNL-15')).toBeInTheDocument()
    expect(screen.getByText('MCP Servers')).toBeInTheDocument()
    // Two CollapsibleSection triggers ("Tools for serverA" / "Tools for serverB")
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: /Tools for server[AB]/ }),
      ).toHaveLength(2),
    )
    // Danger badge visible without expanding (serverA p95=8000)
    expect(container.querySelector('.cmc-badge--danger')).not.toBeNull()
    // Success badge visible without expanding (serverB)
    expect(container.querySelector('.cmc-badge--success')).not.toBeNull()
  })

  it('expanding a server fetches tools and renders per-tool rows', async () => {
    const client = makeClient()
    client.setQueryData(qk.mcpServers(), servers)
    client.setQueryData(qk.mcpTools('serverA'), serverATools)
    render(
      <Wrap client={client}>
        <McpPanel />
      </Wrap>,
    )
    const user = userEvent.setup()
    const trigger = await screen.findByRole('button', { name: /Tools for serverA/ })
    await user.click(trigger)
    // Tool rows appear after expansion (DataTable inside CollapsibleSection body)
    await waitFor(() => expect(screen.getByText('fetch')).toBeInTheDocument())
    expect(screen.getByText('list_repos')).toBeInTheDocument()
  })

  it('renders EmptyState when servers list is empty', () => {
    const client = makeClient()
    client.setQueryData(qk.mcpServers(), { items: [] } satisfies McpServerListResponse)
    render(
      <Wrap client={client}>
        <McpPanel />
      </Wrap>,
    )
    expect(screen.getByText('Nothing to show yet')).toBeInTheDocument()
  })
})
