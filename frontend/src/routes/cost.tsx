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
//
// Phase 28 Plan 04 (LAYO-02 drag-reorder):
//   - validateSearch APPEND-ONLY extended with `panel_order?: string`.
//   - Render-order driven by useLayoutState.orderedPanels('main') instead of
//     the static PANELS array order.
//   - Every main-column panel mount wrapped in DraggablePanelWrap so the
//     drag grip + keyboard reorder + aria-live region are available.
//   - The .cmc-card-grid container carries data-column-id="main" and
//     data-testid="panel-grid-main" so DraggablePanelWrap's drop-target
//     handler can identify its column (Major #6 — Task 2a/2b contract).

import { useMemo } from 'react'
import { createFileRoute, useRouterState } from '@tanstack/react-router'
import {
  CostByProjectCard,
  CostForecastCard,
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
//
// Phase 28 / LAYO-02 (Plan 04): APPEND `panel_order?` via `asPanelOrder` —
// same Pitfall 2 lock (undefined-default, never empty string).
export type CostSearch = {
  // OPTIONAL on input — existing `<Link to="/cost">` sites stay untouched;
  // the validator always populates the field on output.
  schemaVersion?: typeof SCHEMA_VERSION
  time_from?: string | undefined
  time_to?: string | undefined
  compare_panels?: string | undefined
  hidden_panels?: string | undefined
  panel_order?: string | undefined
}

export function validateSearch(raw: Record<string, unknown>): CostSearch {
  return {
    schemaVersion: coerceSchemaVersion(raw),
    time_from: asTimeToken(raw.time_from),
    time_to: asTimeToken(raw.time_to),
    compare_panels: asComparePanels(raw.compare_panels),
    hidden_panels: asHiddenPanels(raw.hidden_panels),
    panel_order: asPanelOrder(raw.panel_order),
  }
}

// Phase 28 Plan 04 — Map of panelId → render thunk. The map is the single
// source of truth for which JSX to render; the orderedPanels(columnId) call
// drives the iteration order (URL-overridden first, registry-trailing
// appended in default order). Build the map ONCE per render — the entries
// only change when component-identity changes, which would already trigger
// a full re-render.
type RenderProps = { panelId: string; headerMenu: React.ReactNode }

const MAIN_COLUMN = 'main'

const MAIN_PANELS: Record<string, (props: RenderProps) => React.ReactNode> = {
  'cost-forecast': (p) => <CostForecastCard {...p} />,
  'cost-by-project': (p) => <CostByProjectCard {...p} />,
}

function CostPage() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { isHidden, orderedPanels, setOrder } = useLayoutState(pathname)

  // Visible main-column panel ids in the URL-driven render order. The
  // .filter(id => id in MAIN_PANELS) gate is Pitfall 7 defense in depth
  // (a saved view referencing a removed panel id is silently dropped).
  const visibleMainPanels = useMemo(() => {
    return orderedPanels(MAIN_COLUMN).filter(
      (id) => !isHidden(id) && id in MAIN_PANELS,
    )
  }, [isHidden, orderedPanels])
  const total = visibleMainPanels.length

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
              {MAIN_PANELS[id]({
                panelId: id,
                headerMenu: (
                  <PanelHeaderMenu panelId={id} label={label} />
                ),
              })}
            </DraggablePanelWrap>
          )
        })}
      </div>
    </section>
  )
}

export const Route = createFileRoute('/cost')({
  validateSearch,
  component: CostPage,
})
