import { describe, it, expect } from 'vitest'
import { render, screen } from '../../../test/utils'
import { KpiTile } from '../KpiTile'

describe('KpiTile', () => {
  it('renders label + value', () => {
    render(<KpiTile label="Sessions" value={42} />)
    expect(screen.getByText('Sessions')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('adds the mono modifier class when mono prop is set', () => {
    const { container, rerender } = render(<KpiTile label="X" value="ok" />)
    const value = container.querySelector('.cmc-kpi-tile__value') as HTMLElement
    expect(value.className).not.toContain('--mono')
    rerender(<KpiTile label="X" value="123" mono />)
    expect(container.querySelector('.cmc-kpi-tile__value--mono')).not.toBeNull()
  })

  it('renders sublabel when provided and omits otherwise', () => {
    const { container, rerender } = render(<KpiTile label="X" value="ok" />)
    expect(container.querySelector('.cmc-kpi-tile__sublabel')).toBeNull()
    rerender(<KpiTile label="X" value="ok" sublabel="last hr" />)
    expect(screen.getByText('last hr')).toBeInTheDocument()
  })
})
