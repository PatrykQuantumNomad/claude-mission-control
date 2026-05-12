// CommandPalette Saved Views group — Phase 25 Plan 08 (CMDK-01).
//
// Test strategy:
//   - In-memory TanStack Router with /cost, /skills/$name, and /sessions/compare
//     routes so the palette's normalizeRouteId + useNavigate resolve correctly.
//   - Real QueryClient with the saved-views list pre-seeded via
//     client.setQueryData(qk.savedViews(), ...) — same pattern the existing
//     compare-picker tests use to bypass network.
//   - LoadedViewProvider with a sentinel <LoadedViewSpy /> child that exposes
//     the latest loadedView to the test via a ref-callback, so we can assert
//     setLoadedView(v) fired after a selection.
//
// Specs (≥4 required by plan; 5 here):
//   1. Empty state ('No saved views yet') when useSavedViews returns [].
//   2. Views sorted with the current-route's first (cost first when on /cost,
//      skills first when on /skills/foo) — alpha secondary sort.
//   3. Selecting a static-route view from / navigates to its pathname with
//      state_json as search AND calls setLoadedView(v) AND closes the palette.
//   4. Selecting a dynamic-segment view (route '/skills/$name') from /cost is
//      a no-op + console.warn (URL doesn't change, loadedView stays null).
//   5. Selecting a dynamic-segment view from /skills/foo navigates to
//      /skills/foo with state_json + setLoadedView(v) + closes the palette.
//
// Pure-function unit-tests for routePathFromId + sortSavedViewsForPalette live
// inline at the bottom (the helpers are exported for testability — pure logic
// regression net).
//
// happy-dom doesn't fully model cmdk's keyboard-driven filter; these specs
// open the palette via Cmd+K then assert against the rendered Command.Item DOM
// directly. Filter-by-typing coverage lands in Plan 11 e2e.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createRouter,
  RouterProvider,
  createRootRoute,
  createRoute,
  createMemoryHistory,
} from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode, useEffect } from 'react'
import { render, screen, userEvent, waitFor } from '../../../test/utils'
import {
  CommandPalette,
  routePathFromId,
  sortSavedViewsForPalette,
} from '../CommandPalette'
import { TaskComposerProvider } from '../../panels/TaskComposer'
import { ActiveSessionProvider } from '../../shell/ActiveSessionContext'
import {
  LoadedViewProvider,
  useLoadedView,
} from '../../savedviews/LoadedViewContext'
import { qk } from '../../../lib/queries'
import type { SavedView, SavedViewListResponse } from '../../../lib/api'

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
}

function makeView(
  id: number,
  name: string,
  route: string,
  state_json: Record<string, unknown> = {},
): SavedView {
  return {
    id,
    name,
    description: '',
    route,
    state_json,
    schema_version: 1,
    created_at: '2026-05-12T00:00:00Z',
    updated_at: '2026-05-12T00:00:00Z',
  }
}

/** Sentinel that copies the latest loadedView from context into a ref the
 * test owns. Lets us assert setLoadedView(v) fired without poking the React
 * tree directly. */
function LoadedViewSpy({
  onChange,
}: {
  onChange: (v: SavedView | null) => void
}) {
  const { loadedView } = useLoadedView()
  useEffect(() => {
    onChange(loadedView)
  }, [loadedView, onChange])
  return null
}

interface RouterOpts {
  client?: QueryClient
  initialEntries?: string[]
  onLoadedViewChange?: (v: SavedView | null) => void
}

function makeRouter(opts: RouterOpts = {}) {
  const client = opts.client ?? makeClient()
  const onLoadedViewChange = opts.onLoadedViewChange ?? (() => {})

  const component = () => (
    <Wrap client={client} onLoadedViewChange={onLoadedViewChange}>
      <CommandPalette />
    </Wrap>
  )

  const rootRoute = createRootRoute({ component })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  const costRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/cost',
    component: () => null,
  })
  const activityRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/activity',
    component: () => null,
  })
  const skillsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/skills',
    component: () => null,
  })
  // Dynamic-segment skill detail route. Permissive validateSearch so the
  // palette's navigate({ search: state_json }) survives the router.
  const skillDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/skills/$name',
    validateSearch: (raw: Record<string, unknown>) => raw,
    component: () => null,
  })
  // Compare route — CommandPalette imports useSessionCompare which expects
  // this route shape; mirror the existing CommandPalette.test.tsx wiring.
  const UUID_RE =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
  function validateCompareSearch(
    raw: Record<string, unknown>,
  ): { a?: string; b?: string } {
    const a =
      typeof raw.a === 'string' && UUID_RE.test(raw.a) ? raw.a : undefined
    const b =
      typeof raw.b === 'string' && UUID_RE.test(raw.b) ? raw.b : undefined
    return { a, b }
  }
  const compareRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/sessions/compare',
    validateSearch: validateCompareSearch,
    component: () => null,
  })

  const routeTree = rootRoute.addChildren([
    indexRoute,
    costRoute,
    activityRoute,
    skillsRoute,
    skillDetailRoute,
    compareRoute,
  ])

  return {
    router: createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: opts.initialEntries ?? ['/'],
      }),
    }),
    client,
  }
}

function Wrap({
  client,
  onLoadedViewChange,
  children,
}: {
  client: QueryClient
  onLoadedViewChange: (v: SavedView | null) => void
  children: ReactNode
}) {
  return (
    <QueryClientProvider client={client}>
      <ActiveSessionProvider>
        <LoadedViewProvider>
          <LoadedViewSpy onChange={onLoadedViewChange} />
          <TaskComposerProvider>{children}</TaskComposerProvider>
        </LoadedViewProvider>
      </ActiveSessionProvider>
    </QueryClientProvider>
  )
}

describe('CommandPalette — Saved Views group (CMDK-01)', () => {
  beforeEach(() => {
    // Mock fetch with an empty saved-views list (and an empty sessions list
    // for the picker that lives elsewhere in the palette). Tests that need
    // populated saved-views set client.setQueryData explicitly — that cached
    // value wins over the mocked fetch.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ items: [], total: 0, offset: 0, limit: 50 }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the empty state when no saved views exist', async () => {
    const client = makeClient()
    const seeded: SavedViewListResponse = { items: [], total: 0 }
    // Seed both the unfiltered list-key (useSavedViews() with no arg) so the
    // palette reads from cache instead of waiting for the fetch.
    client.setQueryData(qk.savedViews(), seeded)
    const { router } = makeRouter({ client })
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')
    expect(
      await screen.findByTestId('cmdk-saved-views-empty'),
    ).toHaveTextContent('No saved views yet')
  })

  it('sorts current-route views first, then other routes (alpha secondary)', async () => {
    // Seed three views across two routes. Currently on /cost.
    // Expected order: cost views first (alpha within), then skills view.
    const v1 = makeView(10, 'Zeta cost', '/cost')
    const v2 = makeView(11, 'Alpha cost', '/cost')
    const v3 = makeView(12, 'Mid skill', '/skills/$name')

    const client = makeClient()
    client.setQueryData(qk.savedViews(), {
      items: [v1, v2, v3],
      total: 3,
    } as SavedViewListResponse)

    const { router } = makeRouter({ client, initialEntries: ['/cost'] })
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')

    // Wait for the items to land in the DOM, then read them in document order.
    await screen.findByTestId('cmdk-saved-view-11')
    const cost1 = screen.getByTestId('cmdk-saved-view-11') // Alpha cost
    const cost2 = screen.getByTestId('cmdk-saved-view-10') // Zeta cost
    const skill = screen.getByTestId('cmdk-saved-view-12')
    // Verify all three render
    expect(cost1).toBeInTheDocument()
    expect(cost2).toBeInTheDocument()
    expect(skill).toBeInTheDocument()
    // Verify document ordering via compareDocumentPosition: Alpha cost first,
    // then Zeta cost, then Mid skill (cross-route).
    expect(
      cost1.compareDocumentPosition(cost2) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      cost2.compareDocumentPosition(skill) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('selecting a static-route view navigates + setLoadedView + closes palette', async () => {
    const v = makeView(20, 'Cost view', '/cost', { range: '7d' })
    const client = makeClient()
    client.setQueryData(qk.savedViews(), {
      items: [v],
      total: 1,
    } as SavedViewListResponse)

    let lastLoaded: SavedView | null = null
    const onLoadedViewChange = (next: SavedView | null) => {
      lastLoaded = next
    }

    const { router } = makeRouter({
      client,
      initialEntries: ['/'],
      onLoadedViewChange,
    })
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')
    const item = await screen.findByTestId('cmdk-saved-view-20')
    await user.click(item)

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/cost')
      const search = router.state.location.search as Record<string, unknown>
      expect(search.range).toBe('7d')
    })
    // setLoadedView(v) fired — spy captured it.
    expect(lastLoaded).not.toBeNull()
    expect((lastLoaded as unknown as SavedView).id).toBe(20)
    // Palette closed (input gone).
    expect(screen.queryByPlaceholderText(/search pages/i)).toBeNull()
  })

  it('selecting a dynamic-route view from an unrelated path is a no-op + console.warn', async () => {
    const v = makeView(30, 'Skill detail view', '/skills/$name', {
      tab: 'projects',
    })
    const client = makeClient()
    client.setQueryData(qk.savedViews(), {
      items: [v],
      total: 1,
    } as SavedViewListResponse)

    let lastLoaded: SavedView | null = null
    const onLoadedViewChange = (next: SavedView | null) => {
      lastLoaded = next
    }
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { router } = makeRouter({
      client,
      initialEntries: ['/cost'],
      onLoadedViewChange,
    })
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')
    const item = await screen.findByTestId('cmdk-saved-view-30')
    await user.click(item)

    // The palette closes (close() runs in the guard branch too) but the
    // pathname is unchanged and setLoadedView was NOT called with the view.
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/search pages/i)).toBeNull()
    })
    expect(router.state.location.pathname).toBe('/cost')
    expect(lastLoaded).toBeNull()
    // Filter by our message — Radix's DialogContent emits a separate
    // a11y warning about a missing DialogTitle (preexisting, unrelated).
    const ourCall = warnSpy.mock.calls.find((call) =>
      typeof call[0] === 'string'
        ? /requires a specific entity/i.test(call[0])
        : false,
    )
    expect(ourCall).toBeDefined()
  })

  it('selecting a dynamic-route view from /skills/foo navigates + setLoadedView', async () => {
    const v = makeView(40, 'Skill detail view', '/skills/$name', {
      tab: 'projects',
    })
    const client = makeClient()
    client.setQueryData(qk.savedViews(), {
      items: [v],
      total: 1,
    } as SavedViewListResponse)

    let lastLoaded: SavedView | null = null
    const onLoadedViewChange = (next: SavedView | null) => {
      lastLoaded = next
    }

    const { router } = makeRouter({
      client,
      initialEntries: ['/skills/foo'],
      onLoadedViewChange,
    })
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')
    const item = await screen.findByTestId('cmdk-saved-view-40')
    await user.click(item)

    await waitFor(() => {
      // Pathname is preserved (the param 'foo' came from the current URL).
      expect(router.state.location.pathname).toBe('/skills/foo')
      const search = router.state.location.search as Record<string, unknown>
      expect(search.tab).toBe('projects')
    })
    expect(lastLoaded).not.toBeNull()
    expect((lastLoaded as unknown as SavedView).id).toBe(40)
    expect(screen.queryByPlaceholderText(/search pages/i)).toBeNull()
  })
})

// ─── Pure helper unit tests ────────────────────────────────────────────────
// These cover routePathFromId + sortSavedViewsForPalette without rendering
// React — fast feedback for the ordering + dynamic-route invariants.

describe('routePathFromId (CMDK-01 helper)', () => {
  it('returns the route id verbatim for static routes', () => {
    expect(routePathFromId('/cost', '/cost')).toBe('/cost')
    expect(routePathFromId('/cost', '/activity')).toBe('/cost')
    expect(routePathFromId('/sessions/compare', '/')).toBe('/sessions/compare')
  })

  it('returns currentPathname for dynamic routes when on matching base prefix', () => {
    expect(routePathFromId('/skills/$name', '/skills/foo')).toBe('/skills/foo')
    expect(routePathFromId('/skills/$name', '/skills/bar-baz')).toBe(
      '/skills/bar-baz',
    )
  })

  it('returns null for dynamic routes when off the base prefix', () => {
    expect(routePathFromId('/skills/$name', '/cost')).toBeNull()
    expect(routePathFromId('/skills/$name', '/')).toBeNull()
    // Exact base prefix without a child segment is NOT navigable either —
    // the listing route /skills is not the detail route /skills/$name.
    expect(routePathFromId('/skills/$name', '/skills')).toBeNull()
  })
})

describe('sortSavedViewsForPalette (CMDK-01 helper)', () => {
  it('places current-route views first; alpha secondary within both bands', () => {
    const a = makeView(1, 'beta', '/cost')
    const b = makeView(2, 'alpha', '/cost')
    const c = makeView(3, 'gamma', '/skills/$name')
    const d = makeView(4, 'delta', '/skills/$name')
    const sorted = sortSavedViewsForPalette([a, b, c, d], '/cost')
    expect(sorted.map((v) => v.name)).toEqual([
      'alpha',
      'beta',
      'delta',
      'gamma',
    ])
  })

  it('does not mutate the input array', () => {
    const items = [
      makeView(1, 'b', '/cost'),
      makeView(2, 'a', '/skills/$name'),
    ]
    const snapshot = items.slice()
    sortSavedViewsForPalette(items, '/cost')
    expect(items).toEqual(snapshot)
  })

  it('handles an empty input', () => {
    expect(sortSavedViewsForPalette([], '/cost')).toEqual([])
  })
})
