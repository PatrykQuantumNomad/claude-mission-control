// Typed query-key factory + per-panel hooks + follow-up
// mutation. Polling cadences (refetchInterval / staleTime) are encoded HERE,
// never inlined in panel components — so the cadence policy lives in exactly
// one observable site.
//
// Cadence buckets:
//   5s   — live system: SystemHealth ticker, LiveSessions
//   10s  — Attention bar
//   15s  — Today summary KPIs
//   30s  — Pressure, Latency, Failures, Sessions list, AlertRules, AlertEvents
//   60s  — Daily aggregates (tokens, cache, outcomes, hooks, edits)
//   120s — Slow rollups (by-project, fanout, productivity, mcp servers)
//   300s — Heatmap (30-day rollup; rarely changes intra-session)
//
// staleTime is set just below refetchInterval so background fetches don't
// double-fire when a window regains focus inside the cadence window.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from './api'
import type {
  AlertAckRequest,
  AlertEventsResponse,
  AlertMetricsResponse,
  AlertRange,
  AlertRule,
  AlertRuleCreate,
  AlertRuleListResponse,
  AlertRulePatch,
  AlertRuleParseRequest,
  BreakdownDim,
  CostBreakdownResponse,
  CostForecastResponse,
  CostRange,
  DecisionAnswerRequest,
  DecisionListItem,
  DecisionListResponse,
  FollowUpRequest,
  InboxListItem,
  InboxListResponse,
  InboxReplyRequest,
  NLCronRequest,
  Range,
  RangeAll,
  ScheduleCreate,
  SchedulePatch,
  SavedViewCreate,
  SavedViewUpdate,
  SessionCompareResponse,
  SessionPreviousResponse,
  SessionsListParams,
  SkillAutonomyRequest,
  SkillCostResponse,
  SkillLatencyResponse,
  SkillListResponse,
  SkillProjectsResponse,
  SkillRange,
  SkillRow,
  SkillRunsResponse,
  SkillUsageResponse,
  TaskCreate,
  TaskListParams,
  TaskListResponse,
  TaskPatch,
} from './api'

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
  // current — keys for HITL/Tasks/Schedules/Skills/Context/SystemState
  decisions: (status?: string) =>
    ['decisions', { status: status ?? 'pending' }] as const,
  inbox: (unread?: boolean) =>
    ['inbox', { unread: unread ?? true }] as const,
  tasks: (filter?: { status?: string; quadrant?: string }) =>
    ['tasks', filter ?? {}] as const,
  schedules: () => ['schedules'] as const,
  scheduleRuns: (id: number) => ['schedules', id, 'runs'] as const,
  skills: () => ['skills'] as const,
  // Phase 14 (SKIL-04..07) — never reuse the bare 'skills' prefix; each
  // analytics dimension is its own scoped key. Pitfall 5 from 14-RESEARCH.md.
  // limit is part of the key — four callers (SkillCostCardForTopSkill=1,
  // TopSkills=10, SkillLatencyTable=20, SkillsRegistry=200) must NOT share
  // a cache entry, otherwise a 422 from one limit corrupts the other three.
  skillUsage: (range: SkillRange, limit: number) =>
    ['skill-usage', range, limit] as const,
  skillCost: (name: string, range: SkillRange) =>
    ['skill-cost', name, range] as const,
  skillLatency: (name: string, range: SkillRange) =>
    ['skill-latency', name, range] as const,
  skillRuns: (name: string, limit: number) =>
    ['skill-runs', name, limit] as const,
  // Phase 19 (SKLP-08) — per-project rollup. Distinct kebab-prefix per
  // Pitfall 5 from 14-RESEARCH.md: never reuse the bare 'skills' prefix.
  skillProjects: (name: string, range: SkillRange) =>
    ['skill-projects', name, range] as const,
  // Phase 15 (ALRT-09/10) — alerts. Kebab-prefix per Pitfall 5 from
  // 14-RESEARCH.md: never reuse a bare 'alerts' prefix; each surface gets
  // its own scoped key so analytics invalidation never collides with future
  // 'alert-*' keys (e.g. 'alert-state' if ever exposed to UI).
  alertRules: () => ['alert-rules'] as const,
  alertEvents: (range: AlertRange) => ['alert-events', range] as const,
  // Phase 21 (ALRT-14) — canonical metric vocabulary. Deploy-stable; the
  // useAlertMetrics() hook caches with staleTime: Infinity.
  alertMetrics: () => ['alert-metrics'] as const,
  // Phase 16 (CMPR-01..05) — session compare. Kebab-prefix per Pitfall 5
  // from 14-RESEARCH.md: never reuse the bare 'sessions' prefix; that would
  // invalidate compare on every session-list mutation.
  sessionCompare: (a: string, b: string) => ['session-compare', a, b] as const,
  // Phase 23 (CMPR-07) — previous-session resolver. The session id IS the
  // entire response payload's input; no other params affect response shape.
  // Cache-key discipline (Phase 20 lesson): include the session id and ONLY
  // the session id.
  sessionPrevious: (sid: string) => ['session-previous', sid] as const,
  contextHealth: () => ['context', 'health'] as const,
  systemState: (key: string) => ['system', 'state', key] as const,
  // Phase 20 (ANLY-06) — monthly cost forecast. No params (server-clock
  // derived; current month implicit).
  costForecast: () => ['cost-forecast'] as const,
  // Phase 20 (ANLY-07) — per-project cost breakdown. BOTH dim AND range
  // affect response shape — both MUST be in the queryKey (cache-key
  // discipline lesson from Phase 19 hotfix da592ff, STATE.md L121).
  costBreakdown: (dim: BreakdownDim, range: CostRange) =>
    ['cost-breakdown', dim, range] as const,
  // Phase 25 (VIEW-03) — saved views. Kebab-prefix per Pitfall 5 from
  // 14-RESEARCH.md (never reuse a bare 'views' prefix; future 'view-*' keys
  // get their own scope). Route filter is part of the key so route-scoped
  // and unfiltered fetches don't share a cache entry; absent route encodes
  // as '__all__' sentinel so the runtime queryKey is never undefined-laced.
  // All mutations invalidate the whole ['saved-views'] family — cross-route
  // consumers (Cmd+K palette) stay fresh after edits anywhere.
  savedViews: (route?: string) => ['saved-views', route ?? '__all__'] as const,
  savedView: (id: number | null) => ['saved-views', 'single', id] as const,
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
// 30s — pressure, latency, failures, sessions list, alerts (rules + events)
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

// Phase 15 alerts (ALRT-10) — 30s polling cadence per 15-RESEARCH.md.
// Same tier as Pressure/Latency/Failures: alerts are operationally urgent
// without being a per-second firehose; 30s gives the user a sub-minute view
// of new fired events without burning DB on every tick.

export const useAlertRules = () =>
  useQuery<AlertRuleListResponse>({
    queryKey: qk.alertRules(),
    queryFn: () => api.alertRules(),
    refetchInterval: 30_000,
    staleTime: 20_000,
  })

export const useAlertEvents = (range: AlertRange = '7d') =>
  useQuery<AlertEventsResponse>({
    queryKey: qk.alertEvents(range),
    queryFn: () => api.alertEvents(range),
    refetchInterval: 30_000,
    staleTime: 20_000,
  })

// Phase 21 (ALRT-14) — canonical metric vocabulary. staleTime: Infinity
// because the vocabulary changes only on backend deploys; the AlertRuleForm
// loading-window fallback (FALLBACK_KNOWN_METRICS) covers the brief window
// before the first response lands.
export const useAlertMetrics = () =>
  useQuery<AlertMetricsResponse>({
    queryKey: qk.alertMetrics(),
    queryFn: () => api.alertMetrics(),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchInterval: false,
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

// Phase 14 (SKIL-04/05/06) — skills analytics rollups. Locked to the same
// 60s/45s pair as the rest of the daily-aggregate bucket. Cadence is encoded
// HERE (project convention — panels never inline refetchInterval; see file
// header). useSkillRuns drops to 30s/15s below — recent runs are more time-
// sensitive but not a per-second firehose.

export const useSkillUsage = (range: SkillRange, limit: number = 10) =>
  useQuery<SkillUsageResponse>({
    queryKey: qk.skillUsage(range, limit),
    queryFn: () => api.skillUsage(range, limit),
    refetchInterval: 60_000,
    staleTime: 45_000,
  })

export const useSkillCost = (name: string, range: SkillRange) =>
  useQuery<SkillCostResponse>({
    queryKey: qk.skillCost(name, range),
    queryFn: () => api.skillCost(name, range),
    refetchInterval: 60_000,
    staleTime: 45_000,
  })

export const useSkillLatency = (name: string, range: SkillRange) =>
  useQuery<SkillLatencyResponse>({
    queryKey: qk.skillLatency(name, range),
    queryFn: () => api.skillLatency(name, range),
    refetchInterval: 60_000,
    staleTime: 45_000,
  })

// Recent runs — slightly faster cadence than 60s rollups, matches the urgency
// tier of useSchedules (30s/20s). Not 5s like useDecisions because runs are
// passive observation, not an action queue.
export const useSkillRuns = (name: string, limit: number = 20) =>
  useQuery<SkillRunsResponse>({
    queryKey: qk.skillRuns(name, limit),
    queryFn: () => api.skillRuns(name, limit),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

// Phase 19 (SKLP-08) — per-project rollup for /skills/$name. Same 60s/45s
// daily-aggregate cadence as useSkillCost (read-time-computed rollup,
// doesn't move per-second).
export const useSkillProjects = (name: string, range: SkillRange) =>
  useQuery<SkillProjectsResponse>({
    queryKey: qk.skillProjects(name, range),
    queryFn: () => api.skillProjects(name, range),
    refetchInterval: 60_000,
    staleTime: 45_000,
  })

// Phase 20 (ANLY-06 + ANLY-07) — cost dashboard. 60s/45s daily-aggregate
// cadence — same bucket as useSkillCost / useTokens (cost data updates
// daily, not per-second). Cadence lives HERE, never inlined in panel
// components (project convention; see file header).
export const useCostForecast = () =>
  useQuery<CostForecastResponse>({
    queryKey: qk.costForecast(),
    queryFn: () => api.costForecast(),
    refetchInterval: 60_000,
    staleTime: 45_000,
  })

export const useCostBreakdown = (dim: BreakdownDim, range: CostRange) =>
  useQuery<CostBreakdownResponse>({
    queryKey: qk.costBreakdown(dim, range),
    queryFn: () => api.costBreakdown(dim, range),
    refetchInterval: 60_000,
    staleTime: 45_000,
  })

// Phase 16 (CMPR-01..05) — session compare. Two-side paired metrics +
// skill-set diff. Locked to the 60s/45s daily-aggregate bucket: read-only
// rollup over two specific sessions, doesn't need the 30s urgency tier of
// alert events, and live sessions move via separate /sessions/live cadence.
// `enabled: Boolean(a && b)` gate keeps the hook idle until both UUIDs are
// present in the URL (validateSearch may strip malformed values to undefined).
export const useSessionCompare = (
  a: string | undefined,
  b: string | undefined,
) =>
  useQuery<SessionCompareResponse>({
    queryKey: qk.sessionCompare(a ?? '', b ?? ''),
    queryFn: () => api.sessionCompare(a!, b!),
    enabled: Boolean(a && b),
    refetchInterval: 60_000,
    staleTime: 45_000,
  })

// Phase 23 (CMPR-07) — previous-session resolver hook.
//
// Locked-decision contract (D-04 + D-09): the backend returns 404 with body
// {error:"no previous session"} when no prior session exists in the same
// project_key. That 404 is a NORMAL empty-state visibility gate — NOT an
// error. Consumers (Cmd+K "Compare with previous session") read both
// `data` and `isError`:
//
//   - data === SessionPreviousResponse → previous exists; show the action.
//   - data === null AND !isError       → confirmed no previous; HIDE action.
//   - isError                           → real error (5xx, network); HIDE action.
//
// Implementation: queryFn catches ApiError(404) and resolves to `null` instead
// of throwing. Other errors propagate normally so React Query surfaces them
// via `isError` and the consumer can suppress the action gracefully.
//
// Threat-model T-23-05 (DoS): hook is `enabled: Boolean(sid)` so the palette
// does not fetch on every keystroke when no session is active. staleTime/
// refetchInterval mirror the compare cadence (60s/45s) — previous-session
// is monotonic w.r.t. ended_at, so refetches mostly serve cache freshness
// rather than discovering new data.
export const useSessionPrevious = (sid: string | null | undefined) =>
  useQuery<SessionPreviousResponse | null>({
    queryKey: qk.sessionPrevious(sid ?? ''),
    queryFn: async () => {
      try {
        return await api.sessionsPrevious(sid as string)
      } catch (err) {
        // 404 is the locked empty-state signal (D-04); never bubble it.
        if (err instanceof ApiError && err.status === 404) return null
        throw err
      }
    },
    enabled: Boolean(sid),
    refetchInterval: 60_000,
    staleTime: 45_000,
    // Don't retry the 404 path — it'd be wasted RTTs (the catch above resolves
    // it to null, but a transient 5xx during the brief window where the
    // session was deleted should also not stall the palette).
    retry: false,
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

// ============================================================================
// current — HITL / Tasks / Schedules / Skills / Context /
// SystemState hooks + mutations. Cadence + optimistic policy are encoded
// HERE (single source of truth — panels never inline refetchInterval or
// optimistic config). Cadence buckets locked from Design note:
//   5_000ms  — useDecisions, useTasks, useSystemState (live decision queue)
//   10_000ms — useInbox (less-urgent agent-to-user messages)
//   30_000ms — useSchedules, useScheduleRuns (drawer-open lazy)
//   60_000ms — useSkills, useContextHealth (slow-changing catalog state)
//
// Optimistic policy (Pitfall 2 — design notes):
//   - useReadInbox: idempotent "mark as read" → optimistic, snapshot rollback
//   - usePatchTask (status only): idempotent transition → optimistic
//   - usePatchSchedule (enabled toggle only): idempotent → optimistic
//   - usePatchSkillAutonomy: idempotent → optimistic with rollback
//   - useAnswerDecision: NOT optimistic — preserves user's typed input on 409
//   - useCreateTask, useCreateSchedule, useReplyInbox: NOT optimistic
//     (server may 422 on validation; we preserve typed state on error)
//   - useEmergencyStop / useEmergencyResume: NOT optimistic (terminal action)
// ============================================================================

// ---- Reads ----------------------------------------------------------------

export const useDecisions = (status: string = 'pending') =>
  useQuery<DecisionListResponse>({
    queryKey: qk.decisions(status),
    queryFn: () => api.decisions({ status, limit: 50 }),
    refetchInterval: 5_000,
    staleTime: 0,
  })

export const useInbox = (unread: boolean = true) =>
  useQuery<InboxListResponse>({
    queryKey: qk.inbox(unread),
    queryFn: () => api.inbox({ unread, max_age_days: 14 }),
    refetchInterval: 10_000,
    staleTime: 5_000,
  })

export const useTasks = (filter?: { status?: string; quadrant?: string }) =>
  useQuery<TaskListResponse>({
    queryKey: qk.tasks(filter),
    queryFn: () => api.tasks(filter as TaskListParams | undefined),
    refetchInterval: 5_000,
    staleTime: 0,
  })

export const useSchedules = () =>
  useQuery({
    queryKey: qk.schedules(),
    queryFn: api.schedules,
    refetchInterval: 30_000,
    staleTime: 20_000,
  })

/** SCHD-05 lazy: only fetches when drawer is open (Pitfall 9 — avoid burning
 * 30s polls on every collapsed schedule row). Caller passes enabled=true
 * once the user opens the runs drawer. */
export const useScheduleRuns = (id: number, enabled: boolean) =>
  useQuery({
    queryKey: qk.scheduleRuns(id),
    queryFn: () => api.scheduleRuns(id),
    enabled,
    refetchInterval: enabled ? 30_000 : false,
    staleTime: 20_000,
  })

export const useSkills = () =>
  useQuery<SkillListResponse>({
    queryKey: qk.skills(),
    queryFn: () => api.skills(),
    refetchInterval: 60_000,
    staleTime: 45_000,
  })

export const useContextHealth = () =>
  useQuery({
    queryKey: qk.contextHealth(),
    queryFn: api.contextHealth,
    refetchInterval: 60_000,
    staleTime: 45_000,
  })

/** READ-ONLY view of system_state KV (Pitfall 4: ESTOP writes go through
 * dedicated useEmergencyStop/useEmergencyResume mutations — never via this
 * hook's data shape). 5_000ms cadence so the EmergencyStopBanner reflects
 * remote toggles within one tick. */
export const useSystemState = (key: string) =>
  useQuery({
    queryKey: qk.systemState(key),
    queryFn: () => api.systemState(key),
    refetchInterval: 5_000,
    staleTime: 0,
  })

// ---- Mutations: HITL ------------------------------------------------------

/** HITL-03 — answer a pending decision. NOT optimistic (Pitfall 2): on 409
 * conflict (already-answered) we want to preserve the user's typed input
 * so they can edit and retry against the live server state. */
export function useAnswerDecision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: DecisionAnswerRequest }) =>
      api.decisionAnswer(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['decisions'] })
      qc.invalidateQueries({ queryKey: qk.attention() })
    },
  })
}

/** HITL-05 — mark inbox row as read. Idempotent → safe to optimistic.
 * onMutate snapshots current data; on error restores. */
export function useReadInbox() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.inboxRead(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['inbox'] })
      const snapshots = qc.getQueriesData<InboxListResponse>({ queryKey: ['inbox'] })
      qc.setQueriesData<InboxListResponse>({ queryKey: ['inbox'] }, (prev) => {
        if (!prev) return prev
        const nowIso = new Date().toISOString()
        return {
          ...prev,
          items: prev.items.map((row) =>
            row.id === id ? { ...row, read: true, read_at: nowIso } : row,
          ),
        }
      })
      return { snapshots }
    },
    onError: (_err, _id, ctx) => {
      ctx?.snapshots.forEach(([key, value]) => qc.setQueryData(key, value))
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['inbox'] })
    },
  })
}

/** HITL-06 — reply to an inbox message. NOT optimistic (generative content). */
export function useReplyInbox() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: InboxReplyRequest }) =>
      api.inboxReply(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inbox'] }),
  })
}

// ---- Mutations: Tasks -----------------------------------------------------

/** TASK-02 — create. NOT optimistic (server may 422 on validation). */
export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: TaskCreate) => api.taskCreate(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: qk.attention() })
    },
  })
}

/** TASK-03 — patch. Optimistic for status-only transitions (idempotent).
 * Body fields beyond status do NOT participate in optimistic update —
 * the server projection is the source of truth on next invalidation. */
export function usePatchTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: TaskPatch }) =>
      api.taskPatch(id, body),
    onMutate: async ({ id, body }) => {
      if (!body.status) return { snapshots: [] as const }
      await qc.cancelQueries({ queryKey: ['tasks'] })
      const snapshots = qc.getQueriesData<TaskListResponse>({ queryKey: ['tasks'] })
      qc.setQueriesData<TaskListResponse>({ queryKey: ['tasks'] }, (prev) => {
        if (!prev) return prev
        return {
          ...prev,
          items: prev.items.map((row) =>
            row.id === id ? { ...row, status: body.status as string } : row,
          ),
        }
      })
      return { snapshots }
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, value]) => qc.setQueryData(key, value))
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

/** TASK-04 — delete. Returns void (204 No Content). */
export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.taskDelete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

/** TASK-05 — approve. */
export function useApproveTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.taskApprove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

/** TASK-06 — rerun. */
export function useRerunTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.taskRerun(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

/** TASK-07 — trigger dispatcher (NOT per-task; backend dispatches whatever
 * is ready). design notes. */
export function useTriggerDispatcher() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.dispatcherTrigger(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

// ---- Mutations: Schedules -------------------------------------------------

/** SCHD-02 — create. NOT optimistic (server may 422 on cron). */
export function useCreateSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ScheduleCreate) => api.scheduleCreate(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules'] }),
  })
}

/** SCHD-03 — patch. Optimistic for `enabled` toggle ONLY. */
export function usePatchSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: SchedulePatch }) =>
      api.schedulePatch(id, body),
    onMutate: async ({ id, body }) => {
      if (typeof body.enabled !== 'boolean') return { snapshots: [] as const }
      await qc.cancelQueries({ queryKey: ['schedules'] })
      const snapshots = qc.getQueriesData<{
        items: Array<{ id: number; enabled: boolean }>
      }>({ queryKey: ['schedules'] })
      qc.setQueriesData<{
        items: Array<{ id: number; enabled: boolean }>
      }>({ queryKey: ['schedules'] }, (prev) => {
        if (!prev) return prev
        return {
          ...prev,
          items: prev.items.map((row) =>
            row.id === id ? { ...row, enabled: body.enabled as boolean } : row,
          ),
        }
      })
      return { snapshots }
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, value]) => qc.setQueryData(key, value))
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['schedules'] }),
  })
}

/** SCHD-04 — delete. Returns void (204 No Content). */
export function useDeleteSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.scheduleDelete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules'] }),
  })
}

/** SCHD-06 — NL→cron via Claude Haiku. Surfaces 503 body literal verbatim
 * on error (V11 — design notes). */
export function useParseNlCron() {
  return useMutation({
    mutationFn: (body: NLCronRequest) => api.schedulesParseNl(body),
  })
}

/** ALRT-14 — NL→AlertRule via Claude Haiku 4.5 (Phase 21 Plan 21-03).
 * Mirrors useParseNlCron above. Single 503 covers missing-API-key AND
 * Haiku-hallucination per V11 collapsed-failure-mode contract; the consumer
 * (AlertRuleForm) renders an actionable inline message rather than echoing
 * the raw 503 body — see PITFALLS lockout in 21-RESEARCH.md. */
export function useParseAlertNl() {
  return useMutation({
    mutationFn: (body: AlertRuleParseRequest) => api.alertsParseNl(body),
  })
}

// ---- Mutations: Skills ----------------------------------------------------

/** SKILL-03 — patch autonomy. OPTIMISTIC with rollback (design notes). */
export function usePatchSkillAutonomy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      name,
      body,
    }: {
      name: string
      body: SkillAutonomyRequest
    }) => api.skillAutonomy(name, body),
    onMutate: async ({ name, body }) => {
      await qc.cancelQueries({ queryKey: qk.skills() })
      const snapshot = qc.getQueryData<SkillListResponse>(qk.skills())
      if (snapshot) {
        qc.setQueryData<SkillListResponse>(qk.skills(), {
          ...snapshot,
          items: snapshot.items.map((row: SkillRow) =>
            row.name === name ? { ...row, autonomy: body.autonomy } : row,
          ),
        })
      }
      return { snapshot }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(qk.skills(), ctx.snapshot)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.skills() }),
  })
}

/** SKILL-02 — sync. */
export function useSkillsSync() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.skillsSync(),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.skills() }),
  })
}

// ---- Mutations: Emergency Stop --------------------------------------------

/** ESTOP-01..03 — set the kill flag. Invalidates the dedicated systemState
 * polling key + attention so banner state flips within one tick. */
export function useEmergencyStop() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.emergencyStop(),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.systemState('emergency_stop') })
      qc.invalidateQueries({ queryKey: qk.attention() })
    },
  })
}

/** ESTOP-04 — clear the kill flag (POST /api/system/emergency-resume). */
export function useEmergencyResume() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.emergencyResume(),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.systemState('emergency_stop') })
      qc.invalidateQueries({ queryKey: qk.attention() })
    },
  })
}

// ---- Mutations: Alerts (Phase 15 ALRT-09) ---------------------------------
//
// Optimistic policy (Plan 15-04 D-02):
//   - useCreateAlertRule: NOT optimistic (server may 422 on unknown metric /
//     threshold-without-fire / clear>=fire — preserve typed input on error).
//   - usePatchAlertRule: OPTIMISTIC ONLY when body has exactly one key
//     'enabled' (idempotent transition; pattern mirrors usePatchSchedule).
//     Threshold patches stay non-optimistic — server validates and may 422.
//   - useDeleteAlertRule: NOT optimistic (DELETE is destructive — show
//     pending state).
//   - useAckAlert: NOT optimistic; invalidates ['alert-events'] (acks change
//     event status surfacing through alert_state.acked_until).

/** ALRT-09 — create alert rule. NOT optimistic. */
export function useCreateAlertRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AlertRuleCreate) => api.alertRuleCreate(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-rules'] }),
  })
}

/** ALRT-09 — patch alert rule. OPTIMISTIC ONLY for the `enabled`-only
 * single-field patch (idempotent toggle); all other shapes are non-optimistic
 * because the server may 422 on threshold validation. */
export function usePatchAlertRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: AlertRulePatch }) =>
      api.alertRulePatch(id, body),
    onMutate: async ({ id, body }) => {
      const keys = Object.keys(body)
      const isEnabledOnly =
        keys.length === 1 && keys[0] === 'enabled' && typeof body.enabled === 'boolean'
      if (!isEnabledOnly) return { snapshot: undefined as AlertRuleListResponse | undefined }
      await qc.cancelQueries({ queryKey: qk.alertRules() })
      const snapshot = qc.getQueryData<AlertRuleListResponse>(qk.alertRules())
      if (snapshot) {
        qc.setQueryData<AlertRuleListResponse>(qk.alertRules(), {
          ...snapshot,
          items: snapshot.items.map((row: AlertRule) =>
            row.rule_id === id ? { ...row, enabled: body.enabled as boolean } : row,
          ),
        })
      }
      return { snapshot }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(qk.alertRules(), ctx.snapshot)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['alert-rules'] }),
  })
}

/** ALRT-09 — delete alert rule. NOT optimistic (destructive). */
export function useDeleteAlertRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.alertRuleDelete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-rules'] }),
  })
}

/** ALRT-09 — acknowledge fired alert. NOT optimistic; invalidates events
 * so the AlertEventsList row updates status → 'answered' on next poll.
 * Telegram is the primary ack surface — this hook ships for symmetry +
 * Phase 17 e2e + future UI 'Ack' button (D-03). */
export function useAckAlert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AlertAckRequest) => api.alertAck(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-events'] }),
  })
}

// ---- Queries + Mutations: Saved Views (Phase 25 VIEW-03) ------------------
//
// Cache invalidation convention: every saved-views mutation (create/patch/
// delete) invalidates the entire ['saved-views'] key family, not just the
// route's slice. Rationale: a saved view edited on /skills can appear in the
// cross-route Cmd+K palette and the Sidebar Pinned section — those consumers
// need to refresh too. The blast radius is small (saved views are user-
// modified rarely; staleTime is generous) so over-invalidation is preferred
// over missed-invalidation.

const SAVED_VIEWS_KEY = ['saved-views'] as const

/** VIEW-03 — list saved views, optionally filtered to a single route.
 * staleTime is generous (30s) because saved views are user-modified rarely
 * and the menu opens cheaply from cache. Mutations explicitly invalidate. */
export function useSavedViews(route?: string) {
  return useQuery({
    queryKey: qk.savedViews(route),
    queryFn: () => api.viewList(route),
    staleTime: 30_000,
  })
}

/** VIEW-03 — single saved view by id. Pass `null` to disable (Sidebar Pinned
 * section may not yet have an id loaded). Distinct query-key shape so the
 * single-view cache slot does not collide with the list-view cache slot. */
export function useSavedView(id: number | null) {
  return useQuery({
    queryKey: qk.savedView(id),
    queryFn: () => api.viewGet(id as number),
    enabled: id !== null,
  })
}

/** VIEW-03 — create. NOT optimistic (server may 400 on cap-exceeded or
 * UNIQUE (route, name) collision; preserve typed input on error). */
export function useCreateView() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: SavedViewCreate) => api.viewCreate(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SAVED_VIEWS_KEY })
    },
  })
}

/** VIEW-03 — patch. NOT optimistic. state_json is replaced wholesale by the
 * server (NOT deep-merged); callers must send the full state blob. */
export function usePatchView() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: SavedViewUpdate }) =>
      api.viewPatch(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SAVED_VIEWS_KEY })
    },
  })
}

/** VIEW-03 — delete. Returns void (204 No Content). NOT optimistic. */
export function useDeleteView() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.viewDelete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SAVED_VIEWS_KEY })
    },
  })
}

// Suppress unused-import warning for DecisionListItem / InboxListItem until
// panels need these row types alongside the response types.
// Compile-time noop: re-export under a private alias.
export type _PanelRowReexports = DecisionListItem | InboxListItem
