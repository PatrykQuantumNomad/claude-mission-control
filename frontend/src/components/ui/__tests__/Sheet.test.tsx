import { describe, it, expect, vi } from 'vitest'
import { render, userEvent } from '../../../test/utils'
import { Sheet } from '../Sheet'

describe('Sheet', () => {
  it('does not render content when open=false', () => {
    const { queryByText } = render(
      <Sheet open={false} onOpenChange={() => {}} title="My Sheet">
        Body
      </Sheet>,
    )
    expect(queryByText('My Sheet')).toBeNull()
  })

  it('renders title + body when open=true and exposes Radix dialog accessibility surface', () => {
    const { getByText, getByRole } = render(
      <Sheet open onOpenChange={() => {}} title="My Sheet" description="Sheet desc">
        Body content
      </Sheet>,
    )
    expect(getByText('My Sheet')).toBeInTheDocument()
    expect(getByText('Sheet desc')).toBeInTheDocument()
    expect(getByText('Body content')).toBeInTheDocument()
    // Radix Dialog 1.1.x sets role="dialog" + aria-labelledby (to Title id) +
    // aria-describedby (to Description id) on the content. Modal semantics are
    // delivered via the focus-trap (FocusScope) + RemoveScroll wrapping, not via
    // an aria-modal attribute. Our description prop wires aria-describedby="cmc-sheet-desc".
    const dialog = getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-labelledby')
    expect(dialog).toHaveAttribute('aria-describedby', 'cmc-sheet-desc')
  })

  it('calls onOpenChange(false) on Esc — Radix Dialog semantics', async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(
      <Sheet open onOpenChange={onOpenChange} title="X">
        Body
      </Sheet>,
    )
    await user.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
