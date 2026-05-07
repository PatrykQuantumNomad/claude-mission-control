// AlertRuleForm — ALRT-10 (Phase 15 Plan 05) + ALRT-14 (Phase 21 Plan 21-03).
//
// Strategy: render the form directly (no Sheet wrapper — this composer is
// inline in the /alerts page). Verify the threshold/anomaly tab switch
// shows/hides anomaly-only inputs (min_samples, window_n). Mutation
// invocation verified via fetch-mock URL inspection — same idiom as
// SchedulesCard / TaskComposer tests.
//
// Phase 21 Plan 21-03 additions: NL parse → preview modal → save flow tests
// + parse-failure inline-error tests + manual-fields-disabled-while-preview-
// open guard + useAlertMetrics-driven options test. Mocks fetch for both
// /api/alerts/parse-nl and /api/alerts/metrics (mirror the existing fetch-
// spy pattern; the project does not module-mock api in panel tests).

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

// ---------------------------------------------------------------------------
// Phase 21 Plan 21-03 (ALRT-14) — NL → preview → save flow + sync.
// ---------------------------------------------------------------------------

/** AlertRuleCreate the mocked /api/alerts/parse-nl returns. Anomaly kind so
 * the preview modal exercises the params_json branch (window_kind/window_n). */
function makeParsedAnomalyRule() {
  return {
    name: 'haiku-p95-spike',
    kind: 'anomaly' as const,
    metric: 'skill_p95_latency_ms',
    threshold_fire: 5000,
    threshold_clear: null,
    min_samples: 10,
    min_dwell_seconds: 600,
    cooldown_seconds: 0,
    enabled: true,
    spec_version: 1,
    params_json: { window_kind: 'ewma', window_n: 50 },
  }
}

interface RoutedFetchOpts {
  parseNlResponse?: () => Response | Promise<Response>
  metricsResponse?: () => Response | Promise<Response>
  rulesPostCapture?: { body: Record<string, unknown> | null }
  rulesPostResponse?: () => Response | Promise<Response>
}

/** Routes fetch calls by URL+method so each Phase 21 NL test can compose
 * just the routes it cares about. Unmatched routes return an empty 200 to
 * avoid the panel crashing on collateral queries (e.g. useAlertMetrics in
 * tests that don't care about it). */
function installRoutedFetch(opts: RoutedFetchOpts = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (method === 'POST' && url.endsWith('/api/alerts/parse-nl')) {
        return opts.parseNlResponse
          ? await opts.parseNlResponse()
          : new Response(
              JSON.stringify({
                rule: makeParsedAnomalyRule(),
                description: 'alert me when haiku skill p95 exceeds 5s for 10 minutes',
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            )
      }
      if (method === 'GET' && url.endsWith('/api/alerts/metrics')) {
        return opts.metricsResponse
          ? await opts.metricsResponse()
          : new Response(
              JSON.stringify({
                metrics: [
                  'cost_usd_24h',
                  'dispatcher_failed_tasks_5m',
                  'skill_p95_latency_ms',
                ],
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            )
      }
      if (method === 'POST' && url.endsWith('/api/alerts/rules')) {
        if (opts.rulesPostCapture) {
          opts.rulesPostCapture.body = init?.body ? JSON.parse(String(init.body)) : null
        }
        return opts.rulesPostResponse
          ? await opts.rulesPostResponse()
          : new Response(
              JSON.stringify({ ...makeParsedAnomalyRule(), rule_id: 99 }),
              { status: 201, headers: { 'Content-Type': 'application/json' } },
            )
      }
      return new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    },
  )
}

describe('AlertRuleForm — NL authoring (ALRT-14)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('NL parse → preview modal → save fires useCreateAlertRule with the parsed rule (NOT merged)', async () => {
    const capture: { body: Record<string, unknown> | null } = { body: null }
    installRoutedFetch({ rulesPostCapture: capture })

    const client = makeClient()
    render(
      <Wrap client={client}>
        <AlertRuleForm />
      </Wrap>,
    )
    const user = userEvent.setup()

    // Type into the NL input, click Parse.
    await user.type(
      screen.getByLabelText(/describe in natural language/i),
      'alert me when haiku skill p95 exceeds 5s for 10 minutes',
    )
    await user.click(screen.getByRole('button', { name: /^Parse$/ }))

    // Preview modal opens (Radix portals to document.body).
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toBeInTheDocument()
    // The parsed metric value renders inside the modal (read-only preview).
    expect(
      Array.from(dialog.querySelectorAll('dd')).some((el) =>
        (el.textContent ?? '').includes('skill_p95_latency_ms'),
      ),
    ).toBe(true)

    // Click Save in the modal — the AlertDialog action button.
    await user.click(screen.getByRole('button', { name: /^Save$/ }))

    // The captured body must be the PARSED rule, not a merged manual draft.
    await waitFor(() => {
      expect(capture.body).not.toBeNull()
    })
    expect(capture.body).toMatchObject({
      name: 'haiku-p95-spike',
      kind: 'anomaly',
      metric: 'skill_p95_latency_ms',
      threshold_fire: 5000,
      // Manual draft default name was '' — if Save merged with manual draft,
      // `name` would be '' (or 'haiku-p95-spike' overlaid). The Pitfall 5
      // contract says the parsed rule is fired DIRECTLY.
    })
    // Manual draft default kind is 'threshold'; if merged, kind would be
    // 'threshold' instead of the parsed 'anomaly'. Lock the contract.
    expect((capture.body as { kind: string }).kind).toBe('anomaly')
  })

  it('NL parse failure renders inline could-not-parse message; does NOT auto-save', async () => {
    const rulesPostCapture: { body: Record<string, unknown> | null } = { body: null }
    installRoutedFetch({
      parseNlResponse: () =>
        new Response(
          JSON.stringify({ error: 'natural-language alerts unavailable' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        ),
      rulesPostCapture,
    })

    const client = makeClient()
    render(
      <Wrap client={client}>
        <AlertRuleForm />
      </Wrap>,
    )
    const user = userEvent.setup()

    await user.type(
      screen.getByLabelText(/describe in natural language/i),
      'asdf qwerty nonsense prompt',
    )
    await user.click(screen.getByRole('button', { name: /^Parse$/ }))

    // Inline role="alert" "Could not parse — please rephrase" message.
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      const text = alerts.map((el) => el.textContent ?? '').join(' ')
      expect(text).toMatch(/could not parse/i)
    })
    // Modal must NOT be in the DOM.
    expect(screen.queryByRole('alertdialog')).toBeNull()
    // POST /api/alerts/rules must NOT have been called (no auto-save, no
    // fallback rule — PITFALLS lockout).
    expect(rulesPostCapture.body).toBeNull()
  })

  it('manual form fields are disabled while the preview modal is open; re-enabled on Cancel', async () => {
    installRoutedFetch()

    const client = makeClient()
    render(
      <Wrap client={client}>
        <AlertRuleForm />
      </Wrap>,
    )
    const user = userEvent.setup()

    // Sanity: name input is enabled before parse.
    expect(screen.getByLabelText(/^Name/i)).not.toBeDisabled()

    await user.type(
      screen.getByLabelText(/describe in natural language/i),
      'alert me when haiku skill p95 exceeds 5s for 10 minutes',
    )
    await user.click(screen.getByRole('button', { name: /^Parse$/ }))

    // Modal opens.
    await screen.findByRole('alertdialog')

    // Manual form fields disabled while preview open (Pitfall 5 single-source).
    expect(screen.getByLabelText(/^Name/i)).toBeDisabled()
    expect(screen.getByLabelText(/Metric/i)).toBeDisabled()

    // Cancel the modal.
    await user.click(screen.getByRole('button', { name: /^Cancel$/ }))

    // Modal closes.
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull()
    })

    // Manual fields re-enabled.
    expect(screen.getByLabelText(/^Name/i)).not.toBeDisabled()
    expect(screen.getByLabelText(/Metric/i)).not.toBeDisabled()
  })

  it('useAlertMetrics drives the metric <select> options at runtime', async () => {
    // Backend exposes the canonical 3-metric vocabulary; the select reflects it.
    installRoutedFetch()

    const client = makeClient()
    render(
      <Wrap client={client}>
        <AlertRuleForm />
      </Wrap>,
    )

    // useAlertMetrics resolves on mount; the select renders all three options
    // by `value` (label may be the user-facing label OR the raw key for any
    // future metric the backend exposes ahead of the frontend constant).
    await waitFor(() => {
      const select = screen.getByLabelText(/Metric/i) as HTMLSelectElement
      const values = Array.from(select.options).map((o) => o.value).sort()
      expect(values).toEqual([
        'cost_usd_24h',
        'dispatcher_failed_tasks_5m',
        'skill_p95_latency_ms',
      ])
    })
  })
})
