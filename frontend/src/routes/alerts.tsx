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
import {
  SCHEMA_VERSION,
  asComparePanels,
  asTimeToken,
  coerceSchemaVersion,
} from '../lib/searchSchemas'

// Phase 25 / VIEW-01 baseline: `schemaVersion` field so future saved views can
// hydrate against a typed shape.
//
// Phase 27 Plan 06 APPEND-ONLY extension: `time_from?` + `time_to?` (Grafana-
// style tokens via the shared `asTimeToken` validator from Phase 26 Plan 02)
// + `compare_panels?` (CSV via `asComparePanels` from Phase 26 Plan 07).
// SCHEMA_VERSION stays at 1 — adding three optional fields that default to
// `undefined` reproduces pre-Phase-27 behavior identically (Pitfall 13). The
// per-panel default ('7d' for AlertEventsList) is applied AT THE PANEL READ
// SITE via `useRouteRangeVocab('7d', snapToAlertRange)`, never in the validator
// (defending DefaultViewLoader's bare-URL gate). The v1.2 `RangeToggle
// persistKey='alert-events-range'` localStorage round-trip is REPLACED by URL
// state at the AlertEventsList read site — pre-existing localStorage entries
// under `alert-events-range` become dead values (matches Plan 27-05 stance).
export type AlertsSearch = {
  // OPTIONAL on input — existing `<Link to="/alerts">` sites stay untouched;
  // the validator always populates the field on output.
  schemaVersion?: typeof SCHEMA_VERSION
  time_from?: string | undefined
  time_to?: string | undefined
  compare_panels?: string | undefined
}

export function validateSearch(raw: Record<string, unknown>): AlertsSearch {
  return {
    schemaVersion: coerceSchemaVersion(raw),
    time_from: asTimeToken(raw.time_from),
    time_to: asTimeToken(raw.time_to),
    compare_panels: asComparePanels(raw.compare_panels),
  }
}

function AlertsPage() {
  return (
    <section className="cmc-page cmc-page--bounded" aria-labelledby="alerts-heading">
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
