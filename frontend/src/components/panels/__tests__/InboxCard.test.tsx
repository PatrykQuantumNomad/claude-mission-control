// InboxCard — HPNL-02 (Phase 7 Plan 02 / Wave 1).
//
// Strategy mirrors DecisionsCard tests: setQueryData seeds qk.inbox(true)
// with a fixture; mutation tests use a URL-aware fetch mock to assert URL +
// method + body. useReadInbox is OPTIMISTIC, so the read-state UI flips
// synchronously before the fetch promise resolves.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, userEvent, waitFor } from '../../../test/utils'
import { InboxCard } from '../InboxCard'
import { qk } from '../../../lib/queries'
import type { InboxListItem, InboxListResponse } from '../../../lib/api'

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

function makeInbox(overrides: Partial<InboxListItem> = {}): InboxListItem {
  return {
    id: 1,
    session_id: 'sess-1',
    task_id: null,
    subject: 'Build status',
    body: 'Build broke on main — please check.',
    read: false,
    read_at: null,
    reply: null,
    replied_at: null,
    created_at: new Date(Date.now() - 60_000).toISOString(),
    ...overrides,
  }
}

const populated: InboxListResponse = {
  items: [
    makeInbox({ id: 10, subject: 'Build status', body: 'Build broke on main' }),
    makeInbox({ id: 11, subject: 'Deploy ready', body: 'Awaiting your nod' }),
  ],
  total: 2,
}

const emptyPayload: InboxListResponse = { items: [], total: 0 }

describe('InboxCard', () => {
  beforeEach(() => {
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

  it('renders N unread message rows', async () => {
    const client = makeClient()
    client.setQueryData(qk.inbox(true), populated)
    const { container } = render(
      <Wrap client={client}>
        <InboxCard />
      </Wrap>,
    )
    expect(screen.getByText('HPNL-02')).toBeInTheDocument()
    expect(screen.getByText('Inbox')).toBeInTheDocument()
    await waitFor(() => {
      expect(container.querySelectorAll('.cmc-inbox-row').length).toBe(2)
    })
    expect(screen.getByText(/Build broke on main/i)).toBeInTheDocument()
    expect(screen.getByText(/Awaiting your nod/i)).toBeInTheDocument()
  })

  it('renders the empty state when items=[]', async () => {
    const client = makeClient()
    client.setQueryData(qk.inbox(true), emptyPayload)
    render(
      <Wrap client={client}>
        <InboxCard />
      </Wrap>,
    )
    expect(screen.getByText('HPNL-02')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText(/Nothing to show yet/i)).toBeInTheDocument()
    })
  })

  it('Mark read button optimistically updates UI before fetch resolves', async () => {
    const client = makeClient()
    client.setQueryData(qk.inbox(true), populated)
    // Use a manually-resolved fetch so we can assert UI flipped synchronously.
    let resolveFetch!: (r: Response) => void
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (method === 'POST' && /\/api\/inbox\/\d+\/read$/.test(url)) {
          return pending
        }
        return new Response(JSON.stringify(populated), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )
    const { container } = render(
      <Wrap client={client}>
        <InboxCard />
      </Wrap>,
    )
    const user = userEvent.setup()
    await waitFor(() => {
      expect(container.querySelectorAll('.cmc-inbox-row').length).toBe(2)
    })
    const markBtn = screen.getAllByRole('button', { name: /Mark read/i })[0]
    await user.click(markBtn)
    // Optimistic: row 10 flips to read state immediately, before pending resolves.
    await waitFor(() => {
      const rowEl = container.querySelector('.cmc-inbox-row[data-read="true"]')
      expect(rowEl).not.toBeNull()
    })
    // Resolve the pending fetch so React Query settles cleanly.
    resolveFetch(
      new Response(JSON.stringify({ id: 10, read: true, read_at: new Date().toISOString() }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })

  it('Reply submit calls useReplyInbox with typed body and row clears from list on success', async () => {
    const client = makeClient()
    client.setQueryData(qk.inbox(true), populated)
    // URL-aware mock: POST /reply succeeds; subsequent /api/inbox refetch returns the smaller list.
    let replied = false
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (method === 'POST' && /\/api\/inbox\/\d+\/reply$/.test(url)) {
          replied = true
          return new Response(
            JSON.stringify({ replied: true, inbox_id: 10, queue_path: '/tmp/q.jsonl' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.startsWith('/api/inbox') && method === 'GET') {
          return new Response(
            JSON.stringify(
              replied
                ? {
                    items: populated.items.filter((m) => m.id !== 10),
                    total: 1,
                  }
                : populated,
            ),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )
    const { container } = render(
      <Wrap client={client}>
        <InboxCard />
      </Wrap>,
    )
    const user = userEvent.setup()
    await waitFor(() => {
      expect(container.querySelectorAll('.cmc-inbox-row').length).toBe(2)
    })
    await user.click(screen.getAllByRole('button', { name: /^Reply$/i })[0])
    await user.type(
      screen.getByPlaceholderText(/Type your reply/i),
      'thanks, looking now',
    )
    await user.click(screen.getByRole('button', { name: /Send reply/i }))
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/inbox/10/reply',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ reply: 'thanks, looking now' }),
        }),
      ),
    )
    // After invalidation refetches, only one unread row remains.
    await waitFor(() => {
      expect(container.querySelectorAll('.cmc-inbox-row').length).toBe(1)
    })
  })
})
