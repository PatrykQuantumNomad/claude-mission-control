import { describe, it, expect } from 'vitest'
import { render, screen, userEvent } from '../../../test/utils'
import { Tooltip } from '../Tooltip'

describe('Tooltip', () => {
  it('reveals the content on focus of the trigger', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip content="Hello tooltip">
        <button type="button">Hover me</button>
      </Tooltip>,
    )
    const trigger = screen.getByRole('button', { name: 'Hover me' })
    expect(trigger).toBeInTheDocument()
    // Focus is the determinstic surface — Radix opens the tooltip on focus
    // immediately (ignores the 200ms hover delay for keyboard users).
    await user.tab()
    expect(trigger).toHaveFocus()
    // Radix portals the content; findAllByText walks the entire body tree.
    // Radix renders the content twice (visible + sr-only via role=tooltip)
    // so we assert on the visible cmc-tooltip element specifically.
    const matches = await screen.findAllByText('Hello tooltip', undefined, { timeout: 1000 })
    expect(matches.length).toBeGreaterThan(0)
    // At least one match is the screen-reader-accessible role="tooltip"
    expect(screen.getByRole('tooltip')).toHaveTextContent('Hello tooltip')
  })

  it('renders the trigger as the supplied child via Radix asChild semantics', () => {
    render(
      <Tooltip content="ignored">
        <button type="button" aria-label="absolute timestamp">12:34</button>
      </Tooltip>,
    )
    // Custom button survives the asChild wrap — its role + label come through.
    expect(screen.getByRole('button', { name: 'absolute timestamp' })).toHaveTextContent('12:34')
  })
})
