// SavedViewMenu — Phase 25 Plan 06 (VIEW-04 / VIEW-05).
//
// Test strategy:
//   - Real QueryClient + URL-routed fetch stub (matches AppShellHeader.test.tsx
//     pattern). No vi.mock on the queries module — the production hook +
//     real cache invalidation paths exercise.
//   - In-memory TanStack Router so useNavigate + useRouterState resolve.
//   - LoadedViewProvider wraps every render so useLoadedView() satisfies its
//     non-null context guard.
//
// Behaviour exercised:
//   1. Trigger renders with "Views" label when nothing is loaded.
//   2. Empty-state copy renders when the route has no saved views.
//   3. Items from /api/views render with their per-view testids.
//   4. Clicking the top-of-menu "Save current view…" opens SaveViewDialog
//      (asserted by the Dialog's data-testid presence).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createRouter,
  RouterProvider,
  createRootRoute,
  createMemoryHistory,
} from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, userEvent, waitFor } from '../../../test/utils'
import { SavedViewMenu } from '../SavedViewMenu'
import { LoadedViewProvider } from '../LoadedViewContext'

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
}

function makeRouter() {
  const rootRoute = createRootRoute({
    component: () => (
      <LoadedViewProvider>
        <SavedViewMenu />
      </LoadedViewProvider>
    ),
  })
  return createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

async function renderMenu() {
  const router = makeRouter()
  await router.load()
  return render(
    <QueryClientProvider client={makeClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

let mockViewsResponse: unknown = { items: [], total: 0 }

describe('SavedViewMenu', () => {
  beforeEach(() => {
    mockViewsResponse = { items: [], total: 0 }
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify(mockViewsResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders trigger with default label "Views" when no loaded view', async () => {
    await renderMenu()
    const trigger = await screen.findByTestId('saved-view-menu-trigger')
    expect(trigger).toBeInTheDocument()
    expect(trigger.textContent).toContain('Views')
    // aria-label has no view-name suffix when nothing loaded.
    expect(trigger.getAttribute('aria-label')).toBe('Saved views')
  })

  it('shows empty-state copy when route has no saved views', async () => {
    await renderMenu()
    const user = userEvent.setup()
    const trigger = await screen.findByTestId('saved-view-menu-trigger')
    await user.click(trigger)
    // Empty-state lives inside the portal-mounted DropdownMenu.Content.
    expect(
      await screen.findByText(/no saved views for this route/i),
    ).toBeInTheDocument()
  })

  it('lists views from /api/views with per-view testids', async () => {
    mockViewsResponse = {
      items: [
        {
          id: 1,
          name: 'Last 7 days CLI',
          description: '',
          route: '/',
          state_json: { schemaVersion: 1, range: '7d' },
          schema_version: 1,
          created_at: '2026-05-12T00:00:00Z',
          updated_at: '2026-05-12T00:00:00Z',
        },
        {
          id: 2,
          name: 'GPT only',
          description: '',
          route: '/',
          state_json: { schemaVersion: 1 },
          schema_version: 1,
          created_at: '2026-05-12T00:00:00Z',
          updated_at: '2026-05-12T00:00:00Z',
        },
      ],
      total: 2,
    }
    await renderMenu()
    const user = userEvent.setup()
    const trigger = await screen.findByTestId('saved-view-menu-trigger')
    await user.click(trigger)

    expect(await screen.findByTestId('saved-view-item-1')).toBeInTheDocument()
    expect(await screen.findByTestId('saved-view-item-2')).toBeInTheDocument()
    expect(screen.getByText('Last 7 days CLI')).toBeInTheDocument()
    expect(screen.getByText('GPT only')).toBeInTheDocument()
  })

  it('opens SaveViewDialog when "Save current view…" is clicked', async () => {
    await renderMenu()
    const user = userEvent.setup()
    const trigger = await screen.findByTestId('saved-view-menu-trigger')
    await user.click(trigger)

    const saveNew = await screen.findByTestId('saved-view-menu-save-new')
    await user.click(saveNew)

    // SaveViewDialog renders into a Radix Portal under document.body.
    await waitFor(() => {
      expect(screen.queryByTestId('save-view-dialog')).toBeInTheDocument()
    })
  })
})
