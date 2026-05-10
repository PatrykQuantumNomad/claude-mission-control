// AppShellHeader — Phase 24 Plan 04 (SHEL-02).
//
// Top-bar action area extracted from the deleted NavBar. The brand moves to
// the Sidebar (left edge); the header keeps the right-side action area only.
//
// Order (left to right):
//   1. EmergencyStopBanner (leftmost — high-priority safety control).
//   2. <button data-testid="time-picker-trigger"> placeholder for Phase 26.
//   3. <button data-testid="save-view-button"> placeholder for Phase 25.
//   4. Cmd+K trigger (existing palette open button).
//   5. <DensityToggle /> (Phase 24 Plan 02 — Sliders icon, Radix DropdownMenu).
//   6. <ThemeToggle /> (existing dark/light flip).
//
// The placeholders are rendered with `style={{ display: 'none' }}` so the
// testids are pre-registered in the DOM (and in docs/testid-registry.md once
// Plan 06 lands) without affecting layout. Phases 25/26 wire them by
// removing the display:none rule and supplying onClick.
//
// CommandPalette already binds Cmd+K globally at AppShell level via its own
// window keydown listener — the trigger button is purely a discoverability
// affordance. We do NOT wire onClick here because a parent prop hand-off
// would couple AppShellHeader to the palette's open-state mechanics; the
// label itself ("Cmd+K") teaches the keyboard shortcut.

import { EmergencyStopBanner } from './EmergencyStopBanner'
import { ThemeToggle } from './ThemeToggle'
import { DensityToggle } from './DensityToggle'

export function AppShellHeader() {
  return (
    <header className="cmc-app-shell-header" role="banner">
      <div className="cmc-app-shell-header__left">
        <EmergencyStopBanner />
      </div>
      <div className="cmc-app-shell-header__right">
        {/* Phase 26 placeholder — pre-registered testid, hidden until wired. */}
        <button
          type="button"
          data-testid="time-picker-trigger"
          disabled
          aria-label="Time range (coming in Phase 26)"
          style={{ display: 'none' }}
        />
        {/* Phase 25 placeholder — pre-registered testid, hidden until wired. */}
        <button
          type="button"
          data-testid="save-view-button"
          disabled
          aria-label="Save view (coming in Phase 25)"
          style={{ display: 'none' }}
        />
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
