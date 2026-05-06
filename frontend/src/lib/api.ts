// Typed fetcher infrastructure for backend endpoints.
// These interfaces mirror backend Pydantic schemas so UI callers stay aligned
// with the API surface, including analytical panels, HITL, task, schedule,
// skills, MCP write paths, emergency stop, context health, and manual sync.

// ============================================================================
// Range type aliases — encoded once, reused across every range-aware endpoint
// ============================================================================

export type Range = 'today' | '7d' | '30d'
export type RangeAll = Range | 'all'

// Phase 14 SkillRange — separate alias avoids broad-impact extension of Range.
// See 14-RESEARCH.md Open Q #3 / Plan 14-02 D-05. Mirrors backend
// cmc/api/schemas/skills.py SkillRange = Literal["14d", "30d"].
export type SkillRange = '14d' | '30d'

// Phase 15 AlertRange — full 4-tier (mirrors backend AlertRange Literal).
// Alerts events may be queried at all four ranges (immediate triage vs.
// monthly review). Plan 04 D-01 — narrower than CostRange would constrain
// user query intent without benefit.
export type AlertRange = '1d' | '7d' | '14d' | '30d'
export type AlertKind = 'threshold' | 'anomaly'

// ============================================================================
// Health
// ============================================================================

export interface HealthResponse {
  status: 'ok'
  uptime_s: number
  version: string
}

// ============================================================================
// System (SAPI-* + ESTOP)
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

// ESTOP — typed from backend schema. Mirror
// backend/cmc/api/schemas/system.py EmergencyStopResponse / EmergencyResumeResponse.
export interface EmergencyStopResponse {
  emergency_stop: boolean
  terminated_pids: number[]
  skipped_pids: number[]
  missing_pids: number[]
  failed_running_tasks: number
}

export interface EmergencyResumeResponse {
  emergency_stop: boolean
}

// ============================================================================
// Sessions (SESS-* + ACTV-05)
// ============================================================================

export interface SessionListItem {
  // Baseline shape kept for historical compatibility with consumers that
  // imported the loose type. New code should use SessionListItemFull below.
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

// ----------------------------------------------------------------------------
// Phase 16 — Session Compare (CMPR-01..05). Mirror backend Pydantic v2 schemas
// in cmc/api/schemas/sessions.py (SessionCompareSide / SkillSetDiff /
// SessionCompareResponse). cost_usd is DECIMAL-AS-JSON-STRING (Pydantic v2
// default) — frontend MUST display via template literal (`$${cost_usd}`),
// NEVER coerce via Number() (Phase 13/14/16 lock; Pitfall 1 in 16-RESEARCH).
// ----------------------------------------------------------------------------

export interface SessionCompareSide {
  session_id: string
  started_at: string
  ended_at: string | null
  duration_ms: number | null
  cwd: string | null
  model: string | null
  source: string | null
  outcome: string | null
  tokens_input: number
  tokens_output: number
  tokens_cache_read: number
  tokens_cache_create_5m: number
  tokens_cache_create_1h: number
  tool_call_count: number
  message_count: number
  cost_usd: string             // Decimal-string — NEVER Number()
  skills_used: string[]
  over_cap: boolean
  tool_counts: Record<string, number>
}

export interface SkillSetDiff {
  shared: string[]
  only_a: string[]
  only_b: string[]
}

export interface SessionCompareResponse {
  a: SessionCompareSide
  b: SessionCompareSide
  skill_diff: SkillSetDiff
  rates_as_of: string | null
  over_cap: boolean
  cap: number
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

// ACTV-05: unified failures
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
// Observability (OBSV-* + ACTV-01)
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

// ACTV-01: heatmap
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
// MCP (MCP-*)  — typed from backend schema mcpSync + mcpMeasure responses
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

// MCP-03 / MCP-04 — typed from backend schema. Mirror
// backend/cmc/api/schemas/mcp.py.
export interface McpSyncResponse {
  status: 'ok' | 'conflict'
  servers: number
  tools: number
  source_counts: Record<string, number>
  duration_ms: number
}

export interface McpMeasureResponse {
  status: string
  servers_measured: number
  duration_ms: number
}

// ============================================================================
// Skills (SKILL-*)  — typed from backend schema
// Mirror backend/cmc/api/schemas/skills.py verbatim.
// ============================================================================

export interface SkillRow {
  name: string
  environment: string
  user_invocable: boolean
  autonomy: string
  description: string | null
  path: string
  updated_at: string
}

export interface SkillListResponse {
  items: SkillRow[]
}

export interface SkillSyncResponse {
  status: string
  found: number
  upserted: number
  unchanged: number
  errors: number
  duration_ms: number
}

export interface SkillAutonomyRequest {
  autonomy: 'auto' | 'review' | 'manual'
}

export interface SkillAutonomyResponse {
  name: string
  autonomy: string
  updated_at: string
}

// ----------------------------------------------------------------------------
// Phase 14 — Skills API response models (mirrors backend cmc/api/schemas/skills.py
// SkillSparklineRow / SkillUsageRow / SkillUsageResponse / SkillCostResponse /
// SkillLatencyResponse / SkillRunRow / SkillRunsResponse). Decimal fields
// (cost_usd) are TYPED AS STRING — Pydantic v2 default serializes Decimal as
// JSON string to preserve precision; never coerce via Number() for display.
// ----------------------------------------------------------------------------

export interface SkillSparklineRow {
  day: string                  // YYYY-MM-DD (STRFTIME local-day bucket)
  invocations: number
  cost_usd?: string | null     // Decimal-as-JSON-string (Pydantic v2 default)
}

// Phase 19 — SKLP-09 period-over-period delta primitive.
// Mirror backend cmc/api/schemas/skills.py DeltaPill: curr/prev/delta are
// Decimal (Pydantic v2 default → JSON STRING); delta_pct is float | null
// (null when prev=0; UI renders '—'); direction is the rendered arrow class.
// Frontend treats the numeric strings as opaque payloads and Number-coerces
// only when passing to DeltaPill (which expects number).
export interface DeltaPill {
  curr: string                 // Decimal-as-JSON-string
  prev: string
  delta: string
  delta_pct: number | null     // null when prev=0 (no baseline)
  direction: 'up' | 'down' | 'flat'
}

export interface SkillUsageRow {
  skill_name: string
  total: number
  sparkline: SkillSparklineRow[]
  // Phase 19 — SKLP-09 / SKLP-10:
  usage_delta: DeltaPill
  badges: Array<'new_this_week' | 'dormant'>
}

export interface SkillUsageResponse {
  range: SkillRange
  rows: SkillUsageRow[]
}

export interface SkillCostResponse {
  range: SkillRange
  name: string
  rates_as_of: string | null   // YYYY-MM-DD or null (no priced rows in window)
  tokens_input: number
  tokens_output: number
  tokens_cache_read: number
  tokens_cache_create_5m: number
  tokens_cache_create_1h: number
  cost_usd: string             // Decimal serialized as JSON string — keep as string!
  cost_attribution: 'request' | 'session'
  trend: SkillSparklineRow[]
  // Phase 19 — SKLP-09 (period-over-period cost delta, server-computed):
  cost_delta: DeltaPill
}

// Phase 19 — SKLP-08 per-project breakdown (GET /api/skills/{name}/projects).
// CRITICAL: SkillProjectRow has NO 'cwd' / 'path' / 'display_path' fields —
// project_key (12-char hex of sha1[:12]) is the ONLY project-shaped value.
// Backend enforces this structurally (test_skill_projects_no_path_leakage);
// the frontend mirrors the same enumeration so the type system rejects any
// renderer that tries to surface a path-shaped value.
export interface SkillProjectRow {
  project_key: string          // 12-char hex (sha1[:12] of realpath(cwd))
  count: number
  p50_ms: number | null        // null when no completed runs
  p95_ms: number | null
  cost_usd: string             // Decimal-as-JSON-string per Pydantic v2 default
  cost_attribution: 'session' | 'approximate'
  low_sample: boolean          // count < MIN_LATENCY_SAMPLES (30)
}

export interface SkillProjectsResponse {
  name: string
  range: SkillRange
  rows: SkillProjectRow[]
}

// ============================================================================
// Phase 20 cost surface (ANLY-06 + ANLY-07).
// CostRange + BreakdownDim mirror backend cmc.api.schemas.cost Literal types.
// Decimal fields are JSON strings (Pydantic v2 default) — NEVER coerce to
// Number for display; render via template literals to preserve full precision
// (Pitfall 5 from 14-RESEARCH.md, carried forward).
// ============================================================================

export type CostRange = '1d' | '7d' | '14d' | '30d'
export type BreakdownDim = 'model' | 'skill' | 'project'

// CostBreakdownRow.key is a 12-char hex project_key when dim=project (Phase 19
// SKLP-08 invariant + Plan 20-01 SQL refactor) — NEVER a raw filesystem path.
export interface CostBreakdownRow {
  key: string
  tokens_input: number
  tokens_output: number
  tokens_cache_read: number
  tokens_cache_create_5m: number
  tokens_cache_create_1h: number
  cost_usd: string  // Decimal-as-JSON-string
}

export interface CostBreakdownResponse {
  range: CostRange
  dim: BreakdownDim
  rates_as_of: string | null
  total_usd: string
  rows: CostBreakdownRow[]
}

// CostForecastResponse — ANLY-06. Matches backend Pydantic CostForecastResponse
// shape (Plan 20-02). insufficient_data + partial_month_bias are server-source-
// of-truth flags (Pitfall 7 in 20-RESEARCH.md): never re-derive client-side
// from days_elapsed.
export interface CostForecastResponse {
  rates_as_of: string | null
  days_elapsed: number
  days_in_month: number
  baseline_days: number
  month_to_date_usd: string                  // Decimal-as-JSON-string, ALWAYS present
  projected_month_total_usd: string | null   // null when insufficient_data
  insufficient_data: boolean
  partial_month_bias: boolean
}

export interface SkillLatencyResponse {
  range: SkillRange
  name: string
  sample_count: number
  p50_ms: number | null
  p95_ms: number | null
  max_ms: number | null
  error_count: number
  error_rate: number
  low_sample: boolean          // server-side via MIN_LATENCY_SAMPLES=30 (SKLP-05)
}

export interface SkillRunRow {
  ts: string                   // ISO datetime
  session_id: string | null
  cwd: string                  // '<unknown>' if no joined session row
  request_id: string | null
}

export interface SkillRunsResponse {
  name: string
  rows: SkillRunRow[]
}

// ============================================================================
// Alerts (ALRT-09 schemas) — Phase 15 Plan 04 frontend lib plumbing.
// Mirror backend cmc/api/schemas/alerts.py verbatim. Decimal fields use the
// Pydantic v2 default (string-as-JSON) — but alerts schemas have NO Decimal
// fields; thresholds and last_value are plain numbers (float in JSON).
// ============================================================================

export interface AlertRule {
  rule_id: number
  name: string
  kind: AlertKind
  metric: string
  threshold_fire: number | null
  threshold_clear: number | null
  min_dwell_seconds: number
  min_samples: number
  cooldown_seconds: number
  enabled: boolean
  spec_version: number
  params_json: Record<string, unknown>
  created_at: string                     // ISO 8601
  updated_at: string                     // ISO 8601
}

export interface AlertRuleListResponse {
  items: AlertRule[]
  total: number
}

/** Body for POST /api/alerts/rules. Optional fields use backend defaults
 * (e.g. min_samples=5, cooldown_seconds=600). spec_version pins the rule
 * schema version for forward-compat (defaults to 1 server-side). */
export interface AlertRuleCreate {
  name: string
  kind: AlertKind
  metric: string
  threshold_fire?: number | null
  threshold_clear?: number | null
  min_dwell_seconds?: number
  min_samples?: number
  cooldown_seconds?: number
  enabled?: boolean
  spec_version?: number
  params_json?: Record<string, unknown>
}

/** Body for PATCH /api/alerts/rules/{id}. All fields optional — partial
 * update. Server validates threshold_fire/threshold_clear ordering on each
 * patch (clear>=fire for "improving" semantics). */
export interface AlertRulePatch {
  name?: string
  enabled?: boolean
  threshold_fire?: number | null
  threshold_clear?: number | null
  min_dwell_seconds?: number
  min_samples?: number
  cooldown_seconds?: number
  params_json?: Record<string, unknown>
}

export interface AlertEvent {
  decision_id: number
  rule_id: number
  rule_name: string
  scope_key: string
  fired_at: string                       // ISO 8601
  cleared_at: string | null              // null while pending
  status: 'pending' | 'answered'
  last_value: number | null
}

export interface AlertEventsResponse {
  range: AlertRange
  items: AlertEvent[]
  total: number
}

/** Body for POST /api/alerts/_ack. scope_hash is an 8-char hex digest
 * (server-side derived from scope_key) — UI surfaces it on AlertEventsList
 * rows for inclusion here. */
export interface AlertAckRequest {
  rule_id: number
  scope_hash: string                     // 8-char hex
}

// ============================================================================
// HITL (HITL-*) — typed from backend schema
// Mirror backend/cmc/api/schemas/hitl.py verbatim.
// ============================================================================

export interface DecisionListItem {
  id: number
  session_id: string | null
  task_id: number | null
  dedup_key: string
  prompt: string
  options: unknown[]
  status: string
  answer: string | null
  answered_at: string | null
  answered_by: string | null
  created_at: string
}

export interface DecisionListResponse {
  items: DecisionListItem[]
  total: number
}

export interface DecisionAnswerRequest {
  answer: string
  answered_by?: 'dashboard' | 'telegram' | 'cli'
}

export interface DecisionAnswerResponse {
  answered: boolean
  decision_id: number
  queue_path: string
}

export interface InboxListItem {
  id: number
  session_id: string | null
  task_id: number | null
  subject: string | null
  body: string
  read: boolean
  read_at: string | null
  reply: string | null
  replied_at: string | null
  created_at: string
}

export interface InboxListResponse {
  items: InboxListItem[]
  total: number
}

export interface InboxReadResponse {
  id: number
  read: boolean
  read_at: string
}

export interface InboxReplyRequest {
  reply: string
}

export interface InboxReplyResponse {
  replied: boolean
  inbox_id: number
  queue_path: string
}

// ============================================================================
// Tasks (TASK-*) — typed from backend schema
// Mirror backend/cmc/api/schemas/tasks.py verbatim.
// ============================================================================

export interface TaskListItem {
  id: number
  title: string
  description: string
  status: string
  priority: number
  quadrant: 'do' | 'plan' | 'delegate' | 'drop' | null
  approval: 'auto' | 'awaiting_approval'
  risk: 'low' | 'medium' | 'high' | null
  dry_run: boolean
  model: string | null
  execution_mode: 'interactive' | 'classic' | 'stream'
  skill: string | null
  scheduled_for: string | null
  schedule_id: number | null
  pid: number | null
  stdout_path: string | null
  error_message: string | null
  created_at: string
  started_at: string | null
  ended_at: string | null
  approved_at: string | null
}

export interface TaskListResponse {
  items: TaskListItem[]
  total: number
}

export interface TaskCreate {
  title: string
  description?: string
  priority?: number
  quadrant?: 'do' | 'plan' | 'delegate' | 'drop'
  approval?: 'auto' | 'awaiting_approval'
  risk?: 'low' | 'medium' | 'high'
  dry_run?: boolean
  model?: string
  execution_mode?: 'interactive' | 'classic' | 'stream'
  skill?: string
  scheduled_for?: string
  schedule_id?: number
}

export interface TaskPatch {
  title?: string
  description?: string
  priority?: number
  quadrant?: 'do' | 'plan' | 'delegate' | 'drop'
  approval?: 'auto' | 'awaiting_approval'
  risk?: 'low' | 'medium' | 'high'
  dry_run?: boolean
  model?: string
  execution_mode?: 'interactive' | 'classic' | 'stream'
  skill?: string
  scheduled_for?: string
  schedule_id?: number
  status?: string
  error_message?: string
}

export interface TaskApproveResponse {
  id: number
  status: string
  approved_at: string
}

export interface TaskRerunResponse {
  id: number
  status: string
}

export interface TaskTriggerResponse {
  triggered: boolean
  pid: number
}

export interface TaskListParams {
  status?: string
  quadrant?: string
  schedule_id?: number
  limit?: number
  offset?: number
}

export interface DecisionListParams {
  status?: string
  limit?: number
}

export interface InboxListParams {
  unread?: boolean
  max_age_days?: number
  limit?: number
}

// ============================================================================
// Schedules (SCHD-*) — typed from backend schema
// Mirror backend/cmc/api/schemas/schedules.py verbatim.
// ============================================================================

export interface ScheduleListItem {
  id: number
  name: string
  cron: string
  enabled: boolean
  next_run_at: string | null
  last_run_at: string | null
  task_template: Record<string, unknown>
  skill: string | null
  created_at: string
  updated_at: string
}

export interface ScheduleListResponse {
  items: ScheduleListItem[]
  total: number
}

export interface ScheduleCreate {
  name: string
  cron: string
  enabled?: boolean
  task_template?: Record<string, unknown>
  skill?: string
}

export interface SchedulePatch {
  name?: string
  cron?: string
  enabled?: boolean
  task_template?: Record<string, unknown>
  skill?: string
}

export interface ScheduleRunsResponse {
  items: TaskListItem[]
  total: number
}

export interface NLCronRequest {
  description: string
}

export interface NLCronResponse {
  cron: string
  description: string
}

// ============================================================================
// Context (SKLP-03) — new endpoint
// Mirror backend/cmc/api/schemas/context.py.
// Defense in depth: schema deliberately has NO field that carries values.
// ============================================================================

export interface ContextHealthResponse {
  settings_path: string
  settings_exists: boolean
  claude_md_path: string
  claude_md_exists: boolean
  claude_md_lines: number
  settings_keys: string[]  // key NAMES only — secrets redacted as "<NAME> (redacted)"
  mcp_server_count: number
  hook_count: number
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

/** 204 No Content endpoints (TASK-04 DELETE, SCHD-04 DELETE).
 * Calling r.json() on a 204 throws because there is no body. fetchVoid
 * preserves the ApiError shape on non-2xx and returns void on success. */
export async function fetchVoid(path: string, init?: RequestInit): Promise<void> {
  const r = await fetch(path, init)
  if (!r.ok) throw new ApiError(path, r.status, await r.text())
  // Don't read body — 204 has none.
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

function buildTasksQs(params: TaskListParams = {}): string {
  const usp = new URLSearchParams()
  if (params.status) usp.set('status', params.status)
  if (params.quadrant) usp.set('quadrant', params.quadrant)
  if (typeof params.schedule_id === 'number')
    usp.set('schedule_id', String(params.schedule_id))
  if (typeof params.limit === 'number') usp.set('limit', String(params.limit))
  if (typeof params.offset === 'number') usp.set('offset', String(params.offset))
  return usp.toString()
}

function buildDecisionsQs(params: DecisionListParams = {}): string {
  const usp = new URLSearchParams()
  if (params.status) usp.set('status', params.status)
  if (typeof params.limit === 'number') usp.set('limit', String(params.limit))
  return usp.toString()
}

function buildInboxQs(params: InboxListParams = {}): string {
  const usp = new URLSearchParams()
  if (typeof params.unread === 'boolean') usp.set('unread', String(params.unread))
  if (typeof params.max_age_days === 'number')
    usp.set('max_age_days', String(params.max_age_days))
  if (typeof params.limit === 'number') usp.set('limit', String(params.limit))
  return usp.toString()
}

/**
 * Typed fetcher map keyed by endpoint nickname.
 * HITL/Tasks/Schedules/Skills/MCP-write/ESTOP/Sync families are typed from
 * backend Pydantic schemas.
 */
export const api = {
  // System
  health: () => fetchJson<HealthResponse>('/api/health'),
  systemHealth: () => fetchJson<SystemHealthResponse>('/api/system/health'),
  // FIX: backend route is GET /api/system/state with `key` as a
  // QUERY param (verified backend/cmc/api/routes/system.py SAPI-03), not a
  // path segment. Old `/api/system/state/${key}` returned 404.
  systemState: (key: string) =>
    fetchJson<SystemStateResponse>(`/api/system/state?key=${encodeURIComponent(key)}`),
  attention: () => fetchJson<AttentionResponse>('/api/attention'),

  // Sessions
  sessions: (params: SessionsListParams | string = {}) => {
    // Backwards-compatible: accept either the new typed params object OR a
    // raw query string (callers may have passed a pre-built qs).
    const qs = typeof params === 'string' ? params : buildSessionsQs(params)
    return fetchJson<SessionListResponse>(`/api/sessions${qs ? `?${qs}` : ''}`)
  },
  sessionDetails: (id: string) =>
    fetchJson<SessionDetailsResponse>(`/api/sessions/${encodeURIComponent(id)}/details`),
  // Phase 16 (CMPR-01) — paired-session compare. Single-round-trip read.
  sessionCompare: (a: string, b: string) =>
    fetchJson<SessionCompareResponse>(
      `/api/sessions/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`,
    ),
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
  // ACTV-05: unified failures
  sessionsFailures: (range: Range) =>
    fetchJson<FailuresResponse>(`/api/sessions/failures?range=${range}`),

  // Observability
  usageTokens: (range: Range) =>
    fetchJson<TokenUsageResponse>(`/api/usage/tokens?range=${range}`),
  usageCache: (range: Range) =>
    fetchJson<CacheResponse>(`/api/usage/cache?range=${range}`),
  sessionsOutcomes: (range: Range) =>
    fetchJson<OutcomesResponse>(`/api/sessions/outcomes?range=${range}`),
  // Note: range param added (was previously unparam'd; backend has always
  // accepted ?range=, defaulting to 7d). The current panel layer always passes
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
  // ACTV-01: 30-day heatmap
  activityHeatmap: (range: Range) =>
    fetchJson<HeatmapResponse>(`/api/activity/heatmap?range=${range}`),

  // MCP
  mcp: () => fetchJson<McpServerListResponse>('/api/mcp'),
  mcpServerTools: (server: string) =>
    fetchJson<McpToolsResponse>(`/api/mcp/${encodeURIComponent(server)}/tools`),
  mcpSync: () => fetchJson<McpSyncResponse>('/api/mcp/sync', { method: 'POST' }),
  mcpMeasure: () =>
    fetchJson<McpMeasureResponse>('/api/mcp/measure', { method: 'POST' }),

  // Skills
  skills: (qs?: string) =>
    fetchJson<SkillListResponse>(`/api/skills${qs ? `?${qs}` : ''}`),
  skillsSync: () =>
    fetchJson<SkillSyncResponse>('/api/skills/sync', { method: 'POST' }),
  skillAutonomy: (name: string, body: SkillAutonomyRequest) =>
    fetchJson<SkillAutonomyResponse>(
      `/api/skills/${encodeURIComponent(name)}/autonomy`,
      {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      },
    ),

  // Phase 14 (SKIL-04..07) — read-time-computed skills analytics. Defaults
  // mirror backend defaults: usage limit=10, runs limit=20. encodeURIComponent
  // the skill name for defense-in-depth even though backend rejects bad names
  // via _SKILL_NAME_RE (see threat_model T-14-02-01).
  skillUsage: (range: SkillRange, limit: number = 10) =>
    fetchJson<SkillUsageResponse>(
      `/api/skills/usage?range=${range}&limit=${limit}`,
    ),
  skillCost: (name: string, range: SkillRange) =>
    fetchJson<SkillCostResponse>(
      `/api/skills/${encodeURIComponent(name)}/cost?range=${range}`,
    ),
  skillLatency: (name: string, range: SkillRange) =>
    fetchJson<SkillLatencyResponse>(
      `/api/skills/${encodeURIComponent(name)}/latency?range=${range}`,
    ),
  skillRuns: (name: string, limit: number = 20) =>
    fetchJson<SkillRunsResponse>(
      `/api/skills/${encodeURIComponent(name)}/runs?limit=${limit}`,
    ),
  // Phase 19 (SKLP-08) — per-project rollup for /skills/$name. Path-leakage-
  // resistant by schema construction (no cwd/path field on the wire).
  skillProjects: (name: string, range: SkillRange) =>
    fetchJson<SkillProjectsResponse>(
      `/api/skills/${encodeURIComponent(name)}/projects?range=${range}`,
    ),

  // Phase 20 (ANLY-06) — monthly cost forecast. Read-time-computed; current
  // month implicit (server-clock derived). Decimal-as-JSON-string fields.
  costForecast: () =>
    fetchJson<CostForecastResponse>('/api/cost/forecast'),

  // Phase 20 (ANLY-07) — per-project cost breakdown. The Cost dashboard
  // surface uses dim='project' (path-leakage-resistant via Plan 20-01 SQL
  // refactor: GROUP BY sessions.project_key + WHERE != '' filter), but the
  // param is left general so future dim=model / dim=skill consumers can
  // share the fetcher without schema change.
  costBreakdown: (dim: BreakdownDim, range: CostRange) =>
    fetchJson<CostBreakdownResponse>(
      `/api/cost/breakdown?dim=${dim}&range=${range}`,
    ),

  // Phase 15 (ALRT-09) — alert rules CRUD + events list + ack. Body shapes
  // (AlertRuleCreate / AlertRulePatch / AlertAckRequest) are validated
  // server-side; mutations in queries.ts surface 422 via mutation.onError.
  alertRules: (limit: number = 200, offset: number = 0) =>
    fetchJson<AlertRuleListResponse>(
      `/api/alerts/rules?limit=${limit}&offset=${offset}`,
    ),
  alertRuleCreate: (body: AlertRuleCreate) =>
    fetchJson<AlertRule>('/api/alerts/rules', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),
  alertRulePatch: (id: number, body: AlertRulePatch) =>
    fetchJson<AlertRule>(`/api/alerts/rules/${id}`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),
  alertRuleDelete: (id: number) =>
    fetchVoid(`/api/alerts/rules/${id}`, { method: 'DELETE' }),
  alertEvents: (range: AlertRange = '7d') =>
    fetchJson<AlertEventsResponse>(`/api/alerts/events?range=${range}`),
  alertAck: (body: AlertAckRequest) =>
    fetchJson<{ ok: true; acked_until: string }>('/api/alerts/_ack', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),

  // HITL
  decisions: (params: DecisionListParams = {}) => {
    const qs = buildDecisionsQs(params)
    return fetchJson<DecisionListResponse>(`/api/decisions${qs ? `?${qs}` : ''}`)
  },
  createDecision: (body: unknown) =>
    fetchJson<DecisionListItem>('/api/decisions', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),
  decisionAnswer: (id: number, body: DecisionAnswerRequest) =>
    fetchJson<DecisionAnswerResponse>(`/api/decisions/${id}/answer`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),
  /** @deprecated use decisionAnswer. Kept as alias to ease migration. */
  answerDecision: (id: number, body: DecisionAnswerRequest) =>
    fetchJson<DecisionAnswerResponse>(`/api/decisions/${id}/answer`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),
  inbox: (params: InboxListParams = {}) => {
    const qs = buildInboxQs(params)
    return fetchJson<InboxListResponse>(`/api/inbox${qs ? `?${qs}` : ''}`)
  },
  createInbox: (body: unknown) =>
    fetchJson<InboxListItem>('/api/inbox', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),
  inboxRead: (id: number) =>
    fetchJson<InboxReadResponse>(`/api/inbox/${id}/read`, { method: 'POST' }),
  /** @deprecated alias of inboxRead. */
  readInbox: (id: number) =>
    fetchJson<InboxReadResponse>(`/api/inbox/${id}/read`, { method: 'POST' }),
  inboxReply: (id: number, body: InboxReplyRequest) =>
    fetchJson<InboxReplyResponse>(`/api/inbox/${id}/reply`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),
  /** @deprecated alias of inboxReply. */
  replyInbox: (id: number, body: InboxReplyRequest) =>
    fetchJson<InboxReplyResponse>(`/api/inbox/${id}/reply`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),

  // Tasks. taskDelete uses fetchVoid because
  // TASK-04 returns 204 No Content (Pitfall: don't call r.json() on 204).
  tasks: (params: TaskListParams = {}) => {
    const qs = buildTasksQs(params)
    return fetchJson<TaskListResponse>(`/api/tasks${qs ? `?${qs}` : ''}`)
  },
  taskCreate: (body: TaskCreate) =>
    fetchJson<TaskListItem>('/api/tasks', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),
  /** @deprecated alias of taskCreate. */
  createTask: (body: TaskCreate) =>
    fetchJson<TaskListItem>('/api/tasks', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),
  taskPatch: (id: number, body: TaskPatch) =>
    fetchJson<TaskListItem>(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),
  /** @deprecated alias of taskPatch. */
  patchTask: (id: number, body: TaskPatch) =>
    fetchJson<TaskListItem>(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),
  taskDelete: (id: number) =>
    fetchVoid(`/api/tasks/${id}`, { method: 'DELETE' }),
  /** @deprecated alias of taskDelete. */
  deleteTask: (id: number) =>
    fetchVoid(`/api/tasks/${id}`, { method: 'DELETE' }),
  taskApprove: (id: number) =>
    fetchJson<TaskApproveResponse>(`/api/tasks/${id}/approve`, { method: 'POST' }),
  /** @deprecated alias of taskApprove. */
  approveTask: (id: number) =>
    fetchJson<TaskApproveResponse>(`/api/tasks/${id}/approve`, { method: 'POST' }),
  taskRerun: (id: number) =>
    fetchJson<TaskRerunResponse>(`/api/tasks/${id}/rerun`, { method: 'POST' }),
  /** @deprecated alias of taskRerun. */
  rerunTask: (id: number) =>
    fetchJson<TaskRerunResponse>(`/api/tasks/${id}/rerun`, { method: 'POST' }),
  // Dispatcher trigger is /api/dispatcher/trigger, NOT /api/tasks/{id}/trigger.
  dispatcherTrigger: () =>
    fetchJson<TaskTriggerResponse>('/api/dispatcher/trigger', { method: 'POST' }),
  /** @deprecated alias of dispatcherTrigger. */
  triggerDispatcher: () =>
    fetchJson<TaskTriggerResponse>('/api/dispatcher/trigger', { method: 'POST' }),

  // Schedules
  schedules: () => fetchJson<ScheduleListResponse>('/api/schedules'),
  scheduleCreate: (body: ScheduleCreate) =>
    fetchJson<ScheduleListItem>('/api/schedules', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),
  /** @deprecated alias of scheduleCreate. */
  createSchedule: (body: ScheduleCreate) =>
    fetchJson<ScheduleListItem>('/api/schedules', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),
  schedulePatch: (id: number, body: SchedulePatch) =>
    fetchJson<ScheduleListItem>(`/api/schedules/${id}`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),
  /** @deprecated alias of schedulePatch. */
  patchSchedule: (id: number, body: SchedulePatch) =>
    fetchJson<ScheduleListItem>(`/api/schedules/${id}`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),
  scheduleDelete: (id: number) =>
    fetchVoid(`/api/schedules/${id}`, { method: 'DELETE' }),
  /** @deprecated alias of scheduleDelete. */
  deleteSchedule: (id: number) =>
    fetchVoid(`/api/schedules/${id}`, { method: 'DELETE' }),
  scheduleRuns: (id: number) =>
    fetchJson<ScheduleRunsResponse>(`/api/schedules/${id}/runs`),
  // Natural-language cron route is POST /api/schedules/parse-nl, NOT
  // /api/schedules/nl-to-cron.
  schedulesParseNl: (body: NLCronRequest) =>
    fetchJson<NLCronResponse>('/api/schedules/parse-nl', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),
  /** @deprecated alias of schedulesParseNl. */
  parseNlSchedule: (body: NLCronRequest) =>
    fetchJson<NLCronResponse>('/api/schedules/parse-nl', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),

  // Emergency stop and resume.
  // Design note: resume is its own POST endpoint at
  // /api/system/emergency-resume; it is NOT a DELETE on /emergency-stop.
  emergencyStop: () =>
    fetchJson<EmergencyStopResponse>('/api/system/emergency-stop', {
      method: 'POST',
    }),
  emergencyResume: () =>
    fetchJson<EmergencyResumeResponse>('/api/system/emergency-resume', {
      method: 'POST',
    }),

  // Context
  contextHealth: () => fetchJson<ContextHealthResponse>('/api/context/health'),

  // Sync
  sync: () => fetchJson<unknown>('/api/sync', { method: 'POST' }),
} as const

// ============================================================================
// Phase 14 — Skills standalone fetcher exports.
// These are thin aliases over api.skill* — the project's panel layer goes
// through queries.ts hooks which call api.* — but the standalone names are
// exported here so direct callers (and Plan 14-02 must_haves grep checks) can
// import fetchSkill* without reaching into the api map. Functionally identical
// to api.skillUsage / api.skillCost / api.skillLatency / api.skillRuns.
// ============================================================================

export const fetchSkillUsage = api.skillUsage
export const fetchSkillCost = api.skillCost
export const fetchSkillLatency = api.skillLatency
export const fetchSkillRuns = api.skillRuns
// Phase 19 (SKLP-08) — per-project rollup fetcher.
export const fetchSkillProjects = api.skillProjects

// ============================================================================
// Phase 15 — Alerts standalone fetcher exports.
// Mirror of the Phase 14 dual-surface pattern: panel/hook layer goes through
// queries.ts which calls api.* — these standalone aliases satisfy direct
// callers + the must_haves grep contract (Plan 15-04 artifacts).
// ============================================================================

export const fetchAlertRules = api.alertRules
export const fetchAlertRuleCreate = api.alertRuleCreate
export const fetchAlertRulePatch = api.alertRulePatch
export const fetchAlertRuleDelete = api.alertRuleDelete
export const fetchAlertEvents = api.alertEvents
export const fetchAlertAck = api.alertAck

// ============================================================================
// Phase 20 — Cost dashboard standalone fetcher exports (ANLY-06 + ANLY-07).
// Same dual-surface pattern as Phase 14 / 15: panel/hook layer goes through
// queries.ts which calls api.* — these standalone aliases satisfy direct
// callers + the must_haves grep contract.
// ============================================================================

export const fetchCostForecast = api.costForecast
export const fetchCostBreakdown = api.costBreakdown
