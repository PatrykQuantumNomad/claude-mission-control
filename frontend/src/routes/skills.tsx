// Skills page (`/skills`).
//
// Phase 5 Plan 04 (Wave 3) shipped a placeholder grid keyed by reqId.
// Phase 7 Wave 0 (Plan 07-01) retired SKLP-03 and rendered ContextHealthCard
// below the grid. Phase 7 Wave 1 (Plan 07-02) retired the HPNL family
// (Decisions/Inbox) + SKLP-01/02/04. Phase 7 Wave 2 part 1 (this plan,
// Plan 07-03) retires TPNL-01 by rendering TaskBoard alongside the SKLP
// panels in the cmc-card-grid. The TaskComposer (TPNL-02) is mounted
// globally at AppShell — opening it via Cmd+K → 'Quick task' is wired in
// CommandPalette and works from any route.
//
// Only TPNL-03 (Schedules) remains in SKILLS_SLOTS — Plan 07-04 retires it
// and deletes the PlaceholderCardGrid helper file.

import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderCardGrid, type PlaceholderSlot } from '../components/PlaceholderCardGrid'
import {
  ContextHealthCard,
  DecisionsCard,
  InboxCard,
  McpPanel,
  SkillCostCard,
  SkillsRegistry,
  TaskBoard,
} from '../components/panels'

const SKILLS_SLOTS: PlaceholderSlot[] = [
  { reqId: 'TPNL-03', title: 'Schedules', dataNoun: 'scheduled task data' },
]

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
      {/* Full-width above-grid panels (LiveSessionsCard pattern — RESEARCH §thing-13). */}
      <DecisionsCard />
      <InboxCard />
      {/* Live grid for the SKLP-* family + ContextHealthCard from Wave 0 +
          TaskBoard (TPNL-01) from Plan 07-03. */}
      <div className="cmc-card-grid">
        <TaskBoard />
        <SkillsRegistry />
        <McpPanel reqId="SKLP-01" />
        <SkillCostCard />
        <ContextHealthCard />
      </div>
      {/* Last placeholder (TPNL-03) retired in Plan 07-04 along with the helper. */}
      <PlaceholderCardGrid slots={SKILLS_SLOTS} />
    </section>
  )
}

export const Route = createFileRoute('/skills')({ component: SkillsPage })
