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
//
// Phase 28 Plan 03 (LAYO-01 + LAYO-04 per-panel half):
//   - validateSearch APPEND-ONLY extended with `hidden_panels?: string` —
//     Pitfall 2 lock: defaults to `undefined`, NEVER an empty string.
//   - Each PanelCard mount carries `panelId={...}` from PANEL_REGISTRY['/cost']
//     (2 entries) + `headerMenu={<PanelHeaderMenu ... />}`.
//   - Render-time filtering via useLayoutState.isHidden.

import { createFileRoute, useRouterState } from '@tanstack/react-router'
import {
  CostByProjectCard,
  CostForecastCard,
} from '../components/panels'
import { PanelHeaderMenu } from '../components/ui'
import { useLayoutState } from '../lib/layout/useLayoutState'
import {
  SCHEMA_VERSION,
  asComparePanels,
  asHiddenPanels,
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
//
// Phase 28 / LAYO-01: APPEND `hidden_panels?` via `asHiddenPanels` — defaults
// to `undefined` (Pitfall 2 lock preserved).
export type CostSearch = {
  // OPTIONAL on input — existing `<Link to="/cost">` sites stay untouched;
  // the validator always populates the field on output.
  schemaVersion?: typeof SCHEMA_VERSION
  time_from?: string | undefined
  time_to?: string | undefined
  compare_panels?: string | undefined
  hidden_panels?: string | undefined
}

export function validateSearch(raw: Record<string, unknown>): CostSearch {
  return {
    schemaVersion: coerceSchemaVersion(raw),
    time_from: asTimeToken(raw.time_from),
    time_to: asTimeToken(raw.time_to),
    compare_panels: asComparePanels(raw.compare_panels),
    hidden_panels: asHiddenPanels(raw.hidden_panels),
  }
}

type PanelEntry = {
  panelId: string
  label: string
  render: (props: { panelId: string; headerMenu: React.ReactNode }) => React.ReactNode
}

const PANELS: PanelEntry[] = [
  {
    panelId: 'cost-forecast',
    label: 'Cost forecast',
    render: (p) => <CostForecastCard {...p} />,
  },
  {
    panelId: 'cost-by-project',
    label: 'Cost by project',
    render: (p) => <CostByProjectCard {...p} />,
  },
]

function CostPage() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { isHidden } = useLayoutState(pathname)

  const renderPanel = (entry: PanelEntry) => {
    if (isHidden(entry.panelId)) return null
    return (
      <span key={entry.panelId} style={{ display: 'contents' }}>
        {entry.render({
          panelId: entry.panelId,
          headerMenu: (
            <PanelHeaderMenu panelId={entry.panelId} label={entry.label} />
          ),
        })}
      </span>
    )
  }

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
      <div className="cmc-card-grid">{PANELS.map(renderPanel)}</div>
    </section>
  )
}

export const Route = createFileRoute('/cost')({
  validateSearch,
  component: CostPage,
})
