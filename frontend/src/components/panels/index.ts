// Phase 6 panels barrel — Wave 2 (Plan 06-02) ships SystemHealthStrip /
// KpiRow / AttentionBar / LiveSessionsCard. Wave 3 (Plan 06-03) will append
// the analytical-grid panels (TokenUsage / Cache / Outcomes / Latency / etc.)
// to this barrel. Routes import every panel from here so the surface area is
// observable in one place.

export { SystemHealthStrip } from './SystemHealthStrip'
export { KpiRow } from './KpiRow'
export { AttentionBar } from './AttentionBar'
// LiveSessionsCard re-export added in Task 2 of Plan 06-02 (same plan).
export { LiveSessionsCard } from './LiveSessionsCard'
// Phase 6 Plan 03 (Wave 3) — analytical-grid panels (Task 1: chart + project)
export { TokenUsageCard } from './TokenUsageCard'
export { CacheEfficiencyCard } from './CacheEfficiencyCard'
export { SessionOutcomesCard } from './SessionOutcomesCard'
export { HookActivityCard } from './HookActivityCard'
export { ProjectBreakdownCard } from './ProjectBreakdownCard'
// Phase 6 Plan 03 (Wave 3) — analytical-grid panels (Task 2: stat/list + MCP)
export { ToolLatencyCard } from './ToolLatencyCard'
export { AgentFanoutCard } from './AgentFanoutCard'
export { EditAcceptanceCard } from './EditAcceptanceCard'
export { ProductivityCard } from './ProductivityCard'
export { PressurePanel } from './PressurePanel'
export { McpPanel } from './McpPanel'
// Phase 6 Plan 04 (Wave 4) — Activity page core panels
export { ActivityHeatmap } from './ActivityHeatmap'
export { ChartsStrip } from './ChartsStrip'
export { SessionsTable } from './SessionsTable'
// Phase 6 Plan 05 (Wave 5) — Activity page tail (SSE + failures + v2 placeholder)
export { OtelPanel } from './OtelPanel'
export { UnifiedFailures } from './UnifiedFailures'
export { TopSkills } from './TopSkills'
// Phase 7 Plan 01 (Wave 0) — SKLP-03 panel (replaces SKLP-03 placeholder slot)
export { ContextHealthCard } from './ContextHealthCard'
// Phase 7 Plan 02 (Wave 1) — HPNL panels (DecisionsCard + InboxCard)
export { DecisionsCard } from './DecisionsCard'
export { InboxCard } from './InboxCard'
// Phase 7 Plan 02 (Wave 1) — SKLP panels (SkillsRegistry + SkillCostCard v2 placeholder)
export { SkillsRegistry } from './SkillsRegistry'
export { SkillCostCard } from './SkillCostCard'
// Phase 7 Plan 03 (Wave 2) — TPNL panels (TaskBoard + TaskComposer with context provider)
export { TaskBoard } from './TaskBoard'
export {
  TaskComposer,
  TaskComposerProvider,
  useTaskComposer,
} from './TaskComposer'
