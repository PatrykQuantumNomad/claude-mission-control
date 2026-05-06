import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createRouter,
  RouterProvider,
  createRootRoute,
  createRoute,
  createMemoryHistory,
} from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '../../../test/utils'
import { NavBar } from '../NavBar'

// Minimal in-memory router so NavBar's <Link> components can resolve `to=` props.
// We bootstrap the routes programmatically (not via file-route convention) to
// keep the test self-contained.
//
// Note: NavBar now mounts <EmergencyStopBanner /> which calls
// useSystemState — needs a QueryClientProvider to mount. We wrap the
// RouterProvider with a fresh QC and stub fetch to a 200/empty response.
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
  // Phase 20 Plan 03 — /cost route added between Skills and Alerts.
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
  const routeTree = rootRoute.addChildren([
    indexRoute,
    activityRoute,
    skillsRoute,
    costRoute,
    alertsRoute,
  ])
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, refetchOnWindowFocus: false },
    },
  })
}

describe('NavBar', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: { emergency_stop: '0' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders brand, five nav links (Phase 20: + Cost), the EmergencyStopBanner, and the Cmd+K trigger inside a Primary nav landmark', async () => {
    const router = makeRouter()
    const client = makeClient()
    // TanStack Router's RouterProvider mounts asynchronously — block on the
    // router's first transition resolution so tests assert on a settled tree.
    await router.load()
    const { findByText, getByText, getByLabelText, getByRole, getAllByRole } =
      render(
        <QueryClientProvider client={client}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      )
    expect(await findByText('Mission Control')).toBeInTheDocument()
    expect(getByText('Command')).toBeInTheDocument()
    expect(getByText('Activity')).toBeInTheDocument()
    expect(getByText('Skills')).toBeInTheDocument()
    // Phase 20 Plan 03 — Cost link added between Skills and Alerts.
    expect(getByText('Cost')).toBeInTheDocument()
    expect(getByText('Alerts')).toBeInTheDocument()
    expect(getByLabelText('Open command palette (Cmd+K)')).toBeInTheDocument()
    expect(getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    // implementation — TPNL-05 banner mounted globally, visible from boot.
    expect(getByRole('button', { name: /Emergency stop/i })).toBeInTheDocument()

    // 5 nav links exactly: Command / Activity / Skills / Cost / Alerts.
    expect(getAllByRole('link')).toHaveLength(5)
    expect(getByRole('link', { name: 'Cost' })).toHaveAttribute('href', '/cost')
  })
})
