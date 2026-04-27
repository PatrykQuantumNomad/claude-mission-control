// Skills page (`/skills`) — Phase 5 Plan 04 (Wave 3 page grids).
//
// Per CONTEXT decision: Phase 5 ships named-but-empty placeholders for every
// Phase-7 HPNL-* / TPNL-* / SKLP-* requirement. Phase 7 fills each Card with
// the real stateful panel keyed by reqId.
//
// TPNL-02 (TaskComposer) and TPNL-04 (Inline pass-prompt) and TPNL-05
// (EmergencyStop banner) are NOT placed as cards — they are full-page or
// banner UI surfaces, owned by Phase 7 to insert at their canonical positions
// (banner above the grid, modal over the grid). Phase 7 plan must add these
// surfaces alongside the placeholder grid.

import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderCardGrid, type PlaceholderSlot } from '../components/PlaceholderCardGrid'
import { ContextHealthCard } from '../components/panels'

// Plan 07-01 (Wave 0) removed SKLP-03 from this list — ContextHealthCard
// renders the live panel below the placeholder grid. Plans 07-02..07-04
// retire the remaining slots one-by-one and Plan 07-04 deletes the
// PlaceholderCardGrid helper entirely.
const SKILLS_SLOTS: PlaceholderSlot[] = [
  { reqId: 'HPNL-01', title: 'Decisions', dataNoun: 'pending decisions' },
  { reqId: 'HPNL-02', title: 'Inbox', dataNoun: 'agent-to-user messages' },
  { reqId: 'TPNL-01', title: 'Task Board', dataNoun: 'task data' },
  { reqId: 'TPNL-03', title: 'Schedules', dataNoun: 'scheduled task data' },
  { reqId: 'SKLP-01', title: 'MCP Panel', dataNoun: 'MCP server data' },
  { reqId: 'SKLP-02', title: 'Skill Cost', dataNoun: 'skill cost data' },
  { reqId: 'SKLP-04', title: 'Skills Registry', dataNoun: 'skill registry entries' },
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
      <PlaceholderCardGrid slots={SKILLS_SLOTS} />
      {/* Phase 7 Plan 01 — SKLP-03 live panel rendered below the placeholder grid. */}
      <div className="cmc-card-grid">
        <ContextHealthCard />
      </div>
    </section>
  )
}

export const Route = createFileRoute('/skills')({ component: SkillsPage })
