// CommandPalette Recents group — Phase 26 Plan 06 (CMDK-04).
//
// Test strategy:
//   - In-memory TanStack Router with /, /activity, /cost, /skills, /skills/$name
//     so useNavigate + useRouterState resolve correctly.
//   - localStorage primed BEFORE the palette mounts: cmc.recents.routes (for
//     recent ROUTES) and cmc.savedView.recent.<route> (for cross-route ad-hoc
//     STATES — getAllRecentStates reads each known route's ring).
//   - Real QueryClient + LoadedViewProvider + TaskComposerProvider —
//     mirror of CommandPalette.savedViews.test.tsx wiring.
//   - happy-dom doesn't fully model cmdk keyboard filtering; specs open the
//     palette via Cmd+K then assert against rendered Command.Item DOM directly.
//
// Specs (6):
//   1. Empty rings → `cmdk-recents-empty` rendered.
//   2. Three recent routes seeded → three items render in newest-first order.
//   3. Selecting a recent route navigates + closes the palette.
//   4. Mixed: two routes + two ad-hoc states → four items total (routes first
//      per JSX order, then states).
//   5. Top-5 truncation: 7 seeded routes → only first 5 render.
//   6. Selecting a recent ad-hoc state navigates to its route with state as
//      search params + closes the palette.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createRouter,
  RouterProvider,
  createRootRoute,
  createRoute,
  createMemoryHistory,
} from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import { render, screen, userEvent, waitFor } from '../../../test/utils'
import { CommandPalette } from '../CommandPalette'
import { TaskComposerProvider } from '../../panels/TaskComposer'
import { ActiveSessionProvider } from '../../shell/ActiveSessionContext'
import { LoadedViewProvider } from '../../savedviews/LoadedViewContext'

// sonner mock — Recents group does not call toast.* itself, but the palette's
// other groups (Time range copy/paste) import sonner at module level; mocking
// keeps the test environment clean and prevents Toaster rendering noise.
vi.mock('sonner', () => {
  return {
    toast: {
      success: vi.fn(),
      error: vi.fn(),
      message: vi.fn(),
    },
    Toaster: () => null,
  }
})

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchInterval: false,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  })
}

interface RouterOpts {
  client?: QueryClient
  initialEntries?: string[]
}

function makeRouter(opts: RouterOpts = {}) {
  const client = opts.client ?? makeClient()

  const component = () => (
    <Wrap client={client}>
      <CommandPalette />
    </Wrap>
  )

  const rootRoute = createRootRoute({ component })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  const activityRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/activity',
    validateSearch: (raw: Record<string, unknown>) => raw,
    component: () => null,
  })
  const costRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/cost',
    validateSearch: (raw: Record<string, unknown>) => raw,
    component: () => null,
  })
  const skillsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/skills',
    validateSearch: (raw: Record<string, unknown>) => raw,
    component: () => null,
  })
  const skillDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/skills/$name',
    validateSearch: (raw: Record<string, unknown>) => raw,
    component: () => null,
  })
  const alertsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/alerts',
    validateSearch: (raw: Record<string, unknown>) => raw,
    component: () => null,
  })
  const compareRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/sessions/compare',
    validateSearch: (raw: Record<string, unknown>) => raw,
    component: () => null,
  })

  const routeTree = rootRoute.addChildren([
    indexRoute,
    activityRoute,
    costRoute,
    skillsRoute,
    skillDetailRoute,
    alertsRoute,
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
  children,
}: {
  client: QueryClient
  children: ReactNode
}) {
  return (
    <QueryClientProvider client={client}>
      <ActiveSessionProvider>
        <LoadedViewProvider>
          <TaskComposerProvider>{children}</TaskComposerProvider>
        </LoadedViewProvider>
      </ActiveSessionProvider>
    </QueryClientProvider>
  )
}

describe('CommandPalette — Recents group (CMDK-04)', () => {
  beforeEach(() => {
    // Mock fetch with an empty saved-views list so the saved-views group
    // renders its empty state and doesn't interfere with assertion targets.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ items: [], total: 0, offset: 0, limit: 50 }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )
    window.localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('renders cmdk-recents-empty when both rings are empty', async () => {
    const { router } = makeRouter({})
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')
    expect(await screen.findByTestId('cmdk-recents-empty')).toHaveTextContent(
      'No recents yet',
    )
  })

  it('renders top-5 recent routes (newest first) when ring has entries', async () => {
    // Newest first: cost (most recent) → activity → skills.
    window.localStorage.setItem(
      'cmc.recents.routes',
      JSON.stringify([
        { route: '/cost', visitedAt: 3000 },
        { route: '/activity', visitedAt: 2000 },
        { route: '/skills', visitedAt: 1000 },
      ]),
    )
    const { router } = makeRouter({})
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')

    const cost = await screen.findByTestId('cmdk-recents-route-cost')
    const activity = screen.getByTestId('cmdk-recents-route-activity')
    const skills = screen.getByTestId('cmdk-recents-route-skills')
    expect(cost).toBeInTheDocument()
    expect(activity).toBeInTheDocument()
    expect(skills).toBeInTheDocument()
    expect(
      cost.compareDocumentPosition(activity) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      activity.compareDocumentPosition(skills) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('selecting a recent route navigates and closes the palette', async () => {
    window.localStorage.setItem(
      'cmc.recents.routes',
      JSON.stringify([
        { route: '/cost', visitedAt: 3000 },
        { route: '/activity', visitedAt: 2000 },
      ]),
    )
    const { router } = makeRouter({})
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')
    const item = await screen.findByTestId('cmdk-recents-route-cost')
    await user.click(item)
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/cost')
    })
    // Palette closed (input gone).
    expect(screen.queryByPlaceholderText(/search pages/i)).toBeNull()
  })

  it('mixed: two routes + two ad-hoc states → four items (routes first)', async () => {
    window.localStorage.setItem(
      'cmc.recents.routes',
      JSON.stringify([
        { route: '/cost', visitedAt: 2000 },
        { route: '/activity', visitedAt: 1000 },
      ]),
    )
    window.localStorage.setItem(
      'cmc.savedView.recent./cost',
      JSON.stringify([
        { route: '/cost', state: { range: '7d' }, visitedAt: 2500 },
      ]),
    )
    window.localStorage.setItem(
      'cmc.savedView.recent./activity',
      JSON.stringify([
        {
          route: '/activity',
          state: { time_from: 'now-1h', time_to: 'now' },
          visitedAt: 1500,
        },
      ]),
    )
    const { router } = makeRouter({})
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')

    const costRoute = await screen.findByTestId('cmdk-recents-route-cost')
    const activityRoute = screen.getByTestId('cmdk-recents-route-activity')
    const state0 = screen.getByTestId('cmdk-recents-state-0')
    const state1 = screen.getByTestId('cmdk-recents-state-1')
    expect(costRoute).toBeInTheDocument()
    expect(activityRoute).toBeInTheDocument()
    expect(state0).toBeInTheDocument()
    expect(state1).toBeInTheDocument()
    // Routes come before states in DOM order.
    expect(
      activityRoute.compareDocumentPosition(state0) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('truncates to top-5 routes even when ring has more', async () => {
    // Seven entries; the palette renders the first five.
    window.localStorage.setItem(
      'cmc.recents.routes',
      JSON.stringify([
        { route: '/cost', visitedAt: 7000 },
        { route: '/activity', visitedAt: 6000 },
        { route: '/skills', visitedAt: 5000 },
        { route: '/alerts', visitedAt: 4000 },
        { route: '/sessions/compare', visitedAt: 3000 },
        // These two MUST NOT render (top-5 cap):
        { route: '/skills/$name', visitedAt: 2000 },
        { route: '/', visitedAt: 1000 },
      ]),
    )
    const { router } = makeRouter({})
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')

    await screen.findByTestId('cmdk-recents-route-cost')
    expect(screen.getByTestId('cmdk-recents-route-cost')).toBeInTheDocument()
    expect(screen.getByTestId('cmdk-recents-route-activity')).toBeInTheDocument()
    expect(screen.getByTestId('cmdk-recents-route-skills')).toBeInTheDocument()
    expect(screen.getByTestId('cmdk-recents-route-alerts')).toBeInTheDocument()
    expect(
      screen.getByTestId('cmdk-recents-route-sessions-compare'),
    ).toBeInTheDocument()
    // Outside the top-5 window — not rendered.
    expect(screen.queryByTestId('cmdk-recents-route-skills-name')).toBeNull()
    expect(screen.queryByTestId('cmdk-recents-route-home')).toBeNull()
  })

  it('selecting a recent ad-hoc state navigates with state as search params', async () => {
    window.localStorage.setItem(
      'cmc.savedView.recent./cost',
      JSON.stringify([
        { route: '/cost', state: { range: '7d' }, visitedAt: 2500 },
      ]),
    )
    const { router } = makeRouter({})
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')

    const item = await screen.findByTestId('cmdk-recents-state-0')
    await user.click(item)
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/cost')
      const search = router.state.location.search as Record<string, unknown>
      expect(search.range).toBe('7d')
    })
    expect(screen.queryByPlaceholderText(/search pages/i)).toBeNull()
  })
})
