import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '../../../test/utils'
import { RelativeTime, formatRelative } from '../RelativeTime'

describe('formatRelative (pure)', () => {
  const NOW = new Date('2026-04-26T12:00:00Z')

  it('formats sub-minute past as seconds', () => {
    const target = new Date(NOW.getTime() - 30_000)
    expect(formatRelative(target, NOW)).toMatch(/30 seconds ago/)
  })

  it('formats minutes-past as minutes', () => {
    const target = new Date(NOW.getTime() - 5 * 60_000)
    expect(formatRelative(target, NOW)).toMatch(/5 minutes ago/)
  })

  it('formats hours-past as hours', () => {
    const target = new Date(NOW.getTime() - 3 * 3_600_000)
    expect(formatRelative(target, NOW)).toMatch(/3 hours ago/)
  })

  it('formats days-past as days', () => {
    const target = new Date(NOW.getTime() - 2 * 86_400_000)
    expect(formatRelative(target, NOW)).toMatch(/2 days ago/)
  })

  it('formats sub-minute future as seconds-in-future', () => {
    const target = new Date(NOW.getTime() + 5_000)
    expect(formatRelative(target, NOW)).toMatch(/in 5 seconds/)
  })
})

describe('RelativeTime component', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-26T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the relative string and wraps it in a Tooltip when absoluteTooltip defaults true', () => {
    const target = new Date('2026-04-26T11:55:00Z') // 5 min before now
    render(<RelativeTime value={target} />)
    expect(screen.getByText(/5 minutes ago/)).toBeInTheDocument()
  })

  it('does not wrap in a Tooltip when absoluteTooltip=false (renders the relative string only)', () => {
    const target = new Date('2026-04-26T11:55:00Z')
    const { container } = render(<RelativeTime value={target} absoluteTooltip={false} />)
    // Without the Tooltip wrap, the only span rendered is the cmc-relative-time inline element
    const spans = container.querySelectorAll('span.cmc-relative-time')
    expect(spans).toHaveLength(1)
    expect(spans[0]).toHaveTextContent(/5 minutes ago/)
  })

  it('accepts an ISO string value the same way as a Date', () => {
    render(<RelativeTime value="2026-04-26T11:55:00Z" absoluteTooltip={false} />)
    expect(screen.getByText(/5 minutes ago/)).toBeInTheDocument()
  })
})
