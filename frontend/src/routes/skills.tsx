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

import { createFileRoute } from '@tanstack/react-router'
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
import { PanelCard } from '../components/ui'
import {
  SCHEMA_VERSION,
  asComparePanels,
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
export type SkillsSearch = {
  schemaVersion?: typeof SCHEMA_VERSION
  time_from?: string | undefined
  time_to?: string | undefined
  compare_panels?: string | undefined
}

export function validateSearch(raw: Record<string, unknown>): SkillsSearch {
  return {
    schemaVersion: coerceSchemaVersion(raw),
    time_from: asTimeToken(raw.time_from),
    time_to: asTimeToken(raw.time_to),
    compare_panels: asComparePanels(raw.compare_panels),
  }
}

// SKLP-02 wrapper. Phase 27 / SC#1 — was useSkillUsage('14d', 1) with a
// hard-coded '14d'; now consumes useRouteRangeVocab('14d', snapToSkillRange)
// so the global time picker re-anchors the top-skill resolver. The snap
// helper collapses any URL window ≤21 days → '14d', >21 days → '30d'
// (backend SkillRange Literal). Default '14d' preserved when URL lacks
// time_from/time_to (bare-URL parity with pre-Phase-27 behavior).
function SkillCostCardForTopSkill() {
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
        empty={{ dataNoun: 'skill cost data', when: () => true }}
      >
        {() => null}
      </PanelCard>
    )
  }
  return <SkillCostCard name={topName} />
}

function SkillsPage() {
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
      <DecisionsCard />
      <InboxCard />
      {/* Live grid for tasks, schedules, and the SKLP-* family + ContextHealthCard. */}
      <div className="cmc-card-grid">
        <TaskBoard />
        <SchedulesCard />
        <SkillsRegistry />
        <McpPanel reqId="SKLP-01" />
        <SkillCostCardForTopSkill />
        <SkillLatencyTable />
        <SkillTimeline bounded />
        <ContextHealthCard />
      </div>
    </section>
  )
}

export const Route = createFileRoute('/skills')({
  validateSearch,
  component: SkillsPage,
})
