// TopSkills — ACTV-04 (current).
//
// SCOPED TO V2 in current. Decision rationale:
//   - The sessions table has no skill_id column today.
//   - ingestion does not emit a `claude_code.skill_invoked` OTEL event
//     (verified: grep returns no occurrences in backend/cmc/ingest as of
//     2026-04-27).
//   - Heuristic-via-cwd does not work because Claude Code sessions run from
//     the project cwd, not from inside skill folders.
//
// V2 direction: add a skill_id link on session_starts via ingestion enhancement,
// then add a /api/skills/usage backend route, then replace this placeholder
// with real top-N skill usage data. Until then, the card preserves the
// requirement ID's traceability and tells the operator what's coming —
// without speculative ingest changes.

import { Sparkles } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from '../ui'

export function TopSkills() {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="cmc-label">ACTV-04</CardDescription>
        <CardTitle>Top Skills</CardTitle>
      </CardHeader>
      <CardContent>
        <EmptyState
          icon={<Sparkles aria-hidden />}
          heading="Coming in v2"
          body="Skill usage telemetry needs a skill_id link on sessions before this card has data."
        />
      </CardContent>
    </Card>
  )
}
