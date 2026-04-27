// Command page (`/`) — Phase 5 Plan 04 (Wave 3 page grids) +
// Phase 6 Plans 02 (Wave 2 top-strip) and 03 (Wave 3 analytical grid).
//
// Layout:
//   1. Page header (gradient title)
//   2. SystemHealthStrip (OPNL-01)  ┐
//   3. KpiRow            (OPNL-02)  ├ Top strip — full-width above grid
//   4. AttentionBar      (OPNL-03)  │  (AttentionBar disappears via
//   5. LiveSessionsCard  (OPNL-04)  ┘   PanelCard hiddenWhenEmpty)
//   6. .cmc-card-grid containing OPNL-05..15 live analytical panels
//      (the Plan 05-04 placeholder helper is no longer used here — its last
//       consumer for / was the OPNL-05..15 slot list, now superseded.)

import { createFileRoute } from '@tanstack/react-router'
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

function CommandPage() {
  return (
    <section className="cmc-page" aria-labelledby="cmd-heading">
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
      <SystemHealthStrip />
      <KpiRow />
      <AttentionBar />
      <LiveSessionsCard />
      <div className="cmc-card-grid">
        <TokenUsageCard />
        <CacheEfficiencyCard />
        <SessionOutcomesCard />
        <ToolLatencyCard />
        <HookActivityCard />
        <ProjectBreakdownCard />
        <AgentFanoutCard />
        <EditAcceptanceCard />
        <ProductivityCard />
        <PressurePanel />
        <McpPanel />
      </div>
    </section>
  )
}

export const Route = createFileRoute('/')({ component: CommandPage })
