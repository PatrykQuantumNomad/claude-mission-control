import { ReactNode } from 'react'
import { NavBar } from './NavBar'
import { CommandPalette } from '../ui/CommandPalette'
import { TaskComposerProvider } from '../panels/TaskComposer'
import { ActiveSessionProvider } from './ActiveSessionContext'

interface AppShellProps {
  children: ReactNode
}

/**
 * Pure-presentational top-level layout. Mounts <NavBar> + <CommandPalette>
 * (global Cmd+K binding — design notes * inside route components — bind once globally in <AppShell> so the palette
 * opens regardless of which route is active") + a semantic <main> wrapping
 * the page body. NOT responsible for QueryClientProvider / ErrorBoundary —
 * those mount one level up at the route-tree root in routes/__root.tsx so
 * AppShell stays trivially unit-testable.
 *
 * CommandPalette is mounted as a sibling of <main> (not inside it) so cmdk's
 * dialog portals to document.body without interfering with the page body.
 *
 * current: TaskComposerProvider wraps the entire shell so any
 * descendant (CommandPalette → 'Quick task') can call useTaskComposer().
 * setOpen(true) and the composer Sheet appears regardless of which route
 * is active. The Sheet itself is mounted by TaskComposerProvider as a
 * sibling of children — Radix portals it to document.body.
 *
 * Phase 23 Plan 02 (CMPR-07): ActiveSessionProvider wraps the entire shell
 * so the CommandPalette can read the current "session detail Sheet open?"
 * state to gate the "Compare with previous session" action. Each session-
 * detail Sheet owner (LiveSessionsCard, SkillRunsTable) opts in by
 * calling useActiveSession().setActiveSessionId(sid) on Sheet open and
 * setActiveSessionId(null) on Sheet close. The provider MUST sit ABOVE
 * both <CommandPalette> and <main> so the palette and the panels share
 * the same context instance.
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <ActiveSessionProvider>
      <TaskComposerProvider>
        <div className="cmc-shell">
          <NavBar />
          <CommandPalette />
          <main className="cmc-main">{children}</main>
        </div>
      </TaskComposerProvider>
    </ActiveSessionProvider>
  )
}
