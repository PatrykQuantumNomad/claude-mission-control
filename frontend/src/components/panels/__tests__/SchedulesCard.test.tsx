// SchedulesCard — TPNL-03 (current).
//
// Strategy: setQueryData seeds qk.schedules() with a fixture so PanelCard
// resolves synchronously to its data branch. useScheduleRuns is verified to
// be lazy via fetch-mock URL inspection — Pitfall 9 lock: no GET /runs fires
// until the user expands the CollapsibleSection.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, userEvent, waitFor } from '../../../test/utils'
import { SchedulesCard } from '../SchedulesCard'
import { qk } from '../../../lib/queries'
import type { ScheduleListItem, ScheduleListResponse } from '../../../lib/api'

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

function makeSchedule(overrides: Partial<ScheduleListItem> = {}): ScheduleListItem {
  return {
    id: 1,
    name: 'nightly-build',
    cron: '*/5 * * * *',
    enabled: true,
    next_run_at: '2026-04-27T20:00:00Z',
    last_run_at: '2026-04-27T15:00:00Z',
    task_template: { title: 'recurring' },
    skill: null,
    created_at: '2026-04-20T00:00:00Z',
    updated_at: '2026-04-20T00:00:00Z',
    ...overrides,
  }
}

const populated: ScheduleListResponse = {
  items: [
    makeSchedule({ id: 1, name: 'every-5-min', cron: '*/5 * * * *', enabled: true }),
    makeSchedule({
      id: 2,
      name: 'old-stale',
      cron: '0 9 * * 1-5',
      enabled: true,
      // last_run_at older than 48h to trigger stale marker
      last_run_at: new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
    }),
  ],
  total: 2,
}

const emptyPayload: ScheduleListResponse = { items: [], total: 0 }

describe('SchedulesCard', () => {
  beforeEach(() => {
    // Default fetch mock — overridden in mutation/lazy tests below.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(populated), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders 2 schedule rows when seeded', async () => {
    const client = makeClient()
    client.setQueryData(qk.schedules(), populated)
    const { container } = render(
      <Wrap client={client}>
        <SchedulesCard />
      </Wrap>,
    )
    expect(screen.getByText('TPNL-03')).toBeInTheDocument()
    expect(screen.getByText('Schedules')).toBeInTheDocument()
    await waitFor(() => {
      expect(container.querySelectorAll('.cmc-schedules-row').length).toBe(2)
    })
    expect(screen.getByText('every-5-min')).toBeInTheDocument()
    expect(screen.getByText('old-stale')).toBeInTheDocument()
  })

  it('renders empty state when items=[]', async () => {
    const client = makeClient()
    client.setQueryData(qk.schedules(), emptyPayload)
    render(
      <Wrap client={client}>
        <SchedulesCard />
      </Wrap>,
    )
    expect(screen.getByText('TPNL-03')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText(/Nothing to show yet/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/scheduled task data/i)).toBeInTheDocument()
  })

  it('renders cronstrue preview text for each row', async () => {
    const client = makeClient()
    client.setQueryData(qk.schedules(), populated)
    render(
      <Wrap client={client}>
        <SchedulesCard />
      </Wrap>,
    )
    await waitFor(() => {
      expect(screen.getByText(/Every 5 minutes/i)).toBeInTheDocument()
    })
    // 0 9 * * 1-5 -> "At 09:00, Monday through Friday"
    expect(screen.getByText(/Monday through Friday/i)).toBeInTheDocument()
  })

  it('toggling enabled checkbox calls usePatchSchedule with {id, body:{enabled:false}}', async () => {
    const client = makeClient()
    client.setQueryData(qk.schedules(), populated)
    let patchedBody: unknown = null
    let patchedId: string | null = null
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (method === 'PATCH' && /\/api\/schedules\/\d+$/.test(url)) {
          patchedId = url.split('/').pop() ?? null
          patchedBody = init?.body ? JSON.parse(String(init.body)) : null
          return new Response(JSON.stringify({ ...populated.items[0], enabled: false }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response(JSON.stringify(populated), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )
    const { container } = render(
      <Wrap client={client}>
        <SchedulesCard />
      </Wrap>,
    )
    const user = userEvent.setup()
    await waitFor(() => {
      expect(container.querySelectorAll('.cmc-schedules-row').length).toBe(2)
    })
    // Click the first enabled checkbox -> toggles to false
    const checkboxes = container.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    )
    expect(checkboxes.length).toBeGreaterThanOrEqual(2)
    await user.click(checkboxes[0])
    await waitFor(() => {
      expect(patchedId).toBe('1')
      expect(patchedBody).toEqual({ enabled: false })
    })
  })

  it('stale row (last_run_at > 48h ago) gets cmc-schedules-row--stale class', async () => {
    const client = makeClient()
    client.setQueryData(qk.schedules(), populated)
    const { container } = render(
      <Wrap client={client}>
        <SchedulesCard />
      </Wrap>,
    )
    await waitFor(() => {
      expect(container.querySelectorAll('.cmc-schedules-row').length).toBe(2)
    })
    const staleRow = Array.from(container.querySelectorAll('.cmc-schedules-row')).find(
      (li) => /old-stale/.test(li.textContent ?? ''),
    )
    expect(staleRow).toBeDefined()
    expect(staleRow?.classList.contains('cmc-schedules-row--stale')).toBe(true)
    // Fresh row does NOT have stale class.
    const freshRow = Array.from(container.querySelectorAll('.cmc-schedules-row')).find(
      (li) => /every-5-min/.test(li.textContent ?? ''),
    )
    expect(freshRow).toBeDefined()
    expect(freshRow?.classList.contains('cmc-schedules-row--stale')).toBe(false)
  })

  it('lazy: useScheduleRuns does NOT fire GET /runs on initial mount (Pitfall 9)', async () => {
    const client = makeClient()
    client.setQueryData(qk.schedules(), populated)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [], total: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    render(
      <Wrap client={client}>
        <SchedulesCard />
      </Wrap>,
    )
    await waitFor(() => {
      expect(screen.getByText('every-5-min')).toBeInTheDocument()
    })
    // Confirm no GET /runs call has fired.
    const runsCalls = fetchMock.mock.calls.filter(([input]) =>
      /\/api\/schedules\/\d+\/runs/.test(String(input)),
    )
    expect(runsCalls.length).toBe(0)
  })

  it('expanding the run-history collapsible triggers GET /runs (lazy enabled)', async () => {
    const client = makeClient()
    client.setQueryData(qk.schedules(), populated)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url = String(input)
        if (/\/api\/schedules\/\d+\/runs/.test(url)) {
          return new Response(JSON.stringify({ items: [], total: 0 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response(JSON.stringify(populated), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )
    render(
      <Wrap client={client}>
        <SchedulesCard />
      </Wrap>,
    )
    const user = userEvent.setup()
    await waitFor(() => {
      expect(screen.getByText('every-5-min')).toBeInTheDocument()
    })
    // Click "Run history" trigger on the first row.
    const triggers = screen.getAllByRole('button', { name: /Run history/i })
    expect(triggers.length).toBeGreaterThanOrEqual(2)
    await user.click(triggers[0])
    await waitFor(() => {
      const runsCalls = fetchMock.mock.calls.filter(([input]) =>
        /\/api\/schedules\/\d+\/runs/.test(String(input)),
      )
      expect(runsCalls.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('clicking "+ New" opens the ScheduleComposer Sheet (visible in document.body via portal)', async () => {
    const client = makeClient()
    client.setQueryData(qk.schedules(), populated)
    render(
      <Wrap client={client}>
        <SchedulesCard />
      </Wrap>,
    )
    const user = userEvent.setup()
    await waitFor(() => {
      expect(screen.getByText('every-5-min')).toBeInTheDocument()
    })
    // Pre-click: no New schedule heading
    expect(screen.queryByText(/New schedule/i)).toBeNull()
    await user.click(screen.getByRole('button', { name: /\+ New/i }))
    await waitFor(() => {
      expect(screen.getByText(/New schedule/i)).toBeInTheDocument()
    })
  })
})
