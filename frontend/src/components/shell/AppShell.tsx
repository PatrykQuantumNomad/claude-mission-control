import { ReactNode } from 'react'
import { CommandPalette } from '../ui/CommandPalette'
import { TaskComposerProvider } from '../panels/TaskComposer'
import { ActiveSessionProvider } from './ActiveSessionContext'
import { Sidebar } from './Sidebar'
import { AppShellHeader } from './AppShellHeader'
import { DensityProvider } from './DensityProvider'
import { LoadedViewProvider } from '../savedviews/LoadedViewContext'

interface AppShellProps {
  children: ReactNode
}

/**
 * Pure-presentational top-level layout. Phase 24 Plan 04 (SHEL-01..04):
 * the legacy top NavBar has been REPLACED by a persistent left Sidebar +
 * an extracted AppShellHeader. The shell flips from `flex-direction: column`
 * (header on top, main below) to `flex-direction: row` (sidebar on left,
 * `cmc-shell__column` containing header+main on the right).
 *
 * NOT responsible for QueryClientProvider / ErrorBoundary — those mount one
 * level up at the route-tree root in routes/__root.tsx so AppShell stays
 * trivially unit-testable.
 *
 * CommandPalette is mounted as a sibling of <main> (not inside it) so cmdk's
 * dialog portals to document.body without interfering with the page body.
 *
 * Provider stack (outer → inner):
 *   - ActiveSessionProvider (CMPR-07): tracks "is a session detail Sheet
 *     open?" so CommandPalette can gate the "Compare with previous session"
 *     action. MUST sit ABOVE both <CommandPalette> and <main> so the palette
 *     and the panels share the same context instance.
 *   - TaskComposerProvider (TPNL-02): exposes setOpen(true) so CommandPalette
 *     ('Quick task') can open the composer Sheet from any route. The Sheet
 *     itself is portaled by the Provider as a sibling of children.
 *   - DensityProvider (DENS-03): re-applies persisted density on mount so HMR
 *     doesn't reset `<html data-density>` mid-session. NOT a React context —
 *     density is consumed via CSS variables on :root, not via subscribe.
 *   - LoadedViewProvider (Phase 25 Plan 06 — VIEW-04/05/08): the
 *     currently-loaded saved view. Mounts ABOVE the entire shell so
 *     AppShellHeader (SavedViewMenu + UnsavedPip), Sidebar (Plan 09
 *     pinned-section highlighting), CommandPalette (Plan 08 saved-view
 *     items), and EditOrForkDialog (Plan 07) all observe the same loaded
 *     slot. Plan 10 will mount DefaultViewLoader + RecentStateTracker as
 *     additional children inside this same provider.
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <ActiveSessionProvider>
      <TaskComposerProvider>
        <DensityProvider>
          <LoadedViewProvider>
            <div className="cmc-shell">
              <Sidebar />
              <div className="cmc-shell__column">
                <AppShellHeader />
                <main className="cmc-main">{children}</main>
              </div>
              <CommandPalette />
            </div>
          </LoadedViewProvider>
        </DensityProvider>
      </TaskComposerProvider>
    </ActiveSessionProvider>
  )
}
