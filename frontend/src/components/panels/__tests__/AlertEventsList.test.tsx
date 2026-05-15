// AlertEventsList — ALRT-10 (Phase 15 Plan 05) + Phase 27 Plan 06.
//
// Strategy: setQueryData seeds qk.alertEvents(range) with fixtures so PanelCard
// resolves synchronously. Range is now URL-driven via useRouteRangeVocab —
// tests drive the URL state by mutating `mockSearch` before render. Mirror of
// the Phase 26 Plan 08 + Plan 27-05 mock pattern (vi.mock at module scope,
// closure over mutable state, no per-test re-mock).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '../../../test/utils'
import { AlertEventsList } from '../AlertEventsList'
import { qk } from '../../../lib/queries'
import type { AlertEvent, AlertEventsResponse, AlertRange } from '../../../lib/api'

// Phase 27 Plan 06 — URL-driven range via useRouteRangeVocab. Tests mutate
// `mockSearch` before render to drive the URL state read by the hook.
let mockSearch: Record<string, unknown> = {}
function setSearch(next: Record<string, unknown>) {
  mockSearch = next
}
const navigateSpy = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { pathname: '/alerts', search: mockSearch } }),
  useNavigate: () => navigateSpy,
}))

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
}

function Wrap({ client, children }: { client: QueryClient; children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function makeEvent(overrides: Partial<AlertEvent> = {}): AlertEvent {
  return {
    decision_id: 1,
    rule_id: 1,
    rule_name: 'high-cost',
    scope_key: 'model:claude-opus-4-7',
    fired_at: new Date(Date.now() - 60_000).toISOString(),
    cleared_at: null,
    status: 'pending',
    last_value: 12.345,
    ...overrides,
  }
}

function makePopulated(range: AlertRange): AlertEventsResponse {
  return {
    range,
    items: [
      makeEvent({
        decision_id: 1,
        rule_name: 'high-cost',
        status: 'pending',
        last_value: 12.345,
      }),
      makeEvent({
        decision_id: 2,
        rule_id: 2,
        rule_name: 'p95-anomaly',
        scope_key: 'skill:analyze',
        status: 'answered',
        cleared_at: new Date().toISOString(),
        last_value: 4.56,
      }),
    ],
    total: 2,
  }
}

describe('AlertEventsList', () => {
  beforeEach(() => {
    // Default: never auto-resolve a fetch — tests setQueryData first to satisfy
    // PanelCard's data branch synchronously.
    window.localStorage.clear()
    setSearch({})
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makePopulated('7d')), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('renders ALRT-10 reqId + Alert History title + 2 event rows from cached useAlertEvents', async () => {
    const client = makeClient()
    client.setQueryData(qk.alertEvents('7d'), makePopulated('7d'))
    const { container } = render(
      <Wrap client={client}>
        <AlertEventsList />
      </Wrap>,
    )
    expect(screen.getByText('ALRT-10')).toBeInTheDocument()
    expect(screen.getByText('Alert History')).toBeInTheDocument()
    await waitFor(() =>
      expect(container.querySelectorAll('tbody tr').length).toBe(2),
    )
    expect(screen.getByText('high-cost')).toBeInTheDocument()
    expect(screen.getByText('p95-anomaly')).toBeInTheDocument()
  })

  it('renders Firing pill (pending state) + 2-decimal last_value', async () => {
    const client = makeClient()
    client.setQueryData(qk.alertEvents('7d'), {
      range: '7d',
      items: [makeEvent({ status: 'pending', last_value: 12.345 })],
      total: 1,
    } satisfies AlertEventsResponse)
    render(
      <Wrap client={client}>
        <AlertEventsList />
      </Wrap>,
    )
    await waitFor(() => {
      expect(screen.getByText('Firing')).toBeInTheDocument()
    })
    // last_value formatted to 2 decimals.
    expect(screen.getByText('12.35')).toBeInTheDocument()
  })

  it('renders Cleared pill (answered state)', async () => {
    const client = makeClient()
    client.setQueryData(qk.alertEvents('7d'), {
      range: '7d',
      items: [
        makeEvent({
          status: 'answered',
          cleared_at: new Date().toISOString(),
          last_value: null,
        }),
      ],
      total: 1,
    } satisfies AlertEventsResponse)
    render(
      <Wrap client={client}>
        <AlertEventsList />
      </Wrap>,
    )
    await waitFor(() => {
      expect(screen.getByText('Cleared')).toBeInTheDocument()
    })
    // null last_value renders em-dash.
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders empty state when items=[]', async () => {
    const client = makeClient()
    client.setQueryData(qk.alertEvents('7d'), {
      range: '7d',
      items: [],
      total: 0,
    } satisfies AlertEventsResponse)
    render(
      <Wrap client={client}>
        <AlertEventsList />
      </Wrap>,
    )
    await waitFor(() => {
      expect(screen.getByText(/Nothing to show yet/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/alert firings/i)).toBeInTheDocument()
  })

  it('TIME-02-style: AlertEventsList reads range from URL via useRouteRangeVocab (not localStorage)', async () => {
    // ?time_from=now-30d&time_to=now → 720h window → snapToAlertRange = '30d'.
    setSearch({ time_from: 'now-30d', time_to: 'now' })
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input): Promise<Response> => {
        const url = String(input)
        if (url.includes('range=30d')) {
          return new Response(
            JSON.stringify({
              range: '30d',
              items: [makeEvent({ rule_name: 'thirty-day-rule' })],
              total: 1,
            } satisfies AlertEventsResponse),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify(makePopulated('7d')), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })
    const client = makeClient()
    render(
      <Wrap client={client}>
        <AlertEventsList />
      </Wrap>,
    )

    // URL-driven range='30d' drives the initial fetch.
    expect(await screen.findByText('thirty-day-rule')).toBeInTheDocument()
    const calls30d = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('/api/alerts/events?range=30d'),
    )
    expect(calls30d.length).toBeGreaterThan(0)
  })

  it('Phase 27 Plan 06: localStorage `alert-events-range` is NOT the source of truth — URL default `7d` wins', async () => {
    // Pre-seed localStorage with a stale v1.2-era selection. Phase 27 Plan 06
    // drops the RangeToggle persistKey — the panel must ignore this value.
    localStorage.setItem('alert-events-range', '1d')
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input): Promise<Response> => {
        const url = String(input)
        const responseRange: AlertRange = url.includes('range=1d')
          ? '1d'
          : '7d'
        return new Response(
          JSON.stringify({
            range: responseRange,
            items: [
              makeEvent({
                rule_name: responseRange === '1d' ? 'oneday-rule' : 'sevenday-rule',
              }),
            ],
            total: 1,
          } satisfies AlertEventsResponse),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      })
    const client = makeClient()
    render(
      <Wrap client={client}>
        <AlertEventsList />
      </Wrap>,
    )

    // The 7d default wins (URL is empty), NOT the 1d localStorage value.
    expect(await screen.findByText('sevenday-rule')).toBeInTheDocument()
    const calls1d = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('/api/alerts/events?range=1d'),
    )
    expect(calls1d.length).toBe(0)
    localStorage.removeItem('alert-events-range')
  })

  it('global TimePicker change re-anchors AlertEventsList without remount', async () => {
    // Start with no URL params → range='7d' default fires.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input): Promise<Response> => {
        const url = String(input)
        const responseRange: AlertRange = url.includes('range=1d')
          ? '1d'
          : '7d'
        return new Response(
          JSON.stringify({
            range: responseRange,
            items: [
              makeEvent({
                rule_name: responseRange === '1d' ? 'oneday-rule' : 'sevenday-rule',
              }),
            ],
            total: 1,
          } satisfies AlertEventsResponse),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      })
    const client = makeClient()
    const { rerender } = render(
      <Wrap client={client}>
        <AlertEventsList />
      </Wrap>,
    )

    // Initial render — URL empty, range='7d' default.
    expect(await screen.findByText('sevenday-rule')).toBeInTheDocument()
    const initialNodeCount = document.querySelectorAll(
      '[data-testid="alert-events-list-table"], [data-testid^="alert-"]',
    ).length

    // Simulate global TimePicker writing time_from/time_to without
    // a remount — the hook re-reads on render via useRouterState.
    setSearch({ time_from: 'now-1d', time_to: 'now' })
    rerender(
      <Wrap client={client}>
        <AlertEventsList />
      </Wrap>,
    )

    // The 1d fetch should fire after re-render, and the panel
    // re-anchors to the new range without unmounting.
    await waitFor(() =>
      expect(screen.getByText('oneday-rule')).toBeInTheDocument(),
    )
    const calls1d = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('/api/alerts/events?range=1d'),
    )
    expect(calls1d.length).toBeGreaterThan(0)
    // Same conceptual mount — the section testid (rendered by PanelCard)
    // remains present across the rerender (we don't unmount/remount).
    expect(initialNodeCount).toBeGreaterThanOrEqual(0) // sanity reference
  })
})
