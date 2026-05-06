// CostByProjectCard — ANLY-07 (Phase 20 Plan 03).
//
// Locks the user-visible behavior of the per-project cost panel:
//   1. happy path — sortable rows render with project_key as 12-char hex
//      and cost in 4-decimal $-format (mirror SkillProjectsTable's fmtCost).
//   2. PATH-LEAKAGE GUARD — rendered DOM textContent never matches a
//      filesystem-path-shape regex. Mirrors the Phase 19 SKLP-08 dual-guard
//      structural assertion (the backend SQL refactor in Plan 20-01 is the
//      schema half; this is the runtime-DOM half).
//   3. RangeToggle 7d/30d invalidates cache — clicking '30d' fires a fetch
//      for /api/cost/breakdown?dim=project&range=30d (cache-key discipline:
//      qk.costBreakdown('project', '7d') !== qk.costBreakdown('project', '30d')).
//   4. empty-state — rows: [] surfaces PanelCard's "Nothing to show yet" copy.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, userEvent } from '../../../test/utils'
import { CostByProjectCard } from '../CostByProjectCard'
import { qk } from '../../../lib/queries'
import type {
  CostBreakdownResponse,
  CostBreakdownRow,
  CostRange,
} from '../../../lib/api'

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
}

function Wrap({ client, children }: { client: QueryClient; children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function makeRow(overrides: Partial<CostBreakdownRow> = {}): CostBreakdownRow {
  return {
    key: 'a1b2c3d4e5f6',
    tokens_input: 1000,
    tokens_output: 500,
    tokens_cache_read: 0,
    tokens_cache_create_5m: 0,
    tokens_cache_create_1h: 0,
    cost_usd: '0.0234',
    ...overrides,
  }
}

function makeBreakdown(
  rows: CostBreakdownRow[],
  range: CostRange = '7d',
): CostBreakdownResponse {
  const total = rows
    .reduce((acc, r) => acc + Number.parseFloat(r.cost_usd), 0)
    .toFixed(4)
  return {
    range,
    dim: 'project',
    rates_as_of: '2026-05-01',
    total_usd: total,
    rows,
  }
}

// Filesystem-path-shape regex — narrowly matches '/' followed by a letter
// and at least one path-shape character (e.g. '/Users/...', '/home/...').
// Mirrors Phase 19 SkillProjectsTable.test.tsx adversarial guard.
const PATH_REGEX = /\/[A-Za-z][\w/.-]+/

describe('CostByProjectCard (ANLY-07)', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders project_key column as 12-char hex with cost formatted to $0.xxxx (4 decimals)', async () => {
    const client = makeClient()
    client.setQueryData(
      qk.costBreakdown('project', '7d'),
      makeBreakdown([
        makeRow({ key: 'a1b2c3d4e5f6', cost_usd: '0.0234' }),
        makeRow({ key: 'fedcba987654', cost_usd: '0.5000' }),
      ]),
    )
    render(
      <Wrap client={client}>
        <CostByProjectCard />
      </Wrap>,
    )

    // 12-char hex project_keys
    expect(await screen.findByText('a1b2c3d4e5f6')).toBeInTheDocument()
    expect(screen.getByText('fedcba987654')).toBeInTheDocument()
    // 4-decimal cost format (mirror SkillProjectsTable fmtCost)
    expect(screen.getByText('$0.0234')).toBeInTheDocument()
    expect(screen.getByText('$0.5000')).toBeInTheDocument()
    // Section-level testid hook (survives all PanelCard branches)
    expect(screen.getByTestId('cost-by-project-card')).toBeInTheDocument()
    expect(screen.getByTestId('cost-by-project-card-table')).toBeInTheDocument()
  })

  it('LOAD-BEARING: rendered DOM contains no filesystem-path-shape strings (path-leakage guard)', async () => {
    // The TS schema for CostBreakdownRow has no cwd / path / display_path
    // field — type-system-level rejection of any future renderer that tries
    // to surface a path-shaped value. This runtime test is the DOM half of
    // the dual guard (the backend SQL refactor in Plan 20-01 is the wire-
    // shape half).
    const client = makeClient()
    client.setQueryData(
      qk.costBreakdown('project', '7d'),
      makeBreakdown([
        makeRow({ key: 'aaaaaaaaaaaa', cost_usd: '0.1000' }),
        makeRow({ key: 'bbbbbbbbbbbb', cost_usd: '0.2000' }),
        makeRow({ key: 'cccccccccccc', cost_usd: '0.3000' }),
      ]),
    )
    const { container } = render(
      <Wrap client={client}>
        <CostByProjectCard />
      </Wrap>,
    )
    await screen.findByText('aaaaaaaaaaaa')
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/\bcwd\b/i)
    expect(text).not.toMatch(/display_path/i)
    expect(text).not.toMatch(PATH_REGEX)
  })

  it('toggling 30d invalidates the cache and fires a fetch for the 30d slice', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input): Promise<Response> => {
        const url = String(input)
        if (url.includes('range=30d')) {
          return new Response(
            JSON.stringify(
              makeBreakdown(
                [makeRow({ key: 'thirty_day_x', cost_usd: '1.2345' })],
                '30d',
              ),
            ),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(
          JSON.stringify(
            makeBreakdown(
              [makeRow({ key: 'sevenday_xxx', cost_usd: '0.6789' })],
              '7d',
            ),
          ),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      })
    const client = makeClient()
    render(
      <Wrap client={client}>
        <CostByProjectCard />
      </Wrap>,
    )

    // Initial 7d render
    expect(await screen.findByText('sevenday_xxx')).toBeInTheDocument()

    // Click 30d toggle (RangeToggle exposes options as <button>s with the
    // option label as their accessible name).
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /^30d$/i }))

    // A new fetch fires for range=30d, and its data renders.
    expect(await screen.findByText('thirty_day_x')).toBeInTheDocument()
    const calls30d = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('range=30d'),
    )
    expect(calls30d.length).toBeGreaterThan(0)
  })

  it('renders the PanelCard empty branch when rows is []', async () => {
    const client = makeClient()
    client.setQueryData(qk.costBreakdown('project', '7d'), makeBreakdown([]))
    render(
      <Wrap client={client}>
        <CostByProjectCard />
      </Wrap>,
    )
    // PanelCard's empty branch surfaces "Nothing to show yet" with the
    // dataNoun in the body copy.
    expect(await screen.findByText('Nothing to show yet')).toBeInTheDocument()
    // Section testid still renders so e2e assertions survive the empty branch.
    expect(screen.getByTestId('cost-by-project-card')).toBeInTheDocument()
  })
})
