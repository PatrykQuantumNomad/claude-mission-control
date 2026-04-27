// DecisionsCard — HPNL-01 (Phase 7 Plan 02 / Wave 1).
//
// Strategy: setQueryData seeds qk.decisions('pending') with a fixture so
// PanelCard resolves synchronously to its data branch. Mutation tests use
// a URL-aware fetch mock so we can assert URL + method + body shape and
// drive 200 / 409 outcomes without a real backend.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, userEvent, waitFor } from '../../../test/utils'
import { DecisionsCard } from '../DecisionsCard'
import { qk } from '../../../lib/queries'
import type { DecisionListItem, DecisionListResponse } from '../../../lib/api'

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
}

function Wrap({ client, children }: { client: QueryClient; children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function makeDecision(overrides: Partial<DecisionListItem> = {}): DecisionListItem {
  return {
    id: 1,
    session_id: 'sess-1',
    task_id: null,
    dedup_key: 'dedup-1',
    prompt: 'Should we proceed with the deletion?',
    options: [],
    status: 'pending',
    answer: null,
    answered_at: null,
    answered_by: null,
    created_at: new Date(Date.now() - 60_000).toISOString(),
    ...overrides,
  }
}

const populated: DecisionListResponse = {
  items: [
    makeDecision({ id: 1, prompt: 'Should we proceed with the deletion?' }),
    makeDecision({ id: 2, prompt: 'Approve config rollback?' }),
  ],
  total: 2,
}

const emptyPayload: DecisionListResponse = { items: [], total: 0 }

describe('DecisionsCard', () => {
  beforeEach(() => {
    // Default fetch mock — overridden in mutation tests.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(populated), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders 2 rows when seeded with 2 pending decisions', async () => {
    const client = makeClient()
    client.setQueryData(qk.decisions('pending'), populated)
    const { container } = render(
      <Wrap client={client}>
        <DecisionsCard />
      </Wrap>,
    )
    expect(screen.getByText('HPNL-01')).toBeInTheDocument()
    expect(screen.getByText('Decisions')).toBeInTheDocument()
    await waitFor(() => {
      expect(container.querySelectorAll('.cmc-decisions-row').length).toBe(2)
    })
    expect(screen.getByText('Should we proceed with the deletion?')).toBeInTheDocument()
    expect(screen.getByText('Approve config rollback?')).toBeInTheDocument()
  })

  it('renders the empty state when items=[]', async () => {
    const client = makeClient()
    client.setQueryData(qk.decisions('pending'), emptyPayload)
    render(
      <Wrap client={client}>
        <DecisionsCard />
      </Wrap>,
    )
    expect(screen.getByText('HPNL-01')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText(/Nothing to show yet/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/pending decisions/i)).toBeInTheDocument()
  })

  it('clicking Answer expands the inline form (textarea + Submit + Cancel)', async () => {
    const client = makeClient()
    client.setQueryData(qk.decisions('pending'), populated)
    const { container } = render(
      <Wrap client={client}>
        <DecisionsCard />
      </Wrap>,
    )
    const user = userEvent.setup()
    await waitFor(() => {
      expect(container.querySelectorAll('.cmc-decisions-row').length).toBe(2)
    })
    // Initially no textarea visible.
    expect(screen.queryByPlaceholderText(/Type your answer/i)).toBeNull()
    const answerBtns = screen.getAllByRole('button', { name: /^Answer$/i })
    expect(answerBtns.length).toBe(2)
    await user.click(answerBtns[0])
    expect(screen.getByPlaceholderText(/Type your answer/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Submit/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument()
  })

  it('Submit fires useAnswerDecision.mutate with typed body shape', async () => {
    const client = makeClient()
    client.setQueryData(qk.decisions('pending'), populated)
    // URL-aware fetch mock: POST /answer returns 200 with the success body.
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (method === 'POST' && /\/api\/decisions\/\d+\/answer$/.test(url)) {
          return new Response(
            JSON.stringify({ answered: true, decision_id: 1, queue_path: '/tmp/q.jsonl' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify(populated), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )
    const { container } = render(
      <Wrap client={client}>
        <DecisionsCard />
      </Wrap>,
    )
    const user = userEvent.setup()
    await waitFor(() => {
      expect(container.querySelectorAll('.cmc-decisions-row').length).toBe(2)
    })
    await user.click(screen.getAllByRole('button', { name: /^Answer$/i })[0])
    await user.type(screen.getByPlaceholderText(/Type your answer/i), 'yes proceed')
    await user.click(screen.getByRole('button', { name: /Submit/i }))
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/decisions/1/answer',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ answer: 'yes proceed', answered_by: 'dashboard' }),
        }),
      ),
    )
  })

  it('on 409 the error body literal appears inline AND the answer text is preserved (Pitfall 2)', async () => {
    const client = makeClient()
    client.setQueryData(qk.decisions('pending'), populated)
    // POST /answer returns 409 with the documented error body.
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (method === 'POST' && /\/api\/decisions\/\d+\/answer$/.test(url)) {
          return new Response(
            JSON.stringify({ error: 'decision already answered' }),
            { status: 409, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify(populated), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )
    const { container } = render(
      <Wrap client={client}>
        <DecisionsCard />
      </Wrap>,
    )
    const user = userEvent.setup()
    await waitFor(() => {
      expect(container.querySelectorAll('.cmc-decisions-row').length).toBe(2)
    })
    await user.click(screen.getAllByRole('button', { name: /^Answer$/i })[0])
    const ta = screen.getByPlaceholderText(/Type your answer/i) as HTMLTextAreaElement
    await user.type(ta, 'late answer')
    await user.click(screen.getByRole('button', { name: /Submit/i }))
    // Error body literal surfaces inline (within ApiError.message text).
    await waitFor(() => {
      expect(screen.getByText(/decision already answered/i)).toBeInTheDocument()
    })
    // Answer text is preserved (Pitfall 2 — user can re-read and retry).
    expect(ta.value).toBe('late answer')
  })
})
