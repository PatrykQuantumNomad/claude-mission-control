// SaveViewDialog — Phase 25 Plan 06 (VIEW-05).
//
// Radix Dialog (NOT AlertDialog — AlertDialog is the 2-button destructive
// confirmation pattern; this dialog hosts a free-form name + description
// form, so Dialog is the correct primitive — Pitfall 4 in 25-RESEARCH.md).
//
// Behaviour:
//   - In create mode (fork === null) the title reads "Save current view" and
//     submitting POSTs a fresh row with the current URL search as state_json.
//   - In fork mode the title reads "Save as new view"; the form pre-fills
//     name with "{source.name} (copy)" and description with source.description.
//     Submitting STILL creates a new row (route is the caller-supplied
//     currentRoute; state_json is the live URL search, NOT the source's
//     state_json — forking captures the user's current divergence). Plan 07's
//     EditOrForkDialog will reuse this in fork mode for the "Save as new"
//     branch of its prompt.
//   - On success, setLoadedView() points to the new row so the
//     SavedViewMenu trigger label and UnsavedPip both reflect it immediately.
//
// state_json source: useRouterState({ select: s => s.location.search }) reads
// the POST-validateSearch search object — schemaVersion: 1 is already present
// because Plan 03 wired the named validateSearch exports through every
// chrome-eligible route. Backend keeps state_json opaque; the route's
// validateSearch on read coerces it back at next Open.
//
// a11y: aria-describedby is required for axe-core (POLI-10 gate); the
// Dialog.Description carries the contextual instruction.

import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { useRouterState } from '@tanstack/react-router'
import type { SavedView } from '../../lib/api'
import { useCreateView } from '../../lib/queries'
import { useLoadedView } from './LoadedViewContext'

export interface SaveViewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When non-null, the dialog is in FORK mode — submitting creates a new
   * view starting from the source view's name + description. */
  fork: SavedView | null
  /** Normalized route id (e.g. `/skills/$name`) supplied by the caller. */
  currentRoute: string
}

export function SaveViewDialog({
  open,
  onOpenChange,
  fork,
  currentRoute,
}: SaveViewDialogProps): ReactElement {
  const search = useRouterState({ select: (s) => s.location.search })
  const createMutation = useCreateView()
  const { setLoadedView } = useLoadedView()
  const [name, setName] = useState<string>('')
  const [description, setDescription] = useState<string>('')

  // Re-seed form fields whenever the dialog opens (or the fork target flips).
  // Effect-driven (NOT a render-time read) so React 19 StrictMode doesn't
  // warn about mid-render state updates. The fork target changes when the
  // user picks a different "Save as new (fork)" submenu item.
  useEffect(() => {
    if (open) {
      setName(fork ? `${fork.name} (copy)` : '')
      setDescription(fork?.description ?? '')
    }
  }, [open, fork])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    if (trimmedName.length === 0) return
    try {
      const created = await createMutation.mutateAsync({
        name: trimmedName,
        description: description.trim(),
        route: currentRoute,
        state_json: search as Record<string, unknown>,
        schema_version: 1,
      })
      setLoadedView(created)
      onOpenChange(false)
    } catch {
      // createMutation.error surfaces the message inline below; no rethrow.
    }
  }

  const title = fork ? 'Save as new view' : 'Save current view'
  const description_text = fork
    ? `Forking from "${fork.name}". The new view will start with the current URL filters.`
    : 'Save the current URL filters as a named view for this route.'

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="cmc-dialog__overlay" />
        <Dialog.Content
          className="cmc-dialog"
          data-testid="save-view-dialog"
          aria-describedby="save-view-dialog-desc"
        >
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description id="save-view-dialog-desc">
            {description_text}
          </Dialog.Description>

          <form onSubmit={handleSubmit}>
            <label className="cmc-field">
              <span>Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="save-view-dialog-name-input"
                required
                maxLength={200}
                autoFocus
              />
            </label>
            <label className="cmc-field">
              <span>Description (optional)</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                data-testid="save-view-dialog-description-input"
                maxLength={500}
                rows={3}
              />
            </label>

            {createMutation.error && (
              <p className="cmc-field__error" role="alert">
                {(createMutation.error as Error).message}
              </p>
            )}

            <div className="cmc-dialog__actions">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="cmc-btn"
                  data-testid="save-view-dialog-cancel"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                className="cmc-btn cmc-btn--primary"
                data-testid="save-view-dialog-submit"
                disabled={
                  createMutation.isPending || name.trim().length === 0
                }
              >
                {createMutation.isPending ? 'Saving…' : 'Save view'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
