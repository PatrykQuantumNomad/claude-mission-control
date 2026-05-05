// SessionCompareView — CMPR-02..05 panel coverage (Phase 16 Plan 02).
//
// Strategy mirrors AlertEventsList.test.tsx: setQueryData seeds the
// useSessionCompare cache slot synchronously so PanelCard's data branch
// resolves without a fetch. Six tests pin the locked behaviour:
//
//   1. Renders both sides + skill-set diff three columns when the hook
//      returns populated data (CMPR-02).
//   2. Over-cap fallback: tool-counts table replaced with EmptyState while
//      KPI strip + skill diff still render (CMPR-04).
//   3. cost_usd is rendered verbatim (`$0.0247`) — Decimal-string preserved,
//      NEVER Number-coerced to `$0.02` (Pitfall 1).
//   4. Empty state when both UUIDs undefined: "Pick two sessions" hint
//      visible (deep-link landing shape).
//   5. Skill-set diff three-column rendering (Shared / Only A / Only B).
//   6. Tabular-only constraint: NO raw LLM message content / text-diff
//      surface — only structured KPI / table / chart data is rendered.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '../../../test/utils'
import { SessionCompareView } from '../SessionCompareView'
import { qk } from '../../../lib/queries'
import type {
  SessionCompareResponse,
  SessionCompareSide,
} from '../../../lib/api'

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchInterval: false,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  })
}

// Minimal in-memory router so the SkillLink (TanStack Link) inside
// SessionCompareView mounts without throwing "useRouterState requires a
// Router" in component tests. We don't navigate during these tests — only
// presence assertions matter — but Link still needs a router context.
function makeRouter(children: ReactNode) {
  const rootRoute = createRootRoute({ component: () => children as never })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => children as never,
  })
  return createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

function Wrap({
  client,
  children,
}: {
  client: QueryClient
  children: ReactNode
}) {
  // Build a per-test router whose root component renders the children.
  // Each render() gets its own router instance so the in-memory history
  // doesn't leak across tests.
  const router = makeRouter(children)
  return (
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

const UUID_A = '11111111-1111-1111-1111-111111111111'
const UUID_B = '22222222-2222-2222-2222-222222222222'

function makeSide(overrides: Partial<SessionCompareSide> = {}): SessionCompareSide {
  return {
    session_id: UUID_A,
    started_at: '2026-05-04T10:00:00Z',
    ended_at: '2026-05-04T10:15:00Z',
    duration_ms: 15 * 60 * 1000,
    cwd: '/repo/proj-a',
    model: 'claude-sonnet-4-5',
    source: 'claude-code',
    outcome: 'ok',
    tokens_input: 1200,
    tokens_output: 800,
    tokens_cache_read: 5000,
    tokens_cache_create_5m: 200,
    tokens_cache_create_1h: 100,
    tool_call_count: 12,
    message_count: 24,
    cost_usd: '0.0247',
    skills_used: ['analyze', 'lint'],
    over_cap: false,
    tool_counts: { Read: 4, Bash: 6, Edit: 2 },
    ...overrides,
  }
}

function makeFixture(
  a: Partial<SessionCompareSide> = {},
  b: Partial<SessionCompareSide> = {},
  topLevel: Partial<SessionCompareResponse> = {},
): SessionCompareResponse {
  return {
    a: makeSide({ session_id: UUID_A, ...a }),
    b: makeSide({
      session_id: UUID_B,
      cost_usd: '0.0512',
      tokens_input: 2400,
      tokens_output: 1600,
      tool_counts: { Read: 8, Bash: 4, Glob: 1 },
      skills_used: ['analyze', 'plan'],
      ...b,
    }),
    skill_diff: {
      shared: ['analyze'],
      only_a: ['lint'],
      only_b: ['plan'],
    },
    rates_as_of: '2026-05-03T00:00:00Z',
    over_cap: false,
    cap: 500,
    ...topLevel,
  }
}

describe('SessionCompareView', () => {
  beforeEach(() => {
    // No fetch should ever fire in these tests — setQueryData seeds the
    // cache synchronously. If something does fire, fail loud.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error(
        'Unexpected fetch in SessionCompareView test — cache should be pre-seeded.',
      )
    })
    window.localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('renders both sides + skill-set three-column diff (CMPR-02)', async () => {
    const client = makeClient()
    const fixture = makeFixture()
    client.setQueryData(qk.sessionCompare(UUID_A, UUID_B), fixture)
    render(
      <Wrap client={client}>
        <SessionCompareView a={UUID_A} b={UUID_B} />
      </Wrap>,
    )
    // RouterProvider mounts asynchronously — wait for the panel to land.
    await waitFor(() => {
      expect(screen.getByText('CMPR-02')).toBeInTheDocument()
    })
    expect(screen.getByText('Session Compare')).toBeInTheDocument()
    await waitFor(() => {
      // Both costs visible (template literal — Decimal-string preserved).
      expect(screen.getByText('$0.0247')).toBeInTheDocument()
      expect(screen.getByText('$0.0512')).toBeInTheDocument()
    })
    // Skill diff three columns — at least one skill from each surfaces.
    expect(screen.getByText(/Shared \(1\)/)).toBeInTheDocument()
    expect(screen.getByText(/Only A \(1\)/)).toBeInTheDocument()
    expect(screen.getByText(/Only B \(1\)/)).toBeInTheDocument()
  })

  it('renders over-cap fallback EmptyState while keeping KPI strip (CMPR-04)', async () => {
    const client = makeClient()
    const fixture = makeFixture(
      { over_cap: true, tool_counts: {} },
      {},
      { over_cap: true },
    )
    client.setQueryData(qk.sessionCompare(UUID_A, UUID_B), fixture)
    render(
      <Wrap client={client}>
        <SessionCompareView a={UUID_A} b={UUID_B} />
      </Wrap>,
    )
    await waitFor(() => {
      expect(
        screen.getByText(/Session too long for full diff/i),
      ).toBeInTheDocument()
    })
    expect(
      screen.getByText(/exceeds 500 tool calls\. Showing summary metrics only/i),
    ).toBeInTheDocument()
    // KPI strip still rendered (cost from side A still visible).
    expect(screen.getByText('$0.0247')).toBeInTheDocument()
    // No tool-counts table headers (Tool / A / B / Δ) when over-cap.
    expect(screen.queryByRole('table', { name: /tool counts diff/i })).toBeNull()
  })

  it('cost_usd is rendered verbatim from the Decimal string (Pitfall 1)', async () => {
    const client = makeClient()
    // 0.00009 would round to $0.00 if anyone called Number(...).toFixed(2).
    const fixture = makeFixture(
      { cost_usd: '0.00009' },
      { cost_usd: '0.123456789' },
    )
    client.setQueryData(qk.sessionCompare(UUID_A, UUID_B), fixture)
    render(
      <Wrap client={client}>
        <SessionCompareView a={UUID_A} b={UUID_B} />
      </Wrap>,
    )
    await waitFor(() => {
      // Side A: full Decimal string survives — would be $0.00 if Number-coerced+toFixed(2).
      expect(screen.getByText('$0.00009')).toBeInTheDocument()
      // Side B: long Decimal string survives — would lose digits if Number-coerced.
      expect(screen.getByText('$0.123456789')).toBeInTheDocument()
    })
  })

  it('renders the pick-two empty state when either UUID is undefined', async () => {
    const client = makeClient()
    render(
      <Wrap client={client}>
        <SessionCompareView a={undefined} b={undefined} />
      </Wrap>,
    )
    // RouterProvider mounts asynchronously — wait for the panel to land.
    await waitFor(() => {
      expect(screen.getByText('CMPR-02')).toBeInTheDocument()
    })
    expect(screen.getByText('Pick two sessions')).toBeInTheDocument()
    expect(
      screen.getByText(/Pick two sessions from \/activity or via Cmd\+K/i),
    ).toBeInTheDocument()
  })

  it('skill-set diff renders all three columns (Shared / Only A / Only B)', async () => {
    const client = makeClient()
    const fixture = makeFixture({}, {}, {
      skill_diff: {
        shared: ['s1'],
        only_a: ['a1', 'a2'],
        only_b: ['b1'],
      },
    })
    client.setQueryData(qk.sessionCompare(UUID_A, UUID_B), fixture)
    render(
      <Wrap client={client}>
        <SessionCompareView a={UUID_A} b={UUID_B} />
      </Wrap>,
    )
    await waitFor(() => {
      // Each individual skill name renders as a link target.
      expect(screen.getByText('s1')).toBeInTheDocument()
      expect(screen.getByText('a1')).toBeInTheDocument()
      expect(screen.getByText('a2')).toBeInTheDocument()
      expect(screen.getByText('b1')).toBeInTheDocument()
    })
    // Heading counts reflect the column sizes — surface the (N) suffix
    // so the user knows how big each set is at a glance.
    expect(screen.getByText('Shared (1)')).toBeInTheDocument()
    expect(screen.getByText('Only A (2)')).toBeInTheDocument()
    expect(screen.getByText('Only B (1)')).toBeInTheDocument()
  })

  it('renders structured tabular data only — no raw LLM message content (CMPR-05)', async () => {
    // CMPR-05 is a HARD constraint: only KPI tiles, charts, and DataTable
    // rows are allowed. No text-diff library, no message body rendering.
    // We assert this by seeding the fixture with a side that DOES NOT
    // contain any free-text message field — the API shape itself enforces
    // it (see lib/api.ts SessionCompareSide) — and by checking that the
    // panel never queries any other endpoint than /api/sessions/compare.
    const client = makeClient()
    const fixture = makeFixture()
    client.setQueryData(qk.sessionCompare(UUID_A, UUID_B), fixture)
    render(
      <Wrap client={client}>
        <SessionCompareView a={UUID_A} b={UUID_B} />
      </Wrap>,
    )
    await waitFor(() => {
      expect(screen.getByText('Session Compare')).toBeInTheDocument()
    })
    // The tool counts table (CMPR-05 structured-tabular) is present when
    // both sides under cap. Row keyed by tool name with A / B / Δ cells.
    const table = screen.getByRole('table', { name: /tool counts diff/i })
    expect(table).toBeInTheDocument()
    expect(screen.getByText('Tool')).toBeInTheDocument()
    // 'A' / 'B' / 'Δ (B−A)' headers rendered.
    expect(screen.getByText('Δ (B−A)')).toBeInTheDocument()
    // Read appears in both sides (A=4, B=8 → Δ +4). Substring asserts.
    expect(screen.getByText('Read')).toBeInTheDocument()
  })
})
