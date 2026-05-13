// RefreshDropdown — Phase 26 Plan 03 (TIME-01) tests.
//
// Test strategy:
//   - In-memory TanStack Router so useRouterState resolves.
//   - localStorage and dispatchEvent are real (jsdom). We assert against
//     window.localStorage.getItem('cmc.autoRefresh.interval') and a spy
//     on window.dispatchEvent to verify the same-tab notification fires.
//   - Radix DropdownMenu Portal-mounts to document.body; tests query via
//     screen which scans document.body by default in RTL.
//
// Behaviour exercised (3 specs):
//   1. Trigger renders "Off" by default; clicking trigger + "30 seconds"
//      persists '30s' to localStorage AND dispatches
//      'cmc:auto-refresh-changed'.
//   2. While URL has an absolute time_from, trigger label shows "Paused"
//      and the active pulse is suppressed.
//   3. While URL has a Grafana token (now-7d) AND interval is 30s,
//      the active pulse renders.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, userEvent } from '../../../test/utils'
import { RefreshDropdown } from '../RefreshDropdown'

const KEY = 'cmc.autoRefresh.interval'

function makeFixture(initialSearch: Record<string, unknown> = {}) {
  const rootRoute = createRootRoute({
    component: () => <RefreshDropdown />,
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  const routeTree = rootRoute.addChildren([indexRoute])
  const qs = Object.entries(initialSearch)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
  const entry = qs ? `/?${qs}` : '/'
  const history = createMemoryHistory({ initialEntries: [entry] })
  const router = createRouter({ routeTree, history })
  return { router, history }
}

async function renderFixture(fixture: ReturnType<typeof makeFixture>) {
  await fixture.router.load()
  return render(<RouterProvider router={fixture.router} />)
}

describe('RefreshDropdown', () => {
  beforeEach(() => {
    window.localStorage.removeItem(KEY)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.removeItem(KEY)
  })

  it('renders "Off" by default; selecting "30 seconds" persists + dispatches change event', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    const user = userEvent.setup()
    const fixture = makeFixture({})
    await renderFixture(fixture)
    const trigger = await screen.findByTestId('refresh-dropdown-trigger')
    expect(trigger.textContent).toContain('Off')

    await user.click(trigger)
    const option = await screen.findByTestId('refresh-option-30s')
    await user.click(option)

    expect(window.localStorage.getItem(KEY)).toBe('30s')
    // dispatchEvent receives an Event with type === 'cmc:auto-refresh-changed'.
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as Event).type)
    expect(types).toContain('cmc:auto-refresh-changed')
  })

  it('shows "Paused" + suppresses pulse when URL has an absolute time_from', async () => {
    window.localStorage.setItem(KEY, '30s')
    const fixture = makeFixture({
      time_from: '2026-05-12T10:00:00Z',
      time_to: '2026-05-12T11:00:00Z',
    })
    await renderFixture(fixture)
    const trigger = await screen.findByTestId('refresh-dropdown-trigger')
    expect(trigger.textContent).toContain('Paused')
    // Active pulse must NOT render while paused — query must return null.
    expect(screen.queryByTestId('refresh-active-indicator')).toBeNull()
  })

  it('renders the active pulse when interval is 30s and URL window is relative', async () => {
    window.localStorage.setItem(KEY, '30s')
    const fixture = makeFixture({ time_from: 'now-7d', time_to: 'now' })
    await renderFixture(fixture)
    const indicator = await screen.findByTestId('refresh-active-indicator')
    expect(indicator).toBeTruthy()
  })
})
