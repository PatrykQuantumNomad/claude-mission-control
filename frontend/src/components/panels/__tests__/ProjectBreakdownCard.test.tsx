import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '../../../test/utils'
import { ProjectBreakdownCard } from '../ProjectBreakdownCard'
import { qk } from '../../../lib/queries'
import type { ProjectRollupResponse } from '../../../lib/api'

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

const happy: ProjectRollupResponse = {
  range: '30d',
  items: [
    {
      cwd: '/Users/x/work/repo-a',
      display_path: '~/work/repo-a',
      sessions: 12,
      tokens_effective: 250000,
      tool_calls: 120,
      pct_of_total: 0.6,
    },
    {
      cwd: '/Users/x/personal/notes',
      display_path: '~/personal/notes',
      sessions: 4,
      tokens_effective: 80000,
      tool_calls: 40,
      pct_of_total: 0.2,
    },
  ],
}

describe('ProjectBreakdownCard', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders reqId/title + display_path verbatim from backend', async () => {
    const client = makeClient()
    client.setQueryData(qk.byProject('30d'), happy)
    render(
      <Wrap client={client}>
        <ProjectBreakdownCard />
      </Wrap>,
    )
    expect(screen.getByText('OPNL-10')).toBeInTheDocument()
    expect(screen.getByText('Projects')).toBeInTheDocument()
    // display_path appears verbatim — no client-side regex transformation
    await waitFor(() => expect(screen.getByText('~/work/repo-a')).toBeInTheDocument())
    expect(screen.getByText('~/personal/notes')).toBeInTheDocument()
    // Comma-grouped tokens_effective
    expect(screen.getByText('250,000')).toBeInTheDocument()
  })

  it('renders pct bar for each row with correct width', async () => {
    const client = makeClient()
    client.setQueryData(qk.byProject('30d'), happy)
    const { container } = render(
      <Wrap client={client}>
        <ProjectBreakdownCard />
      </Wrap>,
    )
    await waitFor(() =>
      expect(container.querySelectorAll('.cmc-pct-bar').length).toBe(2),
    )
    const fills = container.querySelectorAll('.cmc-pct-bar__fill')
    // First row 60% width
    expect((fills[0] as HTMLElement).style.width).toBe('60%')
    expect((fills[1] as HTMLElement).style.width).toBe('20%')
  })

  it('renders EmptyState when items is empty', () => {
    const client = makeClient()
    client.setQueryData(qk.byProject('30d'), {
      range: '30d',
      items: [],
    } satisfies ProjectRollupResponse)
    render(
      <Wrap client={client}>
        <ProjectBreakdownCard />
      </Wrap>,
    )
    expect(screen.getByText('Nothing to show yet')).toBeInTheDocument()
  })
})
