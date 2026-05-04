// AlertEventsList — ALRT-10 (Phase 15 Plan 05).
//
// Strategy: setQueryData seeds qk.alertEvents(range) with fixtures so PanelCard
// resolves synchronously. Range toggle test verifies that clicking '14d'
// triggers a new fetch call against /api/alerts/events?range=14d (no need to
// observe the QueryClient cache directly — fetch-mock URL inspection is the
// stable contract since the queryKey shape is tested in queries.test.ts).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, userEvent, waitFor } from '../../../test/utils'
import { AlertEventsList } from '../AlertEventsList'
import { qk } from '../../../lib/queries'
import type { AlertEvent, AlertEventsResponse, AlertRange } from '../../../lib/api'

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

  it('clicking the 14d range button triggers fetch against /api/alerts/events?range=14d', async () => {
    const client = makeClient()
    client.setQueryData(qk.alertEvents('7d'), makePopulated('7d'))
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url = String(input)
        if (url.includes('range=14d')) {
          return new Response(JSON.stringify(makePopulated('14d')), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response(JSON.stringify(makePopulated('7d')), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )
    render(
      <Wrap client={client}>
        <AlertEventsList />
      </Wrap>,
    )
    const user = userEvent.setup()
    await waitFor(() =>
      expect(screen.getByText('high-cost')).toBeInTheDocument(),
    )
    // Click the 14d range button.
    const fourteenBtn = screen.getByRole('button', { name: '14d' })
    await user.click(fourteenBtn)
    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([input]) =>
        String(input).includes('/api/alerts/events?range=14d'),
      )
      expect(calls.length).toBeGreaterThanOrEqual(1)
    })
  })
})
