// PanelHeaderMenu — Phase 28 Plan 28-03 (LAYO-01 + LAYO-04).
//
// Test strategy:
//   - In-memory TanStack Router so useRouterState resolves a known pathname
//     (`/`) and the production `normalizeRouteId` produces the testid slug
//     `home` for the panel-reset-layout-{route} testid (matches the
//     SavedViewMenu Phase 28-02 test harness).
//   - useLayoutState is NOT mocked — instead the production hook is exercised
//     via the real router so we can assert on the resulting URL search
//     transitions (setHidden writes hidden_panels; reset clears the three
//     layout keys while preserving time_from/time_to/compare_panels).
//   - sonner is mocked at module scope (Phase 26 TimePicker / Phase 28 Plan 02
//     SavedViewMenu precedent) so toast.success calls are inspectable.
//
// Behaviour exercised (4 assertions per the plan's <behavior> block + 1 for
// LAYO-04 SC#3 preservation of non-layout params):
//   1. Trigger renders with data-testid="panel-header-menu-{panelId}".
//   2. Clicking the trigger opens the Radix DropdownMenu (Portal mount under
//      document.body; both menu items present).
//   3. Clicking the Hide item writes hidden_panels=<panelId> to the URL via
//      the useLayoutState bridge.
//   4. Clicking the Reset item invokes reset() (URL drops the three layout
//      keys) AND fires sonner toast.success('Layout reset').
//   5. Reset preserves time_from/time_to/compare_panels (LAYO-04 SC#3 +
//      Pitfall 11) — proves the hook's destructuring-delete pattern is
//      wired correctly through the menu surface.

import { describe, it, expect, beforeEach, vi } from 'vitest'

// sonner mock — hoisted ABOVE the PanelHeaderMenu import so the production
// module picks up the mocked toast (Phase 26 TimePicker precedent).
vi.mock('sonner', () => {
  const toast = {
    success: vi.fn((_msg?: unknown) => undefined),
    error: vi.fn((_msg?: unknown) => undefined),
    message: vi.fn((_msg?: unknown) => undefined),
  }
  return {
    toast,
    Toaster: () => null,
  }
})

import { toast } from 'sonner'
import {
  createRouter,
  RouterProvider,
  createRootRoute,
  createMemoryHistory,
} from '@tanstack/react-router'
import { render, screen, userEvent, waitFor } from '../../../test/utils'
import { PanelHeaderMenu } from '../PanelHeaderMenu'

function makeRouter(initialUrl: string) {
  const rootRoute = createRootRoute({
    component: () => (
      <PanelHeaderMenu panelId="token-usage" label="Token usage" />
    ),
  })
  return createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: [initialUrl] }),
  })
}

async function renderMenu(initialUrl = '/') {
  const router = makeRouter(initialUrl)
  await router.load()
  render(<RouterProvider router={router} />)
  return router
}

describe('PanelHeaderMenu (Phase 28 Plan 28-03 — LAYO-01 + LAYO-04)', () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear()
  })

  it('renders DropdownMenu.Trigger with data-testid="panel-header-menu-{panelId}"', async () => {
    await renderMenu()
    const trigger = await screen.findByTestId('panel-header-menu-token-usage')
    expect(trigger).toBeInTheDocument()
    expect(trigger.getAttribute('aria-label')).toBe('Customize Token usage')
  })

  it('opens the menu on trigger click (Radix DropdownMenu.Content portal)', async () => {
    await renderMenu()
    const user = userEvent.setup()
    const trigger = await screen.findByTestId('panel-header-menu-token-usage')
    await user.click(trigger)
    // Both menu items must be present after click — Radix mounts them under
    // document.body via Portal.
    expect(
      await screen.findByTestId('panel-hide-token-usage'),
    ).toBeInTheDocument()
    expect(
      await screen.findByTestId('panel-reset-layout-home'),
    ).toBeInTheDocument()
  })

  it('Hide item (data-testid="panel-hide-{panelId}") calls setHidden(panelId, true) via useLayoutState', async () => {
    const router = await renderMenu()
    const user = userEvent.setup()
    const trigger = await screen.findByTestId('panel-header-menu-token-usage')
    await user.click(trigger)

    const hideItem = await screen.findByTestId('panel-hide-token-usage')
    await user.click(hideItem)

    await waitFor(() => {
      const search = router.state.location.search as Record<string, unknown>
      expect(search.hidden_panels).toBe('token-usage')
    })
  })

  it('Reset layout item (data-testid="panel-reset-layout-{route}") calls reset() and fires sonner toast.success', async () => {
    // Pre-load the URL with all three layout keys + a non-layout key. After
    // clicking Reset Layout, the three layout keys must drop AND the toast
    // must fire. The non-layout key (time_from) is asserted preserved by the
    // next test below.
    const router = await renderMenu(
      '/?hidden_panels=cache-efficiency&panel_order=main:token-usage,cache-efficiency&split_sizes=compare:60,40',
    )
    const user = userEvent.setup()
    const trigger = await screen.findByTestId('panel-header-menu-token-usage')
    await user.click(trigger)

    const resetItem = await screen.findByTestId('panel-reset-layout-home')
    await user.click(resetItem)

    await waitFor(() => {
      const search = router.state.location.search as Record<string, unknown>
      expect(search.hidden_panels).toBeUndefined()
      expect(search.panel_order).toBeUndefined()
      expect(search.split_sizes).toBeUndefined()
    })
    expect(toast.success).toHaveBeenCalledWith('Layout reset')
  })

  it('Reset layout preserves time_from/time_to/compare_panels (Pitfall 11 + LAYO-04 SC#3)', async () => {
    const router = await renderMenu(
      '/?time_from=now-7d&time_to=now&compare_panels=token-usage&hidden_panels=cache-efficiency',
    )
    const user = userEvent.setup()
    const trigger = await screen.findByTestId('panel-header-menu-token-usage')
    await user.click(trigger)

    const resetItem = await screen.findByTestId('panel-reset-layout-home')
    await user.click(resetItem)

    await waitFor(() => {
      const search = router.state.location.search as Record<string, unknown>
      expect(search.hidden_panels).toBeUndefined()
      // Non-layout keys MUST survive the reset (destructuring-delete pattern
      // in useLayoutState.reset preserves all non-layout keys including those
      // not yet imagined — LAYO-04 SC#3).
      expect(search.time_from).toBe('now-7d')
      expect(search.time_to).toBe('now')
      expect(search.compare_panels).toBe('token-usage')
    })
  })
})
