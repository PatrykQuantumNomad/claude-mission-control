import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createRouter,
  RouterProvider,
  createRootRoute,
  createRoute,
  createMemoryHistory,
} from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode, useEffect } from 'react'
import { render, screen, userEvent, waitFor } from '../../../test/utils'
import { CommandPalette } from '../CommandPalette'
import { TaskComposerProvider } from '../../panels/TaskComposer'
import { ActiveSessionProvider, useActiveSession } from '../../shell/ActiveSessionContext'
import { LoadedViewProvider } from '../../savedviews/LoadedViewContext'
import { qk } from '../../../lib/queries'
import type {
  SessionCompareResponse,
  SessionCompareSide,
  SessionListItemFull,
  SessionListResponse,
  SessionPreviousResponse,
} from '../../../lib/api'

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

function makeWrapped(
  client: QueryClient,
  activeSid: string | null = null,
): () => ReactNode {
  return () => (
    <TestWrap client={client}>
      {activeSid !== null ? <ActiveSessionPrimer sid={activeSid} /> : null}
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
  // Phase 23 Plan 02: ActiveSessionProvider wraps the palette so the new
  // "Compare with previous session" visibility gate can read activeSessionId
  // (production wiring in shell/AppShell.tsx). Most existing tests don't
  // exercise this gate; the provider's default activeSessionId=null keeps
  // the new action hidden so legacy assertions still pass.
  // Phase 25 Plan 08: LoadedViewProvider must wrap CommandPalette because
  // the palette now consumes useLoadedView() to wire the saved-views group's
  // post-navigation chrome (SavedViewMenu trigger label etc.). Production
  // mount site is AppShell (shell/AppShell.tsx). Without this provider the
  // palette throws "useLoadedView must be used within LoadedViewProvider".
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

// Test helper: a tiny component that flips the ActiveSessionContext value
// when mounted. Lets tests simulate "the user opened a session detail Sheet"
// without mounting the full LiveSessionsCard. The setter runs in useEffect
// so context state updates land in React's normal commit phase (not during
// render — that would warn).
function ActiveSessionPrimer({ sid }: { sid: string | null }) {
  const { setActiveSessionId } = useActiveSession()
  useEffect(() => {
    setActiveSessionId(sid)
    return () => setActiveSessionId(null)
  }, [sid, setActiveSessionId])
  return null
}

interface RouterOpts {
  initialEntries?: string[]
  client?: QueryClient
  /** Phase 23 Plan 02: when set, mounts an ActiveSessionPrimer that flips
   * useActiveSession().activeSessionId to this value on mount and back to
   * null on unmount. Used by the new "Compare with previous session"
   * visibility tests. */
  activeSid?: string | null
}

function makeRouter(opts: RouterOpts = {}) {
  const client = opts.client ?? makeQueryClient()
  const component = makeWrapped(client, opts.activeSid ?? null)
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
  cwd: string | null = '/work/proj',
  // Phase 27 TDBT-01 — optional 12-char hex sentinel for project_key.
  // Defaults to the "primary" sentinel so existing tests that don't
  // exercise the ComparePicker's project_key filter compile without
  // change. Tests for the new filter behavior pass a distinct value
  // (e.g. 'ffeeddccbbaa') on rows that should be excluded by scope.
  project_key = '0123456789ab',
): SessionListItemFull {
  return {
    session_id,
    started_at: '2026-04-27T08:00:00Z',
    ended_at: null,
    cwd,
    project_key,
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

  // ─── Phase 23 Plan 02 (CMPR-07) — Compare with previous session ──────────

  it('"Compare with previous session" is HIDDEN when no active session id (D-07)', async () => {
    // No ActiveSessionPrimer mounted ⇒ activeSessionId stays null. We are
    // also NOT on /sessions/compare with `a` set, so currentA is undefined.
    // Both visibility sources are absent ⇒ the action MUST NOT render and
    // MUST NOT trigger a /api/sessions/{sid}/previous fetch.
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { router } = makeRouter()
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')
    // Palette open — confirm baseline items are present.
    expect(await screen.findByText('Quick task')).toBeInTheDocument()
    // The compare-with-previous item MUST NOT render.
    expect(
      screen.queryByTestId('cmdk-compare-with-previous'),
    ).toBeNull()
    // No /previous fetch should have fired (the hook is enabled-gated).
    const calledPreviousUrl = fetchSpy.mock.calls.some((call) => {
      const url = call[0]
      return typeof url === 'string' && url.includes('/previous')
    })
    expect(calledPreviousUrl).toBe(false)
  })

  it('"Compare with previous session" is HIDDEN when /previous returns 404 (D-09)', async () => {
    // Active session set → useSessionPrevious fires. Backend returns 404
    // {error:"no previous session"} per D-04 — the hook resolves to null
    // (NOT an error), and the action stays hidden. No error UI surfaces.
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      if (url.includes('/previous')) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'no previous session' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }
      // Default empty session list for the picker hook.
      return Promise.resolve(
        new Response(
          JSON.stringify({ items: [], total: 0, offset: 0, limit: 50 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
    })
    const { router } = makeRouter({ activeSid: UUID_A })
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    // Open palette + wait for the /previous fetch to settle.
    await user.keyboard('{Meta>}k{/Meta}')
    await screen.findByText('Quick task')
    // Wait long enough for the query to resolve to null.
    await waitFor(() => {
      // Compare-with-previous action MUST NOT render after 404 lands.
      expect(
        screen.queryByTestId('cmdk-compare-with-previous'),
      ).toBeNull()
    })
    // No error toast / role=alert should appear from the 404 path.
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('"Compare with previous session" navigates to /sessions/compare with a + b when previous exists (D-08)', async () => {
    // Active session set → useSessionPrevious resolves to {session_id: PREV}.
    // Selecting the action navigates to /sessions/compare with both UUIDs.
    const PREV_SID = UUID_OTHER // pretend previous-of-A is UUID_OTHER
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      if (url.includes('/previous')) {
        const body: SessionPreviousResponse = { session_id: PREV_SID }
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({ items: [], total: 0, offset: 0, limit: 50 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
    })
    const { router } = makeRouter({ activeSid: UUID_A })
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')
    // Wait for the action to appear (visibility gate flips after the 200 lands).
    const action = await screen.findByTestId('cmdk-compare-with-previous')
    expect(action).toHaveTextContent('Compare with previous session')
    await user.click(action)
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/sessions/compare')
      const search = router.state.location.search as Record<string, unknown>
      expect(search.a).toBe(UUID_A)
      expect(search.b).toBe(PREV_SID)
    })
    // Palette should close after navigation.
    expect(screen.queryByPlaceholderText(/search pages/i)).toBeNull()
  })

  // ─── Phase 27 Plan 03 (TDBT-01) — ComparePicker filter by project_key ────
  //
  // The picker filter switched from `row.cwd === scopeCwd` (string-equality
  // proxy) to `row.project_key === scopeProjectKey` (authoritative project
  // identity). These cases lock the two edge-case behaviors the cwd proxy
  // got wrong:
  //   1. Symlink-collapsed cwds — two sessions launched from different
  //      symlinked entry paths whose realpaths converge → same project_key,
  //      different cwd strings. MUST be included by the scoped picker.
  //   2. Byte-equal cwds with distinct realpaths — same cwd string,
  //      different project_key. MUST be excluded by the scoped picker.
  // The compare cache is pre-seeded at qk.sessionCompare(UUID_A, '') because
  // useSessionCompare(currentA, currentB) coerces undefined → '' in the key
  // (queries.ts:402 — qk.sessionCompare(a ?? '', b ?? '')). Seeding that
  // key lets the picker derive aProjectKey without needing a `b` in the URL.

  const SCOPE_PROJECT_KEY = 'aaaaaaaaaaaa'
  const OTHER_PROJECT_KEY = 'ffeeddccbbaa'

  function makeCompareSide(
    overrides: Partial<SessionCompareSide> = {},
  ): SessionCompareSide {
    return {
      session_id: UUID_A,
      started_at: '2026-05-04T10:00:00Z',
      ended_at: null,
      duration_ms: null,
      cwd: '/home/u/proj-a',
      project_key: SCOPE_PROJECT_KEY,
      model: 'sonnet',
      source: 'claude_code',
      outcome: 'ok',
      tokens_input: 100,
      tokens_output: 200,
      tokens_cache_read: 0,
      tokens_cache_create_5m: 0,
      tokens_cache_create_1h: 0,
      tool_call_count: 5,
      message_count: 7,
      cost_usd: '0.01',
      skills_used: [],
      skill_latencies: {},
      over_cap: false,
      tool_counts: {},
      ...overrides,
    }
  }

  function seedCompareCacheForA(client: QueryClient): void {
    // useSessionCompare(UUID_A, undefined) computes the cache key as
    // qk.sessionCompare(UUID_A, '') — see queries.ts:402. Pre-seed that
    // slot so the ComparePicker's aProjectKey derivation resolves
    // without the hook firing a real fetch (enabled=false when b is
    // undefined, so setQueryData is the only way to populate it).
    const fixture: SessionCompareResponse = {
      a: makeCompareSide({
        session_id: UUID_A,
        cwd: '/home/u/proj-a',
        project_key: SCOPE_PROJECT_KEY,
      }),
      // `b` side is unused by the picker scope derivation (it matches by
      // session_id === currentA); shape-complete so the type validates.
      b: makeCompareSide({
        session_id: UUID_OTHER,
        cwd: '/home/u/proj-b',
        project_key: 'cccccccccccc',
      }),
      skill_diff: { shared: [], only_a: [], only_b: [] },
      rates_as_of: null,
      over_cap: false,
      cap: 500,
      low_sample_a: false,
      low_sample_b: false,
    }
    client.setQueryData(qk.sessionCompare(UUID_A, ''), fixture)
  }

  it('TDBT-01: ComparePicker filters candidates by project_key, not cwd (symlink + byte-equal edge cases)', async () => {
    // Three rows construct the two edge cases that motivated the switch:
    //   - sess-a: cwd '/home/u/proj-a', project_key MATCHES → visible.
    //   - sess-b: cwd '/home/u/proj-a' (BYTE-EQUAL to sess-a's cwd) but
    //     project_key DOES NOT match → must be EXCLUDED (cwd proxy would
    //     wrongly include this).
    //   - sess-c: cwd '/home/u/proj-c' (DIFFERENT cwd, e.g. symlink-collapsed
    //     realpath) but project_key MATCHES → must be VISIBLE (cwd proxy
    //     would wrongly exclude this).
    const SID_A = '44444444-4444-4444-8444-444444444444'
    const SID_B = '55555555-5555-4555-8555-555555555555'
    const SID_C = '66666666-6666-4666-8666-666666666666'

    const client = makeQueryClient()
    seedCompareCacheForA(client)
    const seeded: SessionListResponse = {
      items: [
        makeSessionRow(SID_A, '/home/u/proj-a', SCOPE_PROJECT_KEY),
        makeSessionRow(SID_B, '/home/u/proj-a', OTHER_PROJECT_KEY),
        makeSessionRow(SID_C, '/home/u/proj-c', SCOPE_PROJECT_KEY),
      ],
      total: 3,
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
    // Picker Sheet should mount. Wait for the title.
    await waitFor(() => {
      expect(
        screen.getByText('Pick a session to compare'),
      ).toBeInTheDocument()
    })
    // Symlink-collapsed match (different cwd, same project_key) MUST appear.
    expect(
      screen.getByRole('button', { name: `Compare with session ${SID_C}` }),
    ).toBeInTheDocument()
    // Same-cwd row with the matching project_key also visible.
    expect(
      screen.getByRole('button', { name: `Compare with session ${SID_A}` }),
    ).toBeInTheDocument()
    // Byte-equal-cwd row with a DIFFERENT project_key MUST be filtered out.
    expect(
      screen.queryByRole('button', {
        name: `Compare with session ${SID_B}`,
      }),
    ).toBeNull()
  })

  it('TDBT-01: ComparePicker description copy does not leak the 12-char project_key hex', async () => {
    // When the picker scope is active, the description copy must say
    // "the same project" — NOT the raw 12-char hex (which is not user-
    // readable and would expose an internal canonical identifier).
    const SID_A = '77777777-7777-4777-8777-777777777777'
    const client = makeQueryClient()
    seedCompareCacheForA(client)
    const seeded: SessionListResponse = {
      items: [makeSessionRow(SID_A, '/home/u/proj-a', SCOPE_PROJECT_KEY)],
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
    // Wait for the Sheet to mount.
    await waitFor(() => {
      expect(
        screen.getByText('Pick a session to compare'),
      ).toBeInTheDocument()
    })
    // Description copy matches the project-shape-honest phrasing.
    expect(
      screen.getByText(/showing sessions in the same project/i),
    ).toBeInTheDocument()
    // And does NOT contain the raw 12-char hex anywhere on screen.
    expect(screen.queryByText(/aaaaaaaaaaaa/)).toBeNull()
    // The human-readable cwd label IS still rendered on the row (load-
    // bearing precedence: filter switched, display preserved).
    expect(screen.getByText('/home/u/proj-a')).toBeInTheDocument()
  })
})
