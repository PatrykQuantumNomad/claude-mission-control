// AppShellHeader — Phase 24 Plan 04 (SHEL-02) + Phase 25 Plan 06 (VIEW-04/05/08) +
// Phase 26 Plan 03 (TIME-01/TIME-03).
//
// Top-bar action area extracted from the deleted NavBar. The brand moves to
// the Sidebar (left edge); the header keeps the right-side action area only.
//
// Order (left to right):
//   1. EmergencyStopBanner (leftmost — high-priority safety control).
//   2. <TimePicker /> (Phase 26 Plan 03 — Radix Popover.Trigger replacing
//      the Phase 24 hidden placeholder; binds Cmd+Shift+C/V window-level
//      hotkeys for clipboard copy-paste via TIME-03).
//   3. <RefreshDropdown /> (Phase 26 Plan 03 — adjacent dropdown for the
//      auto-refresh interval; pulses while active, shows "Paused" when the
//      URL window is absolute/brush-zoom-committed).
//   4. SavedView chrome — `saved-view-chrome` wrapper hosting `SavedViewMenu`
//      (Radix DropdownMenu of saved views for the current route) and
//      `UnsavedPip` (visible when URL state diverges from the loaded view).
//      Replaces the inert `save-view-button` placeholder that lived here
//      through Phase 24. The placeholder's registry entry stays for audit
//      traceability (marked 'Removed in Phase 25 Plan 06').
//   5. Cmd+K trigger (existing palette open button).
//   6. <DensityToggle /> (Phase 24 Plan 02 — Sliders icon, Radix DropdownMenu).
//   7. <ThemeToggle /> (existing dark/light flip).
//
// CommandPalette already binds Cmd+K globally at AppShell level via its own
// window keydown listener — the trigger button is purely a discoverability
// affordance. We do NOT wire onClick here because a parent prop hand-off
// would couple AppShellHeader to the palette's open-state mechanics; the
// label itself ("Cmd+K") teaches the keyboard shortcut.
//
// LoadedViewContext requirement: SavedViewMenu + UnsavedPip both call
// useLoadedView(). The provider mounts ABOVE this header at the AppShell
// level so Sidebar + future Plan 07 EditOrForkDialog + Plan 09 Sidebar
// Pinned section all observe the same loaded-view slot.

import { EmergencyStopBanner } from './EmergencyStopBanner'
import { ThemeToggle } from './ThemeToggle'
import { DensityToggle } from './DensityToggle'
import { SavedViewMenu } from '../savedviews/SavedViewMenu'
import { UnsavedPip } from '../savedviews/UnsavedPip'
import { TimePicker } from '../time/TimePicker'
import { RefreshDropdown } from '../time/RefreshDropdown'

export function AppShellHeader() {
  return (
    <header className="cmc-app-shell-header" role="banner">
      <div className="cmc-app-shell-header__left">
        <EmergencyStopBanner />
      </div>
      <div className="cmc-app-shell-header__right">
        <TimePicker />
        <RefreshDropdown />
        <div
          className="cmc-shell__header-savedview"
          data-testid="saved-view-chrome"
        >
          <SavedViewMenu />
          <UnsavedPip />
        </div>
        <button
          type="button"
          className="cmc-cmdk-trigger cmc-label"
          aria-label="Open command palette (Cmd+K)"
          data-testid="cmdk-trigger"
        >
          <span aria-hidden>Cmd+K</span>
        </button>
        <DensityToggle />
        <ThemeToggle />
      </div>
    </header>
  )
}
