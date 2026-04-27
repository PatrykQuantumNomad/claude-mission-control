import { ReactNode } from 'react'
import { NavBar } from './NavBar'
import { CommandPalette } from '../ui/CommandPalette'
import { TaskComposerProvider } from '../panels/TaskComposer'

interface AppShellProps {
  children: ReactNode
}

/**
 * Pure-presentational top-level layout. Mounts <NavBar> + <CommandPalette>
 * (global Cmd+K binding — RESEARCH §Anti-Patterns "Conditional Cmd+K binding
 * inside route components — bind once globally in <AppShell> so the palette
 * opens regardless of which route is active") + a semantic <main> wrapping
 * the page body. NOT responsible for QueryClientProvider / ErrorBoundary —
 * those mount one level up at the route-tree root in routes/__root.tsx so
 * AppShell stays trivially unit-testable.
 *
 * CommandPalette is mounted as a sibling of <main> (not inside it) so cmdk's
 * dialog portals to document.body without interfering with the page body.
 *
 * Phase 7 Plan 03: TaskComposerProvider wraps the entire shell so any
 * descendant (CommandPalette → 'Quick task') can call useTaskComposer().
 * setOpen(true) and the composer Sheet appears regardless of which route
 * is active. The Sheet itself is mounted by TaskComposerProvider as a
 * sibling of children — Radix portals it to document.body.
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <TaskComposerProvider>
      <div className="cmc-shell">
        <NavBar />
        <CommandPalette />
        <main className="cmc-main">{children}</main>
      </div>
    </TaskComposerProvider>
  )
}
