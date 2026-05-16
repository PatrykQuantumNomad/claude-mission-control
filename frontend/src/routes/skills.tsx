// Skills page (`/skills`) — current final form (Phase 14 Plan 04 wiring).
//
// Layout:
//   - DecisionsCard (HPNL-01, full-width — agent decisions awaiting answer)
//   - InboxCard    (HPNL-02, full-width — agent-to-user messages)
//   - .cmc-card-grid containing:
//       TaskBoard                (TPNL-01)
//       SchedulesCard            (TPNL-03; opens TPNL-04 ScheduleComposer via "+ New")
//       SkillsRegistry           (SKLP-04)
//       McpPanel                 (SKLP-01 — component reused with reqId override)
//       SkillCostCardForTopSkill (SKLP-02 — top-1 wrapper around the per-skill SkillCostCard, D-07)
//       SkillLatencyTable        (SKLP-05 — sortable per-skill p50/p95/max + low_sample badge)
//       SkillTimeline            (SKLP-06 — live skill_activated firehose stream)
//       ContextHealthCard        (SKLP-03)
//
// TPNL-02 TaskComposer is mounted at AppShell (sibling of CommandPalette);
// accessible via Cmd+K → "Quick task" from any route.
//
// TPNL-04 ScheduleComposer is mounted as a sibling of SchedulesCard; opens
// via the "+ New" button on the card.
//
// TPNL-05 EmergencyStopBanner is mounted in NavBar — visible globally.
//
// SkillCostCardForTopSkill: small inline wrapper that reads the top-1 skill
// from useSkillUsage('14d', 1) and forwards its name to SkillCostCard. Per
// D-07: the Skills page is not per-skill, so we default to top-1 here while
// the per-name SkillCostCard signature stays clean for /skills/$name (Plan 05).
// SKLP-02 traceability runs through BOTH SkillCostCard.tsx (the panel) and
// this wrapper (the page-level resolver).
//
// Phase 28 Plan 03 (LAYO-01 + LAYO-04 per-panel half):
//   - validateSearch APPEND-ONLY extended with `hidden_panels?: string`.
//   - 10 panel mounts each carry panelId from PANEL_REGISTRY['/skills'] +
//     headerMenu={<PanelHeaderMenu ... />}. SkillCostCardForTopSkill
//     forwards both to its internal PanelCard (the empty/loading branch)
//     OR to the SkillCostCard for the resolved top skill name (the data
//     branch — SkillCostCard already takes panelId/headerMenu via the
//     LayoutCustomizableProps shape lifted by Plan 28-03).
//
// Phase 28 Plan 04 (LAYO-02 drag-reorder):
//   - validateSearch APPEND-ONLY extended with `panel_order?: string`.
//   - Main-column render-order driven by useLayoutState.orderedPanels.
//   - Top-strip panels (decisions, inbox) stay static — not reorder-
//     eligible.
//   - .cmc-card-grid container exposes data-column-id="main" and
//     data-testid="panel-grid-main".

import { useMemo } from 'react'
import { createFileRoute, useRouterState } from '@tanstack/react-router'
import {
  ContextHealthCard,
  DecisionsCard,
  InboxCard,
  McpPanel,
  SchedulesCard,
  SkillCostCard,
  SkillLatencyTable,
  SkillTimeline,
  SkillsRegistry,
  TaskBoard,
} from '../components/panels'
import { useSkillUsage } from '../lib/queries'
import {
  DraggablePanelWrap,
  PanelCard,
  PanelHeaderMenu,
  type LayoutCustomizableProps,
} from '../components/ui'
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
import {
  snapToSkillRange,
  useRouteRangeVocab,
} from '../lib/time/useRouteRangeVocab'

// Phase 25 / VIEW-01. `schemaVersion` is OPTIONAL on input (so existing
// `<Link to="/skills">` sites stay untouched) but always populated on output
// by `validateSearch`.
//
// Phase 27 / SC#1 (Plan 04). Append-only extension: ACCEPT `time_from?` +
// `time_to?` Grafana-style tokens + `compare_panels?` CSV on `/skills`. All
// three default to `undefined` — the per-route 14d fallback is applied AT
// THE PANEL READ SITE via useRouteRangeVocab('14d', snapToSkillRange), NOT
// in the validator (Pitfall 13: defaulting here would defeat
// DefaultViewLoader's bare-URL gate). SCHEMA_VERSION stays at 1.
//
// Phase 28 / LAYO-01: APPEND `hidden_panels?` via `asHiddenPanels` — defaults
// to `undefined` (Pitfall 2 lock preserved).
//
// Phase 28 / LAYO-02 (Plan 04): APPEND `panel_order?` via `asPanelOrder`.
export type SkillsSearch = {
  schemaVersion?: typeof SCHEMA_VERSION
  time_from?: string | undefined
  time_to?: string | undefined
  compare_panels?: string | undefined
  hidden_panels?: string | undefined
  panel_order?: string | undefined
}

export function validateSearch(raw: Record<string, unknown>): SkillsSearch {
  return {
    schemaVersion: coerceSchemaVersion(raw),
    time_from: asTimeToken(raw.time_from),
    time_to: asTimeToken(raw.time_to),
    compare_panels: asComparePanels(raw.compare_panels),
    hidden_panels: asHiddenPanels(raw.hidden_panels),
    panel_order: asPanelOrder(raw.panel_order),
  }
}

// SKLP-02 wrapper. Phase 27 / SC#1 — was useSkillUsage('14d', 1) with a
// hard-coded '14d'; now consumes useRouteRangeVocab('14d', snapToSkillRange)
// so the global time picker re-anchors the top-skill resolver. The snap
// helper collapses any URL window ≤21 days → '14d', >21 days → '30d'
// (backend SkillRange Literal). Default '14d' preserved when URL lacks
// time_from/time_to (bare-URL parity with pre-Phase-27 behavior).
//
// Phase 28 / LAYO-01: takes LayoutCustomizableProps so the route can mount
// it with panelId="skill-cost" and the headerMenu chrome. Forwards both
// to either the empty/loading PanelCard branch OR the SkillCostCard for
// the resolved top-1 name.
function SkillCostCardForTopSkill({ panelId, headerMenu }: LayoutCustomizableProps = {}) {
  const range = useRouteRangeVocab('14d', snapToSkillRange)
  const usage = useSkillUsage(range, 1)
  const topName = usage.data?.rows?.[0]?.skill_name

  if (!topName) {
    return (
      <PanelCard
        bounded
        reqId="SKLP-02"
        title="Skill Cost"
        query={usage}
        panelId={panelId}
        headerMenu={headerMenu}
        empty={{ dataNoun: 'skill cost data', when: () => true }}
      >
        {() => null}
      </PanelCard>
    )
  }
  return <SkillCostCard name={topName} panelId={panelId} headerMenu={headerMenu} />
}

const MAIN_COLUMN = 'main'

type PanelEntry = {
  panelId: string
  label: string
  group: 'top' | 'main'
  render: (props: { panelId: string; headerMenu: React.ReactNode }) => React.ReactNode
}

const PANELS: PanelEntry[] = [
  {
    panelId: 'decisions',
    label: 'Decisions',
    group: 'top',
    render: (p) => <DecisionsCard {...p} />,
  },
  {
    panelId: 'inbox',
    label: 'Inbox',
    group: 'top',
    render: (p) => <InboxCard {...p} />,
  },
  {
    panelId: 'task-board',
    label: 'Task board',
    group: 'main',
    render: (p) => <TaskBoard {...p} />,
  },
  {
    panelId: 'schedules',
    label: 'Schedules',
    group: 'main',
    render: (p) => <SchedulesCard {...p} />,
  },
  {
    panelId: 'skills-registry',
    label: 'Skills registry',
    group: 'main',
    render: (p) => <SkillsRegistry {...p} />,
  },
  {
    panelId: 'mcp-servers',
    label: 'MCP servers',
    group: 'main',
    render: (p) => <McpPanel reqId="SKLP-01" {...p} />,
  },
  {
    panelId: 'skill-cost',
    label: 'Skill cost',
    group: 'main',
    render: (p) => <SkillCostCardForTopSkill {...p} />,
  },
  {
    panelId: 'skill-latency',
    label: 'Skill latency',
    group: 'main',
    render: (p) => <SkillLatencyTable {...p} />,
  },
  {
    panelId: 'skill-timeline',
    label: 'Skill timeline',
    group: 'main',
    render: (p) => <SkillTimeline bounded {...p} />,
  },
  {
    panelId: 'context-health',
    label: 'Context health',
    group: 'main',
    render: (p) => <ContextHealthCard {...p} />,
  },
]

function SkillsPage() {
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
    <section className="cmc-page cmc-page--bounded" aria-labelledby="skills-heading">
      <header className="cmc-page__header">
        <span className="cmc-label" style={{ color: 'var(--cmc-text-subtle)' }}>
          Mission Control
        </span>
        <h1
          id="skills-heading"
          className="cmc-page__heading cmc-page__heading--gradient"
        >
          Skills
        </h1>
        <p className="cmc-page__subheading">
          Skills registry, MCP servers, decisions, inbox, tasks, schedules.
        </p>
      </header>
      {/* Full-width above-grid panels (LiveSessionsCard pattern — design notes). */}
      {topPanels.map(renderTopPanel)}
      {/* Live grid for tasks, schedules, and the SKLP-* family + ContextHealthCard. */}
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

export const Route = createFileRoute('/skills')({
  validateSearch,
  component: SkillsPage,
})
