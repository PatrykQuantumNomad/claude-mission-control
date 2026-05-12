// SaveViewDialog — Phase 25 Plan 06 Task 1 stub.
//
// Real Radix Dialog body ships in Task 2. This stub exists so SavedViewMenu
// (Task 1) compiles cleanly. The signature is final — Task 2 fills in the
// JSX form + useCreateView submission flow.

import type { ReactElement } from 'react'
import type { SavedView } from '../../lib/api'

export interface SaveViewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When non-null, the dialog is in FORK mode — submitting creates a new
   * view starting from the source view's name + description. */
  fork: SavedView | null
  /** Normalized route id (e.g. `/skills/$name`) supplied by the caller. */
  currentRoute: string
}

export function SaveViewDialog(_props: SaveViewDialogProps): ReactElement | null {
  // Intentional no-op until Task 2 lands. Returning null keeps the AppShell
  // mount inert and avoids surfacing partial UI.
  return null
}
