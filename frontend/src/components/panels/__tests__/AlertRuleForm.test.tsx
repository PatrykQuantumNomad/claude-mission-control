// AlertRuleForm — ALRT-10 (Phase 15 Plan 05).
//
// Strategy: render the form directly (no Sheet wrapper — this composer is
// inline in the /alerts page). Verify the threshold/anomaly tab switch
// shows/hides anomaly-only inputs (min_samples, window_n). Mutation
// invocation verified via fetch-mock URL inspection — same idiom as
// SchedulesCard / TaskComposer tests.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, userEvent, waitFor } from '../../../test/utils'
import { AlertRuleForm } from '../AlertRuleForm'
import type { AlertRule } from '../../../lib/api'

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

function makeCreatedRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    rule_id: 99,
    name: 'created',
    kind: 'threshold',
    metric: 'cost_usd_24h',
    threshold_fire: 10,
    threshold_clear: null,
    min_dwell_seconds: 0,
    min_samples: 5,
    cooldown_seconds: 0,
    enabled: true,
    spec_version: 1,
    params_json: {},
    created_at: '2026-05-04T00:00:00Z',
    updated_at: '2026-05-04T00:00:00Z',
    ...overrides,
  }
}

describe('AlertRuleForm', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeCreatedRule()), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders default threshold form: threshold_fire visible, anomaly-only fields hidden', () => {
    const client = makeClient()
    render(
      <Wrap client={client}>
        <AlertRuleForm />
      </Wrap>,
    )
    expect(screen.getByText('ALRT-10')).toBeInTheDocument()
    expect(screen.getByText('Create alert rule')).toBeInTheDocument()
    // Threshold tab is the default.
    const thresholdBtn = screen.getByRole('button', { name: /^Threshold$/ })
    expect(thresholdBtn.getAttribute('aria-pressed')).toBe('true')
    // threshold_fire field visible.
    expect(screen.getByLabelText(/Threshold fire/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Threshold clear/i)).toBeInTheDocument()
    // Anomaly-only fields are NOT rendered.
    expect(screen.queryByLabelText(/Min samples/i)).toBeNull()
    expect(screen.queryByLabelText(/Window N/i)).toBeNull()
  })

  it('switching to Anomaly tab reveals min_samples + window_n inputs', async () => {
    const client = makeClient()
    render(
      <Wrap client={client}>
        <AlertRuleForm />
      </Wrap>,
    )
    const user = userEvent.setup()
    const anomalyBtn = screen.getByRole('button', { name: /^Anomaly$/ })
    await user.click(anomalyBtn)
    expect(anomalyBtn.getAttribute('aria-pressed')).toBe('true')
    // Anomaly-only fields now visible.
    expect(screen.getByLabelText(/Min samples/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Window N/i)).toBeInTheDocument()
    // Threshold-fire field is still visible (relabeled to "Z-score fire").
    expect(screen.getByLabelText(/Z-score fire/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Z-score clear/i)).toBeInTheDocument()
  })

  it('submitting a valid threshold form POSTs to /api/alerts/rules with the expected body shape', async () => {
    const client = makeClient()
    let postedBody: Record<string, unknown> | null = null
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (method === 'POST' && url.endsWith('/api/alerts/rules')) {
          postedBody = init?.body ? JSON.parse(String(init.body)) : null
          return new Response(JSON.stringify(makeCreatedRule()), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )
    render(
      <Wrap client={client}>
        <AlertRuleForm />
      </Wrap>,
    )
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/^Name/i), 'test-cost')
    await user.type(screen.getByLabelText(/Threshold fire/i), '10')
    await user.click(screen.getByRole('button', { name: /Create rule/i }))
    await waitFor(() => {
      expect(postedBody).not.toBeNull()
    })
    expect(postedBody).toMatchObject({
      name: 'test-cost',
      kind: 'threshold',
      metric: 'cost_usd_24h',
      threshold_fire: 10,
      enabled: true,
      min_dwell_seconds: 0,
      cooldown_seconds: 0,
    })
  })

  it('submitting threshold without threshold_fire shows client error and does NOT call mutation', async () => {
    const client = makeClient()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    render(
      <Wrap client={client}>
        <AlertRuleForm />
      </Wrap>,
    )
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/^Name/i), 'no-fire')
    // Leave threshold_fire blank.
    await user.click(screen.getByRole('button', { name: /Create rule/i }))
    await waitFor(() => {
      expect(
        screen.getByText(/Threshold rules require a numeric threshold_fire/i),
      ).toBeInTheDocument()
    })
    // No POST should have been made.
    const postCalls = fetchMock.mock.calls.filter(
      ([_input, init]) => (init as RequestInit | undefined)?.method === 'POST',
    )
    expect(postCalls.length).toBe(0)
  })

  it('422 server error surfaces the error detail inline (role=alert)', async () => {
    const client = makeClient()
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (method === 'POST' && url.endsWith('/api/alerts/rules')) {
          return new Response(
            JSON.stringify({ detail: 'threshold_clear must be < threshold_fire' }),
            {
              status: 422,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
        return new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )
    render(
      <Wrap client={client}>
        <AlertRuleForm />
      </Wrap>,
    )
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/^Name/i), 'invalid')
    await user.type(screen.getByLabelText(/Threshold fire/i), '5')
    await user.click(screen.getByRole('button', { name: /Create rule/i }))
    // Server-side error renders via m.error.message inside a role=alert paragraph.
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      // At least one alert should contain the threshold_clear text or 422.
      const text = alerts.map((el) => el.textContent ?? '').join(' ')
      expect(text).toMatch(/threshold_clear|422/i)
    })
  })
})
