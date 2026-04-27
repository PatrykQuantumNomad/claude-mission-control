import { ReactNode } from 'react'
import { NavBar } from './NavBar'
import { CommandPalette } from '../ui/CommandPalette'

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
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <div className="cmc-shell">
      <NavBar />
      <CommandPalette />
      <main className="cmc-main">{children}</main>
    </div>
  )
}
