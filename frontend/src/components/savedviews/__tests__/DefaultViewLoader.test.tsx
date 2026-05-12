// DefaultViewLoader — Phase 25 Plan 10 (VIEW-06) tests.
//
// Test strategy:
//   - Real QueryClient + URL-routed fetch stub for /api/views/<id> so the
//     production hook (useSavedView) resolves through the real cache path.
//   - In-memory TanStack Router so useNavigate + useRouterState resolve.
//   - LoadedViewProvider wraps every render so useLoadedView() resolves
//     its non-null context guard. A sibling observer component captures
//     the loaded view for assertion.
//   - localStorage `cmc.savedView.default.<route>` is seeded via
//     setDefaultViewId per test.
//   - History.push observations confirm the apply happened; the loadedView
//     observer confirms setLoadedView fired.
//
// Behaviour exercised (5 specs):
//   1. Renders null (no DOM output from the component itself).
//   2. With a per-route default set AND empty search → navigates to the
//      view's state_json + replace:true AND sets loadedView.
//   3. With a per-route default set BUT explicit (non-schemaVersion)
//      search → does NOT navigate, does NOT set loadedView (deep-link
//      wins — Pitfall 8 lock).
//   4. With NO per-route default set → does NOT navigate.
//   5. Re-firing within the same route mount is a no-op (apply-once invariant
//      — the effect can re-run on dep updates but must not re-apply).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { render } from '../../../test/utils'
import { DefaultViewLoader } from '../DefaultViewLoader'
import { LoadedViewProvider, useLoadedView } from '../LoadedViewContext'
import { setDefaultViewId } from '../../../lib/savedViews'
import type { SavedView } from '../../../lib/api'

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
}

// Captures the latest loadedView so tests can assert setLoadedView calls.
let observedLoadedView: SavedView | null = null
function LoadedViewObserver() {
  const { loadedView } = useLoadedView()
  useEffect(() => {
    observedLoadedView = loadedView
  }, [loadedView])
  return null
}

function makeFixture(initialPath: string, initialSearch: Record<string, unknown> = {}) {
  const rootRoute = createRootRoute({
    component: () => (
      <LoadedViewProvider>
        <LoadedViewObserver />
        <DefaultViewLoader />
      </LoadedViewProvider>
    ),
  })
  const costRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/cost',
    component: () => null,
    // No validateSearch — pass-through. Tests inject search via URL string.
  })
  const alertsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/alerts',
    component: () => null,
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  const routeTree = rootRoute.addChildren([indexRoute, costRoute, alertsRoute])

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
  return render(
    <QueryClientProvider client={makeClient()}>
      <RouterProvider router={fixture.router} />
    </QueryClientProvider>,
  )
}

// Sample saved view used as the per-route default.
const VIEW_COST_7D: SavedView = {
  id: 42,
  name: 'Cost — 7 days (default)',
  description: '',
  route: '/cost',
  state_json: { range: '7d', schemaVersion: 1 },
  schema_version: 1,
  created_at: '2026-05-12T00:00:00Z',
  updated_at: '2026-05-12T00:00:00Z',
}

// ─────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────

describe('DefaultViewLoader', () => {
  beforeEach(() => {
    observedLoadedView = null
    // Reset all storage so each test starts clean.
    setDefaultViewId('/cost', null)
    setDefaultViewId('/alerts', null)
    setDefaultViewId('/', null)
    // useSavedView fetches /api/views/<id>; default to returning VIEW_COST_7D.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      if (url.includes('/api/views/42')) {
        return new Response(JSON.stringify(VIEW_COST_7D), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      // Any other request — the component should not call any other endpoint.
      return new Response('{}', { status: 200 })
    })
  })

  afterEach(() => {
    setDefaultViewId('/cost', null)
    setDefaultViewId('/alerts', null)
    setDefaultViewId('/', null)
    vi.restoreAllMocks()
  })

  it('renders null — no DOM output from the component itself', async () => {
    // No default set; component should fully render but produce no markup.
    const fixture = makeFixture('/cost', { schemaVersion: 1 })
    const { container } = await renderFixture(fixture)
    // The route component is also null; only the LoadedViewProvider's
    // React.Fragment + the two null children exist. The container should
    // therefore have no element children.
    expect(container.querySelectorAll('*').length).toBe(0)
  })

  it('applies per-route default when search is empty (only schemaVersion)', async () => {
    setDefaultViewId('/cost', 42)
    const fixture = makeFixture('/cost', { schemaVersion: 1 })
    await renderFixture(fixture)

    // Wait for the effect to fire after useSavedView resolves.
    await vi.waitFor(() => {
      expect(observedLoadedView).not.toBeNull()
    })
    expect(observedLoadedView?.id).toBe(42)
    expect(observedLoadedView?.name).toBe('Cost — 7 days (default)')

    // History reflects the auto-applied search — last entry includes the
    // default-view's state_json. memoryHistory.location.search is the
    // canonical signal for "did navigate happen".
    const last = fixture.history.location
    expect(last.pathname).toBe('/cost')
    // The search payload contains range=7d (the default view's state_json).
    // TanStack's `replace: true` means the history stack length stays at 1.
    expect(last.search).toContain('range=7d')
  })

  it('deep-link wins: with explicit search keys, default is NOT applied (Pitfall 8)', async () => {
    setDefaultViewId('/cost', 42)
    const fixture = makeFixture('/cost', { range: '30d', schemaVersion: 1 })
    await renderFixture(fixture)

    // Wait long enough for the effect to have had time to fire — the
    // component still mounts useSavedView, which resolves; the effect
    // runs and must SKIP the navigate. Sleep then assert.
    await new Promise((r) => setTimeout(r, 50))

    expect(observedLoadedView).toBeNull()
    // History pathname + search retain the deep-link values verbatim.
    expect(fixture.history.location.pathname).toBe('/cost')
    expect(fixture.history.location.search).toContain('range=30d')
    expect(fixture.history.location.search).not.toContain('range=7d')
  })

  it('no default set: does not navigate and does not set loadedView', async () => {
    // setDefaultViewId NOT called — getDefaultViewId('/cost') returns null,
    // useSavedView is disabled (id === null) so no fetch happens.
    const fixture = makeFixture('/cost', { schemaVersion: 1 })
    await renderFixture(fixture)

    await new Promise((r) => setTimeout(r, 50))
    expect(observedLoadedView).toBeNull()
    expect(fixture.history.location.pathname).toBe('/cost')
    expect(fixture.history.location.search).not.toContain('range=')
  })

  it('one-shot per entry: default is not re-applied within the same mount', async () => {
    setDefaultViewId('/cost', 42)
    const fixture = makeFixture('/cost', { schemaVersion: 1 })
    await renderFixture(fixture)

    // Wait for the first apply.
    await vi.waitFor(() => {
      expect(observedLoadedView).not.toBeNull()
    })
    const appliedSearch = fixture.history.location.search
    expect(appliedSearch).toContain('range=7d')
    // History length after one replace:true apply should be 1 (replace
    // never grows the stack).
    const lenAfterFirst = fixture.history.length

    // Allow more time for the effect to potentially re-fire on
    // useRouterState observation of the URL change it just performed.
    await new Promise((r) => setTimeout(r, 100))

    // History length unchanged — the effect did NOT push or replace again.
    expect(fixture.history.length).toBe(lenAfterFirst)
    // Search payload unchanged — the appliedKeyRef short-circuited a
    // second apply.
    expect(fixture.history.location.search).toBe(appliedSearch)
  })
})
