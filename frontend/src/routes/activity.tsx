// Activity page (`/activity`) with the ACTV-* panels: ACTV-03 OtelPanel (SSE firehose),
// ACTV-04 TopSkills (v2 placeholder per implementation decision), and
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
import {
  SCHEMA_VERSION,
  asComparePanels,
  asTimeToken,
  coerceSchemaVersion,
} from '../lib/searchSchemas'

// Phase 25 / VIEW-01. The `/activity` route lands NO new filters in Phase 25 —
// only the `schemaVersion` field so future saved views can hydrate against a
// typed shape. Existing panel-internal state (heatmap range, SessionsTable
// localStorage) stays orthogonal; it migrates into the search shape in
// Phase 26/27.
//
// Phase 26 / TIME-01 (Plan 02). Append-only extension: ACCEPT `time_from?` +
// `time_to?` Grafana-style tokens on `/activity`. Both default to `undefined`
// — the per-route 1h fallback is applied AT THE PANEL READ SITE (Wave 3
// plans), NOT in the validator. Defaulting here would defeat
// DefaultViewLoader's bare-URL gate (RESEARCH Pitfall 13).
//
// Phase 26 / TIME-04 (Plan 07). Append-only extension: ACCEPT `compare_panels?`
// as a CSV list of panel ids — same shape + validator as `/` and
// `/sessions/compare`. SCHEMA_VERSION stays at 1.
export type ActivitySearch = {
  // OPTIONAL on input — existing `<Link to="/activity">` sites stay untouched;
  // the validator always populates the field on output.
  schemaVersion?: typeof SCHEMA_VERSION
  time_from?: string | undefined
  time_to?: string | undefined
  compare_panels?: string | undefined
}

export function validateSearch(raw: Record<string, unknown>): ActivitySearch {
  return {
    schemaVersion: coerceSchemaVersion(raw),
    time_from: asTimeToken(raw.time_from),
    time_to: asTimeToken(raw.time_to),
    compare_panels: asComparePanels(raw.compare_panels),
  }
}

function ActivityPage() {
  return (
    <section className="cmc-page cmc-page--bounded" aria-labelledby="activity-heading">
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

export const Route = createFileRoute('/activity')({
  validateSearch,
  component: ActivityPage,
})
