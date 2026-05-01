// Skills page (`/skills`) — current final form.
//
// Layout:
//   - DecisionsCard (HPNL-01, full-width — agent decisions awaiting answer)
//   - InboxCard    (HPNL-02, full-width — agent-to-user messages)
//   - .cmc-card-grid containing:
//       TaskBoard         (TPNL-01)
//       SchedulesCard     (TPNL-03; opens TPNL-04 ScheduleComposer via "+ New")
//       SkillsRegistry    (SKLP-04)
//       McpPanel          (SKLP-01 — component reused with reqId override)
//       SkillCostCard     (SKLP-02 — v2 placeholder)
//       ContextHealthCard (SKLP-03)
//
// TPNL-02 TaskComposer is mounted at AppShell (sibling of CommandPalette);
// accessible via Cmd+K → "Quick task" from any route.
//
// TPNL-04 ScheduleComposer is mounted as a sibling of SchedulesCard; opens
// via the "+ New" button on the card.
//
// TPNL-05 EmergencyStopBanner is mounted in NavBar — visible globally.
//
// PlaceholderCardGrid was retired in implementation along with the helper file;
// every former placeholder slot now resolves to a real panel.

import { createFileRoute } from '@tanstack/react-router'
import {
  ContextHealthCard,
  DecisionsCard,
  InboxCard,
  McpPanel,
  SchedulesCard,
  SkillCostCard,
  SkillsRegistry,
  TaskBoard,
} from '../components/panels'

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
        <SkillCostCard />
        <ContextHealthCard />
      </div>
    </section>
  )
}

export const Route = createFileRoute('/skills')({ component: SkillsPage })
