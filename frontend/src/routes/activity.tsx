// Activity page (`/activity`) — Phase 5 Plan 04 (Wave 3 page grids).
//
// Per CONTEXT decision: Phase 5 ships named-but-empty placeholders for every
// Phase-6 ACTV-* requirement. Phase 6 fills each Card with the real data
// panel keyed by reqId.

import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderCardGrid, type PlaceholderSlot } from '../components/PlaceholderCardGrid'

const ACTIVITY_SLOTS: PlaceholderSlot[] = [
  { reqId: 'ACTV-01', title: '30-Day Heatmap', dataNoun: '30 days of session activity' },
  { reqId: 'ACTV-02', title: '14-Day Token Charts', dataNoun: '14 days of token usage' },
  { reqId: 'ACTV-03', title: 'OTEL Firehose', dataNoun: 'OTEL events' },
  { reqId: 'ACTV-04', title: 'Top Skills', dataNoun: 'skill usage data' },
  { reqId: 'ACTV-05', title: 'Unified Failures', dataNoun: 'crashed session data' },
  { reqId: 'ACTV-06', title: 'Sessions Table', dataNoun: 'session history' },
]

function ActivityPage() {
  return (
    <section className="cmc-page" aria-labelledby="activity-heading">
      <header className="cmc-page__header">
        <span className="cmc-label" style={{ color: 'var(--cmc-text-subtle)' }}>
          Mission Control
        </span>
        <h1
          id="activity-heading"
          className="cmc-page__heading cmc-page__heading--gradient"
        >
          Activity
        </h1>
        <p className="cmc-page__subheading">
          Historical view: heatmaps, OTEL firehose, sessions table.
        </p>
      </header>
      <PlaceholderCardGrid slots={ACTIVITY_SLOTS} />
    </section>
  )
}

export const Route = createFileRoute('/activity')({ component: ActivityPage })
