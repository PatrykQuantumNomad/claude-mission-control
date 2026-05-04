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

function SkillCostCardForTopSkill() {
  const usage = useSkillUsage('14d', 1)
  const topName = usage.data?.rows?.[0]?.skill_name

  if (!topName) {
    return (
      <PanelCard
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
    <section className="cmc-page" aria-labelledby="skills-heading">
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
        <SkillTimeline />
        <ContextHealthCard />
      </div>
    </section>
  )
}

export const Route = createFileRoute('/skills')({ component: SkillsPage })
