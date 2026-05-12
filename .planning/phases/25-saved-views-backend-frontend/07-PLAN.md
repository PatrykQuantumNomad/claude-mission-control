---
phase: 25-saved-views-backend-frontend
plan: 07
type: execute
wave: 5
depends_on: ["05", "06"]
files_modified:
  - frontend/src/components/savedviews/EditOrForkDialog.tsx
  - frontend/src/components/savedviews/SavedViewMenu.tsx
  - frontend/src/components/savedviews/__tests__/EditOrForkDialog.test.tsx
  - docs/testid-registry.md
autonomous: true

must_haves:
  truths:
    - "When user modifies a loaded view (URL diverges) and selects an 'Edit' affordance, EditOrForkDialog opens with 3 explicit choices: save changes / save as fork / discard"
    - "Choosing 'save changes' calls usePatchView({ state_json: currentSearch }) and dismisses the dialog"
    - "Choosing 'save as fork' opens SaveViewDialog in fork mode (preserving Plan 06's component)"
    - "Choosing 'discard' navigates back to the loaded view's state_json (undoes URL changes)"
    - "There is NO silent overwrite — the user must explicitly choose"
    - "Dialog is a Radix Dialog (NOT AlertDialog) — 2-button AlertDialog primitive is preserved untouched"
  artifacts:
    - path: "frontend/src/components/savedviews/EditOrForkDialog.tsx"
      provides: "3-button Radix Dialog: save changes / save as fork / discard"
      contains: "Dialog.Root"
    - path: "frontend/src/components/savedviews/__tests__/EditOrForkDialog.test.tsx"
      provides: "vitest covering each of the 3 branches"
      contains: "EditOrForkDialog"
  key_links:
    - from: "frontend/src/components/savedviews/SavedViewMenu.tsx"
      to: "frontend/src/components/savedviews/EditOrForkDialog.tsx"
      via: "new 'Edit' menu item triggers the 3-way dialog when URL diverges from loaded view"
      pattern: "EditOrForkDialog"
    - from: "frontend/src/components/savedviews/EditOrForkDialog.tsx"
      to: "frontend/src/lib/queries.ts (usePatchView)"
      via: "save-changes branch"
      pattern: "usePatchView"
    - from: "frontend/src/components/savedviews/EditOrForkDialog.tsx"
      to: "frontend/src/components/savedviews/SaveViewDialog.tsx"
      via: "save-as-fork branch reuses Plan 06's dialog in fork mode"
      pattern: "SaveViewDialog"
---

<objective>
Ship VIEW-07's explicit edit-vs-fork prompt. When the user has a loaded saved view, modifies the URL (e.g. changes a filter), and asks to "Edit" or attempts a destructive action, a 3-button dialog must surface — NO silent overwrite.

Per Research Pitfall 4 + §State of the Art, this is a NEW component built on `@radix-ui/react-dialog`, NOT an extension of `AlertDialog.tsx` (which is locked at 2-button). The new component lives in `savedviews/` and reuses Plan 06's `SaveViewDialog` for the "fork" branch.

Purpose: Honor VIEW-07's locked decision — never silently overwrite a saved view; always require explicit user choice.
Output: Visible `EditOrForkDialog` with three primary buttons; wired into SavedViewMenu's "Edit" affordance; user has 3 mutually-exclusive resolutions.

**Component-deviation note:** VIEW-07's REQUIREMENTS text says "AlertDialog"; per Research Pitfall 4, `AlertDialog.tsx` is locked to 2 buttons by Phase 24, so this plan uses Radix `@radix-ui/react-dialog` directly. User-observable behavior (3-button blocking prompt, no silent overwrite) is identical to what REQUIREMENTS describes — the deviation is purely at the component-primitive layer.
</objective>

<execution_context>
@/Users/patrykattc/.claude/get-shit-done/workflows/execute-plan.md
@/Users/patrykattc/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/25-saved-views-backend-frontend/25-RESEARCH.md
@.planning/phases/25-saved-views-backend-frontend/25-06-SUMMARY.md

# Reference patterns
@frontend/src/components/ui/AlertDialog.tsx
@frontend/src/components/savedviews/SaveViewDialog.tsx
@frontend/src/components/savedviews/LoadedViewContext.tsx
@frontend/src/components/savedviews/UnsavedPip.tsx
@frontend/src/lib/queries.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create EditOrForkDialog component</name>
  <files>frontend/src/components/savedviews/EditOrForkDialog.tsx, docs/testid-registry.md</files>
  <action>
Create `frontend/src/components/savedviews/EditOrForkDialog.tsx`. Mirror SaveViewDialog's Radix Dialog import shape; the body is different (no form — just 3 action buttons).

```typescript
import * as Dialog from '@radix-ui/react-dialog'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { usePatchView } from '../../lib/queries'
import { useLoadedView } from './LoadedViewContext'

type EditOrForkDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Caller is responsible for ALSO triggering the SaveViewDialog in fork mode
   * when this dialog's onFork is invoked. This dialog is a chooser only.
   */
  onFork: () => void
  /** Path the loaded view lives on — used for the 'discard' navigation. */
  currentPathname: string
}

export function EditOrForkDialog({ open, onOpenChange, onFork, currentPathname }: EditOrForkDialogProps) {
  const { loadedView, setLoadedView } = useLoadedView()
  const search = useRouterState({ select: (s) => s.location.search })
  const navigate = useNavigate()
  const patchMutation = usePatchView()

  if (!loadedView) return null  // nothing to edit/fork against

  const handleSaveChanges = async () => {
    try {
      const updated = await patchMutation.mutateAsync({
        id: loadedView.id,
        patch: { state_json: search as Record<string, unknown>, schema_version: 1 },
      })
      setLoadedView(updated)
      onOpenChange(false)
    } catch (err) {
      // error stays on the mutation; user can retry
    }
  }

  const handleSaveAsFork = () => {
    onOpenChange(false)
    onFork()  // caller (SavedViewMenu) opens SaveViewDialog with fork=loadedView
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
            You've changed filters on the loaded view <strong>"{loadedView.name}"</strong>. What
            would you like to do?
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
              {patchMutation.isPending ? 'Saving…' : `Save changes to "${loadedView.name}"`}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

Then update `docs/testid-registry.md` to register the new testids:
- `edit-or-fork-dialog`
- `edit-or-fork-dialog-discard`
- `edit-or-fork-dialog-fork`
- `edit-or-fork-dialog-save`

If `.cmc-dialog__actions--three-way` does not exist in `styles.css`, add it — a flex row with the primary button on the right and the two secondaries on the left, gap-spaced. Mirror the existing `.cmc-dialog__actions` shape, just adding the modifier for 3-button layout.

IMPORTANT:
- This is a Radix Dialog, NOT an AlertDialog (Research Pitfall 4 — preserves the 2-button AlertDialog primitive untouched per Plan 02's locked invariant in Phase 24).
- The 3 actions are mutually exclusive — user picks exactly one; no escape-hatch silent overwrites.
- `handleSaveChanges` uses `state_json` REPLACEMENT (not deep-merge) — matches the backend PATCH contract (SavedViewUpdate documented in Plan 02).
- `handleDiscard` navigates back to the loaded view's state_json, NOT to defaults. This restores the loaded view's URL state precisely.
- `handleSaveAsFork` delegates to the parent: SavedViewMenu opens SaveViewDialog in fork mode. EditOrForkDialog is the chooser, not the form.
- The `escape key` / overlay click closes the dialog WITHOUT acting — user can still cancel by escaping. This is intentional (`onOpenChange(false)` is the no-op exit).
  </action>
  <verify>
    <automated>cd frontend && pnpm tsc --noEmit && pnpm lint</automated>
Manual smoke (operator): the dialog renders in isolation (Storybook not used in this repo — verify in dev via the menu wiring in Task 2).
  </verify>
  <done>
EditOrForkDialog importable + renderable; 3 buttons + testids; styles for `--three-way` action layout exist.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire EditOrForkDialog into SavedViewMenu + replace silent overwrite paths</name>
  <files>frontend/src/components/savedviews/SavedViewMenu.tsx</files>
  <action>
Extend `SavedViewMenu.tsx` (created in Plan 06) to:

1. Mount `EditOrForkDialog` alongside `SaveViewDialog`.
2. Add an "Edit current view…" top-of-menu item that opens the dialog WHEN there's a loaded view AND the URL has diverged.
3. Auto-trigger the dialog when the user tries any destructive-or-overwriting action on a loaded view (i.e. opening a DIFFERENT view via the menu while the current URL is diverged from the loaded view — instead of silently navigating, ask first).

Concrete edits:

A. Add state for the edit/fork dialog open flag + the in-flight fork target:

```typescript
const [editOrForkOpen, setEditOrForkOpen] = useState(false)
// `forkMode` already exists from Plan 06's SaveViewDialog wiring.
const urlDiverges = useUrlDivergesFromLoadedView()  // import from UnsavedPip.tsx
```

B. Add a NEW top-of-menu item (above "Save current view…") that only renders when `loadedView && urlDiverges`:

```tsx
{loadedView && urlDiverges && (
  <DropdownMenu.Item
    className="cmc-dropdown__item"
    data-testid="saved-view-menu-edit-current"
    onSelect={() => setEditOrForkOpen(true)}
  >
    <Pencil size={14} aria-hidden /> Edit "{loadedView.name}"…
  </DropdownMenu.Item>
)}
```

Register the new testid `saved-view-menu-edit-current` in `docs/testid-registry.md`.

C. Mount the dialog at the bottom of the component JSX, alongside SaveViewDialog:

```tsx
<EditOrForkDialog
  open={editOrForkOpen}
  onOpenChange={setEditOrForkOpen}
  currentPathname={location.pathname}
  onFork={() => { setForkMode(true); setSaveDialogOpen(true) }}
/>
```

D. Guard the per-view "Open" action — if `loadedView && urlDiverges && targetView.id !== loadedView.id`, intercept and open EditOrForkDialog instead of navigating silently. Track the pending navigation in state:

```typescript
const [pendingOpenView, setPendingOpenView] = useState<SavedView | null>(null)

// In the per-view Open action onSelect:
onSelect={() => {
  if (loadedView && urlDiverges && v.id !== loadedView.id) {
    setPendingOpenView(v)
    setEditOrForkOpen(true)
    return
  }
  navigate({ to: location.pathname, search: v.state_json as Record<string, unknown> })
  setLoadedView(v)
}}
```

Then extend the EditOrForkDialog mount to chain into pending navigation after the user picks a branch. Simplest approach: on Discard, after navigating to `loadedView.state_json`, the next click on the pending view's Open re-applies (no chaining needed for v1 — operator clicks Open again). Document this micro-UX decision in the SUMMARY; chaining is a Phase 26+ nicety.

IMPORTANT:
- The "Edit current view…" menu item only appears when there's both a loaded view AND a URL divergence. When the user is on a clean loaded view, the item is hidden.
- VIEW-07 is SATISFIED the moment a 3-button dialog stands between "unsaved URL state on a loaded view" and "next destructive action". The chaining UX in part (D) is the most natural pattern; documenting v1's no-chain behavior is honest.
- The dialog's `handleSaveChanges` path uses `usePatchView` with `state_json` REPLACEMENT — matches the backend SavedViewUpdate contract.
- Do NOT change SaveViewDialog (Plan 06) — fork mode is already supported via the `fork` prop.
  </action>
  <verify>
    <automated>cd frontend && pnpm tsc --noEmit && pnpm lint</automated>
Manual smoke (operator): load a saved view, change a filter, open the menu, see "Edit '...'..." item; click it, see the 3-button dialog; click "Save changes", see the URL persist into the saved view (verifiable via menu → re-open → URL matches).
  </verify>
  <done>
SavedViewMenu has Edit affordance + interception logic; EditOrForkDialog mounts alongside SaveViewDialog; lint + tsc clean.
  </done>
</task>

<task type="auto">
  <name>Task 3: Vitest coverage for EditOrForkDialog (each branch)</name>
  <files>frontend/src/components/savedviews/__tests__/EditOrForkDialog.test.tsx</files>
  <action>
Create `frontend/src/components/savedviews/__tests__/EditOrForkDialog.test.tsx` mirroring SaveViewDialog.test.tsx (Plan 06) for mocking shape.

Required cases (≥5):
- Renders 3 buttons: discard / fork / save changes.
- Renders nothing when `loadedView` is null.
- Save-changes button calls `usePatchView` with `state_json = currentSearch + schema_version: 1`; closes on success.
- Fork button calls `onFork` prop AND closes the dialog (verify both side-effects).
- Discard button calls `navigate({ to: pathname, search: loadedView.state_json })` AND closes the dialog.

Mock `useNavigate` + `useRouterState` + `usePatchView` + wrap render in `LoadedViewProvider` with a seeded loaded view.

Pattern:

```typescript
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EditOrForkDialog } from '../EditOrForkDialog'
import { LoadedViewProvider } from '../LoadedViewContext'

const mockNavigate = vi.fn()
const mockMutate = vi.fn(() => Promise.resolve({ id: 1, name: 'view', state_json: { x: 1 } }))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useRouterState: () => ({ x: 2 }),  // current search differs from loaded view
}))

vi.mock('../../../lib/queries', () => ({
  usePatchView: () => ({ mutateAsync: mockMutate, isPending: false, error: null }),
}))

// Seed loadedView via wrapper that pre-sets context value.
// Match the existing test pattern for pre-seeded context (see DensityToggle.test.tsx).

describe('EditOrForkDialog', () => {
  it('renders nothing when no loaded view', () => {
    render(<LoadedViewProvider><EditOrForkDialog open={true} onOpenChange={() => {}} onFork={() => {}} currentPathname="/" /></LoadedViewProvider>)
    expect(screen.queryByTestId('edit-or-fork-dialog')).toBeNull()
  })

  // …other cases with a seeded loadedView via a custom wrapper
})
```

If the test framework's mocking of `useRouterState` returning a different object than the loaded view's state_json is tricky, refer to UnsavedPip's test pattern (Plan 06 Task 4) which faces the exact same challenge.

For asserting `mockNavigate.toHaveBeenCalledWith({ to: '/', search: { x: 1 } })` — note the deep-equality semantics in vitest's `toHaveBeenCalledWith`.

IMPORTANT:
- These tests are the regression net for VIEW-07. They prove that NO branch silently overwrites — each branch has a distinct, observable side effect.
- The 4 branches assertions cover: (a) dialog presence, (b) save mutates + closes, (c) fork triggers parent callback + closes, (d) discard navigates + closes.
  </action>
  <verify>
    <automated>cd frontend && pnpm test --run src/components/savedviews/__tests__/EditOrForkDialog.test.tsx</automated>
  </verify>
  <done>
~5 new vitest cases passing; covers all 3 branches + 2 guard cases.
  </done>
</task>

</tasks>

<verification>
1. `cd frontend && pnpm tsc --noEmit` clean.
2. `cd frontend && pnpm test --run` — full vitest green; count up by ~5.
3. `cd frontend && pnpm lint` clean.
4. `cd frontend && pnpm build` succeeds.
5. Manual smoke (with `cmc start` + a seeded saved view on `/skills/<name>`):
   - Load view A by clicking it in the menu.
   - Change `?range=` in the address bar.
   - Open menu — see "Edit '<A's name>'..." appear at the top.
   - Click it — EditOrForkDialog opens.
   - Test each branch:
     - "Discard" → URL reverts to A's state_json; pip clears.
     - "Save as new (fork)" → SaveViewDialog opens with name `(A's name) (copy)`; after save, both A and the fork exist in the menu.
     - "Save changes" → A's state_json is updated server-side; pip clears immediately.
6. Re-load page after each branch — server state matches the intended branch.
</verification>

<success_criteria>
- VIEW-07 satisfied: explicit 3-button choice on every "edit loaded view" path.
- `AlertDialog.tsx` is UNTOUCHED — its 2-button contract is preserved (Phase 24 invariant).
- EditOrForkDialog can be invoked from SavedViewMenu when URL diverges from loaded view.
- Each branch's effect is observable: discard navigates, fork triggers parent, save mutates.
- Plan 11 (close gate) can verify the 3-branch e2e flow.
</success_criteria>

<output>
After completion, create `.planning/phases/25-saved-views-backend-frontend/25-07-SUMMARY.md` documenting:
- Branch behavior table (save/fork/discard → effect)
- Whether pending-navigation chaining was implemented (no/yes; if no, document the v1 micro-UX of "click Open again after discard")
- vitest count delta
- "Where to look first" hint for Plan 11: the demo flow is "load a view → change a filter → menu → Edit → exercise each branch"
</output>
