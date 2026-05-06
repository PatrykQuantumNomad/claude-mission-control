import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import {
  qk,
  useAckAlert,
  useAlertEvents,
  useAlertRules,
  useAttention,
  useByProject,
  useCache,
  useCreateAlertRule,
  useDeleteAlertRule,
  useEdits,
  useFailures,
  useFanout,
  useFollowUpMessage,
  useHeatmap,
  useHooks,
  useLatency,
  useLiveSessions,
  useMcpServers,
  useMcpTools,
  useOutcomes,
  usePatchAlertRule,
  usePressure,
  useProductivity,
  useCostBreakdown,
  useCostForecast,
  useSessionCompare,
  useSessionDetails,
  useSessionsList,
  useSkillCost,
  useSkillLatency,
  useSkillRuns,
  useSkillUsage,
  useSummary,
  useSystemHealth,
  useTokens,
} from '../queries'
import type { AlertRule, AlertRuleListResponse } from '../api'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        // Disable polling timers in unit tests — we only assert the configured
        // refetchInterval value via getQueryDefaults / getQueryCache, never the
        // real timer firing.
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

function jsonResponse<T>(body: T, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const RULE: AlertRule = {
  rule_id: 1,
  name: 'pressure-high',
  kind: 'threshold',
  metric: 'context_pressure',
  threshold_fire: 0.9,
  threshold_clear: 0.7,
  min_dwell_seconds: 60,
  min_samples: 5,
  cooldown_seconds: 600,
  enabled: true,
  spec_version: 1,
  params_json: {},
  created_at: '2026-05-04T00:00:00Z',
  updated_at: '2026-05-04T00:00:00Z',
}

const RULES_RESPONSE: AlertRuleListResponse = {
  items: [RULE],
  total: 1,
}

// ---------------------------------------------------------------------------
// qk factory
// ---------------------------------------------------------------------------

describe('queries.qk factory', () => {
  it('builds the expected token-usage key shape', () => {
    expect(qk.tokens('7d')).toEqual(['usage', 'tokens', '7d'])
  })

  it('builds the expected session-details key shape', () => {
    expect(qk.sessionDetails('abc')).toEqual(['sessions', 'abc', 'details'])
  })

  it('keys are range-scoped so cache slices do not collide', () => {
    expect(qk.outcomes('today')).not.toEqual(qk.outcomes('30d'))
    expect(qk.byProject('all')).not.toEqual(qk.byProject('30d'))
  })

  it('liveSessions and sessionsList have stable prefix shapes', () => {
    expect(qk.liveSessions()).toEqual(['sessions', 'live'])
    const params = { range: '7d' as const, limit: 50, offset: 0 }
    expect(qk.sessionsList(params)).toEqual(['sessions', 'list', params])
  })

  it('mcpTools key is server-scoped', () => {
    expect(qk.mcpTools('git')).toEqual(['mcp', 'git', 'tools'])
    expect(qk.mcpTools('git')).not.toEqual(qk.mcpTools('fs'))
  })

  // Phase 14 (SKIL-04..07) — verify skill-* keys are uniquely scoped (Pitfall 5
  // from 14-RESEARCH.md: never reuse the bare 'skills' prefix used by the
  // catalog endpoint or the analytics keys would collide on invalidation).
  it('skill analytics keys are scoped per dimension and per param', () => {
    expect(qk.skillUsage('14d', 10)).toEqual(['skill-usage', '14d', 10])
    expect(qk.skillUsage('30d', 10)).not.toEqual(qk.skillUsage('14d', 10))
    // Phase 19 hotfix: limit is part of the key so the four production
    // callers (limit=1/10/20/200) don't share a single cache entry.
    expect(qk.skillUsage('14d', 1)).not.toEqual(qk.skillUsage('14d', 200))

    expect(qk.skillCost('analyze', '14d')).toEqual(['skill-cost', 'analyze', '14d'])
    expect(qk.skillCost('analyze', '14d')).not.toEqual(qk.skillCost('build', '14d'))
    expect(qk.skillCost('analyze', '14d')).not.toEqual(qk.skillCost('analyze', '30d'))

    expect(qk.skillLatency('analyze', '14d')).toEqual([
      'skill-latency',
      'analyze',
      '14d',
    ])

    expect(qk.skillRuns('analyze', 20)).toEqual(['skill-runs', 'analyze', 20])
    expect(qk.skillRuns('analyze', 20)).not.toEqual(qk.skillRuns('analyze', 50))

    // None of the skill-analytics keys collide with the catalog 'skills' key.
    const catalog = qk.skills() as readonly string[]
    expect(catalog).toEqual(['skills'])
    expect(qk.skillUsage('14d', 10)[0]).not.toBe(catalog[0])
    expect(qk.skillCost('a', '14d')[0]).not.toBe(catalog[0])
  })

  // Phase 15 Plan 04 (ALRT-09/10) — verify alert-* keys are uniquely scoped
  // and NEVER reuse the bare 'alerts' prefix (Pitfall 5 from 14-RESEARCH.md
  // carried — same rule that keeps 'skill-*' separated from 'skills').
  it('alert keys are kebab-prefixed and never reuse a bare "alerts" prefix', () => {
    expect(qk.alertRules()).toEqual(['alert-rules'])
    expect(qk.alertEvents('7d')).toEqual(['alert-events', '7d'])
    expect(qk.alertEvents('1d')).not.toEqual(qk.alertEvents('7d'))
    expect(qk.alertEvents('14d')).not.toEqual(qk.alertEvents('30d'))

    // No collision with the skill-* keys or the bare 'alerts' string.
    expect(qk.alertRules()).not.toEqual(qk.skills())
    expect(qk.alertRules()[0]).not.toBe('alerts')
    expect(qk.alertEvents('7d')[0]).not.toBe('alerts')
    expect(qk.alertRules()[0]).toBe('alert-rules')
    expect(qk.alertEvents('7d')[0]).toBe('alert-events')
  })

  // Phase 20 Plan 03 (ANLY-06 + ANLY-07) — verify cost-* keys are uniquely
  // scoped (kebab-prefixed) AND that qk.costBreakdown discriminates on BOTH
  // dim and range. STATE.md L121 cache-key discipline lesson from Phase 19
  // hotfix da592ff: every TanStack-Query hook param affecting response shape
  // MUST appear in the queryKey.
  it('cost keys are kebab-prefixed and discriminate on every shape-affecting param', () => {
    // costForecast — no params (server-clock derived); stable identity per
    // call (different array references but structurally equal).
    expect(qk.costForecast()).toEqual(['cost-forecast'])
    // costBreakdown — both dim AND range are part of the key.
    expect(qk.costBreakdown('project', '7d')).toEqual([
      'cost-breakdown',
      'project',
      '7d',
    ])
    // dim discriminates
    expect(qk.costBreakdown('project', '7d')).not.toEqual(
      qk.costBreakdown('model', '7d'),
    )
    expect(qk.costBreakdown('project', '7d')).not.toEqual(
      qk.costBreakdown('skill', '7d'),
    )
    // range discriminates (the Phase 19 hotfix lesson — both params keyed)
    expect(qk.costBreakdown('project', '7d')).not.toEqual(
      qk.costBreakdown('project', '30d'),
    )
    expect(qk.costBreakdown('project', '1d')).not.toEqual(
      qk.costBreakdown('project', '14d'),
    )

    // No collision with bare 'cost' or with skill/alert kebab prefixes.
    expect(qk.costForecast()[0]).toBe('cost-forecast')
    expect(qk.costBreakdown('project', '7d')[0]).toBe('cost-breakdown')
    expect(qk.costForecast()).not.toEqual(qk.skills())
    expect(qk.costForecast()).not.toEqual(qk.alertRules())
  })
})

// ---------------------------------------------------------------------------
// Surface area pin — every public hook + mutation export
// ---------------------------------------------------------------------------

describe('queries surface area', () => {
  it('exports the panel hooks + the mutations (Phase 16 adds 1 hook: useSessionCompare)', () => {
    // Smoke test: importing the names succeeds. If any export is removed
    // or renamed, the import line at the top of this file would have
    // failed at module-load time. This test pins the surface explicitly
    // so a reviewer can grep for it.
    const exported = [
      useSystemHealth,
      useAttention,
      useSummary,
      usePressure,
      useLiveSessions,
      useSessionDetails,
      useTokens,
      useCache,
      useOutcomes,
      useLatency,
      useHooks,
      useByProject,
      useFanout,
      useEdits,
      useProductivity,
      useMcpServers,
      useMcpTools,
      useHeatmap,
      useFailures,
      useSessionsList,
      // Phase 14 (SKIL-04..07) — 4 analytics hooks
      useSkillUsage,
      useSkillCost,
      useSkillLatency,
      useSkillRuns,
      // Phase 15 (ALRT-09/10) — 2 hooks + 4 mutations
      useAlertRules,
      useAlertEvents,
      useCreateAlertRule,
      usePatchAlertRule,
      useDeleteAlertRule,
      useAckAlert,
      useFollowUpMessage,
      // Phase 16 (CMPR-01..05) — 1 paired-session compare hook
      useSessionCompare,
      // Phase 20 (ANLY-06 + ANLY-07) — 2 cost dashboard hooks
      useCostForecast,
      useCostBreakdown,
    ]
    // 27 query hooks + 5 mutations (4 alert + 1 follow-up) + 2 cost = 34
    expect(exported).toHaveLength(34)
    for (const fn of exported) {
      expect(typeof fn).toBe('function')
    }
  })
})

// ---------------------------------------------------------------------------
// Phase 15 alert hooks — cadence locked at 30s/20s
// ---------------------------------------------------------------------------

describe('Phase 15 alerts — cadence', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn> | undefined

  beforeEach(() => {
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(RULES_RESPONSE))
  })
  afterEach(() => {
    fetchSpy?.mockRestore()
  })

  it('useAlertRules query is configured at refetchInterval=30_000 / staleTime=20_000', async () => {
    const client = makeClient()
    const wrapper = makeWrapper(client)
    renderHook(() => useAlertRules(), { wrapper })
    await waitFor(() => {
      const cache = client.getQueryCache().findAll({ queryKey: qk.alertRules() })
      expect(cache.length).toBeGreaterThan(0)
    })
    const entry = client.getQueryCache().findAll({ queryKey: qk.alertRules() })[0]
    // react-query v5 stores observer-supplied options in entry.observers[0].options
    const opts = entry.observers[0].options
    expect(opts.refetchInterval).toBe(30_000)
    expect(opts.staleTime).toBe(20_000)
  })

  it('useAlertEvents query is configured at refetchInterval=30_000 / staleTime=20_000', async () => {
    fetchSpy?.mockResolvedValue(
      jsonResponse({ range: '7d', items: [], total: 0 }),
    )
    const client = makeClient()
    const wrapper = makeWrapper(client)
    renderHook(() => useAlertEvents('7d'), { wrapper })
    await waitFor(() => {
      const cache = client.getQueryCache().findAll({ queryKey: qk.alertEvents('7d') })
      expect(cache.length).toBeGreaterThan(0)
    })
    const entry = client.getQueryCache().findAll({ queryKey: qk.alertEvents('7d') })[0]
    const opts = entry.observers[0].options
    expect(opts.refetchInterval).toBe(30_000)
    expect(opts.staleTime).toBe(20_000)
  })
})

// ---------------------------------------------------------------------------
// Phase 15 alert mutations — invalidation pattern + optimistic surgical policy
// ---------------------------------------------------------------------------

describe('Phase 15 alerts — useCreateAlertRule', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn> | undefined
  beforeEach(() => {
    // POST /api/alerts/rules → return the created rule.
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(RULE))
  })
  afterEach(() => {
    fetchSpy?.mockRestore()
  })

  it('invalidates the alert-rules query key on success', async () => {
    const client = makeClient()
    const wrapper = makeWrapper(client)
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useCreateAlertRule(), { wrapper })
    await result.current.mutateAsync({
      name: 'pressure-high',
      kind: 'threshold',
      metric: 'context_pressure',
      threshold_fire: 0.9,
      threshold_clear: 0.7,
    })
    // The mutation's onSuccess should have queued an invalidate for ['alert-rules'].
    const alertInvalidations = invalidateSpy.mock.calls.filter((c) => {
      const arg = c[0] as { queryKey?: unknown[] } | undefined
      return Array.isArray(arg?.queryKey) && arg!.queryKey![0] === 'alert-rules'
    })
    expect(alertInvalidations.length).toBeGreaterThanOrEqual(1)
  })
})

describe('Phase 15 alerts — usePatchAlertRule (surgical optimism)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn> | undefined
  beforeEach(() => {
    // PATCH /api/alerts/rules/{id} → return the patched rule (toggled enabled).
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ ...RULE, enabled: false }))
  })
  afterEach(() => {
    fetchSpy?.mockRestore()
  })

  it('applies an optimistic update for an enabled-only patch (idempotent toggle)', async () => {
    const client = makeClient()
    client.setQueryData<AlertRuleListResponse>(qk.alertRules(), RULES_RESPONSE)
    const wrapper = makeWrapper(client)
    const { result } = renderHook(() => usePatchAlertRule(), { wrapper })

    // Hold the network response long enough to observe the optimistic state.
    let resolvePatch: ((r: Response) => void) | undefined
    const pending = new Promise<Response>((resolve) => {
      resolvePatch = resolve
    })
    fetchSpy?.mockImplementationOnce(() => pending)

    const promise = result.current.mutateAsync({ id: 1, body: { enabled: false } })

    // Optimistic phase: cache should reflect enabled=false BEFORE the network resolves.
    await waitFor(() => {
      const snap = client.getQueryData<AlertRuleListResponse>(qk.alertRules())
      expect(snap?.items[0].enabled).toBe(false)
    })

    // Resolve the in-flight PATCH and let onSettled invalidate.
    resolvePatch?.(jsonResponse({ ...RULE, enabled: false }))
    await promise
  })

  it('does NOT apply optimistic update for a threshold-only patch (server-validated)', async () => {
    const client = makeClient()
    client.setQueryData<AlertRuleListResponse>(qk.alertRules(), RULES_RESPONSE)
    const wrapper = makeWrapper(client)
    const { result } = renderHook(() => usePatchAlertRule(), { wrapper })

    let resolvePatch: ((r: Response) => void) | undefined
    const pending = new Promise<Response>((resolve) => {
      resolvePatch = resolve
    })
    fetchSpy?.mockImplementationOnce(() => pending)

    const promise = result.current.mutateAsync({
      id: 1,
      body: { threshold_fire: 0.95 },
    })

    // While the mutation is in flight, cache should remain unchanged (no optimism).
    // Wait a microtask to give onMutate a chance to mis-fire if it would.
    await new Promise((r) => setTimeout(r, 10))
    const mid = client.getQueryData<AlertRuleListResponse>(qk.alertRules())
    expect(mid?.items[0].threshold_fire).toBe(0.9) // untouched
    expect(mid?.items[0].enabled).toBe(true) // untouched

    resolvePatch?.(jsonResponse({ ...RULE, threshold_fire: 0.95 }))
    await promise
  })
})

describe('Phase 15 alerts — useDeleteAlertRule + useAckAlert', () => {
  it('useDeleteAlertRule invalidates alert-rules on success', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }))
    const client = makeClient()
    const wrapper = makeWrapper(client)
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteAlertRule(), { wrapper })
    await result.current.mutateAsync(1)
    const alertInvalidations = invalidateSpy.mock.calls.filter((c) => {
      const arg = c[0] as { queryKey?: unknown[] } | undefined
      return Array.isArray(arg?.queryKey) && arg!.queryKey![0] === 'alert-rules'
    })
    expect(alertInvalidations.length).toBeGreaterThanOrEqual(1)
    fetchSpy.mockRestore()
  })

  it('useAckAlert invalidates alert-events (NOT alert-rules) on success', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ ok: true, acked_until: '2026-05-04T01:00:00Z' }))
    const client = makeClient()
    const wrapper = makeWrapper(client)
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useAckAlert(), { wrapper })
    await result.current.mutateAsync({ rule_id: 1, scope_hash: 'deadbeef' })
    const eventInvalidations = invalidateSpy.mock.calls.filter((c) => {
      const arg = c[0] as { queryKey?: unknown[] } | undefined
      return Array.isArray(arg?.queryKey) && arg!.queryKey![0] === 'alert-events'
    })
    expect(eventInvalidations.length).toBeGreaterThanOrEqual(1)
    // No alert-rules invalidation — ack changes event state, not rule list.
    const ruleInvalidations = invalidateSpy.mock.calls.filter((c) => {
      const arg = c[0] as { queryKey?: unknown[] } | undefined
      return Array.isArray(arg?.queryKey) && arg!.queryKey![0] === 'alert-rules'
    })
    expect(ruleInvalidations.length).toBe(0)
    fetchSpy.mockRestore()
  })
})
