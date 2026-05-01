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
import { AppShell } from '../AppShell'

// Note: AppShell renders NavBar which now mounts EmergencyStopBanner —
// requires QueryClientProvider. We stub fetch to a benign idle response.
function makeRouter() {
  const rootRoute = createRootRoute({
    component: () => (
      <AppShell>
        <div data-testid="page">Page body</div>
      </AppShell>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  const routeTree = rootRoute.addChildren([indexRoute])
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

describe('AppShell', () => {
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

  it('renders NavBar and children inside <main>', async () => {
    const router = makeRouter()
    const client = makeClient()
    await router.load()
    const { findByText, getByRole, getByTestId } = render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    expect(await findByText('Mission Control')).toBeInTheDocument()
    expect(getByRole('main')).toBeInTheDocument()
    expect(getByTestId('page')).toBeInTheDocument()
  })
})
