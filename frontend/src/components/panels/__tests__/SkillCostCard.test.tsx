// SkillCostCard — SKLP-02 v2 placeholder (current).
//
// Mirrors the TopSkills v2-deferral pattern (current STATE.md L246): static
// EmptyState card with reqId kicker — preserves traceability without
// fetching a backend route that does not yet exist (no claude_code.skill_invoked
// event in current ingest).
import { describe, it, expect } from 'vitest'
import { render, screen } from '../../../test/utils'
import { SkillCostCard } from '../SkillCostCard'

describe('SkillCostCard', () => {
  it('renders the SKLP-02 reqId kicker + "Coming in v2" heading + the v2 deferral body literal', () => {
    render(<SkillCostCard />)
    expect(screen.getByText('SKLP-02')).toBeInTheDocument()
    expect(screen.getByText('Skill Cost')).toBeInTheDocument()
    expect(screen.getByText('Coming in v2')).toBeInTheDocument()
    expect(
      screen.getByText(
        /Skill cost tracking lands once claude_code\.skill_invoked events arrive in v2\./i,
      ),
    ).toBeInTheDocument()
  })
})
