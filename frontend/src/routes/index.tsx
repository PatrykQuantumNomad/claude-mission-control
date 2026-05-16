// Command page (`/`) with the top-strip and analytical-grid panels.
//
// Layout:
//   1. Page header (gradient title)
//   2. SystemHealthStrip (OPNL-01)  ┐
//   3. KpiRow            (OPNL-02)  ├ Top strip — full-width above grid
//   4. AttentionBar      (OPNL-03)  │  (AttentionBar disappears via
//   5. LiveSessionsCard  (OPNL-04)  ┘   PanelCard hiddenWhenEmpty)
//   6. .cmc-card-grid containing OPNL-05..15 live analytical panels
//      (the placeholder helper is no longer used here — its last
//       consumer for / was the OPNL-05..15 slot list, now superseded.)
//
// Phase 28 Plan 03 (LAYO-01 + LAYO-04 per-panel half):
//   - validateSearch APPEND-ONLY extended with `hidden_panels?: string` —
//     Pitfall 2 lock: defaults to `undefined`, NEVER an empty string. The
//     bare-URL gate (DefaultViewLoader) stays intact.
//   - Every PanelCard mount on this route now carries a `panelId={...}` from
//     PANEL_REGISTRY['/'] (15 entries) AND a `headerMenu={<PanelHeaderMenu
//     panelId={...} label={...} />}` so the Settings-icon dropdown lands in
//     the PanelCard trailing chrome slot (Plan 28-02 contract).
//   - Render-time filtering via useLayoutState.isHidden. Hidden panels are
//     skipped from the rendered output entirely; URL `?hidden_panels=<id>`
//     drives the gate. Round-trip with saved views is automatic — the
//     SaveViewDialog captures the URL search blob verbatim into state_json
//     (Phase 25 invariant; no SaveViewDialog edits needed in this plan).
//
// Phase 28 Plan 04 (LAYO-02 drag-reorder):
//   - validateSearch APPEND-ONLY extended with `panel_order?: string`.
//   - 'main' column render-order driven by useLayoutState.orderedPanels('main')
//     instead of the static PANELS array order. Top-strip panels keep static
//     order (not reorder-eligible — the chrome row is fixed).
//   - Every main-column panel mount wrapped in DraggablePanelWrap. Top-strip
//     panels stay plain (no drag grip).
//   - .cmc-card-grid container exposes data-column-id="main" and
//     data-testid="panel-grid-main" for DraggablePanelWrap's drop-target
//     contract + Playwright scoping.

import { useMemo } from 'react'
import { createFileRoute, useRouterState } from '@tanstack/react-router'
import {
  AgentFanoutCard,
  AttentionBar,
  CacheEfficiencyCard,
  EditAcceptanceCard,
  HookActivityCard,
  KpiRow,
  LiveSessionsCard,
  McpPanel,
  PressurePanel,
  ProductivityCard,
  ProjectBreakdownCard,
  SessionOutcomesCard,
  SystemHealthStrip,
  TokenUsageCard,
  ToolLatencyCard,
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

// Phase 25 / VIEW-01. The `/` route lands NO new filters in Phase 25 — only the
// `schemaVersion` field so future saved views can hydrate against a typed shape.
// `schemaVersion` is OPTIONAL on input (so existing `<Link to="/">` sites stay
// untouched) but always populated on output by `validateSearch`. Unknown fields
// drop silently (RESEARCH Pitfall 6) so a stale state_json blob from a saved
// view doesn't crash the page load.
//
// Phase 26 / TIME-01 (Plan 02). Append-only extension: ACCEPT `time_from?` +
// `time_to?` Grafana-style tokens on `/`. Both default to `undefined` — the
// per-route 24h fallback is applied AT THE PANEL READ SITE (Wave 3 plans),
// NOT in the validator. Defaulting here would defeat DefaultViewLoader's
// bare-URL gate (RESEARCH Pitfall 13).
//
// Phase 26 / TIME-04 (Plan 07). Append-only extension: ACCEPT `compare_panels?`
// as a CSV list of panel ids (e.g. `token-usage,session-outcomes`). Shape is
// validated by `asComparePanels` — malformed blobs drop silently to undefined.
// SCHEMA_VERSION stays at 1 (append-only + undefined-default invariant —
// Pitfall 2 + 13).
//
// Phase 28 / LAYO-01 (Plan 03). Append-only extension: ACCEPT `hidden_panels?`
// as a CSV list of panel ids via `asHiddenPanels`. Defaults to `undefined`
// (Pitfall 2 — empty string would defeat DefaultViewLoader's bare-URL gate).
//
// Phase 28 / LAYO-02 (Plan 04). Append-only extension: ACCEPT `panel_order?`
// as a CSV of `<columnId>:<id1>,<id2>;…` groups via `asPanelOrder`. Same
// undefined-default Pitfall 2 lock.
export type IndexSearch = {
  schemaVersion?: typeof SCHEMA_VERSION
  time_from?: string | undefined
  time_to?: string | undefined
  compare_panels?: string | undefined
  hidden_panels?: string | undefined
  panel_order?: string | undefined
}

export function validateSearch(raw: Record<string, unknown>): IndexSearch {
  return {
    schemaVersion: coerceSchemaVersion(raw),
    time_from: asTimeToken(raw.time_from),
    time_to: asTimeToken(raw.time_to),
    compare_panels: asComparePanels(raw.compare_panels),
    hidden_panels: asHiddenPanels(raw.hidden_panels),
    panel_order: asPanelOrder(raw.panel_order),
  }
}

// Render-array pattern (consistent across all 5 in-scope routes — Plans 03 +
// 04 reuse this shape verbatim). Each entry pairs a panel id from
// PANEL_REGISTRY['/'] with an operator-visible label + a render thunk that
// receives the headerMenu chrome to forward to the panel's PanelCard. The
// route filters by !isHidden(panelId), then renders each group's panels in
// the original render order.
const MAIN_COLUMN = 'main'

type PanelEntry = {
  panelId: string
  label: string
  group: 'top' | 'main'
  render: (props: { panelId: string; headerMenu: React.ReactNode }) => React.ReactNode
}

const PANELS: PanelEntry[] = [
  {
    panelId: 'system-pressure',
    label: 'System pressure',
    group: 'top',
    render: (p) => <SystemHealthStrip {...p} />,
  },
  {
    panelId: 'kpi-row',
    label: 'KPIs',
    group: 'top',
    render: (p) => <KpiRow {...p} />,
  },
  {
    panelId: 'attention-bar',
    label: 'Attention',
    group: 'top',
    render: (p) => <AttentionBar {...p} />,
  },
  {
    panelId: 'live-sessions',
    label: 'Live sessions',
    group: 'top',
    render: (p) => <LiveSessionsCard {...p} />,
  },
  {
    panelId: 'token-usage',
    label: 'Token usage',
    group: 'main',
    render: (p) => <TokenUsageCard {...p} />,
  },
  {
    panelId: 'cache-efficiency',
    label: 'Cache efficiency',
    group: 'main',
    render: (p) => <CacheEfficiencyCard {...p} />,
  },
  {
    panelId: 'session-outcomes',
    label: 'Session outcomes',
    group: 'main',
    render: (p) => <SessionOutcomesCard {...p} />,
  },
  {
    panelId: 'tool-latency',
    label: 'Tool latency',
    group: 'main',
    render: (p) => <ToolLatencyCard {...p} />,
  },
  {
    panelId: 'hook-activity',
    label: 'Hook activity',
    group: 'main',
    render: (p) => <HookActivityCard {...p} />,
  },
  {
    panelId: 'project-breakdown',
    label: 'Project breakdown',
    group: 'main',
    render: (p) => <ProjectBreakdownCard {...p} />,
  },
  {
    panelId: 'agent-fanout',
    label: 'Agent fanout',
    group: 'main',
    render: (p) => <AgentFanoutCard {...p} />,
  },
  {
    panelId: 'edit-acceptance',
    label: 'Edit acceptance',
    group: 'main',
    render: (p) => <EditAcceptanceCard {...p} />,
  },
  {
    panelId: 'productivity',
    label: 'Productivity',
    group: 'main',
    render: (p) => <ProductivityCard {...p} />,
  },
  {
    panelId: 'pressure-panel',
    label: 'Pressure',
    group: 'main',
    render: (p) => <PressurePanel {...p} />,
  },
  {
    panelId: 'mcp-panel',
    label: 'MCP servers',
    group: 'main',
    render: (p) => <McpPanel {...p} />,
  },
]

function CommandPage() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { isHidden, orderedPanels, setOrder } = useLayoutState(pathname)

  // Build the JSX map for main-column panels keyed by panelId. The map
  // entries are stable across renders (closed over the PANELS literal);
  // visibleMainPanels is the URL-driven render-order array, recomputed
  // when isHidden / orderedPanels return value changes.
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

  // Top-strip panels stay in static order — they are NOT reorder-eligible
  // (the chrome row is fixed). They still get PanelHeaderMenu (Hide / Reset
  // Layout) from Plan 28-03.
  const renderTopPanel = (entry: PanelEntry) => {
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
  const topPanels = PANELS.filter((p) => p.group === 'top')

  return (
    <section className="cmc-page cmc-page--bounded" aria-labelledby="cmd-heading">
      <header className="cmc-page__header">
        <span className="cmc-label" style={{ color: 'var(--cmc-text-subtle)' }}>
          Mission Control
        </span>
        <h1
          id="cmd-heading"
          className="cmc-page__heading cmc-page__heading--gradient"
        >
          Command
        </h1>
        <p className="cmc-page__subheading">
          Live view of every Claude Code agent session, token spend, and tool latency.
        </p>
      </header>
      {topPanels.map(renderTopPanel)}
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
    </section>
  )
}

export const Route = createFileRoute('/')({
  validateSearch,
  component: CommandPage,
})
