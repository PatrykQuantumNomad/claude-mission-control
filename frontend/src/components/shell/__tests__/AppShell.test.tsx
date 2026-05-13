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

// Phase 24 Plan 04 (SHEL-01..04): AppShell now renders Sidebar + AppShellHeader
// (replacing the deleted NavBar). AppShellHeader still mounts EmergencyStopBanner
// — requires QueryClientProvider. We stub fetch to a benign idle response.
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

  it('renders Sidebar (with brand) + children inside <main>', async () => {
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

  // Phase 26 Plan 01 (TIME-01): the sonner Toaster must mount once at AppShell
  // level so TIME-03 paste feedback + cap warnings have a destination from
  // Wave 2 onward. Sonner renders a top-level <section aria-label="Notifications …">
  // unconditionally; the inner <ol data-sonner-toaster> only renders when a
  // toast is queued. We assert on the always-present <section>.
  it('mounts the sonner <Toaster /> as a sibling of CommandPalette', async () => {
    const router = makeRouter()
    const client = makeClient()
    await router.load()
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    // Sonner's containerAriaLabel default is "Notifications" suffixed with
    // the hotkey label ("alt+T" with the configured Alt+T hotkey).
    const toasters = document.querySelectorAll('section[aria-label^="Notifications"]')
    expect(toasters.length).toBe(1)
  })
})
