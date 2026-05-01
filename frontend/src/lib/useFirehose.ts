// current: bespoke SSE hook around the native EventSource API.
// Connects to /api/firehose, optionally filtered server-side by event_name,
// and ring-buffers incoming `otel` events into local state with a configurable
// cap (default 500). Status is exposed for UI affordances ("Connecting…",
// "Connected", "Disconnected — retry?").
//
// We use native EventSource (not @microsoft/fetch-event-source or eventsource-
// polyfill) because:
//   - the dashboard targets evergreen browsers (baseline)
//   - SAPI-05 backend route writes plain `event: otel\ndata: {...}\n\n` frames
//     so the auto-reconnect baked into EventSource is sufficient
//   - the only behavior we'd lose vs fetch-EventSource is custom headers; the
//     dashboard is same-origin so the browser sends the session cookie.
//
// Cleanup: every effect tears down its addEventListener handlers AND closes
// the EventSource on unmount (or when any of the deps change). React 19
// StrictMode double-invokes effects in dev; the explicit close+remove pattern
// keeps the second invocation idempotent.

import { useEffect, useRef, useState } from 'react'

export interface OtelEvent {
  id: number
  ts: string
  event_name: string
  session_id: string | null
  attrs_mcp_server: string | null
  attrs_mcp_tool: string | null
}

export type FirehoseStatus = 'connecting' | 'open' | 'closed'

export interface FirehoseOptions {
  /** Filter pushed events server-side by event_name. */
  eventName?: string
  /** Resume cursor — backend tails events with id > since. */
  since?: string
  /** Ring-buffer cap. Default 500. */
  bufferSize?: number
  /** Set false to skip subscribing entirely (used by panels behind feature
   * flags or hidden tabs). Default true. */
  enabled?: boolean
}

export function useFirehose(opts: FirehoseOptions = {}) {
  const { eventName, since, bufferSize, enabled = true } = opts
  const [events, setEvents] = useState<OtelEvent[]>([])
  const [status, setStatus] = useState<FirehoseStatus>('connecting')
  const lastIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (enabled === false) {
      setStatus('closed')
      return
    }
    if (typeof EventSource === 'undefined') {
      // Test environment without an EventSource polyfill — silent no-op.
      setStatus('closed')
      return
    }
    const params = new URLSearchParams()
    if (eventName) params.set('event_name', eventName)
    if (since) params.set('since', since)
    const url = `/api/firehose${params.toString() ? `?${params}` : ''}`
    const es = new EventSource(url)
    const cap = bufferSize ?? 500

    const onOpen = () => setStatus('open')
    const onError = () => setStatus('closed')
    const onMessage = (ev: MessageEvent) => {
      lastIdRef.current = ev.lastEventId || lastIdRef.current
      try {
        const evt = JSON.parse(ev.data) as OtelEvent
        setEvents((prev) => {
          const next = [...prev, evt]
          return next.length > cap ? next.slice(next.length - cap) : next
        })
      } catch {
        // skip malformed frame
      }
    }

    es.addEventListener('open', onOpen)
    es.addEventListener('error', onError)
    es.addEventListener('otel', onMessage as EventListener)

    return () => {
      es.removeEventListener('open', onOpen)
      es.removeEventListener('error', onError)
      es.removeEventListener('otel', onMessage as EventListener)
      es.close()
    }
  }, [eventName, since, bufferSize, enabled])

  return { events, status, lastEventId: lastIdRef.current }
}
