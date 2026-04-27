// Activity page (`/activity`) — Phase 6 Plan 05 (Wave 5) closes out Phase 6 by
// landing the last 3 ACTV-* slots: ACTV-03 OtelPanel (SSE firehose),
// ACTV-04 TopSkills (v2 placeholder per Plan 06-01 decision), and
// ACTV-05 UnifiedFailures (failed sessions w/ last error). PlaceholderCardGrid
// is now removed from this route entirely — every ACTV-* slot is filled by a
// real (or v2-placeholder) panel.
//
// Render order (top → bottom):
//   1. Page header
//   2. ActivityHeatmap (ACTV-01)
//   3. ChartsStrip (ACTV-02)
//   4. .cmc-card-grid containing OtelPanel + UnifiedFailures + TopSkills
//   5. SessionsTable (ACTV-06, full width)

import { createFileRoute } from '@tanstack/react-router'
import {
  ActivityHeatmap,
  ChartsStrip,
  OtelPanel,
  SessionsTable,
  TopSkills,
  UnifiedFailures,
} from '../components/panels'

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
      <div className="cmc-card-grid">
        <OtelPanel />
        <UnifiedFailures />
        <TopSkills />
      </div>
      <SessionsTable />
    </section>
  )
}

export const Route = createFileRoute('/activity')({ component: ActivityPage })
