import { describe, it, expect } from 'vitest'
import { render, screen, userEvent } from '../../../test/utils'
import { Button } from '../Button'

describe('Button', () => {
  it('renders all three variants with the matching variant class + cmc-btn base class', () => {
    const { rerender } = render(<Button variant="primary">Go</Button>)
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('cmc-btn', 'cmc-btn--primary')

    rerender(<Button variant="secondary">Cancel</Button>)
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('cmc-btn--secondary')

    rerender(<Button variant="ghost">Skip</Button>)
    expect(screen.getByRole('button', { name: 'Skip' })).toHaveClass('cmc-btn--ghost')
  })

  it('renders icon slots when provided and respects size + default variant=secondary', () => {
    render(
      <Button size="sm" iconLeft={<span data-testid="lhs" />} iconRight={<span data-testid="rhs" />}>
        Action
      </Button>,
    )
    const btn = screen.getByRole('button', { name: 'Action' })
    expect(btn).toHaveClass('cmc-btn--sm', 'cmc-btn--secondary')
    expect(screen.getByTestId('lhs')).toBeInTheDocument()
    expect(screen.getByTestId('rhs')).toBeInTheDocument()
  })

  it('default type is "button" (avoids form-submit footgun) and respects type="submit" override', () => {
    const { rerender } = render(<Button>Default</Button>)
    expect(screen.getByRole('button', { name: 'Default' })).toHaveAttribute('type', 'button')
    rerender(<Button type="submit">Send</Button>)
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('type', 'submit')
  })

  it('respects disabled and fires onClick when enabled', async () => {
    const user = userEvent.setup()
    let clicks = 0
    const handle = () => { clicks += 1 }
    const { rerender } = render(<Button disabled onClick={handle}>Disabled</Button>)
    const disabledBtn = screen.getByRole('button', { name: 'Disabled' })
    expect(disabledBtn).toBeDisabled()
    await user.click(disabledBtn)
    expect(clicks).toBe(0)

    rerender(<Button onClick={handle}>Enabled</Button>)
    await user.click(screen.getByRole('button', { name: 'Enabled' }))
    expect(clicks).toBe(1)
  })
})
