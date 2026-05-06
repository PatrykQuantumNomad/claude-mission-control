// DeltaPill — SKLP-09 (Phase 19 Plan 04).
//
// Locks: sign-by-delta, integer vs currency formatting, the null-percent
// edge case (server signals "no baseline" via deltaPct=null), and the
// locale-grouped integer formatting. The aria-label is the primary
// assertion target so a refactor that drops the user-facing change
// announcement breaks the test (a11y regression guard).

import { describe, expect, it } from 'vitest'
import { render, screen } from '../../../test/utils'
import { DeltaPill } from '../DeltaPill'

describe('DeltaPill', () => {
  it('renders the up arrow + sign-up class when delta > 0 with explicit +pct', () => {
    const { container } = render(<DeltaPill delta={12} deltaPct={0.45} />)
    expect(screen.getByLabelText('Change: ↑ 12 (+45%)')).toBeInTheDocument()
    expect(container.querySelector('.cmc-delta-pill--up')).not.toBeNull()
  })

  it('renders the down arrow + sign-down class when delta < 0 (abs value, no -- in pct)', () => {
    const { container } = render(<DeltaPill delta={-3} deltaPct={-0.2} />)
    // abs strips the sign from the integer; pct keeps the - because it carries
    // information separate from the arrow direction.
    expect(screen.getByLabelText('Change: ↓ 3 (-20%)')).toBeInTheDocument()
    expect(container.querySelector('.cmc-delta-pill--down')).not.toBeNull()
  })

  it('renders the flat dot + sign-flat class when delta === 0', () => {
    const { container } = render(<DeltaPill delta={0} deltaPct={0} />)
    // 0 is not > 0 so no '+' prefix; format expected: '· 0 (0%)'
    expect(screen.getByLabelText('Change: · 0 (0%)')).toBeInTheDocument()
    expect(container.querySelector('.cmc-delta-pill--flat')).not.toBeNull()
  })

  it('renders the em-dash for percent when deltaPct is null (no baseline / div-by-zero guard)', () => {
    render(<DeltaPill delta={5} deltaPct={null} />)
    expect(screen.getByLabelText('Change: ↑ 5 (—)')).toBeInTheDocument()
    expect(screen.getByText('(—)')).toBeInTheDocument()
  })

  it('formats the absolute value as currency when format="currency" (two decimals, $ prefix)', () => {
    render(<DeltaPill delta={12.34} deltaPct={0.1} format="currency" />)
    expect(screen.getByText('$12.34')).toBeInTheDocument()
    expect(screen.getByLabelText('Change: ↑ $12.34 (+10%)')).toBeInTheDocument()
  })

  it('formats the absolute value with locale separators for integers >= 1000', () => {
    render(<DeltaPill delta={1234} deltaPct={0.1} />)
    expect(screen.getByText('1,234')).toBeInTheDocument()
  })

  it('forwards data-testid + extra HTML attributes to the rendered span', () => {
    render(
      <DeltaPill delta={1} deltaPct={0.5} data-testid="some-test-id" />,
    )
    expect(screen.getByTestId('some-test-id')).toHaveClass('cmc-delta-pill')
  })
})
