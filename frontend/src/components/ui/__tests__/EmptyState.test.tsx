import { describe, it, expect } from 'vitest'
import { render, screen } from '../../../test/utils'
import { EmptyState } from '../EmptyState'

describe('EmptyState', () => {
  it('renders the heading + body with no icon and no action by default', () => {
    const { container } = render(
      <EmptyState heading="Nothing to show yet" body="Run sync from the header to refresh." />,
    )
    expect(screen.getByRole('heading', { level: 3, name: 'Nothing to show yet' })).toBeInTheDocument()
    expect(screen.getByText('Run sync from the header to refresh.')).toBeInTheDocument()
    expect(container.querySelector('.cmc-empty-state__icon')).toBeNull()
    expect(container.querySelector('.cmc-empty-state__action')).toBeNull()
  })

  it('renders an aria-hidden icon slot when provided', () => {
    const { container } = render(
      <EmptyState
        heading="Quiet day"
        body="Once sessions arrive it will appear here."
        icon={<svg data-testid="ico" />}
      />,
    )
    const slot = container.querySelector('.cmc-empty-state__icon')
    expect(slot).not.toBeNull()
    expect(slot).toHaveAttribute('aria-hidden')
    expect(screen.getByTestId('ico')).toBeInTheDocument()
  })

  it('renders an action slot when provided', () => {
    render(
      <EmptyState
        heading="Quiet day"
        body="Once sessions arrive it will appear here."
        action={<button type="button">Run sync</button>}
      />,
    )
    expect(screen.getByRole('button', { name: 'Run sync' })).toBeInTheDocument()
  })
})
