// EditOrForkDialog — Phase 25 Plan 07 (VIEW-07).
//
// 3-button Radix Dialog surfaced when the user has a loaded saved view, the
// URL has diverged from that view's state_json, and the user asks to "Edit" or
// triggers any path that would otherwise silently overwrite. The three
// resolutions are mutually exclusive — there is NO silent overwrite path:
//
//   1. Save changes        → usePatchView({ state_json: currentSearch, … });
//                            updates the loaded view's row in place.
//   2. Save as new (fork)  → onFork() prop is invoked; the caller
//                            (SavedViewMenu) opens SaveViewDialog in fork
//                            mode so the user can name the new row.
//   3. Discard changes     → navigate({ to: pathname, search: loaded.state_json })
//                            restores the loaded view's URL state exactly.
//
// Pitfall 4 (25-RESEARCH.md): this is a Radix Dialog, NOT AlertDialog. The
// AlertDialog primitive is locked at 2 buttons by Phase 24 (POLI-12);
// extending it to 3 buttons would break that contract for every other
// destructive-confirmation surface. The Plan 06 SaveViewDialog uses the same
// Radix Dialog shape — this file mirrors it (no form body, just 3 buttons).
//
// User-observable behavior matches VIEW-07's REQUIREMENTS text: a blocking
// prompt with 3 explicit choices on any edit-loaded-view path. The deviation
// is purely at the component-primitive layer.
//
// Escape / overlay click closes the dialog WITHOUT acting — this is the
// no-op exit, intentional and symmetric with SaveViewDialog. The user can
// still cancel by escaping; the next destructive action will re-prompt.

import * as Dialog from '@radix-ui/react-dialog'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { usePatchView } from '../../lib/queries'
import { useLoadedView } from './LoadedViewContext'

export interface EditOrForkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Invoked when the user picks "Save as new (fork)". The caller is
   * responsible for opening SaveViewDialog in fork mode with the loaded
   * view as the source — this dialog is the chooser, not the form.
   */
  onFork: () => void
  /** Path the loaded view lives on — used for the discard navigation. */
  currentPathname: string
}

export function EditOrForkDialog({
  open,
  onOpenChange,
  onFork,
  currentPathname,
}: EditOrForkDialogProps): ReactElement | null {
  const { loadedView, setLoadedView } = useLoadedView()
  const search = useRouterState({ select: (s) => s.location.search })
  const navigate = useNavigate()
  const patchMutation = usePatchView()

  // No loaded view → nothing to edit/fork against. The caller should also
  // gate on this, but the guard here keeps the component self-defensive.
  if (!loadedView) return null

  const handleSaveChanges = async () => {
    try {
      const updated = await patchMutation.mutateAsync({
        id: loadedView.id,
        patch: {
          state_json: search as Record<string, unknown>,
          schema_version: 1,
        },
      })
      setLoadedView(updated)
      onOpenChange(false)
    } catch {
      // error surfaces inline below via patchMutation.error; user can retry.
    }
  }

  const handleSaveAsFork = () => {
    onOpenChange(false)
    onFork()
  }

  const handleDiscard = () => {
    navigate({
      to: currentPathname,
      search: loadedView.state_json as Record<string, unknown>,
    })
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="cmc-dialog__overlay" />
        <Dialog.Content
          className="cmc-dialog"
          data-testid="edit-or-fork-dialog"
          aria-describedby="edit-or-fork-dialog-desc"
        >
          <Dialog.Title>Unsaved changes</Dialog.Title>
          <Dialog.Description id="edit-or-fork-dialog-desc">
            You've changed filters on the loaded view{' '}
            <strong>"{loadedView.name}"</strong>. What would you like to do?
          </Dialog.Description>

          {patchMutation.error && (
            <p className="cmc-field__error" role="alert">
              {(patchMutation.error as Error).message}
            </p>
          )}

          <div className="cmc-dialog__actions cmc-dialog__actions--three-way">
            <button
              type="button"
              className="cmc-btn"
              data-testid="edit-or-fork-dialog-discard"
              onClick={handleDiscard}
              disabled={patchMutation.isPending}
            >
              Discard changes
            </button>
            <button
              type="button"
              className="cmc-btn"
              data-testid="edit-or-fork-dialog-fork"
              onClick={handleSaveAsFork}
              disabled={patchMutation.isPending}
            >
              Save as new (fork)
            </button>
            <button
              type="button"
              className="cmc-btn cmc-btn--primary"
              data-testid="edit-or-fork-dialog-save"
              onClick={handleSaveChanges}
              disabled={patchMutation.isPending}
            >
              {patchMutation.isPending
                ? 'Saving…'
                : `Save changes to "${loadedView.name}"`}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
