// CommandPalette Time range group — Phase 26 Plan 06 (CMDK-03).
//
// Test strategy:
//   - In-memory TanStack Router with /activity (the route most likely to host
//     time_from/time_to in production) and permissive validateSearch so the
//     palette's function-form navigate({ search }) survives the router.
//   - sonner is mocked via vi.mock so toast.* call inspection is trivial —
//     mirrors TimePicker.test.tsx setup.
//   - navigator.clipboard.{readText,writeText} is stubbed per-test via
//     Object.defineProperty for deterministic happy/error paths.
//   - happy-dom doesn't fully model cmdk keyboard filtering; specs open the
//     palette via Cmd+K then click the rendered Command.Item by data-testid.
//
// Specs (6):
//   1. Six items render (4 presets + copy + paste).
//   2. Selecting "Last 7 days" writes time_from=now-7d & time_to=now to URL.
//   3. Copy with no URL time params → toast.error('No time range to copy').
//   4. Copy with valid URL time params → toast.success + clipboard.writeText.
//   5. Paste with valid clipboard payload → toast.message + navigate.
//   6. Paste with invalid clipboard payload → toast.error.

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

// sonner mock — palette's time-range copy/paste handlers invoke toast.*; the
// mock exposes vi.fn() spies so calls can be asserted.
vi.mock('sonner', () => {
  const toast = {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  }
  return {
    toast,
    Toaster: () => null,
  }
})

// Re-import after the mock so the test scope shares the same vi.fn() refs.
import { toast } from 'sonner'

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
    validateSearch: (raw: Record<string, unknown>) => raw,
    component: () => null,
  })
  const activityRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/activity',
    validateSearch: (raw: Record<string, unknown>) => raw,
    component: () => null,
  })

  const routeTree = rootRoute.addChildren([indexRoute, activityRoute])

  return {
    router: createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: opts.initialEntries ?? ['/activity'],
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

describe('CommandPalette — Time range group (CMDK-03)', () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear()
    vi.mocked(toast.error).mockClear()
    vi.mocked(toast.message).mockClear()
    // Empty saved-views list → its group renders the empty state.
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

  it('renders six items: 4 presets + copy + paste', async () => {
    const { router } = makeRouter({})
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')

    await screen.findByTestId('cmdk-time-range-1h')
    expect(screen.getByTestId('cmdk-time-range-1h')).toBeInTheDocument()
    expect(screen.getByTestId('cmdk-time-range-24h')).toBeInTheDocument()
    expect(screen.getByTestId('cmdk-time-range-7d')).toBeInTheDocument()
    expect(screen.getByTestId('cmdk-time-range-30d')).toBeInTheDocument()
    expect(screen.getByTestId('cmdk-time-range-copy')).toBeInTheDocument()
    expect(screen.getByTestId('cmdk-time-range-paste')).toBeInTheDocument()
  })

  it('selecting "Last 7 days" writes time_from=now-7d & time_to=now to URL', async () => {
    const { router } = makeRouter({ initialEntries: ['/activity'] })
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')

    const item = await screen.findByTestId('cmdk-time-range-7d')
    await user.click(item)
    await waitFor(() => {
      const search = router.state.location.search as Record<string, unknown>
      expect(search.time_from).toBe('now-7d')
      expect(search.time_to).toBe('now')
    })
    // Palette closed.
    expect(screen.queryByPlaceholderText(/search pages/i)).toBeNull()
  })

  it('Copy with no URL time params fires toast.error("No time range to copy")', async () => {
    const { router } = makeRouter({ initialEntries: ['/activity'] })
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    // Post-setup clipboard override (see "Copy with valid URL time params" for
    // the user-event/clipboard ordering rationale).
    const writes: string[] = []
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: (text: string) => {
          writes.push(text)
          return Promise.resolve()
        },
        readText: () => Promise.resolve(''),
      },
      configurable: true,
    })
    await user.keyboard('{Meta>}k{/Meta}')

    const item = await screen.findByTestId('cmdk-time-range-copy')
    await user.click(item)
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('No time range to copy')
    })
    expect(writes.length).toBe(0)
  })

  it('Copy with valid URL time params writes clipboard and fires toast.success', async () => {
    const { router } = makeRouter({
      initialEntries: ['/activity?time_from=now-7d&time_to=now'],
    })
    await router.load()
    const user = userEvent.setup() // user-event installs its own clipboard stub
    render(<RouterProvider router={router} />)
    // IMPORTANT: override the clipboard AFTER userEvent.setup() — user-event's
    // attachClipboardStubToView replaces navigator.clipboard with a getter
    // pointing at its own internal stub, so we must redefine the property
    // again to win the override (see @testing-library/user-event
    // utils/dataTransfer/Clipboard.js attachClipboardStubToView).
    const writes: string[] = []
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: (text: string) => {
          writes.push(text)
          return Promise.resolve()
        },
        readText: () => Promise.resolve(''),
      },
      configurable: true,
    })
    await user.keyboard('{Meta>}k{/Meta}')

    const item = await screen.findByTestId('cmdk-time-range-copy')
    await user.click(item)
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Time range copied')
    })
    expect(writes.length).toBeGreaterThan(0)
    expect(writes[0]).toContain('time_from=now-7d')
    expect(writes[0]).toContain('time_to=now')
  })

  it('Paste with valid clipboard navigates and fires toast.message', async () => {
    const { router } = makeRouter({ initialEntries: ['/activity'] })
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    // Post-setup clipboard override (see "Copy with valid URL time params" for
    // the user-event/clipboard ordering rationale).
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: () => Promise.resolve(),
        readText: () => Promise.resolve('?time_from=now-24h&time_to=now'),
      },
      configurable: true,
    })
    await user.keyboard('{Meta>}k{/Meta}')

    const item = await screen.findByTestId('cmdk-time-range-paste')
    await user.click(item)
    await waitFor(() => {
      expect(toast.message).toHaveBeenCalled()
      const search = router.state.location.search as Record<string, unknown>
      expect(search.time_from).toBe('now-24h')
      expect(search.time_to).toBe('now')
    })
  })

  it('Paste with invalid clipboard fires toast.error', async () => {
    const { router } = makeRouter({ initialEntries: ['/activity'] })
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: () => Promise.resolve(),
        readText: () => Promise.resolve('hello world'),
      },
      configurable: true,
    })
    await user.keyboard('{Meta>}k{/Meta}')

    const item = await screen.findByTestId('cmdk-time-range-paste')
    await user.click(item)
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('No time range on clipboard')
    })
  })
})
