import { describe, it, expect } from 'vitest'
import {
  createRouter,
  RouterProvider,
  createRootRoute,
  createRoute,
  createMemoryHistory,
} from '@tanstack/react-router'
import { render } from '../../../test/utils'
import { NavBar } from '../NavBar'

// Minimal in-memory router so NavBar's <Link> components can resolve `to=` props.
// We bootstrap the routes programmatically (not via file-route convention) to
// keep the test self-contained.
function makeRouter() {
  const rootRoute = createRootRoute({ component: NavBar })
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
  const routeTree = rootRoute.addChildren([indexRoute, activityRoute, skillsRoute])
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

describe('NavBar', () => {
  it('renders brand, three nav links, and the Cmd+K trigger inside a Primary nav landmark', async () => {
    const router = makeRouter()
    // TanStack Router's RouterProvider mounts asynchronously — block on the
    // router's first transition resolution so tests assert on a settled tree.
    await router.load()
    const { findByText, getByText, getByLabelText, getByRole } = render(
      <RouterProvider router={router} />,
    )
    expect(await findByText('Mission Control')).toBeInTheDocument()
    expect(getByText('Command')).toBeInTheDocument()
    expect(getByText('Activity')).toBeInTheDocument()
    expect(getByText('Skills')).toBeInTheDocument()
    expect(getByLabelText('Open command palette (Cmd+K)')).toBeInTheDocument()
    expect(getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
  })
})
