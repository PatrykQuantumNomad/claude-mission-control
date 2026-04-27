// Activity page (`/activity`) — Phase 6 Plan 04 (Wave 4) replaces three of the
// six Phase-5 placeholder slots with real panels: ActivityHeatmap (ACTV-01),
// ChartsStrip (ACTV-02), SessionsTable (ACTV-06). The remaining three slots
// (ACTV-03 OTEL Firehose, ACTV-04 Top Skills, ACTV-05 Unified Failures) stay
// in the placeholder grid; Plan 06-05 lands those panels and removes
// PlaceholderCardGrid usage from this route entirely.

import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderCardGrid, type PlaceholderSlot } from '../components/PlaceholderCardGrid'
import { ActivityHeatmap, ChartsStrip, SessionsTable } from '../components/panels'

const ACTIVITY_SLOTS: PlaceholderSlot[] = [
  { reqId: 'ACTV-03', title: 'OTEL Firehose', dataNoun: 'OTEL events' },
  { reqId: 'ACTV-04', title: 'Top Skills', dataNoun: 'skill usage data' },
  { reqId: 'ACTV-05', title: 'Unified Failures', dataNoun: 'crashed session data' },
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
      <ActivityHeatmap />
      <ChartsStrip />
      <SessionsTable />
      <PlaceholderCardGrid slots={ACTIVITY_SLOTS} />
    </section>
  )
}

export const Route = createFileRoute('/activity')({ component: ActivityPage })
