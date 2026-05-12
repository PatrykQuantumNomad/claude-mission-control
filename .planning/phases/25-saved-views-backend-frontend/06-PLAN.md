---
phase: 25-saved-views-backend-frontend
plan: 06
type: execute
wave: 4
depends_on: ["03", "04", "05"]
files_modified:
  - frontend/src/components/savedviews/SavedViewMenu.tsx
  - frontend/src/components/savedviews/SaveViewDialog.tsx
  - frontend/src/components/savedviews/UnsavedPip.tsx
  - frontend/src/components/savedviews/LoadedViewContext.tsx
  - frontend/src/components/savedviews/__tests__/SavedViewMenu.test.tsx
  - frontend/src/components/savedviews/__tests__/SaveViewDialog.test.tsx
  - frontend/src/components/savedviews/__tests__/UnsavedPip.test.tsx
  - frontend/src/components/shell/AppShellHeader.tsx
  - docs/testid-registry.md
autonomous: true

must_haves:
  truths:
    - "SavedViewMenu mounts in place of the save-view-button placeholder in AppShellHeader"
    - "Menu lists current-route's views; Open / Set-as-default / Edit / Fork / Delete / Pin / Unpin actions present"
    - "SaveViewDialog opens from a menu item; captures current useSearch() into state_json on submit; calls useCreateView()"
    - "UnsavedPip is visible the moment loaded view's state_json diverges from current URL search (per VIEW-08)"
    - "LoadedViewContext exposes the currently-loaded view id + body to chrome consumers (menu trigger label, pip, edit dialog)"
    - "All new testids registered in docs/testid-registry.md before commit; ESLint cmc/testid-registry-only passes"
  artifacts:
    - path: "frontend/src/components/savedviews/SavedViewMenu.tsx"
      provides: "DropdownMenu trigger + items; per-route filter via useSavedViews(currentRoute)"
      contains: "DropdownMenu"
    - path: "frontend/src/components/savedviews/SaveViewDialog.tsx"
      provides: "Radix Dialog with name + description form; submits via useCreateView()"
      contains: "Dialog.Root"
    - path: "frontend/src/components/savedviews/UnsavedPip.tsx"
      provides: "Visual badge shown when current search diverges from loaded view"
      contains: "stableStringify"
    - path: "frontend/src/components/savedviews/LoadedViewContext.tsx"
      provides: "React context exposing loaded view id + body + setters"
      contains: "LoadedViewContext"
    - path: "docs/testid-registry.md"
      provides: "New testids registered: saved-view-menu-trigger, saved-view-item-<id>, save-view-dialog-*, unsaved-pip, etc."
      contains: "saved-view-menu-trigger"
  key_links:
    - from: "frontend/src/components/shell/AppShellHeader.tsx"
      to: "frontend/src/components/savedviews/SavedViewMenu.tsx + UnsavedPip.tsx"
      via: "JSX mount replacing the save-view-button placeholder"
      pattern: "SavedViewMenu|UnsavedPip"
    - from: "frontend/src/components/savedviews/SavedViewMenu.tsx"
      to: "frontend/src/lib/queries.ts (useSavedViews) + frontend/src/components/savedviews/LoadedViewContext.tsx"
      via: "hook + context consumption"
      pattern: "useSavedViews|useLoadedView"
    - from: "frontend/src/components/savedviews/SaveViewDialog.tsx"
      to: "frontend/src/lib/queries.ts (useCreateView)"
      via: "mutation"
      pattern: "useCreateView"
---

<objective>
Mount the saved-view chrome in the existing AppShellHeader placeholder (VIEW-04, VIEW-05, VIEW-08). This plan ships the visible artifacts the user interacts with first — the dropdown menu, the save dialog, and the unsaved-changes pip. EditOrForkDialog ships in Plan 07.

Purpose: Replace the inert `data-testid="save-view-button"` placeholder at `AppShellHeader.tsx:44-51` with a real Radix DropdownMenu that lists the current route's saved views, plus a Save dialog and an unsaved-changes badge.
Output: User can open the menu, see views for the current route, click "Save view…", see the dialog, name a view, save it (POST /api/views), and watch the pip light up when they modify a loaded view.
</objective>

<execution_context>
@/Users/patrykattc/.claude/get-shit-done/workflows/execute-plan.md
@/Users/patrykattc/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/25-saved-views-backend-frontend/25-RESEARCH.md
@.planning/phases/25-saved-views-backend-frontend/25-05-SUMMARY.md

# Reference patterns — mirror line-for-line
@frontend/src/components/shell/DensityToggle.tsx
@frontend/src/components/shell/AppShellHeader.tsx
@frontend/src/components/ui/AlertDialog.tsx
@frontend/src/components/ui/Sheet.tsx
@frontend/src/lib/storage.ts

# Locks:
@docs/testid-registry.md
@docs/z-index-ladder.md
@docs/affordance-checklist.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create LoadedViewContext + SavedViewMenu + register testids</name>
  <files>frontend/src/components/savedviews/LoadedViewContext.tsx, frontend/src/components/savedviews/SavedViewMenu.tsx, docs/testid-registry.md</files>
  <action>
**File A — `LoadedViewContext.tsx`**: a small React context exposing the currently-loaded saved view + setter. Used by SavedViewMenu (trigger label), UnsavedPip, and Plan 07's EditOrForkDialog.

```typescript
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { SavedView } from '../../lib/api'

type LoadedViewContextValue = {
  loadedView: SavedView | null
  setLoadedView: (v: SavedView | null) => void
}

const Context = createContext<LoadedViewContextValue | null>(null)

export function LoadedViewProvider({ children }: { children: ReactNode }) {
  const [loadedView, setLoadedView] = useState<SavedView | null>(null)
  const value = useMemo(() => ({ loadedView, setLoadedView }), [loadedView])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useLoadedView(): LoadedViewContextValue {
  const ctx = useContext(Context)
  if (!ctx) throw new Error('useLoadedView must be used within LoadedViewProvider')
  return ctx
}
```

Wrap this provider in `AppShell.tsx` (or equivalent root mount — find the existing context provider stack and add `LoadedViewProvider` ABOVE `AppShellHeader`).

**File B — `SavedViewMenu.tsx`**: a Radix DropdownMenu wrapped around a Bookmark icon trigger. Mirror DensityToggle.tsx:43-77 line-for-line for the wrapper boilerplate.

```typescript
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Bookmark, BookmarkCheck, Pin, PinOff, Plus, Pencil, Trash2, Star } from 'lucide-react'
import { useRouterState, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useSavedViews, useDeleteView } from '../../lib/queries'
import { getDefaultViewId, setDefaultViewId, getPinnedIds, pinView, unpinView } from '../../lib/savedViews'
import { useLoadedView } from './LoadedViewContext'
import { SaveViewDialog } from './SaveViewDialog'

export function SavedViewMenu() {
  const navigate = useNavigate()
  const location = useRouterState({ select: (s) => s.location })
  const currentRoute = normalizeRouteId(location.pathname)
  const { data, isLoading } = useSavedViews(currentRoute)
  const { loadedView, setLoadedView } = useLoadedView()
  const deleteMutation = useDeleteView()
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [forkMode, setForkMode] = useState(false)

  // Trigger label: loaded view name OR "Views"
  const triggerLabel = loadedView?.name ?? 'Views'
  const defaultId = getDefaultViewId(currentRoute)
  const pinned = new Set(getPinnedIds())

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="cmc-saved-view-menu__trigger"
            data-testid="saved-view-menu-trigger"
            aria-label="Saved views"
          >
            <Bookmark size={16} aria-hidden />
            <span>{triggerLabel}</span>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="cmc-dropdown"
            sideOffset={6}
            align="end"
            data-testid="saved-view-menu-content"
          >
            <DropdownMenu.Item
              className="cmc-dropdown__item"
              data-testid="saved-view-menu-save-new"
              onSelect={() => { setForkMode(false); setSaveDialogOpen(true) }}
            >
              <Plus size={14} aria-hidden /> Save current view…
            </DropdownMenu.Item>

            {data && data.items.length > 0 && <DropdownMenu.Separator className="cmc-dropdown__sep" />}

            {isLoading && <div className="cmc-dropdown__empty">Loading…</div>}
            {data && data.items.length === 0 && !isLoading && (
              <div className="cmc-dropdown__empty">No saved views for this route</div>
            )}

            {data?.items.map((v) => (
              <DropdownMenu.Sub key={v.id}>
                <DropdownMenu.SubTrigger
                  className="cmc-dropdown__item"
                  data-testid={`saved-view-item-${v.id}`}
                >
                  {v.id === defaultId && <Star size={12} aria-hidden />}
                  {v.name}
                </DropdownMenu.SubTrigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.SubContent className="cmc-dropdown">
                    <DropdownMenu.Item
                      className="cmc-dropdown__item"
                      data-testid={`saved-view-open-${v.id}`}
                      onSelect={() => {
                        navigate({ to: location.pathname, search: v.state_json as Record<string, unknown> })
                        setLoadedView(v)
                      }}
                    >
                      Open
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="cmc-dropdown__item"
                      data-testid={`saved-view-set-default-${v.id}`}
                      onSelect={() => setDefaultViewId(currentRoute, v.id)}
                    >
                      Set as default
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="cmc-dropdown__item"
                      data-testid={`saved-view-pin-${v.id}`}
                      onSelect={() => pinned.has(v.id) ? unpinView(v.id) : pinView(v.id)}
                    >
                      {pinned.has(v.id) ? <><PinOff size={12} aria-hidden /> Unpin</> : <><Pin size={12} aria-hidden /> Pin</>}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="cmc-dropdown__item"
                      data-testid={`saved-view-fork-${v.id}`}
                      onSelect={() => { setForkMode(true); setSaveDialogOpen(true) }}
                    >
                      <Pencil size={12} aria-hidden /> Save as new (fork)
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="cmc-dropdown__item cmc-dropdown__item--danger"
                      data-testid={`saved-view-delete-${v.id}`}
                      onSelect={() => deleteMutation.mutate(v.id)}
                    >
                      <Trash2 size={12} aria-hidden /> Delete
                    </DropdownMenu.Item>
                  </DropdownMenu.SubContent>
                </DropdownMenu.Portal>
              </DropdownMenu.Sub>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <SaveViewDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        fork={forkMode ? loadedView : null}
        currentRoute={currentRoute}
      />
    </>
  )
}

/** Normalize a TanStack pathname like /skills/foo to a route id like /skills/$name. */
function normalizeRouteId(pathname: string): string {
  // Heuristic for v1: only /skills/<name> currently uses a dynamic param.
  // Wave 2 routes are static.
  if (pathname.startsWith('/skills/')) return '/skills/$name'
  return pathname || '/'
}
```

NOTE: the exact `normalizeRouteId` should match the route identifiers that backend `route` column values use. Align with Plan 02's API contract (the backend stores whatever string the frontend POSTs as `route`). Decision: frontend uses TanStack's route ID format (e.g. `/skills/$name`), NOT the resolved pathname (`/skills/foo`). Document this in the SUMMARY.

**File C — `docs/testid-registry.md`**: register every NEW testid introduced above. Read the file first to understand the registry workflow at `docs/testid-registry.md:84-95`. Add the following entries under the appropriate section (likely a new "Saved Views" subsection):

Exact-match testids:
- `saved-view-menu-trigger` — SavedViewMenu Bookmark trigger in AppShellHeader
- `saved-view-menu-content` — DropdownMenu.Content for the menu
- `saved-view-menu-save-new` — top-of-menu "Save current view…" item
- `unsaved-pip` — UnsavedPip badge (Task 3)
- `save-view-dialog` — SaveViewDialog Content (Task 2)
- `save-view-dialog-name-input` — name input
- `save-view-dialog-description-input` — description input
- `save-view-dialog-submit` — submit button
- `save-view-dialog-cancel` — cancel button

Dynamic-pattern testids (placeholder syntax — match the existing `prefix-{x}-suffix` convention used by the cmc/testid-registry-only ESLint rule):
- `saved-view-item-{id}` — per-view submenu trigger
- `saved-view-open-{id}` — Open action item
- `saved-view-set-default-{id}` — Set-as-default item
- `saved-view-pin-{id}` — Pin/Unpin item
- `saved-view-fork-{id}` — Save as new (fork) item
- `saved-view-delete-{id}` — Delete item

Remove the `save-view-button` placeholder entry once Task 1 of Plan 06 (this task) actually replaces it in the JSX — that comes in Task 3.

IMPORTANT:
- Match the existing markdown table / list shape in the registry. Read the file first.
- The `cmc/testid-registry-only` ESLint rule reads this file as source-of-truth at module init — if a testid is missing here, the lint fails the build (locked invariant per Phase 24 plan-06 SUMMARY).
  </action>
  <verify>
`cd frontend && pnpm tsc --noEmit` clean. `cd frontend && pnpm lint` exits 0 (all new testids registered). `pnpm test --run` still green (no tests broken yet; Task 4 will add coverage).
  </verify>
  <done>
LoadedViewContext + SavedViewMenu exist; both compile; all new testids registered in docs/testid-registry.md; ESLint clean.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create SaveViewDialog (Radix Dialog form)</name>
  <files>frontend/src/components/savedviews/SaveViewDialog.tsx</files>
  <action>
Create `SaveViewDialog.tsx` — a Radix Dialog wrapping a simple form (name + description). On submit, captures the current URL search via `useRouterState` and calls `useCreateView()`.

```typescript
import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { useCreateView, usePatchView } from '../../lib/queries'
import { useLoadedView } from './LoadedViewContext'
import type { SavedView } from '../../lib/api'

type SaveViewDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * When non-null, this dialog is in FORK mode — submitting creates a new view
   * with the source view's state_json as a starting point but the user supplies
   * a fresh name. Used by the menu's "Save as new" action and by Plan 07's
   * EditOrForkDialog.
   */
  fork: SavedView | null
  currentRoute: string
}

export function SaveViewDialog({ open, onOpenChange, fork, currentRoute }: SaveViewDialogProps) {
  const search = useRouterState({ select: (s) => s.location.search })
  const createMutation = useCreateView()
  const { setLoadedView } = useLoadedView()
  const [name, setName] = useState(fork ? `${fork.name} (copy)` : '')
  const [description, setDescription] = useState(fork?.description ?? '')

  // Reset form when the dialog opens — picks up the latest fork target's defaults
  if (open && name === '' && fork) setName(`${fork.name} (copy)`)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim().length === 0) return
    try {
      const created = await createMutation.mutateAsync({
        name: name.trim(),
        description: description.trim(),
        route: currentRoute,
        state_json: search as Record<string, unknown>,
        schema_version: 1,
      })
      setLoadedView(created)
      setName('')
      setDescription('')
      onOpenChange(false)
    } catch (err) {
      // Error is surfaced via createMutation.error; rendered inline below.
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="cmc-dialog__overlay" />
        <Dialog.Content
          className="cmc-dialog"
          data-testid="save-view-dialog"
          aria-describedby="save-view-dialog-desc"
        >
          <Dialog.Title>{fork ? 'Save as new view' : 'Save current view'}</Dialog.Title>
          <Dialog.Description id="save-view-dialog-desc">
            {fork
              ? `Forking from "${fork.name}". The new view will start with the current URL filters.`
              : 'Save the current URL filters as a named view for this route.'}
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
                <button type="button" className="cmc-btn" data-testid="save-view-dialog-cancel">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                className="cmc-btn cmc-btn--primary"
                data-testid="save-view-dialog-submit"
                disabled={createMutation.isPending || name.trim().length === 0}
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
```

IMPORTANT:
- Use Radix `Dialog`, NOT `AlertDialog` (per Research Pitfall 4 + §State of the Art row 2 — `AlertDialog.tsx` is 2-button only and the save form needs free-form layout).
- Existing `.cmc-dialog` styles must exist or be added in `styles.css`. Check `styles.css` for `.cmc-dialog__overlay` / `.cmc-dialog` / `.cmc-dialog__actions` / `.cmc-field` / `.cmc-field__error` rules. If any are missing, add them mirroring the existing `.cmc-alertdialog` styles already verified in Phase 24.
- The dialog reads `useRouterState({ select: s => s.location.search })` to capture the URL. This is the validated search (post-`validateSearch`), so it already has `schemaVersion: 1`.
- `route` is passed in via prop — caller (`SavedViewMenu`) provides the normalized route id.
- Form clears on successful submit AND sets the new view as `loadedView` — VIEW-08 pip is immediately accurate.
- `aria-describedby` is required for axe-core a11y gate.
  </action>
  <verify>
`pnpm tsc --noEmit` clean. `pnpm lint` clean (testids registered). The dialog renders in dev without console errors when triggered from the menu.
  </verify>
  <done>
SaveViewDialog importable; opens/closes via Radix; submits via useCreateView; sets loadedView on success.
  </done>
</task>

<task type="auto">
  <name>Task 3: Create UnsavedPip + replace placeholder in AppShellHeader</name>
  <files>frontend/src/components/savedviews/UnsavedPip.tsx, frontend/src/components/shell/AppShellHeader.tsx</files>
  <action>
**File A — `UnsavedPip.tsx`**: a tiny badge component that compares the current URL search against the loaded view's `state_json` and renders a visible dot when they differ (VIEW-08).

```typescript
import { useMemo } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { useLoadedView } from './LoadedViewContext'

/**
 * Returns true when current URL state diverges from the loaded saved view.
 * Strips schemaVersion before comparing (Pitfall 7 — version field is metadata,
 * not user-meaningful state).
 */
function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj) ?? 'null'
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`
  const o = obj as Record<string, unknown>
  const keys = Object.keys(o).filter((k) => k !== 'schemaVersion').sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`
}

export function useUrlDivergesFromLoadedView(): boolean {
  const { loadedView } = useLoadedView()
  const search = useRouterState({ select: (s) => s.location.search })
  return useMemo(() => {
    if (!loadedView) return false
    return stableStringify(search) !== stableStringify(loadedView.state_json)
  }, [search, loadedView])
}

export function UnsavedPip() {
  const diverged = useUrlDivergesFromLoadedView()
  if (!diverged) return null
  return (
    <span
      className="cmc-unsaved-pip"
      data-testid="unsaved-pip"
      role="status"
      aria-label="Unsaved changes to the loaded saved view"
      title="Unsaved changes"
    />
  )
}
```

Add CSS in `styles.css` for `.cmc-unsaved-pip` — a small (6-8px) dot with the warning-orange color from the existing token palette. Mirror an existing badge rule for size/position parity.

**File B — `AppShellHeader.tsx`**: replace the placeholder at lines 44-51 with the real components. Read the current file first to see surrounding JSX.

Current placeholder (to delete):

```tsx
<button
  type="button"
  className="cmc-shell__header-action"
  data-testid="save-view-button"
  disabled
  style={{ display: 'none' }}
  aria-label="Save view (Phase 25 placeholder)"
/>
```

Replace with:

```tsx
import { SavedViewMenu } from '../savedviews/SavedViewMenu'
import { UnsavedPip } from '../savedviews/UnsavedPip'

// inside the action area, in the same JSX slot the placeholder occupied:
<div className="cmc-shell__header-savedview" data-testid="saved-view-chrome">
  <SavedViewMenu />
  <UnsavedPip />
</div>
```

Also update `docs/testid-registry.md`:
- Remove the `save-view-button` Placeholder entry (or change its status from `Placeholder` to `Removed (Phase 25)` per the registry convention).
- Add `saved-view-chrome` as an exact-match testid for the wrapper.

IMPORTANT:
- The placeholder was `display: none` — replacing it with a visible component is the entire user-facing payload of Wave 3.
- AppShellHeader is consumed in `__root.tsx` → `AppShell.tsx`. Ensure `LoadedViewProvider` (from Task 1) wraps the header AND any consumer of `useLoadedView`. The natural mount point is at the AppShell level, ABOVE both Sidebar and AppShellHeader, because the EditOrForkDialog (Plan 07) and Plan 09's Sidebar Pinned section also read `useLoadedView`.
- Do NOT delete the `save-view-button` registry entry literally — change its status. Future audits may look for it. The Phase 24 plan-04 SUMMARY notes this lock pattern.
  </action>
  <verify>
`pnpm tsc --noEmit` clean. `pnpm lint` clean. Manual smoke: open `/` in `pnpm dev`, see the SavedViewMenu Bookmark icon in the header (no longer `display: none`). Click it, see the dropdown menu open. No pip (no loaded view yet).
  </verify>
  <done>
AppShellHeader mounts SavedViewMenu + UnsavedPip; placeholder removed; LoadedViewProvider wraps consumers; visible menu trigger replaces the invisible placeholder; lint + tsc clean; testid registry updated.
  </done>
</task>

<task type="auto">
  <name>Task 4: Vitest coverage for SavedViewMenu + SaveViewDialog + UnsavedPip</name>
  <files>frontend/src/components/savedviews/__tests__/SavedViewMenu.test.tsx, frontend/src/components/savedviews/__tests__/SaveViewDialog.test.tsx, frontend/src/components/savedviews/__tests__/UnsavedPip.test.tsx</files>
  <action>
Create three vitest specs mirroring the existing `frontend/src/components/shell/__tests__/DensityToggle.test.tsx` shape (testing-library + Radix Portal interaction). Read that file first.

**SavedViewMenu.test.tsx** (≥4 cases):
- Renders trigger with default label "Views" when no loaded view.
- Opens dropdown on trigger click; lists views from mocked `useSavedViews`.
- Empty state renders "No saved views for this route" when items is `[]`.
- Clicking "Save current view…" opens the SaveViewDialog (assert by data-testid="save-view-dialog" presence).

**SaveViewDialog.test.tsx** (≥4 cases):
- Renders title "Save current view" when not in fork mode.
- Renders title "Save as new view" when fork prop is provided.
- Submit button is disabled when name is empty.
- Submitting calls the mocked `useCreateView` mutation with the current search + entered name.

**UnsavedPip.test.tsx** (≥4 cases):
- Renders nothing when no loaded view (`useLoadedView` returns `loadedView: null`).
- Renders nothing when loaded view's state_json equals current URL search.
- Renders pip when loaded view's state_json differs from current URL search.
- Strips schemaVersion before comparison — a view with `{schemaVersion: 1, range: '7d'}` vs URL `{schemaVersion: 2, range: '7d'}` reads as NOT diverged.

All three tests use `vi.mock('../../../lib/queries')` + `vi.mock('@tanstack/react-router')` (the routerState/navigate hooks need stubs). Match the EXACT mock pattern from `DensityToggle.test.tsx` or another shell-component vitest spec.

IMPORTANT:
- Wrap each test's `render(...)` with a fresh `LoadedViewProvider` so the context is available.
- The Portal renders outside the test root — use `screen.getByTestId(...)` (not `within(container).getByTestId`) for items inside Radix Portals.
- happy-dom (vitest's dom env) limitations on Radix Portal + computed styles are documented in Phase 24 plan-02 SUMMARY — if a test that relies on portal-DOM-presence fails, defer the assertion to Plan 11's Playwright e2e.
  </action>
  <verify>
`pnpm test --run src/components/savedviews/__tests__` — all ~12+ cases pass. Full vitest matrix still green.
  </verify>
  <done>
3 vitest files; ~12 new cases all passing.
  </done>
</task>

</tasks>

<verification>
1. `cd frontend && pnpm tsc --noEmit` clean.
2. `cd frontend && pnpm test --run` — full vitest green; count up by ~12.
3. `cd frontend && pnpm lint` clean (every new testid registered).
4. `cd frontend && pnpm build` succeeds.
5. Manual smoke (with `cmc start` running):
   - Open `/skills/<any-name>` in browser.
   - Click the SavedViewMenu trigger — menu opens with "Save current view…" + empty-state.
   - Click "Save current view…" — dialog opens.
   - Enter "test view" + submit — dialog closes; menu re-opens; "test view" appears in the list (proves create + invalidate cache).
   - Change `?range=` via address bar — UnsavedPip lights up (orange dot appears next to the menu).
   - Click "test view" → "Open" submenu item — pip disappears (URL state == loaded view).
6. axe-core via Playwright (deferred to Plan 11 full sweep) — no new violations introduced by the chrome.
</verification>

<success_criteria>
- AppShellHeader's `save-view-button` placeholder is GONE; a real SavedViewMenu + UnsavedPip mount in its place.
- User can save a view via the dialog; the new view appears in the menu immediately (proves cache invalidation from Plan 05).
- UnsavedPip lights up the moment URL state diverges from the loaded view.
- All new testids registered in docs/testid-registry.md; lint clean.
- Plan 07 can layer EditOrForkDialog on top of LoadedViewContext.
- Plan 09 (Sidebar Pinned) can use useLoadedView for active-state highlighting.
</success_criteria>

<output>
After completion, create `.planning/phases/25-saved-views-backend-frontend/25-06-SUMMARY.md` documenting:
- LoadedViewContext mount location (AppShell or higher)
- Route-normalization choice (TanStack route id `/skills/$name` vs resolved `/skills/foo`)
- Testid registry additions
- Any happy-dom-deferred assertions handed to Plan 11
- Hint for Plan 07: EditOrForkDialog consumes the same LoadedViewContext + SaveViewDialog (in fork mode) for the "fork" branch
</output>
