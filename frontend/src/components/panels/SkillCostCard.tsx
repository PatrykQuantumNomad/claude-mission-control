// SkillCostCard — SKLP-02 v2 placeholder (Phase 7 Plan 02 / Wave 1).
//
// SCOPED TO V2. Decision rationale (07-RESEARCH §Open Q-Defer):
//   - Phase 2 ingest does not emit a `claude_code.skill_invoked` OTEL event.
//   - The TopSkills v2-deferral pattern (Phase 6 Plan 05) is canonical for
//     placeholder cards that preserve reqId traceability without speculative
//     ingest changes. SkillCostCard mirrors that shape exactly.
//
// Note: v2 placeholders intentionally do NOT use <PanelCard> — there is no
// UseQueryResult to feed it. They compose the Card primitive directly.

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from '../ui'

export function SkillCostCard() {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="cmc-label">SKLP-02</CardDescription>
        <CardTitle>Skill Cost</CardTitle>
      </CardHeader>
      <CardContent>
        <EmptyState
          heading="Coming in v2"
          body="Skill cost tracking lands once claude_code.skill_invoked events arrive in v2."
        />
      </CardContent>
    </Card>
  )
}
