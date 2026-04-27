// Phase 6 Plan 01: typed query-key factory + per-panel hooks + follow-up
// mutation. Polling cadences (refetchInterval / staleTime) are encoded HERE,
// never inlined in panel components — so the cadence policy lives in exactly
// one observable site.
//
// Cadence buckets (RESEARCH §Polling Cadence Policy):
//   5s   — live system: SystemHealth ticker, LiveSessions
//   10s  — Attention bar
//   15s  — Today summary KPIs
//   30s  — Pressure, Latency, Failures, Sessions list
//   60s  — Daily aggregates (tokens, cache, outcomes, hooks, edits)
//   120s — Slow rollups (by-project, fanout, productivity, mcp servers)
//   300s — Heatmap (30-day rollup; rarely changes intra-session)
//
// staleTime is set just below refetchInterval so background fetches don't
// double-fire when a window regains focus inside the cadence window.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type { FollowUpRequest, Range, RangeAll, SessionsListParams } from './api'

// ============================================================================
// Query-key factory — typed and lossless. Every hook below builds its key via
// `qk.*` so invalidation matches the same shape (queryClient.invalidateQueries
// can pass a partial prefix like ['sessions'] to refresh anything sessions-y).
// ============================================================================

export const qk = {
  systemHealth: () => ['system', 'health'] as const,
  attention: () => ['attention'] as const,
  summary: () => ['summary'] as const,
  pressure: () => ['system', 'pressure'] as const,
  liveSessions: () => ['sessions', 'live'] as const,
  sessionDetails: (sid: string) => ['sessions', sid, 'details'] as const,
  tokens: (range: Range) => ['usage', 'tokens', range] as const,
  cache: (range: Range) => ['usage', 'cache', range] as const,
  outcomes: (range: Range) => ['sessions', 'outcomes', range] as const,
  latency: (range: Range) => ['tools', 'latency', range] as const,
  hooks: (range: Range) => ['hooks', 'activity', range] as const,
  byProject: (range: RangeAll) => ['sessions', 'by-project', range] as const,
  fanout: (range: Range) => ['tools', 'agent-fanout', range] as const,
  edits: (range: Range) => ['tools', 'edit-decisions', range] as const,
  productivity: (range: Range) => ['activity', 'productivity', range] as const,
  mcpServers: () => ['mcp'] as const,
  mcpTools: (server: string) => ['mcp', server, 'tools'] as const,
  heatmap: (range: Range) => ['activity', 'heatmap', range] as const,
  failures: (range: Range) => ['sessions', 'failures', range] as const,
  sessionsList: (params: SessionsListParams) => ['sessions', 'list', params] as const,
} as const

// ============================================================================
// 5s — live system
// ============================================================================

export const useSystemHealth = () =>
  useQuery({
    queryKey: qk.systemHealth(),
    queryFn: api.systemHealth,
    refetchInterval: 5_000,
    staleTime: 0,
  })

export const useLiveSessions = () =>
  useQuery({
    queryKey: qk.liveSessions(),
    queryFn: api.sessionsLive,
    refetchInterval: 5_000,
    staleTime: 0,
  })

// ============================================================================
// 10s — attention bar
// ============================================================================

export const useAttention = () =>
  useQuery({
    queryKey: qk.attention(),
    queryFn: api.attention,
    refetchInterval: 10_000,
    staleTime: 5_000,
  })

// ============================================================================
// 15s — Today summary KPIs
// ============================================================================

export const useSummary = () =>
  useQuery({
    queryKey: qk.summary(),
    queryFn: api.summary,
    refetchInterval: 15_000,
    staleTime: 5_000,
  })

// ============================================================================
// 30s — pressure, latency, failures, sessions list
// ============================================================================

export const usePressure = () =>
  useQuery({
    queryKey: qk.pressure(),
    queryFn: api.systemPressure,
    refetchInterval: 30_000,
    staleTime: 20_000,
  })

export const useLatency = (range: Range) =>
  useQuery({
    queryKey: qk.latency(range),
    queryFn: () => api.toolsLatency(range),
    refetchInterval: 30_000,
    staleTime: 20_000,
  })

export const useFailures = (range: Range) =>
  useQuery({
    queryKey: qk.failures(range),
    queryFn: () => api.sessionsFailures(range),
    refetchInterval: 30_000,
    staleTime: 20_000,
  })

export const useSessionsList = (params: SessionsListParams) =>
  useQuery({
    queryKey: qk.sessionsList(params),
    queryFn: () => api.sessions(params),
    refetchInterval: 30_000,
    staleTime: 20_000,
    placeholderData: (prev) => prev,
  })

// ============================================================================
// 60s — daily aggregates
// ============================================================================

export const useTokens = (range: Range) =>
  useQuery({
    queryKey: qk.tokens(range),
    queryFn: () => api.usageTokens(range),
    refetchInterval: 60_000,
    staleTime: 45_000,
  })

export const useCache = (range: Range) =>
  useQuery({
    queryKey: qk.cache(range),
    queryFn: () => api.usageCache(range),
    refetchInterval: 60_000,
    staleTime: 45_000,
  })

export const useOutcomes = (range: Range) =>
  useQuery({
    queryKey: qk.outcomes(range),
    queryFn: () => api.sessionsOutcomes(range),
    refetchInterval: 60_000,
    staleTime: 45_000,
  })

export const useHooks = (range: Range) =>
  useQuery({
    queryKey: qk.hooks(range),
    queryFn: () => api.hooksActivity(range),
    refetchInterval: 60_000,
    staleTime: 45_000,
  })

export const useEdits = (range: Range) =>
  useQuery({
    queryKey: qk.edits(range),
    queryFn: () => api.toolsEditDecisions(range),
    refetchInterval: 60_000,
    staleTime: 45_000,
  })

// ============================================================================
// 120s — slow rollups
// ============================================================================

export const useByProject = (range: RangeAll) =>
  useQuery({
    queryKey: qk.byProject(range),
    queryFn: () => api.sessionsByProject(range),
    refetchInterval: 120_000,
    staleTime: 90_000,
  })

export const useFanout = (range: Range) =>
  useQuery({
    queryKey: qk.fanout(range),
    queryFn: () => api.toolsAgentFanout(range),
    refetchInterval: 120_000,
    staleTime: 90_000,
  })

export const useProductivity = (range: Range) =>
  useQuery({
    queryKey: qk.productivity(range),
    queryFn: () => api.activityProductivity(range),
    refetchInterval: 120_000,
    staleTime: 90_000,
  })

export const useMcpServers = () =>
  useQuery({
    queryKey: qk.mcpServers(),
    queryFn: api.mcp,
    refetchInterval: 120_000,
    staleTime: 90_000,
  })

export const useMcpTools = (server: string, enabled: boolean = true) =>
  useQuery({
    queryKey: qk.mcpTools(server),
    queryFn: () => api.mcpServerTools(server),
    enabled,
    staleTime: 60_000,
  })

// ============================================================================
// 300s — heatmap (rarely changes intra-session)
// ============================================================================

export const useHeatmap = (range: Range) =>
  useQuery({
    queryKey: qk.heatmap(range),
    queryFn: () => api.activityHeatmap(range),
    refetchInterval: 300_000,
    staleTime: 240_000,
  })

// ============================================================================
// Session details — drawer-open hook (5s when sid set, paused otherwise)
// ============================================================================

export const useSessionDetails = (sid: string | null) =>
  useQuery({
    queryKey: qk.sessionDetails(sid ?? ''),
    queryFn: () => api.sessionDetails(sid!),
    enabled: Boolean(sid),
    refetchInterval: 5_000,
    staleTime: 0,
  })

// ============================================================================
// Mutations
// ============================================================================

/** SESS-06 follow-up message — queues a string into the sid's JSONL queue
 * and invalidates live sessions so the LiveSessionsCard ticker reflects
 * the queued state immediately. */
export function useFollowUpMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sid, message }: { sid: string; message: string }) =>
      api.sessionFollowUp(sid, { message } as FollowUpRequest),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.liveSessions() }),
  })
}
