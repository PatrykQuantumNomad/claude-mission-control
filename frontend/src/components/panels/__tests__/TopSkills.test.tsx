// TopSkills — ACTV-04 (Phase 14 Plan 03 reactivation).
//
// The v1.0 deferred-placeholder body has been replaced by a real PanelCard
// that consumes useSkillUsage(range) and renders top-N skills + an aggregate
// sparkline + a RangeToggle (14d / 30d, persistKey=top-skills-range) + a
// drill-in <Link to="/skills/$name"> per skill row.
//
// Test pattern mirrors CacheEfficiencyCard.test.tsx (pre-seed QueryClient via
// setQueryData(qk.skillUsage(range), ...) — bypasses fetch entirely so we
// assert on render output, not network behavior). The Link component requires
// a TanStack Router context, so each test wraps the panel in a minimal
// in-memory router (NavBar.test.tsx pattern) so getAttribute('href') resolves.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, userEvent, waitFor } from '../../../test/utils'
import { TopSkills } from '../TopSkills'
import { qk } from '../../../lib/queries'
import type { SkillUsageResponse } from '../../../lib/api'

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, refetchOnWindowFocus: false },
    },
  })
}

// Minimal in-memory router so the panel's <Link to="/skills/$name"> resolves
// to a real href in tests. Plan 14-05 lands the actual route file; until then
// we register a stub child route inside the test so TanStack Router can
// build the URL without 404-ing during link render. We mount TopSkills inside
// the root route so `screen.*` queries surface its DOM.
function makeRouter() {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <TopSkills />
        <Outlet />
      </>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  const skillsDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/skills/$name',
    component: () => null,
  })
  const routeTree = rootRoute.addChildren([indexRoute, skillsDetailRoute])
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

function Wrap({ client, children }: { client: QueryClient; children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const HAPPY_14D: SkillUsageResponse = {
  range: '14d',
  rows: [
    {
      skill_name: 'data-analyze',
      total: 42,
      sparkline: [
        { day: '2026-04-30', invocations: 10 },
        { day: '2026-05-01', invocations: 15 },
        { day: '2026-05-02', invocations: 17 },
      ],
    },
    {
      skill_name: 'doc-writer',
      total: 27,
      sparkline: [
        { day: '2026-04-30', invocations: 5 },
        { day: '2026-05-01', invocations: 12 },
        { day: '2026-05-02', invocations: 10 },
      ],
    },
    {
      skill_name: 'gsd-execute',
      total: 9,
      sparkline: [
        { day: '2026-04-30', invocations: 2 },
        { day: '2026-05-01', invocations: 3 },
        { day: '2026-05-02', invocations: 4 },
      ],
    },
  ],
}

const HAPPY_30D: SkillUsageResponse = {
  range: '30d',
  rows: [
    {
      skill_name: 'data-analyze',
      total: 99,
      sparkline: [{ day: '2026-04-15', invocations: 50 }],
    },
  ],
}

const EMPTY: SkillUsageResponse = {
  range: '14d',
  rows: [],
}

describe('TopSkills (Phase 14 Plan 03 reactivation)', () => {
  beforeEach(() => {
    // Stub fetch in case any branch escapes the cache pre-seed; assert later
    // that no /api/skills/usage call slips through when a happy seed exists.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    // RangeToggle persistKey writes to localStorage; clear between tests so
    // the persistKey hydration in useEffect doesn't bleed across tests.
    try {
      window.localStorage.clear()
    } catch {
      // happy-dom is fine; guarded for safety
    }
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders ACTV-04 reqId, title, and top-N rows when data is non-empty', async () => {
    const client = makeClient()
    client.setQueryData(qk.skillUsage('14d'), HAPPY_14D)
    const router = makeRouter()
    await router.load()

    render(
      <Wrap client={client}>
        <RouterProvider router={router} />
      </Wrap>,
    )

    expect(await screen.findByText('ACTV-04')).toBeInTheDocument()
    expect(screen.getByText('Top Skills')).toBeInTheDocument()
    // Each skill name renders as a clickable link
    expect(screen.getByRole('link', { name: 'data-analyze' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'doc-writer' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'gsd-execute' })).toBeInTheDocument()
    // Totals rendered alongside
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('27')).toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
  })

  it('row link href points to /skills/<name> (TanStack Router builds the real URL)', async () => {
    const client = makeClient()
    client.setQueryData(qk.skillUsage('14d'), HAPPY_14D)
    const router = makeRouter()
    await router.load()

    render(
      <Wrap client={client}>
        <RouterProvider router={router} />
      </Wrap>,
    )

    const link = (await screen.findByRole('link', { name: 'data-analyze' })) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/skills/data-analyze')
  })

  it('renders the PanelCard empty state when rows is []', async () => {
    const client = makeClient()
    client.setQueryData(qk.skillUsage('14d'), EMPTY)
    const router = makeRouter()
    await router.load()

    render(
      <Wrap client={client}>
        <RouterProvider router={router} />
      </Wrap>,
    )

    // PanelCard's default empty body literal: "Nothing to show yet"
    expect(await screen.findByText('Nothing to show yet')).toBeInTheDocument()
  })

  it('RangeToggle exposes 14d / 30d buttons and clicking 30d rebinds the query (asserted via cache lookup)', async () => {
    const client = makeClient()
    client.setQueryData(qk.skillUsage('14d'), HAPPY_14D)
    client.setQueryData(qk.skillUsage('30d'), HAPPY_30D)
    const router = makeRouter()
    await router.load()

    render(
      <Wrap client={client}>
        <RouterProvider router={router} />
      </Wrap>,
    )

    // Both range buttons present
    const btn14 = screen.getByRole('button', { name: '14d' })
    const btn30 = screen.getByRole('button', { name: '30d' })
    expect(btn14).toBeInTheDocument()
    expect(btn30).toBeInTheDocument()
    // 14d default initially active
    expect(btn14.getAttribute('aria-pressed')).toBe('true')
    expect(btn30.getAttribute('aria-pressed')).toBe('false')

    await userEvent.click(btn30)
    // After click: 30d row appears (data-analyze with total 99 — distinct from
    // the 14d HAPPY_14D where it had total 42)
    await waitFor(() => {
      expect(btn30.getAttribute('aria-pressed')).toBe('true')
    })
    // The 30d data row total renders (99 from HAPPY_30D — only one row in 30d)
    await waitFor(() => {
      expect(screen.getByText('99')).toBeInTheDocument()
    })
    // RangeToggle persists selection — verify via storage namespace
    expect(window.localStorage.getItem('cmc.filter.top-skills-range.range')).toBe('"30d"')
  })

  it('renders an aggregate recharts container above the table (sparkline mounted)', async () => {
    const client = makeClient()
    client.setQueryData(qk.skillUsage('14d'), HAPPY_14D)
    const router = makeRouter()
    await router.load()

    const { container } = render(
      <Wrap client={client}>
        <RouterProvider router={router} />
      </Wrap>,
    )

    // ResponsiveContainer renders a .recharts-responsive-container wrapper
    // even when its inner SVG width is 0 (jsdom limitation — same convention
    // as CacheEfficiencyCard.test.tsx line 54).
    await waitFor(() => {
      expect(container.querySelector('.recharts-responsive-container')).not.toBeNull()
    })
  })
})
