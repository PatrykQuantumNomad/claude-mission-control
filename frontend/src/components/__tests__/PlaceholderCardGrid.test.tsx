import { describe, it, expect } from 'vitest'
import { render } from '../../test/utils'
import { PlaceholderCardGrid, type PlaceholderSlot } from '../PlaceholderCardGrid'

describe('PlaceholderCardGrid', () => {
  const slots: PlaceholderSlot[] = [
    { reqId: 'OPNL-01', title: 'Health', dataNoun: 'health data' },
    { reqId: 'OPNL-02', title: 'KPIs', dataNoun: 'KPI data' },
  ]

  it('renders one Card per slot with reqId kicker, title, and EmptyState', () => {
    const { getByText, getAllByRole } = render(<PlaceholderCardGrid slots={slots} />)
    expect(getByText('OPNL-01')).toBeInTheDocument()
    expect(getByText('Health')).toBeInTheDocument()
    expect(getByText('OPNL-02')).toBeInTheDocument()
    expect(getByText('KPIs')).toBeInTheDocument()
    // Both EmptyState bodies present with their dataNoun substituted into the
    // UI-SPEC default template "Once {data-noun} arrives it will appear here…".
    expect(getByText(/Once health data arrives/)).toBeInTheDocument()
    expect(getByText(/Once KPI data arrives/)).toBeInTheDocument()
    // Card root renders as <article> for landmark accessibility — one per slot.
    expect(getAllByRole('article')).toHaveLength(2)
  })

  it('renders empty grid for empty slots array', () => {
    const { container } = render(<PlaceholderCardGrid slots={[]} />)
    const grid = container.querySelector('.cmc-card-grid')
    expect(grid).toBeInTheDocument()
    expect(grid?.children).toHaveLength(0)
  })

  it('uses cmc-label class on the kicker so JetBrains Mono uppercase styling applies', () => {
    const { getByText } = render(<PlaceholderCardGrid slots={slots} />)
    const kicker = getByText('OPNL-01')
    expect(kicker.classList.contains('cmc-label')).toBe(true)
  })
})
