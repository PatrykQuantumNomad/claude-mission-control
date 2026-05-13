// AutoRefreshController — Phase 26 Plan 03 (TIME-01) tests.
//
// Test strategy:
//   - In-memory TanStack Router so useRouterState resolves.
//   - Real QueryClient so useQueryClient resolves; spy on invalidateQueries
//     to count tick-driven invalidations.
//   - vi.useFakeTimers + vi.advanceTimersByTime drives the window
//     setInterval deterministically.
//   - isTimeAnchoredKey is also exercised as a standalone unit (no fixture).
//
// Behaviour exercised (3 specs):
//   1. With interval=30s in localStorage and relative time_from in URL,
//      advancing 30_000ms fires invalidateQueries exactly once with a
//      predicate function.
//   2. With absolute time_from in URL, NO invalidation calls fire even
//      after advancing 60_000ms — the effect skipped the interval setup.
//   3. isTimeAnchoredKey returns true for known prefixes (e.g. 'tokens',
//      'skill-cost') and false for unrelated keys.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '../../../test/utils'
import { AutoRefreshController } from '../AutoRefreshController'
import { isTimeAnchoredKey } from '../../../lib/queries'

const KEY = 'cmc.autoRefresh.interval'

function makeFixture(initialSearch: Record<string, unknown> = {}) {
  const rootRoute = createRootRoute({
    component: () => <AutoRefreshController />,
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  const routeTree = rootRoute.addChildren([indexRoute])
  const qs = Object.entries(initialSearch)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
  const entry = qs ? `/?${qs}` : '/'
  const history = createMemoryHistory({ initialEntries: [entry] })
  const router = createRouter({ routeTree, history })
  return { router, history }
}

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
}

async function renderFixture(
  fixture: ReturnType<typeof makeFixture>,
  client: QueryClient,
) {
  await fixture.router.load()
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={fixture.router} />
    </QueryClientProvider>,
  )
}

describe('AutoRefreshController', () => {
  beforeEach(() => {
    window.localStorage.removeItem(KEY)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    window.localStorage.removeItem(KEY)
  })

  it('with 30s interval + relative window: advancing 30_000ms fires invalidateQueries', async () => {
    window.localStorage.setItem(KEY, '30s')
    const client = makeClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    vi.useFakeTimers({ shouldAdvanceTime: true })

    const fixture = makeFixture({ time_from: 'now-7d', time_to: 'now' })
    await renderFixture(fixture, client)

    // Effect mounts → setInterval(handler, 30_000). Advance one tick.
    vi.advanceTimersByTime(30_000)
    expect(invalidate).toHaveBeenCalledTimes(1)
    const arg = invalidate.mock.calls[0][0] as { predicate?: unknown }
    expect(typeof arg.predicate).toBe('function')
  })

  it('with absolute window: no invalidation calls even after 60_000ms', async () => {
    window.localStorage.setItem(KEY, '30s')
    const client = makeClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    vi.useFakeTimers({ shouldAdvanceTime: true })

    const fixture = makeFixture({
      time_from: '2026-05-12T10:00:00Z',
      time_to: '2026-05-12T11:00:00Z',
    })
    await renderFixture(fixture, client)

    vi.advanceTimersByTime(60_000)
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('isTimeAnchoredKey: true for known prefixes, false for unrelated keys', () => {
    expect(isTimeAnchoredKey(['tokens', { range: '7d' }])).toBe(true)
    expect(isTimeAnchoredKey(['skill-cost', 'foo', '7d'])).toBe(true)
    expect(isTimeAnchoredKey(['cost-forecast'])).toBe(true)
    expect(isTimeAnchoredKey(['unrelated'])).toBe(false)
    expect(isTimeAnchoredKey([])).toBe(false)
    expect(isTimeAnchoredKey('not-an-array')).toBe(false)
    expect(isTimeAnchoredKey([42, 'tokens'])).toBe(false)
  })
})
