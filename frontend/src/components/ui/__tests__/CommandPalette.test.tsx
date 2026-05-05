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
import { qk } from '../../../lib/queries'
import type { SessionListItemFull, SessionListResponse } from '../../../lib/api'

// Render the CommandPalette inside an in-memory TanStack Router so its
// useNavigate() hook resolves. Mirrors the pattern used by AppShell.test.tsx
// (createMemoryHistory + createRoute) — preferred over `createFileRoute` here
// because file-route helpers expect a file-system convention that vitest
// cannot model in-memory.
//
// current: CommandPalette now consumes useTaskComposer() (Quick task
// → opens TaskComposer Sheet via context). Every test wraps the palette in
// TaskComposerProvider + QueryClientProvider — the provider mounts the
// composer Sheet which uses useCreateTask() and therefore needs a QC.
//
// Phase 16 Plan 03 (CMPR-03): the Compare item is context-aware. We need
// `/sessions/compare` route registered with a hand-written validateSearch so
// `useRouterState({ select: (s) => s.location })` inside CommandPalette sees
// `location.search.a` as a real string when the test history starts at
// `/sessions/compare?a=<uuid>`. Without `validateSearch`, the router strips
// unknown search params. Mirrors the production route in
// routes/sessions_.compare.tsx.
const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_OTHER = '22222222-2222-4222-8222-222222222222'
const UUID_PICKER_PRIMARY = '33333333-3333-4333-8333-333333333333'

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
}

function makeWrapped(client: QueryClient): () => ReactNode {
  return () => (
    <TestWrap client={client}>
      <CommandPalette />
    </TestWrap>
  )
}

function TestWrap({
  client,
  children,
}: {
  client: QueryClient
  children: ReactNode
}) {
  return (
    <QueryClientProvider client={client}>
      <TaskComposerProvider>{children}</TaskComposerProvider>
    </QueryClientProvider>
  )
}

interface RouterOpts {
  initialEntries?: string[]
  client?: QueryClient
}

function makeRouter(opts: RouterOpts = {}) {
  const client = opts.client ?? makeQueryClient()
  const component = makeWrapped(client)
  const rootRoute = createRootRoute({ component })
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
  // Mirror the production validateSearch UUID validator from
  // routes/sessions_.compare.tsx so the test router preserves `?a=<uuid>`
  // for `useRouterState({ select: (s) => s.location })` to read.
  const UUID_RE =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
  type CompareSearch = { a?: string; b?: string }
  function validateSearch(raw: Record<string, unknown>): CompareSearch {
    const a =
      typeof raw.a === 'string' && UUID_RE.test(raw.a) ? raw.a : undefined
    const b =
      typeof raw.b === 'string' && UUID_RE.test(raw.b) ? raw.b : undefined
    return { a, b }
  }
  const compareRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/sessions/compare',
    validateSearch,
    component: () => null,
  })
  const routeTree = rootRoute.addChildren([
    indexRoute,
    activityRoute,
    skillsRoute,
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

function makeSessionRow(
  session_id: string,
  cwd = '/work/proj',
): SessionListItemFull {
  return {
    session_id,
    started_at: '2026-04-27T08:00:00Z',
    ended_at: null,
    cwd,
    model: 'sonnet',
    source: 'claude_code',
    outcome: null,
    tokens_input: 100,
    tokens_output: 200,
    tokens_cache_read: 0,
    tokens_cache_create: 0,
    tool_call_count: 5,
    message_count: 7,
  }
}

describe('CommandPalette', () => {
  beforeEach(() => {
    // CommandPalette mounts useSessionsList for the Compare picker. Without a
    // fetch mock the picker's background refetch hits the real network and
    // pollutes the test output with ECONNREFUSED errors. Mock with an empty
    // page; tests that need rows seed via client.setQueryData and the cached
    // value wins over the mocked fetch result.
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

  it('does not show input until Cmd+K pressed', async () => {
    const { router } = makeRouter()
    await router.load()
    const { queryByPlaceholderText } = render(<RouterProvider router={router} />)
    expect(queryByPlaceholderText(/search pages/i)).toBeNull()
  })

  it('opens on Cmd+K and shows the 3 page items + Quick task', async () => {
    const user = userEvent.setup()
    const { router } = makeRouter()
    await router.load()
    const { findByPlaceholderText, findByText } = render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')
    expect(await findByPlaceholderText(/search pages/i)).toBeInTheDocument()
    expect(await findByText('Command')).toBeInTheDocument()
    expect(await findByText('Activity')).toBeInTheDocument()
    expect(await findByText('Skills')).toBeInTheDocument()
    expect(await findByText('Quick task')).toBeInTheDocument()
  })

  it('also opens on Ctrl+K (Linux/Windows binding)', async () => {
    const user = userEvent.setup()
    const { router } = makeRouter()
    await router.load()
    const { findByPlaceholderText } = render(<RouterProvider router={router} />)
    await user.keyboard('{Control>}k{/Control}')
    expect(await findByPlaceholderText(/search pages/i)).toBeInTheDocument()
  })

  it('closes on Esc', async () => {
    const user = userEvent.setup()
    const { router } = makeRouter()
    await router.load()
    const { queryByPlaceholderText, findByPlaceholderText } = render(
      <RouterProvider router={router} />,
    )
    await user.keyboard('{Meta>}k{/Meta}')
    expect(await findByPlaceholderText(/search pages/i)).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(queryByPlaceholderText(/search pages/i)).toBeNull()
  })

  it('shows empty-state copy when search yields no matches', async () => {
    const user = userEvent.setup()
    const { router } = makeRouter()
    await router.load()
    const { findByPlaceholderText, findByText } = render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')
    const input = await findByPlaceholderText(/search pages/i)
    await user.type(input, 'zzzzznoresults')
    expect(await findByText(/No matches/i)).toBeInTheDocument()
  })

  it('selecting "Quick task" opens TaskComposer (Sheet visible) and closes the palette', async () => {
    // current wiring — selecting the Quick task item flips
    // composerOpen=true via the TaskComposerProvider context that wraps every
    // test (see TestWrap above) AND closes the palette in one click.
    const { router } = makeRouter()
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    // Open the palette
    await user.keyboard('{Meta>}k{/Meta}')
    const quickTask = await screen.findByText('Quick task')
    await user.click(quickTask)
    // The TaskComposer Sheet (Radix Dialog) should now be visible. Sheet uses
    // role="dialog" and renders its title 'New task' inside the portal.
    await waitFor(() => {
      expect(screen.getByText('New task')).toBeInTheDocument()
    })
    // Palette is closed (Search input gone)
    expect(screen.queryByPlaceholderText(/search pages/i)).toBeNull()
  })

  // ─── Phase 16 Plan 03 (CMPR-03) — context-aware Compare item ─────────────

  it('shows "Compare sessions" label by default and clicking navigates to /sessions/compare', async () => {
    // No current `a` in URL → label is "Compare sessions" (decision §1 default
    // case). Click must set the router location to /sessions/compare.
    const { router } = makeRouter()
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')
    const compareItem = await screen.findByText('Compare sessions')
    expect(compareItem).toBeInTheDocument()
    await user.click(compareItem)
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/sessions/compare')
    })
    // Palette is closed.
    expect(screen.queryByPlaceholderText(/search pages/i)).toBeNull()
  })

  it('shows "Compare with…" label when on /sessions/compare?a={uuid} and clicking opens the picker Sheet', async () => {
    // Initial entry already on the compare route with `a` set → context-aware
    // branch (decision §1 case 2). Clicking opens the picker Sheet.
    const client = makeQueryClient()
    // Pre-seed the recent-sessions cache so the picker renders rows
    // synchronously without waiting for a fetch.
    const seeded: SessionListResponse = {
      items: [makeSessionRow(UUID_PICKER_PRIMARY, '/work/proj-1')],
      total: 1,
      offset: 0,
      limit: 50,
    }
    client.setQueryData(qk.sessionsList({ range: '7d', limit: 50 }), seeded)
    const { router } = makeRouter({
      client,
      initialEntries: [`/sessions/compare?a=${UUID_A}`],
    })
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')
    const compareItem = await screen.findByText('Compare with…')
    expect(compareItem).toBeInTheDocument()
    await user.click(compareItem)
    // Sheet title should now be visible (Radix Dialog mounts in a portal,
    // mounting is async — wait for it).
    await waitFor(() => {
      expect(
        screen.getByText('Pick a session to compare'),
      ).toBeInTheDocument()
    })
  })

  it('picker selection navigates to /sessions/compare with `b` set via function-form search update', async () => {
    // Open the palette → click "Compare with…" → click a row in the picker.
    // Expectation: router location.search.b === chosenSid (Pitfall 4 function
    // form `(prev) => ({ ...prev, b })` — function-form is the documented
    // TanStack Router idiom that survives the stale-closure render loop).
    const client = makeQueryClient()
    const seeded: SessionListResponse = {
      items: [makeSessionRow(UUID_PICKER_PRIMARY, '/work/proj-1')],
      total: 1,
      offset: 0,
      limit: 50,
    }
    client.setQueryData(qk.sessionsList({ range: '7d', limit: 50 }), seeded)
    const { router } = makeRouter({
      client,
      initialEntries: [`/sessions/compare?a=${UUID_A}`],
    })
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')
    await user.click(await screen.findByText('Compare with…'))
    // Click the picker row (it renders inside the Sheet portal; user-event
    // can still target by aria-label).
    const pickerButton = await screen.findByRole('button', {
      name: `Compare with session ${UUID_PICKER_PRIMARY}`,
    })
    await user.click(pickerButton)
    await waitFor(() => {
      const search = router.state.location.search as Record<string, unknown>
      expect(search.a).toBe(UUID_A)
      expect(search.b).toBe(UUID_PICKER_PRIMARY)
    })
  })

  it('picker disables the row whose session_id equals the current `a` (self-compare guard)', async () => {
    // When a row in the recent-sessions list IS the current side A, the
    // picker button must be `disabled`. Defensive — backend already 400s on
    // a==b per Plan 16-01, but the UI shouldn't even allow the click.
    const client = makeQueryClient()
    const seeded: SessionListResponse = {
      items: [
        makeSessionRow(UUID_A, '/work/self'),
        makeSessionRow(UUID_OTHER, '/work/other'),
      ],
      total: 2,
      offset: 0,
      limit: 50,
    }
    client.setQueryData(qk.sessionsList({ range: '7d', limit: 50 }), seeded)
    const { router } = makeRouter({
      client,
      initialEntries: [`/sessions/compare?a=${UUID_A}`],
    })
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')
    await user.click(await screen.findByText('Compare with…'))
    const selfButton = (await screen.findByRole('button', {
      name: `Compare with session ${UUID_A}`,
    })) as HTMLButtonElement
    const otherButton = (await screen.findByRole('button', {
      name: `Compare with session ${UUID_OTHER}`,
    })) as HTMLButtonElement
    expect(selfButton.disabled).toBe(true)
    expect(otherButton.disabled).toBe(false)
  })

  it('shows "Pick a different session B" label when both `a` and `b` are set', async () => {
    // Both sides set → label is the third branch (decision §1 case 3).
    const { router } = makeRouter({
      initialEntries: [`/sessions/compare?a=${UUID_A}&b=${UUID_OTHER}`],
    })
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')
    expect(
      await screen.findByText('Pick a different session B'),
    ).toBeInTheDocument()
  })
})
