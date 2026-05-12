// EditOrForkDialog — Phase 25 Plan 07 (VIEW-07).
//
// Test strategy:
//   - In-memory TanStack Router with permissive validateSearch so the test
//     can seed location.search (the current URL state). The view's state_json
//     deliberately differs from the URL — that divergence is the precondition
//     for the dialog being meaningful.
//   - PrimeLoadedView (same pattern as UnsavedPip.test.tsx) flips
//     setLoadedView(v) on mount so the dialog renders against a loaded view
//     without standing up the full save flow.
//   - Real QueryClient + URL-routed fetch stub for PATCH /api/views/:id (the
//     usePatchView mutation) — mirrors the SaveViewDialog test pattern.
//
// Behaviour exercised (covers each of the 3 branches + 2 guards = 5 specs):
//   1. Renders nothing when no loaded view (the self-defensive guard).
//   2. Renders all three buttons when a loaded view is present.
//   3. "Save changes" issues PATCH /api/views/:id with state_json = currentSearch
//      and closes the dialog on success — this is the only mutation branch.
//   4. "Save as new (fork)" calls onFork prop AND closes the dialog — no
//      mutation, no navigation. The caller handles fork-mode delegation.
//   5. "Discard changes" calls useNavigate({ to: pathname, search: state_json })
//      AND closes the dialog — the URL reverts to the loaded view's state.
//
// These 5 specs are the regression net for VIEW-07: each branch has a
// distinct, observable side effect — there is NO branch that silently does
// nothing OR silently overwrites the loaded view.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createRouter,
  RouterProvider,
  createRootRoute,
  createRoute,
  createMemoryHistory,
} from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { render, screen, userEvent, waitFor } from '../../../test/utils'
import { EditOrForkDialog } from '../EditOrForkDialog'
import { LoadedViewProvider, useLoadedView } from '../LoadedViewContext'
import type { SavedView } from '../../../lib/api'

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
}

/** Flips setLoadedView(v) on mount so the dialog renders against a loaded
 * view. Same pattern as UnsavedPip.test.tsx — keeps the seam tight. */
function PrimeLoadedView({ view }: { view: SavedView | null }) {
  const { setLoadedView } = useLoadedView()
  useEffect(() => {
    setLoadedView(view)
  }, [view, setLoadedView])
  return null
}

interface HarnessProps {
  view: SavedView | null
  onFork?: () => void
  initialEntries?: string[]
  initialOpen?: boolean
}

function Harness({
  view,
  onFork = () => {},
  initialOpen = true,
}: Omit<HarnessProps, 'initialEntries'>) {
  const [open, setOpen] = useState(initialOpen)
  return (
    <LoadedViewProvider>
      <PrimeLoadedView view={view} />
      <EditOrForkDialog
        open={open}
        onOpenChange={setOpen}
        onFork={onFork}
        currentPathname="/"
      />
    </LoadedViewProvider>
  )
}

function makeRouter(props: HarnessProps) {
  const rootRoute = createRootRoute({
    component: () => (
      <Harness
        view={props.view}
        onFork={props.onFork}
        initialOpen={props.initialOpen}
      />
    ),
  })
  // Index route with a permissive validateSearch so each test can seed
  // location.search.range; the dialog reads it via useRouterState.
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: (raw: Record<string, unknown>) => {
      const range = typeof raw.range === 'string' ? raw.range : undefined
      const schemaVersion =
        typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 1
      return { schemaVersion, ...(range ? { range } : {}) }
    },
    component: () => null,
  })
  const routeTree = rootRoute.addChildren([indexRoute])
  return createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: props.initialEntries ?? ['/?range=7d'],
    }),
  })
}

async function renderDialog(props: HarnessProps) {
  const router = makeRouter(props)
  await router.load()
  const result = render(
    <QueryClientProvider client={makeClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ...result, router }
}

function makeView(overrides: Partial<SavedView> = {}): SavedView {
  return {
    id: 42,
    name: 'My loaded view',
    description: '',
    route: '/',
    // state_json differs from the URL (range=30d vs URL range=7d) — this is
    // the divergence precondition. Discard must restore range=30d.
    state_json: { schemaVersion: 1, range: '30d' },
    schema_version: 1,
    created_at: '2026-05-12T00:00:00Z',
    updated_at: '2026-05-12T00:00:00Z',
    ...overrides,
  }
}

describe('EditOrForkDialog', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = typeof input === 'string' ? input : input.toString()
        // PATCH /api/views/:id → echo back the updated view with the new
        // state_json (mirrors backend behavior).
        if (url.match(/\/api\/views\/\d+/) && init?.method === 'PATCH') {
          const body = JSON.parse((init.body as string) ?? '{}')
          return new Response(
            JSON.stringify({
              id: 42,
              name: 'My loaded view',
              description: '',
              route: '/',
              state_json: body.state_json ?? {},
              schema_version: body.schema_version ?? 1,
              created_at: '2026-05-12T00:00:00Z',
              updated_at: '2026-05-12T00:00:01Z',
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
        // Any other fetch returns an empty list — none of these specs care.
        return new Response(JSON.stringify({ items: [], total: 0 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing when no loaded view (self-defensive guard)', async () => {
    await renderDialog({ view: null })
    await waitFor(() => {
      expect(screen.queryByTestId('edit-or-fork-dialog')).toBeNull()
    })
  })

  it('renders all three buttons when a loaded view is present', async () => {
    await renderDialog({ view: makeView() })
    expect(await screen.findByTestId('edit-or-fork-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('edit-or-fork-dialog-save')).toBeInTheDocument()
    expect(screen.getByTestId('edit-or-fork-dialog-fork')).toBeInTheDocument()
    expect(
      screen.getByTestId('edit-or-fork-dialog-discard'),
    ).toBeInTheDocument()
    // The save button label should reference the loaded view by name.
    expect(
      screen.getByTestId('edit-or-fork-dialog-save').textContent,
    ).toMatch(/Save changes to "My loaded view"/)
  })

  it('"Save changes" PATCHes /api/views/:id with current search and closes the dialog', async () => {
    await renderDialog({ view: makeView() })
    const user = userEvent.setup()
    const saveBtn = await screen.findByTestId('edit-or-fork-dialog-save')
    await user.click(saveBtn)

    // PATCH was issued with the current URL search (range=7d) — NOT the
    // loaded view's stale state_json. This is what proves we send the
    // user's modifications to the backend.
    await waitFor(() => {
      const patchCalls = fetchSpy.mock.calls.filter(
        (call: unknown[]) =>
          (call[1] as RequestInit | undefined)?.method === 'PATCH',
      )
      expect(patchCalls.length).toBeGreaterThan(0)
      const lastCall = patchCalls[patchCalls.length - 1]
      const [callUrl, init] = lastCall as [string, RequestInit]
      expect(callUrl).toContain('/api/views/42')
      const body = JSON.parse((init.body as string) ?? '{}')
      expect(body.state_json).toMatchObject({ range: '7d' })
      expect(body.schema_version).toBe(1)
    })
    // After PATCH resolves, onOpenChange(false) must run — dialog gone.
    await waitFor(() => {
      expect(screen.queryByTestId('edit-or-fork-dialog')).toBeNull()
    })
  })

  it('"Save as new (fork)" calls onFork prop and closes the dialog (no mutation, no navigation)', async () => {
    const onFork = vi.fn()
    await renderDialog({ view: makeView(), onFork })
    const user = userEvent.setup()
    const forkBtn = await screen.findByTestId('edit-or-fork-dialog-fork')
    await user.click(forkBtn)

    await waitFor(() => {
      expect(onFork).toHaveBeenCalledTimes(1)
    })
    // Dialog closes.
    await waitFor(() => {
      expect(screen.queryByTestId('edit-or-fork-dialog')).toBeNull()
    })
    // NO PATCH was issued — fork is purely a delegation to the caller.
    const patchCalls = fetchSpy.mock.calls.filter(
      (call: unknown[]) =>
        (call[1] as RequestInit | undefined)?.method === 'PATCH',
    )
    expect(patchCalls.length).toBe(0)
  })

  it('"Discard changes" navigates back to loaded view state_json and closes the dialog', async () => {
    const { router } = await renderDialog({ view: makeView() })
    const user = userEvent.setup()
    const discardBtn = await screen.findByTestId('edit-or-fork-dialog-discard')
    await user.click(discardBtn)

    // Router URL should now reflect the loaded view's state_json (range=30d).
    await waitFor(() => {
      const search = router.state.location.search as Record<string, unknown>
      expect(search.range).toBe('30d')
    })
    // Dialog closes.
    await waitFor(() => {
      expect(screen.queryByTestId('edit-or-fork-dialog')).toBeNull()
    })
    // No PATCH (discard is a read-side action, not a mutation).
    const patchCalls = fetchSpy.mock.calls.filter(
      (call: unknown[]) =>
        (call[1] as RequestInit | undefined)?.method === 'PATCH',
    )
    expect(patchCalls.length).toBe(0)
  })
})
