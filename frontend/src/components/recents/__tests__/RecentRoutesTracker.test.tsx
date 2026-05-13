// RecentRoutesTracker — Phase 26 Plan 04 (SHEL-05) tests.
//
// Test strategy:
//   - Use REAL lib/recents (no vi.mock). Plan 02 already unit-tests the
//     pushRecentRoute / getRecentRoutes / clearRecentRoutes triad against
//     localStorage; here we verify the COMPONENT correctly threads
//     useRouterState navigations into the ring on IN_SCOPE_ROUTES only.
//   - In-memory TanStack Router so useRouterState resolves a real
//     navigation history (mirror of Phase 25 RecentStateTracker.test.tsx
//     fixture shape).
//   - Per-test localStorage clear so each suite starts fresh.
//
// Behaviour exercised (5 specs):
//   1. Renders null — zero-render effect (no DOM output).
//   2. In-scope route push: navigating to /activity writes a single ring
//      entry with { route: '/activity', visitedAt: <number> }.
//   3. Out-of-scope route skip: navigating to /__unknown does NOT write.
//   4. Dynamic /skills/<name> normalizes to /skills/$name in the ring.
//   5. Sequential in-scope navigations stack newest-first.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render } from '../../../test/utils'
import { RecentRoutesTracker } from '../RecentRoutesTracker'
import { clearRecentRoutes, getRecentRoutes } from '../../../lib/recents'

// ─────────────────────────────────────────────────────────────────────
// Fixture
// ─────────────────────────────────────────────────────────────────────

function makeFixture(initialPath: string) {
  const rootRoute = createRootRoute({
    component: () => <RecentRoutesTracker />,
  })
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
  // Out-of-scope route — tracker must skip.
  const unknownRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/__unknown',
    component: () => null,
  })
  const routeTree = rootRoute.addChildren([
    indexRoute,
    activityRoute,
    skillsRoute,
    skillsDetailRoute,
    costRoute,
    unknownRoute,
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

describe('RecentRoutesTracker', () => {
  beforeEach(() => {
    clearRecentRoutes()
  })

  afterEach(() => {
    clearRecentRoutes()
  })

  it('renders nothing (zero-render effect)', async () => {
    const { container } = await renderFixture(makeFixture('/activity'))
    // Tracker mounts as the root component, which returns null. Container
    // child count should be 0.
    expect(container.childNodes.length).toBe(0)
  })

  it('navigating to /activity pushes a single ring entry', async () => {
    await renderFixture(makeFixture('/activity'))
    const ring = getRecentRoutes()
    expect(ring).toHaveLength(1)
    expect(ring[0].route).toBe('/activity')
    expect(typeof ring[0].visitedAt).toBe('number')
    expect(ring[0].visitedAt).toBeGreaterThan(0)
  })

  it('out-of-scope route /__unknown does NOT push to the ring', async () => {
    await renderFixture(makeFixture('/__unknown'))
    expect(getRecentRoutes()).toEqual([])
  })

  it('dynamic /skills/<name> normalizes to /skills/$name in the ring', async () => {
    await renderFixture(makeFixture('/skills/foo'))
    const ring = getRecentRoutes()
    expect(ring).toHaveLength(1)
    expect(ring[0].route).toBe('/skills/$name')
  })

  it('sequential in-scope navigations stack newest-first', async () => {
    const fixture = makeFixture('/activity')
    await renderFixture(fixture)
    // Navigate to /skills
    await fixture.router.navigate({ to: '/skills' })
    // Allow the effect to flush after the navigation re-renders.
    await new Promise((r) => setTimeout(r, 0))
    // Navigate to /cost
    await fixture.router.navigate({ to: '/cost' })
    await new Promise((r) => setTimeout(r, 0))

    const ring = getRecentRoutes()
    // Newest-first ordering: /cost, /skills, /activity.
    expect(ring.map((r) => r.route)).toEqual(['/cost', '/skills', '/activity'])
  })
})
