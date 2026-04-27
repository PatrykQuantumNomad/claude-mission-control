import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '../../../test/utils'
import { ActivityHeatmap } from '../ActivityHeatmap'
import { heatmapColorScale } from '../ActivityHeatmap.utils'
import { qk } from '../../../lib/queries'
import type { HeatmapResponse } from '../../../lib/api'

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

function makeHappy(): HeatmapResponse {
  // 30 distinct days with monotonically increasing session counts so we hit
  // every color bucket.
  const items = Array.from({ length: 30 }, (_, i) => ({
    day: `2026-04-${String(i + 1).padStart(2, '0')}`,
    sessions: i,
    tokens_effective: i * 1000,
  }))
  return { range: '30d', items }
}

describe('ActivityHeatmap', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders reqId/title and 30 cells with day data attributes when data is cached', () => {
    const client = makeClient()
    client.setQueryData(qk.heatmap('30d'), makeHappy())
    const { container } = render(
      <Wrap client={client}>
        <ActivityHeatmap />
      </Wrap>,
    )
    expect(screen.getByText('ACTV-01')).toBeInTheDocument()
    expect(screen.getByText('30-Day Activity')).toBeInTheDocument()
    expect(container.querySelectorAll('.cmc-heatmap-cell')).toHaveLength(30)
    // First cell carries data-day from fixture
    const first = container.querySelector('.cmc-heatmap-cell') as HTMLElement
    expect(first.dataset.day).toBe('2026-04-01')
  })

  it('renders EmptyState when items is empty', () => {
    const client = makeClient()
    client.setQueryData(qk.heatmap('30d'), { range: '30d', items: [] } satisfies HeatmapResponse)
    const { container } = render(
      <Wrap client={client}>
        <ActivityHeatmap />
      </Wrap>,
    )
    expect(screen.getByText('Nothing to show yet')).toBeInTheDocument()
    expect(container.querySelector('.cmc-heatmap-cell')).toBeNull()
  })

  it('cell aria-label includes day, sessions count, and tokens_effective', () => {
    const client = makeClient()
    const fixture: HeatmapResponse = {
      range: '30d',
      items: [
        { day: '2026-04-15', sessions: 7, tokens_effective: 12345 },
      ],
    }
    client.setQueryData(qk.heatmap('30d'), fixture)
    const { container } = render(
      <Wrap client={client}>
        <ActivityHeatmap />
      </Wrap>,
    )
    const cell = container.querySelector('.cmc-heatmap-cell') as HTMLElement
    const label = cell.getAttribute('aria-label') ?? ''
    expect(label).toContain('2026-04-15')
    expect(label).toContain('7 sessions')
    // toLocaleString may insert grouping separators depending on env;
    // assert the digit substring instead of the literal "12,345" form.
    expect(label).toMatch(/12[,\s]?345/)
  })

  it('heatmapColorScale buckets values 0 / low / mid / high / top', () => {
    expect(heatmapColorScale(0, 100)).toContain('surface-2')
    // value=0 with max=0 also returns the zero bucket
    expect(heatmapColorScale(0, 0)).toContain('surface-2')
    // 1-25%
    expect(heatmapColorScale(20, 100)).toContain('rgba(77, 124, 255, 0.25)')
    // 25-50%
    expect(heatmapColorScale(50, 100)).toContain('rgba(77, 124, 255, 0.45)')
    // 50-75%
    expect(heatmapColorScale(70, 100)).toContain('rgba(77, 124, 255, 0.7)')
    // 75-100%
    expect(heatmapColorScale(100, 100)).toContain('rgba(77, 124, 255, 1)')
  })
})
