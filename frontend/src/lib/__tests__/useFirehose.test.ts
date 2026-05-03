import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFirehose } from '../useFirehose'

class MockEventSource extends EventTarget {
  static instances: MockEventSource[] = []
  url: string
  closed = false
  constructor(url: string) {
    super()
    this.url = url
    MockEventSource.instances.push(this)
    // dispatch open on next microtask so the hook sees it after subscribe
    queueMicrotask(() => {
      this.dispatchEvent(new Event('open'))
    })
  }
  close() {
    this.closed = true
  }
}

describe('useFirehose', () => {
  let originalES: typeof EventSource | undefined
  beforeEach(() => {
    originalES = (globalThis as unknown as { EventSource?: typeof EventSource }).EventSource
    ;(globalThis as unknown as { EventSource: unknown }).EventSource = MockEventSource
    MockEventSource.instances = []
  })
  afterEach(() => {
    ;(globalThis as unknown as { EventSource?: typeof EventSource }).EventSource = originalES
  })

  it('connects to /api/firehose with eventName param when provided', () => {
    renderHook(() => useFirehose({ eventName: 'claude_code.tool_decision' }))
    const last = MockEventSource.instances.at(-1)!
    expect(last.url).toContain('/api/firehose')
    expect(last.url).toContain('event_name=claude_code.tool_decision')
  })

  it('appends events on otel MessageEvent and caps at bufferSize', () => {
    const { result } = renderHook(() => useFirehose({ bufferSize: 2 }))
    const es = MockEventSource.instances.at(-1)!
    const dispatchOtel = (data: object, id: string) => {
      const ev = new MessageEvent('otel', {
        data: JSON.stringify(data),
        lastEventId: id,
      })
      act(() => {
        es.dispatchEvent(ev)
      })
    }
    dispatchOtel(
      {
        id: 1,
        ts: 't',
        event_name: 'a',
        session_id: null,
        attrs_mcp_server: null,
        attrs_mcp_tool: null,
        attrs_skill_name: null,
      },
      '1',
    )
    dispatchOtel(
      {
        id: 2,
        ts: 't',
        event_name: 'b',
        session_id: null,
        attrs_mcp_server: null,
        attrs_mcp_tool: null,
        attrs_skill_name: null,
      },
      '2',
    )
    dispatchOtel(
      {
        id: 3,
        ts: 't',
        event_name: 'c',
        session_id: null,
        attrs_mcp_server: null,
        attrs_mcp_tool: null,
        attrs_skill_name: null,
      },
      '3',
    )
    // Cap=2 means only the last 2 events remain (ring-buffer slice)
    expect(result.current.events.map((e) => e.event_name)).toEqual(['b', 'c'])
    expect(result.current.lastEventId).toBe('3')
  })

  it('closes the EventSource on unmount', () => {
    const { unmount } = renderHook(() => useFirehose())
    const es = MockEventSource.instances.at(-1)!
    expect(es.closed).toBe(false)
    unmount()
    expect(es.closed).toBe(true)
  })

  it('does not subscribe when enabled=false', () => {
    const before = MockEventSource.instances.length
    renderHook(() => useFirehose({ enabled: false }))
    expect(MockEventSource.instances.length).toBe(before)
  })

  it('skips malformed JSON frames silently (no throw)', () => {
    const { result } = renderHook(() => useFirehose())
    const es = MockEventSource.instances.at(-1)!
    expect(() =>
      act(() => {
        es.dispatchEvent(
          new MessageEvent('otel', { data: 'not json{', lastEventId: 'x' }),
        )
      }),
    ).not.toThrow()
    expect(result.current.events).toEqual([])
  })
})
