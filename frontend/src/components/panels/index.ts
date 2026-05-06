// Panels barrel. Routes import every panel from here so the surface area is
// observable in one place.

export { SystemHealthStrip } from './SystemHealthStrip'
export { KpiRow } from './KpiRow'
export { AttentionBar } from './AttentionBar'
// LiveSessionsCard re-export added in the LiveSessionsCard change.
export { LiveSessionsCard } from './LiveSessionsCard'
// Analytical-grid panels: chart + project
export { TokenUsageCard } from './TokenUsageCard'
export { CacheEfficiencyCard } from './CacheEfficiencyCard'
export { SessionOutcomesCard } from './SessionOutcomesCard'
export { HookActivityCard } from './HookActivityCard'
export { ProjectBreakdownCard } from './ProjectBreakdownCard'
// Analytical-grid panels: stat/list + MCP
export { ToolLatencyCard } from './ToolLatencyCard'
export { AgentFanoutCard } from './AgentFanoutCard'
export { EditAcceptanceCard } from './EditAcceptanceCard'
export { ProductivityCard } from './ProductivityCard'
export { PressurePanel } from './PressurePanel'
export { McpPanel } from './McpPanel'
// Activity page core panels
export { ActivityHeatmap } from './ActivityHeatmap'
export { ChartsStrip } from './ChartsStrip'
export { SessionsTable } from './SessionsTable'
// Activity page tail (SSE + failures + v2 placeholder)
export { OtelPanel } from './OtelPanel'
export { UnifiedFailures } from './UnifiedFailures'
export { TopSkills } from './TopSkills'
// SKLP-03 panel
export { ContextHealthCard } from './ContextHealthCard'
// HPNL panels
export { DecisionsCard } from './DecisionsCard'
export { InboxCard } from './InboxCard'
// SKLP panels
export { SkillsRegistry } from './SkillsRegistry'
export { SkillCostCard } from './SkillCostCard'
// Phase 14 Plan 04 — SKLP-05 + SKLP-06 panels.
export { SkillLatencyTable } from './SkillLatencyTable'
export { SkillTimeline } from './SkillTimeline'
// Phase 14 Plan 05 — SKIL-07 per-skill recent invocations panel (composed
// inside the new /skills/$name dynamic route).
export { SkillRunsTable } from './SkillRunsTable'
// Phase 19 Plan 04 — SKLP-08 per-project breakdown panel (composed below
// SkillCostCard on /skills/$name; see routes/skills_.$name.tsx).
export { SkillProjectsTable } from './SkillProjectsTable'
// Phase 20 Plan 03 — ANLY-06 + ANLY-07 cost dashboard panels (composed on
// the new /cost route; see routes/cost.tsx).
export { CostForecastCard } from './CostForecastCard'
export { CostByProjectCard } from './CostByProjectCard'
// Phase 15 Plan 05 — ALRT-10 alert engine UI panels (composed inside the
// new /alerts file-based route).
export { AlertEventsList } from './AlertEventsList'
export { AlertRuleForm } from './AlertRuleForm'
export { AlertRulesList } from './AlertRulesList'
// Phase 16 Plan 02 — CMPR-02..05 paired-session compare panel (composed
// inside the new /sessions/compare file-based route).
export { SessionCompareView } from './SessionCompareView'
// TPNL task panels
export { TaskBoard } from './TaskBoard'
export {
  TaskComposer,
  TaskComposerProvider,
  useTaskComposer,
} from './TaskComposer'
// TPNL schedule panels
export { SchedulesCard } from './SchedulesCard'
export { ScheduleComposer } from './ScheduleComposer'
