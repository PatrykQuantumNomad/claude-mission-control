// SaveViewDialog — Phase 25 Plan 06 (VIEW-05).
//
// Test strategy:
//   - Real QueryClient + URL-routed fetch stub (matches SavedViewMenu pattern).
//   - In-memory TanStack Router so useRouterState resolves with a known
//     location.search shape we can pin in the create-payload assertion.
//   - LoadedViewProvider wraps every render so useLoadedView() resolves.
//
// Behaviour exercised:
//   1. Title reads "Save current view" when not in fork mode.
//   2. Title reads "Save as new view" when fork prop is provided AND the
//      name input pre-fills with "{fork.name} (copy)".
//   3. Submit button is disabled when name is empty.
//   4. Submitting issues POST /api/views with the current search + entered
//      name (assert by inspecting the fetch mock's last call).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createRouter,
  RouterProvider,
  createRootRoute,
  createRoute,
  createMemoryHistory,
} from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { render, screen, userEvent, waitFor } from '../../../test/utils'
import { SaveViewDialog } from '../SaveViewDialog'
import { LoadedViewProvider } from '../LoadedViewContext'
import type { SavedView } from '../../../lib/api'

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
}

interface HarnessProps {
  fork?: SavedView | null
  initialOpen?: boolean
  initialEntries?: string[]
}

function Harness({ fork = null, initialOpen = true }: Omit<HarnessProps, 'initialEntries'>) {
  const [open, setOpen] = useState(initialOpen)
  return (
    <LoadedViewProvider>
      <SaveViewDialog
        open={open}
        onOpenChange={setOpen}
        fork={fork}
        currentRoute="/"
      />
    </LoadedViewProvider>
  )
}

function makeRouter(props: HarnessProps) {
  const rootRoute = createRootRoute({
    component: () => <Harness fork={props.fork} initialOpen={props.initialOpen} />,
  })
  // index route with a permissive validateSearch so the test can seed
  // location.search.range and the dialog reads it via useRouterState.
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

async function renderDialog(props: HarnessProps = {}) {
  const router = makeRouter(props)
  await router.load()
  const result = render(
    <QueryClientProvider client={makeClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return result
}

const SAMPLE_FORK: SavedView = {
  id: 99,
  name: 'My current view',
  description: 'Existing description',
  route: '/',
  state_json: { schemaVersion: 1, range: '30d' },
  schema_version: 1,
  created_at: '2026-05-12T00:00:00Z',
  updated_at: '2026-05-12T00:00:00Z',
}

describe('SaveViewDialog', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = typeof input === 'string' ? input : input.toString()
        // POST /api/views returns the created row echo-style.
        if (url.includes('/api/views') && init?.method === 'POST') {
          const body = JSON.parse((init.body as string) ?? '{}')
          return new Response(
            JSON.stringify({
              id: 123,
              name: body.name,
              description: body.description ?? '',
              route: body.route,
              state_json: body.state_json ?? {},
              schema_version: body.schema_version ?? 1,
              created_at: '2026-05-12T00:00:00Z',
              updated_at: '2026-05-12T00:00:00Z',
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
        // GET /api/views returns empty list.
        return new Response(JSON.stringify({ items: [], total: 0 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders title "Save current view" when not in fork mode', async () => {
    await renderDialog({ fork: null })
    expect(await screen.findByTestId('save-view-dialog')).toBeInTheDocument()
    expect(screen.getByText('Save current view')).toBeInTheDocument()
  })

  it('renders title "Save as new view" + pre-fills "(copy)" name when fork prop is provided', async () => {
    await renderDialog({ fork: SAMPLE_FORK })
    expect(await screen.findByTestId('save-view-dialog')).toBeInTheDocument()
    expect(screen.getByText('Save as new view')).toBeInTheDocument()
    const nameInput = screen.getByTestId(
      'save-view-dialog-name-input',
    ) as HTMLInputElement
    await waitFor(() => {
      expect(nameInput.value).toBe('My current view (copy)')
    })
  })

  it('disables submit when name is empty', async () => {
    await renderDialog({ fork: null })
    const submit = (await screen.findByTestId(
      'save-view-dialog-submit',
    )) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
  })

  it('POSTs current URL search + entered name to /api/views on submit', async () => {
    await renderDialog({ fork: null })
    const user = userEvent.setup()

    const nameInput = (await screen.findByTestId(
      'save-view-dialog-name-input',
    )) as HTMLInputElement
    await user.type(nameInput, 'My new view')

    const submit = (await screen.findByTestId(
      'save-view-dialog-submit',
    )) as HTMLButtonElement
    expect(submit.disabled).toBe(false)
    await user.click(submit)

    await waitFor(() => {
      // POST request was issued.
      const postCalls = fetchSpy.mock.calls.filter(
        (call: unknown[]) =>
          (call[1] as RequestInit | undefined)?.method === 'POST',
      )
      expect(postCalls.length).toBeGreaterThan(0)
      const lastCall = postCalls[postCalls.length - 1]
      const init = lastCall[1] as RequestInit
      const body = JSON.parse((init.body as string) ?? '{}')
      expect(body.name).toBe('My new view')
      expect(body.route).toBe('/')
      // state_json captured from useRouterState (initialEntries: /?range=7d).
      expect(body.state_json).toMatchObject({ range: '7d' })
    })
  })
})
