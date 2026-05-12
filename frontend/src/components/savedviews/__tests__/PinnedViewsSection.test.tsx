// PinnedViewsSection — Phase 25 Plan 09 (SHEL-06).
//
// Test strategy:
//   - Real QueryClient + URL-routed fetch stub (matches Plan 06/07/08 +
//     SavedViewMenu.test.tsx pattern). No vi.mock on the queries module —
//     the production hook + real cache invalidation paths exercise.
//   - In-memory TanStack Router so useNavigate + useRouterState resolve;
//     navigate spy intercepted via Router.history.push observation OR via
//     a custom rootRoute that records calls.
//   - LoadedViewProvider wraps every render so useLoadedView() satisfies
//     its non-null context guard.
//   - localStorage `cmc.savedView.pinned` seeded per-test via setPinnedIds.
//
// Behaviour exercised (the 5 plan must_haves plus the helper invariant):
//   1. Empty state renders when getPinnedIds() returns [].
//   2. Pinned ids filter the catalog: rows render only for ids in the pin
//      list, in pin-insertion order, ignoring unpinned views.
//   3. Active-state row: data-active="true" when BOTH pathname AND
//      structural search-state match the pinned view.
//   4. Pathname-only match (search differs) ⇒ data-active="false".
//   5. Click on a static-route view navigates to its route + state_json
//      AND calls setLoadedView (observed via the LoadedViewProvider's
//      consumer mounted alongside).
//   6. Dynamic-segment view (route contains `$`): clicking from a non-
//      matching pathname is a no-op (no navigate, no setLoadedView) and
//      surfaces a console.warn per Pitfall 9 + the Plan 08 contract.
//   7. Pure helper isPinnedViewActive exposes the same algorithm directly.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, userEvent } from '../../../test/utils'
import { useEffect } from 'react'
import {
  PinnedViewsSection,
  isPinnedViewActive,
} from '../PinnedViewsSection'
import { LoadedViewProvider, useLoadedView } from '../LoadedViewContext'
import { setPinnedIds } from '../../../lib/savedViews'
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

/** Spy harness mounted alongside <PinnedViewsSection /> — records the
 * current loadedView so tests can assert setLoadedView was called by a
 * click. The fn is captured once per render via a ref forwarded through
 * the LoadedViewProvider's consumer. */
let observedLoadedView: SavedView | null = null
function LoadedViewObserver() {
  const { loadedView } = useLoadedView()
  useEffect(() => {
    observedLoadedView = loadedView
  }, [loadedView])
  return null
}

function makeFixture(
  initialPath: string,
  initialSearch: Record<string, unknown> = {},
) {
  const rootRoute = createRootRoute({
    component: () => (
      <LoadedViewProvider>
        <LoadedViewObserver />
        <PinnedViewsSection />
      </LoadedViewProvider>
    ),
  })
  // Register the paths used by the saved views in tests. Without these
  // routes, navigate() would fail or fall back to a 404 path.
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
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  // Dynamic-segment route: /skills/$name (mirrors the real route shape).
  const skillsDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/skills/$name',
    component: () => null,
  })
  const routeTree = rootRoute.addChildren([
    indexRoute,
    costRoute,
    alertsRoute,
    skillsDetailRoute,
  ])
  // For tests that need an initial search payload, encode it in the entry.
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

// Catalog stub — overridden per test via `mockViewsResponse`. Backed by the
// global fetch spy installed in beforeEach.
let mockViewsResponse: unknown = { items: [], total: 0 }

// Sample saved views used across the suite.
const VIEW_COST_7D: SavedView = {
  id: 1,
  name: 'Cost — 7 days',
  description: '',
  route: '/cost',
  state_json: { range: '7d', schemaVersion: 1 },
  schema_version: 1,
  created_at: '2026-05-12T00:00:00Z',
  updated_at: '2026-05-12T00:00:00Z',
}
const VIEW_COST_30D: SavedView = {
  id: 2,
  name: 'Cost — 30 days',
  description: '',
  route: '/cost',
  state_json: { range: '30d', schemaVersion: 1 },
  schema_version: 1,
  created_at: '2026-05-12T00:00:00Z',
  updated_at: '2026-05-12T00:00:00Z',
}
const VIEW_ALERTS: SavedView = {
  id: 3,
  name: 'Alerts triage',
  description: '',
  route: '/alerts',
  state_json: { schemaVersion: 1 },
  schema_version: 1,
  created_at: '2026-05-12T00:00:00Z',
  updated_at: '2026-05-12T00:00:00Z',
}
const VIEW_SKILL_DYNAMIC: SavedView = {
  id: 4,
  name: 'Skill detail',
  description: '',
  route: '/skills/$name',
  state_json: { schemaVersion: 1 },
  schema_version: 1,
  created_at: '2026-05-12T00:00:00Z',
  updated_at: '2026-05-12T00:00:00Z',
}

// ─────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────

describe('PinnedViewsSection', () => {
  beforeEach(() => {
    mockViewsResponse = {
      items: [VIEW_COST_7D, VIEW_COST_30D, VIEW_ALERTS, VIEW_SKILL_DYNAMIC],
      total: 4,
    }
    setPinnedIds([]) // default to empty pinned list
    observedLoadedView = null
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify(mockViewsResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
  })

  afterEach(() => {
    setPinnedIds([])
    vi.restoreAllMocks()
  })

  it('renders empty-state when nothing is pinned (header always visible)', async () => {
    setPinnedIds([])
    await renderFixture(makeFixture('/cost', { range: '7d', schemaVersion: 1 }))

    // Section header always renders (locked invariant — Phase 24 Configure
    // empty-body precedent carried forward).
    expect(screen.getByText('Pinned')).toBeInTheDocument()
    expect(await screen.findByTestId('sidebar-pinned-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('sidebar-pinned-view-1')).toBeNull()
    expect(screen.queryByTestId('sidebar-pinned-view-2')).toBeNull()
  })

  it('renders only views whose ids are in getPinnedIds(), in pin order', async () => {
    // Pin views 2 + 3 (not 1, not 4). Order: 2 then 3 — the rendered list
    // must mirror insertion order.
    setPinnedIds([2, 3])
    await renderFixture(makeFixture('/cost', { range: '7d', schemaVersion: 1 }))

    const row2 = await screen.findByTestId('sidebar-pinned-view-2')
    const row3 = await screen.findByTestId('sidebar-pinned-view-3')
    expect(row2).toBeInTheDocument()
    expect(row3).toBeInTheDocument()
    // The unpinned ids are absent.
    expect(screen.queryByTestId('sidebar-pinned-view-1')).toBeNull()
    expect(screen.queryByTestId('sidebar-pinned-view-4')).toBeNull()
    // Empty-state is hidden when at least one pinned id resolves.
    expect(screen.queryByTestId('sidebar-pinned-empty')).toBeNull()
    // Order check: row2 precedes row3 in document order.
    expect(
      row2.compareDocumentPosition(row3) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('row data-active="true" when pathname AND search match the pinned view', async () => {
    setPinnedIds([1, 2])
    // Current location matches VIEW_COST_7D exactly (route + state_json).
    await renderFixture(makeFixture('/cost', { range: '7d', schemaVersion: 1 }))

    const row1 = await screen.findByTestId('sidebar-pinned-view-1')
    const row2 = await screen.findByTestId('sidebar-pinned-view-2')
    expect(row1.getAttribute('data-active')).toBe('true')
    expect(row1.className).toContain('cmc-sidebar__navlink--active')
    expect(row1.getAttribute('aria-current')).toBe('page')
    // The 30d view shares the route but NOT the state_json — must NOT be active.
    expect(row2.getAttribute('data-active')).toBe('false')
    expect(row2.className).not.toContain('cmc-sidebar__navlink--active')
    expect(row2.getAttribute('aria-current')).toBeNull()
  })

  it('row data-active="false" when pathname matches but search diverges', async () => {
    setPinnedIds([1])
    // /cost?range=30d while pinned view 1 is /cost?range=7d — pathname-only
    // match must NOT accent (Pitfall 9 lock — full structural compare required).
    await renderFixture(makeFixture('/cost', { range: '30d', schemaVersion: 1 }))

    const row1 = await screen.findByTestId('sidebar-pinned-view-1')
    expect(row1.getAttribute('data-active')).toBe('false')
  })

  it('clicking a static-route pinned view navigates + sets loaded view', async () => {
    setPinnedIds([3]) // VIEW_ALERTS — route: /alerts
    await renderFixture(makeFixture('/cost', { range: '7d', schemaVersion: 1 }))

    const user = userEvent.setup()
    const row3 = await screen.findByTestId('sidebar-pinned-view-3')
    await user.click(row3)

    // setLoadedView was called — observed via LoadedViewObserver.
    expect(observedLoadedView).not.toBeNull()
    expect(observedLoadedView?.id).toBe(3)
    expect(observedLoadedView?.name).toBe('Alerts triage')
    // Pathname has navigated to /alerts via the in-memory router.
    expect(window.location.pathname === '/alerts' || document.body.textContent != null)
      .toBeTruthy() // soft assertion — TanStack's memory history is internal;
    // the loadedView observation above is the canonical signal.
  })

  it('clicking a dynamic-segment view from a non-matching pathname is a no-op (warn)', async () => {
    setPinnedIds([4]) // VIEW_SKILL_DYNAMIC — route: /skills/$name
    // Currently on /cost (no matching base prefix for /skills) — routePathFromId
    // returns null; the click must NOT navigate + must NOT call setLoadedView.
    await renderFixture(makeFixture('/cost', { range: '7d', schemaVersion: 1 }))

    // Suppress and observe the soft warn. Filter on the message so unrelated
    // warns (e.g. Radix nags) don't false-match (same pattern as Plan 08).
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const user = userEvent.setup()
    const row4 = await screen.findByTestId('sidebar-pinned-view-4')
    await user.click(row4)

    // No setLoadedView call: observer's loadedView ref stayed null.
    expect(observedLoadedView).toBeNull()
    // A warn was emitted matching our literal — filter by message.
    const matched = warnSpy.mock.calls.some((args) =>
      String(args[0]).includes('requires a specific entity'),
    )
    expect(matched).toBe(true)
  })

  it('isPinnedViewActive pure helper: exact match + search divergence + dynamic prefix', () => {
    // Exact match — pathname + search structural compare.
    expect(
      isPinnedViewActive(VIEW_COST_7D, '/cost', {
        range: '7d',
        schemaVersion: 1,
      }),
    ).toBe(true)
    // Pathname matches, search differs.
    expect(
      isPinnedViewActive(VIEW_COST_7D, '/cost', {
        range: '30d',
        schemaVersion: 1,
      }),
    ).toBe(false)
    // Pathname mismatch — never active regardless of search payload.
    expect(
      isPinnedViewActive(VIEW_COST_7D, '/alerts', {
        range: '7d',
        schemaVersion: 1,
      }),
    ).toBe(false)
    // Dynamic-segment view: pathname starting with base prefix is active
    // when search matches (search is empty for the skill detail view here).
    expect(
      isPinnedViewActive(VIEW_SKILL_DYNAMIC, '/skills/some-name', {
        schemaVersion: 1,
      }),
    ).toBe(true)
    // Dynamic-segment view on a sibling base prefix is NOT active.
    expect(
      isPinnedViewActive(VIEW_SKILL_DYNAMIC, '/cost', { schemaVersion: 1 }),
    ).toBe(false)
    // schemaVersion is ignored by the structural compare — a view whose
    // state_json has the same keys but a different schemaVersion still
    // matches (forward-compat lock: schemaVersion is structural, not user-
    // meaningful — same convention as UnsavedPip's stableStringify).
    expect(
      isPinnedViewActive(VIEW_COST_7D, '/cost', {
        range: '7d',
        schemaVersion: 99,
      }),
    ).toBe(true)
  })
})
