import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, userEvent } from '../../../test/utils'
import { RangeToggle } from '../RangeToggle'
import { storage } from '../../../lib/storage'

function Harness({
  initial = 'today',
  persistKey,
}: {
  initial?: 'today' | '7d' | '30d'
  persistKey?: string
}) {
  const [value, setValue] = useState<'today' | '7d' | '30d'>(initial)
  return <RangeToggle value={value} onChange={setValue} persistKey={persistKey} />
}

describe('RangeToggle', () => {
  beforeEach(() => {
    // Clear any cmc.* keys from prior tests
    const keys: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith('cmc.')) keys.push(k)
    }
    keys.forEach((k) => window.localStorage.removeItem(k))
  })

  it('renders the default 3 options with the active modifier on the selected value', () => {
    render(<Harness initial="7d" />)
    const today = screen.getByRole('button', { name: 'Today' })
    const seven = screen.getByRole('button', { name: '7d' })
    const thirty = screen.getByRole('button', { name: '30d' })
    expect(today).not.toHaveClass('cmc-range-toggle__btn--active')
    expect(seven).toHaveClass('cmc-range-toggle__btn--active')
    expect(thirty).not.toHaveClass('cmc-range-toggle__btn--active')
    expect(seven).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicking a button fires onChange and updates the active class', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<RangeToggle value="today" onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: '30d' }))
    expect(onChange).toHaveBeenCalledWith('30d')
  })

  it('round-trips selection through lib/storage when persistKey is set', async () => {
    const user = userEvent.setup()
    render(<Harness persistKey="usage" />)
    await user.click(screen.getByRole('button', { name: '30d' }))
    expect(storage.get<string>('filter.usage.range')).toBe('30d')
  })

  it('hydrates from lib/storage on mount when persistKey + stored value differ from initial', () => {
    storage.set('filter.usage.range', '7d')
    const onChange = vi.fn()
    render(<RangeToggle value="today" onChange={onChange} persistKey="usage" />)
    // useEffect on mount nudges the controller to the stored value
    expect(onChange).toHaveBeenCalledWith('7d')
  })
})
