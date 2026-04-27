// Typed fetcher infrastructure for backend endpoints shipped in Phases 3 + 4.
// Phase 5 ships infra only; bare header (CONTEXT decision) means no useQuery
// calls execute in v1. Phase 6 adds React Query hooks per endpoint by importing
// these fns (e.g. `useQuery({ queryKey: ['health'], queryFn: api.health })`).

export interface HealthResponse {
  status: 'ok'
  uptime_s: number
  version: string
}

// Phase 3/4 response types — minimal shapes matching the documented API
// contracts. Phase 6 will tighten field-by-field as it consumes them.
export interface SessionListItem {
  id: string
  project: string
  model: string | null
  started_at: string
  ended_at: string | null
  tokens_input: number
  tokens_output: number
}

export interface SessionListResponse {
  items: SessionListItem[]
  total: number
  offset: number
  limit: number
}

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

/**
 * Typed fetcher map keyed by endpoint nickname.
 * One entry per backend endpoint shipped through Phase 4.
 */
export const api = {
  // System (Phase 1 + 3)
  health: () => fetchJson<HealthResponse>('/api/health'),
  systemHealth: () => fetchJson<unknown>('/api/system/health'),
  systemState: (key: string) => fetchJson<unknown>(`/api/system/state/${encodeURIComponent(key)}`),
  attention: () => fetchJson<unknown>('/api/attention'),

  // Sessions (Phase 3)
  sessions: (qs?: string) =>
    fetchJson<SessionListResponse>(`/api/sessions${qs ? `?${qs}` : ''}`),
  sessionDetails: (id: string) =>
    fetchJson<unknown>(`/api/sessions/${encodeURIComponent(id)}/details`),
  sessionsLive: () => fetchJson<unknown>('/api/sessions/live'),
  sessionLiveState: (sid: string) =>
    fetchJson<unknown>(`/api/sessions/live/${encodeURIComponent(sid)}/state`),
  sessionFollowUp: (sid: string, body: unknown) =>
    fetchJson<unknown>(`/api/sessions/live/${encodeURIComponent(sid)}/message`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),
  summary: () => fetchJson<unknown>('/api/summary'),

  // Observability (Phase 3)
  usageTokens: (range: 'today' | '7d' | '30d') =>
    fetchJson<unknown>(`/api/usage/tokens?range=${range}`),
  usageCache: (range: 'today' | '7d' | '30d') =>
    fetchJson<unknown>(`/api/usage/cache?range=${range}`),
  sessionsOutcomes: (range: 'today' | '7d' | '30d') =>
    fetchJson<unknown>(`/api/sessions/outcomes?range=${range}`),
  toolsLatency: () => fetchJson<unknown>('/api/tools/latency'),
  hooksActivity: () => fetchJson<unknown>('/api/hooks/activity'),
  sessionsByProject: () => fetchJson<unknown>('/api/sessions/by-project'),
  toolsAgentFanout: () => fetchJson<unknown>('/api/tools/agent-fanout'),
  toolsEditDecisions: () => fetchJson<unknown>('/api/tools/edit-decisions'),
  activityProductivity: (range: 'today' | '7d' | '30d') =>
    fetchJson<unknown>(`/api/activity/productivity?range=${range}`),
  systemPressure: () => fetchJson<unknown>('/api/system/pressure'),

  // MCP (Phase 3)
  mcp: () => fetchJson<unknown>('/api/mcp'),
  mcpServerTools: (server: string) =>
    fetchJson<unknown>(`/api/mcp/${encodeURIComponent(server)}/tools`),
  mcpSync: () => fetchJson<unknown>('/api/mcp/sync', { method: 'POST' }),
  mcpMeasure: () => fetchJson<unknown>('/api/mcp/measure', { method: 'POST' }),

  // Skills (Phase 3)
  skills: (qs?: string) => fetchJson<unknown>(`/api/skills${qs ? `?${qs}` : ''}`),
  skillsSync: () => fetchJson<unknown>('/api/skills/sync', { method: 'POST' }),
  skillAutonomy: (name: string, body: unknown) =>
    fetchJson<unknown>(`/api/skills/${encodeURIComponent(name)}/autonomy`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),

  // HITL (Phase 4)
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

  // Tasks (Phase 4)
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

  // Schedules (Phase 4)
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

  // Emergency stop (Phase 4)
  emergencyStop: () =>
    fetchJson<unknown>('/api/system/emergency-stop', { method: 'POST' }),
  emergencyResume: () =>
    fetchJson<unknown>('/api/system/emergency-resume', { method: 'POST' }),

  // Sync (Phase 2)
  sync: () => fetchJson<unknown>('/api/sync', { method: 'POST' }),
} as const
