import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Phase 26 Plan 08 (TIME-02) — SessionsTable now consumes useRouteRange.
// Use a PARTIAL mock so existing tests that use createRouter / RouterProvider /
// useNavigate (Compare-click tests) keep working with the real router APIs,
// while non-router tests get a stub useRouterState that returns search with
// time tokens resolving to '7d' (preserves existing `range: '7d'` fixture
// seeds). Tests that render inside a real RouterProvider hit the mocked
// useRouterState too — that returns a static search regardless of the real
// router's URL. Compare-click tests assert on `router.state.location`, not
// on useRouterState reads, so they're unaffected.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useRouterState: ({
      select,
    }: {
      select: (s: { location: { pathname: string; search: Record<string, unknown> } }) => unknown
    }) =>
      select({
        location: { pathname: '/activity', search: { time_from: 'now-7d', time_to: 'now' } },
      }),
  }
})

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, userEvent } from '../../../test/utils'
import { SessionsTable } from '../SessionsTable'
import { qk } from '../../../lib/queries'
import type { SessionListItemFull, SessionListResponse } from '../../../lib/api'

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

// Phase 16 Plan 03 — the per-row Compare button calls `useNavigate()`. Tests
// that exercise the click need a mounted TanStack Router. We mirror the
// CommandPalette.test.tsx pattern: register the routes the test will navigate
// to (`/sessions/compare` with hand-written validateSearch matching the
// production route file routes/sessions_.compare.tsx) and use createMemoryHistory.
//
// Tests that don't click Compare (rendering / pagination / search) still work
// fine without a router because useNavigate() falls back to a no-op when no
// router is mounted (verified — the existing 6 ACTV-06 tests pass on this
// commit without a Router wrapper).
const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

type CompareSearch = { a?: string; b?: string }

function validateCompareSearch(raw: Record<string, unknown>): CompareSearch {
  const a =
    typeof raw.a === 'string' && UUID_RE.test(raw.a) ? raw.a : undefined
  const b =
    typeof raw.b === 'string' && UUID_RE.test(raw.b) ? raw.b : undefined
  return { a, b }
}

function makeRouter(client: QueryClient, ui: ReactNode) {
  const rootRoute = createRootRoute({
    component: () => <Wrap client={client}>{ui}</Wrap>,
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  const compareRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/sessions/compare',
    validateSearch: validateCompareSearch,
    component: () => null,
  })
  const routeTree = rootRoute.addChildren([indexRoute, compareRoute])
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

function makeRow(i: number, overrides: Partial<SessionListItemFull> = {}): SessionListItemFull {
  return {
    session_id: `sid${String(i).padStart(8, '0')}`,
    started_at: '2026-04-27T08:00:00Z',
    ended_at: null,
    cwd: `/work/proj-${i}`,
    // Phase 27 TDBT-01 — distinct 12-char hex sentinel per row so any
    // future test that exercises project_key-based filtering can rely
    // on per-row uniqueness without modifying this factory.
    project_key: `pk${String(i).padStart(10, '0')}`,
    model: 'sonnet',
    source: 'claude_code',
    outcome: null,
    tokens_input: 100 * i,
    tokens_output: 200 * i,
    tokens_cache_read: 0,
    tokens_cache_create: 0,
    tool_call_count: i,
    message_count: i,
    ...overrides,
  }
}

const FIRST_PAGE: SessionListResponse = {
  items: Array.from({ length: 50 }, (_, i) => makeRow(i + 1)),
  total: 120,
  offset: 0,
  limit: 50,
}

describe('SessionsTable', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(FIRST_PAGE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders reqId/title and 50 paginated rows + pagination strip', () => {
    const client = makeClient()
    client.setQueryData(
      qk.sessionsList({ range: '7d', limit: 50, offset: 0 }),
      FIRST_PAGE,
    )
    const { container } = render(
      <Wrap client={client}>
        <SessionsTable />
      </Wrap>,
    )
    expect(screen.getByText('ACTV-06')).toBeInTheDocument()
    expect(screen.getByText('Sessions')).toBeInTheDocument()
    // 50 data rows in tbody
    const dataRows = container.querySelectorAll('table.cmc-table tbody tr')
    expect(dataRows).toHaveLength(50)
    // Pagination strip shows total + page indicator
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument()
    expect(screen.getByText(/120 total/)).toBeInTheDocument()
  })

  it('renders EmptyState when items is empty on page 0', () => {
    const client = makeClient()
    const empty: SessionListResponse = { items: [], total: 0, offset: 0, limit: 50 }
    client.setQueryData(
      qk.sessionsList({ range: '7d', limit: 50, offset: 0 }),
      empty,
    )
    render(
      <Wrap client={client}>
        <SessionsTable />
      </Wrap>,
    )
    expect(screen.getByText('Nothing to show yet')).toBeInTheDocument()
  })

  it('client-side search filters rows by session_id substring', async () => {
    const client = makeClient()
    // Two rows, distinguishable session_ids
    const items = [
      makeRow(1, { session_id: 'abc12345xxxxxxxx' }),
      makeRow(2, { session_id: 'zzzz67890yyyyyy' }),
    ]
    client.setQueryData(
      qk.sessionsList({ range: '7d', limit: 50, offset: 0 }),
      { items, total: 2, offset: 0, limit: 50 } satisfies SessionListResponse,
    )
    const { container } = render(
      <Wrap client={client}>
        <SessionsTable />
      </Wrap>,
    )

    function visibleSidPrefixes(): string[] {
      // Truncated session_id renders inside <span class="cmc-mono"> with a
      // trailing horizontal-ellipsis text node; collect the leading 8 chars
      // of each cell's normalized textContent. Filter to rows whose first
      // text starts with a session_id slug (skip cwd / model spans which
      // also use cmc-mono).
      const spans = Array.from(container.querySelectorAll('table.cmc-table tbody tr td:first-child .cmc-mono'))
      return spans.map((s) => (s.textContent ?? '').slice(0, 8))
    }
    expect(visibleSidPrefixes()).toEqual(['abc12345', 'zzzz6789'])

    const search = screen.getByLabelText('Search session id or cwd') as HTMLInputElement
    await userEvent.type(search, 'abc')
    expect(visibleSidPrefixes()).toEqual(['abc12345'])
  })

  it('Prev disabled on first page; Next disabled on last page', () => {
    const client = makeClient()
    // total=10 fits in one page (pageSize=50): Next must be disabled
    client.setQueryData(
      qk.sessionsList({ range: '7d', limit: 50, offset: 0 }),
      {
        items: Array.from({ length: 10 }, (_, i) => makeRow(i + 1)),
        total: 10,
        offset: 0,
        limit: 50,
      } satisfies SessionListResponse,
    )
    render(
      <Wrap client={client}>
        <SessionsTable />
      </Wrap>,
    )
    const prev = screen.getByRole('button', { name: 'Previous page' }) as HTMLButtonElement
    const next = screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement
    expect(prev.disabled).toBe(true)
    expect(next.disabled).toBe(true)
  })

  it('changing source filter resets page to 0 and triggers a refetch', async () => {
    const client = makeClient()
    client.setQueryData(
      qk.sessionsList({ range: '7d', limit: 50, offset: 0 }),
      FIRST_PAGE,
    )
    render(
      <Wrap client={client}>
        <SessionsTable />
      </Wrap>,
    )
    const sourceInput = screen.getByLabelText('Source filter') as HTMLInputElement
    await userEvent.type(sourceInput, 'cli')
    // The query key changed because `source` is part of the params object, so
    // fetch should have been called for the new key with `source=cli`.
    const fetchCalls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock
      .calls
    const urls = fetchCalls.map((args) => String(args[0]))
    expect(urls.some((u) => u.includes('source=cli'))).toBe(true)
  })

  it('Next button advances page when more rows exist', async () => {
    const client = makeClient()
    client.setQueryData(
      qk.sessionsList({ range: '7d', limit: 50, offset: 0 }),
      FIRST_PAGE,
    )
    // Pre-seed the page-1 cache so the Next click renders without awaiting
    // a network roundtrip.
    client.setQueryData(
      qk.sessionsList({ range: '7d', limit: 50, offset: 50 }),
      {
        items: Array.from({ length: 50 }, (_, i) => makeRow(i + 51)),
        total: 120,
        offset: 50,
        limit: 50,
      } satisfies SessionListResponse,
    )
    render(
      <Wrap client={client}>
        <SessionsTable />
      </Wrap>,
    )
    const next = screen.getByRole('button', { name: 'Next page' })
    await userEvent.click(next)
    expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument()
  })

  // ─── Phase 16 Plan 03 (CMPR-03) — per-row Compare button ─────────────────

  it('renders one Compare button per data row in the new "actions" column', () => {
    const client = makeClient()
    const items = [
      makeRow(1, { session_id: 'sid00000001' }),
      makeRow(2, { session_id: 'sid00000002' }),
      makeRow(3, { session_id: 'sid00000003' }),
    ]
    client.setQueryData(
      qk.sessionsList({ range: '7d', limit: 50, offset: 0 }),
      { items, total: 3, offset: 0, limit: 50 } satisfies SessionListResponse,
    )
    render(
      <Wrap client={client}>
        <SessionsTable />
      </Wrap>,
    )
    // Match aria-label `Compare session sid...` (the visible label is just
    // "Compare" — the same string is rendered N times, so the test queries by
    // the unique aria-label that includes the session_id).
    expect(
      screen.getAllByRole('button', { name: /^Compare session sid\d+$/ }),
    ).toHaveLength(3)
    // The bare "Compare" text appears 3 times in the visible label nodes too.
    expect(screen.getAllByText('Compare')).toHaveLength(3)
  })

  it('clicking the row Compare button navigates to /sessions/compare?a={session_id} (default behaviour)', async () => {
    // Use canonical UUIDs because the test router mirrors the production
    // /sessions/compare validateSearch which strips non-UUID values to
    // undefined (Plan 16-02 hand-written UUID_RE validator). A row with
    // session_id='sid00000001' would navigate but the search param would
    // strip — that's a test-fixture concern, not a SessionsTable bug.
    const UUID_FIRST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const UUID_SECOND = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const client = makeClient()
    const items = [
      makeRow(1, { session_id: UUID_FIRST }),
      makeRow(2, { session_id: UUID_SECOND }),
    ]
    client.setQueryData(
      qk.sessionsList({ range: '7d', limit: 50, offset: 0 }),
      { items, total: 2, offset: 0, limit: 50 } satisfies SessionListResponse,
    )
    const router = makeRouter(client, <SessionsTable />)
    await router.load()
    render(<RouterProvider router={router} />)
    const firstCompare = await screen.findByRole('button', {
      name: `Compare session ${UUID_FIRST}`,
    })
    await userEvent.click(firstCompare)
    // The default navigate target is /sessions/compare with `a={sid}`.
    expect(router.state.location.pathname).toBe('/sessions/compare')
    const search = router.state.location.search as Record<string, unknown>
    expect(search.a).toBe(UUID_FIRST)
    // `b` should NOT be set on the default-navigate path.
    expect(search.b).toBeUndefined()
  })

  it('onCompareClick prop overrides default navigate behaviour', async () => {
    // When the consumer (the Cmd+K compare-route picker drawer) provides
    // onCompareClick, the row button calls that handler with the session_id
    // and does NOT navigate. Used so the picker can do
    // `navigate({ search: (prev) => ({ ...prev, b: sid }) })` instead of
    // a fresh navigate-to-a.
    //
    // Non-UUID session_id is fine here because we're asserting the handler
    // receives the raw value — no router navigation is involved.
    const client = makeClient()
    const items = [makeRow(1, { session_id: 'sid00000001' })]
    client.setQueryData(
      qk.sessionsList({ range: '7d', limit: 50, offset: 0 }),
      { items, total: 1, offset: 0, limit: 50 } satisfies SessionListResponse,
    )
    const onCompareClick = vi.fn()
    const router = makeRouter(
      client,
      <SessionsTable onCompareClick={onCompareClick} />,
    )
    await router.load()
    render(<RouterProvider router={router} />)
    const compare = await screen.findByRole('button', {
      name: 'Compare session sid00000001',
    })
    await userEvent.click(compare)
    expect(onCompareClick).toHaveBeenCalledTimes(1)
    expect(onCompareClick).toHaveBeenCalledWith('sid00000001')
    // Critically, the router did NOT navigate to /sessions/compare — the
    // consumer is in charge of any URL change.
    expect(router.state.location.pathname).toBe('/')
  })
})
