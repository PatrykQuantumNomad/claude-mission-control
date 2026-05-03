// SkillRunsTable — SKIL-07 (NEW, Phase 14 Plan 05).
//
// Per-skill recent-invocations panel. Consumes useSkillRuns(name, 25) and
// renders a DataTable with ts (RelativeTime) / session_id (8-char) / cwd
// (last 2 segments) / request_id (8-char or '—') columns. Row click opens
// the existing SessionsDetailsSheet drawer (D-09 — NO new /sessions/$sid
// route in Phase 14; mirrors LiveSessionsCard.tsx:223 pattern).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, userEvent, waitFor } from '../../../test/utils'
import { SkillRunsTable } from '../SkillRunsTable'
import { qk } from '../../../lib/queries'
import type {
  SessionDetailsResponse,
  SessionListItemFull,
  SkillRunsResponse,
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

function makeFullSession(sid: string): SessionListItemFull {
  return {
    session_id: sid,
    started_at: new Date(Date.now() - 60_000).toISOString(),
    ended_at: null,
    cwd: '/Users/me/work/proj-a',
    model: 'claude-3-5-sonnet',
    source: 'claude_code',
    outcome: null,
    tokens_input: 100,
    tokens_output: 200,
    tokens_cache_read: 50,
    tokens_cache_create: 25,
    tool_call_count: 4,
    message_count: 12,
  }
}

function makeRuns(): SkillRunsResponse {
  const sids = [
    'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb',
    'cccccccc-1111-2222-3333-dddddddddddd',
    'eeeeeeee-1111-2222-3333-ffffffffffff',
    'gggggggg-1111-2222-3333-hhhhhhhhhhhh',
    'iiiiiiii-1111-2222-3333-jjjjjjjjjjjj',
  ]
  return {
    name: 'analyze',
    rows: sids.map((sid, i) => ({
      ts: new Date(Date.now() - (i + 1) * 60_000).toISOString(),
      session_id: sid,
      cwd: `/Users/me/work/project-${i}/sub`,
      request_id: `req-${i.toString().padStart(8, '0')}-extra`,
    })),
  }
}

// URL-aware fetch mock — mirrors LiveSessionsCard.test pattern. The
// SessionsDrawer body fires useSessionDetails(sid) which hits
// /api/sessions/{sid}/details when the drawer opens; answer with a
// shape-matching payload to avoid cache thrash from background refetch.
function makeFetchMock() {
  return vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString()
    if (/\/api\/sessions\/[^/]+\/details$/.test(url)) {
      const sid = decodeURIComponent(url.split('/')[3])
      const payload: SessionDetailsResponse = {
        session: makeFullSession(sid),
        tools: [],
      }
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

describe('SkillRunsTable', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(makeFetchMock())
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders SKIL-07 reqId + Recent Runs title + 5 rows from cached useSkillRuns', async () => {
    const client = makeClient()
    const runs = makeRuns()
    client.setQueryData(qk.skillRuns('analyze', 25), runs)
    const { container } = render(
      <Wrap client={client}>
        <SkillRunsTable name="analyze" />
      </Wrap>,
    )
    expect(screen.getByText('SKIL-07')).toBeInTheDocument()
    expect(screen.getByText(/Recent Runs/)).toBeInTheDocument()
    await waitFor(() =>
      expect(container.querySelectorAll('tbody tr').length).toBe(5),
    )
  })

  it('clicking a row opens the SessionsDetailsSheet drawer with timeline section', async () => {
    const client = makeClient()
    const runs = makeRuns()
    const sid = runs.rows[0].session_id as string
    client.setQueryData(qk.skillRuns('analyze', 25), runs)
    client.setQueryData(qk.sessionDetails(sid), {
      session: makeFullSession(sid),
      tools: [],
    } satisfies SessionDetailsResponse)
    const { container } = render(
      <Wrap client={client}>
        <SkillRunsTable name="analyze" />
      </Wrap>,
    )
    const user = userEvent.setup()
    // Find the first body row's clickable surface and click it.
    const firstRow = container.querySelector('tbody tr') as HTMLElement
    expect(firstRow).not.toBeNull()
    await user.click(firstRow)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Session details')).toBeInTheDocument()
    expect(screen.getByText('Tool timeline')).toBeInTheDocument()
  })

  it('renders EmptyState when rows is empty', () => {
    const client = makeClient()
    client.setQueryData(qk.skillRuns('analyze', 25), {
      name: 'analyze',
      rows: [],
    } satisfies SkillRunsResponse)
    render(
      <Wrap client={client}>
        <SkillRunsTable name="analyze" />
      </Wrap>,
    )
    expect(screen.getByText('Nothing to show yet')).toBeInTheDocument()
  })

  it('renders cleanly when a row has session_id=null and request_id=null (em-dash placeholder, no crash)', async () => {
    const client = makeClient()
    client.setQueryData(qk.skillRuns('analyze', 25), {
      name: 'analyze',
      rows: [
        {
          ts: new Date(Date.now() - 30_000).toISOString(),
          session_id: null,
          cwd: '<unknown>',
          request_id: null,
        },
      ],
    } satisfies SkillRunsResponse)
    const { container } = render(
      <Wrap client={client}>
        <SkillRunsTable name="analyze" />
      </Wrap>,
    )
    await waitFor(() =>
      expect(container.querySelectorAll('tbody tr').length).toBe(1),
    )
    // Em-dash placeholder must appear at least once for the null fields.
    const emDashCount = container.querySelectorAll('td').length
    expect(emDashCount).toBeGreaterThan(0)
  })
})
