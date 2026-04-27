// Sheet — UI-SPEC FESH-04. Wraps Radix Dialog with framer-motion slide-from-right
// (220ms ease-out per Motion Contract). Locks Dialog.Title for aria-labelledby
// (Radix logs a console error otherwise — RESEARCH note). `description` is optional
// but ties to aria-describedby via Dialog.Description when provided.
//
// Dialog.Portal forceMount + AnimatePresence is the canonical Radix+framer-motion
// combo: without forceMount Radix unmounts the portal before the exit animation
// can run.

import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { ReactNode } from 'react'

interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Required for Radix aria-labelledby — Dialog.Title is non-optional per a11y spec. */
  title: string
  /** Optional description; when present ties to aria-describedby via Dialog.Description. */
  description?: string
  /** v1 only ships right-side per Phase 5 CONTEXT decision. */
  side?: 'right'
  children: ReactNode
}

export function Sheet({ open, onOpenChange, title, description, children }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="cmc-sheet__overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.6 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              aria-describedby={description ? 'cmc-sheet-desc' : undefined}
            >
              <motion.div
                className="cmc-sheet__panel"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
              >
                <header className="cmc-sheet__header">
                  <Dialog.Title className="cmc-sheet__title">{title}</Dialog.Title>
                  {description ? (
                    <Dialog.Description id="cmc-sheet-desc" className="cmc-sheet__description">
                      {description}
                    </Dialog.Description>
                  ) : null}
                </header>
                <div className="cmc-sheet__body">{children}</div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
