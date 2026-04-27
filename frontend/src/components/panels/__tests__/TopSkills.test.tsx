import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '../../../test/utils'
import { TopSkills } from '../TopSkills'

describe('TopSkills', () => {
  beforeEach(() => {
    // Spy fetch to assert NO network call is issued — TopSkills v2 placeholder
    // must not try to hit /api/skills/usage (the route does not exist yet).
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the ACTV-04 kicker, title, and "Coming in v2" empty state body', () => {
    render(<TopSkills />)
    expect(screen.getByText('ACTV-04')).toBeInTheDocument()
    expect(screen.getByText('Top Skills')).toBeInTheDocument()
    expect(screen.getByText('Coming in v2')).toBeInTheDocument()
    expect(
      screen.getByText(
        /Skill usage telemetry needs a skill_id link on sessions before this card has data/,
      ),
    ).toBeInTheDocument()
  })

  it('does NOT issue any /api/skills/usage fetch (v2 placeholder must be data-less)', () => {
    render(<TopSkills />)
    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
    const urls = calls.map((args) => String(args[0]))
    expect(urls.some((u) => u.includes('/api/skills/usage'))).toBe(false)
  })
})
