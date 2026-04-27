// Skills page (`/skills`).
//
// Phase 5 Plan 04 (Wave 3) shipped a placeholder grid keyed by reqId.
// Phase 7 Wave 0 (Plan 07-01) retired SKLP-03 and rendered ContextHealthCard
// below the grid. Phase 7 Wave 1 (this plan, Plan 07-02) retires the next
// 5 placeholder slots:
//   - HPNL-01 → DecisionsCard (full-width above the grid)
//   - HPNL-02 → InboxCard     (full-width above the grid)
//   - SKLP-01 → McpPanel      (Phase 6 component reused; reqId override)
//   - SKLP-02 → SkillCostCard (v2 placeholder; preserves traceability)
//   - SKLP-04 → SkillsRegistry
//
// TPNL-02 (TaskComposer slide-out) and TPNL-04 (ScheduleComposer slide-out)
// and TPNL-05 (EmergencyStop banner) are full-page or banner UI surfaces
// owned by Phase 7 — TPNL-05 is already mounted globally in NavBar
// (Plan 07-01); TPNL-02 + TPNL-04 land in Plan 07-03 / 07-04. Two slots
// remain in SKILLS_SLOTS for Wave 2 to retire (TPNL-01, TPNL-03);
// Plan 07-04 deletes the PlaceholderCardGrid helper after retiring those.

import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderCardGrid, type PlaceholderSlot } from '../components/PlaceholderCardGrid'
import {
  ContextHealthCard,
  DecisionsCard,
  InboxCard,
  McpPanel,
  SkillCostCard,
  SkillsRegistry,
} from '../components/panels'

const SKILLS_SLOTS: PlaceholderSlot[] = [
  { reqId: 'TPNL-01', title: 'Task Board', dataNoun: 'task data' },
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
      {/* Live grid for the SKLP-* family + ContextHealthCard from Wave 0. */}
      <div className="cmc-card-grid">
        <SkillsRegistry />
        <McpPanel reqId="SKLP-01" />
        <SkillCostCard />
        <ContextHealthCard />
      </div>
      {/* Remaining placeholders (TPNL-01, TPNL-03) retired in Plans 07-03/07-04. */}
      <PlaceholderCardGrid slots={SKILLS_SLOTS} />
    </section>
  )
}

export const Route = createFileRoute('/skills')({ component: SkillsPage })
