// RecentlyVisitedSection — Phase 26 Plan 04 (SHEL-05) tests.
//
// Test strategy:
//   - Real lib/recents (Plan 02 already unit-tests the ring against
//     localStorage). Tests seed the ring via pushRecentRoute and assert
//     rendered list shape.
//   - In-memory TanStack Router so useRouterState resolves a real
//     navigation history.
//   - Per-test clearRecentRoutes() so each suite starts fresh.
//
// Behaviour exercised (5 specs):
//   1. Section header always renders even with empty ring.
//   2. With ring of 3 in-scope routes, displays 3 nav links newest-first
//      (when on a non-ring route — no current-route filter applied).
//   3. Current-route filter: ring [/activity, /skills, /cost] while on
//      /activity hides /activity → displayed list is [/skills, /cost].
//   4. With ring > 3 entries, displays only top 3 (post current-route
//      filter).
//   5. collapsed=true preserves the section (icon-only rendering is
//      SidebarNavLink's responsibility — our section root must still mount).

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, within } from '../../../test/utils'
import { RecentlyVisitedSection } from '../RecentlyVisitedSection'
import {
  clearRecentRoutes,
  pushRecentRoute,
} from '../../../lib/recents'

// ─────────────────────────────────────────────────────────────────────
// Fixture
// ─────────────────────────────────────────────────────────────────────

function makeFixture(initialPath: string, collapsed = false) {
  const rootRoute = createRootRoute({
    component: () => <RecentlyVisitedSection collapsed={collapsed} />,
  })
  // Register every route the section can link to so SidebarNavLink's
  // <Link> resolves without router warnings.
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  const activityRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/activity',
    component: () => null,
  })
  const sessionsCompareRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/sessions/compare',
    component: () => null,
  })
  const skillsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/skills',
    component: () => null,
  })
  const skillsDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/skills/$name',
    component: () => null,
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
  // Off-ring route used in some tests so no current-route filter triggers.
  const otherRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/__other',
    component: () => null,
  })
  const routeTree = rootRoute.addChildren([
    indexRoute,
    activityRoute,
    sessionsCompareRoute,
    skillsRoute,
    skillsDetailRoute,
    costRoute,
    alertsRoute,
    otherRoute,
  ])
  const history = createMemoryHistory({ initialEntries: [initialPath] })
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

describe('RecentlyVisitedSection', () => {
  beforeEach(() => {
    clearRecentRoutes()
  })

  afterEach(() => {
    clearRecentRoutes()
  })

  it('renders header even with empty ring', async () => {
    await renderFixture(makeFixture('/__other'))
    // Section root is present.
    expect(
      await screen.findByTestId('sidebar-section-recently-visited'),
    ).toBeInTheDocument()
    // Header copy is visible (locked invariant — mirrors PinnedViewsSection).
    expect(screen.getByText('Recently Visited')).toBeInTheDocument()
    // No nav rows render when the ring is empty.
    const section = screen.getByTestId('sidebar-section-recently-visited')
    expect(within(section).queryByTestId('sidebar-link-activity')).toBeNull()
  })

  it('renders 3 nav links newest-first when off-ring (no current-route filter)', async () => {
    // Push order: /activity → /skills → /cost. Newest first means /cost
    // is at index 0.
    pushRecentRoute({ route: '/activity', visitedAt: 1 })
    pushRecentRoute({ route: '/skills', visitedAt: 2 })
    pushRecentRoute({ route: '/cost', visitedAt: 3 })

    await renderFixture(makeFixture('/__other'))

    const section = await screen.findByTestId(
      'sidebar-section-recently-visited',
    )
    const links = within(section).getAllByRole('link')
    // SidebarNavLink emits role=link via TanStack Link. 3 entries, newest-first.
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/cost',
      '/skills',
      '/activity',
    ])
  })

  it('filters out the currently-active route', async () => {
    pushRecentRoute({ route: '/activity', visitedAt: 1 })
    pushRecentRoute({ route: '/skills', visitedAt: 2 })
    pushRecentRoute({ route: '/cost', visitedAt: 3 })

    // Current route is /activity — must be filtered out of the display.
    await renderFixture(makeFixture('/activity'))

    const section = await screen.findByTestId(
      'sidebar-section-recently-visited',
    )
    const links = within(section).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/cost',
      '/skills',
    ])
    // /activity is absent from the rendered list even though it sits in
    // the ring.
    expect(
      links.find((l) => l.getAttribute('href') === '/activity'),
    ).toBeUndefined()
  })

  it('caps at top 3 even when ring has more entries', async () => {
    // Push 5 distinct in-scope routes. Newest-first order in the ring
    // (after head-dedupe): /alerts, /cost, /skills, /sessions/compare,
    // /activity.
    pushRecentRoute({ route: '/activity', visitedAt: 1 })
    pushRecentRoute({ route: '/sessions/compare', visitedAt: 2 })
    pushRecentRoute({ route: '/skills', visitedAt: 3 })
    pushRecentRoute({ route: '/cost', visitedAt: 4 })
    pushRecentRoute({ route: '/alerts', visitedAt: 5 })

    // Off-ring current pathname so the filter is a no-op — pure top-3
    // slice exercise.
    await renderFixture(makeFixture('/__other'))

    const section = await screen.findByTestId(
      'sidebar-section-recently-visited',
    )
    const links = within(section).getAllByRole('link')
    expect(links).toHaveLength(3)
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/alerts',
      '/cost',
      '/skills',
    ])
  })

  it('collapsed=true preserves the section + still renders rows', async () => {
    pushRecentRoute({ route: '/activity', visitedAt: 1 })
    pushRecentRoute({ route: '/skills', visitedAt: 2 })

    await renderFixture(makeFixture('/__other', /* collapsed */ true))

    // Section root + header still present (collapsed mode hides the header
    // visually via CSS at the app shell level, but the DOM node remains).
    const section = await screen.findByTestId(
      'sidebar-section-recently-visited',
    )
    expect(section).toBeInTheDocument()
    // Rows still render — SidebarNavLink handles icon-only display via
    // its own collapsed prop branch.
    const links = within(section).getAllByRole('link')
    expect(links).toHaveLength(2)
  })
})
