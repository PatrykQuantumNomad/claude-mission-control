import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, userEvent } from '../../../test/utils'
import { SessionsTable } from '../SessionsTable'
import { qk } from '../../../lib/queries'
import type { SessionListItemFull, SessionListResponse } from '../../../lib/api'

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

function makeRow(i: number, overrides: Partial<SessionListItemFull> = {}): SessionListItemFull {
  return {
    session_id: `sid${String(i).padStart(8, '0')}`,
    started_at: '2026-04-27T08:00:00Z',
    ended_at: null,
    cwd: `/work/proj-${i}`,
    model: 'sonnet',
    source: 'claude_code',
    outcome: null,
    tokens_input: 100 * i,
    tokens_output: 200 * i,
    tokens_cache_read: 0,
    tokens_cache_create: 0,
    tool_call_count: i,
    message_count: i,
    ...overrides,
  }
}

const FIRST_PAGE: SessionListResponse = {
  items: Array.from({ length: 50 }, (_, i) => makeRow(i + 1)),
  total: 120,
  offset: 0,
  limit: 50,
}

describe('SessionsTable', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(FIRST_PAGE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders reqId/title and 50 paginated rows + pagination strip', () => {
    const client = makeClient()
    client.setQueryData(
      qk.sessionsList({ range: '7d', limit: 50, offset: 0 }),
      FIRST_PAGE,
    )
    const { container } = render(
      <Wrap client={client}>
        <SessionsTable />
      </Wrap>,
    )
    expect(screen.getByText('ACTV-06')).toBeInTheDocument()
    expect(screen.getByText('Sessions')).toBeInTheDocument()
    // 50 data rows in tbody
    const dataRows = container.querySelectorAll('table.cmc-table tbody tr')
    expect(dataRows).toHaveLength(50)
    // Pagination strip shows total + page indicator
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument()
    expect(screen.getByText(/120 total/)).toBeInTheDocument()
  })

  it('renders EmptyState when items is empty on page 0', () => {
    const client = makeClient()
    const empty: SessionListResponse = { items: [], total: 0, offset: 0, limit: 50 }
    client.setQueryData(
      qk.sessionsList({ range: '7d', limit: 50, offset: 0 }),
      empty,
    )
    render(
      <Wrap client={client}>
        <SessionsTable />
      </Wrap>,
    )
    expect(screen.getByText('Nothing to show yet')).toBeInTheDocument()
  })

  it('client-side search filters rows by session_id substring', async () => {
    const client = makeClient()
    // Two rows, distinguishable session_ids
    const items = [
      makeRow(1, { session_id: 'abc12345xxxxxxxx' }),
      makeRow(2, { session_id: 'zzzz67890yyyyyy' }),
    ]
    client.setQueryData(
      qk.sessionsList({ range: '7d', limit: 50, offset: 0 }),
      { items, total: 2, offset: 0, limit: 50 } satisfies SessionListResponse,
    )
    const { container } = render(
      <Wrap client={client}>
        <SessionsTable />
      </Wrap>,
    )

    function visibleSidPrefixes(): string[] {
      // Truncated session_id renders inside <span class="cmc-mono"> with a
      // trailing horizontal-ellipsis text node; collect the leading 8 chars
      // of each cell's normalized textContent. Filter to rows whose first
      // text starts with a session_id slug (skip cwd / model spans which
      // also use cmc-mono).
      const spans = Array.from(container.querySelectorAll('table.cmc-table tbody tr td:first-child .cmc-mono'))
      return spans.map((s) => (s.textContent ?? '').slice(0, 8))
    }
    expect(visibleSidPrefixes()).toEqual(['abc12345', 'zzzz6789'])

    const search = screen.getByLabelText('Search session id or cwd') as HTMLInputElement
    await userEvent.type(search, 'abc')
    expect(visibleSidPrefixes()).toEqual(['abc12345'])
  })

  it('Prev disabled on first page; Next disabled on last page', () => {
    const client = makeClient()
    // total=10 fits in one page (pageSize=50): Next must be disabled
    client.setQueryData(
      qk.sessionsList({ range: '7d', limit: 50, offset: 0 }),
      {
        items: Array.from({ length: 10 }, (_, i) => makeRow(i + 1)),
        total: 10,
        offset: 0,
        limit: 50,
      } satisfies SessionListResponse,
    )
    render(
      <Wrap client={client}>
        <SessionsTable />
      </Wrap>,
    )
    const prev = screen.getByRole('button', { name: 'Previous page' }) as HTMLButtonElement
    const next = screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement
    expect(prev.disabled).toBe(true)
    expect(next.disabled).toBe(true)
  })

  it('changing source filter resets page to 0 and triggers a refetch', async () => {
    const client = makeClient()
    client.setQueryData(
      qk.sessionsList({ range: '7d', limit: 50, offset: 0 }),
      FIRST_PAGE,
    )
    render(
      <Wrap client={client}>
        <SessionsTable />
      </Wrap>,
    )
    const sourceInput = screen.getByLabelText('Source filter') as HTMLInputElement
    await userEvent.type(sourceInput, 'cli')
    // The query key changed because `source` is part of the params object, so
    // fetch should have been called for the new key with `source=cli`.
    const fetchCalls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock
      .calls
    const urls = fetchCalls.map((args) => String(args[0]))
    expect(urls.some((u) => u.includes('source=cli'))).toBe(true)
  })

  it('Next button advances page when more rows exist', async () => {
    const client = makeClient()
    client.setQueryData(
      qk.sessionsList({ range: '7d', limit: 50, offset: 0 }),
      FIRST_PAGE,
    )
    // Pre-seed the page-1 cache so the Next click renders without awaiting
    // a network roundtrip.
    client.setQueryData(
      qk.sessionsList({ range: '7d', limit: 50, offset: 50 }),
      {
        items: Array.from({ length: 50 }, (_, i) => makeRow(i + 51)),
        total: 120,
        offset: 50,
        limit: 50,
      } satisfies SessionListResponse,
    )
    render(
      <Wrap client={client}>
        <SessionsTable />
      </Wrap>,
    )
    const next = screen.getByRole('button', { name: 'Next page' })
    await userEvent.click(next)
    expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument()
  })
})
