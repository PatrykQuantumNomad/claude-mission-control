// AlertDialog — Phase 7 Plan 01 (Wave 0). Radix wrapper for destructive
// confirmation dialogs (initial consumer: TaskBoard delete, Wave 2). Mirrors
// Sheet.tsx's structure but uses @radix-ui/react-alert-dialog (NOT
// react-dialog) — AlertDialog enforces an action+cancel button pattern and
// applies role="alertdialog" so screen readers announce the entire content
// immediately rather than just the title.
//
// Aria contract (Pitfall 5 — RESEARCH §accessibility):
//   - aria-labelledby is auto-wired via useId() to the Title id
//   - aria-describedby is conditional on a description being passed
//   - Radix portals to document.body so test queries MUST go via
//     document.body.querySelectorAll('[role="alertdialog"]')
//
// CSS classes hook into the styles.css "Phase 7 Wave 0" section
// (.cmc-alertdialog-overlay / .cmc-alertdialog / __title / __desc / __actions).
// actionVariant defaults to 'destructive' — the common case is a delete-confirm.

import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'
import { ReactNode, useId } from 'react'

interface AlertDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  cancelLabel?: string
  actionLabel: string
  actionVariant?: 'destructive' | 'primary'
  onAction: () => void
  /** Optional extra body content rendered between description and action row. */
  children?: ReactNode
}

export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  cancelLabel = 'Cancel',
  actionLabel,
  actionVariant = 'destructive',
  onAction,
  children,
}: AlertDialogProps) {
  const titleId = useId()
  const descId = useId()
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="cmc-alertdialog-overlay" />
        <AlertDialogPrimitive.Content
          className="cmc-alertdialog"
          aria-labelledby={titleId}
          aria-describedby={description ? descId : undefined}
        >
          <AlertDialogPrimitive.Title
            id={titleId}
            className="cmc-alertdialog__title"
          >
            {title}
          </AlertDialogPrimitive.Title>
          {description ? (
            <AlertDialogPrimitive.Description
              id={descId}
              className="cmc-alertdialog__desc"
            >
              {description}
            </AlertDialogPrimitive.Description>
          ) : null}
          {children}
          <div className="cmc-alertdialog__actions">
            <AlertDialogPrimitive.Cancel className="cmc-btn cmc-btn--md cmc-btn--ghost">
              {cancelLabel}
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action
              className={`cmc-btn cmc-btn--md cmc-btn--${actionVariant}`}
              onClick={onAction}
            >
              {actionLabel}
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  )
}
