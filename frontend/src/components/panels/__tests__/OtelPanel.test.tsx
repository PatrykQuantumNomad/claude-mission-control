import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, userEvent, waitFor } from '../../../test/utils'
import { OtelPanel } from '../OtelPanel'
import type { OtelEvent } from '../../../lib/useFirehose'

// MockEventSource mirrors the pattern locked in src/lib/__tests__/useFirehose.test.ts.
// Constructor pushes the instance onto a static list so tests can grab the latest
// instance and dispatch open/error/otel events deterministically.
class MockEventSource extends EventTarget {
  static instances: MockEventSource[] = []
  url: string
  closed = false
  constructor(url: string) {
    super()
    this.url = url
    MockEventSource.instances.push(this)
  }
  close() {
    this.closed = true
  }
}

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

function dispatchOtel(es: MockEventSource, ev: OtelEvent, lastEventId: string) {
  act(() => {
    es.dispatchEvent(
      new MessageEvent('otel', {
        data: JSON.stringify(ev),
        lastEventId,
      }),
    )
  })
}

describe('OtelPanel', () => {
  let originalES: typeof EventSource | undefined
  beforeEach(() => {
    originalES = (globalThis as unknown as { EventSource?: typeof EventSource }).EventSource
    ;(globalThis as unknown as { EventSource: unknown }).EventSource = MockEventSource
    MockEventSource.instances = []
  })
  afterEach(() => {
    ;(globalThis as unknown as { EventSource?: typeof EventSource }).EventSource = originalES
    vi.restoreAllMocks()
  })

  it('mounts the SSE stream, shows reqId/title and a connecting StatePill', () => {
    render(
      <Wrap client={makeClient()}>
        <OtelPanel />
      </Wrap>,
    )
    expect(screen.getByText('ACTV-03')).toBeInTheDocument()
    expect(screen.getByText('OTEL Firehose')).toBeInTheDocument()
    expect(MockEventSource.instances).toHaveLength(1)
    // Initial status from useFirehose is 'connecting'
    expect(screen.getByLabelText(/connecting/i)).toBeInTheDocument()
    // Empty feed → "Waiting for events…"
    expect(screen.getByText(/Waiting for events/)).toBeInTheDocument()
  })

  it('appends event rows when otel MessageEvents arrive (newest at top)', async () => {
    const { container } = render(
      <Wrap client={makeClient()}>
        <OtelPanel />
      </Wrap>,
    )
    const es = MockEventSource.instances.at(-1)!
    dispatchOtel(
      es,
      {
        id: 1,
        ts: '2026-04-27T08:00:00Z',
        event_name: 'claude_code.tool_decision',
        session_id: 'sid-aaaa-1111',
        attrs_mcp_server: null,
        attrs_mcp_tool: null,
      },
      '1',
    )
    dispatchOtel(
      es,
      {
        id: 2,
        ts: '2026-04-27T08:00:05Z',
        event_name: 'claude_code.api_error',
        session_id: 'sid-bbbb-2222',
        attrs_mcp_server: null,
        attrs_mcp_tool: null,
      },
      '2',
    )
    await waitFor(() => {
      const rows = container.querySelectorAll('.cmc-otel-row')
      expect(rows).toHaveLength(2)
    })
    // Newest at top → first row's event_name span = the most-recently dispatched event
    const rows = container.querySelectorAll('.cmc-otel-row')
    expect(rows[0].querySelector('.cmc-otel-row__name')?.textContent).toBe(
      'claude_code.api_error',
    )
    expect(rows[1].querySelector('.cmc-otel-row__name')?.textContent).toBe(
      'claude_code.tool_decision',
    )
    // counter description shows N/N events shown
    expect(screen.getByText(/2\/2 events shown/)).toBeInTheDocument()
  })

  it('client-side filter narrows the feed without dropping the buffer', async () => {
    const { container } = render(
      <Wrap client={makeClient()}>
        <OtelPanel />
      </Wrap>,
    )
    const es = MockEventSource.instances.at(-1)!
    dispatchOtel(
      es,
      {
        id: 1,
        ts: '2026-04-27T08:00:00Z',
        event_name: 'claude_code.tool_decision',
        session_id: null,
        attrs_mcp_server: null,
        attrs_mcp_tool: null,
      },
      '1',
    )
    dispatchOtel(
      es,
      {
        id: 2,
        ts: '2026-04-27T08:00:05Z',
        event_name: 'claude_code.api_error',
        session_id: null,
        attrs_mcp_server: null,
        attrs_mcp_tool: null,
      },
      '2',
    )
    const filterInput = screen.getByLabelText('Filter event name') as HTMLInputElement
    await userEvent.type(filterInput, 'api_error')
    await waitFor(() => {
      const rows = container.querySelectorAll('.cmc-otel-row')
      expect(rows).toHaveLength(1)
    })
    expect(
      container.querySelector('.cmc-otel-row .cmc-otel-row__name')?.textContent,
    ).toBe('claude_code.api_error')
    // Filtered/total counter reflects the filter
    expect(screen.getByText(/1\/2 events shown/)).toBeInTheDocument()
  })

  it('connection status pill flips to open on EventSource open event', async () => {
    render(
      <Wrap client={makeClient()}>
        <OtelPanel />
      </Wrap>,
    )
    const es = MockEventSource.instances.at(-1)!
    act(() => {
      es.dispatchEvent(new Event('open'))
    })
    await waitFor(() =>
      expect(screen.getByLabelText(/^open \(ok\)/i)).toBeInTheDocument(),
    )
  })

  it('connection status pill shows closed + Reconnecting copy on error', async () => {
    render(
      <Wrap client={makeClient()}>
        <OtelPanel />
      </Wrap>,
    )
    const es = MockEventSource.instances.at(-1)!
    act(() => {
      es.dispatchEvent(new Event('error'))
    })
    await waitFor(() =>
      expect(screen.getByLabelText(/^closed \(stale\)/i)).toBeInTheDocument(),
    )
    expect(screen.getByText(/Reconnecting/)).toBeInTheDocument()
  })
})
