import { describe, it, expect } from 'vitest'
import { render, screen } from '../../../test/utils'
import { StatePill } from '../StatePill'

describe('StatePill', () => {
  it('renders all five states with the matching cmc-state-pill--<state> class', () => {
    const states = ['ok', 'running', 'pending', 'stale', 'error'] as const
    for (const s of states) {
      const { unmount } = render(<StatePill state={s} label="Telegram" />)
      const pill = screen.getByRole('status', { name: `Telegram (${s})` })
      expect(pill).toHaveClass('cmc-state-pill', `cmc-state-pill--${s}`)
      // The colored dot is aria-hidden but always present as a child span
      const dot = pill.querySelector('.cmc-state-pill__dot')
      expect(dot).not.toBeNull()
      expect(dot).toHaveAttribute('aria-hidden')
      unmount()
    }
  })

  it('exposes the label text as visible content alongside the role=status announcement', () => {
    render(<StatePill state="ok" label="Telegram" />)
    expect(screen.getByText('Telegram')).toBeInTheDocument()
  })
})
