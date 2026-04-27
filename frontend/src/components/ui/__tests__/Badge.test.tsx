import { describe, it, expect } from 'vitest'
import { render, screen } from '../../../test/utils'
import { Badge } from '../Badge'

describe('Badge', () => {
  it('renders all five variants with the corresponding cmc-badge--<variant> class + cmc-badge base', () => {
    const variants = ['neutral', 'info', 'success', 'warning', 'danger'] as const
    for (const v of variants) {
      const { unmount } = render(<Badge variant={v}>{v}</Badge>)
      const el = screen.getByText(v)
      expect(el).toHaveClass('cmc-badge', `cmc-badge--${v}`)
      unmount()
    }
  })

  it('defaults to variant=neutral when no variant prop is supplied', () => {
    render(<Badge>plain</Badge>)
    expect(screen.getByText('plain')).toHaveClass('cmc-badge', 'cmc-badge--neutral')
  })
})
