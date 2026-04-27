// Typed fetcher infrastructure for backend endpoints shipped in Phases 3 + 4.
// Phase 5 ships infra only; bare header (CONTEXT decision) means no useQuery
// calls execute in v1. Phase 6 (Plan 06-01) tightens response types for the
// endpoints downstream waves consume and adds two new fetchers (heatmap +
// failures). Phase-7-only entries (decisions/inbox/tasks/schedules) stay typed
// as `unknown` for Phase 7 to narrow when it consumes them.

// ============================================================================
// Range type aliases — encoded once, reused across every range-aware endpoint
// ============================================================================

export type Range = 'today' | '7d' | '30d'
export type RangeAll = Range | 'all'

// ============================================================================
// Health (Phase 1)
// ============================================================================

export interface HealthResponse {
  status: 'ok'
  uptime_s: number
  version: string
}

// ============================================================================
// System (Phase 3 SAPI-* + Phase 4 ESTOP)
// ============================================================================

export interface DaemonAge {
  key: string
  last_tick_at: string | null
  age_seconds: number | null
}

export interface SystemHealthResponse {
  status: 'ok' | 'degraded'
  uptime_seconds: number
  memory_rss_mb: number
  last_otel_event_age_seconds: number | null
  daemon_ages: DaemonAge[]
  tzname: string
}

export interface SystemStateResponse {
  items: Record<string, unknown>
}

export interface AttentionItem {
  kind: string
  severity: 'info' | 'warning' | 'error'
  count: number
  detail: string | null
}

export interface AttentionResponse {
  items: AttentionItem[]
  pending_decisions: number
  failed_tasks: number
  stale_dispatcher_seconds: number | null
  stuck_sessions: number
}

// ============================================================================
// Sessions (Phase 3 SESS-* + Phase 6 ACTV-05)
// ============================================================================

export interface SessionListItem {
  // Phase 5 baseline shape — kept for historical compatibility with consumers
  // that imported the loose Phase-5 type. Phase 6 binds against
  // SessionListItemFull below for the full SESS-01 surface.
  id?: string
  project?: string
  model?: string | null
  started_at: string
  ended_at?: string | null
  tokens_input?: number
  tokens_output?: number
}

export interface SessionListItemFull {
  session_id: string
  started_at: string
  ended_at: string | null
  cwd: string | null
  model: string | null
  source: string | null
  outcome: string | null
  tokens_input: number
  tokens_output: number
  tokens_cache_read: number
  tokens_cache_create: number
  tool_call_count: number
  message_count: number
}

export interface SessionListResponse {
  items: SessionListItemFull[]
  total: number
  offset: number
  limit: number
}

export interface SessionsListParams {
  range?: Range
  source?: string
  model?: string
  limit?: number
  offset?: number
}

export interface ToolTimelineEntry {
  tool_use_id: string
  tool_name: string
  started_at: string
  ended_at: string | null
  duration_ms: number | null
  status: string
  input_summary: string | null
  mcp_server_name: string | null
  mcp_tool_name: string | null
  decision: string | null
}

export interface SessionDetailsResponse {
  session: SessionListItemFull
  tools: ToolTimelineEntry[]
}

export interface LiveSessionItem {
  session_id: string
  started_at: string
  last_activity_at: string | null
  state: string | null
  current_tool: string | null
  model: string | null
}

export interface FollowUpRequest {
  message: string
}

export interface FollowUpResponse {
  queued: boolean
  session_id: string
  queue_path: string
}

export interface TodaySummaryResponse {
  date: string
  sessions_count: number
  tokens_input_total: number
  tokens_output_total: number
  tokens_cache_read_total: number
  tokens_cache_create_total: number
  tool_call_count: number
  error_count: number
}

// Plan 06-01 ACTV-05: unified failures
export interface FailureRow {
  session_id: string
  started_at: string
  outcome: string  // 'errored' | 'rate_limited'
  last_error_message: string | null
}

export interface FailuresResponse {
  items: FailureRow[]
  range: Range
}

// ============================================================================
// Observability (Phase 3 OBSV-* + Phase 6 ACTV-01)
// ============================================================================

export interface TokenUsageDailyRow {
  day: string
  model: string
  source: string
  tokens_input: number
  tokens_output: number
  tokens_cache_read: number
  tokens_cache_create: number
  sessions_count: number
}

export interface TokenUsageResponse {
  items: TokenUsageDailyRow[]
  range: Range
}

export interface CacheTrendRow {
  day: string
  hit_rate: number
  billable_tokens: number
  low_sample: boolean
}

export interface CacheResponse {
  hit_rate: number
  trend: CacheTrendRow[]
  range: Range
  low_sample: boolean
}

export interface OutcomeDailyRow {
  day: string
  errored: number
  rate_limited: number
  truncated: number
  unfinished: number
  ok: number
  total: number
}

export interface OutcomesResponse {
  items: OutcomeDailyRow[]
  range: Range
}

export interface ToolLatencyRow {
  tool_name: string
  call_count: number
  p50_ms: number | null
  p95_ms: number | null
  max_ms: number | null
  error_rate: number
}

export interface ToolLatencyResponse {
  items: ToolLatencyRow[]
  range: Range
}

export interface HookActivityRow {
  day: string
  hook_name: string
  fires: number
  paired_duration_ms_p50: number | null
}

export interface HookActivityResponse {
  items: HookActivityRow[]
  range: Range
  total_fires: number
}

export interface ProjectRollupRow {
  cwd: string
  display_path: string
  sessions: number
  tokens_effective: number
  tool_calls: number
  pct_of_total: number
}

export interface ProjectRollupResponse {
  items: ProjectRollupRow[]
  range: RangeAll
}

export interface AgentFanoutRow {
  session_id: string
  title: string | null
  agent_calls: number
  started_at: string
}

export interface AgentFanoutResponse {
  items: AgentFanoutRow[]
  range: Range
}

export interface EditDecisionRow {
  tool_name: string
  accepted: number
  rejected: number
  accept_rate: number
  low_sample: boolean
}

export interface EditDecisionsResponse {
  items: EditDecisionRow[]
  range: Range
}

export interface ProductivityResponse {
  commits: number
  pull_requests: number
  lines_added: number
  lines_removed: number
  range: Range
}

export interface ApiErrorEntry {
  ts: string
  session_id: string | null
  message: string
}

export interface PressureResponse {
  api_retries_exhausted: number
  compaction_count: number
  recent_api_errors: ApiErrorEntry[]
}

// Plan 06-01 ACTV-01: heatmap
export interface HeatmapDayRow {
  day: string
  sessions: number
  tokens_effective: number
}

export interface HeatmapResponse {
  items: HeatmapDayRow[]
  range: Range
}

// ============================================================================
// MCP (Phase 3 MCP-*)
// ============================================================================

export interface McpServerRow {
  server_name: string
  call_count: number
  error_count: number
  latency_p50_ms: number | null
  latency_p95_ms: number | null
  latency_max_ms: number | null
  source_priority: string
  computed_at: string
}

export interface McpServerListResponse {
  items: McpServerRow[]
}

export interface McpToolRow {
  server_name: string
  tool_name: string
  call_count: number
  error_count: number
  latency_p50_ms: number | null
  latency_p95_ms: number | null
  latency_max_ms: number | null
  source_priority: string
  schema_size_bytes: number | null
}

export interface McpToolsResponse {
  server_name: string
  items: McpToolRow[]
}

// ============================================================================
// Fetcher infrastructure
// ============================================================================

export class ApiError extends Error {
  constructor(public path: string, public status: number, public body: string) {
    super(`${path}: ${status} ${body}`)
  }
}

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, init)
  if (!r.ok) throw new ApiError(path, r.status, await r.text())
  return r.json() as Promise<T>
}

const jsonHeaders = { 'Content-Type': 'application/json' } as const

function buildSessionsQs(params: SessionsListParams = {}): string {
  const usp = new URLSearchParams()
  if (params.range) usp.set('range', params.range)
  if (params.source) usp.set('source', params.source)
  if (params.model) usp.set('model', params.model)
  if (typeof params.limit === 'number') usp.set('limit', String(params.limit))
  if (typeof params.offset === 'number') usp.set('offset', String(params.offset))
  return usp.toString()
}

/**
 * Typed fetcher map keyed by endpoint nickname.
 * Phase-6-consumed endpoints are typed; Phase-7-only entries stay `unknown`.
 */
export const api = {
  // System (Phase 1 + 3)
  health: () => fetchJson<HealthResponse>('/api/health'),
  systemHealth: () => fetchJson<SystemHealthResponse>('/api/system/health'),
  // FIX (Plan 06-01): backend route is GET /api/system/state with `key` as a
  // QUERY param (verified backend/cmc/api/routes/system.py SAPI-03), not a
  // path segment. Old `/api/system/state/${key}` returned 404.
  systemState: (key: string) =>
    fetchJson<SystemStateResponse>(`/api/system/state?key=${encodeURIComponent(key)}`),
  attention: () => fetchJson<AttentionResponse>('/api/attention'),

  // Sessions (Phase 3 + Phase 6)
  sessions: (params: SessionsListParams | string = {}) => {
    // Backwards-compatible: accept either the new typed params object OR a
    // raw query string (Phase 5 callers may have passed a pre-built qs).
    const qs = typeof params === 'string' ? params : buildSessionsQs(params)
    return fetchJson<SessionListResponse>(`/api/sessions${qs ? `?${qs}` : ''}`)
  },
  sessionDetails: (id: string) =>
    fetchJson<SessionDetailsResponse>(`/api/sessions/${encodeURIComponent(id)}/details`),
  sessionsLive: () => fetchJson<LiveSessionItem[]>('/api/sessions/live'),
  sessionLiveState: (sid: string) =>
    fetchJson<unknown>(`/api/sessions/live/${encodeURIComponent(sid)}/state`),
  sessionFollowUp: (sid: string, body: FollowUpRequest) =>
    fetchJson<FollowUpResponse>(`/api/sessions/live/${encodeURIComponent(sid)}/message`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),
  summary: () => fetchJson<TodaySummaryResponse>('/api/summary'),
  // Plan 06-01 ACTV-05: unified failures
  sessionsFailures: (range: Range) =>
    fetchJson<FailuresResponse>(`/api/sessions/failures?range=${range}`),

  // Observability (Phase 3)
  usageTokens: (range: Range) =>
    fetchJson<TokenUsageResponse>(`/api/usage/tokens?range=${range}`),
  usageCache: (range: Range) =>
    fetchJson<CacheResponse>(`/api/usage/cache?range=${range}`),
  sessionsOutcomes: (range: Range) =>
    fetchJson<OutcomesResponse>(`/api/sessions/outcomes?range=${range}`),
  // Plan 06-01: range param added (was previously unparam'd; backend has always
  // accepted ?range=, defaulting to 7d). The Phase 6 panel layer always passes
  // a range so the cadence cache key is range-scoped.
  toolsLatency: (range: Range) =>
    fetchJson<ToolLatencyResponse>(`/api/tools/latency?range=${range}`),
  hooksActivity: (range: Range) =>
    fetchJson<HookActivityResponse>(`/api/hooks/activity?range=${range}`),
  sessionsByProject: (range: RangeAll) =>
    fetchJson<ProjectRollupResponse>(`/api/sessions/by-project?range=${range}`),
  toolsAgentFanout: (range: Range) =>
    fetchJson<AgentFanoutResponse>(`/api/tools/agent-fanout?range=${range}`),
  toolsEditDecisions: (range: Range) =>
    fetchJson<EditDecisionsResponse>(`/api/tools/edit-decisions?range=${range}`),
  activityProductivity: (range: Range) =>
    fetchJson<ProductivityResponse>(`/api/activity/productivity?range=${range}`),
  systemPressure: () => fetchJson<PressureResponse>('/api/system/pressure'),
  // Plan 06-01 ACTV-01: 30-day heatmap
  activityHeatmap: (range: Range) =>
    fetchJson<HeatmapResponse>(`/api/activity/heatmap?range=${range}`),

  // MCP (Phase 3)
  mcp: () => fetchJson<McpServerListResponse>('/api/mcp'),
  mcpServerTools: (server: string) =>
    fetchJson<McpToolsResponse>(`/api/mcp/${encodeURIComponent(server)}/tools`),
  mcpSync: () => fetchJson<unknown>('/api/mcp/sync', { method: 'POST' }),
  mcpMeasure: () => fetchJson<unknown>('/api/mcp/measure', { method: 'POST' }),

  // Skills (Phase 3) — Phase 7 narrows
  skills: (qs?: string) => fetchJson<unknown>(`/api/skills${qs ? `?${qs}` : ''}`),
  skillsSync: () => fetchJson<unknown>('/api/skills/sync', { method: 'POST' }),
  skillAutonomy: (name: string, body: unknown) =>
    fetchJson<unknown>(`/api/skills/${encodeURIComponent(name)}/autonomy`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),

  // HITL (Phase 4) — Phase 7 narrows
  decisions: (qs?: string) => fetchJson<unknown>(`/api/decisions${qs ? `?${qs}` : ''}`),
  createDecision: (body: unknown) =>
    fetchJson<unknown>('/api/decisions', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),
  answerDecision: (id: number, body: unknown) =>
    fetchJson<unknown>(`/api/decisions/${id}/answer`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),
  inbox: (qs?: string) => fetchJson<unknown>(`/api/inbox${qs ? `?${qs}` : ''}`),
  createInbox: (body: unknown) =>
    fetchJson<unknown>('/api/inbox', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),
  readInbox: (id: number) =>
    fetchJson<unknown>(`/api/inbox/${id}/read`, { method: 'POST' }),
  replyInbox: (id: number, body: unknown) =>
    fetchJson<unknown>(`/api/inbox/${id}/reply`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),

  // Tasks (Phase 4) — Phase 7 narrows
  tasks: (qs?: string) => fetchJson<unknown>(`/api/tasks${qs ? `?${qs}` : ''}`),
  createTask: (body: unknown) =>
    fetchJson<unknown>('/api/tasks', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),
  patchTask: (id: number, body: unknown) =>
    fetchJson<unknown>(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),
  deleteTask: (id: number) =>
    fetchJson<unknown>(`/api/tasks/${id}`, { method: 'DELETE' }),
  approveTask: (id: number) =>
    fetchJson<unknown>(`/api/tasks/${id}/approve`, { method: 'POST' }),
  rerunTask: (id: number) =>
    fetchJson<unknown>(`/api/tasks/${id}/rerun`, { method: 'POST' }),
  triggerDispatcher: () =>
    fetchJson<unknown>('/api/dispatcher/trigger', { method: 'POST' }),

  // Schedules (Phase 4) — Phase 7 narrows
  schedules: () => fetchJson<unknown>('/api/schedules'),
  createSchedule: (body: unknown) =>
    fetchJson<unknown>('/api/schedules', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),
  patchSchedule: (id: number, body: unknown) =>
    fetchJson<unknown>(`/api/schedules/${id}`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),
  deleteSchedule: (id: number) =>
    fetchJson<unknown>(`/api/schedules/${id}`, { method: 'DELETE' }),
  scheduleRuns: (id: number) =>
    fetchJson<unknown>(`/api/schedules/${id}/runs`),
  parseNlSchedule: (body: unknown) =>
    fetchJson<unknown>('/api/schedules/parse-nl', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),

  // Emergency stop (Phase 4) — Phase 7 narrows
  emergencyStop: () =>
    fetchJson<unknown>('/api/system/emergency-stop', { method: 'POST' }),
  emergencyResume: () =>
    fetchJson<unknown>('/api/system/emergency-resume', { method: 'POST' }),

  // Sync (Phase 2)
  sync: () => fetchJson<unknown>('/api/sync', { method: 'POST' }),
} as const
