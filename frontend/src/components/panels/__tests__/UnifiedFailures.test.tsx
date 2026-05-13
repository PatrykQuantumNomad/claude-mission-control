import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '../../../test/utils'

// Phase 26 Plan 08 (TIME-02) — UnifiedFailures now consumes useRouteRange.
// Feed router with time tokens resolving to '30d' so existing fixture seeds
// `qk.failures('30d')` continue to match the panel's query key.
vi.mock('@tanstack/react-router', () => ({
  useRouterState: ({ select }: { select: (s: { location: { pathname: string; search: Record<string, unknown> } }) => unknown }) =>
    select({ location: { pathname: '/activity', search: { time_from: 'now-30d', time_to: 'now' } } }),
}))

import { UnifiedFailures } from '../UnifiedFailures'
import { qk } from '../../../lib/queries'
import type { FailuresResponse } from '../../../lib/api'

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

describe('UnifiedFailures', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders reqId/title and an EmptyState body when items is empty', () => {
    const client = makeClient()
    client.setQueryData(
      qk.failures('30d'),
      { items: [], range: '30d' } satisfies FailuresResponse,
    )
    render(
      <Wrap client={client}>
        <UnifiedFailures />
      </Wrap>,
    )
    expect(screen.getByText('ACTV-05')).toBeInTheDocument()
    expect(screen.getByText('Recent Failures')).toBeInTheDocument()
    expect(screen.getByText('Nothing to show yet')).toBeInTheDocument()
  })

  it('renders three failure rows with correct outcome Badge variants and message text', async () => {
    const client = makeClient()
    const data: FailuresResponse = {
      range: '30d',
      items: [
        {
          session_id: 'errSession00001',
          started_at: '2026-04-27T08:00:00Z',
          outcome: 'errored',
          last_error_message: 'Anthropic 500 Internal Server Error',
        },
        {
          session_id: 'rateLimited0002',
          started_at: '2026-04-27T07:50:00Z',
          outcome: 'rate_limited',
          last_error_message: 'Anthropic 429 rate limited',
        },
        {
          session_id: 'noMessageRow003',
          started_at: '2026-04-27T07:40:00Z',
          outcome: 'errored',
          last_error_message: null,
        },
      ],
    }
    client.setQueryData(qk.failures('30d'), data)
    const { container } = render(
      <Wrap client={client}>
        <UnifiedFailures />
      </Wrap>,
    )
    await waitFor(() => {
      expect(container.querySelectorAll('.cmc-failures-row')).toHaveLength(3)
    })
    // Outcome text rendered for each row
    expect(screen.getAllByText('errored')).toHaveLength(2)
    expect(screen.getByText('rate_limited')).toBeInTheDocument()
    // Outcome Badge variant classes — assert by querying the Badge spans.
    const badges = container.querySelectorAll('.cmc-badge')
    const variants = Array.from(badges).map((b) => b.className)
    expect(variants[0]).toContain('cmc-badge--danger') // errored
    expect(variants[1]).toContain('cmc-badge--warning') // rate_limited
    expect(variants[2]).toContain('cmc-badge--danger') // errored
    // Last error message rendered (truncation handled by CSS)
    expect(screen.getByText('Anthropic 500 Internal Server Error')).toBeInTheDocument()
    expect(screen.getByText('Anthropic 429 rate limited')).toBeInTheDocument()
    // Null last_error_message → em-dash
    const msgSpans = container.querySelectorAll('.cmc-failures-row__msg')
    expect(msgSpans[2].textContent).toBe('—')
  })

  it('renders truncated session_id with full id in the title attribute', async () => {
    const client = makeClient()
    const fullId = 'session-abcdef-1234567890-0001'
    const data: FailuresResponse = {
      range: '30d',
      items: [
        {
          session_id: fullId,
          started_at: '2026-04-27T08:00:00Z',
          outcome: 'errored',
          last_error_message: 'boom',
        },
      ],
    }
    client.setQueryData(qk.failures('30d'), data)
    const { container } = render(
      <Wrap client={client}>
        <UnifiedFailures />
      </Wrap>,
    )
    await waitFor(() => {
      const sidSpan = container.querySelector('.cmc-failures-row__sid') as HTMLElement | null
      expect(sidSpan).not.toBeNull()
      expect(sidSpan!.title).toBe(fullId)
      // Truncated visible text starts with first 8 chars
      expect((sidSpan!.textContent ?? '').slice(0, 8)).toBe(fullId.slice(0, 8))
    })
  })
})
