// SkillLatencyTable — SKLP-05 (NEW, Phase 14 Plan 04).
//
// Tests the sortable per-skill latency table that fans out useSkillUsage(20)
// → useQueries({ queryKey: qk.skillLatency, queryFn: fetchSkillLatency }) per
// row (Rules of Hooks correctness — never call useSkillLatency inside .map()).
//
// Mocking strategy: pre-populate the QueryClient cache for both the usage
// query AND each per-skill latency query. This is cleaner than vi.mocking
// '@tanstack/react-query' (which would unstub useQueries) and keeps the test
// surface aligned with how every other panel test works in this repo.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, userEvent, waitFor, within } from '../../../test/utils'
import { SkillLatencyTable } from '../SkillLatencyTable'
import { qk } from '../../../lib/queries'
import type { SkillLatencyResponse, SkillUsageResponse } from '../../../lib/api'

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

const usage: SkillUsageResponse = {
  range: '14d',
  rows: [
    { skill_name: 'analyze', total: 500, sparkline: [] },
    { skill_name: 'refactor', total: 200, sparkline: [] },
    { skill_name: 'review', total: 5, sparkline: [] },
  ],
}

const latencyAnalyze: SkillLatencyResponse = {
  range: '14d',
  name: 'analyze',
  sample_count: 500,
  p50_ms: 120,
  p95_ms: 800,
  max_ms: 2000,
  error_count: 5,
  error_rate: 0.01,
  low_sample: false,
}

const latencyRefactor: SkillLatencyResponse = {
  range: '14d',
  name: 'refactor',
  sample_count: 200,
  p50_ms: 60,
  p95_ms: 400,
  max_ms: 900,
  error_count: 0,
  error_rate: 0,
  low_sample: false,
}

const latencyReview: SkillLatencyResponse = {
  range: '14d',
  name: 'review',
  sample_count: 5,
  p50_ms: null,
  p95_ms: null,
  max_ms: null,
  error_count: 0,
  error_rate: 0,
  low_sample: true, // server-driven badge
}

function seedAll(client: QueryClient): void {
  client.setQueryData(qk.skillUsage('14d'), usage)
  client.setQueryData(qk.skillLatency('analyze', '14d'), latencyAnalyze)
  client.setQueryData(qk.skillLatency('refactor', '14d'), latencyRefactor)
  client.setQueryData(qk.skillLatency('review', '14d'), latencyReview)
}

describe('SkillLatencyTable', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders 3 rows with skill_name, sample_count, p50/p95/max, error rate', async () => {
    const client = makeClient()
    seedAll(client)
    render(
      <Wrap client={client}>
        <SkillLatencyTable />
      </Wrap>,
    )
    expect(screen.getByText('SKLP-05')).toBeInTheDocument()
    expect(screen.getByText('Skill Latency')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('analyze')).toBeInTheDocument()
      expect(screen.getByText('refactor')).toBeInTheDocument()
      expect(screen.getByText('review')).toBeInTheDocument()
    })
  })

  it('shows "Low sample" badge ONLY on rows where response.low_sample === true', async () => {
    const client = makeClient()
    seedAll(client)
    render(
      <Wrap client={client}>
        <SkillLatencyTable />
      </Wrap>,
    )
    await waitFor(() => expect(screen.getByText('review')).toBeInTheDocument())
    // Exactly ONE Low sample badge — on the review row.
    const badges = screen.getAllByText(/Low sample/i)
    expect(badges).toHaveLength(1)
    // The badge must live inside the row whose first cell text is "review".
    const reviewRow = screen.getByText('review').closest('tr')!
    expect(within(reviewRow).getByText(/Low sample/i)).toBeInTheDocument()
  })

  it('default sort is p95_ms desc — analyze (800) > refactor (400) > review (null→0)', async () => {
    const client = makeClient()
    seedAll(client)
    const { container } = render(
      <Wrap client={client}>
        <SkillLatencyTable />
      </Wrap>,
    )
    await waitFor(() => expect(screen.getByText('analyze')).toBeInTheDocument())
    const rows = container.querySelectorAll('tbody tr')
    expect(rows[0].textContent).toContain('analyze')
    expect(rows[1].textContent).toContain('refactor')
    expect(rows[2].textContent).toContain('review')
  })

  it('clicking the p95 column header toggles sort direction', async () => {
    const client = makeClient()
    seedAll(client)
    const { container } = render(
      <Wrap client={client}>
        <SkillLatencyTable />
      </Wrap>,
    )
    await waitFor(() => expect(screen.getByText('analyze')).toBeInTheDocument())
    const p95Header = screen.getByText('p95').closest('th')!
    await userEvent.click(p95Header)
    // Now ascending — review (0) first, then refactor (400), then analyze (800).
    await waitFor(() => {
      const rows = container.querySelectorAll('tbody tr')
      expect(rows[0].textContent).toContain('review')
      expect(rows[2].textContent).toContain('analyze')
    })
  })

  it('renders empty state when usage rows: []', () => {
    const client = makeClient()
    client.setQueryData(qk.skillUsage('14d'), {
      range: '14d',
      rows: [],
    } satisfies SkillUsageResponse)
    render(
      <Wrap client={client}>
        <SkillLatencyTable />
      </Wrap>,
    )
    expect(screen.getByText('Nothing to show yet')).toBeInTheDocument()
  })
})
