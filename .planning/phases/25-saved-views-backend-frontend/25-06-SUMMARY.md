---
phase: 25-saved-views-backend-frontend
plan: 06
subsystem: frontend-shell-chrome
tags: [frontend, react, radix-dialog, radix-dropdown-menu, saved-views, app-shell, vitest]
requires:
  - "25-03 (frontend validateSearch + schemaVersion named exports)"
  - "25-04 (frontend /skills/$name range URL state)"
  - "25-05 (frontend data layer — api verbs + hooks + lib/savedViews.ts)"
provides:
  - "LoadedViewContext + LoadedViewProvider + useLoadedView() — shared loaded-view slot mounted ABOVE Sidebar + AppShellHeader in AppShell.tsx"
  - "SavedViewMenu (Radix DropdownMenu) — replaces the inert save-view-button placeholder; lists current-route views; per-view submenu with Open / Set-as-default / Pin / Unpin / Save-as-new / Delete"
  - "SaveViewDialog (Radix Dialog, NOT AlertDialog) — name + description form; captures useRouterState().location.search as state_json; supports fork mode (pre-fills '{source.name} (copy)')"
  - "UnsavedPip (VIEW-08) — orange dot visible when current URL search diverges from loaded view; stableStringify strips schemaVersion before comparing (Pitfall 7)"
  - "normalizeRouteId() — `/skills/foo` → `/skills/$name` coercion (single site, exported for Plan 07/09/10 reuse)"
  - "useUrlDivergesFromLoadedView() — reusable divergence selector (Plan 07 EditOrForkDialog consumer)"
  - "10 new exact + 6 new dynamic testids in docs/testid-registry.md (saved-view-chrome, saved-view-menu-*, save-view-dialog-*, unsaved-pip, saved-view-{item,open,set-default,pin,fork,delete}-{id})"
affects:
  - "Plan 07 (EditOrForkDialog) — consumes useLoadedView() + reuses SaveViewDialog in fork mode"
  - "Plan 08 (CommandPalette saved-view items) — consumes useLoadedView() to surface 'current view' actions"
  - "Plan 09 (Sidebar Pinned section) — consumes useLoadedView() for active-row highlighting"
  - "Plan 10 (DefaultViewLoader + RecentStateTracker) — mounts as additional children inside LoadedViewProvider in AppShell.tsx"
tech-stack:
  added: []
  patterns:
    - "Radix Dialog for free-form modal forms (NOT AlertDialog — that's the 2-button destructive confirmation primitive) — Pitfall 4 in 25-RESEARCH.md"
    - "stableStringify with schemaVersion strip for divergence detection — schemaVersion is metadata, not user-meaningful state (Pitfall 7)"
    - "LoadedViewContext is React Context (NOT lifted state) — chrome consumers across Sidebar / Header / Dialog tree share via single provider mount in AppShell"
    - "TanStack route id (e.g. /skills/$name) is the canonical saved_views.route value — NOT the resolved pathname. Frontend POSTs route-id strings; backend keeps state_json opaque per locked invariant"
    - "Real QueryClient + URL-routed fetch stub in vitest (no vi.mock on lib/queries) — production hook + cache invalidation paths exercise"
key-files:
  created:
    - "frontend/src/components/savedviews/LoadedViewContext.tsx (~50 lines)"
    - "frontend/src/components/savedviews/SavedViewMenu.tsx (~190 lines)"
    - "frontend/src/components/savedviews/SaveViewDialog.tsx (~150 lines)"
    - "frontend/src/components/savedviews/UnsavedPip.tsx (~65 lines)"
    - "frontend/src/components/savedviews/__tests__/SavedViewMenu.test.tsx (4 specs)"
    - "frontend/src/components/savedviews/__tests__/SaveViewDialog.test.tsx (4 specs)"
    - "frontend/src/components/savedviews/__tests__/UnsavedPip.test.tsx (4 specs)"
  modified:
    - "frontend/src/components/shell/AppShell.tsx (+5 lines: LoadedViewProvider wrapper + docs)"
    - "frontend/src/components/shell/AppShellHeader.tsx (+11 / -8 lines: saved-view-chrome wrapper replaces save-view-button placeholder)"
    - "frontend/src/components/shell/__tests__/AppShellHeader.test.tsx (full rewire — Router + LoadedViewProvider + URL-routed fetch stub; locked-order assertion updated to expect saved-view-chrome between time-picker-trigger and cmdk-trigger)"
    - "frontend/src/styles.css (+110 lines: cmc-saved-view-menu__trigger, cmc-shell__header-savedview, cmc-unsaved-pip, cmc-dialog* + cmc-field*, cmc-dropdown__{sep,empty,item--danger})"
    - "docs/testid-registry.md (+15 lines: 10 exact + 6 dynamic; save-view-button marked 'Removed in Phase 25 Plan 06')"
decisions:
  - "Route normalization: TanStack route id (`/skills/$name`) is the saved_views.route value — NOT the resolved pathname (`/skills/foo`). Backend keeps state_json opaque; the frontend's source of truth for 'which route' is the route id. Wave-2 static routes pass through unchanged."
  - "LoadedViewContext is React Context (single state slot + setter); divergence logic lives in UnsavedPip's stableStringify, not in the context — keeps consumers light."
  - "SaveViewDialog uses Radix Dialog (NOT AlertDialog) — AlertDialog is the 2-button destructive-confirmation primitive; the save form needs free-form layout (Pitfall 4)."
  - "stableStringify strips schemaVersion before comparing — schemaVersion is metadata appended by validateSearch on every URL read, not user-meaningful state (Pitfall 7)."
  - "Test harness uses real QueryClient + URL-routed fetch stub (no vi.mock on lib/queries) — exercises the production hook + cache invalidation paths, mirrors AppShellHeader.test.tsx convention."
  - "AppShellHeader test rewired to provide Router + LoadedViewProvider — the Phase 24 mock harness only needed QueryClient, but Phase 25's saved-view chrome adds useRouterState + useLoadedView requirements."
metrics:
  duration: "~32 min (loaded plan + 4 atomic commits + SUMMARY)"
  completed: "2026-05-12"
  vitest: "408 → 420 (+12; target was >= 12)"
  tasks: 4
  files_created: 7
  files_modified: 5
---

# Phase 25 Plan 06: SavedView Menu + Dialog + Pip (Shell Chrome) Summary

**One-liner:** Saved-view chrome shipped — `SavedViewMenu` (Radix DropdownMenu) + `SaveViewDialog` (Radix Dialog) + `UnsavedPip` (VIEW-08 divergence badge) replace the inert `save-view-button` placeholder in AppShellHeader, all sharing a new `LoadedViewContext` mounted ABOVE Sidebar + Header so Plans 07/08/09/10 can consume the same loaded-view slot.

## Performance

- **Duration:** ~32 min (4 atomic commits + SUMMARY)
- **Completed:** 2026-05-12T15:00:53Z
- **Tasks:** 4 (all auto, no checkpoints)
- **Files created:** 7
- **Files modified:** 5

## Accomplishments

- `LoadedViewContext.tsx` — single React Context shared across the entire shell tree. Mounts in `AppShell.tsx` ABOVE `<Sidebar>` and `<AppShellHeader>` so Plan 07 EditOrForkDialog, Plan 08 CommandPalette, Plan 09 Sidebar Pinned section, and Plan 10 DefaultViewLoader/RecentStateTracker all observe the same `loadedView` slot.
- `SavedViewMenu.tsx` — Radix DropdownMenu with a Bookmark-icon trigger. The trigger label reflects `loadedView?.name ?? 'Views'`. Top-of-menu "Save current view…" opens the dialog. Below the separator, each view from `useSavedViews(currentRoute)` renders as a `DropdownMenu.Sub` with five actions (Open / Set-as-default / Pin/Unpin / Save-as-new / Delete) in a portal-mounted submenu.
- `SaveViewDialog.tsx` — Radix Dialog with name + description form. Submission calls `useCreateView()` with `state_json: useRouterState().location.search` and `route: currentRoute`. On success, `setLoadedView(created)` flips the LoadedViewContext so the menu trigger label and pip both reflect the new view immediately. Fork mode pre-fills `"{source.name} (copy)"` and `source.description` (Plan 07 will reuse this for EditOrForkDialog's fork branch).
- `UnsavedPip.tsx` — tiny orange dot rendered when current URL search diverges from `loadedView.state_json`. Uses a property-sorted `stableStringify` that strips `schemaVersion` before comparing — schemaVersion is metadata appended by validateSearch on every URL read, not user-meaningful state (Pitfall 7).
- `AppShellHeader.tsx` — removed the `display: none` `save-view-button` placeholder; replaced with a `data-testid="saved-view-chrome"` wrapper hosting `<SavedViewMenu /> + <UnsavedPip />`. Locked-order assertion in the AppShellHeader test updated accordingly.

## Export-surface map (for Plan 07/08/09/10 consumers)

```typescript
// Loaded-view context — every saved-view chrome consumer pulls from here.
import {
  LoadedViewProvider,
  useLoadedView,
  type LoadedViewContextValue,
} from '../savedviews/LoadedViewContext'

// Menu + dialog + pip (typically mounted as components, but exported for tests).
import { SavedViewMenu, normalizeRouteId } from '../savedviews/SavedViewMenu'
import { SaveViewDialog, type SaveViewDialogProps } from '../savedviews/SaveViewDialog'
import {
  UnsavedPip,
  useUrlDivergesFromLoadedView,
} from '../savedviews/UnsavedPip'
```

## Task Commits

1. **Task 1: LoadedViewContext + SavedViewMenu + testid registry** — `9beb70d` (feat)
2. **Task 2: SaveViewDialog Radix Dialog body** — `007c47e` (feat)
3. **Task 3: UnsavedPip + AppShellHeader saved-view-chrome wrapper** — `f3b1241` (feat)
4. **Task 4: 12 vitest specs for menu + dialog + pip** — `42500c8` (test)

## Files Created/Modified

### Created
- `frontend/src/components/savedviews/LoadedViewContext.tsx` — Shared React context for loaded saved view
- `frontend/src/components/savedviews/SavedViewMenu.tsx` — Radix DropdownMenu chrome
- `frontend/src/components/savedviews/SaveViewDialog.tsx` — Radix Dialog form for create + fork
- `frontend/src/components/savedviews/UnsavedPip.tsx` — Divergence badge + reusable selector
- `frontend/src/components/savedviews/__tests__/SavedViewMenu.test.tsx` — 4 specs
- `frontend/src/components/savedviews/__tests__/SaveViewDialog.test.tsx` — 4 specs
- `frontend/src/components/savedviews/__tests__/UnsavedPip.test.tsx` — 4 specs

### Modified
- `frontend/src/components/shell/AppShell.tsx` — wrap shell tree in `<LoadedViewProvider>`
- `frontend/src/components/shell/AppShellHeader.tsx` — replace placeholder with saved-view-chrome wrapper
- `frontend/src/components/shell/__tests__/AppShellHeader.test.tsx` — rewire test harness (Router + LoadedViewProvider + URL-routed fetch stub)
- `frontend/src/styles.css` — cmc-saved-view-menu__trigger, cmc-shell__header-savedview, cmc-unsaved-pip, cmc-dialog* + cmc-field* + cmc-dropdown__{sep,empty,item--danger}
- `docs/testid-registry.md` — 10 exact + 6 dynamic testids registered; save-view-button marked Removed

## Decisions Made

1. **Route normalization** (frontmatter `decisions[0]`). `normalizeRouteId('/skills/foo') === '/skills/$name'`. The backend `saved_views.route` column stores whatever string the frontend POSTs; the frontend's single source of truth for "which route am I on" is the TanStack route id, not the resolved pathname. This way a single saved view ("My favorite skill view") matches every `/skills/<name>` visit. Wave-2 static routes pass through unchanged because their pathname IS their route id.

2. **LoadedViewContext is React Context, not lifted state** — same pattern as ActiveSessionContext (CMPR-07). Single state slot + setter, no reducer, no derived state. Divergence logic lives in UnsavedPip's `stableStringify`, not in the context.

3. **SaveViewDialog uses Radix Dialog (NOT AlertDialog)** — Pitfall 4. AlertDialog is the 2-button destructive-confirmation primitive (`role="alertdialog"`, action+cancel only); the save form needs free-form layout (name field + description textarea + variable button states). Reviewed in 25-RESEARCH.md §State-of-the-Art row 2.

4. **stableStringify strips schemaVersion before comparing** — Pitfall 7. `schemaVersion` is metadata appended by validateSearch on every URL read; it's not "user state". A view with `{schemaVersion:1, range:'7d'}` against URL `{schemaVersion:2, range:'7d'}` must read as NOT diverged.

5. **Form seeding via `useEffect`, not render-time** — React 19 StrictMode warns on render-time state updates; `useEffect(() => { if (open) { setName(...); setDescription(...) } }, [open, fork])` keeps fork-prop changes propagating cleanly across dialog opens.

6. **Test harness uses real QueryClient + URL-routed fetch stub** — no `vi.mock` on `lib/queries`. Exercises the production hook + cache invalidation paths. Mirrors AppShellHeader.test.tsx convention.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] SaveViewDialog stub created in Task 1 commit (replaced in Task 2)**
- **Found during:** Task 1
- **Issue:** Plan's Task 1 commits `SavedViewMenu.tsx`, which imports `SaveViewDialog` from a sibling file that the plan creates in Task 2. The Task 1 `<verify>` block runs `pnpm tsc --noEmit` — which would fail on the missing import.
- **Fix:** Created a typed stub `SaveViewDialog.tsx` in Task 1 returning `null`, with the final prop signature already in place. Task 2 then replaced the stub body with the Radix Dialog form. Tsc green on every commit boundary.
- **Files modified:** `frontend/src/components/savedviews/SaveViewDialog.tsx`
- **Verification:** tsc clean on Task 1 commit, tsc clean on Task 2 commit
- **Committed in:** 9beb70d (Task 1) + 007c47e (Task 2)

**2. [Rule 1 — Test adapts to architectural change in this plan] AppShellHeader.test.tsx rewire**
- **Found during:** Task 3
- **Issue:** The existing `AppShellHeader.test.tsx` pinned the Phase-24 behavior of the `save-view-button` placeholder (`display:none`, `disabled`, `aria-label='Save view (coming in Phase 25)'`). Task 3 deletes that JSX node and adds a saved-view-chrome wrapper, but the test would now fail with "save-view-button not found" AND it was missing the Router + LoadedViewProvider that SavedViewMenu requires.
- **Fix:** Rewired the test harness to provide an in-memory TanStack Router + LoadedViewProvider (matches the production wiring); replaced the locked-order assertion to expect `saved-view-chrome` between `time-picker-trigger` and `cmdk-trigger`; added a URL-routed fetch stub that returns empty viewList for `/api/views` and idle emergency_stop for `/api/system_state`; replaced the Phase-25-placeholder-specific assertion with a positive assertion that saved-view-chrome + saved-view-menu-trigger render.
- **Files modified:** `frontend/src/components/shell/__tests__/AppShellHeader.test.tsx`
- **Verification:** All 4 specs pass; full vitest 420/0/0
- **Committed in:** f3b1241 (Task 3)

**3. [Rule 1 — Aligned dialog form-seeding to React 19 StrictMode]**
- **Found during:** Task 2
- **Issue:** Plan's SaveViewDialog had a render-time `if (open && name === '' && fork) setName(...)` block. React 19 StrictMode warns on render-time `setState`.
- **Fix:** Moved the seeding to `useEffect(() => { if (open) { setName(...); setDescription(...) } }, [open, fork])`. Also re-seeds when the fork target flips (e.g. user reopens the dialog from a different "Save as new" submenu item).
- **Files modified:** `frontend/src/components/savedviews/SaveViewDialog.tsx`
- **Verification:** Test "renders title 'Save as new view' + pre-fills '(copy)' name" passes; no console warnings under StrictMode
- **Committed in:** 007c47e (Task 2)

**4. [Rule 2 — Added missing CSS surface] Dialog + field + dropdown extension styles**
- **Found during:** Task 1 (preemptive — verified styles.css for cmc-dialog and friends)
- **Issue:** The plan referenced `.cmc-dialog`, `.cmc-dialog__overlay`, `.cmc-dialog__actions`, `.cmc-field`, `.cmc-field__error`, `.cmc-dropdown__sep`, `.cmc-dropdown__empty`, `.cmc-dropdown__item--danger`, `.cmc-saved-view-menu__trigger`, `.cmc-shell__header-savedview`, `.cmc-unsaved-pip` — only `.cmc-alertdialog*` and base `.cmc-dropdown` existed.
- **Fix:** Added all 11 selectors in a single `/* Phase 25 Plan 06 */` block mirroring the cmc-alertdialog spacing/colors. Pip uses `--cmc-status-orange` with `--cmc-status-yellow` fallback to match the existing token palette.
- **Files modified:** `frontend/src/styles.css`
- **Verification:** `pnpm build` clean (322ms); visual smoke deferred to Plan 11 axe/Playwright sweep
- **Committed in:** 9beb70d (Task 1)

---

**Total deviations:** 4 auto-fixed (1 Rule 3 sequencing, 2 Rule 1 architectural-change follow-ons, 1 Rule 2 missing-CSS surface).
**Impact on plan:** All four deviations were natural consequences of the plan's own intent — none expanded scope. The SaveViewDialog stub in Task 1 was a sequencing concession (plan's verify-on-every-commit gate required the stub); the test rewire was the inevitable other half of Task 3's "delete the placeholder JSX" instruction; the StrictMode fix is non-negotiable for React 19; the CSS surface was implied by the JSX in the plan's `<action>` blocks.

## Issues Encountered

None — every gate (`tsc`, `lint`, `vitest`, `build`) passed cleanly on each task commit.

## happy-dom-deferred Assertions (handed to Plan 11)

Vitest renders Radix Portals into `document.body` and the JSDOM-style happy-dom env can find elements by testid, but cannot reliably assert computed CSS (`getComputedStyle` returns empty in many cases). The following assertions are explicitly deferred to Plan 11's Playwright sweep:

- **Pip visual color** — assert `getComputedStyle(pip).backgroundColor` resolves to the warning-orange token. (Vitest covers the presence + role; Playwright covers the pixel.)
- **DropdownMenu portal anchor + side-offset positioning** — assert the menu opens below-right of the trigger with the 6px offset.
- **Dialog backdrop blur + z-stack** — assert the overlay is above the Sidebar but below any future tooltip.
- **Focus return to trigger on dialog close** — Radix promises this; vitest can't reliably check `document.activeElement` post-close (happy-dom shifts focus differently than real browsers).
- **axe-core a11y sweep on the open menu + open dialog** — POLI-10 Plan 11 full sweep target.

## Hint for Plan 07 (EditOrForkDialog)

- Reuse `SaveViewDialog` directly for the "Save as new (fork)" branch: pass `fork={loadedView}` and let it run.
- For the "Update existing view" branch, you need a `usePatchView` flow. Note `usePatchView` takes `{id, patch}` (NOT `(id, patch)`) — see `frontend/src/lib/queries.ts:1032`.
- The dialog testid `save-view-dialog` is registered exact-match. If EditOrForkDialog needs a distinct testid (e.g. `edit-or-fork-dialog`), add it to `docs/testid-registry.md` first.
- LoadedViewContext exposes `setLoadedView(null)` — call this on "Discard changes" or on delete to clear the menu trigger label back to "Views".

## Known Stubs

None. Every JSX path in this plan is wired to real data — `useSavedViews(currentRoute)` for the menu list, `useCreateView` for the dialog submit, `useDeleteView` for the delete action, `useRouterState` for the divergence comparison, `setDefaultViewId`/`pinView`/`unpinView` from `lib/savedViews.ts` for the localStorage actions.

## Threat Flags

None — no new network endpoints, no auth paths, no schema changes at trust boundaries. The plan adds frontend chrome only; the backend `/api/views` surface was already shipped + validated in Plan 02.

## Self-Check: PASSED

**Files exist:**
- `frontend/src/components/savedviews/LoadedViewContext.tsx` — FOUND ✓
- `frontend/src/components/savedviews/SavedViewMenu.tsx` — FOUND ✓
- `frontend/src/components/savedviews/SaveViewDialog.tsx` — FOUND ✓
- `frontend/src/components/savedviews/UnsavedPip.tsx` — FOUND ✓
- `frontend/src/components/savedviews/__tests__/SavedViewMenu.test.tsx` — FOUND ✓
- `frontend/src/components/savedviews/__tests__/SaveViewDialog.test.tsx` — FOUND ✓
- `frontend/src/components/savedviews/__tests__/UnsavedPip.test.tsx` — FOUND ✓
- `frontend/src/components/shell/AppShell.tsx` (modified — LoadedViewProvider) — FOUND ✓
- `frontend/src/components/shell/AppShellHeader.tsx` (modified — saved-view-chrome) — FOUND ✓

**Commits exist:**
- 9beb70d — feat(25-06): add LoadedViewContext + SavedViewMenu + register testids ✓
- 007c47e — feat(25-06): implement SaveViewDialog Radix Dialog form ✓
- f3b1241 — feat(25-06): mount SavedView chrome in AppShellHeader + add UnsavedPip ✓
- 42500c8 — test(25-06): vitest coverage for SavedViewMenu + SaveViewDialog + UnsavedPip ✓

**Verification:**
- `pnpm tsc --noEmit` — clean
- `pnpm lint` — clean (every new testid registered; cmc/testid-registry-only passes)
- `pnpm test --run` — 420 passing / 0 failed / 0 skipped (was 408; +12 specs)
- `pnpm build` — clean (322ms)

---
*Phase: 25-saved-views-backend-frontend*
*Plan: 06 (SavedView Menu + Dialog + Pip — shell chrome)*
*Completed: 2026-05-12*
