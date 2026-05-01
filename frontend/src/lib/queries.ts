// Typed query-key factory + per-panel hooks + follow-up
// mutation. Polling cadences (refetchInterval / staleTime) are encoded HERE,
// never inlined in panel components — so the cadence policy lives in exactly
// one observable site.
//
// Cadence buckets:
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
import type {
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
  SessionsListParams,
  SkillAutonomyRequest,
  SkillListResponse,
  SkillRow,
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
  contextHealth: () => ['context', 'health'] as const,
  systemState: (key: string) => ['system', 'state', key] as const,
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

// Suppress unused-import warning for DecisionListItem / InboxListItem until
// panels need these row types alongside the response types.
// Compile-time noop: re-export under a private alias.
export type _PanelRowReexports = DecisionListItem | InboxListItem
