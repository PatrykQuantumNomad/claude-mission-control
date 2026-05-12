// UnsavedPip — Phase 25 Plan 06 (VIEW-08).
//
// Test strategy:
//   - In-memory TanStack Router with a permissive validateSearch so each test
//     can seed location.search.
//   - A tiny <PrimeLoadedView> helper inside LoadedViewProvider flips
//     setLoadedView(v) on mount so we exercise the post-load divergence path
//     without standing up the full SaveViewDialog flow.
//
// Behaviour exercised:
//   1. Returns null when no loaded view (default LoadedViewContext state).
//   2. Returns null when loaded view's state_json equals current URL search.
//   3. Renders the pip when loaded view's state_json differs from URL.
//   4. Strips schemaVersion before comparing — a view with
//      schemaVersion: 1 vs URL schemaVersion: 2 reads as NOT diverged when
//      every other field matches.

import { describe, it, expect } from 'vitest'
import {
  createRouter,
  RouterProvider,
  createRootRoute,
  createRoute,
  createMemoryHistory,
} from '@tanstack/react-router'
import { useEffect } from 'react'
import { render, screen, waitFor } from '../../../test/utils'
import { UnsavedPip } from '../UnsavedPip'
import { LoadedViewProvider, useLoadedView } from '../LoadedViewContext'
import type { SavedView } from '../../../lib/api'

function PrimeLoadedView({ view }: { view: SavedView | null }) {
  const { setLoadedView } = useLoadedView()
  useEffect(() => {
    setLoadedView(view)
  }, [view, setLoadedView])
  return null
}

interface HarnessProps {
  view: SavedView | null
  initialEntries?: string[]
}

function makeRouter({ view, initialEntries }: HarnessProps) {
  const rootRoute = createRootRoute({
    component: () => (
      <LoadedViewProvider>
        <PrimeLoadedView view={view} />
        <UnsavedPip />
      </LoadedViewProvider>
    ),
  })
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
      initialEntries: initialEntries ?? ['/'],
    }),
  })
}

async function renderPip(props: HarnessProps) {
  const router = makeRouter(props)
  await router.load()
  return render(<RouterProvider router={router} />)
}

function makeView(overrides: Partial<SavedView>): SavedView {
  return {
    id: 1,
    name: 'sample',
    description: '',
    route: '/',
    state_json: { schemaVersion: 1 },
    schema_version: 1,
    created_at: '2026-05-12T00:00:00Z',
    updated_at: '2026-05-12T00:00:00Z',
    ...overrides,
  }
}

describe('UnsavedPip', () => {
  it('renders nothing when no loaded view', async () => {
    await renderPip({ view: null })
    // PrimeLoadedView fires its effect on mount; we wait a tick and assert no pip.
    await waitFor(() => {
      expect(screen.queryByTestId('unsaved-pip')).toBeNull()
    })
  })

  it('renders nothing when loaded view state_json equals current URL search', async () => {
    const view = makeView({ state_json: { schemaVersion: 1, range: '7d' } })
    await renderPip({ view, initialEntries: ['/?range=7d'] })
    // After PrimeLoadedView's effect runs, the comparison should read NOT diverged.
    await waitFor(() => {
      expect(screen.queryByTestId('unsaved-pip')).toBeNull()
    })
  })

  it('renders pip when loaded view state_json differs from URL search', async () => {
    const view = makeView({ state_json: { schemaVersion: 1, range: '30d' } })
    await renderPip({ view, initialEntries: ['/?range=7d'] })
    expect(await screen.findByTestId('unsaved-pip')).toBeInTheDocument()
  })

  it('strips schemaVersion before comparing (cross-version match is NOT divergence)', async () => {
    // View state_json says schemaVersion: 1; URL says schemaVersion: 2; other
    // fields match. Pitfall 7 — schemaVersion is metadata, not user-meaningful.
    const view = makeView({ state_json: { schemaVersion: 1, range: '7d' } })
    await renderPip({
      view,
      // Seed URL with range=7d; the validator coerces schemaVersion to 1 by
      // default (the test validator above). Pin schemaVersion=2 explicitly
      // by passing it in the URL.
      initialEntries: ['/?range=7d&schemaVersion=2'],
    })
    await waitFor(() => {
      expect(screen.queryByTestId('unsaved-pip')).toBeNull()
    })
  })
})
