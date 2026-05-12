---
phase: 25-saved-views-backend-frontend
plan: 07
subsystem: frontend-shell-chrome
tags: [frontend, react, radix-dialog, saved-views, edit-or-fork, vitest, view-07]
requires:
  - "25-05 (frontend data layer — usePatchView hook)"
  - "25-06 (LoadedViewContext + SavedViewMenu + SaveViewDialog + useUrlDivergesFromLoadedView)"
provides:
  - "EditOrForkDialog (Radix Dialog, NOT AlertDialog per Pitfall 4) — 3 mutually exclusive resolutions: save changes (usePatchView), save as new fork (delegates to onFork), discard (navigates back to loaded view's state_json)"
  - "SavedViewMenu Edit affordance — top-of-menu 'Edit \"<loaded view name>\"…' item visible only when loadedView && URL diverges"
  - "Open-action interception — clicking a different view's Open while the current URL is divergent surfaces EditOrForkDialog instead of silently overwriting"
  - "5 new exact-match testids in docs/testid-registry.md (edit-or-fork-dialog, edit-or-fork-dialog-{save,fork,discard}, saved-view-menu-edit-current)"
  - "VIEW-07 satisfied — explicit 3-button choice on every 'edit loaded view' path; AlertDialog primitive untouched"
affects:
  - "Plan 11 (close-gate Playwright + axe sweep) — demo flow is 'load a view → change a filter → menu → Edit → exercise each branch'"
tech-stack:
  added: []
  patterns:
    - "Radix Dialog for free-form 3-button choosers (Pitfall 4 — AlertDialog is locked at 2 buttons by Phase 24; extending it would break the destructive-confirmation contract for every other surface)"
    - "Three-way dialog action row via .cmc-dialog__actions--three-way CSS modifier (two secondaries on the left margin: auto, primary on the right)"
    - "Caller-controlled fork delegation — EditOrForkDialog is the chooser, SaveViewDialog is the form; the dialog invokes onFork prop and lets SavedViewMenu open SaveViewDialog with fork={loadedView}"
    - "Open-action interception in SavedViewMenu — when loadedView && urlDiverges && v.id !== loadedView.id, open EditOrForkDialog instead of navigate"
    - "Real QueryClient + URL-routed fetch stub for PATCH /api/views/:id (no vi.mock on lib/queries) — production hook + real cache invalidation paths exercise"
key-files:
  created:
    - "frontend/src/components/savedviews/EditOrForkDialog.tsx (~135 lines)"
    - "frontend/src/components/savedviews/__tests__/EditOrForkDialog.test.tsx (~280 lines, 5 specs)"
  modified:
    - "frontend/src/components/savedviews/SavedViewMenu.tsx (+38 / -0 lines — Edit affordance + interception + mount)"
    - "frontend/src/styles.css (+10 lines — .cmc-dialog__actions--three-way modifier)"
    - "docs/testid-registry.md (+6 lines — 5 new exact-match testids in Phase 25 section)"
decisions:
  - "EditOrForkDialog is a NEW Radix Dialog component, NOT an extension of AlertDialog (Pitfall 4). AlertDialog is locked at 2 buttons by Phase 24 (POLI-12); extending it to 3 buttons would break the destructive-confirmation contract for every other surface. The user-observable behavior matches VIEW-07's REQUIREMENTS text — the deviation is purely at the component-primitive layer."
  - "EditOrForkDialog is the chooser, SaveViewDialog is the form. Fork branch delegates via onFork prop — SavedViewMenu opens SaveViewDialog in fork mode with the loaded view as source (Plan 06's SUMMARY explicitly noted this seam)."
  - "Discard navigates back to loadedView.state_json (NOT to route defaults). This restores the loaded view's URL state precisely. Behaviorally indistinguishable from 'reopen the loaded view from the menu', but observable through the URL directly."
  - "Open-action interception is opt-in: clicking a different view's Open while the URL is divergent re-prompts; clicking the SAME loaded view's Open (or any view when nothing is loaded, or any view when the URL matches) navigates normally. The dialog is purely additive — no existing path is rerouted unnecessarily."
  - "v1 has NO pending-navigation chaining. After picking Discard, the user re-clicks the target view's Open. Chaining (auto-Open the pending view after Discard resolves) is a Phase 26+ nicety — the v1 micro-UX is documented in the Branch Behavior table below so Plan 11 can pin it in Playwright."
  - "handleSaveChanges uses state_json REPLACEMENT (NOT deep-merge) — matches the backend SavedViewUpdate PATCH contract (Plan 02 decision). schema_version is sent as 1 explicitly so the backend doesn't see a 'unchanged schema_version' edge case."
  - "Escape / overlay click closes the dialog as a no-op (symmetric with SaveViewDialog). The user can still cancel by escaping; the next destructive action will re-prompt. This is intentional — pressing Escape is NOT an implicit 'discard' or 'save'."
metrics:
  duration: "~4 min (3 atomic commits + SUMMARY)"
  completed: "2026-05-12"
  vitest: "420 → 425 (+5; target was >=4 covering each branch + 2 guards)"
  tasks: 3
  files_created: 2
  files_modified: 3
---

# Phase 25 Plan 07: EditOrForkDialog (VIEW-07) Summary

**One-liner:** Shipped `EditOrForkDialog` — a 3-button Radix Dialog (Save changes / Save as new fork / Discard) surfaced from `SavedViewMenu` whenever the user has a loaded saved view AND the URL has diverged. No silent overwrite path remains; each of the 3 branches has a distinct, observable side effect, regression-pinned by 5 vitest specs.

## Performance

- **Duration:** ~4 min (3 atomic commits + SUMMARY)
- **Completed:** 2026-05-12T15:12:46Z
- **Tasks:** 3 (all auto, no checkpoints)
- **Files created:** 2
- **Files modified:** 3

## Branch Behavior Table

This is the canonical reference for Plan 11 Playwright + axe sweep. Each row is one of the 3 user-observable resolutions; the side effects are mutually exclusive.

| Branch                         | testid                          | Mutation                                 | Navigation                                       | Loaded-view slot                | Dialog state |
| ------------------------------ | ------------------------------- | ---------------------------------------- | ------------------------------------------------ | ------------------------------- | ------------ |
| **Save changes**               | `edit-or-fork-dialog-save`      | `usePatchView({state_json, schema_version: 1})` | none (URL already reflects user's changes)     | `setLoadedView(updated)`        | closes on success |
| **Save as new (fork)**         | `edit-or-fork-dialog-fork`      | none (delegated)                         | none (caller opens SaveViewDialog in fork mode) | unchanged (delegated to SaveViewDialog onSuccess) | closes immediately |
| **Discard changes**            | `edit-or-fork-dialog-discard`   | none                                     | `navigate({to: pathname, search: loadedView.state_json})` — restores loaded view's URL | unchanged                       | closes immediately |
| **Escape / overlay click**     | (no testid — no-op exit)        | none                                     | none                                             | unchanged                       | closes immediately |

**Invariants enforced by tests:**
- Save branch issues exactly one PATCH; fork + discard branches issue ZERO PATCH calls.
- Fork branch invokes `onFork` exactly once.
- Discard branch's resulting `router.state.location.search.range` equals the loaded view's state_json.range.
- No branch silently overwrites without user input — escape/overlay close is a no-op exit.

## Pending-Navigation Chaining (v1 micro-UX)

**Decision:** NOT implemented in v1. After picking Discard, the user re-clicks the target view's Open. The dialog is a pure chooser — it does NOT remember which "different view" the user was trying to open when SavedViewMenu intercepted them.

**Rationale:** Pending-navigation chaining adds two reducer-like states (`pendingOpenView` + an effect that auto-opens after Discard resolves) for a micro-UX gain. The plan's `<action>` block explicitly flagged this as a Phase 26+ nicety; documenting v1's no-chain behavior is the honest path.

**Plan 11 hint:** the demo flow is "load A → change `?range=` → open menu → Edit → exercise each branch". When testing the interception path (open a different view while diverged), expect the dialog to surface and then a second Open click after Discard to complete the navigation.

## Accomplishments

- **EditOrForkDialog.tsx** — Radix Dialog with 3 explicit buttons (Save changes / Save as new fork / Discard). Mirrors SaveViewDialog's import shape and testid registration discipline. Uses `useNavigate` + `useRouterState` + `usePatchView` directly (no intermediate adapters). The save-button label dynamically reads `Save changes to "<loadedView.name>"` so the user can confirm which view they're patching.
- **SavedViewMenu.tsx integration** — three additions:
  1. New top-of-menu item `saved-view-menu-edit-current` ("Edit '<loaded view name>'…") renders only when `loadedView && useUrlDivergesFromLoadedView()`.
  2. EditOrForkDialog mounted alongside SaveViewDialog at the bottom of the JSX. `onFork` invokes `openSaveDialog(loadedView)` — reuses Plan 06's SaveViewDialog fork-mode seam.
  3. `handleOpen` guards: if `loadedView && urlDiverges && v.id !== loadedView.id`, intercept and open EditOrForkDialog instead of silently navigating. (Same-view re-clicks pass through unchanged.)
- **5 vitest specs** — covers all 3 branches + 2 guards (no-loaded-view, 3-button render). Pattern matches UnsavedPip.test.tsx (PrimeLoadedView helper) + SaveViewDialog.test.tsx (URL-routed fetch stub with real QueryClient).
- **CSS modifier** — `.cmc-dialog__actions--three-way` (10 lines in styles.css) — `justify-content: space-between` + `:first-child { margin-right: auto }` produces the two-secondaries-on-left, primary-on-right layout.
- **5 new testids registered** in docs/testid-registry.md under the Phase 25 section: `edit-or-fork-dialog`, `edit-or-fork-dialog-save`, `edit-or-fork-dialog-fork`, `edit-or-fork-dialog-discard`, `saved-view-menu-edit-current`. ESLint `cmc/testid-registry-only` passes.

## Task Commits

1. **Task 1: EditOrForkDialog component + testid registry + CSS** — `1e195f0` (feat)
2. **Task 2: Wire EditOrForkDialog into SavedViewMenu** — `2c558ac` (feat)
3. **Task 3: Vitest coverage for EditOrForkDialog (5 specs)** — `c9cfae2` (test)

## Files Created/Modified

### Created
- `frontend/src/components/savedviews/EditOrForkDialog.tsx` — Radix Dialog with 3 mutually exclusive resolutions
- `frontend/src/components/savedviews/__tests__/EditOrForkDialog.test.tsx` — 5 specs covering all 3 branches + 2 guards

### Modified
- `frontend/src/components/savedviews/SavedViewMenu.tsx` — Edit affordance + EditOrForkDialog mount + Open-action interception
- `frontend/src/styles.css` — `.cmc-dialog__actions--three-way` modifier (10 lines)
- `docs/testid-registry.md` — 5 new exact-match testids in Phase 25 section

## Decisions Made

1. **Radix Dialog, NOT AlertDialog** (frontmatter `decisions[0]`). VIEW-07's REQUIREMENTS text says "AlertDialog"; per Pitfall 4 (25-RESEARCH.md), `AlertDialog.tsx` is locked at 2 buttons by Phase 24's POLI-12 invariant. Extending it would break the destructive-confirmation contract for every other surface (delete-view, delete-skill, evacuate-emergency-stop). The user-observable behavior — a 3-button blocking prompt with no silent overwrite — is identical to what REQUIREMENTS describes. The deviation is purely at the component-primitive layer.

2. **EditOrForkDialog is the chooser, SaveViewDialog is the form**. Plan 06 already supports `SaveViewDialog` in fork mode via the `fork` prop. EditOrForkDialog's "Save as new (fork)" branch is a pure delegation: invoke `onFork()` and let the caller (SavedViewMenu) open SaveViewDialog with `fork={loadedView}`. No duplication, no parallel form state.

3. **Discard navigates back to `loadedView.state_json`** (NOT to route defaults). This restores the loaded view's URL state precisely. Behaviorally indistinguishable from "reopen the loaded view from the menu", but observable through the URL — the spec for the discard branch directly asserts `router.state.location.search.range` equals the loaded view's `state_json.range`.

4. **Open-action interception is opt-in via tri-condition guard**: `if (loadedView && urlDiverges && v.id !== loadedView.id)`. Same-view re-clicks pass through. The dialog is purely additive — no existing path is rerouted unnecessarily. When `loadedView === null` (fresh tab) or `!urlDiverges` (clean loaded view), the menu behaves exactly as in Plan 06.

5. **No pending-navigation chaining in v1**. After picking Discard, the user re-clicks the target view's Open. Chaining is a Phase 26+ nicety; the v1 micro-UX is honest and the Branch Behavior table makes Plan 11's Playwright assertions unambiguous.

6. **state_json REPLACEMENT semantics** for the Save branch (matches Plan 02's backend SavedViewUpdate contract — PATCH replaces the JSON wholesale, NOT deep-merge). `schema_version: 1` is sent explicitly so the backend doesn't see a "unchanged schema_version" edge case.

7. **Escape / overlay click is a no-op exit** (symmetric with SaveViewDialog). The user can still cancel by escaping; the next destructive action will re-prompt. Pressing Escape is NOT an implicit Discard or Save — this preserves user intent integrity.

## Deviations from Plan

None — plan executed exactly as written.

- The plan's `<action>` block for Task 1 is reproduced near-verbatim in `EditOrForkDialog.tsx` (with comment expansion for context — the JSX is identical).
- The plan's `<action>` block for Task 2 specified each edit (state add, top-of-menu item, dialog mount, handleOpen guard); all four landed exactly as written.
- The plan's `<action>` block for Task 3 specified 5 spec cases; all 5 are present and passing on first run. No flaky-test iteration was needed — the PrimeLoadedView + URL-routed fetch stub pattern from Plan 06 transfers cleanly.
- The "no pending-navigation chaining" decision was already documented in the plan; I noted it explicitly in the SUMMARY's Branch Behavior table for Plan 11.

## Authentication Gates

None.

## Issues Encountered

None — every gate (`tsc`, `lint`, `vitest`, `build`) passed cleanly on each task commit. Test suite went from 420 → 425 (+5) on first vitest run; no flakes.

## Where to Look First (Plan 11 hint)

The demo flow for the close-gate Playwright + axe sweep:

1. **Setup:** boot `cmc start`; ensure a saved view exists on `/skills/<name>` (use the menu's "Save current view…" to create one if missing).
2. **Load + diverge:** Click the view in the menu (loads it). Change `?range=` in the address bar.
3. **Surface the dialog:** Open the menu — the "Edit '<view name>'…" item appears at the top (`saved-view-menu-edit-current`). Click it. `edit-or-fork-dialog` renders.
4. **Exercise each branch:**
   - **Discard:** click `edit-or-fork-dialog-discard`. URL reverts to the loaded view's state_json. `unsaved-pip` disappears.
   - **Save as new (fork):** click `edit-or-fork-dialog-fork`. EditOrForkDialog closes. SaveViewDialog opens with the name pre-filled `"<view name> (copy)"`. After save, both views exist in the menu.
   - **Save changes:** click `edit-or-fork-dialog-save`. Loaded view's state_json is updated server-side. `unsaved-pip` disappears immediately. Reloading the page shows the URL persists (round-trips through the backend).
5. **Interception path:** load view A, change a filter, open the menu, click view B's Open. EditOrForkDialog surfaces (instead of silently navigating). After picking Discard, click view B's Open again to complete the navigation. (v1 has NO pending-navigation chaining — documented above.)
6. **axe-core sweep on the open dialog** — POLI-10 gate; expect zero blocking violations.

## happy-dom-deferred Assertions (handed to Plan 11)

The vitest specs cover behavior; the following are explicitly deferred to Plan 11's Playwright sweep (matches Plan 06's pattern):

- **3-button visual layout** — assert the two-secondaries-on-left, primary-on-right via real `getComputedStyle` (happy-dom returns empty for many flex properties).
- **Focus management** — Radix promises focus-return-to-trigger; happy-dom shifts focus differently than real browsers.
- **Dialog overlay z-stack** — verify the overlay is above the menu's DropdownMenu portal during the brief moment the menu hasn't yet auto-closed.
- **axe-core a11y sweep** — POLI-10 gate; full sweep on the open dialog targeted at Plan 11.

## Known Stubs

None. Every JSX path in this plan is wired to real data:
- `usePatchView()` for the Save branch (real mutation, real cache invalidation).
- `onFork` prop delegates to `SavedViewMenu`'s real `openSaveDialog(loadedView)` (which opens the real `SaveViewDialog` in fork mode).
- `navigate` for the Discard branch (real TanStack Router navigation).
- `setLoadedView(updated)` after successful PATCH so the menu trigger label and `UnsavedPip` reflect the latest state immediately.

## Threat Flags

None — no new network endpoints (uses existing PATCH /api/views/:id from Plan 02), no auth paths, no schema changes at trust boundaries. Frontend chrome only.

## Self-Check: PASSED

**Files exist:**
- `frontend/src/components/savedviews/EditOrForkDialog.tsx` — FOUND
- `frontend/src/components/savedviews/__tests__/EditOrForkDialog.test.tsx` — FOUND
- `frontend/src/components/savedviews/SavedViewMenu.tsx` (modified — Edit affordance + interception + mount) — FOUND
- `frontend/src/styles.css` (modified — `.cmc-dialog__actions--three-way`) — FOUND
- `docs/testid-registry.md` (modified — 5 new testids) — FOUND

**Commits exist:**
- `1e195f0` — feat(25-07): add EditOrForkDialog Radix Dialog + register testids
- `2c558ac` — feat(25-07): wire EditOrForkDialog into SavedViewMenu
- `c9cfae2` — test(25-07): vitest coverage for EditOrForkDialog (5 specs)

**Verification:**
- `pnpm tsc --noEmit` — clean
- `pnpm lint` — clean (cmc/testid-registry-only passes; all 5 new testids registered)
- `pnpm test --run` — 425 passing / 0 failed / 0 skipped (was 420; +5 specs)
- `pnpm build` — clean (344ms)

---
*Phase: 25-saved-views-backend-frontend*
*Plan: 07 (EditOrForkDialog — VIEW-07)*
*Completed: 2026-05-12*
