---
phase: 24-shell-density-containment-primitives
plan: 04
subsystem: ui
tags: [shell, sidebar, app-shell-header, tanstack-router, radix-tooltip, lucide-react, density-provider, vitest, cmd-b, localstorage, navbar-deletion]

# Dependency graph
requires:
  - phase: 24-shell-density-containment-primitives (Plan 01)
    provides: ":root density tokens (--cmc-control-height-sm, --cmc-icon-size-lg, --cmc-row-height-list, --cmc-space-*, --cmc-size-label, --cmc-text-dim, --cmc-text); z-index ladder (--cmc-z-sidebar=20, --cmc-z-header=20, --cmc-z-tooltip=30); .cmc-btn:hover transform mitigation"
  - phase: 24-shell-density-containment-primitives (Plan 02)
    provides: "DensityToggle.tsx mounted in AppShellHeader; DensityProvider.tsx wraps shell content tree under ActiveSessionProvider + TaskComposerProvider"
provides:
  - "Sidebar.tsx — persistent collapsible left sidebar (240px expanded / 52px collapsed) with brand, chrome collapse-toggle, Home top-level, Observe (Activity/SessionsCompare/Skills/Cost), Operate (Alerts), Configure (empty header) sections (SHEL-01, SHEL-04)"
  - "SidebarSection.tsx + SidebarNavLink.tsx primitives — TanStack Router Link wrapped in Radix Tooltip (side=right) when collapsed; activeProps→`cmc-sidebar__navlink--active` className with 3px accent-blue left-edge bar visible in both expanded and collapsed modes (SHEL-03)"
  - "AppShellHeader.tsx — top-bar action area extracted from NavBar (SHEL-02). Right region in locked order: Phase 25/26 hidden placeholders → Cmd+K trigger → DensityToggle → ThemeToggle. EmergencyStopBanner moved to left region."
  - "lib/sidebar.ts — collapsed-state localStorage round-trip (KEY=`cmc.sidebar.collapsed`) + `applySidebar()` boot helper (mirrors lib/density.ts + lib/theme.ts pattern)"
  - "Window-level Cmd+B / Ctrl+B keydown listener with preventDefault (blocks macOS bold marker insertion) — fires even when focus is inside Sheets / textareas / Cmd+K palette"
  - "Pre-registered Phase 25/26 testids: `time-picker-trigger`, `save-view-button` (disabled + display:none placeholders ready for docs/testid-registry.md in Plan 06)"
  - "Shell flex-direction flipped from column to row; `.cmc-shell__column` wraps header + main with `min-width:0` + `min-height:0` ladder"
  - "NavBar.tsx + NavBar.test.tsx DELETED (research-recommended Phase 24 deletion; rollback path is `git revert aa570cf`, NOT dead code)"
  - "9 new vitest specs (5 Sidebar + 4 AppShellHeader) — total baseline 353/353"
affects: [phase-24-plan-05 (Playwright sidebar/density/portal-containment specs consume sidebar-link-* + sidebar-collapse-toggle testids), phase-24-plan-06 (testid-registry.md must register sidebar-link-*, sidebar-collapse-toggle, time-picker-trigger, save-view-button), phase-24-plan-07 (visual-checkpoint matrix), phase-25-saved-views (consumes save-view-button placeholder + AppShellHeader mount point), phase-26-time-picker (consumes time-picker-trigger placeholder + AppShellHeader mount point), phase-26-cmdk (consumes Cmd+K trigger in AppShellHeader)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sidebar collapse pattern: localStorage round-trip via lib/sidebar.ts (mirror of lib/theme.ts + lib/density.ts triad) + pre-mount applySidebar() in main.tsx + dataset.sidebarCollapsed='true|false' on html element + CSS branches `[data-sidebar-collapsed='true'] .cmc-sidebar__*` for the width flip. Same shape as theme/density preferences — any future :root-scoped UX preference clones this triad."
    - "Window-level keyboard shortcut pattern: window.addEventListener('keydown', ...) NOT element-scoped — catches Cmd+B / Cmd+K / future global shortcuts even when focus is inside a Radix Sheet, textarea, or Cmd+K palette. preventDefault() blocks browser-native conflicts (macOS bold marker for Cmd+B)."
    - "Forward-compatible testid placeholders: render disabled + display:none buttons with their Phase 25/26 testids in this plan so the registry (Plan 06) can pre-register them, and adopting phases only need to remove display:none + wire onClick — no testid registration churn at adoption time."
    - "NavBar deletion (research-recommended): rollback path is `git revert <commit>`, NOT dead-code carry. Legacy `.cmc-navbar` / `.cmc-navlink` CSS rules left in place to keep the revert clean."
    - "AppShellHeader right-region locked DOM order: time-picker-trigger → save-view-button → cmdk-trigger → density-toggle → theme-toggle. EmergencyStopBanner in left region. Locked by vitest assertion on child node order so future additions can't silently reorder without updating the test."

key-files:
  created:
    - frontend/src/lib/sidebar.ts
    - frontend/src/components/shell/Sidebar.tsx
    - frontend/src/components/shell/SidebarSection.tsx
    - frontend/src/components/shell/SidebarNavLink.tsx
    - frontend/src/components/shell/AppShellHeader.tsx
    - frontend/src/components/shell/__tests__/Sidebar.test.tsx
    - frontend/src/components/shell/__tests__/AppShellHeader.test.tsx
  modified:
    - frontend/src/components/shell/AppShell.tsx
    - frontend/src/main.tsx
    - frontend/src/styles.css
    - frontend/src/components/shell/__tests__/AppShell.test.tsx
  deleted:
    - frontend/src/components/shell/NavBar.tsx
    - frontend/src/components/shell/__tests__/NavBar.test.tsx

key-decisions:
  - "Sidebar collapse toggle uses Lucide `PanelLeftClose` / `PanelLeftOpen` icon pair (NOT `Menu` / `X`). The pair telegraphs panel-direction intent and matches VS Code's chrome handle convention. Icon swaps based on `collapsed` state."
  - "Sidebar IA is LOCKED AS SHIPPED — Home (top-level above sections) + Observe (Activity, Sessions Compare, Skills, Cost) + Operate (Alerts) + Configure (empty header reserved for future Settings/Doctor). Plan-04 IA matches CONTEXT.md exactly; no deviation."
  - "Window-level Cmd+B listener uses `e.metaKey || e.ctrlKey` (NOT `e.metaKey` alone). Same key chord works on macOS (Cmd+B) and Windows/Linux (Ctrl+B). preventDefault() blocks both browser-bold and the macOS native bold-marker behavior."
  - "Active-route accent bar uses `border-left: 3px solid var(--cmc-accent-blue, #4d7cff)` not `box-shadow inset`. Box-shadow would clip when collapsed; border-left survives the 240px→52px flip because the navlink still has its full padding-left in collapsed mode (CSS just hides the label span)."
  - "Brand `Mission Control` moved from NavBar to top of Sidebar (`.cmc-sidebar__header` + `.cmc-sidebar__brand`). When collapsed, the brand label hides via `[data-sidebar-collapsed='true'] .cmc-sidebar__brand { display: none }` — only the collapse-toggle chevron remains in the sidebar header."
  - "Phase 25/26 placeholders (`time-picker-trigger`, `save-view-button`) ship as disabled + display:none buttons. The disabled attribute prevents accidental keyboard activation; display:none keeps them out of layout. Adopting phases only need to remove display:none and wire onClick — no testid registration churn at adoption time."
  - "NavBar.tsx + NavBar.test.tsx DELETED per Phase 24 research recommendation. Legacy `.cmc-navbar` / `.cmc-navlink` CSS rules intentionally left in styles.css (untouched) so `git revert aa570cf` is a clean rollback path. Plan 06 docs may flag the dead CSS for explicit cleanup."

patterns-established:
  - "Pattern 1: `lib/<pref>.ts` triad — `is<Pref>()` / `set<Pref>(...)` / `apply<Pref>()` mirroring lib/theme.ts + lib/density.ts. Pre-mount apply in main.tsx avoids flash. Any future :root-scoped UX preference (motion=normal|reduced, contrast=normal|high, etc.) clones this exact shape."
  - "Pattern 2: AppShellHeader right-region locked DOM order — pinned by vitest test `right-region children render in locked order` so future additions cannot silently reorder. Adding a new control means updating the test."
  - "Pattern 3: testid placeholder pre-registration — disabled + display:none buttons in this plan, registered in docs/testid-registry.md in Plan 06, adopted (display:none removed) in Phases 25/26. Single-PR Playwright stability."

# Metrics
duration: ~14min
completed: 2026-05-10
---

# Phase 24 Plan 04: Shell Rework Summary

**Replaced the v1.2 top-NavBar with a 240/52px collapsible left Sidebar + extracted AppShellHeader, wired Cmd+B persisted-collapse, mounted DensityProvider into the shell content tree, deleted NavBar.tsx — SHEL-01..04 shipped, 353/353 vitest green.**

## Performance

- **Duration:** ~14 min (3 code tasks + visual checkpoint + metadata)
- **Started:** 2026-05-10T10:11:45Z (commit 93d6c2f)
- **Completed:** 2026-05-10 (metadata commit; checkpoint approved)
- **Tasks:** 3 code + 1 visual checkpoint (approved)
- **Files created:** 7 (5 components/lib + 2 tests)
- **Files modified:** 4 (AppShell, main, styles, AppShell.test)
- **Files deleted:** 2 (NavBar.tsx + NavBar.test.tsx)
- **Commits:** 3 atomic (`93d6c2f`, `aa570cf`, `8178cdf`) + 1 metadata
- **Vitest delta:** 344 → 353 (+9 = 5 Sidebar + 4 AppShellHeader; net +8 vs. the 345 baseline pre-NavBar-deletion)

## Accomplishments

- **SHEL-01 / Persistent collapsible left sidebar** — `Sidebar.tsx` renders the locked IA (Home top-level + Observe + Operate + Configure(empty)), with a chrome collapse-toggle in the sidebar header (testid `sidebar-collapse-toggle`, swaps `PanelLeftClose` / `PanelLeftOpen` icons based on state). Width branches via `[data-sidebar-collapsed='true'] .cmc-sidebar` from 240px → 52px with a 180ms ease-out transition.
- **SHEL-02 / AppShellHeader extracted** — `AppShellHeader.tsx` renders the right-side action area (locked order: time-picker-trigger → save-view-button → cmdk-trigger → density-toggle → theme-toggle) with EmergencyStopBanner in the left region. Brand `Mission Control` moved to the sidebar header.
- **SHEL-03 / Active-route accent bar** — TanStack Router `activeProps` applies the `cmc-sidebar__navlink--active` class which composes a 3px solid `--cmc-accent-blue` `border-left` + tinted `rgba(77, 124, 255, 0.10)` background + brighter `var(--cmc-text)` color. Bar survives the collapse flip because navlinks retain their padding-left layout in collapsed mode (CSS only hides the label span).
- **SHEL-04 / Cmd+B + persisted collapse** — Window-level keydown listener catches `(e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b'` and `preventDefault()`s (blocks browser-bold and macOS native bold-marker insertion). State persists to `localStorage['cmc.sidebar.collapsed']` and reflects on `document.documentElement.dataset.sidebarCollapsed`. `applySidebar()` pre-mounts the attribute in `main.tsx` (alongside `applyDensity()` + `applyTheme()`) — no flash on cold load.
- **DensityProvider wired into shell content tree** — `AppShell.tsx` now nests `<DensityProvider>` under `<ActiveSessionProvider><TaskComposerProvider>` and wraps the `.cmc-shell` div. Density cascade flows into Sidebar + AppShellHeader + main + every Radix Portal descendant (the cascade verification at runtime is Plan 05's Playwright fixture per Plan 02's documented happy-dom limitation).
- **NavBar.tsx + NavBar.test.tsx deleted** — research-recommended Phase 24 deletion; rollback is `git revert aa570cf`. Legacy `.cmc-navbar` / `.cmc-navlink` CSS rules in styles.css left untouched so the revert is clean.
- **Forward-compatible testid placeholders** — `time-picker-trigger` (Phase 26) + `save-view-button` (Phase 25) ship as disabled + display:none buttons in AppShellHeader. Plan 06 registers them in `docs/testid-registry.md`; Phases 25/26 wire them by removing `display: none` and adding `onClick` — zero testid churn at adoption.
- **Visual checkpoint approved** — All 10 verification items confirmed by user (sidebar IA renders, active-route bar in expanded + collapsed, Cmd+B toggles, persistence survives reload, collapsed tooltips appear side=right, density toggle in header re-spaces page without flash).

## Task Commits

Each task was committed atomically:

1. **Task 1: Build lib/sidebar.ts + Sidebar primitives + AppShellHeader** — `93d6c2f` (feat) — 5 files created (Sidebar.tsx 136L, SidebarNavLink.tsx 54L, SidebarSection.tsx 25L, AppShellHeader.tsx 65L, lib/sidebar.ts 41L; +321 insertions)
2. **Task 2: Wire shell rework + delete NavBar** — `aa570cf` (feat) — styles.css (+167L) + AppShell.tsx rewrite + main.tsx applySidebar() + NavBar.tsx + NavBar.test.tsx DELETED + AppShell.test.tsx comment refresh
3. **Task 3: Vitest pin Sidebar + AppShellHeader behaviour** — `8178cdf` (test) — 2 new test files, 9 cases (5 + 4), 353/353 baseline

**Plan metadata:** _(this commit — SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md)_

## Files Created/Modified/Deleted

**Created:**
- `frontend/src/lib/sidebar.ts` — `isSidebarCollapsed()` / `setSidebarCollapsed(boolean)` / `applySidebar()` triad. KEY=`cmc.sidebar.collapsed`. SSR-safe (typeof window guard). Pre-mount `applySidebar()` in main.tsx sets `document.documentElement.dataset.sidebarCollapsed` before React mount.
- `frontend/src/components/shell/Sidebar.tsx` — Persistent left sidebar; brand + chrome collapse-toggle in header; Home (`exact` matching) + 3 sections; window-level Cmd+B/Ctrl+B keydown listener with preventDefault; collapse-toggle button (testid `sidebar-collapse-toggle`).
- `frontend/src/components/shell/SidebarSection.tsx` — Section header + children wrapper. Empty `children` allowed (Configure section renders header only).
- `frontend/src/components/shell/SidebarNavLink.tsx` — TanStack Router Link + Lucide icon + label span; wraps in Radix Tooltip side=right when collapsed; activeProps applies `cmc-sidebar__navlink--active`; testid pattern `sidebar-link-{slug}` (e.g. `sidebar-link-activity`, `sidebar-link-sessions-compare`).
- `frontend/src/components/shell/AppShellHeader.tsx` — Right-region action area (locked DOM order); EmergencyStopBanner in left region; Phase 25/26 hidden placeholders with pre-registered testids.
- `frontend/src/components/shell/__tests__/Sidebar.test.tsx` — 5 specs: brand + Home + section headers render; active-route highlight follows route; `sidebar-collapse-toggle` click persists to localStorage + dataset; Cmd+B / Ctrl+B flip state at window level; remount respects persisted value.
- `frontend/src/components/shell/__tests__/AppShellHeader.test.tsx` — 4 specs: EmergencyStopBanner in left region; right-region children in locked order; Phase 25/26 placeholders are display:none + disabled; DensityToggle trigger opens its menu cleanly inside the header.

**Modified:**
- `frontend/src/components/shell/AppShell.tsx` — replace `<NavBar />` mount with `<Sidebar />` + `.cmc-shell__column` (`<AppShellHeader />` + `<main className="cmc-main">{children}</main>`); wrap content tree in `<DensityProvider>` between `<TaskComposerProvider>` and the `.cmc-shell` div. Existing provider order preserved: ActiveSession > TaskComposer > Density > shell.
- `frontend/src/main.tsx` — `applySidebar()` called after `applyDensity()` + `applyTheme()` before `ReactDOM.createRoot(...).render(...)`. Order is cosmetic (sidebar is independent of theme/density), kept for boot-helper symmetry.
- `frontend/src/styles.css` — append "Shell rework — Phase 24 (SHEL-01..04)" block (+167L). Rules: `.cmc-shell { flex-direction: row }`, `.cmc-shell__column`, redefined `.cmc-main { overflow-y: auto; min-height: 0 }`, `.cmc-app-shell-header` + `__left` + `__right`, full `.cmc-sidebar` ruleset (header, brand, collapse-toggle, section, section-header, navlink, navlink--active, navlink-icon), `[data-sidebar-collapsed='true']` branches for the 240px↔52px flip + section-header hiding + section-divider appearance + navlink label hiding + navlink centering.
- `frontend/src/components/shell/__tests__/AppShell.test.tsx` — comment + test-name refresh to reflect Sidebar mount instead of NavBar.

**Deleted:**
- `frontend/src/components/shell/NavBar.tsx` — research-recommended deletion; rollback path `git revert aa570cf`.
- `frontend/src/components/shell/__tests__/NavBar.test.tsx` — 110 lines removed; vitest count drops from 345 → 344 before the new specs add it back to 353.

## Sidebar IA + Collapsed-Mode Behavior Summary

**Information Architecture (locked as shipped):**

| Region        | Routes                                                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Top-level     | `/` Home (`Home` icon, `exact` route matching)                                                                               |
| **Observe**   | `/activity` (`Activity`), `/sessions/compare` (`GitCompare`), `/skills` (`Sparkles`), `/cost` (`DollarSign`)                 |
| **Operate**   | `/alerts` (`Bell`)                                                                                                           |
| **Configure** | (empty body — header rendered, reserved for future Settings/Doctor)                                                          |

**Expanded mode (240px):**
- Brand `Mission Control` + collapse-toggle in sidebar header.
- Section headers visible (`text-transform: uppercase; letter-spacing: 0.06em; font-family: var(--font-mono)`); empty Configure section still renders its header (placeholder for future content).
- Navlink rows: icon (`var(--cmc-icon-size-lg)`) + label span; full padding (`0 var(--cmc-space-md)`); height `var(--cmc-row-height-list)`; `border-left: 3px solid transparent` reserved for active-route bar.
- Active route: background `rgba(77, 124, 255, 0.10)` + `border-left-color: var(--cmc-accent-blue, #4d7cff)` + text `var(--cmc-text)`.

**Collapsed mode (52px):**
- Sidebar header centers (collapse-toggle only); brand hidden.
- Section headers hidden via `[data-sidebar-collapsed='true'] .cmc-sidebar__section-header { display: none }`.
- Section dividers appear via `[data-sidebar-collapsed='true'] .cmc-sidebar__section + .cmc-sidebar__section { border-top: 1px solid var(--cmc-border) }` — only between adjacent sections (Configure empty section still renders + still gets divider above it).
- Navlink rows: label hidden; icon centers (`justify-content: center`); padding removed.
- Active-route accent bar SURVIVES the collapse (locked invariant) — the 3px `border-left` paints on the 52px-wide navlink in both modes.
- Hover any icon → Radix Tooltip side=`right` shows the route label (label appears outside the sidebar boundary toward main content).
- Mobile / narrow viewport NOT handled (research-locked at v1.3 milestone scope; <768px sidebar overflows).

**Keyboard:**
- `Cmd+B` (macOS) / `Ctrl+B` (Win/Linux) at window scope; preventDefault blocks browser-bold + macOS native bold-marker insertion. Fires even when focus is inside Radix Sheet, textarea, or Cmd+K palette.
- Also accessible via chrome `sidebar-collapse-toggle` button at top-left of sidebar.

## Locked Invariants Honored

- ✅ **Cmd+B** keyboard shortcut (no `Cmd+\\` or `Cmd+Shift+S` — research-locked).
- ✅ Existing `frontend/src/components/ui/Tooltip.tsx` reused — NO new tooltip dep.
- ✅ Density tokens cascade via `:root`; DensityProvider mount (Plan 02) wraps `.cmc-shell` content tree without introducing a React context.
- ✅ Active-route accent bar visible in BOTH expanded AND collapsed modes (research §"Active-route visual treatment").
- ✅ Window-level keydown listener (NOT element-scoped) so Cmd+B works across all focus contexts (research §"Cmd+B keyboard handling" pitfall).
- ✅ Radix Tooltip `side="right"` on collapsed sidebar (research-locked direction).
- ✅ Sidebar IA matches CONTEXT.md exactly — no IA reshuffle during execution.
- ✅ NavBar.tsx deleted, NOT carried as dead code — `git revert` is the rollback contract.
- ✅ Phase 25/26 testid placeholders rendered with `display: none` + `disabled` — adopting phases need only to remove display:none + wire onClick.
- ✅ Mobile / narrow viewport NOT handled in v1.3 (locked).

## Decisions Made

1. **Lucide `PanelLeftClose` / `PanelLeftOpen` icon pair for chrome collapse-toggle** — telegraphs panel-direction intent (matches VS Code's chrome handle convention). Icon swaps based on `collapsed` state (`const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose`). Rejected alternatives: `Menu`/`X` (ambiguous), `ChevronLeft`/`ChevronRight` (less iconic).
2. **`border-left: 3px solid` (not `box-shadow inset`) for active-route accent bar** — box-shadow would visually clip when the navlink row drops to 52px width; `border-left` paints reliably at both widths because the navlink keeps its layout box in collapsed mode (CSS only hides the label span).
3. **Sidebar IA locked as shipped** — Plan-04 IA matches CONTEXT.md exactly. Configure section renders its header with an empty body (reserved for future Settings/Doctor). No CONTEXT deviation during execution.
4. **Window-level keydown listener with `(metaKey || ctrlKey)` cross-platform key check** — preventDefault blocks browser-bold (Win/Linux) + macOS native bold-marker insertion. Element-scoped listener was explicitly rejected (research pitfall: Cmd+B in a textarea would route to the textarea instead of the sidebar).
5. **Brand moved from header → sidebar top** — frees the header for the action-area-only layout. When sidebar collapses, brand hides via `[data-sidebar-collapsed='true'] .cmc-sidebar__brand { display: none }` and only the collapse-toggle chevron remains in the sidebar header.
6. **Forward-compatible testid placeholders** — `time-picker-trigger` (Phase 26) + `save-view-button` (Phase 25) ship as disabled + display:none buttons. Adopting phases remove `display: none` + wire onClick; no testid registration churn at adoption time.
7. **NavBar.tsx + NavBar.test.tsx DELETED** — research-recommended; legacy `.cmc-navbar` / `.cmc-navlink` CSS rules in styles.css left untouched so `git revert aa570cf` is a clean rollback. Plan 06 docs may explicitly flag the dead CSS for cleanup.
8. **`min-width: 0` on `.cmc-shell__column`** — horizontal twin of the `min-height: 0` ladder; prevents a horizontal scrollbar when the sidebar collapses and the column reclaims width. Required for the row-flex layout to behave correctly.

## Deviations from Plan

None — plan executed exactly as written. All 3 code tasks landed on the first attempt:
- Lucide icon names from the plan (`Home`, `Activity`, `GitCompare`, `Sparkles`, `DollarSign`, `Bell`, `PanelLeftClose`, `PanelLeftOpen`) all exist as-named.
- AppShell.tsx import paths did not diverge from the illustrative skeleton.
- EmergencyStopBanner did NOT need any CSS adjustment at its new mount location (the banner's outer wrapper is layout-neutral — no `flex: 1` self-stretch assumption to override).
- 240/52 pixel widths shipped as researched; no adjustment needed.
- Visual checkpoint approved without follow-up fixes.

**Total deviations:** 0.
**Impact on plan:** None — first-pass execution success.

## Issues Encountered

None — clean three-task execution + clean visual checkpoint approval.

## TDD Gate Compliance

Plan 04 is `type: execute` (not `type: tdd`); only Task 3 carried `tdd="true"`. Task 3 was tests-only (no new behavior to RED→GREEN against — behavior was already shipped in Tasks 1+2), so the canonical TDD RED→GREEN sequence does not apply. Task 3 was structured as a test commit that pins existing behavior. All 9 new specs pass against the already-shipped implementation.

No TDD gate warning needed — this is the documented `type: execute` plan flow with a tests-only Task 3.

## User Setup Required

None — no external services, env vars, or runtime configuration. All work is local TSX/CSS/test additions + deletions.

## Known Stubs

The Phase 25/26 testid placeholder buttons in `AppShellHeader.tsx` are INTENTIONAL stubs by plan design:

| Stub                                                    | File                                             | Resolution                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `<button data-testid="time-picker-trigger" disabled style="display:none" />` | `frontend/src/components/shell/AppShellHeader.tsx` | Phase 26 (Global time picker) replaces `display:none` + wires onClick. Pre-registered in Plan 06 testid-registry. |
| `<button data-testid="save-view-button" disabled style="display:none" />`    | `frontend/src/components/shell/AppShellHeader.tsx` | Phase 25 (Saved views) replaces `display:none` + wires onClick. Pre-registered in Plan 06 testid-registry. |

Both are user-invisible (display:none + disabled) and document the future adoption mount point. They are NOT data-rendering stubs (no empty arrays / placeholder text rendered to UI); they are forward-compatibility scaffolding.

## Threat Flags

None — Plan 04 modifies only client-side shell chrome (sidebar collapse state in localStorage, no new network endpoints, no auth path changes, no schema/trust-boundary mutations).

## Hand-off Notes

### For Plan 05 (Playwright sidebar/density/portal-containment specs)

Plan 05's Playwright fixture should pin:

1. **Sidebar collapse persistence (SHEL-04 e2e gate):**
   - Initial load: `localStorage` empty → sidebar expanded (`data-sidebar-collapsed='false'`); sidebar width = 240px.
   - Click `[data-testid='sidebar-collapse-toggle']` → width transitions to 52px; `localStorage['cmc.sidebar.collapsed'] === 'true'`.
   - `page.reload()` → sidebar still collapsed (pre-mount `applySidebar()` set the attribute before first paint; no flash from 240→52).
   - `page.keyboard.press('Meta+B')` (Mac) / `Control+B` (Linux) → flips back to expanded.
2. **Active-route highlight survives collapse (SHEL-03 e2e gate):**
   - Navigate to `/activity` → `[data-testid='sidebar-link-activity']` has class `cmc-sidebar__navlink--active`; left border-color resolves to `var(--cmc-accent-blue)`.
   - Collapse sidebar → same element still has the class + the border-color still resolves on the now-52px-wide row.
3. **Collapsed tooltip side=right (SHEL-04 e2e gate):**
   - Collapse sidebar → hover `[data-testid='sidebar-link-skills']` → Radix Tooltip portal renders with computed bounding rect `left > sidebar.right` (tooltip is outside the 52px sidebar boundary toward main content).
4. **Density cascade through Sidebar + AppShellHeader (DENS-02 e2e gate):**
   - This is Plan 05's primary DENS-02 deliverable (deferred from Plan 02's happy-dom limitation). Cycle Compact/Comfortable/Cozy via `[data-testid='density-toggle-trigger']` → assert computed style of `.cmc-sidebar__navlink` (height = `var(--cmc-row-height-list)`) AND a Radix Portal descendant (open Cmd+K then assert its dropdown padding) both reflect the new density tier.
5. **Portal-containment after shell rework (CONT-02 e2e gate):**
   - Open any Sheet from a route mounted under the new shell — assert Sheet portal renders inside viewport bounds and z-index resolves above `--cmc-z-sidebar=20` + `--cmc-z-header=20`.

**Testids ready for use:** `sidebar-link-home`, `sidebar-link-activity`, `sidebar-link-sessions-compare`, `sidebar-link-skills`, `sidebar-link-cost`, `sidebar-link-alerts`, `sidebar-collapse-toggle`, `time-picker-trigger` (disabled), `save-view-button` (disabled), `cmdk-trigger`, `density-toggle-trigger` (Plan 02), `theme-toggle` (existing).

### For Plan 06 (testid-registry + ESLint rule + docs)

`docs/testid-registry.md` must register the following testids minted in Plan 04:

| testid                          | Source                | Status            | Notes                                                                                   |
| ------------------------------- | --------------------- | ----------------- | --------------------------------------------------------------------------------------- |
| `sidebar-link-home`             | Sidebar.tsx           | Active            | TanStack Link to `/` (exact match)                                                      |
| `sidebar-link-activity`         | Sidebar.tsx           | Active            | TanStack Link to `/activity`                                                            |
| `sidebar-link-sessions-compare` | Sidebar.tsx           | Active            | TanStack Link to `/sessions/compare`                                                    |
| `sidebar-link-skills`           | Sidebar.tsx           | Active            | TanStack Link to `/skills`                                                              |
| `sidebar-link-cost`             | Sidebar.tsx           | Active            | TanStack Link to `/cost`                                                                |
| `sidebar-link-alerts`           | Sidebar.tsx           | Active            | TanStack Link to `/alerts`                                                              |
| `sidebar-collapse-toggle`       | Sidebar.tsx           | Active            | Chrome handle button; PanelLeftClose ↔ PanelLeftOpen                                    |
| `cmdk-trigger`                  | AppShellHeader.tsx    | Active            | Cmd+K trigger button in header right region                                             |
| `time-picker-trigger`           | AppShellHeader.tsx    | **Placeholder**   | display:none + disabled; Phase 26 removes display:none + wires onClick (TIME-01..05)    |
| `save-view-button`              | AppShellHeader.tsx    | **Placeholder**   | display:none + disabled; Phase 25 removes display:none + wires onClick (VIEW-04)        |

The "Placeholder" status column in the registry is the documented promise that Phases 25/26 will not need to register these testids when they adopt — they only flip `display: none` off and wire `onClick`. Recommend the ESLint `testid-registry-only` rule (Plan 06) include `Placeholder` as a valid status alongside `Active`.

The slug pattern for sidebar links is `sidebar-link-<route-slug>` where `<route-slug>` is the route path with leading `/` stripped and non-word characters replaced with `-` (e.g. `/sessions/compare` → `sessions-compare`). Registry should document this pattern so future sidebar nav additions don't need ad-hoc registration.

## Next Phase Readiness

**Wave 4 (Plans 05 + 06) is unblocked.** All Wave 4 dependencies from Plan 04 are in place:

- AppShellHeader exists with all 5 right-region testids (Plan 05 Playwright can target them; Plan 06 testid-registry can register them).
- Sidebar exists with all 6 nav-link testids + collapse-toggle testid.
- DensityProvider wraps the full shell content tree (Plan 05 Playwright cascade test can finally pin DENS-02 through Portal descendants — the deferred Plan 02 limitation).
- `data-sidebar-collapsed` html attribute is the cross-cutting signal Plan 05 can probe via `page.evaluate(() => document.documentElement.dataset.sidebarCollapsed)`.

**Phase 24 status:** 4/7 plans complete (Plans 01, 02, 03, 04). Wave 4 spawns next from orchestrator. Plans 05 (Playwright + Lighthouse + URL-contract pytest) and 06 (POLI docs + ESLint flat config) can run in parallel — they touch disjoint file surfaces.

**Plan 07 (Phase close gate):** Depends on Plans 05 + 06 landing; writes `24-VISUAL-CHECK.md` verdict against the full quality-gate matrix (visual + axe + Lighthouse + perf + URL contract).

## Self-Check

**Files claimed created:**
- `frontend/src/lib/sidebar.ts` — FOUND
- `frontend/src/components/shell/Sidebar.tsx` — FOUND
- `frontend/src/components/shell/SidebarSection.tsx` — FOUND
- `frontend/src/components/shell/SidebarNavLink.tsx` — FOUND
- `frontend/src/components/shell/AppShellHeader.tsx` — FOUND
- `frontend/src/components/shell/__tests__/Sidebar.test.tsx` — FOUND
- `frontend/src/components/shell/__tests__/AppShellHeader.test.tsx` — FOUND

**Files claimed deleted:**
- `frontend/src/components/shell/NavBar.tsx` — ABSENT (verified)
- `frontend/src/components/shell/__tests__/NavBar.test.tsx` — ABSENT (verified)

**Commits claimed:**
- `93d6c2f` — FOUND (Task 1, feat: sidebar primitives + AppShellHeader)
- `aa570cf` — FOUND (Task 2, feat: wire shell rework + delete NavBar)
- `8178cdf` — FOUND (Task 3, test: vitest pin Sidebar + AppShellHeader)

**Verify gates (from plan):** tsc clean (exit 0); 353/353 vitest baseline; NavBar.tsx absent from tree; visual checkpoint approved by user (10/10 items confirmed).

## Self-Check: PASSED

---
*Phase: 24-shell-density-containment-primitives*
*Plan: 04*
*Completed: 2026-05-10*
