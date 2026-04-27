// Command page (`/`) — Phase 5 Plan 04 (Wave 3 page grids) +
// Phase 6 Plan 02 (Wave 2 top-strip panels).
//
// Layout:
//   1. Page header (gradient title)
//   2. SystemHealthStrip (OPNL-01)  ┐
//   3. KpiRow            (OPNL-02)  ├ Top strip — full-width above grid
//   4. AttentionBar      (OPNL-03)  │  (AttentionBar disappears via
//   5. LiveSessionsCard  (OPNL-04)  ┘   PanelCard hiddenWhenEmpty)
//   6. PlaceholderCardGrid — remaining OPNL-05..15 slots; Plan 06-03 (Wave 3)
//      replaces these with the real analytical panels.
//
// OPNL-01/03/04 are explicitly REMOVED from COMMAND_SLOTS so they don't
// double-render alongside the live components above the grid.

import { createFileRoute } from '@tanstack/react-router'
import {
  AttentionBar,
  KpiRow,
  LiveSessionsCard,
  SystemHealthStrip,
} from '../components/panels'
import { PlaceholderCardGrid, type PlaceholderSlot } from '../components/PlaceholderCardGrid'

const COMMAND_SLOTS: PlaceholderSlot[] = [
  { reqId: 'OPNL-05', title: 'Token Usage', dataNoun: 'token usage data' },
  { reqId: 'OPNL-06', title: 'Cache Efficiency', dataNoun: 'cache hit rate data' },
  { reqId: 'OPNL-07', title: 'Session Outcomes', dataNoun: 'session outcome data' },
  { reqId: 'OPNL-08', title: 'Tool Latency', dataNoun: 'tool latency data' },
  { reqId: 'OPNL-09', title: 'Hook Activity', dataNoun: 'hook fires' },
  { reqId: 'OPNL-10', title: 'Project Breakdown', dataNoun: 'project session data' },
  { reqId: 'OPNL-11', title: 'Agent Fanout', dataNoun: 'agent invocations' },
  { reqId: 'OPNL-12', title: 'Edit Acceptance', dataNoun: 'edit decision data' },
  { reqId: 'OPNL-13', title: 'Productivity', dataNoun: 'productivity metrics' },
  { reqId: 'OPNL-14', title: 'Pressure Panel', dataNoun: 'system pressure data' },
  { reqId: 'OPNL-15', title: 'MCP Servers', dataNoun: 'MCP server data' },
]

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
      <PlaceholderCardGrid slots={COMMAND_SLOTS} />
    </section>
  )
}

export const Route = createFileRoute('/')({ component: CommandPage })
