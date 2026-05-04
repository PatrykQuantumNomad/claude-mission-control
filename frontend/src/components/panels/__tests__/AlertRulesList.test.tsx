// AlertRulesList — ALRT-10 (Phase 15 Plan 05).
//
// Strategy mirrors SchedulesCard.test.tsx: setQueryData seeds qk.alertRules()
// with a fixture so PanelCard resolves synchronously to its data branch. The
// patch + delete mutations are verified via fetch-mock URL inspection — same
// idiom as SchedulesCard's "toggling enabled" test.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, userEvent, waitFor } from '../../../test/utils'
import { AlertRulesList } from '../AlertRulesList'
import { qk } from '../../../lib/queries'
import type { AlertRule, AlertRuleListResponse } from '../../../lib/api'

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

function makeRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    rule_id: 1,
    name: 'high-cost',
    kind: 'threshold',
    metric: 'cost_usd_24h',
    threshold_fire: 10,
    threshold_clear: 5,
    min_dwell_seconds: 0,
    min_samples: 5,
    cooldown_seconds: 600,
    enabled: true,
    spec_version: 1,
    params_json: {},
    created_at: '2026-05-04T00:00:00Z',
    updated_at: '2026-05-04T00:00:00Z',
    ...overrides,
  }
}

const populated: AlertRuleListResponse = {
  items: [
    makeRule({ rule_id: 1, name: 'high-cost', kind: 'threshold', enabled: true }),
    makeRule({
      rule_id: 2,
      name: 'p95-anomaly',
      kind: 'anomaly',
      metric: 'skill_p95_latency_ms',
      threshold_fire: 3,
      threshold_clear: 1.5,
      enabled: false,
    }),
  ],
  total: 2,
}

const emptyPayload: AlertRuleListResponse = { items: [], total: 0 }

describe('AlertRulesList', () => {
  beforeEach(() => {
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

  it('renders ALRT-10 reqId + Alert Rules title + 2 rule rows from cached useAlertRules', async () => {
    const client = makeClient()
    client.setQueryData(qk.alertRules(), populated)
    const { container } = render(
      <Wrap client={client}>
        <AlertRulesList />
      </Wrap>,
    )
    expect(screen.getByText('ALRT-10')).toBeInTheDocument()
    expect(screen.getByText('Alert Rules')).toBeInTheDocument()
    await waitFor(() =>
      expect(container.querySelectorAll('tbody tr').length).toBe(2),
    )
    expect(screen.getByText('high-cost')).toBeInTheDocument()
    expect(screen.getByText('p95-anomaly')).toBeInTheDocument()
    // Both kind badges are rendered.
    expect(screen.getByText('threshold')).toBeInTheDocument()
    expect(screen.getByText('anomaly')).toBeInTheDocument()
  })

  it('renders empty state when items=[]', async () => {
    const client = makeClient()
    client.setQueryData(qk.alertRules(), emptyPayload)
    render(
      <Wrap client={client}>
        <AlertRulesList />
      </Wrap>,
    )
    expect(screen.getByText('ALRT-10')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText(/Nothing to show yet/i)).toBeInTheDocument()
    })
    // Empty-state body uses dataNoun="alert rules" — full template includes
    // "Once alert rules arrives it will appear here." Match the full body
    // string to disambiguate from the panel title (which is "Alert Rules").
    expect(
      screen.getByText(/Once alert rules arrives it will appear here/i),
    ).toBeInTheDocument()
  })

  it('toggling enabled checkbox calls usePatchAlertRule with {id, body:{enabled:false}}', async () => {
    const client = makeClient()
    client.setQueryData(qk.alertRules(), populated)
    let patchedBody: unknown = null
    let patchedId: string | null = null
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (method === 'PATCH' && /\/api\/alerts\/rules\/\d+$/.test(url)) {
          patchedId = url.split('/').pop() ?? null
          patchedBody = init?.body ? JSON.parse(String(init.body)) : null
          return new Response(
            JSON.stringify({ ...populated.items[0], enabled: false }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
        return new Response(JSON.stringify(populated), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )
    const { container } = render(
      <Wrap client={client}>
        <AlertRulesList />
      </Wrap>,
    )
    const user = userEvent.setup()
    await waitFor(() =>
      expect(container.querySelectorAll('tbody tr').length).toBe(2),
    )
    // First row's enabled checkbox is the first checkbox in the table.
    const checkboxes = container.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    )
    expect(checkboxes.length).toBeGreaterThanOrEqual(2)
    expect(checkboxes[0].checked).toBe(true)
    await user.click(checkboxes[0])
    await waitFor(() => {
      expect(patchedId).toBe('1')
      expect(patchedBody).toEqual({ enabled: false })
    })
  })

  it('clicking Delete with confirm=true calls useDeleteAlertRule with rule_id', async () => {
    const client = makeClient()
    client.setQueryData(qk.alertRules(), populated)
    let deletedId: string | null = null
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (method === 'DELETE' && /\/api\/alerts\/rules\/\d+$/.test(url)) {
          deletedId = url.split('/').pop() ?? null
          return new Response(null, { status: 204 })
        }
        return new Response(JSON.stringify(populated), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )
    // window.confirm is undefined in jsdom by default — assign a stub directly
    // (matches Vitest+jsdom guidance for browser dialog APIs).
    const confirmFn = vi.fn(() => true)
    window.confirm = confirmFn
    const { container } = render(
      <Wrap client={client}>
        <AlertRulesList />
      </Wrap>,
    )
    const user = userEvent.setup()
    await waitFor(() =>
      expect(container.querySelectorAll('tbody tr').length).toBe(2),
    )
    const deleteButtons = screen.getAllByRole('button', { name: /^Delete rule/i })
    expect(deleteButtons.length).toBeGreaterThanOrEqual(2)
    await user.click(deleteButtons[0])
    expect(confirmFn).toHaveBeenCalled()
    await waitFor(() => {
      expect(deletedId).toBe('1')
    })
  })

  it('clicking Delete with confirm=false does NOT call the delete mutation', async () => {
    const client = makeClient()
    client.setQueryData(qk.alertRules(), populated)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(populated), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const confirmFn = vi.fn(() => false)
    window.confirm = confirmFn
    const { container } = render(
      <Wrap client={client}>
        <AlertRulesList />
      </Wrap>,
    )
    const user = userEvent.setup()
    await waitFor(() =>
      expect(container.querySelectorAll('tbody tr').length).toBe(2),
    )
    const deleteButtons = screen.getAllByRole('button', { name: /^Delete rule/i })
    await user.click(deleteButtons[0])
    expect(confirmFn).toHaveBeenCalled()
    // Filter to DELETE calls only — there should be none.
    const deleteCalls = fetchMock.mock.calls.filter(([_input, init]) => {
      const i = init as RequestInit | undefined
      return (i?.method ?? 'GET') === 'DELETE'
    })
    expect(deleteCalls.length).toBe(0)
  })
})
