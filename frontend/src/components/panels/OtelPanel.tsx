// OtelPanel — ACTV-03 (current).
//
// Live OTEL firehose subscription with a client-side event_name filter and a
// connection-status pill. This is the project's first long-lived SSE consumer
// in production — exercises useFirehose end-to-end and proves the hook is
// reusable for SESS-05 in future work.
//
// Bespoke shell (NOT PanelCard) — useFirehose returns a different shape than
// UseQueryResult so PanelCard's skeleton/error/empty branches don't fit. The
// Card composition below mirrors PanelCard's visual contract (kicker + title
// + description + trailing controls).
//
// Filter strategy: client-side substring match (design notes// strategy 2). Server-side filter would require disconnect+reconnect on
// every keystroke; client-side filter narrows the ring-buffered events
// without any network churn.
//
// Render order: newest events at TOP. Live monitoring works better when
// new events appear above the fold so the operator's eye stays anchored.
//
// Ring-buffer cap: useFirehose default (500) — when the buffer fills,
// oldest events drop. Operator can scroll the feed (CSS max-height +
// overflow-y).

import { useState, useMemo } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  StatePill,
  RelativeTime,
} from '../ui'
import { useFirehose } from '../../lib/useFirehose'

export function OtelPanel() {
  const [filter, setFilter] = useState('')
  const { events, status } = useFirehose({ bufferSize: 500 })

  const filtered = useMemo(() => {
    const trimmed = filter.trim().toLowerCase()
    if (!trimmed) return events
    return events.filter((e) => e.event_name.toLowerCase().includes(trimmed))
  }, [events, filter])

  const pillState = status === 'open' ? 'ok' : status === 'connecting' ? 'pending' : 'stale'

  return (
    <Card>
      <CardHeader>
        <div className="cmc-panel-card__header">
          <div>
            <CardDescription className="cmc-label">ACTV-03</CardDescription>
            <CardTitle>OTEL Firehose</CardTitle>
            <CardDescription>
              {filtered.length}/{events.length} events shown
            </CardDescription>
          </div>
          <div className="cmc-otel-controls">
            <input
              type="text"
              placeholder="filter event_name…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="cmc-otel-controls__input"
              aria-label="Filter event name"
            />
            <StatePill state={pillState} label={status} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="cmc-otel-feed" role="log" aria-live="polite" aria-label="OTEL event feed">
          {filtered.length === 0 ? (
            <p className="cmc-otel-feed__empty">
              {status === 'closed' ? 'Reconnecting…' : 'Waiting for events…'}
            </p>
          ) : (
            // Newest at top — reverse a shallow copy so the underlying buffer order is unchanged.
            [...filtered].reverse().map((e) => (
              <div key={e.id} className="cmc-otel-row">
                <span className="cmc-otel-row__ts cmc-mono">
                  <RelativeTime value={e.ts} />
                </span>
                <span className="cmc-otel-row__name cmc-mono">{e.event_name}</span>
                {e.session_id ? (
                  <span
                    className="cmc-otel-row__sid cmc-mono"
                    title={e.session_id}
                  >
                    {e.session_id.slice(0, 8)}
                    {'\u2026'}
                  </span>
                ) : (
                  <span className="cmc-otel-row__sid cmc-mono">—</span>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
