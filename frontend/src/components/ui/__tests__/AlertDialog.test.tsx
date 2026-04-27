import { describe, it, expect, vi } from 'vitest'
import { render } from '../../../test/utils'
import { fireEvent } from '@testing-library/react'
import { AlertDialog } from '../AlertDialog'

describe('AlertDialog', () => {
  it('does not render content when open=false', () => {
    render(
      <AlertDialog
        open={false}
        onOpenChange={() => {}}
        title="Confirm delete"
        description="This cannot be undone"
        actionLabel="Delete"
        onAction={() => {}}
      />,
    )
    // Radix portals to body — query body directly
    const dialogs = document.body.querySelectorAll('[role="alertdialog"]')
    expect(dialogs.length).toBe(0)
  })

  it('renders title + description when open=true with proper aria wiring', () => {
    render(
      <AlertDialog
        open
        onOpenChange={() => {}}
        title="Confirm delete"
        description="This cannot be undone"
        actionLabel="Delete"
        onAction={() => {}}
      />,
    )
    const dialogs = document.body.querySelectorAll('[role="alertdialog"]')
    expect(dialogs.length).toBe(1)
    const dialog = dialogs[0]
    expect(dialog).toHaveAttribute('aria-labelledby')
    expect(dialog).toHaveAttribute('aria-describedby')
    // Title + description text present in body
    expect(document.body.textContent).toContain('Confirm delete')
    expect(document.body.textContent).toContain('This cannot be undone')
  })

  it('clicking the action button invokes onAction', () => {
    const onAction = vi.fn()
    render(
      <AlertDialog
        open
        onOpenChange={() => {}}
        title="Delete X?"
        actionLabel="Delete"
        onAction={onAction}
      />,
    )
    const buttons = Array.from(document.body.querySelectorAll('button'))
    const action = buttons.find((b) => b.textContent === 'Delete')!
    expect(action).toBeDefined()
    fireEvent.click(action)
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('clicking cancel invokes onOpenChange(false)', () => {
    const onOpenChange = vi.fn()
    render(
      <AlertDialog
        open
        onOpenChange={onOpenChange}
        title="Delete X?"
        actionLabel="Delete"
        onAction={() => {}}
      />,
    )
    const buttons = Array.from(document.body.querySelectorAll('button'))
    const cancel = buttons.find((b) => b.textContent === 'Cancel')!
    expect(cancel).toBeDefined()
    fireEvent.click(cancel)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
