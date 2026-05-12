// Alerts page (`/alerts`) — Phase 15 Plan 05 (ALRT-10).
//
// First user-facing surface for the alert engine. Three panels composed in
// the standard .cmc-card-grid layout:
//   - AlertRulesList     (top, list rules + enable toggle + Delete)
//   - AlertRuleForm      (top, create-rule composer with discriminated-union
//                          over kind ∈ {threshold, anomaly})
//   - AlertEventsList    (full-width below — firing history + 4-tier
//                          RangeToggle persistKey='alert-events-range')
//
// /alerts is a top-level page (sibling of /skills, /activity) — NO parent
// layout nesting required. createFileRoute('/alerts') auto-registers via
// @tanstack/router-plugin/vite on `pnpm build`.

import { createFileRoute } from '@tanstack/react-router'
import {
  AlertEventsList,
  AlertRuleForm,
  AlertRulesList,
} from '../components/panels'
import { SCHEMA_VERSION, coerceSchemaVersion } from '../lib/searchSchemas'

// Phase 25 / VIEW-01. The `/alerts` route lands NO new filters in Phase 25 —
// only the `schemaVersion` field so future saved views can hydrate against a
// typed shape. The AlertEventsList 4-tier RangeToggle (persistKey
// 'alert-events-range') stays in localStorage until Phase 26/27 per-route
// adoption migrates it into the search shape.
export type AlertsSearch = {
  // OPTIONAL on input — existing `<Link to="/alerts">` sites stay untouched;
  // the validator always populates the field on output.
  schemaVersion?: typeof SCHEMA_VERSION
}

export function validateSearch(raw: Record<string, unknown>): AlertsSearch {
  return { schemaVersion: coerceSchemaVersion(raw) }
}

function AlertsPage() {
  return (
    <section className="cmc-page" aria-labelledby="alerts-heading">
      <header className="cmc-page__header">
        <span className="cmc-label" style={{ color: 'var(--cmc-text-subtle)' }}>
          Mission Control
        </span>
        <h1
          id="alerts-heading"
          className="cmc-page__heading cmc-page__heading--gradient"
        >
          Alerts
        </h1>
        <p className="cmc-page__subheading">
          Hysteresis-aware alert rules and firing history.
        </p>
      </header>
      <div className="cmc-card-grid">
        <AlertRulesList />
        <AlertRuleForm />
      </div>
      <div className="cmc-card-grid">
        <AlertEventsList />
      </div>
    </section>
  )
}

export const Route = createFileRoute('/alerts')({
  validateSearch,
  component: AlertsPage,
})
