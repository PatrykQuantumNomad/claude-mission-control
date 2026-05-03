// SkillTimeline — SKLP-06 (NEW, Phase 14 Plan 04).
//
// Live-stream firehose panel for `skill_activated` events. Cloned from
// OtelPanel; the differences are:
//   - useFirehose call hard-codes eventName='skill_activated' (BARE — see D-06)
//   - Filter input narrows by attrs_skill_name (not event_name)
//   - Pause button toggles useFirehose's enabled prop
//   - Each row renders attrs_skill_name (with '—' fallback) instead of event_name
//
// CRITICAL CORRECTNESS:
//   - The hook prop name is `eventName` (camelCase) — see useFirehose.ts:38.
//   - The runtime event_name in the DB column is the BARE form
//     'skill_activated' because the ingest layer strips the 'claude_code.'
//     prefix on write per Phase 12 SPIKE.md LOCK-1. The SSE filter at
//     /api/firehose?event_name=… matches the column post-strip, so we MUST
//     send the BARE form. The roadmap text 'claude_code.skill_activated'
//     describes the OTLP wire form — never the runtime form.
//
// Bespoke shell (NOT PanelCard) — useFirehose returns a different shape than
// UseQueryResult so PanelCard's branches don't fit. Card composition mirrors
// PanelCard's visual contract.

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

export function SkillTimeline() {
  const [paused, setPaused] = useState(false)
  const [skillFilter, setSkillFilter] = useState('')

  // BARE event name + camelCase prop per D-06 / Pitfalls 1+8.
  const { events, status } = useFirehose({
    eventName: 'skill_activated',
    enabled: !paused,
  })

  const filtered = useMemo(() => {
    const trimmed = skillFilter.trim().toLowerCase()
    if (!trimmed) return events
    return events.filter((e) =>
      (e.attrs_skill_name ?? '').toLowerCase().includes(trimmed),
    )
  }, [events, skillFilter])

  const pillState =
    status === 'open' ? 'ok' : status === 'connecting' ? 'pending' : 'stale'

  return (
    <Card>
      <CardHeader>
        <div className="cmc-panel-card__header">
          <div>
            <CardDescription className="cmc-label">SKLP-06</CardDescription>
            <CardTitle>Skill Timeline</CardTitle>
            <CardDescription>
              {filtered.length}/{events.length} skill activations shown
            </CardDescription>
          </div>
          <div className="cmc-otel-controls">
            <input
              type="text"
              placeholder="filter skill_name…"
              value={skillFilter}
              onChange={(e) => setSkillFilter(e.target.value)}
              className="cmc-otel-controls__input"
              aria-label="Filter skill name"
            />
            <button
              type="button"
              className="cmc-btn cmc-btn--ghost cmc-btn--sm"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? 'Resume stream' : 'Pause stream'}
            >
              {paused ? 'Resume' : 'Pause'}
            </button>
            <StatePill state={pillState} label={status} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div
          className="cmc-otel-feed"
          role="log"
          aria-live="polite"
          aria-label="Skill activation feed"
        >
          {filtered.length === 0 ? (
            <p className="cmc-otel-feed__empty">
              {paused
                ? 'Stream paused.'
                : status === 'closed'
                  ? 'Reconnecting…'
                  : 'Waiting for skill activations…'}
            </p>
          ) : (
            // Newest at top — reverse a shallow copy so the underlying buffer
            // order is unchanged (matches OtelPanel idiom).
            [...filtered].reverse().map((e) => (
              <div key={e.id} className="cmc-otel-row">
                <span className="cmc-otel-row__ts cmc-mono">
                  <RelativeTime value={e.ts} />
                </span>
                <span className="cmc-otel-row__name cmc-mono">
                  {e.attrs_skill_name ?? '—'}
                </span>
                {e.session_id ? (
                  <span
                    className="cmc-otel-row__sid cmc-mono"
                    title={e.session_id}
                  >
                    {e.session_id.slice(0, 8)}
                    {'…'}
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
