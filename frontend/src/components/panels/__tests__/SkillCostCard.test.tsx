// SkillCostCard — SKLP-02 reactivated (Phase 14 Plan 04).
//
// Tests the per-skill cost card that consumes useSkillCost + renders
// cost_usd as a STRING (Decimal-as-JSON-string per Plan 02 D-02 / Pitfall 5 —
// never Number-coerce the displayed dollar figure), 3 token KpiTiles, a
// 14-day cost-trend sparkline, the "Rates as of YYYY-MM-DD" caption, and
// the cost_attribution caption (request | session) so the user sees which
// attribution path the backend resolved (D-02 dual-path branch).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '../../../test/utils'
import { SkillCostCard } from '../SkillCostCard'
import { qk } from '../../../lib/queries'
import type { SkillCostResponse } from '../../../lib/api'

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

const happy: SkillCostResponse = {
  range: '14d',
  name: 'analyze',
  rates_as_of: '2026-05-03',
  tokens_input: 1_234_567,
  tokens_output: 234_567,
  tokens_cache_read: 100_000,
  tokens_cache_create_5m: 50_000,
  tokens_cache_create_1h: 25_000,
  cost_usd: '1.234',
  cost_attribution: 'request',
  trend: [
    { day: '2026-04-26', invocations: 3, cost_usd: '0.42' },
    { day: '2026-04-27', invocations: 5, cost_usd: '0.81' },
  ],
}

describe('SkillCostCard', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders cost_usd as a string-not-float — exact "$1.234" appears (T-14-04-01 regression)', async () => {
    const client = makeClient()
    client.setQueryData(qk.skillCost('analyze', '14d'), happy)
    render(
      <Wrap client={client}>
        <SkillCostCard name="analyze" />
      </Wrap>,
    )
    expect(screen.getByText('SKLP-02')).toBeInTheDocument()
    expect(screen.getByText(/Skill Cost — analyze/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('$1.234')).toBeInTheDocument())
  })

  it('renders the "Rates as of 2026-05-03" caption when rates_as_of is set', async () => {
    const client = makeClient()
    client.setQueryData(qk.skillCost('analyze', '14d'), happy)
    render(
      <Wrap client={client}>
        <SkillCostCard name="analyze" />
      </Wrap>,
    )
    await waitFor(() =>
      expect(screen.getByText(/Rates as of 2026-05-03/)).toBeInTheDocument(),
    )
  })

  it('renders EmptyState when trend is empty', () => {
    const client = makeClient()
    client.setQueryData(qk.skillCost('analyze', '14d'), {
      ...happy,
      trend: [],
    } satisfies SkillCostResponse)
    render(
      <Wrap client={client}>
        <SkillCostCard name="analyze" />
      </Wrap>,
    )
    expect(screen.getByText('Nothing to show yet')).toBeInTheDocument()
  })

  it('renders the 14d / 30d Range toggle', async () => {
    const client = makeClient()
    client.setQueryData(qk.skillCost('analyze', '14d'), happy)
    render(
      <Wrap client={client}>
        <SkillCostCard name="analyze" />
      </Wrap>,
    )
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '14d' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '30d' })).toBeInTheDocument()
    })
  })

  it('surfaces cost_attribution caption (D-02 dual-path branch visible to operator)', async () => {
    const client = makeClient()
    client.setQueryData(qk.skillCost('analyze', '14d'), happy)
    render(
      <Wrap client={client}>
        <SkillCostCard name="analyze" />
      </Wrap>,
    )
    await waitFor(() =>
      expect(screen.getByText(/Attribution: request/)).toBeInTheDocument(),
    )
  })
})
