import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, userEvent, act } from '../../../test/utils'
import { CopyIconButton } from '../CopyIconButton'

// Mock writeText helper — vitest spies are reset per test via afterEach.
function mockClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  return writeText
}

describe('CopyIconButton', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders a button with copy aria-label and the registry data-testid', () => {
    mockClipboard()
    render(<CopyIconButton value="abc-123" />)
    const btn = screen.getByTestId('cell-copy-btn')
    expect(btn).toBeInTheDocument()
    expect(btn.tagName).toBe('BUTTON')
    expect(btn.getAttribute('type')).toBe('button')
    expect(btn.getAttribute('aria-label')?.toLowerCase()).toContain('copy')
  })

  it('writes the value to clipboard on click and invokes onCopy', async () => {
    const writeText = mockClipboard()
    const onCopy = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<CopyIconButton value="session-abcdef-12345" onCopy={onCopy} />)
    await user.click(screen.getByTestId('cell-copy-btn'))
    expect(writeText).toHaveBeenCalledWith('session-abcdef-12345')
    // onCopy fires after the awaited writeText resolves; flush microtasks.
    await act(async () => {
      await Promise.resolve()
    })
    expect(onCopy).toHaveBeenCalledTimes(1)
  })

  it('stops propagation so a wrapping row-click handler does NOT fire', async () => {
    mockClipboard()
    const rowClick = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <div onClick={rowClick} data-testid="row">
        <CopyIconButton value="x" />
      </div>,
    )
    await user.click(screen.getByTestId('cell-copy-btn'))
    expect(rowClick).not.toHaveBeenCalled()
  })

  it('shows the Check icon for ~1200ms after a successful copy, then reverts to Copy', async () => {
    mockClipboard()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<CopyIconButton value="x" />)
    const btn = screen.getByTestId('cell-copy-btn')
    // Pre-click: aria-label is "Copy ..."; data-state defaults to "idle".
    expect(btn.getAttribute('data-state')).toBe('idle')
    await user.click(btn)
    // Flush the awaited writeText resolution so the success-state setter runs.
    await act(async () => {
      await Promise.resolve()
    })
    expect(btn.getAttribute('data-state')).toBe('copied')
    // After 1200ms the timer reverts to idle.
    await act(async () => {
      vi.advanceTimersByTime(1300)
    })
    expect(btn.getAttribute('data-state')).toBe('idle')
  })
})
