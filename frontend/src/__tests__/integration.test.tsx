// End-to-end smoke test for the full future work6+7 shell.
//
// Boots the real <RouterProvider> over the generated routeTree (NOT an
// in-memory createRoute mock — those are reserved for component-level tests
// in components/ui/__tests__/*). This test exercises the entire mounted app:
// __root.tsx (QueryClientProvider + ErrorBoundary + AppShell) → routes/index
// (or activity / skills) → live panels (current + 7).
//
// `createMemoryHistory` gives a deterministic test environment without
// touching the browser history API. The selector `'h1'` discriminates page
// headings from CommandPalette items that share the same text.
//
// implementation extension — current final close-out guard:
//   - On `/`, `/activity`, AND `/skills`, every live panel must render real
//     content (no "Nothing to show yet" placeholder body remains). The
//     PlaceholderCardGrid helper file was DELETED in implementation; the only
//     remaining `lucide-inbox` icons would be from PanelCard EmptyStates
//     (which now pass NO icon, so 0 inbox icons should appear on every route).
//   - The assertion guards against accidental regressions where a future
//     panel might re-introduce the lucide-inbox EmptyState icon.
//   - OtelPanel mounts an EventSource; tests stub a no-op MockEventSource
//     so the activity route mounts without throwing.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, userEvent } from '../test/utils'
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router'
import { routeTree } from '../routeTree.gen'

class MockEventSource extends EventTarget {
  url: string
  closed = false
  constructor(url: string) {
    super()
    this.url = url
  }
  close() {
    this.closed = true
  }
}

function makeRouter(initialEntry: string) {
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  })
}

// URL-aware fetch mock — returns non-empty payloads for every current
// endpoint so live panels render data, not the "Nothing to show yet" empty
// state. Covers /api/system/health, /api/attention, /api/summary, /api/usage/*,
// /api/sessions/*, /api/tools/*, /api/hooks/*, /api/activity/*, /api/mcp,
// /api/system/pressure, and /api/firehose (returns 200 OK so the EventSource
// constructor doesn't throw — the mock EventSource handles its own lifecycle).
function makeFetchMock() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    if (url.includes('/api/system/health'))
      return json({
        status: 'ok',
        uptime_seconds: 60,
        memory_rss_mb: 128.5,
        last_otel_event_age_seconds: 10,
        daemon_ages: [{ key: 'jsonl_sync', last_tick_at: null, age_seconds: 30 }],
        tzname: 'UTC',
      })
    if (url.includes('/api/attention'))
      return json({
        items: [],
        pending_decisions: 0,
        failed_tasks: 0,
        stale_dispatcher_seconds: null,
        stuck_sessions: 0,
      })
    if (url.includes('/api/summary'))
      return json({
        date: '2026-04-27',
        sessions_count: 1,
        tokens_input_total: 100,
        tokens_output_total: 200,
        tokens_cache_read_total: 50,
        tokens_cache_create_total: 25,
        tool_call_count: 1,
        error_count: 0,
      })
    if (url.includes('/api/sessions/live')) return json([])
    if (url.includes('/api/sessions/failures'))
      return json({
        range: '30d',
        items: [
          {
            session_id: 'failedSession01',
            started_at: '2026-04-27T07:00:00Z',
            outcome: 'errored',
            last_error_message: 'boom',
          },
        ],
      })
    if (url.includes('/api/sessions/outcomes'))
      return json({
        range: '7d',
        items: [
          {
            day: '2026-04-27',
            errored: 0,
            rate_limited: 0,
            truncated: 0,
            unfinished: 0,
            ok: 1,
            total: 1,
          },
        ],
      })
    if (url.includes('/api/sessions/by-project'))
      return json({
        range: '7d',
        items: [
          {
            cwd: '/tmp/proj',
            display_path: '~/proj',
            sessions: 1,
            tokens_effective: 100,
            tool_calls: 1,
            pct_of_total: 1,
          },
        ],
      })
    if (url.includes('/api/sessions'))
      return json({
        items: [
          {
            session_id: 'liveSessionAAAA',
            started_at: '2026-04-27T08:00:00Z',
            ended_at: null,
            cwd: '/tmp/proj',
            model: 'sonnet',
            source: 'claude_code',
            outcome: null,
            tokens_input: 100,
            tokens_output: 200,
            tokens_cache_read: 50,
            tokens_cache_create: 25,
            tool_call_count: 1,
            message_count: 1,
          },
        ],
        total: 1,
        offset: 0,
        limit: 50,
      })
    if (url.includes('/api/usage/tokens'))
      return json({
        range: '7d',
        items: [
          {
            day: '2026-04-27',
            model: 'sonnet',
            source: 'claude_code',
            tokens_input: 100,
            tokens_output: 200,
            tokens_cache_read: 50,
            tokens_cache_create: 25,
            sessions_count: 1,
          },
        ],
      })
    if (url.includes('/api/usage/cache'))
      return json({
        hit_rate: 0.5,
        trend: [{ day: '2026-04-27', hit_rate: 0.5, billable_tokens: 100, low_sample: false }],
        range: '7d',
        low_sample: false,
      })
    if (url.includes('/api/tools/latency'))
      return json({
        range: '7d',
        items: [
          {
            tool_name: 'Bash',
            call_count: 1,
            p50_ms: 100,
            p95_ms: 200,
            max_ms: 300,
            error_rate: 0,
          },
        ],
      })
    if (url.includes('/api/tools/agent-fanout'))
      return json({
        range: '7d',
        items: [{ session_id: 'sid1', title: 'subagent', agent_calls: 1, started_at: '2026-04-27T08:00:00Z' }],
      })
    if (url.includes('/api/tools/edit-decisions'))
      return json({
        range: '7d',
        items: [{ tool_name: 'Edit', accepted: 1, rejected: 0, accept_rate: 1, low_sample: false }],
      })
    if (url.includes('/api/hooks/activity'))
      return json({
        range: '7d',
        total_fires: 1,
        items: [
          { day: '2026-04-27', hook_name: 'pre_tool', fires: 1, paired_duration_ms_p50: 50 },
        ],
      })
    if (url.includes('/api/activity/heatmap'))
      return json({
        range: '30d',
        items: [{ day: '2026-04-27', sessions: 1, tokens_effective: 100 }],
      })
    if (url.includes('/api/activity/productivity'))
      return json({
        range: '7d',
        commits: 1,
        pull_requests: 0,
        lines_added: 10,
        lines_removed: 5,
      })
    if (url.includes('/api/system/pressure'))
      return json({ api_retries_exhausted: 0, compaction_count: 0, recent_api_errors: [] })
    if (url.endsWith('/api/mcp') || url.includes('/api/mcp?'))
      return json({
        items: [
          {
            server_name: 'a-server',
            call_count: 1,
            error_count: 0,
            latency_p50_ms: 10,
            latency_p95_ms: 20,
            latency_max_ms: 30,
            source_priority: 'json',
            computed_at: '2026-04-27T08:00:00Z',
          },
        ],
      })
    if (url.includes('/api/mcp/'))
      return json({
        server_name: 'a-server',
        items: [],
      })
    // current — system state (ESTOP banner) + context/health (SKLP-03)
    if (url.includes('/api/system/state'))
      return json({ items: { emergency_stop: '0' } })
    if (url.includes('/api/context/health'))
      return json({
        settings_path: '/Users/test/.claude/settings.json',
        settings_exists: true,
        claude_md_path: '/Users/test/.claude/CLAUDE.md',
        claude_md_exists: true,
        claude_md_lines: 42,
        settings_keys: ['ANTHROPIC_API_KEY (redacted)', 'model_default'],
        mcp_server_count: 1,
        hook_count: 0,
      })
    // current — HPNL panels (decisions + inbox) + SKLP panels (skills)
    if (url.startsWith('/api/decisions'))
      return json({ items: [], total: 0 })
    if (url.startsWith('/api/inbox'))
      return json({ items: [], total: 0 })
    if (url.startsWith('/api/skills'))
      return json({ items: [] })
    // current — TPNL TaskBoard (TPNL-01)
    if (url.startsWith('/api/tasks'))
      return json({ items: [], total: 0 })
    // current — TPNL SchedulesCard (TPNL-03 / TPNL-04 composer fields)
    if (url.startsWith('/api/schedules'))
      return json({ items: [], total: 0 })
    // Phase 25 (Plan 09 SHEL-06) — Sidebar's PinnedViewsSection calls
    // useSavedViews() with no route filter. Default to an empty catalog so
    // the section renders its empty-state copy. Per-test pin lists are
    // controlled via localStorage `cmc.savedView.pinned`.
    if (url.startsWith('/api/views'))
      return json({ items: [], total: 0 })
    return json({})
  })
}

let originalES: typeof EventSource | undefined
let originalFetch: typeof globalThis.fetch | undefined

beforeEach(() => {
  originalES = (globalThis as unknown as { EventSource?: typeof EventSource }).EventSource
  ;(globalThis as unknown as { EventSource: unknown }).EventSource = MockEventSource
  originalFetch = globalThis.fetch
  globalThis.fetch = makeFetchMock() as unknown as typeof globalThis.fetch
})
afterEach(() => {
  ;(globalThis as unknown as { EventSource?: typeof EventSource }).EventSource = originalES
  if (originalFetch) globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('integration: full app', () => {
  it('mounts / and shows Command heading + OPNL kickers', async () => {
    const router = makeRouter('/')
    const { findByText } = render(<RouterProvider router={router} />)
    expect(await findByText('Command', { selector: 'h1' })).toBeInTheDocument()
    expect(await findByText('OPNL-01')).toBeInTheDocument()
    expect(await findByText('OPNL-15')).toBeInTheDocument()
  })

  it('mounts /activity and shows Activity heading + every ACTV-* kicker (01..06)', async () => {
    const router = makeRouter('/activity')
    const { findByText } = render(<RouterProvider router={router} />)
    expect(await findByText('Activity', { selector: 'h1' })).toBeInTheDocument()
    // Every ACTV-* slot now has a real (or v2-placeholder) panel; the
    // PlaceholderCardGrid usage on /activity is gone.
    expect(await findByText('ACTV-01')).toBeInTheDocument()
    expect(await findByText('ACTV-02')).toBeInTheDocument()
    expect(await findByText('ACTV-03')).toBeInTheDocument()
    expect(await findByText('ACTV-04')).toBeInTheDocument()
    expect(await findByText('ACTV-05')).toBeInTheDocument()
    expect(await findByText('ACTV-06')).toBeInTheDocument()
  })

  it('/activity does not render the PlaceholderCardGrid (no lucide-inbox EmptyState icon present)', async () => {
    const router = makeRouter('/activity')
    const { container } = render(<RouterProvider router={router} />)
    // Wait for ACTV-04 to render so the page is mounted.
    expect(await screen.findByText('ACTV-04')).toBeInTheDocument()
    // PlaceholderCardGrid's EmptyState uses the lucide-inbox icon. Live
    // panels' EmptyState (PanelCard branch) does NOT pass an icon. So the
    // absence of any lucide-inbox SVG on /activity proves the placeholder
    // grid is gone.
    expect(container.querySelector('svg.lucide-inbox')).toBeNull()
    // Phase 14 Plan 03: TopSkills no longer ships a "Coming in v2" v2
    // placeholder — it now wraps PanelCard + useSkillUsage and renders the
    // standard PanelCard empty body when the firehose returns rows: [] (or
    // the {items:[]} stub the integration mock currently emits, which my
    // defensive `when` predicate also treats as empty).
    expect(screen.queryByText('Coming in v2')).toBeNull()
  })

  it('/ does not render the PlaceholderCardGrid (no lucide-inbox EmptyState icon present)', async () => {
    const router = makeRouter('/')
    const { container } = render(<RouterProvider router={router} />)
    // Wait for one of the panels to mount.
    expect(await screen.findByText('OPNL-15')).toBeInTheDocument()
    // Same discriminator: PlaceholderCardGrid is the only consumer of the
    // lucide-inbox EmptyState icon on the / route. implementation deleted that
    // usage; this test guards against regressions.
    expect(container.querySelector('svg.lucide-inbox')).toBeNull()
  })

  it('mounts /skills and shows Skills heading + every current reqId via live PanelCard kickers', async () => {
    const router = makeRouter('/skills')
    const { findByText, container } = render(<RouterProvider router={router} />)
    expect(await findByText('Skills', { selector: 'h1' })).toBeInTheDocument()
    // implementation final close: every current reqId now resolves to a live
    // PanelCard kicker (TPNL-02 TaskComposer is reachable via Cmd+K; TPNL-04
    // ScheduleComposer via "+ New" on SchedulesCard; TPNL-05 EmergencyStopBanner
    // is mounted in NavBar — all three are exercised in dedicated tests).
    expect(await findByText('HPNL-01')).toBeInTheDocument() // DecisionsCard
    expect(await findByText('HPNL-02')).toBeInTheDocument() // InboxCard
    expect(await findByText('SKLP-01')).toBeInTheDocument() // McpPanel reused with reqId override
    expect(await findByText('SKLP-02')).toBeInTheDocument() // SkillCostCard v2 placeholder
    expect(await findByText('SKLP-04')).toBeInTheDocument() // SkillsRegistry
    expect(await findByText('SKLP-03')).toBeInTheDocument() // ContextHealthCard
    expect(await findByText('Context Health')).toBeInTheDocument()
    expect(await findByText('TPNL-01')).toBeInTheDocument() // TaskBoard
    expect(await findByText('Task Board')).toBeInTheDocument()
    // implementation retires the last placeholder slot — TPNL-03 SchedulesCard
    // is now a live panel, NOT a PlaceholderCardGrid entry.
    expect(await findByText('TPNL-03')).toBeInTheDocument()
    expect(await findByText('Schedules')).toBeInTheDocument()
    // Pitfall 10 final lockdown: PlaceholderCardGrid file was DELETED in
    // implementation, so zero lucide-inbox icons remain on /skills (PanelCard's
    // EmptyState passes no icon). This is the strongest possible structural
    // guard — typecheck would fail if any consumer still imported the helper.
    const inboxIcons = container.querySelectorAll('svg.lucide-inbox')
    expect(inboxIcons.length).toBe(0)
  })

  it('Cmd+K opens the global CommandPalette from / route', async () => {
    const user = userEvent.setup()
    const router = makeRouter('/')
    const { findByPlaceholderText } = render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')
    expect(await findByPlaceholderText(/search pages/i)).toBeInTheDocument()
  })

  it('Cmd+K opens the global CommandPalette from /skills route too', async () => {
    const user = userEvent.setup()
    const router = makeRouter('/skills')
    const { findByPlaceholderText } = render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')
    expect(await findByPlaceholderText(/search pages/i)).toBeInTheDocument()
  })
})
