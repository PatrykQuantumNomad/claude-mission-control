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
