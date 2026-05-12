// RecentStateTracker — Phase 25 Plan 10 (VIEW-09) tests.
//
// Test strategy:
//   - vi.mock the `pushRecentState` export of lib/savedViews so we can spy
//     on call shape and call count without depending on the localStorage
//     wrapper internals (Plan 05 owns those tests). The other exports of
//     lib/savedViews are re-exposed from the real module via
//     `vi.importActual` so consumers in the same test run aren't broken.
//   - In-memory TanStack Router so useRouterState resolves a real
//     navigation history.
//   - Per-test routing fixture mirrors the DefaultViewLoader / PinnedViews
//     test layout.
//
// Behaviour exercised (4 specs):
//   1. Out-of-scope route → no pushRecentState call.
//   2. In-scope route + non-empty search → push called once with the
//      expected shape ({route, state, visitedAt}).
//   3. In-scope route + only schemaVersion in search → no push (bare-URL
//      noise filter).
//   4. Dynamic-segment route /skills/<name> → push uses the normalized
//      route id `/skills/$name`.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'

// Mock pushRecentState BEFORE importing RecentStateTracker so the
// component picks up the mock via the module resolution.
vi.mock('../../../lib/savedViews', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/savedViews')>(
    '../../../lib/savedViews',
  )
  return {
    ...actual,
    pushRecentState: vi.fn(() => ({ atCap: false })),
  }
})

import { render } from '../../../test/utils'
import { RecentStateTracker } from '../RecentStateTracker'
import { pushRecentState } from '../../../lib/savedViews'

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function makeFixture(initialPath: string, initialSearch: Record<string, unknown> = {}) {
  const rootRoute = createRootRoute({
    component: () => <RecentStateTracker />,
  })
  const costRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/cost',
    component: () => null,
  })
  const alertsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/alerts',
    component: () => null,
  })
  // Dynamic route mirrors the real /skills/$name shape.
  const skillsDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/skills/$name',
    component: () => null,
  })
  // An out-of-scope route — not in IN_SCOPE_ROUTES; tracker should skip it.
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    component: () => null,
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  const routeTree = rootRoute.addChildren([
    indexRoute,
    costRoute,
    alertsRoute,
    skillsDetailRoute,
    settingsRoute,
  ])

  const qs = Object.entries(initialSearch)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
  const entry = qs ? `${initialPath}?${qs}` : initialPath
  const history = createMemoryHistory({ initialEntries: [entry] })
  const router = createRouter({ routeTree, history })
  return { router, history }
}

async function renderFixture(fixture: ReturnType<typeof makeFixture>) {
  await fixture.router.load()
  return render(<RouterProvider router={fixture.router} />)
}

// ─────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────

describe('RecentStateTracker', () => {
  beforeEach(() => {
    vi.mocked(pushRecentState).mockClear()
  })

  afterEach(() => {
    vi.mocked(pushRecentState).mockClear()
  })

  it('out-of-scope route: does NOT call pushRecentState', async () => {
    // /settings is intentionally NOT in IN_SCOPE_ROUTES — the tracker must
    // short-circuit before pushing.
    await renderFixture(makeFixture('/settings', { foo: 'bar' }))
    // Effect runs synchronously after mount; no need to await further.
    expect(pushRecentState).not.toHaveBeenCalled()
  })

  it('in-scope route with non-empty search: pushes one entry with the expected shape', async () => {
    await renderFixture(makeFixture('/cost', { range: '7d', schemaVersion: 1 }))

    await vi.waitFor(() => {
      expect(pushRecentState).toHaveBeenCalledTimes(1)
    })
    const call = vi.mocked(pushRecentState).mock.calls[0][0]
    expect(call.route).toBe('/cost')
    // state retains the full payload including schemaVersion — only the
    // noise-filter decision excludes schemaVersion.
    expect(call.state).toEqual({ range: '7d', schemaVersion: 1 })
    expect(typeof call.visitedAt).toBe('number')
    expect(call.visitedAt).toBeGreaterThan(0)
  })

  it('in-scope route with only schemaVersion in search: bare-URL noise filter skips push', async () => {
    await renderFixture(makeFixture('/cost', { schemaVersion: 1 }))
    // Allow any pending effect to flush.
    await new Promise((r) => setTimeout(r, 20))
    expect(pushRecentState).not.toHaveBeenCalled()
  })

  it('dynamic /skills/<name> route: push uses the normalized route id /skills/$name', async () => {
    await renderFixture(makeFixture('/skills/foo', { range: '30d', schemaVersion: 1 }))

    await vi.waitFor(() => {
      expect(pushRecentState).toHaveBeenCalledTimes(1)
    })
    const call = vi.mocked(pushRecentState).mock.calls[0][0]
    // Route normalization collapses /skills/foo → /skills/$name so a
    // single bucket holds the cross-instance recents.
    expect(call.route).toBe('/skills/$name')
    expect(call.state).toEqual({ range: '30d', schemaVersion: 1 })
  })
})
