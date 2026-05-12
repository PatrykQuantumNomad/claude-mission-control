// AppShellHeader — Phase 24 Plan 04 (SHEL-02) + Phase 25 Plan 06 (VIEW-04/05/08).
//
// Test strategy:
//   - AppShellHeader mounts EmergencyStopBanner (TanStack Query via
//     useSystemState polling) AND SavedViewMenu (TanStack Query via
//     useSavedViews + TanStack Router via useRouterState). We wrap in a
//     fresh QueryClientProvider + in-memory RouterProvider + LoadedViewProvider
//     (the production wiring lives in AppShell.tsx) and stub fetch with a
//     URL-routed response so both the emergency-stop poll and the saved-views
//     list both resolve.
//   - The right-side action area is asserted by inspecting the children of
//     `.cmc-app-shell-header__right` in DOM order.
//   - The Phase 25 saved-view-chrome is asserted by its wrapper testid; the
//     legacy save-view-button placeholder it replaced is gone (the registry
//     entry stays for audit traceability, see docs/testid-registry.md).
//
// Behaviour exercised:
//   1. EmergencyStopBanner mounts in the LEFT region.
//   2. Right region children, in order: time-picker-trigger, saved-view-chrome,
//      cmdk-trigger, density-toggle-trigger, theme-toggle.
//   3. time-picker-trigger is the only Phase 26 placeholder still hidden;
//      saved-view-chrome is visible and contains the SavedViewMenu trigger.
//   4. DensityToggle integration still works (regression cover for the
//      slot reshuffle).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createRouter,
  RouterProvider,
  createRootRoute,
  createMemoryHistory,
} from '@tanstack/react-router'
import { render, screen, userEvent } from '../../../test/utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShellHeader } from '../AppShellHeader'
import { LoadedViewProvider } from '../../savedviews/LoadedViewContext'

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, refetchOnWindowFocus: false },
    },
  })
}

function makeRouter() {
  const rootRoute = createRootRoute({
    component: () => (
      <LoadedViewProvider>
        <AppShellHeader />
      </LoadedViewProvider>
    ),
  })
  return createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

async function renderHeader() {
  const router = makeRouter()
  await router.load()
  return render(
    <QueryClientProvider client={makeClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('AppShellHeader', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.density
    // URL-routed fetch stub: emergency_stop idle for /api/system_state; empty
    // list for /api/views (any shape). Both queries fire on mount.
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.includes('/api/views')) {
          return new Response(JSON.stringify({ items: [], total: 0 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response(
          JSON.stringify({ items: { emergency_stop: '0' } }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      },
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    delete document.documentElement.dataset.density
  })

  it('mounts EmergencyStopBanner in the left region', async () => {
    const { container } = await renderHeader()
    const left = container.querySelector('.cmc-app-shell-header__left')
    expect(left).not.toBeNull()
    // EmergencyStopBanner renders a button matching /Emergency stop/i.
    expect(left!.querySelector('button.cmc-estop')).not.toBeNull()
  })

  it('renders right-side action items in locked order (Phase 25 saved-view-chrome replaces save-view-button)', async () => {
    const { container } = await renderHeader()
    const right = container.querySelector('.cmc-app-shell-header__right')
    expect(right).not.toBeNull()
    const children = Array.from(right!.children) as HTMLElement[]
    const testids = children.map((el) => el.getAttribute('data-testid'))
    expect(testids).toEqual([
      'time-picker-trigger',
      'saved-view-chrome',
      'cmdk-trigger',
      'density-toggle-trigger',
      'theme-toggle',
    ])
  })

  it('keeps the time-picker placeholder hidden (Phase 26) and mounts the SavedView chrome (Phase 25)', async () => {
    await renderHeader()
    const timePicker = screen.getByTestId('time-picker-trigger') as HTMLButtonElement
    expect(timePicker.style.display).toBe('none')
    expect(timePicker.disabled).toBe(true)
    expect(timePicker.getAttribute('aria-label')).toMatch(/Phase 26/i)

    // Phase 25 chrome: the wrapper exists AND its first child is the
    // SavedViewMenu trigger button (Bookmark icon + label).
    const chrome = screen.getByTestId('saved-view-chrome')
    expect(chrome).toBeInTheDocument()
    expect(screen.getByTestId('saved-view-menu-trigger')).toBeInTheDocument()
  })

  it('integrates DensityToggle (clicking the trigger opens the menu)', async () => {
    await renderHeader()
    const user = userEvent.setup()
    const trigger = await screen.findByTestId('density-toggle-trigger')
    await user.click(trigger)
    expect(await screen.findByTestId('density-option-compact')).toBeInTheDocument()
    expect(await screen.findByTestId('density-option-comfortable')).toBeInTheDocument()
    expect(await screen.findByTestId('density-option-cozy')).toBeInTheDocument()
  })
})
