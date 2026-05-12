/**
 * Phase 25 / VIEW-03 — TanStack Query hook coverage for saved views.
 *
 * Mirrors the queries.test.ts pattern: fetch is spied at globalThis level,
 * QueryClientProvider wraps renderHook, invalidations are verified via
 * vi.spyOn(client, 'invalidateQueries') call inspection.
 *
 * Pins the documented invariants:
 *   - useSavedViews encodes ?route= when route arg present (no param when absent)
 *   - All 3 mutations invalidate the entire ['saved-views'] family
 *   - useSavedView(null) is disabled (no fetch fires)
 *   - DELETE handler does not call .json() on a 204 (fetchVoid path)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import {
  qk,
  useSavedViews,
  useSavedView,
  useCreateView,
  usePatchView,
  useDeleteView,
} from '../queries'
import type { SavedView, SavedViewListResponse } from '../api'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  })
}

function makeWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children)
}

function jsonResponse<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const VIEW: SavedView = {
  id: 1,
  name: 'High-cost projects',
  description: '',
  route: '/cost',
  state_json: { range: '30d' },
  schema_version: 1,
  created_at: '2026-05-12T00:00:00Z',
  updated_at: '2026-05-12T00:00:00Z',
}

const LIST_RESPONSE: SavedViewListResponse = {
  items: [VIEW],
  total: 1,
}

// ---------------------------------------------------------------------------
// qk.savedViews / qk.savedView — key shape pins
// ---------------------------------------------------------------------------

describe('queries.qk.savedViews / qk.savedView (Phase 25 VIEW-03)', () => {
  it('savedViews(undefined) encodes the __all__ sentinel', () => {
    expect(qk.savedViews()).toEqual(['saved-views', '__all__'])
  })

  it('savedViews(route) is route-scoped — different routes do not collide', () => {
    expect(qk.savedViews('/cost')).toEqual(['saved-views', '/cost'])
    expect(qk.savedViews('/cost')).not.toEqual(qk.savedViews('/alerts'))
    expect(qk.savedViews('/cost')).not.toEqual(qk.savedViews())
  })

  it('savedView(id) has a single-row key shape distinct from the list shape', () => {
    expect(qk.savedView(1)).toEqual(['saved-views', 'single', 1])
    expect(qk.savedView(1)).not.toEqual(qk.savedViews())
    expect(qk.savedView(1)).not.toEqual(qk.savedView(2))
  })
})

// ---------------------------------------------------------------------------
// useSavedViews — fetch + url shape
// ---------------------------------------------------------------------------

describe('useSavedViews', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn> | undefined

  beforeEach(() => {
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(LIST_RESPONSE))
  })

  afterEach(() => {
    fetchSpy?.mockRestore()
  })

  it('fetches unfiltered when no route arg (no ?route= in URL)', async () => {
    const client = makeClient()
    const wrapper = makeWrapper(client)
    const { result } = renderHook(() => useSavedViews(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const url = fetchSpy!.mock.calls[0][0] as string
    expect(url).toBe('/api/views')
  })

  it('fetches with ?route= URL-encoded when a route filter is passed', async () => {
    const client = makeClient()
    const wrapper = makeWrapper(client)
    // /skills/$name contains $ which must be percent-encoded.
    const { result } = renderHook(() => useSavedViews('/skills/$name'), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const url = fetchSpy!.mock.calls[0][0] as string
    expect(url).toBe(`/api/views?route=${encodeURIComponent('/skills/$name')}`)
  })
})

// ---------------------------------------------------------------------------
// useSavedView — null-id no-op
// ---------------------------------------------------------------------------

describe('useSavedView', () => {
  it('does not fetch when id is null (enabled gate)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(VIEW))
    const client = makeClient()
    const wrapper = makeWrapper(client)
    renderHook(() => useSavedView(null), { wrapper })
    // Give the gate a tick to fire if it were going to.
    await new Promise((r) => setTimeout(r, 20))
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('fetches when id is non-null', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(VIEW))
    const client = makeClient()
    const wrapper = makeWrapper(client)
    const { result } = renderHook(() => useSavedView(1), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toBe('/api/views/1')
    fetchSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// Mutations — every one invalidates the whole ['saved-views'] family.
// ---------------------------------------------------------------------------

describe('useCreateView', () => {
  it('invalidates the saved-views key family on success', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(VIEW))
    const client = makeClient()
    const wrapper = makeWrapper(client)
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useCreateView(), { wrapper })

    await result.current.mutateAsync({
      name: 'New view',
      route: '/cost',
      state_json: { range: '7d' },
    })

    const savedViewsInvalidations = invalidateSpy.mock.calls.filter((c) => {
      const arg = c[0] as { queryKey?: unknown[] } | undefined
      return Array.isArray(arg?.queryKey) && arg!.queryKey![0] === 'saved-views'
    })
    expect(savedViewsInvalidations.length).toBeGreaterThanOrEqual(1)
    fetchSpy.mockRestore()
  })
})

describe('usePatchView', () => {
  it('invalidates the saved-views key family on success', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ ...VIEW, name: 'Renamed' }))
    const client = makeClient()
    const wrapper = makeWrapper(client)
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => usePatchView(), { wrapper })

    await result.current.mutateAsync({ id: 1, patch: { name: 'Renamed' } })

    const savedViewsInvalidations = invalidateSpy.mock.calls.filter((c) => {
      const arg = c[0] as { queryKey?: unknown[] } | undefined
      return Array.isArray(arg?.queryKey) && arg!.queryKey![0] === 'saved-views'
    })
    expect(savedViewsInvalidations.length).toBeGreaterThanOrEqual(1)
    fetchSpy.mockRestore()
  })
})

describe('useDeleteView', () => {
  it('invalidates the saved-views key family on success (204 body — fetchVoid path)', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }))
    const client = makeClient()
    const wrapper = makeWrapper(client)
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteView(), { wrapper })

    await result.current.mutateAsync(1)

    const savedViewsInvalidations = invalidateSpy.mock.calls.filter((c) => {
      const arg = c[0] as { queryKey?: unknown[] } | undefined
      return Array.isArray(arg?.queryKey) && arg!.queryKey![0] === 'saved-views'
    })
    expect(savedViewsInvalidations.length).toBeGreaterThanOrEqual(1)
    fetchSpy.mockRestore()
  })
})
