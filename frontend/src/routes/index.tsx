// Command page (`/`) — Phase 5 Plan 04 (Wave 3 page grids).
//
// Per CONTEXT decision: Phase 5 ships named-but-empty placeholders for every
// Phase-6 OPNL-* requirement. Phase 6 fills each Card with the real data
// panel keyed by reqId.
//
// KpiRow (OPNL-02) is intentionally NOT placed here — Phase 6 introduces both
// the slot AND the component above the panel grid (UI-SPEC focal-point
// hierarchy: KpiRow → AttentionBar → Panel grid). Phase 6 plan must add the
// slot above <PlaceholderCardGrid> on this page.

import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderCardGrid, type PlaceholderSlot } from '../components/PlaceholderCardGrid'

const COMMAND_SLOTS: PlaceholderSlot[] = [
  { reqId: 'OPNL-01', title: 'System Health Strip', dataNoun: 'health metrics' },
  { reqId: 'OPNL-03', title: 'Attention', dataNoun: 'attention items' },
  { reqId: 'OPNL-04', title: 'Live Sessions', dataNoun: 'live session activity' },
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
      <PlaceholderCardGrid slots={COMMAND_SLOTS} />
    </section>
  )
}

export const Route = createFileRoute('/')({ component: CommandPage })
