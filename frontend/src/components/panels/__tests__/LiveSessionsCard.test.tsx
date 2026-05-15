import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, userEvent, waitFor } from '../../../test/utils'
import { LiveSessionsCard } from '../LiveSessionsCard'
import { qk } from '../../../lib/queries'
import type {
  LiveSessionItem,
  SessionDetailsResponse,
  SessionListItemFull,
} from '../../../lib/api'

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, refetchOnWindowFocus: false },
    },
  })
}

function Wrap({ client, children }: { client: QueryClient; children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const liveItems: LiveSessionItem[] = [
  {
    session_id: 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb',
    started_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    last_activity_at: new Date(Date.now() - 30_000).toISOString(),
    state: 'running',
    current_tool: 'Bash',
    model: 'claude-3-5-sonnet',
  },
  {
    session_id: 'cccccccc-1111-2222-3333-dddddddddddd',
    started_at: new Date(Date.now() - 60_000).toISOString(),
    last_activity_at: new Date(Date.now() - 5_000).toISOString(),
    state: 'idle',
    current_tool: null,
    model: 'claude-3-haiku',
  },
]

function makeFullSession(overrides: Partial<SessionListItemFull> = {}): SessionListItemFull {
  return {
    session_id: liveItems[0].session_id,
    started_at: liveItems[0].started_at,
    ended_at: null,
    cwd: '/tmp/proj',
    // Phase 27 TDBT-01 — 12-char hex sentinel mirroring backend
    // SessionListItem.project_key. Required field.
    project_key: '0123456789ab',
    model: 'claude-3-5-sonnet',
    source: 'claude_code',
    outcome: null,
    tokens_input: 100,
    tokens_output: 200,
    tokens_cache_read: 50,
    tokens_cache_create: 25,
    tool_call_count: 4,
    message_count: 12,
    ...overrides,
  }
}

const detailsLive: SessionDetailsResponse = {
  session: makeFullSession(),
  tools: [
    {
      tool_use_id: 't1',
      tool_name: 'Bash',
      started_at: new Date(Date.now() - 90_000).toISOString(),
      ended_at: new Date(Date.now() - 80_000).toISOString(),
      duration_ms: 1234,
      status: 'ok',
      input_summary: 'ls -la',
      mcp_server_name: null,
      mcp_tool_name: null,
      decision: null,
    },
    {
      tool_use_id: 't2',
      tool_name: 'Read',
      started_at: new Date(Date.now() - 60_000).toISOString(),
      ended_at: null,
      duration_ms: null,
      status: 'pending',
      input_summary: '/tmp/proj/foo.py',
      mcp_server_name: null,
      mcp_tool_name: null,
      decision: null,
    },
  ],
}

// URL-aware fetch mock: hooks may background-refetch cached queries (staleTime: 0
// for live + sessionDetails); answer each URL with a shape-matching payload so
// TanStack Query's auto-refetch doesn't smash our cache with a queued-message
// envelope. POST /api/sessions/live/.../message returns the queued envelope.
function makeFetchMock() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'
    if (method === 'POST' && /\/api\/sessions\/live\/[^/]+\/message$/.test(url)) {
      return new Response(
        JSON.stringify({
          queued: true,
          session_id: liveItems[0].session_id,
          queue_path: '/.tmp/mission-control-queue/messages/abc.jsonl',
        }),
        { status: 202, headers: { 'Content-Type': 'application/json' } },
      )
    }
    if (url === '/api/sessions/live') {
      return new Response(JSON.stringify(liveItems), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (/\/api\/sessions\/[^/]+\/details$/.test(url)) {
      const sid = decodeURIComponent(url.split('/')[3])
      const isEnded = sid === liveItems[1].session_id
      const payload: SessionDetailsResponse = isEnded
        ? {
            session: makeFullSession({
              session_id: sid,
              ended_at: new Date(Date.now() - 1000).toISOString(),
            }),
            tools: [],
          }
        : detailsLive
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
}

describe('LiveSessionsCard', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(makeFetchMock())
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders 2 session rows from cached live-sessions array (bare list)', async () => {
    const client = makeClient()
    client.setQueryData(qk.liveSessions(), liveItems)
    const { container } = render(
      <Wrap client={client}>
        <LiveSessionsCard />
      </Wrap>,
    )
    await waitFor(() =>
      expect(container.querySelectorAll('.cmc-live-sessions-list__row').length).toBe(2),
    )
    expect(screen.getByText('claude-3-5-sonnet')).toBeInTheDocument()
    expect(screen.getByText('claude-3-haiku')).toBeInTheDocument()
    expect(screen.getByText('Bash')).toBeInTheDocument()
  })

  it('clicking a row opens the Sheet drawer with timeline rows', async () => {
    const client = makeClient()
    client.setQueryData(qk.liveSessions(), liveItems)
    client.setQueryData(qk.sessionDetails(liveItems[0].session_id), detailsLive)
    const { container } = render(
      <Wrap client={client}>
        <LiveSessionsCard />
      </Wrap>,
    )
    const user = userEvent.setup()
    const firstRow = container.querySelector(
      '.cmc-live-sessions-list__row',
    ) as HTMLButtonElement
    await user.click(firstRow)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Session details')).toBeInTheDocument()
    expect(screen.getByText('Tool timeline')).toBeInTheDocument()
    // Sheet renders via Radix Portal → mounted to document.body, NOT inside `container`.
    await waitFor(() =>
      expect(document.body.querySelectorAll('.cmc-tool-timeline__row').length).toBe(2),
    )
    // Latency cell rendered for the first tool (1234ms)
    expect(screen.getByText('1234ms')).toBeInTheDocument()
  })

  it('typing into follow-up textarea then clicking Send invokes the mutation', async () => {
    const client = makeClient()
    client.setQueryData(qk.liveSessions(), liveItems)
    client.setQueryData(qk.sessionDetails(liveItems[0].session_id), detailsLive)
    const { container } = render(
      <Wrap client={client}>
        <LiveSessionsCard />
      </Wrap>,
    )
    const user = userEvent.setup()
    await user.click(
      container.querySelector('.cmc-live-sessions-list__row') as HTMLButtonElement,
    )
    await screen.findByRole('dialog')
    // Send button starts disabled (empty textarea).
    const sendBtn = screen.getByRole('button', { name: /Send/i })
    expect(sendBtn).toBeDisabled()
    const ta = screen.getByPlaceholderText(/Type a follow-up/i)
    await user.type(ta, 'please retry the failing test')
    expect(sendBtn).not.toBeDisabled()
    await user.click(sendBtn)
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `/api/sessions/live/${encodeURIComponent(liveItems[0].session_id)}/message`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ message: 'please retry the failing test' }),
        }),
      ),
    )
  })

  it('renders "session has ended" notice instead of follow-up form when ended_at != null', async () => {
    const endedSid = liveItems[1].session_id
    const client = makeClient()
    client.setQueryData(qk.liveSessions(), liveItems)
    client.setQueryData(qk.sessionDetails(endedSid), {
      session: makeFullSession({
        session_id: endedSid,
        ended_at: new Date(Date.now() - 1000).toISOString(),
      }),
      tools: [],
    } satisfies SessionDetailsResponse)
    const { container } = render(
      <Wrap client={client}>
        <LiveSessionsCard />
      </Wrap>,
    )
    const user = userEvent.setup()
    const rows = container.querySelectorAll('.cmc-live-sessions-list__row')
    await user.click(rows[1] as HTMLButtonElement)
    await screen.findByRole('dialog')
    expect(screen.getByText(/follow-ups disabled/i)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/Type a follow-up/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /Send/i })).toBeNull()
  })
})
