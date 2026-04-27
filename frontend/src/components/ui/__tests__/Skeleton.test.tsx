import { describe, it, expect } from 'vitest'
import { render, screen } from '../../../test/utils'
import { Skeleton } from '../Skeleton'

describe('Skeleton', () => {
  it('renders rect variant by default with cmc-skeleton + cmc-skeleton--rect classes and aria-busy', () => {
    const { container } = render(<Skeleton width={120} height={16} />)
    const el = container.querySelector('.cmc-skeleton')
    expect(el).not.toBeNull()
    expect(el).toHaveClass('cmc-skeleton--rect')
    expect(el).toHaveAttribute('aria-busy')
    expect(el).toHaveAttribute('aria-label', 'Loading')
  })

  it('renders text variant with single line as cmc-skeleton--text', () => {
    const { container } = render(<Skeleton variant="text" />)
    const el = container.querySelector('.cmc-skeleton')
    expect(el).toHaveClass('cmc-skeleton--text')
  })

  it('renders text variant with lines>1 as a wrapped stack with N spans + aria-busy on the wrapper', () => {
    const { container } = render(<Skeleton variant="text" lines={3} />)
    const stack = container.querySelector('.cmc-skeleton-stack')
    expect(stack).not.toBeNull()
    expect(stack).toHaveAttribute('aria-busy')
    expect(stack).toHaveAttribute('aria-label', 'Loading')
    const spans = stack!.querySelectorAll('.cmc-skeleton')
    expect(spans).toHaveLength(3)
  })

  it('renders circle variant', () => {
    const { container } = render(<Skeleton variant="circle" width={32} height={32} />)
    const el = container.querySelector('.cmc-skeleton')
    expect(el).toHaveClass('cmc-skeleton--circle')
  })

  it('exposes a "Loading" announcement queryable by aria-label', () => {
    render(<Skeleton width={80} height={12} />)
    expect(screen.getByLabelText('Loading')).toBeInTheDocument()
  })
})
