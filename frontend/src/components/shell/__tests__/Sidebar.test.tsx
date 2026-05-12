// Sidebar — Phase 24 Plan 04 (SHEL-01, SHEL-03, SHEL-04).
//
// Test strategy:
//   - Reset localStorage + the <html data-sidebar-collapsed> attribute in
//     beforeEach so each test starts from a clean slate.
//   - Use an in-memory TanStack Router (mirrors the deleted NavBar.test.tsx
//     pattern) so the Sidebar's <Link> components can resolve `to=` props.
//   - Cmd+B is dispatched at window level — the implementation attaches its
//     keydown listener to window so it captures inside Sheets / inputs.
//
// Behaviour exercised:
//   1. Default mount with empty localStorage: brand + Home link + the three
//      section headers (Observe, Operate, Configure) all render.
//   2. Active-route highlight: navigating the in-memory router to /activity
//      makes the /activity link receive class 'cmc-sidebar__navlink--active'.
//   3. Click sidebar-collapse-toggle: persists 'true' to localStorage AND
//      flips <html data-sidebar-collapsed>.
//   4. Cmd+B keyboard: a window-level keydown event with metaKey+key='b'
//      flips the collapsed state back to false.
//   5. Re-mount with localStorage='true' simulates a page reload — the
//      sidebar respects the persisted value via its mount-time useEffect.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Sidebar } from '../Sidebar'
import { LoadedViewProvider } from '../../savedviews/LoadedViewContext'

// Phase 25 Plan 09 (SHEL-06 Rule 3 fix): Sidebar now hosts PinnedViewsSection
// which calls useSavedViews() (cross-route fetch). The test must mount a
// QueryClientProvider + stub fetch + wrap in LoadedViewProvider — same shape
// as Plan 08's CommandPalette.test.tsx Rule 3 fix. Per-test setup uses the
// shared helper below; each test keeps its existing assertion semantics.

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
}

function SidebarHarness() {
  return (
    <LoadedViewProvider>
      <Sidebar />
    </LoadedViewProvider>
  )
}

function makeRouter(initialPath: string) {
  const rootRoute = createRootRoute({ component: SidebarHarness })
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
  const sessionsCompareRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/sessions/compare',
    component: () => null,
  })
  const skillsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/skills',
    component: () => null,
  })
  const costRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/cost',
    component: () => null,
  })
  const alertsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/alerts',
    component: () => null,
  })
  const routeTree = rootRoute.addChildren([
    indexRoute,
    activityRoute,
    sessionsCompareRoute,
    skillsRoute,
    costRoute,
    alertsRoute,
  ])
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
}

describe('Sidebar', () => {
  beforeEach(() => {
    localStorage.removeItem('cmc.sidebar.collapsed')
    // Phase 25 Plan 09: PinnedViewsSection reads localStorage `cmc.savedView.pinned`.
    // Default the pin list to empty so the existing Sidebar assertions stay
    // unaffected by Pinned-section state from earlier tests.
    localStorage.removeItem('cmc.savedView.pinned')
    delete document.documentElement.dataset.sidebarCollapsed
    // Phase 25 Plan 09: PinnedViewsSection -> useSavedViews() fires a real
    // fetch against /api/views. Stub returns an empty list — the Phase 24
    // assertions in this file don't exercise the Pinned section, but the
    // fetch must resolve so React Query doesn't surface an error boundary.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({ items: [], total: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
  })

  afterEach(() => {
    localStorage.removeItem('cmc.sidebar.collapsed')
    localStorage.removeItem('cmc.savedView.pinned')
    delete document.documentElement.dataset.sidebarCollapsed
    vi.restoreAllMocks()
  })

  it('renders brand, Home, and Observe/Operate/Configure section headers', async () => {
    const router = makeRouter('/')
    await router.load()
    render(
      <QueryClientProvider client={makeQueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Mission Control')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar-link-home')).toBeInTheDocument()
    expect(screen.getByText('Observe')).toBeInTheDocument()
    expect(screen.getByText('Operate')).toBeInTheDocument()
    expect(screen.getByText('Configure')).toBeInTheDocument()
    // Observe section links present
    expect(screen.getByTestId('sidebar-link-activity')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar-link-sessions-compare')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar-link-skills')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar-link-cost')).toBeInTheDocument()
    // Operate section link
    expect(screen.getByTestId('sidebar-link-alerts')).toBeInTheDocument()
  })

  it('applies cmc-sidebar__navlink--active class to the current route link', async () => {
    const router = makeRouter('/activity')
    await router.load()
    render(
      <QueryClientProvider client={makeQueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    const activityLink = await screen.findByTestId('sidebar-link-activity')
    await waitFor(() => {
      expect(activityLink.className).toContain('cmc-sidebar__navlink--active')
    })
    // Home should NOT be active when route is /activity (exact: true on '/').
    const homeLink = screen.getByTestId('sidebar-link-home')
    expect(homeLink.className).not.toContain('cmc-sidebar__navlink--active')
  })

  it('clicking sidebar-collapse-toggle persists collapsed=true to localStorage and dataset', async () => {
    const router = makeRouter('/')
    await router.load()
    render(
      <QueryClientProvider client={makeQueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    const toggle = await screen.findByTestId('sidebar-collapse-toggle')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(toggle)

    await waitFor(() => {
      expect(localStorage.getItem('cmc.sidebar.collapsed')).toBe('true')
      expect(document.documentElement.dataset.sidebarCollapsed).toBe('true')
    })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
  })

  it('Cmd+B (metaKey + b) flips collapsed state at window level', async () => {
    const router = makeRouter('/')
    await router.load()
    render(
      <QueryClientProvider client={makeQueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    const toggle = await screen.findByTestId('sidebar-collapse-toggle')
    // Start: aria-expanded = 'true' (collapsed = false).
    expect(toggle.getAttribute('aria-expanded')).toBe('true')

    // Dispatch Cmd+B at window — Sidebar's useEffect listens on window.
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true }),
      )
    })

    await waitFor(() => {
      expect(localStorage.getItem('cmc.sidebar.collapsed')).toBe('true')
      expect(toggle.getAttribute('aria-expanded')).toBe('false')
    })

    // Press again — Ctrl+B (non-Mac) — should flip back.
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }),
      )
    })

    await waitFor(() => {
      expect(localStorage.getItem('cmc.sidebar.collapsed')).toBe('false')
      expect(toggle.getAttribute('aria-expanded')).toBe('true')
    })
  })

  it('respects persisted collapsed=true on remount (page-refresh simulation)', async () => {
    localStorage.setItem('cmc.sidebar.collapsed', 'true')

    const router = makeRouter('/')
    await router.load()
    const view = render(
      <QueryClientProvider client={makeQueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    const toggle = await screen.findByTestId('sidebar-collapse-toggle')
    // After mount-time useEffect, aria-expanded should reflect persisted=true.
    await waitFor(() => {
      expect(toggle.getAttribute('aria-expanded')).toBe('false')
    })

    // Unmount + remount with localStorage still set — simulates page reload.
    view.unmount()

    const router2 = makeRouter('/')
    await router2.load()
    render(
      <QueryClientProvider client={makeQueryClient()}>
        <RouterProvider router={router2} />
      </QueryClientProvider>,
    )

    const toggle2 = await screen.findByTestId('sidebar-collapse-toggle')
    await waitFor(() => {
      expect(toggle2.getAttribute('aria-expanded')).toBe('false')
    })
  })
})
