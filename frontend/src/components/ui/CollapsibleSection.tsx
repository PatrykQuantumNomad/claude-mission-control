// CollapsibleSection — UI-SPEC FESH-03. Wraps Radix Collapsible with framer-motion
// height-auto animation (220ms ease-out per Motion Contract) and persists open
// state under cmc.collapsible.{id} via lib/storage.
//
// Lazy-init from storage avoids a render-pass mismatch (initial state read once).
// useEffect writes back on every toggle — happy-dom's localStorage is in-memory
// and setup.ts clears it afterEach so tests are deterministic (Pitfall 8).
//
// Collapsible.Content forceMount asChild lets framer-motion own mount/unmount
// lifecycle — without forceMount, Radix removes content before the exit animation
// can run.

import * as Collapsible from '@radix-ui/react-collapsible'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState, ReactNode } from 'react'
import { storage } from '../../lib/storage'

interface CollapsibleSectionProps {
  /** localStorage key suffix — persisted under `cmc.collapsible.{id}`. */
  id: string
  title: string
  defaultOpen?: boolean
  children: ReactNode
}

export function CollapsibleSection({
  id,
  title,
  defaultOpen = true,
  children,
}: CollapsibleSectionProps) {
  const storageKey = `collapsible.${id}`
  const [open, setOpen] = useState<boolean>(() => {
    const persisted = storage.get<boolean>(storageKey)
    return persisted === null ? defaultOpen : persisted
  })

  useEffect(() => {
    storage.set(storageKey, open)
  }, [storageKey, open])

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="cmc-collapsible">
      <Collapsible.Trigger className="cmc-collapsible__trigger" type="button">
        <span className="cmc-collapsible__title">{title}</span>
        <span
          className="cmc-collapsible__chevron"
          aria-hidden
          data-state={open ? 'open' : 'closed'}
        >
          {/* Inline ChevronDown — keeps the primitive free of unnecessary lucide-react import.
              Rotation handled in CSS via [data-state="closed"]. */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </Collapsible.Trigger>
      <AnimatePresence initial={false}>
        {open && (
          <Collapsible.Content forceMount asChild>
            <motion.div
              key="cmc-collapsible-content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              style={{ overflow: 'hidden' }}
              className="cmc-collapsible__content"
            >
              {children}
            </motion.div>
          </Collapsible.Content>
        )}
      </AnimatePresence>
    </Collapsible.Root>
  )
}
