// SkillProjectsTable — SKLP-08 (Phase 19 Plan 04).
//
// Locks: rendered rows surface project_key + count + latency + cost; empty
// branch via PanelCard's "Nothing to show yet" copy; sort-by-count is the
// default; AND the load-bearing path-leakage guard — programmatic check
// that no rendered text contains a leading-slash filesystem path or a
// 'cwd' / 'display_path' identifier. ROADMAP success criterion #1 is
// structural; this test is the runtime-DOM half of the dual guard
// (the backend test_skill_projects_no_path_leakage is the schema half).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '../../../test/utils'
import { SkillProjectsTable } from '../SkillProjectsTable'
import { qk } from '../../../lib/queries'
import type {
  SkillProjectRow,
  SkillProjectsResponse,
} from '../../../lib/api'

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

function makeRow(overrides: Partial<SkillProjectRow> = {}): SkillProjectRow {
  return {
    project_key: 'a3f8d92b1c4e',
    count: 47,
    p50_ms: 1200,
    p95_ms: 4800,
    cost_usd: '0.4521',
    cost_attribution: 'session',
    low_sample: false,
    ...overrides,
  }
}

const populated: SkillProjectsResponse = {
  name: 'analyze',
  range: '14d',
  rows: [
    makeRow({ project_key: 'a3f8d92b1c4e', count: 47, p50_ms: 1200, p95_ms: 4800, cost_usd: '0.4521' }),
    makeRow({ project_key: 'b91c3a7e0f2d', count: 12, p50_ms: 850, p95_ms: 3100, cost_usd: '0.0814' }),
    makeRow({ project_key: 'c11122233344', count: 3, p50_ms: null, p95_ms: null, cost_usd: '0.0021', low_sample: true }),
  ],
}

describe('SkillProjectsTable (SKLP-08)', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders SKLP-08 reqId, title, and the data-testid hook on the wrapping section', async () => {
    const client = makeClient()
    client.setQueryData(qk.skillProjects('analyze', '14d'), populated)
    render(
      <Wrap client={client}>
        <SkillProjectsTable name="analyze" range="14d" />
      </Wrap>,
    )
    expect(screen.getByText('SKLP-08')).toBeInTheDocument()
    expect(screen.getByText('Per-project breakdown')).toBeInTheDocument()
    expect(screen.getByTestId('skills-detail-projects-table')).toBeInTheDocument()
  })

  it('renders rows with project_key, count, p50/p95, and cost (formatted to $0.xxxx)', async () => {
    const client = makeClient()
    client.setQueryData(qk.skillProjects('analyze', '14d'), populated)
    render(
      <Wrap client={client}>
        <SkillProjectsTable name="analyze" range="14d" />
      </Wrap>,
    )
    await waitFor(() =>
      expect(screen.getByText('a3f8d92b1c4e')).toBeInTheDocument(),
    )
    expect(screen.getByText('b91c3a7e0f2d')).toBeInTheDocument()
    expect(screen.getByText('c11122233344')).toBeInTheDocument()
    // counts (locale-grouped via toLocaleString — 47 doesn't get a separator)
    expect(screen.getByText('47')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    // latency (ms suffix; null renders as em-dash)
    expect(screen.getByText('1200ms')).toBeInTheDocument()
    expect(screen.getByText('4800ms')).toBeInTheDocument()
    // cost (4 decimals)
    expect(screen.getByText('$0.4521')).toBeInTheDocument()
    expect(screen.getByText('$0.0814')).toBeInTheDocument()
    expect(screen.getByText('$0.0021')).toBeInTheDocument()
  })

  it('renders the PanelCard empty state when rows is []', async () => {
    const client = makeClient()
    client.setQueryData(qk.skillProjects('analyze', '14d'), {
      name: 'analyze',
      range: '14d',
      rows: [],
    } satisfies SkillProjectsResponse)
    render(
      <Wrap client={client}>
        <SkillProjectsTable name="analyze" range="14d" />
      </Wrap>,
    )
    expect(await screen.findByText('Nothing to show yet')).toBeInTheDocument()
    // The wrapping section + its testid still render so the e2e spec's
    // path-leakage scan has a stable hook even on empty data.
    expect(screen.getByTestId('skills-detail-projects-table')).toBeInTheDocument()
  })

  it('LOAD-BEARING: no rendered DOM contains a leading-slash filesystem path or cwd identifier (ROADMAP #1)', async () => {
    const client = makeClient()
    client.setQueryData(qk.skillProjects('analyze', '14d'), populated)
    const { container } = render(
      <Wrap client={client}>
        <SkillProjectsTable name="analyze" range="14d" />
      </Wrap>,
    )
    // textContent (as opposed to innerHTML) excludes attribute values like
    // class names ("cmc-skill-projects" contains '-projects-table') from
    // matching, so the regex tests the RENDERED text the user sees.
    const text = container.textContent ?? ''
    // No 'cwd' / 'display_path' identifier should leak into the rendered
    // output (these were never schema fields, but the test guards future
    // regressions where someone adds a renderer that crosses the wire shape).
    expect(text).not.toMatch(/\bcwd\b/i)
    expect(text).not.toMatch(/display_path/i)
    // No leading-slash filesystem-shape: '/Users/...', '/home/...',
    // '/var/...', '/opt/...', etc. The regex requires '/' followed by a
    // letter and at least one subsequent path-shape character — narrowly
    // matches a real fs path without false-positive on '/' alone.
    expect(text).not.toMatch(/\/[A-Za-z][\w/.-]+/)
  })

  it('row keys use project_key (no duplicate-key warnings under React strict)', async () => {
    // Sentinel test — DataTable's rowKey is a function; passing project_key
    // should yield uniqueness. This is a behavioral check, not a console
    // spy: if rowKey were broken, React would mount duplicates and the
    // querying code below would find more than 3 rows.
    const client = makeClient()
    client.setQueryData(qk.skillProjects('analyze', '14d'), populated)
    const { container } = render(
      <Wrap client={client}>
        <SkillProjectsTable name="analyze" range="14d" />
      </Wrap>,
    )
    await waitFor(() => {
      const rows = container.querySelectorAll('.cmc-table tbody tr')
      expect(rows.length).toBe(3)
    })
  })

  it('sorts by count desc by default (highest-runs project rendered first)', async () => {
    const client = makeClient()
    client.setQueryData(qk.skillProjects('analyze', '14d'), populated)
    const { container } = render(
      <Wrap client={client}>
        <SkillProjectsTable name="analyze" range="14d" />
      </Wrap>,
    )
    await waitFor(() => {
      const rows = container.querySelectorAll('.cmc-table tbody tr')
      // Row 0 is the highest-count entry — a3f8d92b1c4e (count=47).
      expect(rows[0]?.textContent ?? '').toContain('a3f8d92b1c4e')
      expect(rows[2]?.textContent ?? '').toContain('c11122233344') // count=3
    })
  })
})
