import { describe, it, expect, vi } from 'vitest'
import { render, screen, userEvent } from '../../../test/utils'
import { ErrorState } from '../ErrorState'

describe('ErrorState', () => {
  it('renders the canonical UI-SPEC copy with the dataNoun substituted', () => {
    render(<ErrorState message="500 internal" dataNoun="sessions" />)
    // Apostrophe is the typographic curly variant; assert via getByText regex
    expect(screen.getByText(/Couldn.t load sessions/)).toBeInTheDocument()
    expect(screen.getByText('500 internal')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('omits the retry button when onRetry is not supplied', () => {
    render(<ErrorState message="boom" />)
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it('fires onRetry when the retry button is clicked', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(<ErrorState message="boom" dataNoun="tools" onRetry={onRetry} />)
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
