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
//
// Phase 28 Plan 03 (LAYO-01 + LAYO-04 per-panel half):
//   - validateSearch APPEND-ONLY extended with `hidden_panels?: string`.
//   - 3 panel mounts each carry panelId from PANEL_REGISTRY['/alerts'] +
//     headerMenu={<PanelHeaderMenu ... />}. AlertRuleForm is the only
//     bespoke (non-PanelCard) panel; its <article> root emits data-panel-id
//     and renders headerMenu in its header chrome.
//   - Render-time filter via useLayoutState.isHidden.
//
// Phase 28 Plan 04 (LAYO-02 drag-reorder):
//   - validateSearch APPEND-ONLY extended with `panel_order?: string`.
//   - PANEL_REGISTRY['/alerts'] re-grouped: alert-rules-list +
//     alert-rule-form share columnId='main' (reorder-eligible);
//     alert-events-list is columnId='below' (NOT reorder-eligible —
//     full-width firing history table that sits underneath the two-panel
//     composer grid).
//   - Main-column panels wrapped in DraggablePanelWrap with the standard
//     drop-target attributes.

import { useMemo } from 'react'
import { createFileRoute, useRouterState } from '@tanstack/react-router'
import {
  AlertEventsList,
  AlertRuleForm,
  AlertRulesList,
} from '../components/panels'
import { DraggablePanelWrap, PanelHeaderMenu } from '../components/ui'
import { useLayoutState } from '../lib/layout/useLayoutState'
import { getPanelLabel } from '../lib/layout/panelRegistry'
import {
  SCHEMA_VERSION,
  asComparePanels,
  asHiddenPanels,
  asPanelOrder,
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
//
// Phase 28 / LAYO-01: APPEND `hidden_panels?` via `asHiddenPanels` — defaults
// to `undefined` (Pitfall 2 lock preserved).
//
// Phase 28 / LAYO-02 (Plan 04): APPEND `panel_order?` via `asPanelOrder`.
export type AlertsSearch = {
  // OPTIONAL on input — existing `<Link to="/alerts">` sites stay untouched;
  // the validator always populates the field on output.
  schemaVersion?: typeof SCHEMA_VERSION
  time_from?: string | undefined
  time_to?: string | undefined
  compare_panels?: string | undefined
  hidden_panels?: string | undefined
  panel_order?: string | undefined
}

export function validateSearch(raw: Record<string, unknown>): AlertsSearch {
  return {
    schemaVersion: coerceSchemaVersion(raw),
    time_from: asTimeToken(raw.time_from),
    time_to: asTimeToken(raw.time_to),
    compare_panels: asComparePanels(raw.compare_panels),
    hidden_panels: asHiddenPanels(raw.hidden_panels),
    panel_order: asPanelOrder(raw.panel_order),
  }
}

const MAIN_COLUMN = 'main'

type PanelEntry = {
  panelId: string
  label: string
  group: 'main' | 'below'
  render: (props: { panelId: string; headerMenu: React.ReactNode }) => React.ReactNode
}

const PANELS: PanelEntry[] = [
  {
    panelId: 'alert-rules-list',
    label: 'Alert rules',
    group: 'main',
    render: (p) => <AlertRulesList {...p} />,
  },
  {
    panelId: 'alert-rule-form',
    label: 'New alert rule',
    group: 'main',
    render: (p) => <AlertRuleForm {...p} />,
  },
  {
    panelId: 'alert-events-list',
    label: 'Firing history',
    group: 'below',
    render: (p) => <AlertEventsList {...p} />,
  },
]

function AlertsPage() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { isHidden, orderedPanels, setOrder } = useLayoutState(pathname)

  // Main-column panel id → render thunk map.
  const mainPanelMap = useMemo(() => {
    const map: Record<
      string,
      (props: { panelId: string; headerMenu: React.ReactNode }) => React.ReactNode
    > = {}
    for (const entry of PANELS) {
      if (entry.group !== 'main') continue
      map[entry.panelId] = entry.render
    }
    return map
  }, [])

  const visibleMainPanels = useMemo(() => {
    return orderedPanels(MAIN_COLUMN).filter(
      (id) => !isHidden(id) && id in mainPanelMap,
    )
  }, [isHidden, orderedPanels, mainPanelMap])
  const total = visibleMainPanels.length

  // Below-grid panels (alert-events-list) stay static — NOT reorder-eligible.
  const renderBelowPanel = (entry: PanelEntry) => {
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
  const belowPanels = PANELS.filter((p) => p.group === 'below')

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
      <div
        className="cmc-card-grid"
        data-column-id={MAIN_COLUMN}
        data-testid={`panel-grid-${MAIN_COLUMN}`}
      >
        {visibleMainPanels.map((id, idx) => {
          const label = getPanelLabel(pathname, id)
          return (
            <DraggablePanelWrap
              key={id}
              panelId={id}
              columnId={MAIN_COLUMN}
              label={label}
              index={idx}
              total={total}
              onReorder={(fromId, toIndex) => {
                const next = [...visibleMainPanels]
                const from = next.indexOf(fromId)
                if (from === -1 || from === toIndex) return
                const [moved] = next.splice(from, 1)
                next.splice(toIndex, 0, moved)
                setOrder(MAIN_COLUMN, next)
              }}
            >
              {mainPanelMap[id]({
                panelId: id,
                headerMenu: (
                  <PanelHeaderMenu panelId={id} label={label} />
                ),
              })}
            </DraggablePanelWrap>
          )
        })}
      </div>
      <div className="cmc-card-grid">{belowPanels.map(renderBelowPanel)}</div>
    </section>
  )
}

export const Route = createFileRoute('/alerts')({
  validateSearch,
  component: AlertsPage,
})
