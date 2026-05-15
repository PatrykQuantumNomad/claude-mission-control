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
//
// Phase 27 / SC#1 (Plan 04):
//   - Optional `skillName` prop pre-filters the firehose to a single skill so
//     /skills/$name can reuse this panel as the 5th detail-page panel. The
//     existing user-facing text filter input still works ADDITIVELY on top:
//     if skillName is set AND the user types a substring, both narrow.
//   - Optional `bounded` prop applies the `cmc-card--bounded` modifier so
//     the panel pins to its parent's height (CONT-04 containment, mirrors
//     the PanelCard `bounded` opt-in shape).

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

interface SkillTimelineProps {
  /**
   * Phase 27 / SC#1. Pre-filter the firehose to a single skill name so
   * /skills/$name can render this panel filtered to the current skill. The
   * comparison is exact-match on `attrs_skill_name`; the user-facing text
   * filter input still narrows further if present.
   */
  skillName?: string
  /**
   * Phase 27 / SC#1. Apply the `cmc-card--bounded` modifier (CONT-04 — pin
   * to parent height + internal scroll container). Mirrors PanelCard's
   * `bounded` opt-in shape; default `false` preserves pre-Phase-27 behavior.
   */
  bounded?: boolean
}

export function SkillTimeline({ skillName, bounded }: SkillTimelineProps = {}) {
  const [paused, setPaused] = useState(false)
  const [skillFilter, setSkillFilter] = useState('')

  // BARE event name + camelCase prop per D-06 / Pitfalls 1+8.
  const { events, status } = useFirehose({
    eventName: 'skill_activated',
    enabled: !paused,
  })

  const filtered = useMemo(() => {
    const trimmed = skillFilter.trim().toLowerCase()
    return events.filter((e) => {
      const eventSkill = e.attrs_skill_name ?? ''
      // Phase 27 prop-level pre-filter: exact-match on the skill name.
      if (skillName && eventSkill !== skillName) return false
      if (!trimmed) return true
      return eventSkill.toLowerCase().includes(trimmed)
    })
  }, [events, skillFilter, skillName])

  const pillState =
    status === 'open' ? 'ok' : status === 'connecting' ? 'pending' : 'stale'

  return (
    <Card className={bounded ? 'cmc-card--bounded' : ''}>
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
