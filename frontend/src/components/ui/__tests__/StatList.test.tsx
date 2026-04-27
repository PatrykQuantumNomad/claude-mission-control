import { describe, it, expect } from 'vitest'
import { render, screen } from '../../../test/utils'
import { StatList } from '../StatList'

describe('StatList', () => {
  it('renders one row per item with label + value', () => {
    render(
      <StatList
        items={[
          { label: 'Commits', value: 12 },
          { label: 'Lines added', value: '3,201' },
        ]}
      />,
    )
    expect(screen.getByText('Commits')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('Lines added')).toBeInTheDocument()
    expect(screen.getByText('3,201')).toBeInTheDocument()
  })

  it('renders an icon when provided + a trend glyph with the matching modifier class', () => {
    const { container } = render(
      <StatList
        items={[
          { icon: <svg data-testid="ico" />, label: 'PRs', value: 3, trend: 'up' },
          { label: 'Errors', value: 0, trend: 'flat' },
          { label: 'Bugs', value: 5, trend: 'down' },
        ]}
      />,
    )
    expect(screen.getByTestId('ico')).toBeInTheDocument()
    expect(container.querySelector('.cmc-stat-list__trend--up')).not.toBeNull()
    expect(container.querySelector('.cmc-stat-list__trend--down')).not.toBeNull()
    expect(container.querySelector('.cmc-stat-list__trend--flat')).not.toBeNull()
  })
})
