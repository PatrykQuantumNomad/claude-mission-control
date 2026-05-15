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
        if (method === 'GET' && url.endsWith('/api/alerts/metrics')) {
          // Phase 27 TDBT-02: useAlertMetrics is the SOLE source — the form
          // can't submit until the vocab resolves and the user picks a metric.
          return new Response(
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
    // Phase 27 TDBT-02: wait for useAlertMetrics to resolve, then select metric.
    await waitFor(() => {
      const select = screen.getByLabelText(/Metric/i) as HTMLSelectElement
      expect(select.disabled).toBe(false)
    })
    await user.selectOptions(screen.getByLabelText(/Metric/i), 'cost_usd_24h')
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
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url = String(input)
        if (url.endsWith('/api/alerts/metrics')) {
          // Phase 27 TDBT-02: route metrics so the user can pick a metric;
          // we want the test to assert that threshold_fire — not metric — is
          // the missing field that triggers the client error.
          return new Response(
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
    await user.type(screen.getByLabelText(/^Name/i), 'no-fire')
    // Phase 27 TDBT-02: wait for useAlertMetrics to resolve, then select metric.
    await waitFor(() => {
      const select = screen.getByLabelText(/Metric/i) as HTMLSelectElement
      expect(select.disabled).toBe(false)
    })
    await user.selectOptions(screen.getByLabelText(/Metric/i), 'cost_usd_24h')
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
        if (method === 'GET' && url.endsWith('/api/alerts/metrics')) {
          // Phase 27 TDBT-02: route metrics so the form can be submitted.
          return new Response(
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
    // Phase 27 TDBT-02: wait for useAlertMetrics to resolve, then select metric.
    await waitFor(() => {
      const select = screen.getByLabelText(/Metric/i) as HTMLSelectElement
      expect(select.disabled).toBe(false)
    })
    await user.selectOptions(screen.getByLabelText(/Metric/i), 'cost_usd_24h')
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

    // Phase 27 Plan 27-08 (TDBT-03) updated copy — honest non-specific
    // message replaces the Phase 21 "Could not parse" silent inline error.
    // The wrapper now carries role="alert" + the new locked copy + a Retry
    // button. The "no auto-save" invariant below is unchanged.
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      const text = alerts.map((el) => el.textContent ?? '').join(' ')
      expect(text).toMatch(/Couldn.t parse this description/i)
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

    // Phase 27 TDBT-02: useAlertMetrics is the SOLE source. After it resolves
    // the select contains a disabled "Select a metric…" placeholder option
    // (value="") plus one option per backend-returned metric. Filter the
    // placeholder out before comparing to the canonical vocabulary.
    await waitFor(() => {
      const select = screen.getByLabelText(/Metric/i) as HTMLSelectElement
      const values = Array.from(select.options)
        .map((o) => o.value)
        .filter((v) => v !== '')
        .sort()
      expect(values).toEqual([
        'cost_usd_24h',
        'dispatcher_failed_tasks_5m',
        'skill_p95_latency_ms',
      ])
    })
  })
})

// ---------------------------------------------------------------------------
// Phase 27 Plan 07 (TDBT-02) — useAlertMetrics as SOLE metric vocabulary source.
// ---------------------------------------------------------------------------

/** Pending Promise that never resolves — used to pin useAlertMetrics in the
 * loading state for the duration of a test. */
function neverResolves<T>(): Promise<T> {
  return new Promise<T>(() => {
    /* intentional no-op — pin in flight */
  })
}

describe('AlertRuleForm — TDBT-02 (Phase 27): useAlertMetrics is the SOLE source', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('TDBT-02: loading state renders "Loading metric vocabulary…" disabled placeholder', async () => {
    // Pin useAlertMetrics in flight so the select renders its loading state.
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url = String(input)
        if (url.endsWith('/api/alerts/metrics')) {
          // Never resolves — keeps metricsQuery.isLoading === true.
          return neverResolves<Response>()
        }
        return new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const client = makeClient()
    render(
      <Wrap client={client}>
        <AlertRuleForm />
      </Wrap>,
    )

    // Select is disabled while metricsQuery.isLoading.
    const select = screen.getByLabelText(/Metric/i) as HTMLSelectElement
    expect(select.disabled).toBe(true)
    // Loading placeholder option is the sole entry.
    const optionTexts = Array.from(select.options).map((o) => o.textContent ?? '')
    expect(optionTexts.some((t) => /loading metric vocabulary/i.test(t))).toBe(true)
  })

  it('TDBT-02: loaded state renders metric options from useAlertMetrics response with "Select a metric…" placeholder', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url = String(input)
        if (url.endsWith('/api/alerts/metrics')) {
          return new Response(
            JSON.stringify({ metrics: ['m_alpha', 'm_beta'] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const client = makeClient()
    render(
      <Wrap client={client}>
        <AlertRuleForm />
      </Wrap>,
    )

    // Wait for useAlertMetrics to resolve and the select to flip enabled.
    await waitFor(() => {
      const sel = screen.getByLabelText(/Metric/i) as HTMLSelectElement
      expect(sel.disabled).toBe(false)
    })

    const select = screen.getByLabelText(/Metric/i) as HTMLSelectElement
    // Two real options + the "Select a metric…" placeholder.
    const optionTexts = Array.from(select.options).map((o) => o.textContent ?? '')
    expect(optionTexts.some((t) => /select a metric/i.test(t))).toBe(true)
    expect(optionTexts.some((t) => t === 'm_alpha')).toBe(true)
    expect(optionTexts.some((t) => t === 'm_beta')).toBe(true)
    // Critically: no leftover fallback metric like cost_usd_24h slipped in
    // (would indicate the deleted FALLBACK constant is still being merged in).
    expect(optionTexts.some((t) => t === 'cost_usd_24h')).toBe(false)
  })

  it('TDBT-02: empty server response renders "No metrics available" disabled state', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url = String(input)
        if (url.endsWith('/api/alerts/metrics')) {
          return new Response(JSON.stringify({ metrics: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const client = makeClient()
    render(
      <Wrap client={client}>
        <AlertRuleForm />
      </Wrap>,
    )

    // Wait for the loaded-but-empty branch to render.
    await waitFor(() => {
      const sel = screen.getByLabelText(/Metric/i) as HTMLSelectElement
      // Disabled because knownMetrics.length === 0 AND not loading.
      expect(sel.disabled).toBe(true)
      const optionTexts = Array.from(sel.options).map((o) => o.textContent ?? '')
      expect(optionTexts.some((t) => /no metrics available/i.test(t))).toBe(true)
      // The loading placeholder must NOT be present anymore.
      expect(optionTexts.some((t) => /loading metric vocabulary/i.test(t))).toBe(false)
    })
  })

  it('TDBT-02: default draft initializers (threshold + anomaly) set metric to empty-string sentinel', async () => {
    // No-op fetch mock; we exercise the default state purely via the rendered DOM.
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url = String(input)
        if (url.endsWith('/api/alerts/metrics')) {
          return neverResolves<Response>()
        }
        return new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const client = makeClient()
    render(
      <Wrap client={client}>
        <AlertRuleForm />
      </Wrap>,
    )

    // Default kind is threshold; metric must be '' (empty-string sentinel)
    // — NOT a hard-coded vocabulary key like cost_usd_24h.
    const select = screen.getByLabelText(/Metric/i) as HTMLSelectElement
    expect(select.value).toBe('')

    // Switch to anomaly; same contract holds.
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /^Anomaly$/ }))
    const anomalySelect = screen.getByLabelText(/Metric/i) as HTMLSelectElement
    expect(anomalySelect.value).toBe('')
  })

  it('TDBT-02: submit-side validator rejects empty metric (Pitfall 2 typed-form pattern)', async () => {
    // Metrics endpoint returns a non-empty vocabulary so the select is
    // enabled — but the user leaves the placeholder selected (metric='').
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url = String(input)
        if (url.endsWith('/api/alerts/metrics')) {
          return new Response(
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
        return new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const client = makeClient()
    render(
      <Wrap client={client}>
        <AlertRuleForm />
      </Wrap>,
    )

    // Wait for the select to flip enabled (loaded state).
    await waitFor(() => {
      const sel = screen.getByLabelText(/Metric/i) as HTMLSelectElement
      expect(sel.disabled).toBe(false)
    })

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/^Name/i), 'no-metric-picked')
    await user.type(screen.getByLabelText(/Threshold fire/i), '10')
    // Deliberately DO NOT call selectOptions — leave metric=''.
    await user.click(screen.getByRole('button', { name: /Create rule/i }))

    // Client-side error rendered inline (Pitfall 2 typed-form pattern —
    // the form is preserved, no POST is fired).
    await waitFor(() => {
      expect(screen.getByText(/Metric is required/i)).toBeInTheDocument()
    })
    const postCalls = fetchMock.mock.calls.filter(
      ([_input, init]) => (init as RequestInit | undefined)?.method === 'POST',
    )
    expect(postCalls.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Phase 27 Plan 27-08 (TDBT-03) — AlertNlInput 503 retry UX.
// ---------------------------------------------------------------------------
//
// LOCKED OPERATOR DECISION 3 / V11 collapsed-failure-mode lock: the 503
// body cannot distinguish missing API key from Haiku rejecting output, so
// the frontend copy is intentionally NON-SPECIFIC. The retry button re-fires
// useParseAlertNl with the same payload as the Parse button. Backend route
// `backend/cmc/api/routes/alerts.py` is UNCHANGED — no discriminator field
// added to the 503 body. The 5 cases below lock the contract.

describe('AlertRuleForm — TDBT-03 (Phase 27 Plan 27-08): AlertNlInput 503 retry UX', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** Helper: install a fetch mock where /api/alerts/parse-nl always 503s.
   * Counts the number of POSTs so tests can assert "Retry re-fired".
   * Routes /api/alerts/metrics with the canonical vocab so the panel doesn't
   * crash on collateral queries. */
  function install503ParseNl() {
    const calls: { parseNl: number; rules: number } = { parseNl: 0, rules: 0 }
    const lastParseBody: { body: string | null } = { body: null }
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (method === 'POST' && url.endsWith('/api/alerts/parse-nl')) {
          calls.parseNl += 1
          lastParseBody.body = init?.body ? String(init.body) : null
          return new Response(
            JSON.stringify({ error: 'natural-language alerts unavailable' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (method === 'GET' && url.endsWith('/api/alerts/metrics')) {
          return new Response(
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
          calls.rules += 1
        }
        return new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )
    return { spy, calls, lastParseBody }
  }

  it('TDBT-03: renders honest copy + Retry button on 503 (replaces silent <p>)', async () => {
    install503ParseNl()

    const client = makeClient()
    render(
      <Wrap client={client}>
        <AlertRuleForm />
      </Wrap>,
    )
    const user = userEvent.setup()

    await user.type(
      screen.getByLabelText(/describe in natural language/i),
      'alert me when haiku skill p95 exceeds 5s for 10 minutes',
    )
    await user.click(screen.getByRole('button', { name: /^Parse$/ }))

    // Honest LOCKED OPERATOR DECISION 3 copy — both halves of the sentence
    // must render so the user sees the full non-specific message. Use a
    // regex that ignores apostrophe encoding (the JSX uses &apos; → "'").
    await waitFor(() => {
      expect(
        screen.getByText(/Couldn.t parse this description/i),
      ).toBeInTheDocument()
    })
    expect(
      screen.getByText(/natural-language service is temporarily unavailable/i),
    ).toBeInTheDocument()

    // Retry button rendered with the registered testid (exact-match).
    const retry = screen.getByTestId('alert-nl-retry')
    expect(retry).toBeInTheDocument()
    expect(retry).toHaveTextContent(/^Retry$/)
    // The Phase 21 silent <p> ("Could not parse — please rephrase") must NOT
    // be in the DOM anymore; the honest block replaces it.
    expect(screen.queryByText(/Could not parse — please rephrase/i)).toBeNull()
    // role="alert" is preserved on the wrapper for a11y (screen readers
    // announce both the message and the Retry control as one unit).
    const alerts = screen.getAllByRole('alert')
    expect(
      alerts.some((el) =>
        (el.textContent ?? '').includes("Couldn"),
      ),
    ).toBe(true)
  })

  it('TDBT-03: Retry button re-fires useParseAlertNl with the same payload', async () => {
    const { calls, lastParseBody } = install503ParseNl()

    const client = makeClient()
    render(
      <Wrap client={client}>
        <AlertRuleForm />
      </Wrap>,
    )
    const user = userEvent.setup()

    const description = 'alert me when cost_usd_24h exceeds 5'
    await user.type(
      screen.getByLabelText(/describe in natural language/i),
      description,
    )
    // First Parse → 503.
    await user.click(screen.getByRole('button', { name: /^Parse$/ }))
    await waitFor(() => {
      expect(screen.getByTestId('alert-nl-retry')).toBeInTheDocument()
    })
    expect(calls.parseNl).toBe(1)
    const firstBody = lastParseBody.body
    expect(firstBody).not.toBeNull()
    expect(JSON.parse(firstBody as string)).toEqual({ description })

    // Click Retry → second POST with SAME body (no re-typing required).
    await user.click(screen.getByTestId('alert-nl-retry'))
    await waitFor(() => {
      expect(calls.parseNl).toBe(2)
    })
    const secondBody = lastParseBody.body
    expect(secondBody).not.toBeNull()
    expect(JSON.parse(secondBody as string)).toEqual({ description })
    // Same payload pattern as Parse button — Pitfall 5 / LOCKED OPERATOR
    // DECISION 3 lock: Retry never mutates the payload.
    expect(secondBody).toBe(firstBody)

    // Retry must NOT auto-save (no /api/alerts/rules POST while still in
    // 503 — PITFALLS lockout from Phase 21).
    expect(calls.rules).toBe(0)
  })

  it('TDBT-03: Retry button is disabled while m.isPending (DoS guard)', async () => {
    // Hold the second /api/alerts/parse-nl call open so the mutation stays
    // in flight after the user clicks Retry. The first call resolves
    // synchronously to 503 so the error block + Retry button render; the
    // second call (after Retry) hangs, pinning m.isPending=true so we can
    // assert the disabled state + "Retrying…" label.
    //
    // Use a "next response" register that flips after the first call lands
    // — more robust than incrementing-counter-with-conditional because the
    // counter strategy ran afoul of intermediate microtask scheduling in
    // testing-library/userEvent during initial implementation (the first
    // call's response was getting eaten by an early-rendered click handler
    // that fired Parse before the user-event sequence finished).
    type Pending = {
      resolve: (r: Response) => void
      promise: Promise<Response>
    }
    function makePending(): Pending {
      let resolve!: (r: Response) => void
      const promise = new Promise<Response>((r) => {
        resolve = r
      })
      return { resolve, promise }
    }
    const heldSecond = makePending()
    let parseNlCallCount = 0

    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (method === 'POST' && url.endsWith('/api/alerts/parse-nl')) {
          parseNlCallCount += 1
          if (parseNlCallCount === 1) {
            // First call — return 503 immediately so the Retry button mounts.
            return new Response(
              JSON.stringify({ error: 'natural-language alerts unavailable' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } },
            )
          }
          // Second call (Retry) — hang so m.isPending stays true.
          return heldSecond.promise
        }
        if (method === 'GET' && url.endsWith('/api/alerts/metrics')) {
          return new Response(
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
        return new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const client = makeClient()
    render(
      <Wrap client={client}>
        <AlertRuleForm />
      </Wrap>,
    )
    const user = userEvent.setup()

    await user.type(
      screen.getByLabelText(/describe in natural language/i),
      'alert me when cost is too high',
    )
    await user.click(screen.getByRole('button', { name: /^Parse$/ }))
    // Wait for the first 503 → m.isError to render the Retry button. The
    // default findByTestId timeout (1000ms) is plenty for a synchronously-
    // resolved 503 + a React-Query state flip.
    const retry = await screen.findByTestId('alert-nl-retry')
    expect(retry).not.toBeDisabled()
    expect(retry).toHaveTextContent(/^Retry$/)

    // Click Retry — second call is held open, m.isPending flips to true.
    await user.click(retry)

    // Retry is now disabled + label switches to "Retrying…".
    await waitFor(() => {
      expect(screen.getByTestId('alert-nl-retry')).toBeDisabled()
    })
    expect(screen.getByTestId('alert-nl-retry')).toHaveTextContent(/Retrying/)

    // Release the hold so the test doesn't leak the promise (defensive
    // cleanup; vi.restoreAllMocks in afterEach also covers this).
    heldSecond.resolve(
      new Response(
        JSON.stringify({ error: 'natural-language alerts unavailable' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      ),
    )
  })

  it('TDBT-03: non-specific copy invariant — NO "credentials missing" / "Anthropic" / "API key" strings', async () => {
    // This is the documentation test that locks the V11 collapsed-failure-
    // mode invariant. The backend's 503 body cannot distinguish missing API
    // key from Haiku rejecting output (see backend/cmc/api/routes/alerts.py
    // + 21-RESEARCH.md PITFALLS). Adding specific strings would be dishonest.
    install503ParseNl()

    const client = makeClient()
    render(
      <Wrap client={client}>
        <AlertRuleForm />
      </Wrap>,
    )
    const user = userEvent.setup()

    await user.type(
      screen.getByLabelText(/describe in natural language/i),
      'alert me when haiku skill p95 spikes',
    )
    await user.click(screen.getByRole('button', { name: /^Parse$/ }))
    const retry = await screen.findByTestId('alert-nl-retry')
    expect(retry).toBeInTheDocument()

    // Scope to the alert wrapper so we don't false-match on copy elsewhere
    // in the form (the registry doc would never render in the panel, but
    // belt-and-braces).
    const alertWrappers = screen.getAllByRole('alert')
    const honestWrapper = alertWrappers.find((el) =>
      (el.textContent ?? '').includes("Couldn"),
    )
    expect(honestWrapper).toBeDefined()
    const text = honestWrapper!.textContent ?? ''
    expect(text).not.toMatch(/credentials missing/i)
    expect(text).not.toMatch(/Anthropic/i)
    expect(text).not.toMatch(/API key/i)
  })

  it('TDBT-03: manual ThresholdForm fields remain usable below AlertNlInput after 503 (Phase 21 Pitfall 5 invariant)', async () => {
    install503ParseNl()

    const client = makeClient()
    render(
      <Wrap client={client}>
        <AlertRuleForm />
      </Wrap>,
    )
    const user = userEvent.setup()

    await user.type(
      screen.getByLabelText(/describe in natural language/i),
      'asdf qwerty nonsense',
    )
    await user.click(screen.getByRole('button', { name: /^Parse$/ }))
    await screen.findByTestId('alert-nl-retry')

    // Manual form below AlertNlInput stays enabled — 503 in the composer
    // never blocks the manual draft (Phase 21 Pitfall 5 invariant).
    expect(screen.getByLabelText(/^Name/i)).not.toBeDisabled()
    expect(screen.getByLabelText(/Threshold fire/i)).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /^Threshold$/ })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /^Anomaly$/ })).not.toBeDisabled()

    // The user can type into the manual form even with the 503 visible.
    await user.type(screen.getByLabelText(/^Name/i), 'manual-fallback')
    expect(screen.getByLabelText(/^Name/i)).toHaveValue('manual-fallback')
  })
})
