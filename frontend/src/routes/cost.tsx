// Cost page (`/cost`) — Phase 20 Plan 03 (ANLY-06 + ANLY-07).
//
// First user-facing surface for the cost dashboard. Two panels composed in
// the standard .cmc-card-grid layout:
//   - CostForecastCard   (ANLY-06 — projected month total + bias banner +
//                          insufficient-data branch when days_elapsed < 7)
//   - CostByProjectCard  (ANLY-07 — sortable per-project breakdown with
//                          7d/30d toggle; sourced from /api/cost/breakdown
//                          ?dim=project. Path-leakage-resistant by
//                          construction — Plan 20-01 SQL refactor + the
//                          schema half of the dual guard.)
//
// /cost is a top-level page (sibling of /skills, /activity, /alerts) — NO
// parent layout nesting. createFileRoute('/cost') auto-registers via
// @tanstack/router-plugin/vite on `pnpm build`.

import { createFileRoute } from '@tanstack/react-router'
import {
  CostByProjectCard,
  CostForecastCard,
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
// Phase 27 / SC#2 APPEND-ONLY extension: `time_from?` + `time_to?` (Grafana-
// style tokens via the shared `asTimeToken` validator from Phase 26 Plan 02)
// + `compare_panels?` (CSV via `asComparePanels` from Phase 26 Plan 07).
// SCHEMA_VERSION stays at 1 — adding three optional fields that default to
// `undefined` reproduces pre-Phase-27 behavior identically (Pitfall 13). The
// per-panel default ('7d' for CostByProjectCard) is applied AT THE PANEL READ
// SITE via `useRouteRangeVocab('7d', snapToCostRange)`, never in the validator
// (defending DefaultViewLoader's bare-URL gate).
export type CostSearch = {
  // OPTIONAL on input — existing `<Link to="/cost">` sites stay untouched;
  // the validator always populates the field on output.
  schemaVersion?: typeof SCHEMA_VERSION
  time_from?: string | undefined
  time_to?: string | undefined
  compare_panels?: string | undefined
}

export function validateSearch(raw: Record<string, unknown>): CostSearch {
  return {
    schemaVersion: coerceSchemaVersion(raw),
    time_from: asTimeToken(raw.time_from),
    time_to: asTimeToken(raw.time_to),
    compare_panels: asComparePanels(raw.compare_panels),
  }
}

function CostPage() {
  return (
    <section className="cmc-page cmc-page--bounded" aria-labelledby="cost-heading">
      <header className="cmc-page__header">
        <span className="cmc-label" style={{ color: 'var(--cmc-text-subtle)' }}>
          Mission Control
        </span>
        <h1
          id="cost-heading"
          className="cmc-page__heading cmc-page__heading--gradient"
        >
          Cost
        </h1>
        <p className="cmc-page__subheading">
          Monthly forecast and per-project cost breakdown.
        </p>
      </header>
      <div className="cmc-card-grid">
        <CostForecastCard />
        <CostByProjectCard />
      </div>
    </section>
  )
}

export const Route = createFileRoute('/cost')({
  validateSearch,
  component: CostPage,
})
