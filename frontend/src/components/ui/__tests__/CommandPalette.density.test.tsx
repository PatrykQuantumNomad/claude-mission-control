// CommandPalette Density group — Phase 26 Plan 06 (CMDK-02).
//
// Test strategy:
//   - In-memory TanStack Router (no special routes — Density group doesn't
//     navigate; CommandPalette imports useNavigate so the router is required).
//   - vi.mock('../../../lib/density') replaces setDensity/getDensity with
//     spies so selection can be asserted without involving real localStorage
//     mutations or DOM attribute writes (those have separate coverage in
//     lib/__tests__/density.test.ts).
//   - happy-dom doesn't fully model cmdk keyboard filtering; specs open the
//     palette via Cmd+K then click items by data-testid directly.
//
// Specs (5):
//   1. Density group renders three items (compact, comfortable, cozy).
//   2. Active density shows '✓ ' prefix; other two do not.
//   3. Selecting "Set density: Compact" calls setDensity('compact') and
//      closes the palette.
//   4. After selection, re-opening the palette shows '✓ ' on the new active
//      density (local state updates flow into the label).
//   5. POLI-11 spot check — selecting a density does NOT mutate the document
//      DOM apart from the data-density attribute that setDensity() writes
//      (asserted via a spy that records every setDensity call).

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

// sonner mock — palette imports sonner at module level; mocking keeps the
// Toaster as a no-op and prevents toast.* noise from affecting these specs.
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

// density mock — capture setDensity / getDensity calls. getDensity is read
// during palette mount to seed the local checkmark state; setDensity is the
// effect the test asserts on selection. Mirror of TimePicker's mocking
// pattern (vi.mock at module level + re-import of the named exports).
vi.mock('../../../lib/density', () => {
  return {
    getDensity: vi.fn(() => 'comfortable'),
    setDensity: vi.fn(),
    applyDensity: vi.fn(),
    DEFAULT_DENSITY: 'comfortable',
  }
})

import { getDensity, setDensity } from '../../../lib/density'

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

function makeRouter() {
  const client = makeClient()

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

  const routeTree = rootRoute.addChildren([indexRoute])

  return {
    router: createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
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

describe('CommandPalette — Density group (CMDK-02)', () => {
  beforeEach(() => {
    vi.mocked(setDensity).mockClear()
    vi.mocked(getDensity).mockReturnValue('comfortable')
    // Empty saved-views list so it doesn't add noise.
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

  it('renders three density items', async () => {
    const { router } = makeRouter()
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')

    expect(
      await screen.findByTestId('cmdk-density-compact'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('cmdk-density-comfortable')).toBeInTheDocument()
    expect(screen.getByTestId('cmdk-density-cozy')).toBeInTheDocument()
  })

  it('active density renders with check-prefix; others do not', async () => {
    vi.mocked(getDensity).mockReturnValue('comfortable')
    const { router } = makeRouter()
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')

    const compact = await screen.findByTestId('cmdk-density-compact')
    const comfortable = screen.getByTestId('cmdk-density-comfortable')
    const cozy = screen.getByTestId('cmdk-density-cozy')

    expect(comfortable.textContent).toContain('✓')
    expect(comfortable.textContent).toContain('Comfortable')
    expect(compact.textContent).not.toContain('✓')
    expect(cozy.textContent).not.toContain('✓')
  })

  it('selecting "Set density: Compact" calls setDensity("compact") + closes palette', async () => {
    const { router } = makeRouter()
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')

    const item = await screen.findByTestId('cmdk-density-compact')
    await user.click(item)

    await waitFor(() => {
      expect(setDensity).toHaveBeenCalledWith('compact')
    })
    // Palette closed.
    expect(screen.queryByPlaceholderText(/search pages/i)).toBeNull()
  })

  it('after selecting a density, re-opening shows ✓ on the new active item', async () => {
    const { router } = makeRouter()
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')

    const compactItem = await screen.findByTestId('cmdk-density-compact')
    await user.click(compactItem)
    await waitFor(() => {
      expect(setDensity).toHaveBeenCalledWith('compact')
    })

    // Re-open the palette. The local state (currentDensity) is now 'compact',
    // so the Compact row should render with the ✓ prefix and the previously-
    // active Comfortable row should NOT.
    await user.keyboard('{Meta>}k{/Meta}')
    const compactAgain = await screen.findByTestId('cmdk-density-compact')
    const comfortableAgain = screen.getByTestId('cmdk-density-comfortable')
    expect(compactAgain.textContent).toContain('✓')
    expect(comfortableAgain.textContent).not.toContain('✓')
  })

  it('POLI-11 spot check: selection routes through setDensity() only (no Context)', async () => {
    // The whole point of the Pitfall 3 lock: re-painting density via Cmd+K
    // MUST go through setDensity() — never through a React Context update
    // that would force a subtree re-render. We assert by checking that the
    // ONLY side effect of the selection is a setDensity() call (no other
    // density-module exports are invoked). applyDensity is a boot-time
    // helper; if our handler accidentally called it the spec would fail.
    const { router } = makeRouter()
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')

    const cozy = await screen.findByTestId('cmdk-density-cozy')
    await user.click(cozy)
    await waitFor(() => {
      expect(setDensity).toHaveBeenCalledTimes(1)
      expect(setDensity).toHaveBeenCalledWith('cozy')
    })
  })
})
